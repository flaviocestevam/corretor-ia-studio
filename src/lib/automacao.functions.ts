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
