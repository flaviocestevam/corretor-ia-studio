// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "scene-assets";

const VEO_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning";

const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isQuotaError(status: number, msg: string) {
  return (
    status === 429 ||
    /quota|exhaust|exceed|rate limit/i.test(msg || "")
  );
}

async function callVeoStart(apiKey: string, prompt: string, imageUrl?: string | null) {
  const instance: any = { prompt };
  if (imageUrl) {
    instance.image = { imageUri: imageUrl };
  }
  const res = await fetch(VEO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({ instances: [instance] }),
  });
  const text = await res.text();
  if (!res.ok) {
    const err: any = new Error(`Veo start ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text);
}

async function pollOperation(apiKey: string, opName: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${opName}`;
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(url, { headers: { "x-goog-api-key": apiKey } });
    const text = await res.text();
    if (!res.ok) {
      const err: any = new Error(`Operation poll ${res.status}: ${text}`);
      err.status = res.status;
      throw err;
    }
    const op = JSON.parse(text);
    if (op.done) {
      if (op.error) {
        const err: any = new Error(`Operation error: ${JSON.stringify(op.error)}`);
        err.status = op.error.code ?? 500;
        throw err;
      }
      return op;
    }
  }
  throw new Error("Timeout waiting for video generation");
}

function extractVideoUri(op: any): string | null {
  const preds =
    op?.response?.predictions ||
    op?.response?.generateVideoResponse?.generatedSamples ||
    [];
  for (const p of preds) {
    const uri =
      p?.video?.uri ||
      p?.videoUri ||
      p?.video?.videoUri ||
      p?.uri ||
      p?.gcsUri;
    if (uri) return uri;
  }
  return null;
}

async function downloadVideo(apiKey: string, uri: string): Promise<Uint8Array> {
  const url = uri.includes("?") ? `${uri}&alt=media` : `${uri}?alt=media`;
  const res = await fetch(url, { headers: { "x-goog-api-key": apiKey } });
  if (!res.ok) {
    throw new Error(`Download failed ${res.status}: ${await res.text()}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // 1. Pick next job
    const { data: jobs, error: jobErr } = await supabase
      .from("video_jobs")
      .select("*")
      .eq("status", "pronto_para_gerar")
      .order("created_at", { ascending: true })
      .limit(1);
    if (jobErr) throw jobErr;
    const job = jobs?.[0];
    if (!job) {
      return new Response(JSON.stringify({ ok: true, message: "no job" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Mark em_geracao
    await supabase
      .from("video_jobs")
      .update({ status: "em_geracao" })
      .eq("id", job.id);

    const attempts = (job.attempts ?? 0) + 1;

    // Helper to fail
    async function failJob(msg: string) {
      const nextStatus = attempts >= 3 ? "erro" : "pronto_para_gerar";
      await supabase
        .from("video_jobs")
        .update({ status: nextStatus, attempts })
        .eq("id", job.id);
      return new Response(
        JSON.stringify({ ok: false, error: msg, jobId: job.id }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Try google accounts, skipping quota-exhausted ones
    const triedAccountIds: string[] = [];
    while (true) {
      const { data: accounts, error: accErr } = await supabase
        .from("google_accounts")
        .select("*")
        .eq("status", "ativa")
        .not("id", "in", `(${triedAccountIds.length ? triedAccountIds.map((i) => `"${i}"`).join(",") : '""'})`)
        .order("last_used_at", { ascending: true, nullsFirst: true })
        .limit(1);
      if (accErr) throw accErr;
      const account = accounts?.[0];
      if (!account) {
        return await failJob("No active google account available");
      }
      triedAccountIds.push(account.id);

      try {
        const startOp = await callVeoStart(
          account.api_key,
          job.prompt,
          job.character_image,
        );
        const op = await pollOperation(account.api_key, startOp.name);
        const videoUri = extractVideoUri(op);
        if (!videoUri) throw new Error("No video URI in operation response");

        const bytes = await downloadVideo(account.api_key, videoUri);
        const fileName = `${job.project_id ?? "noproj"}-${job.id}-${job.flow_model ?? "fast"}-v${attempts}.mp4`;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(fileName, bytes, {
            contentType: "video/mp4",
            upsert: true,
          });
        if (upErr) throw upErr;

        await supabase
          .from("video_jobs")
          .update({
            status: "gerado",
            video_url: fileName,
            google_account: account.email,
            file_name: fileName,
            attempts,
          })
          .eq("id", job.id);

        await supabase
          .from("google_accounts")
          .update({
            credits_used: (account.credits_used ?? 0) + 1,
            last_used_at: new Date().toISOString(),
          })
          .eq("id", account.id);

        return new Response(
          JSON.stringify({ ok: true, jobId: job.id, file: fileName }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (e: any) {
        const status = e?.status ?? 0;
        const msg = String(e?.message ?? e);
        console.error("Job attempt error", { jobId: job.id, account: account.email, status, msg });
        if (isQuotaError(status, msg)) {
          await supabase
            .from("google_accounts")
            .update({ status: "esgotada" })
            .eq("id", account.id);
          // try next account
          continue;
        }
        return await failJob(msg);
      }
    }
  } catch (e: any) {
    console.error("process-video-job fatal", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
