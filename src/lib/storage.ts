import { supabase } from "@/integrations/supabase/client";

export const BUCKET = "scene-assets";

export async function uploadSceneFile(file: File, projectId: string, kind: "original" | "generated") {
  const ext = file.name.split(".").pop() || "png";
  const path = `${projectId}/${kind}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "image/png",
  });
  if (error) throw error;
  return path;
}

export async function getSignedUrl(path: string, expiresIn = 60 * 60) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function downloadAsBlob(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return data;
}
