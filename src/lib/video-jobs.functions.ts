import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const FLOW_VALUES = ["lite", "fast", "quality"] as const;
const STATUS_VALUES = [
  "rascunho",
  "pronto_para_gerar",
  "em_geracao",
  "gerado",
  "erro",
  "aprovado",
  "entregue",
] as const;

export type VideoJob = {
  id: string;
  prompt: string;
  google_account: string | null;
  attempts: number;
  status: (typeof STATUS_VALUES)[number];
  flow_model: (typeof FLOW_VALUES)[number];
  video_url: string | null;
  character_image: string | null;
  created_at: string;
};

export const listVideoJobs = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("video_jobs")
    .select("id, prompt, google_account, attempts, status, flow_model, video_url, character_image, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as VideoJob[];
});

const createSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt é obrigatório"),
  character_image: z.string().trim().optional().nullable(),
  flow_model: z.enum(FLOW_VALUES).default("fast"),
});

export const createVideoJob = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("video_jobs").insert({
      prompt: data.prompt,
      character_image: data.character_image || null,
      flow_model: data.flow_model,
      status: "pronto_para_gerar",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const idSchema = z.object({ id: z.string().uuid() });

export const reprocessVideoJob = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("video_jobs")
      .update({ status: "pronto_para_gerar", attempts: 0 })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const approveVideoJob = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("video_jobs")
      .update({ status: "aprovado" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
