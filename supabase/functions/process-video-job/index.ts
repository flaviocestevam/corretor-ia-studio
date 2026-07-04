import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

async function generateVideoWithModel(job: any, apiKey: string, model: string) {
  const payload = {
    instances: [{
      prompt: job.prompt,
    }],
  };

  const generateRes = await fetch(
    `${GEMINI_BASE}/models/${model}:predictLongRunning?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!generateRes.ok) {
    const errText = await generateRes.text();
    throw new Error(`Generate failed ${generateRes.status}: ${errText}`);
  }

  const operation = await generateRes.json();
  const operationName = operation.name;

  for (let i = 0; i < 72; i++) {
    await new Promise((r) => setTimeout(r, 10000));

    const statusRes = await fetch(`${GEMINI_BASE}/${operationName}?key=${apiKey}`);
    const status = await statusRes.json();

    if (status.done) {
      if (status.error) throw new Error(`Operation error: ${JSON.stringify(status.error)}`);

      const videoUri =
        status.response?.generatedVideos?.[0]?.uri ||
        status.response?.generatedVideos?.[0]?.video?.uri ||
        status.metadata?.videoUri;
      if (!videoUri) throw new Error("No video URI found");

      const downloadUrl = videoUri.includes("?")
        ? `${videoUri}&key=${apiKey}&alt=media`
        : `${videoUri}?key=${apiKey}&alt=media`;
      const downloadRes = await fetch(downloadUrl);
      if (!downloadRes.ok) throw new Error(`Download failed ${downloadRes.status}`);

      const videoBlob = await downloadRes.blob();

      const fileName = `videos/${job.id}.mp4`;
      const { error: uploadError } = await supabase.storage
        .from("scene-assets")
        .upload(fileName, videoBlob, { contentType: "video/mp4", upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);

      return { videoUrl: urlData.publicUrl, fileName };
    }
  }

  throw new Error("Timeout na geração do vídeo");
}

async function generateVideoWithVeo3(job: any, apiKey: string) {
  try {
    return await generateVideoWithModel(job, apiKey, "veo-3.1-generate-preview");
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes("429") || msg.includes("quota") || msg.includes("rate")) {
      throw e;
    }
    console.warn("veo-3.1-generate-preview falhou, tentando fallback veo-3.0-generate-001:", msg);
    return await generateVideoWithModel(job, apiKey, "veo-3.0-generate-001");
  }
}

serve(async (_req) => {
  try {
    const { data: jobs } = await supabase
      .from("video_jobs")
      .select("*")
      .eq("status", "pronto_para_gerar")
      .order("created_at", { ascending: true })
      .limit(1);

    if (!jobs?.length) return new Response("No jobs", { status: 200 });

    const job = jobs[0];

    await supabase.from("video_jobs").update({
      status: "em_geracao",
      attempts: (job.attempts || 0) + 1,
    }).eq("id", job.id);

    const { data: accounts } = await supabase
      .from("google_accounts")
      .select("*")
      .eq("status", "ativa")
      .order("last_used_at");

    if (!accounts?.length) throw new Error("Nenhuma conta Google ativa");

    let lastError: string | null = null;
    for (const acc of accounts) {
      try {
        const result = await generateVideoWithVeo3(job, acc.api_key);

        await supabase.from("google_accounts").update({
          last_used_at: new Date().toISOString(),
          credits_used: (acc.credits_used || 0) + 1,
        }).eq("id", acc.id);

        await supabase.from("video_jobs").update({
          status: "gerado",
          video_url: result.videoUrl,
          file_name: result.fileName,
          google_account: acc.email,
        }).eq("id", job.id);

        return new Response("Video gerado com sucesso", { status: 200 });
      } catch (e: any) {
        lastError = e.message;
        console.error(`Erro na conta ${acc.email}:`, e);
        if (e.message.includes("429") || e.message.includes("quota") || e.message.includes("rate")) {
          await supabase.from("google_accounts").update({ status: "esgotada" }).eq("id", acc.id);
        }
      }
    }

    await supabase.from("video_jobs").update({
      status: "erro",
      error_screenshot: lastError,
    }).eq("id", job.id);

    return new Response("Falhou após tentar todas contas", { status: 500 });
  } catch (error: any) {
    console.error("Erro geral:", error);
    return new Response(error.message, { status: 500 });
  }
});
