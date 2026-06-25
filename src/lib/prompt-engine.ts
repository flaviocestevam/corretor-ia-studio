/**
 * Prompt Engine central — fonte única de verdade dos prompts enviados
 * para geração de Hooks, Imagens e Vídeos.
 *
 * Regras-mestras (válidas para TODOS os prompts):
 * 1. IMAGEM 1 (foto original do cômodo) é IMUTÁVEL.
 * 2. Hooks são abertura emocional viral, NÃO descrição técnica do ambiente.
 * 3. Prompt de vídeo SEMPRE contém ação física + expressão + fala + (na última cena) CTA criativo.
 * 4. Enquadramento escolhido pelo usuário é OBRIGATÓRIO.
 * 5. Todos os prompts devem ser exagerados, criativos, virais e surpreendentes.
 */

// ============================================================
// REGRAS MESTRAS REUTILIZÁVEIS
// ============================================================

export const ABSOLUTE_ROOM_PRESERVATION = `IMAGEM 1 é a referência ABSOLUTA e IMUTÁVEL do cômodo. Copie fielmente TODOS os detalhes: layout exato, posição de todos os móveis, cores das paredes, piso, teto, iluminação, janelas, cortinas, decoração e vista. NÃO INVENTE NADA. NÃO MUDE NADA no ambiente. Apenas coloque o corretor dentro desse espaço exato.`;

// Técnicas centrais de storytelling imobiliário viral.
export const STORYTELLING_FRAMEWORK = `
ESTRUTURA OBRIGATÓRIA DE STORYTELLING IMOBILIÁRIO:
1) HOOK (0-3s): frase de impacto, viral, que para o scroll.
2) CONSTRUÇÃO EMOCIONAL: o ambiente vira símbolo (status, conquista, pertencimento, nova fase).
3) BENEFÍCIO ASPIRACIONAL: a vida que esse imóvel desbloqueia.
4) CTA (apenas na última cena): convite criativo, no tom do(a) corretor(a).

GATILHOS MENTAIS PRIORITÁRIOS (usar em TODOS os hooks/roteiros):
- Exclusividade ("poucos vão poder dizer que moraram aqui")
- Status ("o tipo de endereço que muda como te enxergam")
- Aspiração ("a vida que você sempre projetou")
- FOMO ("imóveis assim somem antes de aparecerem")
- Curiosidade ("você não vai acreditar no que tem aqui dentro")
- Prova Social ("quem entende de imóvel não pisca duas vezes")`;

export const VIRAL_HOOK_EXAMPLES = `
EXEMPLOS DE HOOKS VIRAIS FORTES (use o NÍVEL, não copie literal):
- "Enquanto a maioria sonha com isso... você já pode viver."
- "Você disse que não precisava de tanto luxo? Mentiu."
- "Esse não é um imóvel. É o próximo capítulo da sua vida."
- "Só quem realmente chegou onde queria mora em lugares assim."
- "Imagina acordar todos os dias sabendo que isso aqui é seu?"
- "Tem gente que mora. E tem gente que VIVE — sente a diferença."
- "Esse aqui não tá no mercado por acaso. Tá esperando a pessoa certa."

EXEMPLOS DE HOOKS POR PERSONALIDADE (ADAPTE ao personagem atual):
- Fashionista: "Styling de vida não se discute. Se apresenta."
- Irônica: "Dinheiro não compra felicidade? Conta outra pra quem mora aqui."
- Refinada: "Alguns lugares simplesmente elevam quem vive neles."
- Popular/acessível: "Bora ver de pertinho o que esse aqui te oferece — e por que vale cada centavo."
- Jovem/energética: "Para tudo. Esse aqui mudou meu dia — e pode mudar o seu."
- Técnica/consultiva: "Quem investe de verdade reconhece isso em 5 segundos. Olha o porquê."`;

export const HOOK_SYSTEM_PROMPT = `Você é roteirista viral de Reels imobiliários verticais (TikTok/Reels). Sua única missão: gerar HOOKS de abertura (primeiros 3-5 segundos) extremamente impactantes, criativos, surpreendentes, com gatilhos mentais fortes (Exclusividade, Status, Aspiração, FOMO, Curiosidade, Prova Social). Nunca descreva tecnicamente o ambiente — use-o como pano de fundo emocional. Sempre devolva, junto com o texto, uma AÇÃO FÍSICA SUTIL e cinematográfica + EXPRESSÃO FACIAL do(a) corretor(a) (gesto, olhar, passo, pausa, sorriso de canto, olhar firme). Essa ação + expressão serão obrigatoriamente reutilizadas no prompt de imagem e de vídeo. Adapte SEMPRE ao estilo e personalidade do(a) corretor(a) — fashionista, irônica, refinada, popular, jovem, técnica etc.`;

