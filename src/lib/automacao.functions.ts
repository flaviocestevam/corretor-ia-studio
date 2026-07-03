import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type GoogleAccount = {
  id: string;
  email: string;
  status: "ativa" | "esgotada";
  credits_used: number;
  last_used_at: string | null;
  reset_at: string | null;
  created_at: string;
};

export type ProductionMetrics = {
  waiting: number;
  generating: number;
  completedToday: number;
  errored: number;
  totalThisMonth: number;
};

export const listGoogleAccounts = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("google_accounts")
    .select("id, email, status, credits_used, last_used_at, reset_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GoogleAccount[];
});

const createAccountSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  api_key: z.string().trim().min(1, "API key é obrigatória"),
});

export const createGoogleAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createAccountSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("google_accounts").insert({
      email: data.email,
      api_key: data.api_key,
      status: "ativa",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const idSchema = z.object({ id: z.string().uuid() });

export const markAccountActive = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("google_accounts")
      .update({ status: "ativa", credits_used: 0 })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAccountExhausted = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("google_accounts")
      .update({ status: "esgotada" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getProductionMetrics = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const countBy = async (filter: (q: any) => any) => {
    const { count, error } = await filter(
      supabaseAdmin.from("video_jobs").select("id", { count: "exact", head: true }),
    );
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const [waiting, generating, completedToday, errored, totalThisMonth] = await Promise.all([
    countBy((q) => q.eq("status", "pronto_para_gerar")),
    countBy((q) => q.eq("status", "em_geracao")),
    countBy((q) => q.eq("status", "gerado").gte("created_at", startOfDay)),
    countBy((q) => q.eq("status", "erro")),
    countBy((q) => q.eq("status", "gerado").gte("created_at", startOfMonth)),
  ]);

  return { waiting, generating, completedToday, errored, totalThisMonth } as ProductionMetrics;
});
