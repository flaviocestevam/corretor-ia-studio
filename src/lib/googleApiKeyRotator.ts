import { supabase } from "@/integrations/supabase/client";

export async function buildKeysDiagnostic(): Promise<string> {
  const { data, error } = await supabase
    .from("google_api_keys")
    .select("label, is_active, is_exhausted")
    .order("created_at", { ascending: true });
  if (error) return `Erro ao ler tabela google_api_keys: ${error.message}`;
  const rows = data ?? [];
  if (rows.length === 0) return "Keys no banco: 0.";
  const parts = rows.map(
    (k, i) =>
      `Key ${i + 1} (${k.label}): is_active=${k.is_active}, is_exhausted=${k.is_exhausted}`,
  );
  return `Keys no banco: ${rows.length}. ${parts.join(". ")}.`;
}

export async function getActiveApiKey(): Promise<string | null> {
  const { data } = await supabase
    .from("google_api_keys")
    .select("api_key")
    .eq("is_active", true)
    .eq("is_exhausted", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.api_key ?? null;
}


export async function markKeyAsExhausted(apiKey: string, error?: unknown): Promise<void> {
  // Only flag as exhausted on genuine quota errors (429 / RESOURCE_EXHAUSTED).
  // Auth errors (401, 403, UNAUTHENTICATED) or other failures must NOT invalidate the key.
  if (error !== undefined) {
    const msg = typeof error === "string" ? error : (error as any)?.message ?? String(error);
    const isQuota = /RESOURCE_EXHAUSTED/i.test(msg) || /\b429\b/.test(msg);
    if (!isQuota) return;
  }
  await supabase
    .from("google_api_keys")
    .update({ is_exhausted: true, exhausted_at: new Date().toISOString() })
    .eq("api_key", apiKey);
}

export async function resetExhaustedKeys(): Promise<void> {
  await supabase
    .from("google_api_keys")
    .update({ is_exhausted: false, exhausted_at: null })
    .eq("is_exhausted", true);
}