export const HOOK_CRAFT_RULES = `
REGRAS OBRIGATÓRIAS DOS HOOKS (abertura forte para parar o scroll):
- O hook NÃO é descrição do cômodo. É uma frase de ABERTURA viral, confiante, sedutora, aspiracional.
- Use SEMPRE pelo menos 1 gatilho mental (Exclusividade, Status, Aspiração, FOMO, Curiosidade, Prova Social).
- Adapte o tom à personalidade do personagem: fashionista (styling), irônica (provoca), refinada (eleva), popular (acessível), jovem (energia), técnica (oportunidade emocionada).
- PROIBIDO descrever tecnicamente o ambiente (móveis, acabamentos, medidas, materiais, layout, bancada, piso, armários, janela, decoração, vista).
- PROIBIDO começar com: "Olha esse cômodo", "Essa sala", "Aqui temos", "Repare nesse", "Esse ambiente", "Vem conhecer", "Bem-vindo", "Olha que lindo".
- PERMITIDO: "um lugar assim", "aqui", "esse padrão", "essa sensação", "essa vida", "esse endereço", "esse cenário".
- Cada hook DEVE vir com AÇÃO FÍSICA SUTIL + EXPRESSÃO no campo "action" (ex: "olhar firme pra câmera com leve sorriso de canto enquanto encosta a mão no batente da porta"). Essa ação será reutilizada na imagem e no vídeo.
- "text": até 18 palavras, falado em PT-BR natural, funcional como os PRIMEIROS 3-5 SEGUNDOS do vídeo.
- Respeite personalidade, jeito de falar e bordões — sem sacrificar a força emocional.
${VIRAL_HOOK_EXAMPLES}`;

export type Framing = "auto" | "selfie" | "meio_corpo" | "corpo_inteiro" | "plano_aberto";

export const FRAMING_INSTRUCTIONS: Record<Framing, string> = {
  auto: `ESCOLHA AUTOMÁTICA: decida o melhor enquadramento (selfie, meio corpo, corpo inteiro ou plano aberto) considerando o cômodo e a ação. Varie entre cenas.`,
  selfie: `SELFIE / POV próximo (OBRIGATÓRIO): câmera a ~40-60cm do rosto, cabeça e ombros visíveis, NUNCA cortar testa nem queixo. Cômodo aparece desfocado ao fundo (não tela preta).`,
  meio_corpo: `MEIO CORPO (OBRIGATÓRIO — escolhido pelo usuário): câmera a ~1,8-2,2m, enquadrando da cintura PARA CIMA. NUNCA cortar cabeça, ombros ou mãos. Personagem ocupa ~55-65% da altura. EQUILÍBRIO: cômodo aparece claramente em volta (paredes, móveis, janelas visíveis nas laterais e atrás). Pessoa proporcional ao ambiente.`,
  corpo_inteiro: `CORPO INTEIRO (OBRIGATÓRIO — escolhido pelo usuário): câmera a ~3-4m, mostrando o personagem INTEIRO da cabeça aos pés, com pés tocando o chão. NUNCA cortar cabeça, pés, mãos. Personagem ocupa ~65-80% da altura. Sobra espaço acima da cabeça e abaixo dos pés. EQUILÍBRIO: pessoa proporcional ao cômodo (~1,70-1,80m vs portas ~2,10m).`,
  plano_aberto: `PLANO ABERTO / WIDE (OBRIGATÓRIO): câmera a ~5-7m, lente 24mm. Personagem aparece pequeno (~25-35% da altura) mas SEMPRE INTEIRO. Cômodo domina a composição.`,
};

export const FRAMING_BALANCE_RULE = `REGRA UNIVERSAL DE ENQUADRAMENTO: a pessoa deve estar BEM ENQUADRADA, PROPORCIONAL ao ambiente, SEM CORTAR partes do corpo desnecessariamente, EQUILIBRADA visualmente (centralizada ou em terço, com respiro ao redor, sem encostar nas bordas). A perspectiva e o ângulo do CÔMODO devem permanecer iguais aos da IMAGEM 1 — apenas posicione o personagem dentro.`;

// ============================================================
// BUILDERS
// ============================================================

export interface HookCharacter {
  name: string;
  personality: string;
  speaking_style: string;
  catchphrases: string[] | null | undefined;
  hooks?: Array<{ text: string; action: string }> | null;
}

