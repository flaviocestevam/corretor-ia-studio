import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function key() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY ausente");
  return k;
}

async function chat(messages: Array<{ role: string; content: string }>, model = "google/gemini-3-flash-preview") {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI Gateway ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content as string;
}

function extractJSON(raw: string) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("Resposta inválida da IA: " + raw.slice(0, 200));
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ============ GERAR HOOKS ============
const GenHooksInput = z.object({
  characterId: z.string().uuid(),
  sceneId: z.string().uuid(),
  isFirstScene: z.boolean(),
  previousSceneScript: z.string().nullable().optional(),
  roomName: z.string(),
});

export const generateHooks = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GenHooksInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: char, error } = await supabaseAdmin
      .from("characters")
      .select("*")
      .eq("id", data.characterId)
      .single();
    if (error || !char) throw new Error("Personagem não encontrado");

    const baseHooks = (char.hooks as Array<{ text: string; action: string }>) || [];
    const prompt = data.isFirstScene
      ? `Você é roteirista de Reels imobiliários. Personagem: "${char.name}".
Personalidade: ${char.personality}
Jeito de falar: ${char.speaking_style}
Bordões: ${(char.catchphrases as string[])?.join(" | ")}
Hooks de referência do personagem: ${JSON.stringify(baseHooks)}

Gere EXATAMENTE 3 opções de hook de ABERTURA (primeira cena) para o cômodo "${data.roomName}".
Cada hook tem ~4 segundos, deve prender atenção, combinar 100% com a personalidade, ter ação visual clara e NÃO parecer propaganda formal.
Use linguagem brasileira informal (pra, tá, olha isso, vou falar a verdade).

Responda APENAS com JSON array no formato:
[{"text":"...","action":"...","duration":4}, ...]`
      : `Você é roteirista de Reels imobiliários. Personagem: "${char.name}".
Personalidade: ${char.personality}
Jeito de falar: ${char.speaking_style}
Cena anterior terminou com: "${data.previousSceneScript ?? ""}"
Cômodo atual: "${data.roomName}"

Gere 3 hooks curtos (~4s) de CONTINUAÇÃO que conectem com a cena anterior, no estilo:
"E eu achei que já tinha visto tudo lá fora…" / "Agora piorou. Olha isso." / "Se já tava bom, espera..."
Respeite o jeito de falar do personagem.

Responda APENAS com JSON array:
[{"text":"...","action":"...","duration":4}, ...]`;

    const raw = await chat([{ role: "user", content: prompt }]);
    const hooks = extractJSON(raw);

    await supabaseAdmin
      .from("scenes")
      .update({ hook_options: hooks })
      .eq("id", data.sceneId);

    return hooks;
  });

// ============ GERAR ROTEIROS ============
const GenScriptsInput = z.object({
  characterId: z.string().uuid(),
  sceneId: z.string().uuid(),
  roomName: z.string(),
  selectedHook: z.string(),
  isLastScene: z.boolean(),
  previousSceneScript: z.string().nullable().optional(),
});

export const generateScripts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GenScriptsInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: char, error } = await supabaseAdmin
      .from("characters")
      .select("*")
      .eq("id", data.characterId)
      .single();
    if (error || !char) throw new Error("Personagem não encontrado");

    const ctas = (char.ctas as Array<{ text: string }>)?.map((c) => c.text).join(" | ") ?? "";

    const prompt = `Você é roteirista de Reels imobiliários verticais 9:16.
Personagem: "${char.name}"
Personalidade: ${char.personality}
Jeito de falar: ${char.speaking_style}
Bordões: ${(char.catchphrases as string[])?.join(" | ")}
CTAs do personagem: ${ctas}

Cena: cômodo "${data.roomName}"
Hook escolhido para esta cena: "${data.selectedHook}"
${data.previousSceneScript ? `Cena anterior: "${data.previousSceneScript}"` : ""}
${data.isLastScene ? "Esta é a ÚLTIMA cena: termine com CTA FORTE mandando pro link da bio." : "Cena intermediária: termine com CTA curto OU gancho pra próxima."}

Gere 3 opções de roteiro completo para esta cena (8 a 12 segundos cada), conectados como sequência.
Formato de cada roteiro: começa com o hook (ou frase de conexão), comentário principal sobre o cômodo, CTA curto no estilo do personagem.

PROIBIDO usar: "excelente oportunidade", "empreendimento diferenciado", "alto padrão" genérico, "venha conhecer", "imóvel dos sonhos", "localização privilegiada" sem contexto.
USE: pra, tá, olha isso, isso aqui, calma, vou falar a verdade.

Responda APENAS com JSON array de strings:
["roteiro 1 completo", "roteiro 2 completo", "roteiro 3 completo"]`;

    const raw = await chat([{ role: "user", content: prompt }]);
    const scripts = extractJSON(raw);

    await supabaseAdmin
      .from("scenes")
      .update({ script_options: scripts })
      .eq("id", data.sceneId);

    return scripts as string[];
  });

// ============ GERAR IMAGEM COM CORRETOR ============
const GenImageInput = z.object({
  sceneId: z.string().uuid(),
});

