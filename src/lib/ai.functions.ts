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

// ============ ROTAÇÃO DE API KEY DO GOOGLE (tabela google_api_keys) ============
type AdminClient = { from: (t: string) => any };

async function getActiveGoogleKey(
  supabaseAdmin: AdminClient,
): Promise<{ id: string; api_key: string }> {
  const { data } = await supabaseAdmin
    .from("google_api_keys")
    .select("id, api_key")
    .eq("is_active", true)
    .eq("is_exhausted", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) {
    throw new Error(
      "Nenhuma API key do Google ativa. Cadastre uma em Configurações (ou resete cotas esgotadas).",
    );
  }
  return data as { id: string; api_key: string };
}

async function markGoogleKeyExhausted(supabaseAdmin: AdminClient, id: string) {
  await supabaseAdmin
    .from("google_api_keys")
    .update({ is_exhausted: true, exhausted_at: new Date().toISOString() })
    .eq("id", id);
}

async function callGeminiImage(
  supabaseAdmin: AdminClient,
  model: string,
  body: unknown,
): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const key = await getActiveGoogleKey(supabaseAdmin);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": key.api_key, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (res.status === 429 || res.status === 403) {
      await markGoogleKeyExhausted(supabaseAdmin, key.id);
      continue;
    }
    return res;
  }
  throw new Error(
    "Todas as API keys do Google estão esgotadas. Adicione novas contas em Configurações ou resete as cotas.",
  );
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
      .select("original_room_image, project_id")
      .eq("id", data.sceneId)
      .single();
    const imageDataUrl = await fetchRoomImageDataUrl(supabaseAdmin, sceneRow?.original_room_image);

    // Coleta hooks já gerados/escolhidos pra ESTE personagem (em qualquer projeto)
    // + hooks já gerados nas outras cenas DESTE projeto. Tudo vira lista proibida.
    const forbiddenSet = new Set<string>();
    const { data: charProjects } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("character_id", data.characterId);
    const projectIds = (charProjects ?? []).map((p) => p.id);
    if (projectIds.length) {
      const { data: prevHooks } = await supabaseAdmin
        .from("scenes")
        .select("hook_options, selected_hook, id")
        .in("project_id", projectIds);
      for (const s of prevHooks ?? []) {
        if (s.id === data.sceneId) continue;
        const opts = (s.hook_options as Array<{ text?: string }> | null) ?? [];
        for (const o of opts) if (o?.text) forbiddenSet.add(String(o.text).trim());
        const sel = s.selected_hook as { text?: string } | null;
        if (sel?.text) forbiddenSet.add(String(sel.text).trim());
      }
    }
    const forbiddenOpenings = Array.from(forbiddenSet);

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
      forbiddenOpenings,
      seed: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    });

    const userContent: ChatPart[] = [{ type: "text", text: userPrompt }];
    if (imageDataUrl) userContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
    const raw = await chat(
      [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      "google/gemini-3-flash-preview",
      1.3,
    );
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

    // Helper: baixa URL e devolve { data: base64, mime_type }
    async function urlToInline(url: string): Promise<{ data: string; mime_type: string }> {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Falha ao baixar imagem ref (${r.status})`);
      const mime = r.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      return { data: btoa(bin), mime_type: mime };
    }

    // Monta parts: texto + cômodo + referências
    const roomInline = await urlToInline(signed.signedUrl);
    const parts: Array<Record<string, unknown>> = [
      { text: imagePrompt },
      { inline_data: roomInline },
    ];
    for (const r of refs) {
      const { data: sci } = await supabaseAdmin.storage
        .from("scene-assets")
        .createSignedUrl(r.path, 600);
      if (sci?.signedUrl) {
        const inl = await urlToInline(sci.signedUrl);
        parts.push({ inline_data: inl });
      }
    }

    function googleKey() {
      const k = process.env.GOOGLE_AI_API_KEY;
      if (!k) throw new Error("GOOGLE_AI_API_KEY ausente");
      return k;
    }

    async function callModel(model: string, extraReinforcement: string) {
      const finalParts = extraReinforcement
        ? [{ text: extraReinforcement }, ...parts]
        : parts;
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": googleKey(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: absoluteRoomPreservationRule }] },
            contents: [{ role: "user", parts: finalParts }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
          }),
        },
      );
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

    const PRO = "gemini-3-pro-image";
    const FLASH = "gemini-3.1-flash-image";

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
      if (!res.ok && modelUsed === PRO) {
        // Fallback para Flash em qualquer erro do Pro (rate limit, créditos, indisponibilidade)
        modelUsed = FLASH;
        usedFallback = true;
        res = await callModel(FLASH, reinforcement);
      }
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Google API ${res.status}: ${txt}`);
      }
      const json = await res.json();
      // Extrai a primeira parte com inline_data
      const respParts = json?.candidates?.[0]?.content?.parts ?? [];
      const imgPart = respParts.find(
        (p: any) => p?.inline_data?.data || p?.inlineData?.data,
      );
      const candidate: string | undefined =
        imgPart?.inline_data?.data ?? imgPart?.inlineData?.data;
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

    const modelShort = modelUsed;


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