export function buildHookPrompt(opts: {
  character: HookCharacter;
  roomName: string;
  isFirstScene: boolean;
  previousSceneScript?: string | null;
  hasRoomImage: boolean;
}): { system: string; user: string } {
  const { character: c, roomName, isFirstScene, previousSceneScript, hasRoomImage } = opts;
  const baseHooks = c.hooks ?? [];
  const visionRule = hasRoomImage
    ? `\nVocê está vendo a foto real do cômodo. Use APENAS como pano de fundo emocional. É proibido descrever tecnicamente ou inventar itens.`
    : "";

  const user = isFirstScene
    ? `Personagem: "${c.name}"
Personalidade: ${c.personality}
Jeito de falar: ${c.speaking_style}
Bordões: ${(c.catchphrases ?? []).join(" | ")}
Hooks de referência do personagem: ${JSON.stringify(baseHooks)}
${visionRule}
${STORYTELLING_FRAMEWORK}
${HOOK_CRAFT_RULES}

Gere EXATAMENTE 3 HOOKS DE ABERTURA VIRAIS para o cômodo "${roomName}", cada um usando um GATILHO MENTAL DIFERENTE:
1) Exclusividade OU Status (poucos têm acesso / muda como te enxergam)
2) Aspiração OU FOMO (a vida que desbloqueia / vai sumir antes de aparecer)
3) Curiosidade OU Prova Social (provoca clique / quem entende reconhece)

Cada hook deve ter ação física + expressão facial DIFERENTES. Tom adaptado à personalidade do personagem.

Responda APENAS com JSON array:
[{"text":"...","action":"ação física + expressão facial sutil do corretor durante a fala","duration":4}, ...]`
    : `Personagem: "${c.name}"
Personalidade: ${c.personality}
Jeito de falar: ${c.speaking_style}
Cena anterior terminou com: "${previousSceneScript ?? ""}"
Cômodo atual: "${roomName}"
${visionRule}
${STORYTELLING_FRAMEWORK}
${HOOK_CRAFT_RULES}

Gere 3 HOOKS DE CONTINUAÇÃO VIRAIS (~5s) que conectem com a cena anterior, cada um com um GATILHO MENTAL DIFERENTE (Exclusividade, Status, Aspiração, FOMO, Curiosidade, Prova Social). Não descreva tecnicamente o cômodo. Cada um com ação física + expressão facial DIFERENTES.

Responda APENAS com JSON array:
[{"text":"...","action":"ação física + expressão facial sutil","duration":4}, ...]`;

  return { system: HOOK_SYSTEM_PROMPT, user };
}

export interface ImagePromptOpts {
  character: {
    name: string;
    personality: string;
    canonical_prompt?: string | null;
  };
  roomName: string;
  framing: Framing;
  hookAction: string;
  refsDescription: string;
}

export function buildImagePrompt(opts: ImagePromptOpts): string {
  const framing = FRAMING_INSTRUCTIONS[opts.framing] ?? FRAMING_INSTRUCTIONS.corpo_inteiro;

  return `🚨🚨🚨 PRIORIDADE MÁXIMA — PRESERVAÇÃO ABSOLUTA DA IMAGEM 1 🚨🚨🚨
${ABSOLUTE_ROOM_PRESERVATION}

TAREFA: inserção fotorrealista, cinematográfica e viral do personagem sobre a IMAGEM 1. Use IMAGEM 1 como CANVAS BASE. Preserve TODOS os pixels do cômodo, exceto a área ocupada pelo corpo do corretor e sua sombra realista.

SE HOUVER CONFLITO entre qualquer instrução estética/comercial e a preservação da IMAGEM 1, a preservação SEMPRE vence.

NEGATIVO ABSOLUTO: não redesenhar o cômodo, não trocar móveis, não reorganizar, não corrigir arquitetura, não mudar vista, não adicionar luxo, não mudar iluminação, não inventar nada que não esteja visível na IMAGEM 1.

IMAGEM 1 = FOTO ORIGINAL E IMUTÁVEL DO CÔMODO "${opts.roomName}".
${opts.refsDescription}

PERSONAGEM:
1. Insira "${opts.character.name}" de forma 100% fotorrealista, integrado com luz, sombras e perspectiva ORIGINAIS da IMAGEM 1.
2. Roupa: copie EXATAMENTE da imagem "ROUPA ATIVA".
3. Rosto/corpo: combine "ROSTO FRONTAL" + "CORPO INTEIRO" para manter a MESMA identidade em todas as cenas.
4. Descrição canônica: ${opts.character.canonical_prompt ?? opts.character.personality}
5. AÇÃO + EXPRESSÃO FACIAL (OBRIGATÓRIO executar fielmente): ${opts.hookAction}
   — Essa ação + expressão é o frame de abertura viral do Reel. Deve transparecer o gatilho emocional do hook (confiança, sedução, ironia, descoberta, status). Sem pose neutra, sem sorriso genérico.
6. Carisma comercial coerente com a personalidade: ${opts.character.personality}.

PROMPT BASE OBRIGATÓRIO (síntese final que o modelo deve executar):
"Preservar 100% fiel a IMAGEM 1: layout, móveis, iluminação, arquitetura. NÃO alterar nada no ambiente. ${opts.character.name}, com personalidade ${opts.character.personality}, executa: ${opts.hookAction}, vestindo EXATAMENTE a roupa da imagem ROUPA ATIVA, posando dentro do ambiente. Estilo: fotorrealista, cinematográfico, viral, 8k, detalhes ricos, iluminação dramática coerente com a luz original da IMAGEM 1."

ENQUADRAMENTO (OBRIGATÓRIO seguir à risca o escolhido pelo usuário — não substituir por outro plano):
${framing}

${FRAMING_BALANCE_RULE}

POSICIONAMENTO REALISTA: pés no chão real da IMAGEM 1 (não atravessar parede, não flutuar, não sobre móvel). Sombra coerente com a luz original. Cabeça nunca ultrapassa batente de porta nem encosta no teto.

CHECKLIST FINAL:
- Layout do cômodo idêntico à IMAGEM 1? SIM.
- Móveis e objetos no mesmo lugar? SIM.
- Parede, piso, teto, janela, vista, iluminação iguais? SIM.
- Adicionou SOMENTE o corretor + sombra? SIM.
- Ação física + expressão facial do hook executadas com força cinematográfica? SIM.

ÚLTIMA ORDEM, PESO MÁXIMO: ${ABSOLUTE_ROOM_PRESERVATION}

Formato vertical 9:16. Sem texto, sem logo, sem marca d'água.`;
}