export const generateSceneImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GenImageInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: scene, error: sErr } = await supabaseAdmin
      .from("scenes")
      .select("*, projects!inner(character_id)")
      .eq("id", data.sceneId)
      .single();
    if (sErr || !scene) throw new Error("Cena não encontrada");
    if (!scene.original_room_image) throw new Error("Cena não tem foto do cômodo");

    const { data: char, error: cErr } = await supabaseAdmin
      .from("characters")
      .select("*")
      .eq("id", (scene as any).projects.character_id)
      .single();
    if (cErr || !char) throw new Error("Personagem não encontrado");

    const selectedHook = scene.selected_hook as { action?: string } | null;
    const action = selectedHook?.action ?? "postura natural compatível com a personalidade do personagem";

    const outfitImg = (char as any).active_outfit_image as string | null;
    const faceImg = (char as any).face_reference_image as string | null;
    const bodyImg = (char as any).body_reference_image as string | null;

    const refs: Array<{ label: string; path: string }> = [];
    if (outfitImg) refs.push({ label: "ROUPA ATIVA (roupa que deve aparecer na cena)", path: outfitImg });
    if (faceImg) refs.push({ label: "ROSTO FRONTAL (referência de identidade facial)", path: faceImg });
    if (bodyImg) refs.push({ label: "CORPO INTEIRO (referência de proporções)", path: bodyImg });

    if (refs.length === 0) {
      throw new Error("Personagem sem fotos de referência. Defina ao menos a foto de rosto, corpo ou roupa ativa.");
    }

    const refsDescription = refs
      .map((r, i) => `IMAGEM ${i + 2} = ${r.label}`)
      .join("\n");

    const imagePrompt = `IMAGEM 1 = foto real do cômodo (cenário fixo).
${refsDescription}

REGRAS OBRIGATÓRIAS:
1. Use a IMAGEM 1 como cenário. NÃO altere móveis, paredes, piso, janelas, iluminação ou decoração do cômodo.
2. Insira o personagem "${char.name}" dentro do cômodo de forma fotorrealista, com iluminação coerente com o ambiente.
3. Roupa: copie EXATAMENTE a roupa da imagem marcada como "ROUPA ATIVA" (cor, corte, acessórios). Ignore roupas das outras imagens de referência.
4. Rosto e proporções: combine as imagens marcadas como "ROSTO FRONTAL" e "CORPO INTEIRO" para manter a mesma identidade física (rosto, traços, cabelo, altura, tipo físico) em todas as cenas.
5. Descrição visual canônica adicional: ${char.canonical_prompt ?? char.personality}
6. Pose / ação na cena: ${action}
7. Expressão coerente com a personalidade: ${char.personality}
8. Enquadramento vertical 9:16, corpo inteiro ou meio corpo conforme o cômodo permitir. Sem texto, sem logo, sem marca d'água.`;

    // signed URL for room photo
    const { data: signed, error: urlErr } = await supabaseAdmin.storage
      .from("scene-assets")
      .createSignedUrl(scene.original_room_image, 600);
    if (urlErr || !signed) throw new Error("Não foi possível ler a foto do cômodo");

    const contentBlocks: Array<Record<string, unknown>> = [
      { type: "text", text: imagePrompt },
      { type: "image_url", image_url: { url: signed.signedUrl } },
    ];

    for (const r of refs) {
      const { data: sci } = await supabaseAdmin.storage
        .from("scene-assets")
        .createSignedUrl(r.path, 600);
      if (sci?.signedUrl) contentBlocks.push({ type: "image_url", image_url: { url: sci.signedUrl } });
    }

    const res = await fetch(`${GATEWAY}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image",
        messages: [{ role: "user", content: contentBlocks }],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Gateway ${res.status}: ${txt}`);
    }
    const json = await res.json();
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("IA não retornou imagem");

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `${scene.project_id}/generated/${crypto.randomUUID()}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("scene-assets")
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (upErr) throw upErr;

    await supabaseAdmin
      .from("scenes")
      .update({
        generated_character_image: path,
        image_prompt: imagePrompt,
        status: "gerado",
      })
      .eq("id", data.sceneId);

    return { path, image_prompt: imagePrompt };
  });

// ============ GERAR PROMPT DE VÍDEO ============
const GenVideoPromptInput = z.object({ sceneId: z.string().uuid() });

export const generateVideoPrompt = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GenVideoPromptInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: scene } = await supabaseAdmin
      .from("scenes")
      .select("*, projects!inner(character_id)")
      .eq("id", data.sceneId)
      .single();
    if (!scene) throw new Error("Cena não encontrada");

    const { data: char } = await supabaseAdmin
      .from("characters")
      .select("*")
      .eq("id", (scene as any).projects.character_id)
      .single();
    if (!char) throw new Error("Personagem não encontrado");

    const selectedHook = scene.selected_hook as { action?: string; text?: string } | null;
    const action = selectedHook?.action ?? "pose natural";
    const roteiro = scene.selected_script ?? selectedHook?.text ?? "";

    const videoPrompt = `Use a imagem enviada como referência principal. Crie um vídeo vertical 9:16 de 10 segundos. O personagem "${char.name}" aparece dentro do cômodo "${scene.room_name}", mantendo o ambiente exatamente igual à imagem. Ele deve agir de acordo com sua personalidade: ${char.personality}. Ação: ${action}. Expressão: coerente com ${char.personality}. Ele fala em português brasileiro informal: "${roteiro}". Movimento natural de câmera, estilo Reels/TikTok, fotorrealista, sem alterar móveis, paredes, iluminação ou decoração do imóvel.`;

    await supabaseAdmin.from("scenes").update({ video_prompt: videoPrompt }).eq("id", data.sceneId);
    return videoPrompt;
  });

// ============ APROVAR CENA ============
export const approveScene = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ sceneId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("scenes").update({ status: "aprovado" }).eq("id", data.sceneId);
    return true;
  });
