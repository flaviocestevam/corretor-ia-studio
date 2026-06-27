import { GoogleGenAI } from "@google/genai";
import { supabase } from "@/integrations/supabase/client";
import { getActiveApiKey, markKeyAsExhausted, buildKeysDiagnostic } from "./googleApiKeyRotator";

interface GenerateVideoParams {
  sceneId: string;
  videoPrompt: string;
  startImageUrl: string;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.length))),
    );
  }
  return btoa(binary);
}

export async function generateSceneVideo({
  sceneId,
  videoPrompt,
  startImageUrl,
}: GenerateVideoParams): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  await supabase
    .from("scenes")
    .update({ video_status: "gerando", video_error: null })
    .eq("id", sceneId);

  // Loop iterativo para rotacionar keys em caso de 429 (evita recursão sem limite).
  const MAX_ATTEMPTS = 5;
  let lastError = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const apiKey = await getActiveApiKey();
    if (!apiKey) {
      const diag = await buildKeysDiagnostic();
      const msg = `Nenhuma key ativa. ${diag}`;
      await supabase.from("scenes").update({ video_status: "erro", video_error: msg }).eq("id", sceneId);
      return { success: false, error: msg };
    }

    try {
      const client = new GoogleGenAI({ apiKey });

      const imageResponse = await fetch(startImageUrl);
      const imageBlob = await imageResponse.blob();
      const mimeType = imageBlob.type || "image/jpeg";
      const imageBase64 = await blobToBase64(imageBlob);

      let operation = await client.models.generateVideos({
        model: "veo-3.1-fast-generate-preview",
        prompt: videoPrompt,
        image: { imageBytes: imageBase64, mimeType },
        config: { aspectRatio: "9:16", durationSeconds: 8 },
      });

      const timeout = Date.now() + 5 * 60 * 1000;
      while (!operation.done) {
        if (Date.now() > timeout) throw new Error("Timeout na geração do vídeo.");
        await new Promise((r) => setTimeout(r, 10000));
        operation = await client.operations.getVideosOperation({ operation });
      }

      const videoUri =
        (operation as any).response?.generatedVideos?.[0]?.video?.uri ||
        (operation as any).response?.generatedVideos?.[0]?.video?.videoUri;
      if (!videoUri) throw new Error("Vídeo não gerado corretamente.");

      // Baixa o vídeo autenticado e sobe pro storage — nunca persiste a API key na URL.
      const videoRes = await fetch(videoUri, { headers: { "x-goog-api-key": apiKey } });
      if (!videoRes.ok) throw new Error(`Falha ao baixar vídeo: ${videoRes.status}`);
      const videoBlob = await videoRes.blob();
      const path = `videos/${sceneId}-${Date.now()}.mp4`;
      const { error: upErr } = await supabase.storage
        .from("scene-assets")
        .upload(path, videoBlob, { contentType: "video/mp4", upsert: true });
      if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);

      await supabase
        .from("scenes")
        .update({
          generated_video_url: path,
          video_status: "gerado",
          video_generated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);

      return { success: true, videoUrl: path };
    } catch (err: any) {
      lastError = err?.message || "Erro desconhecido";

      if (lastError.includes("RESOURCE_EXHAUSTED") || lastError.includes("429")) {
        await markKeyAsExhausted(apiKey, lastError);
        continue; // tenta próxima key
      }

      await supabase.from("scenes").update({ video_status: "erro", video_error: lastError }).eq("id", sceneId);
      return { success: false, error: lastError };
    }
  }

  const msg = `Todas as keys esgotaram a cota. Último erro: ${lastError}`;
  await supabase.from("scenes").update({ video_status: "erro", video_error: msg }).eq("id", sceneId);
  return { success: false, error: msg };
}