// ============ TOUR NO CÔMODO (sem personagem) ============
const GenRoomTourInput = z.object({
  sceneId: z.string().uuid(),
  musicMood: z.enum(["aconchegante", "sofisticado", "energetico"]).default("sofisticado"),
});

const MUSIC_PRESETS: Record<string, string> = {
  aconchegante: "Trilha sonora: piano suave + lo-fi acústico, mood aconchegante e familiar, andamento lento (~70 BPM), sem voz, sem letra. Referência: 'cozy home' / 'warm interior'.",
  sofisticado: "Trilha sonora: cinematic strings minimalistas + jazz piano suave, mood sofisticado e elegante, andamento moderado (~80 BPM), sem voz, sem letra. Referência: 'luxury real estate' / 'editorial cinematic'.",
  energetico: "Trilha sonora: house chill instrumental + indie pop acústico, mood leve e vibrante, andamento (~95 BPM), sem voz, sem letra. Referência: 'modern lifestyle' / 'uplifting interior tour'.",
};

export const generateRoomTour = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GenRoomTourInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: scene, error: sErr } = await supabaseAdmin
      .from("scenes")
      .select("*")
      .eq("id", data.sceneId)
      .single();
    if (sErr || !scene) throw new Error("Cena não encontrada");
    if (!scene.original_room_image) throw new Error("Cena não tem foto do cômodo");

    const imageDataUrl = await fetchRoomImageDataUrl(supabaseAdmin, scene.original_room_image);
    if (!imageDataUrl) throw new Error("Não foi possível ler a foto do cômodo");

    // 1) Descrição detalhada do cômodo (vision) — base para o prompt de imagem
    const descPrompt = `Você é especialista em descrever interiores para reprodução fotográfica fiel.

Analise a foto anexa (foto HORIZONTAL do cômodo "${scene.room_name}") e produza UMA descrição minuciosa, em português, listando TODOS os elementos visíveis:
- Layout e arquitetura (paredes, teto, piso, janelas, portas, pé-direito).
- Cores exatas (paredes, tetos, móveis, tecidos, acabamentos).
- Materiais e acabamentos (madeira clara/escura, mármore, porcelanato, tecido bouclé, metal escovado, etc).
- Todos os móveis e suas posições relativas.
- Iluminação (natural, pendentes, luminárias, abajures, spots).
- Decoração (quadros, vasos, plantas, objetos, livros, almofadas, tapetes).
- Vista pelas janelas, cortinas e persianas.
- Texturas e padrões.
- Atmosfera geral (luz, sombra, hora do dia).

Inclua também os elementos que estão nas BORDAS da foto (esquerda/direita) que serão CORTADOS ao converter para vertical 9:16, descrevendo-os com a mesma precisão, porque o prompt de imagem precisa preservá-los mesmo fora do enquadramento vertical.

Responda APENAS com a descrição corrida (sem listas com bullets, sem markdown, sem cabeçalhos). Mínimo 200 palavras.`;

    const description = await chat(
      [
        {
          role: "user",
          content: [
            { type: "text", text: descPrompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      "google/gemini-3-flash-preview",
      0.4,
    );

    // 2) Recomposição VERTICAL 9:16 da foto (pra IA de vídeo respeitar a proporção)
    const { data: signed } = await supabaseAdmin.storage
      .from("scene-assets")
      .createSignedUrl(scene.original_room_image, 600);
    if (!signed) throw new Error("Não foi possível assinar a foto");

    async function urlToInline(url: string): Promise<{ data: string; mime_type: string }> {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Falha ao baixar imagem (${r.status})`);
      const mime = r.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      return { data: btoa(bin), mime_type: mime };
    }
    const roomInline = await urlToInline(signed.signedUrl);

    const verticalPrompt = `🚨 TAREFA: RECOMPOR a foto horizontal anexa em formato VERTICAL 9:16 (retrato), MANTENDO 100% DE FIDELIDADE visual ao cômodo original.

REGRAS ABSOLUTAS:
✅ Preservar EXATAMENTE: todas as cores (paredes, teto, piso, móveis, tecidos, almofadas, cortinas, quadros, plantas), iluminação (direção, temperatura, sombras), materiais e acabamentos (madeira, mármore, metal, tecidos), TODOS os objetos visíveis (grandes e pequenos), texturas, padrões do piso, sancas do teto, rodapés, molduras.
✅ Mesma atmosfera, mesma hora do dia, mesmo clima.
✅ Saída obrigatória: VERTICAL 9:16 (retrato).
✅ Recompor o enquadramento aproximando levemente a câmera ou reposicionando verticalmente, mantendo o MAIOR número possível de elementos centrais visíveis.
✅ As bordas laterais que forem cortadas devem ser substituídas naturalmente por extensão do MESMO piso/parede/teto já visíveis (sem inventar novos móveis, quadros, janelas, objetos).

❌ PROIBIDO: inventar móveis, decoração, plantas, quadros, luminárias, janelas ou áreas novas. Trocar cores. Mudar iluminação. Adicionar pessoas, animais, partículas, lens flare. Estilizar (não é renderização, é fotografia real). Alterar materiais. Alterar layout.

CÔMODO: ${scene.room_name}
REFERÊNCIA DETALHADA (preservar 100%): ${description.trim().slice(0, 1500)}

Saída: FOTOGRAFIA realista 9:16, mesma luz/cor/materiais da foto original, sem texto, sem logo, sem marca d'água.`;

    function googleKey() {
      const k = process.env.GOOGLE_AI_API_KEY;
      if (!k) throw new Error("GOOGLE_AI_API_KEY ausente");
      return k;
    }
    async function callImg(model: string) {
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": googleKey(), "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: "Fidelidade absoluta à foto anexa. Apenas recomposição vertical 9:16. Nunca inventar nada." }] },
            contents: [{ role: "user", parts: [{ text: verticalPrompt }, { inline_data: roomInline }] }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
          }),
        },
      );
    }
    let imgRes = await callImg("gemini-3-pro-image");
    if (!imgRes.ok) imgRes = await callImg("gemini-3.1-flash-image");
    if (!imgRes.ok) throw new Error(`Google API ${imgRes.status}: ${await imgRes.text()}`);
    const imgJson = await imgRes.json();
    const respParts = imgJson?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = respParts.find((p: any) => p?.inline_data?.data || p?.inlineData?.data);
    const b64: string | undefined = imgPart?.inline_data?.data ?? imgPart?.inlineData?.data;
    if (!b64) throw new Error("IA não retornou imagem vertical");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const verticalPath = `${scene.project_id}/tour/${crypto.randomUUID()}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("scene-assets")
      .upload(verticalPath, bytes, { contentType: "image/png", upsert: false });
    if (upErr) throw upErr;

    const videoPrompt = `🎥 TOUR NO CÔMODO — VÍDEO VERTICAL 9:16, DURAÇÃO EXATA 5 SEGUNDOS, SEM PESSOAS, SEM VOZ.

