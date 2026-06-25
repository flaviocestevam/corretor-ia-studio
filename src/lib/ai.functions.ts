import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

    const visionRule = imageDataUrl
      ? `\nVOCÊ ESTÁ VENDO A FOTO REAL DO CÔMODO em anexo. Use a imagem APENAS como pano de fundo emocional para entender a sensação do espaço. NÃO transforme o hook em descrição técnica de móveis, materiais, acabamentos ou decoração. É proibido inventar itens que não estão na imagem.`
      : "";

    const hookCraftRules = `
NOVA LÓGICA OBRIGATÓRIA DOS HOOKS (primeiros 5 segundos do Reel — abertura forte para parar o scroll):
- O hook NÃO é descrição do cômodo. O hook é uma frase de ABERTURA emocional, confiante, sedutora, elegante e aspiracional dita pelo(a) corretor(a) olhando para a câmera.
- Foco principal: emoção, desejo, sonho, conquista, status, pertencimento, sensação de morar ali e personalidade do(a) corretor(a). O ambiente é apenas pano de fundo para a promessa emocional.
- Tom 100% adaptado à personalidade e ao jeito de falar do personagem, mas sempre com presença comercial forte. Se o personagem for popular, mantenha desejo e sonho acessível; se for premium, use refinamento; se for jovem, use energia; se for técnico, transforme oportunidade em emoção.
- PROIBIDO descrever tecnicamente o ambiente: não listar móveis, acabamentos, medidas, materiais, iluminação, layout, bancada, piso, armários, janela, decoração, vista ou itens físicos como foco da frase.
- PROIBIDO começar com frases fracas/descritivas: "Olha esse cômodo", "Essa sala", "Aqui temos", "Repare nesse", "Esse ambiente", "Vem conhecer", "Bem-vindo", "Olha que lindo", "Que espaço incrível".
- Permitido mencionar o espaço de forma emocional e ampla, sem técnica: "um lugar assim", "aqui", "esse padrão", "essa sensação", "essa vida", "esse endereço", "esse cenário".
- Exemplos do nível de IMPACTO exigido (NÃO copie literalmente; crie variações melhores e adaptadas ao personagem):
  • "Você merece acordar todos os dias num lugar assim..."
  • "Imagina receber seus amigos aqui? Esse é o padrão que você vai viver."
  • "Esse é o tipo de refinamento que muda a sua vida."
  • "Tem imóvel que você visita. E tem lugar que faz você se enxergar morando nele."
  • "Se a sua próxima fase tivesse um cenário, talvez fosse esse aqui."
- Cada hook DEVE vir com uma AÇÃO FÍSICA SUTIL e cinematográfica no campo "action" (olhar firme para a câmera, sorriso de canto, passo lento entrando no ambiente, gesto leve com a mão, pausa antes da frase, encostar discretamente em um ponto do espaço sem descrevê-lo).
- O campo "text" deve ter no máximo 18 palavras, soar falado em português brasileiro natural e funcionar como os PRIMEIROS 5 SEGUNDOS do vídeo.
- Respeite 100% a personalidade, jeito de falar e bordões do personagem, mas nunca sacrifique a força emocional do hook.`;

    const hookSystemPrompt = `Você gera apenas hooks de abertura para vídeos imobiliários. Nunca escreva descrição técnica do ambiente. O hook deve vender desejo, emoção e identidade do corretor nos primeiros 5 segundos. Use o cômodo só como pano de fundo emocional.`;
    const prompt = data.isFirstScene
      ? `Você é roteirista sênior de Reels imobiliários. Personagem: "${char.name}".
Personalidade: ${char.personality}
Jeito de falar: ${char.speaking_style}
Bordões: ${(char.catchphrases as string[])?.join(" | ")}
Hooks de referência do personagem: ${JSON.stringify(baseHooks)}
${visionRule}
${hookCraftRules}

Gere EXATAMENTE 3 opções de HOOK DE ABERTURA (primeira cena) para um vídeo gravado no cômodo "${data.roomName}".
IMPORTANTE: não descreva o cômodo. Use "${data.roomName}" apenas para sentir o contexto; a frase precisa vender emoção, desejo e personalidade do corretor.
As 3 opções devem ter ÂNGULOS EMOCIONAIS DIFERENTES entre si:
1) merecimento / sonho de viver ali;
2) projeção social / receber pessoas / nova fase;
3) refinamento / oportunidade / desejo aspiracional.
Nunca gere 3 variações da mesma ideia.

Responda APENAS com JSON array no formato:
[{"text":"...","action":"descrição da ação física sutil do corretor durante a fala","duration":4}, ...]`
      : `Você é roteirista sênior de Reels imobiliários. Personagem: "${char.name}".
Personalidade: ${char.personality}
Jeito de falar: ${char.speaking_style}
Cena anterior terminou com: "${data.previousSceneScript ?? ""}"
Cômodo atual: "${data.roomName}"
${visionRule}
${hookCraftRules}

Gere 3 HOOKS DE CONTINUAÇÃO curtos (~5s) que conectem com a cena anterior MANTENDO tom confiante, sedutor, elegante, desejável e emocional.
IMPORTANTE: não descreva tecnicamente o cômodo atual. Não fale de móveis, acabamentos, layout ou materiais. Use o espaço apenas como pano de fundo para criar expectativa, desejo e personalidade.
Exemplos de força: "E eu achei que já tinha te impressionado…", "Agora imagina viver essa próxima parte todos os dias.", "Respira fundo, porque essa sensação aqui muda o jogo.", "Se você sentiu algo lá atrás, espera até ver essa fase.". Cada um com ação física sutil diferente.

Responda APENAS com JSON array:
[{"text":"...","action":"descrição da ação física sutil do corretor durante a fala","duration":4}, ...]`;

    const userContent: ChatPart[] = [{ type: "text", text: prompt }];
    if (imageDataUrl) userContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
    const raw = await chat([
      { role: "system", content: hookSystemPrompt },
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

    const framingMap: Record<string, string> = {
      auto: `ESCOLHA AUTOMÁTICA: você decide o melhor enquadramento (selfie POV próximo, meio corpo, corpo inteiro ou plano aberto wide) considerando: cômodo "${scene.room_name}", ação do personagem (${action}), e o que dá mais impacto visual num Reel vertical. Varie entre cenas para evitar monotonia.`,
      selfie: "SELFIE / POV próximo (OBRIGATÓRIO RESPEITAR): câmera na altura do rosto, a ~40-60cm do personagem, mostrando cabeça, ombros e parte do peito — NUNCA cortar a testa nem o queixo. O personagem segura o celular (POV de quem grava). Cômodo aparece desfocado ao fundo. Cabeça ocupa ~50-60% da altura do quadro, centralizada. Equilíbrio: rosto nítido em primeiro plano + sugestão clara do ambiente desfocado atrás (não tela preta, não fundo neutro).",
      meio_corpo: "MEIO CORPO (OBRIGATÓRIO RESPEITAR — enquadramento escolhido pelo usuário): câmera a ~1,8-2,2m de distância, na altura do peito do personagem, enquadrando da CINTURA (ou um pouco abaixo, na altura do quadril) PARA CIMA, mostrando cabeça inteira, tronco, braços e mãos. NUNCA corte a cabeça, o topo da cabeça, os ombros ou as mãos. Personagem ocupa ~55-65% da altura do quadro, centralizado horizontalmente (ou em terço da composição). EQUILÍBRIO COM O AMBIENTE: o cômodo precisa aparecer claramente em volta e atrás do personagem (paredes, móveis, janelas visíveis e reconhecíveis nas laterais e atrás), de forma que o espectador veja AO MESMO TEMPO o corretor e onde ele está. Pessoa proporcional ao ambiente, sem parecer gigante nem espremida.",
      corpo_inteiro: "CORPO INTEIRO (OBRIGATÓRIO RESPEITAR — enquadramento escolhido pelo usuário): câmera a ~3-4m de distância, mostrando o personagem INTEIRO dentro do cômodo, DA CABEÇA AOS PÉS, com os pés visíveis tocando o chão. NUNCA corte a cabeça, os pés, as mãos nem nenhum membro. Personagem ocupa ~65-80% da ALTURA do quadro (não mais que isso). Sobra espaço acima da cabeça (mostrando teto/parede superior) e abaixo dos pés (mostrando piso), além de espaço nas laterais mostrando móveis e parede do cômodo. EQUILÍBRIO COM O AMBIENTE: a pessoa precisa estar PROPORCIONAL ao cômodo (altura humana ~1,70-1,80m comparada a portas ~2,10m, móveis, janelas) e bem POSICIONADA visualmente — em um ponto onde caiba o corpo todo sem encostar em parede, móvel ou borda do quadro. Centralizada ou em terço da composição, com o cômodo respirando ao redor.",
      plano_aberto: "PLANO ABERTO / WIDE (tour imobiliário — OBRIGATÓRIO RESPEITAR): câmera AFASTADA a ~5-7m do personagem, lente grande angular 24mm, posicionada de um canto do cômodo. O personagem aparece PEQUENO e DISTANTE, ocupando NO MÁXIMO 25-35% da altura do quadro (estilo pessoa fotografada de longe num ambiente grande), porém SEMPRE INTEIRO (cabeça aos pés visíveis, nada cortado). NUNCA cole o personagem na câmera. O cômodo inteiro (paredes, teto, móveis) precisa dominar a composição — o personagem é um detalhe humano dentro do espaço, não o protagonista visual.",
    };
    const framingKey = (scene as any).camera_framing ?? "corpo_inteiro";
    const framingInstruction = framingMap[framingKey] ?? framingMap.corpo_inteiro;

    const hookPool = [
      `${char.name} entra em cena com presença magnética, confiança e carisma comercial, conduzindo o olhar para o imóvel sem tocar nem transformar o ambiente real.`,
      `Com postura segura e expressão envolvente, ${char.name} apresenta o espaço como uma oportunidade desejável, mantendo cada detalhe original do cômodo intacto.`,
      `${char.name} surge no ambiente com naturalidade de visita imobiliária real, gesto sutil e olhar confiante, criando desejo pela propriedade sem alterar o cenário.`,
      `Olhar marcante e movimento elegante: ${char.name} transforma a visita em uma cena comercial forte, usando apenas sua presença — nunca mudanças no cômodo.`,
    ];
    const hook = hookPool[Math.floor(Math.random() * hookPool.length)];

    const absoluteRoomPreservationRule = `IMAGEM 1 é a referência ABSOLUTA e IMUTÁVEL do cômodo. Copie fielmente TODOS os detalhes: layout exato, posição de todos os móveis, cores das paredes, piso, teto, iluminação, janelas, cortinas, decoração e vista. NÃO INVENTE NADA. NÃO MUDE NADA no ambiente. Apenas coloque o corretor dentro desse espaço exato.`;

    const imagePrompt = `🚨🚨🚨 PRIORIDADE MÁXIMA / PESO MÁXIMO / REGRA INQUEBRÁVEL #0 — PRESERVAÇÃO ABSOLUTA DA IMAGEM 1 🚨🚨🚨
${absoluteRoomPreservationRule}

TAREFA CORRETA: edição fotográfica/inserção de pessoa sobre a IMAGEM 1. NÃO é criação livre de cenário. Use a IMAGEM 1 como CANVAS BASE. Preserve todos os pixels, formas, objetos, linhas, cores, luz, sombras, textura, profundidade, perspectiva e vista do cômodo, exceto a pequena área fisicamente ocupada pelo corpo do corretor e sua sombra realista.

SE HOUVER CONFLITO ENTRE qualquer instrução estética, cinematográfica, comercial, enquadramento, pose ou personagem E a preservação da IMAGEM 1, a preservação da IMAGEM 1 SEMPRE vence. É melhor gerar uma imagem menos cinematográfica do que alterar um único detalhe do cômodo.

NEGATIVO ABSOLUTO: não redesenhar o cômodo, não reinterpretar decoração, não trocar móveis, não reorganizar objetos, não corrigir arquitetura, não ampliar janela, não mudar vista, não adicionar luxo, não remover simplicidade, não mudar lente/perspectiva do ambiente, não mudar iluminação, não trocar materiais, não limpar, não preencher espaços vazios, não completar objetos, não inventar nada.

🎬 HOOK COMERCIAL (tom cinematográfico da cena — NÃO modifica o cômodo, só guia a presença do personagem):
${hook} O acabamento comercial deve vir APENAS da presença, pose, expressão e integração realista do personagem. A iluminação usada no personagem deve se adaptar à luz já existente na IMAGEM 1. NÃO crie nova iluminação no cômodo.

IMAGEM 1 = FOTO ORIGINAL E IMUTÁVEL DO CÔMODO (cenário fixo, intocável, sagrado).
${refsDescription}

⚠️ REGRA SUPREMA — PRESERVAÇÃO TOTAL DO CÔMODO (descumprir = imagem REJEITADA):
${absoluteRoomPreservationRule}

A IMAGEM 1 é a foto ORIGINAL do imóvel real que está sendo vendido. Você DEVE manter 100% EXATO o mesmo ambiente, pixel a pixel no que diz respeito ao espaço:
- Layout idêntico (mesma planta, mesma perspectiva, mesmo ângulo da câmera original).
- Móveis idênticos (mesmos sofás, camas, mesas, cadeiras, armários, eletrodomésticos, louças, espelhos, quadros, tapetes, cortinas, vasos, objetos de decoração — nas MESMAS posições).
- Paredes idênticas (mesma cor, mesma textura, mesmo revestimento, mesmos rodapés, mesmas tomadas e interruptores).
- Piso idêntico (mesmo material, mesma cor, mesmo padrão, mesmas juntas).
- Teto idêntico (mesma altura, mesmas luminárias, mesmo acabamento).
- Janelas e portas idênticas (mesmo tamanho, mesma posição, mesma vista pela janela).
- Iluminação idêntica (mesma temperatura de cor, mesmas sombras, mesma direção da luz natural e artificial).
- Cores e decoração idênticas.

É TERMINANTEMENTE PROIBIDO: adicionar móveis, remover móveis, mover móveis, trocar acabamentos, mudar a cor das paredes, mudar o piso, mudar a iluminação, mudar a vista da janela, redecorar, "melhorar", "valorizar", "luxuosizar" ou "estilizar" o ambiente. NÃO invente cristaleira, lustre, plantas, quadros, tapetes, mármore, marcenaria, LED ou qualquer item que NÃO esteja visível na IMAGEM 1. Se o cômodo for simples ou vazio, mantenha simples ou vazio. Se houver bagunça, objeto simples, parede vazia, piso comum, cortina simples ou vista comum, mantenha exatamente assim. O CLIMA cinematográfico vem da PRESENÇA do personagem e do enquadramento, NUNCA da modificação do cenário. Isto vale para QUALQUER tipo de cômodo: sala, cozinha, quarto, banheiro, lavabo, varanda, área de serviço, escritório, closet, garagem, hall, área externa.

Sua ÚNICA modificação permitida é INSERIR o personagem dentro desse cômodo original, como se ele tivesse entrado ali no momento da foto.

REGRAS DO PERSONAGEM (descrição consistente e canônica em TODAS as cenas):
1. Insira "${char.name}" dentro do cômodo de forma 100% fotorrealista, integrado com a iluminação, sombras e perspectiva ORIGINAIS da IMAGEM 1. Pele com textura real, fios de cabelo definidos, olhar vivo, expressão sedutora e confiante de corretor(a) de alto padrão.
2. Roupa: copie EXATAMENTE a roupa da imagem marcada como "ROUPA ATIVA" (cor, corte, tecido, acessórios, calçado). Ignore roupas das outras imagens de referência.
3. Rosto e proporções: combine fielmente as imagens marcadas como "ROSTO FRONTAL" e "CORPO INTEIRO" para manter a MESMA identidade física (mesmo rosto, mesmos traços, mesmo cabelo, mesma altura, mesmo tipo físico) em todas as cenas — sem variações entre cenas.
4. Descrição visual canônica adicional: ${char.canonical_prompt ?? char.personality}
5. Pose / ação na cena: ${action} — executada com naturalidade, carisma e elegância comercial.
6. Expressão coerente com a personalidade: ${char.personality}. Linguagem corporal de quem vende um sonho: confiança, charme, olhar magnético.
7. ENQUADRAMENTO DE CÂMERA (OBRIGATÓRIO seguir à risca o tipo escolhido pelo usuário — não mudar, não interpretar, não substituir por outro plano): ${framingInstruction}
   REGRA UNIVERSAL DE ENQUADRAMENTO E EQUILÍBRIO (vale para QUALQUER plano acima): a pessoa deve estar BEM ENQUADRADA, com PROPORÇÃO CORRETA em relação ao ambiente, SEM CORTAR partes do corpo desnecessariamente (nunca cortar cabeça, rosto, mãos ou pés a menos que o tipo de plano exija explicitamente — selfie pode mostrar só rosto/ombros; meio corpo NUNCA corta cabeça nem mãos; corpo inteiro e plano aberto NUNCA cortam cabeça nem pés), e EQUILIBRADA visualmente dentro do cômodo (centralizada ou em terço, com respiro ao redor, sem encostar nas bordas do quadro, sem ficar espremida em um canto, sem sobrepor móvel). O enquadramento descreve a DISTÂNCIA do personagem, MAS a perspectiva, ângulo e composição do CÔMODO devem permanecer iguais aos da IMAGEM 1 — não refaça a foto do ambiente por outro ângulo, apenas posicione o personagem dentro do ambiente original respeitando o plano escolhido.
8. POSICIONAMENTO REALISTA: escolha um ponto do chão que exista de verdade na IMAGEM 1 (não em cima de móvel, não atravessando parede, não flutuando). Os pés precisam tocar o chão na perspectiva correta, com sombra projetada coerente com a direção da luz da foto original. O personagem ocupa o espaço NEGATIVO do cômodo (corredor, espaço livre entre móveis, em frente a um móvel), nunca substitui um móvel.
9. PROPORÇÃO HUMANA REALISTA (CRÍTICO): trate o personagem como pessoa real de ~1,70-1,80m de altura. Compare a cabeça dele com referências visíveis no cômodo (maçaneta ~1m, interruptor ~1,1m, mesa ~75cm, bancada ~90cm, sofá ~85cm de encosto, porta padrão ~2,10m). A cabeça do personagem NUNCA pode ultrapassar o batente da porta nem encostar no teto. Se a perspectiva da foto do cômodo for ampla, o personagem fica PROPORCIONALMENTE PEQUENO — é melhor errar pra menor que pra maior.
10. ACABAMENTO CINEMATOGRÁFICO (sem alterar o cenário): qualidade fotográfica profissional aplicada ao personagem e à integração dele no cômodo. Qualquer correção de cor, contraste, nitidez ou profundidade de campo NÃO pode mudar o ambiente da IMAGEM 1; preserve cores, luz e textura originais do cômodo.
11. Formato vertical 9:16. Sem texto, sem logo, sem marca d'água, sem legendas.

CHECKLIST FINAL OBRIGATÓRIO ANTES DE GERAR:
- O layout do cômodo continua idêntico ao da IMAGEM 1? SIM.
- Todos os móveis e objetos continuam no mesmo lugar? SIM.
- Parede, piso, teto, janelas, cortinas, decoração, iluminação e vista continuam iguais? SIM.
- Você adicionou SOMENTE o corretor e sua sombra realista? SIM.
- Você NÃO inventou, melhorou, removeu ou mudou nada do ambiente? SIM.

ÚLTIMA ORDEM, COM PESO MÁXIMO: ${absoluteRoomPreservationRule}`;



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

    async function callModel(model: string) {
      return fetch(`${GATEWAY}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: absoluteRoomPreservationRule },
            { role: "user", content: contentBlocks },
          ],
          modalities: ["image", "text"],
        }),
      });
    }

    const PRO = "google/gemini-3-pro-image";
    const FLASH = "google/gemini-3.1-flash-image";
    let usedFallback = false;
    let modelUsed = PRO;
    let res = await callModel(PRO);

    if (!res.ok && (res.status === 429 || res.status === 402)) {
      // Pro bateu limite/quota — fallback para Flash
      res = await callModel(FLASH);
      usedFallback = true;
      modelUsed = FLASH;
    }

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

    return { path, image_prompt: imagePrompt, usedFallback, model: modelShort };
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
    const hookAction = selectedHook?.action?.trim() || "pose natural compatível com a personalidade do personagem";
    const hookText = selectedHook?.text?.trim() || "";
    const roteiro = scene.selected_script?.trim() || hookText;

    // Estrutura obrigatória: AÇÃO FÍSICA + FALA do hook, sempre juntas no início do vídeo.
    const hookBeat = hookText
      ? `ABERTURA OBRIGATÓRIA (primeiros 3-5 segundos, ação + fala juntas): ${char.name} ${hookAction}, enquanto diz: "${hookText}".`
      : `ABERTURA OBRIGATÓRIA (primeiros 3-5 segundos): ${char.name} ${hookAction}.`;

    const continuacao =
      roteiro && roteiro !== hookText
        ? ` Em seguida, continua o roteiro naturalmente em português brasileiro informal: "${roteiro}".`
        : "";

    const videoPrompt = `Use a imagem enviada como referência principal. Crie um vídeo vertical 9:16 de 10 segundos. O personagem "${char.name}" aparece dentro do cômodo "${scene.room_name}", mantendo o ambiente exatamente igual à imagem (sem alterar móveis, paredes, piso, iluminação ou decoração).

${hookBeat}${continuacao}

A AÇÃO FÍSICA descrita acima ("${hookAction}") deve ser executada de forma clara e visível, sincronizada com a fala — nunca omita o gesto, movimento ou olhar do hook. Personalidade do personagem: ${char.personality}. Expressão coerente com essa personalidade. Movimento natural de câmera, estilo Reels/TikTok, fotorrealista.`;

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
