import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ABSOLUTE_ROOM_PRESERVATION,
  buildHookPrompt,
  buildImagePrompt,
  buildVideoPrompt,
  type Framing,
} from "./prompt-engine";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function key() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY ausente");
  return k;
}

type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ChatMessage = { role: string; content: string | ChatPart[] };

async function chat(
  messages: ChatMessage[],
  model = "google/gemini-3-flash-preview",
  temperature = 1.1,
) {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI Gateway ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content as string;
}

async function fetchRoomImageDataUrl(
  supabaseAdmin: { storage: { from: (b: string) => { download: (p: string) => Promise<{ data: Blob | null; error: unknown }> } } },
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  const { data: blob, error } = await supabaseAdmin.storage.from("scene-assets").download(path);
  if (error || !blob) return null;
  const buf = Buffer.from(await blob.arrayBuffer());
  const mime = blob.type || "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function extractJSON(raw: string) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("Resposta inválida da IA: " + raw.slice(0, 200));
  return JSON.parse(cleaned.slice(start, end + 1));
}

function removeIntermediateCta(script: string) {
  const ctaPattern = /\b(link da bio|bio|comenta\s+info|comente\s+info|manda\s+info|direct|chama|me chama|clica|clique|arrasta|agenda|agendar|visita|quer saber mais|te mando|falo contigo|fala comigo|entra em contato|contato)\b/i;
  const parts = script
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const filtered = parts.filter((part) => !ctaPattern.test(part));
  return (filtered.length ? filtered : parts.slice(0, 1)).join(" ").trim();
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
    const { data: sceneRow } = await supabaseAdmin
      .from("scenes")
      .select("original_room_image")
      .eq("id", data.sceneId)
      .single();
    const imageDataUrl = await fetchRoomImageDataUrl(supabaseAdmin, sceneRow?.original_room_image);

    const { system, user: userPrompt } = buildHookPrompt({
      character: {
        name: char.name,
        personality: char.personality ?? "",
        speaking_style: char.speaking_style ?? "",
        catchphrases: char.catchphrases as string[] | null,
        hooks: baseHooks,
      },
      roomName: data.roomName,
      isFirstScene: data.isFirstScene,
      previousSceneScript: data.previousSceneScript,
      hasRoomImage: !!imageDataUrl,
    });

    const userContent: ChatPart[] = [{ type: "text", text: userPrompt }];
    if (imageDataUrl) userContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
    const raw = await chat([
      { role: "system", content: system },
      { role: "user", content: userContent },
    ]);
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

    // Buscar a cena atual + TODAS as cenas anteriores do mesmo projeto, pra
    // a IA enxergar o histórico inteiro e NÃO repetir falas de outras cenas.
    const { data: currentScene } = await supabaseAdmin
      .from("scenes")
      .select("project_id, scene_order, script_options, original_room_image")
      .eq("id", data.sceneId)
      .single();
    const imageDataUrl = await fetchRoomImageDataUrl(supabaseAdmin, currentScene?.original_room_image);

    let previousScripts: Array<{ room: string; script: string }> = [];
    let existingOptions: string[] = [];
    if (currentScene) {
      existingOptions = (currentScene.script_options as string[] | null) ?? [];
      const { data: prev } = await supabaseAdmin
        .from("scenes")
        .select("room_name, selected_script, scene_order")
        .eq("project_id", currentScene.project_id)
        .lt("scene_order", currentScene.scene_order)
        .order("scene_order", { ascending: true });
      previousScripts = (prev ?? [])
        .filter((p) => p.selected_script)
        .map((p) => ({ room: p.room_name, script: p.selected_script as string }));
    }

    const ctas = (char.ctas as Array<{ text: string }>)?.map((c) => c.text).join(" | ") ?? "";

    const historyBlock = previousScripts.length
      ? `HISTÓRICO DAS CENAS ANTERIORES JÁ GRAVADAS (NÃO REPITA estas falas, estruturas, comparações ou comentários — esta cena precisa ser NOVA e falar especificamente de "${data.roomName}"):
${previousScripts.map((p, i) => `Cena ${i + 1} — ${p.room}: "${p.script}"`).join("\n")}`
      : "Esta é a primeira cena com roteiro do projeto.";

    const avoidBlock = existingOptions.length
      ? `\nVOCÊ JÁ TINHA GERADO estas opções para esta MESMA cena e o usuário pediu novas. NÃO repita nenhuma delas, traga ângulos diferentes:
${existingOptions.map((s, i) => `${i + 1}) "${s}"`).join("\n")}`
      : "";

    const scriptEndingRule = data.isLastScene
      ? "Esta é a ÚLTIMA cena do projeto: os roteiros DEVEM terminar com CTA forte usando, no máximo, um CTA do personagem."
      : "Esta NÃO é a última cena do projeto: é PROIBIDO usar CTA. NÃO peça link da bio, direct, comentário, INFO, visita, contato, clique ou mensagem. Termine com observação do ambiente ou gancho natural para a próxima cena.";

    const durationRule = data.isLastScene
      ? `- Máximo 10s de fala, máximo 25 palavras.
- Estrutura: abertura curta + 1 frase nomeando algo concreto do "${data.roomName}" + CTA curto.`
      : `- Máximo 10s de fala, máximo 22 palavras.
- Estrutura: abertura curta + 1 frase nomeando algo concreto do "${data.roomName}" + fechamento SEM CTA.`;

    const responseRule = data.isLastScene
      ? `Responda APENAS com JSON array de 3 strings DISTINTAS (cada uma citando um item físico DIFERENTE do "${data.roomName}" e terminando com CTA):`
      : `Responda APENAS com JSON array de 3 strings DISTINTAS (cada uma citando um item físico DIFERENTE do "${data.roomName}" e SEM CTA):`;

    const prompt = `Você é roteirista de Reels imobiliários verticais 9:16.
Personagem: "${char.name}"
Personalidade: ${char.personality}
Jeito de falar: ${char.speaking_style}
Bordões: ${(char.catchphrases as string[])?.join(" | ")}
${data.isLastScene ? `CTAs do personagem: ${ctas}` : "CTAs do personagem: NÃO USAR NESTA CENA"}

CENA ATUAL: cômodo "${data.roomName}" (cena nº ${currentScene?.scene_order ?? "?"})
Hook escolhido para ESTA cena: "${data.selectedHook}"

${historyBlock}${avoidBlock}

${scriptEndingRule}

REGRAS DE CONTEÚDO (CRÍTICO — descumprir = resposta REJEITADA):
${imageDataUrl ? `- VOCÊ ESTÁ VENDO A FOTO REAL DO CÔMODO em anexo. Cada roteiro PRECISA citar um item físico que aparece DE VERDADE na foto (móvel, material, acabamento, vista, iluminação realmente visíveis).
- É TERMINANTEMENTE PROIBIDO inventar itens que NÃO estão na foto. Não fale de cristaleira, lustre de cristal, torneira gourmet, mármore, LED, marcenaria ripada, pé-direito duplo, ilha, closet, varanda gourmet etc. se isso não aparece na imagem. Se for um cômodo simples, descreva o que existe ali com elegância — sem luxo fabricado.` : `- Cada roteiro PRECISA mencionar EXPLICITAMENTE pelo menos 1 elemento físico concreto do cômodo "${data.roomName}".`}
- PROIBIDO usar apenas frases genéricas tipo "isso aqui é fino", "que espetáculo", "olha que coisa" sem citar um item real do cômodo.
- Se esta cena NÃO for a última, CTA é PROIBIDO em todas as 3 opções.
- NÃO copie estrutura nem comparações das cenas anteriores. Cada cena é um novo momento do tour.
- As 3 opções devem ser DIFERENTES ENTRE SI: ângulos, elementos citados, emoções e palavras distintas.

REGRAS DE ABERTURA (CRÍTICO):
- Apenas o ROTEIRO 1 começa com o hook escolhido exatamente como está.
- ROTEIRO 2 e ROTEIRO 3 PRECISAM começar com aberturas DIFERENTES (parafrasear o hook, usar outra exclamação curta, ou ir direto pro item do cômodo). PROIBIDO repetir literalmente o hook no 2 e no 3.

REGRAS DE DURAÇÃO (OBRIGATÓRIAS):
${durationRule}
- Sem introduções nem narração extra.

PROIBIDO: "excelente oportunidade", "empreendimento diferenciado", "alto padrão" genérico, "venha conhecer", "imóvel dos sonhos", "localização privilegiada" sem contexto.
USE: pra, tá, olha isso, isso aqui, calma, vou falar a verdade.

${responseRule}
["roteiro 1", "roteiro 2", "roteiro 3"]`;


    const userContent: ChatPart[] = [{ type: "text", text: prompt }];
    if (imageDataUrl) userContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
    const raw = await chat([{ role: "user", content: userContent }]);
    const scripts = (extractJSON(raw) as string[]).map((script) =>
      data.isLastScene ? script : removeIntermediateCta(script),
    );

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

    const framingKey = ((scene as any).camera_framing ?? "corpo_inteiro") as Framing;

    const imagePrompt = buildImagePrompt({
      character: {
        name: char.name,
        personality: char.personality ?? "",
        canonical_prompt: (char as any).canonical_prompt ?? null,
        height_cm: (char as any).height_cm ?? null,
      },
      roomName: scene.room_name,
      framing: framingKey,
      hookAction: action,
      refsDescription,
    });

    const absoluteRoomPreservationRule = ABSOLUTE_ROOM_PRESERVATION;



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

    async function callModel(model: string, extraReinforcement: string) {
      const userBlocks = extraReinforcement
        ? [{ type: "text", text: extraReinforcement }, ...contentBlocks]
        : contentBlocks;
      return fetch(`${GATEWAY}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: absoluteRoomPreservationRule },
            { role: "user", content: userBlocks },
          ],
          modalities: ["image", "text"],
        }),
      });
    }

    // ============ VALIDADOR DE ENQUADRAMENTO (vision) ============
    async function validateFraming(imageDataUrl: string): Promise<{
      ok: boolean;
      detected: string;
      reason: string;
    }> {
      const expectedLabel = framingKey;
      const rubric = `Você é auditor de enquadramento fotográfico. Classifique a imagem em UM destes valores EXATOS:
- "selfie" → apenas cabeça e ombros, rosto domina o frame
- "meio_corpo" → da cintura pra cima, sem pernas/pés
- "corpo_inteiro" → cabeça aos pés com pés visíveis tocando o chão
- "plano_aberto" → pessoa pequena (<35% da altura), cômodo dominando
Esperado: "${expectedLabel}".
Responda APENAS JSON: {"detected":"selfie|meio_corpo|corpo_inteiro|plano_aberto","ok":true|false,"reason":"curta"}`;
      try {
        const raw = await chat(
          [
            {
              role: "user",
              content: [
                { type: "text", text: rubric },
                { type: "image_url", image_url: { url: imageDataUrl } },
              ],
            },
          ],
          "google/gemini-3-flash-preview",
          0.1,
        );
        const cleaned = raw.replace(/```json|```/g, "").trim();
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        const detected = String(parsed.detected ?? "");
        const ok = expectedLabel === "auto" ? true : detected === expectedLabel;
        return { ok, detected, reason: String(parsed.reason ?? "") };
      } catch {
        return { ok: true, detected: "unknown", reason: "validator-failed" };
      }
    }

    const PRO = "google/gemini-3-pro-image";
    const FLASH = "google/gemini-3.1-flash-image";
    let usedFallback = false;
    let modelUsed = PRO;
    let reinforcement = "";
    let b64: string | undefined;
    let validation: { ok: boolean; detected: string; reason: string } = {
      ok: true,
      detected: "auto",
      reason: "skipped",
    };
    const MAX_ATTEMPTS = 3;
    let attempts = 0;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      attempts++;
      let res = await callModel(modelUsed, reinforcement);
      if (!res.ok && (res.status === 429 || res.status === 402) && modelUsed === PRO) {
        modelUsed = FLASH;
        usedFallback = true;
        res = await callModel(FLASH, reinforcement);
      }
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Gateway ${res.status}: ${txt}`);
      }
      const json = await res.json();
      const candidate = json.data?.[0]?.b64_json;
      if (!candidate) throw new Error("IA não retornou imagem");

      if (framingKey === "auto") {
        b64 = candidate;
        break;
      }
      validation = await validateFraming(`data:image/png;base64,${candidate}`);
      if (validation.ok) {
        b64 = candidate;
        break;
      }
      if (i === MAX_ATTEMPTS - 1) {
        b64 = candidate;
        break;
      }
      reinforcement = `⚠️ TENTATIVA ${i + 2}/${MAX_ATTEMPTS}: A geração anterior foi REJEITADA pelo validador de enquadramento. Detectado: "${validation.detected}". Esperado: "${framingKey}". Motivo: ${validation.reason}. CORRIJA AGORA — aplique RIGOROSAMENTE as regras do enquadramento "${framingKey}". Ajuste DISTÂNCIA DA CÂMERA e ESCALA do personagem antes de qualquer outra coisa.`;
    }

    if (!b64) throw new Error("IA não retornou imagem");

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `${scene.project_id}/generated/${crypto.randomUUID()}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("scene-assets")
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (upErr) throw upErr;

    const modelShort = modelUsed === PRO ? "gemini-3-pro-image" : "gemini-3.1-flash-image";

    await supabaseAdmin
      .from("scenes")
      .update({
        generated_character_image: path,
        image_prompt: imagePrompt,
        status: "gerado",
        model_used: modelShort,
      })
      .eq("id", data.sceneId);

    return {
      path,
      image_prompt: imagePrompt,
      usedFallback,
      model: modelShort,
      framing_validation: {
        expected: framingKey,
        detected: validation.detected,
        ok: validation.ok,
        attempts,
      },
    };
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

    // Detectar se esta é a ÚLTIMA cena do projeto (pra incluir CTA).
    const { data: maxRow } = await supabaseAdmin
      .from("scenes")
      .select("scene_order")
      .eq("project_id", scene.project_id)
      .order("scene_order", { ascending: false })
      .limit(1)
      .single();
    const isLastScene = !!maxRow && maxRow.scene_order === scene.scene_order;

    const selectedHook = scene.selected_hook as { action?: string; text?: string } | null;
    const ctas = ((char.ctas as Array<{ text: string }> | null) ?? [])
      .map((c) => c.text)
      .filter(Boolean);

    const videoPrompt = buildVideoPrompt({
      characterName: char.name,
      characterPersonality: char.personality ?? "",
      characterSpeakingStyle: char.speaking_style ?? "",
      roomName: scene.room_name,
      hookText: selectedHook?.text ?? "",
      hookAction: selectedHook?.action ?? "",
      fullScript: scene.selected_script ?? "",
      isLastScene,
      ctas,
    });

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