⚠️ USE A IMAGEM VERTICAL 9:16 ANEXA COMO REFERÊNCIA VISUAL E COMO ENQUADRAMENTO BASE. A SAÍDA TAMBÉM DEVE SER 9:16 (retrato).

CÔMODO: ${scene.room_name}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️⚠️⚠️ REGRA Nº1 — FIDELIDADE ABSOLUTA À IMAGEM DE REFERÊNCIA ⚠️⚠️⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ PRESERVAR EXATAMENTE: cores, iluminação, materiais, acabamentos, móveis, decoração, piso, teto, paredes, objetos grandes e pequenos.
❌ PROIBIDO: inventar objetos/móveis/plantas/quadros, remover elementos, trocar cores/materiais, adicionar pessoas/animais/partículas/lens flare, mudar iluminação/clima, alterar layout.

DESCRIÇÃO COMPLETA (preservar 100%):
${description.trim()}

MOVIMENTO DE CÂMERA (cinematográfico, suave, sem cortes):
- SAÍDA OBRIGATÓRIA 9:16 vertical (a imagem de referência já está em 9:16).
- Movimento contínuo: dolly-in lento + leve pan ou tilt suave revelando os detalhes principais.
- Velocidade lenta, contemplativa, tour de revista de arquitetura.
- Sem zoom brusco, sem corte, sem transição, sem texto, sem logo.
- Câmera estável (gimbal).

