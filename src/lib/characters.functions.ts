import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CharacterImport = z.object({
  name: z.string().min(1),
  short_bio: z.string().optional().nullable(),
  personality: z.string().optional().nullable(),
  speaking_style: z.string().optional().nullable(),
  canonical_prompt: z.string().optional().nullable(),
  catchphrases: z.array(z.string()).default([]),
  hooks: z
    .array(
      z.union([
        z.string().transform((s) => ({ text: s, action: "postura natural", duration: 4 })),
        z.object({
          text: z.string(),
          action: z.string().default("postura natural"),
          duration: z.number().default(4),
        }),
      ]),
    )
    .default([]),
  ctas: z
    .array(
      z.union([
        z.string().transform((s) => ({ text: s })),
        z.object({ text: z.string(), note: z.string().optional() }),
      ]),
    )
    .default([]),
});

const ImportInput = z.object({
  json: z.string().min(2),
});

export const importCharacters = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data }) => {
    let parsed: unknown;
    try {
      const cleaned = data.json.replace(/```json|```/g, "").trim();
      const start = cleaned.search(/[[{]/);
      const isArr = cleaned[start] === "[";
      const end = cleaned.lastIndexOf(isArr ? "]" : "}");
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch (e) {
      throw new Error("JSON inválido: " + (e as Error).message);
    }
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const items = z.array(CharacterImport).parse(arr);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = items.map((c) => ({
      name: c.name,
      short_bio: c.short_bio ?? null,
      personality: c.personality ?? null,
      speaking_style: c.speaking_style ?? null,
      canonical_prompt: c.canonical_prompt ?? null,
      catchphrases: c.catchphrases,
      hooks: c.hooks,
      ctas: c.ctas,
    }));
    const { error, data: inserted } = await supabaseAdmin
      .from("characters")
      .insert(rows)
      .select("id, name");
    if (error) throw new Error(error.message);
    return { count: inserted?.length ?? 0, items: inserted ?? [] };
  });
