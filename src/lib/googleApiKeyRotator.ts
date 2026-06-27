import { supabase } from "@/integrations/supabase/client";

export async function getActiveApiKey(): Promise<string | null> {
  const { data, error } = await supabase
    .from("google_api_keys")
    .select("id, api_key")
    .eq("is_active", true)
    .eq("is_exhausted", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.api_key;
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