ÁUDIO:
- Sem narração, sem voz humana, sem efeitos sonoros realistas.
- ${MUSIC_PRESETS[data.musicMood]}
- Volume médio.`;

    await supabaseAdmin
      .from("scenes")
      .update({
        generated_character_image: verticalPath,
        image_prompt: verticalPrompt,
        video_prompt: videoPrompt,
        status: "gerado",
      })
      .eq("id", data.sceneId);

    return { video_prompt: videoPrompt, vertical_image: verticalPath, description };
  });

// ============ TOUR COM ANIMAL (body-mounted POV) ============
const GenAnimalTourInput = z.object({
  sceneId: z.string().uuid(),
  musicMood: z.enum(["aconchegante", "sofisticado", "energetico"]).default("sofisticado"),
});

export const generateAnimalTour = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GenAnimalTourInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: scene, error: sErr } = await supabaseAdmin
      .from("scenes")
      .select("*, projects!inner(animal_id)")
      .eq("id", data.sceneId)
      .single();
    if (sErr || !scene) throw new Error("Cena não encontrada");
    if (!scene.original_room_image) throw new Error("Cena não tem foto do cômodo");
    const animalId = (scene as any).projects?.animal_id as string | null;
    if (!animalId) throw new Error("Projeto sem animal definido");

    const { data: animal, error: aErr } = await supabaseAdmin
      .from("animals")
      .select("*")
      .eq("id", animalId)
      .single();
    if (aErr || !animal) throw new Error("Animal não encontrado");
    if (!(animal as any).canonical_image) throw new Error("Animal sem foto canônica");

    function googleKey() {
      const k = process.env.GOOGLE_AI_API_KEY;
      if (!k) throw new Error("GOOGLE_AI_API_KEY ausente");
      return k;
    }
    async function urlToInline(url: string): Promise<{ data: string; mime_type: string }> {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Falha ao baixar imagem (${r.status})`);
      const mime = r.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      return { data: btoa(bin), mime_type: mime };
    }

    const [{ data: roomSigned }, { data: animalSigned }] = await Promise.all([
      supabaseAdmin.storage.from("scene-assets").createSignedUrl(scene.original_room_image, 600),
      supabaseAdmin.storage.from("scene-assets").createSignedUrl((animal as any).canonical_image, 600),
    ]);
    if (!roomSigned || !animalSigned) throw new Error("Não foi possível ler as imagens");
    const [roomInline, animalInline] = await Promise.all([
      urlToInline(roomSigned.signedUrl),
      urlToInline(animalSigned.signedUrl),
    ]);

    // ============== FUNÇÃO 1: gerar imagem vertical 9:16 POV body-mount ==============
    const imagePrompt = `🚨 TAREFA CRÍTICA: criar UMA imagem VERTICAL 9:16 fotorrealista onde o animal aparece como se a câmera estivesse FISICAMENTE PRESA NO CORPO DELE — como uma GoPro montada no dorso superior, próxima aos ombros e ao pescoço, apontada para frente.

ANIMAL: ${animal.name}${animal.species ? ` (${animal.species})` : ""}
${(animal as any).canonical_prompt ? `DESCRIÇÃO FÍSICA FIEL: ${(animal as any).canonical_prompt}` : ""}
CÔMODO: ${scene.room_name}

IMAGEM 1 = foto do CÔMODO (preservar o ambiente: cores, móveis, piso, teto, luz, decoração).
IMAGEM 2 = foto canônica do ANIMAL (preservar pelagem, cor, porte, identidade).

REGRAS ABSOLUTAS DE COMPOSIÇÃO (descumprir = REJEITADO):

1. SAÍDA: vertical 9:16, fotorrealista.
2. AMBIENTE: preservar o cômodo da IMAGEM 1 (não inventar móveis nem mudar cores/iluminação).
3. POV body-mount: a câmera é parte do corpo do animal, posicionada no DORSO SUPERIOR, muito próxima dos OMBROS e BASE DO PESCOÇO, centralizada no eixo do corpo, apontada para frente, ligeiramente para baixo.
4. PRIMEIRO PLANO INFERIOR (parte de baixo da imagem) mostra APENAS:
   • upper back
   • shoulders
   • neck base
   • ears (topo do enquadramento)
   • mane / pelagem da nuca, quando aplicável
5. NUNCA mostrar: animal inteiro, rabo, patas traseiras, quadril, lombo completo, traseira, corpo inteiro caminhando à frente da câmera, câmera flutuando, câmera atrás do animal, perspectiva de terceira pessoa, drone.
6. ESCALA realista: o animal precisa ter tamanho fisicamente plausível em relação aos móveis e ao cômodo (gato pequeno x sofá, cachorro médio x piso, leão grande x sala). Não distorcer móveis nem o cômodo.
7. ORIENTAÇÃO: o animal precisa estar virado para uma ÁREA LIVRE do cômodo (sem apontar diretamente para parede, sofá, mesa ou obstáculo imediato). Posicionar de forma que faça sentido caminhar adiante sem colidir.
8. EVITAR obstáculos imediatos no caminho: mesas, cadeiras, bar stools, sofá, cama, plantas, colunas, portas fechadas, tapetes com borda complicada.
9. ILUMINAÇÃO, perspectiva e profundidade combinando perfeitamente com o cômodo (mesma luz da IMAGEM 1).
10. NADA de: pessoas, texto, logo, watermark, lens flare artístico, partículas, filtros estilizados.

Resultado: um frame inicial forte e imersivo, claramente "câmera presa ao corpo", pronto para virar vídeo POV de tour.`;

    async function callImg(model: string) {
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": googleKey(), "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: "Câmera SEMPRE presa ao corpo do animal (POV body-mount sobre os ombros/pescoço). NUNCA mostrar o animal inteiro, rabo ou patas traseiras. Fidelidade absoluta ao cômodo da imagem 1." }] },
            contents: [{ role: "user", parts: [
              { text: imagePrompt },
              { inline_data: roomInline },
              { inline_data: animalInline },
            ] }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
          }),
        },
      );
    }
    let imgRes = await callImg("gemini-3-pro-image");
    let modelUsed = "gemini-3-pro-image";
    if (!imgRes.ok) {
      imgRes = await callImg("gemini-3.1-flash-image");
      modelUsed = "gemini-3.1-flash-image";
    }
    if (!imgRes.ok) throw new Error(`Google API ${imgRes.status}: ${await imgRes.text()}`);
    const imgJson = await imgRes.json();
    const respParts = imgJson?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = respParts.find((p: any) => p?.inline_data?.data || p?.inlineData?.data);
    const b64: string | undefined = imgPart?.inline_data?.data ?? imgPart?.inlineData?.data;
    if (!b64) throw new Error("IA não retornou imagem POV");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const verticalPath = `${scene.project_id}/animal-tour/${crypto.randomUUID()}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("scene-assets")
      .upload(verticalPath, bytes, { contentType: "image/png", upsert: false });
    if (upErr) throw upErr;

    // ============== FUNÇÃO 2: analisar imagem final + gerar prompt final em inglês ==============
    const generatedInline: { data: string; mime_type: string } = { data: b64, mime_type: "image/png" };

    const analysisPrompt = `You are analyzing a vertical 9:16 first-person POV image where a body-mounted camera is attached to an animal's upper back (near shoulders and neck), pointing forward inside an interior environment.

