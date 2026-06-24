import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function key() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY ausente");
  return k;
}

async function chat(
  messages: Array<{ role: string; content: string }>,
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

    // Buscar a cena atual + TODAS as cenas anteriores do mesmo projeto, pra
    // a IA enxergar o histórico inteiro e NÃO repetir falas de outras cenas.
    const { data: currentScene } = await supabaseAdmin
      .from("scenes")
      .select("project_id, scene_order, script_options")
      .eq("id", data.sceneId)
      .single();

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

    const prompt = `Você é roteirista de Reels imobiliários verticais 9:16.
Personagem: "${char.name}"
Personalidade: ${char.personality}
Jeito de falar: ${char.speaking_style}
Bordões: ${(char.catchphrases as string[])?.join(" | ")}
CTAs do personagem: ${ctas}

CENA ATUAL: cômodo "${data.roomName}" (cena nº ${currentScene?.scene_order ?? "?"})
Hook escolhido para ESTA cena: "${data.selectedHook}"

${historyBlock}${avoidBlock}

${data.isLastScene ? "Esta é a ÚLTIMA cena: termine com CTA FORTE mandando pro link da bio." : "Cena intermediária: termine com CTA curto OU gancho pra próxima."}

REGRAS DE CONTEÚDO (CRÍTICO):
- O roteiro precisa comentar algo ESPECÍFICO do cômodo "${data.roomName}" (ex: cozinha → bancada/fogão/armário; quarto → cama/closet/janela; banheiro → chuveiro/bancada). NÃO use frases genéricas que serviriam pra qualquer cômodo.
- NÃO copie estrutura nem comparações das cenas anteriores. Cada cena tem que soar como um novo momento do tour.
- As 3 opções devem ser DIFERENTES ENTRE SI (ângulos, emoções e palavras distintas), não 3 variações da mesma frase.

REGRAS DE DURAÇÃO (OBRIGATÓRIAS):
- Máximo 10s de fala, máximo 25 palavras (hook + comentário + CTA).
- Comece COM o hook escolhido exatamente como está, depois 1 frase curta sobre algo concreto do "${data.roomName}", depois CTA curto.
- Sem introduções nem narração extra.

PROIBIDO: "excelente oportunidade", "empreendimento diferenciado", "alto padrão" genérico, "venha conhecer", "imóvel dos sonhos", "localização privilegiada" sem contexto.
USE: pra, tá, olha isso, isso aqui, calma, vou falar a verdade.

Responda APENAS com JSON array de 3 strings DISTINTAS:
["roteiro 1", "roteiro 2", "roteiro 3"]`;


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

    const framingMap: Record<string, string> = {
      auto: `ESCOLHA AUTOMÁTICA: você decide o melhor enquadramento (selfie POV próximo, meio corpo, corpo inteiro ou plano aberto wide) considerando: cômodo "${scene.room_name}", ação do personagem (${action}), e o que dá mais impacto visual num Reel vertical. Varie entre cenas para evitar monotonia.`,
      selfie: "SELFIE / POV próximo: câmera na altura do rosto, a ~40-60cm do personagem, mostrando cabeça, ombros e parte do peito. O personagem segura o celular (POV de quem grava). Cômodo aparece desfocado ao fundo. Cabeça ocupa ~50-60% da altura do quadro.",
      meio_corpo: "MEIO CORPO: câmera a ~1,5m de distância, na altura do peito, enquadrando da cintura para cima. Personagem ocupa ~60% da altura do quadro. Equilibra personagem e ambiente.",
      corpo_inteiro: "CORPO INTEIRO: câmera a ~3m de distância, mostrando o personagem inteiro dentro do cômodo, dos pés à cabeça. Personagem ocupa ~70-80% da ALTURA do quadro (NÃO mais que isso). Sobra espaço acima da cabeça e abaixo dos pés mostrando teto e piso reais do cômodo.",
      plano_aberto: "PLANO ABERTO / WIDE (tour imobiliário): câmera AFASTADA a ~5-7m do personagem, lente grande angular 24mm, posicionada de um canto do cômodo. O personagem aparece PEQUENO e DISTANTE, ocupando NO MÁXIMO 25-35% da altura do quadro (estilo pessoa fotografada de longe num ambiente grande). NUNCA cole o personagem na câmera. O cômodo inteiro (paredes, teto, móveis) precisa dominar a composição — o personagem é um detalhe humano dentro do espaço, não o protagonista visual.",
    };
    const framingKey = (scene as any).camera_framing ?? "corpo_inteiro";
    const framingInstruction = framingMap[framingKey] ?? framingMap.corpo_inteiro;

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
8. ENQUADRAMENTO DE CÂMERA: ${framingInstruction}
9. PROPORÇÃO HUMANA REALISTA (CRÍTICO): trate o personagem como pessoa real de ~1,70-1,80m de altura. Compare a cabeça dele com referências visíveis no cômodo (maçaneta ~1m, interruptor ~1,1m, mesa ~75cm, bancada ~90cm, sofá ~85cm de encosto, porta padrão ~2,10m). A cabeça do personagem NUNCA pode ultrapassar o batente da porta nem encostar no teto. Se a perspectiva da foto do cômodo for ampla, o personagem fica PROPORCIONALMENTE PEQUENO — é melhor errar pra menor que pra maior. Pés tocando o chão na perspectiva correta, sombra coerente com a iluminação do ambiente.
10. Formato vertical 9:16. Sem texto, sem logo, sem marca d'água.`;


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
