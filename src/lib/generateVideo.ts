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

    // Append key for direct playback if URI requires it
    const finalUrl = videoUri.includes("key=") ? videoUri : `${videoUri}${videoUri.includes("?") ? "&" : "?"}key=${apiKey}`;

    await supabase
      .from("scenes")
      .update({
        generated_video_url: finalUrl,
        video_status: "gerado",
        video_generated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);

    return { success: true, videoUrl: finalUrl };
  } catch (err: any) {
    const errorMsg = err?.message || "Erro desconhecido";

    if (errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("429")) {
      await markKeyAsExhausted(apiKey);
      return generateSceneVideo({ sceneId, videoPrompt, startImageUrl });
    }

    await supabase.from("scenes").update({ video_status: "erro", video_error: errorMsg }).eq("id", sceneId);
    return { success: false, error: errorMsg };
  }
}