Look at the attached image and produce a final prompt to turn this exact image into a 5-second photorealistic video of the animal walking through the room while the body-mounted camera moves with it.

Identify in the image:
- Which animal it is and which body parts are visible in the foreground (upper back, shoulders, neck, ears, mane, etc).
- What kind of environment it is and what objects/obstacles surround the animal.
- The clear, walkable free path the animal should follow (straight, gentle left, gentle right, curve around, stop before something).
- Real visual landmarks of the room that the camera will pass (e.g. "pass to the left of the coffee table", "follow the open floor toward the staircase", "avoid the dining chairs on the right").

Return EXACTLY this structure in English, with the three labeled blocks separated by the markers below — no markdown, no extra text:

===FINAL PROMPT===
<a single rich English paragraph for a video generator (Veo / Sora / Kling, vertical 9:16, ~5 seconds). It MUST:
- Describe the shot as photorealistic, immersive, natural, body-mounted animal POV.
- State explicitly: the camera is mounted on the animal's upper back, very close to the shoulders and neck, like a GoPro attached to a harness; the camera is part of the animal's body; the camera is NOT floating, NOT behind the animal, NOT a third-person camera.
- State that only upper back, shoulders, neck base, ears and mane (or equivalent visible features) appear in the foreground; the visible body stays nearly stable in the lower foreground while the environment moves around it.
- Camera angle slightly low and forward-facing, looking at the environment (not too much ceiling).
- Animal walks naturally: realistic weight, subtle body-mounted bounce, gentle head/body motion, no exaggerated shaking.
- Realistic scale; the animal physically respects the environment (no touching, no clipping, no walking over furniture).
- Audio: soft ambient music matching the chosen mood + SUBTLE natural animal foley in the foreground (calm rhythmic breathing, light paw/footstep sounds on the matching floor material, occasional fur/collar rustle). NEVER barking, growling, loud meowing, roaring, howling or any aggressive vocalization. No human voice, no narration.
- Describe the chosen walking route using REAL visual landmarks from the image.
- End with: no people, no text, no logo, no watermark.>

