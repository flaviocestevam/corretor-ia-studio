import { supabase } from "@/integrations/supabase/client";

export async function getActiveApiKey(): Promise<string | null> {
  const { data: allKeys, error: allErr } = await supabase
    .from("google_api_keys")
    .select("id, label, is_active, is_exhausted");
  console.log("[googleApiKeyRotator] all keys:", { count: allKeys?.length ?? 0, allKeys, allErr });

  const { data, error } = await supabase
    .from("google_api_keys")
    .select("id, api_key, label, is_active, is_exhausted")
    .eq("is_active", true)
    .eq("is_exhausted", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  console.log("[googleApiKeyRotator] active key query:", {
    found: !!data,
    label: data?.label,
    is_active: data?.is_active,
    is_exhausted: data?.is_exhausted,
    error,
  });

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