export interface VideoPromptOpts {
  characterName: string;
  characterPersonality: string;
  characterSpeakingStyle?: string;
  roomName: string;
  hookText: string;
  hookAction: string;
  fullScript: string;
  isLastScene?: boolean;
  ctas?: string[];
}

/**
 * Sempre combina AÇÃO FÍSICA + EXPRESSÃO + FALA do hook na abertura.
 * Na última cena, inclui CTA criativo no estilo do(a) corretor(a).
 */
export function buildVideoPrompt(opts: VideoPromptOpts): string {
  const action = opts.hookAction?.trim() || "pose natural compatível com a personalidade do personagem";
  const hookText = opts.hookText?.trim() || "";
  const script = opts.fullScript?.trim() || hookText;
  const isLast = !!opts.isLastScene;
  const ctaList = (opts.ctas ?? []).filter(Boolean);

  const hookBeat = hookText
    ? `ABERTURA OBRIGATÓRIA (0-5s — AÇÃO FÍSICA + EXPRESSÃO FACIAL + FALA executadas JUNTAS, sincronizadas): ${opts.characterName} ${action}, enquanto diz: "${hookText}".`
    : `ABERTURA OBRIGATÓRIA (0-5s): ${opts.characterName} ${action}.`;

  const continuation =
    script && script !== hookText
      ? ` CONSTRUÇÃO EMOCIONAL + BENEFÍCIO ASPIRACIONAL (5-9s): continua o roteiro com tom de história, criando desejo e projetando a vida que esse imóvel desbloqueia: "${script}".`
      : "";

  const ctaBlock = isLast
    ? ` CTA FINAL CRIATIVO (últimos 1-2s, OBRIGATÓRIO, no estilo do(a) corretor(a) — NÃO genérico): convite curto, viral, com gatilho de FOMO/exclusividade, coerente com a personalidade "${opts.characterPersonality}" e jeito de falar "${opts.characterSpeakingStyle ?? ""}". Use como referência um destes CTAs do personagem (adapte, não copie literal): ${ctaList.length ? ctaList.map((c) => `"${c}"`).join(" | ") : "(personagem sem CTAs cadastrados — invente um CTA curto no estilo dele)"}.`
    : ` SEM CTA nesta cena — termine com gancho natural pra próxima cena.`;

  return `Use a imagem enviada como referência principal. Crie um vídeo vertical 9:16 de 10 segundos, ESTILO REELS/TIKTOK VIRAL, fotorrealista e cinematográfico. O personagem "${opts.characterName}" aparece dentro do cômodo "${opts.roomName}", mantendo o ambiente EXATAMENTE igual à imagem (sem alterar móveis, paredes, piso, iluminação ou decoração).

ESTRUTURA DE STORYTELLING IMOBILIÁRIO (siga à risca):
${hookBeat}${continuation}${ctaBlock}

GATILHOS MENTAIS ATIVOS na entrega: Exclusividade, Status, Aspiração, FOMO, Curiosidade, Prova Social — devem transparecer no olhar, no tom de voz e nos gestos.

A AÇÃO FÍSICA descrita ("${action}") DEVE ser executada de forma clara, visível e cinematográfica, sincronizada com a fala — NUNCA omita o gesto, movimento, expressão facial ou olhar do hook. Personalidade do personagem: ${opts.characterPersonality}. Jeito de falar: ${opts.characterSpeakingStyle ?? ""}. Movimento natural de câmera (handheld sutil ou dolly leve), corte ritmado estilo Reels, áudio limpo em PT-BR.`;
}