===NEGATIVE PROMPT===
floating camera, camera behind the animal, third-person view, drone shot, human perspective, full animal visible, tail visible, rear legs visible, hips visible, long back visible, camera detached from animal, camera looking too much at the ceiling, unrealistic scale, clipping through objects, touching furniture, warped room, distorted furniture, excessive shaking, jump cuts, barking, growling, loud animal vocalization, human voice, narration, text, logo, watermark

===ROUTE SUMMARY===
<2-4 short English sentences explaining the chosen walking path through this specific room, naming the real obstacles avoided.>`;

    const musicLine = MUSIC_PRESETS[data.musicMood];
    const raw = await chat(
      [
        {
          role: "user",
          content: [
            { type: "text", text: analysisPrompt + `\n\nMusic mood reference (already in Portuguese, translate naturally to a short English audio line inside FINAL PROMPT): ${musicLine}` },
            { type: "image_url", image_url: { url: `data:${generatedInline.mime_type};base64,${generatedInline.data}` } },
          ],
        },
      ],
      "google/gemini-3-flash-preview",
      0.7,
    );

    function block(name: string) {
      const re = new RegExp(`===${name}===([\\s\\S]*?)(?====|$)`, "i");
      const m = raw.match(re);
      return m ? m[1].trim() : "";
    }
    const finalPrompt = block("FINAL PROMPT");
    const negativePrompt = block("NEGATIVE PROMPT");
    const routeSummary = block("ROUTE SUMMARY");
    if (!finalPrompt) throw new Error("IA não retornou FINAL PROMPT");

    await supabaseAdmin
      .from("scenes")
      .update({
        generated_character_image: verticalPath,
        image_prompt: imagePrompt,
        video_prompt: finalPrompt,
        negative_prompt: negativePrompt || null,
        route_summary: routeSummary || null,
        scene_mode: "animal_tour",
        status: "gerado",
        model_used: modelUsed,
      })
      .eq("id", data.sceneId);

    return { vertical_image: verticalPath, final_prompt: finalPrompt, negative_prompt: negativePrompt, route_summary: routeSummary };
  });

