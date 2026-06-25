/**
 * Prompt Engine central — fonte única de verdade dos prompts enviados
 * para geração de Hooks, Imagens e Vídeos.
 *
 * Regras-mestras (válidas para TODOS os prompts):
 * 1. IMAGEM 1 (foto original do cômodo) é IMUTÁVEL.
 * 2. Hooks são abertura emocional, NÃO descrição técnica do ambiente.
 * 3. Prompt de vídeo SEMPRE contém ação física + fala do hook juntas.
 * 4. Enquadramento escolhido pelo usuário é OBRIGATÓRIO.
 */

// ============================================================
// REGRAS MESTRAS REUTILIZÁVEIS
// ============================================================

export const ABSOLUTE_ROOM_PRESERVATION = `IMAGEM 1 é a referência ABSOLUTA e IMUTÁVEL do cômodo. Copie fielmente TODOS os detalhes: layout exato, posição de todos os móveis, cores das paredes, piso, teto, iluminação, janelas, cortinas, decoração e vista. NÃO INVENTE NADA. NÃO MUDE NADA no ambiente. Apenas coloque o corretor dentro desse espaço exato.`;

export const HOOK_SYSTEM_PROMPT = `Você gera apenas hooks de abertura para vídeos imobiliários verticais (Reels/TikTok). Nunca escreva descrição técnica do ambiente. O hook deve vender desejo, emoção e identidade do corretor nos primeiros 5 segundos. Use o cômodo apenas como pano de fundo emocional. Sempre devolva, junto com o texto, uma AÇÃO FÍSICA SUTIL e cinematográfica do corretor (gesto, olhar, passo, pausa) — essa ação será usada depois no prompt de vídeo.`;

export const HOOK_CRAFT_RULES = `
NOVA LÓGICA OBRIGATÓRIA DOS HOOKS (primeiros 5 segundos do Reel — abertura forte para parar o scroll):
- O hook NÃO é descrição do cômodo. É uma frase de ABERTURA emocional, confiante, sedutora, elegante e aspiracional dita pelo(a) corretor(a) olhando para a câmera.
- Foco: emoção, desejo, sonho, conquista, status, pertencimento, sensação de morar ali e personalidade do(a) corretor(a). O ambiente é só pano de fundo da promessa emocional.
- Adapte o tom à personalidade do personagem (popular = desejo acessível; premium = refinamento; jovem = energia; técnico = oportunidade emocionada).
- PROIBIDO descrever tecnicamente o ambiente (móveis, acabamentos, medidas, materiais, iluminação, layout, bancada, piso, armários, janela, decoração, vista).
- PROIBIDO começar com: "Olha esse cômodo", "Essa sala", "Aqui temos", "Repare nesse", "Esse ambiente", "Vem conhecer", "Bem-vindo", "Olha que lindo".
- PERMITIDO mencionar o espaço de forma emocional/ampla: "um lugar assim", "aqui", "esse padrão", "essa sensação", "essa vida", "esse endereço", "esse cenário".
- Exemplos do NÍVEL de impacto (não copie literalmente):
  • "Você merece acordar todos os dias num lugar assim..."
  • "Imagina receber seus amigos aqui? Esse é o padrão que você vai viver."
  • "Esse é o tipo de refinamento que muda a sua vida."
  • "Tem imóvel que você visita. E tem lugar que faz você se enxergar morando nele."
- Cada hook DEVE vir com AÇÃO FÍSICA SUTIL no campo "action" (olhar firme, sorriso de canto, passo lento entrando, gesto leve com a mão, pausa antes da frase). Essa ação será obrigatoriamente reutilizada no prompt do vídeo.
- "text": até 18 palavras, falado em PT-BR natural, funcional como os PRIMEIROS 5 SEGUNDOS do vídeo.
- Respeite personalidade, jeito de falar e bordões — sem sacrificar a força emocional.`;

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
Hooks de referência: ${JSON.stringify(baseHooks)}
${visionRule}
${HOOK_CRAFT_RULES}

Gere EXATAMENTE 3 HOOKS DE ABERTURA para o cômodo "${roomName}" com ÂNGULOS EMOCIONAIS DIFERENTES:
1) merecimento / sonho de viver ali;
2) projeção social / receber pessoas / nova fase;
3) refinamento / oportunidade / desejo aspiracional.

Responda APENAS com JSON array:
[{"text":"...","action":"ação física sutil do corretor durante a fala","duration":4}, ...]`
    : `Personagem: "${c.name}"
Personalidade: ${c.personality}
Jeito de falar: ${c.speaking_style}
Cena anterior terminou com: "${previousSceneScript ?? ""}"
Cômodo atual: "${roomName}"
${visionRule}
${HOOK_CRAFT_RULES}

Gere 3 HOOKS DE CONTINUAÇÃO (~5s) que conectem com a cena anterior, tom confiante/sedutor/emocional. Não descreva tecnicamente o cômodo. Cada um com ação física sutil DIFERENTE.

Responda APENAS com JSON array:
[{"text":"...","action":"ação física sutil","duration":4}, ...]`;

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

TAREFA: inserção fotorrealista do personagem sobre a IMAGEM 1. Use IMAGEM 1 como CANVAS BASE. Preserve TODOS os pixels do cômodo, exceto a área ocupada pelo corpo do corretor e sua sombra realista.

SE HOUVER CONFLITO entre qualquer instrução estética/comercial e a preservação da IMAGEM 1, a preservação SEMPRE vence.

NEGATIVO ABSOLUTO: não redesenhar o cômodo, não trocar móveis, não reorganizar, não corrigir arquitetura, não mudar vista, não adicionar luxo, não mudar iluminação, não inventar nada que não esteja visível na IMAGEM 1.

IMAGEM 1 = FOTO ORIGINAL E IMUTÁVEL DO CÔMODO "${opts.roomName}".
${opts.refsDescription}

PERSONAGEM:
1. Insira "${opts.character.name}" de forma 100% fotorrealista, integrado com luz, sombras e perspectiva ORIGINAIS da IMAGEM 1.
2. Roupa: copie EXATAMENTE da imagem "ROUPA ATIVA".
3. Rosto/corpo: combine "ROSTO FRONTAL" + "CORPO INTEIRO" para manter a MESMA identidade em todas as cenas.
4. Descrição canônica: ${opts.character.canonical_prompt ?? opts.character.personality}
5. AÇÃO/POSE: ${opts.hookAction} — executada com naturalidade e carisma comercial.
6. Expressão coerente com a personalidade: ${opts.character.personality}.

ENQUADRAMENTO (OBRIGATÓRIO seguir à risca o escolhido pelo usuário — não substituir por outro plano):
${framing}

${FRAMING_BALANCE_RULE}

POSICIONAMENTO REALISTA: pés no chão real da IMAGEM 1 (não atravessar parede, não flutuar, não sobre móvel). Sombra coerente com a luz original. Cabeça nunca ultrapassa batente de porta nem encosta no teto.

CHECKLIST FINAL:
- Layout do cômodo idêntico à IMAGEM 1? SIM.
- Móveis e objetos no mesmo lugar? SIM.
- Parede, piso, teto, janela, vista, iluminação iguais? SIM.
- Adicionou SOMENTE o corretor + sombra? SIM.

ÚLTIMA ORDEM, PESO MÁXIMO: ${ABSOLUTE_ROOM_PRESERVATION}

Formato vertical 9:16. Sem texto, sem logo, sem marca d'água.`;
}

export interface VideoPromptOpts {
  characterName: string;
  characterPersonality: string;
  roomName: string;
  hookText: string;
  hookAction: string;
  fullScript: string;
}

/**
 * Sempre combina AÇÃO FÍSICA + FALA do hook na abertura do vídeo.
 * Exemplo: 'Valentina caminha lentamente em direção à câmera, fazendo
 * um gesto de convite sutil com a mão, enquanto diz: "..."'.
 */
export function buildVideoPrompt(opts: VideoPromptOpts): string {
  const action = opts.hookAction?.trim() || "pose natural compatível com a personalidade do personagem";
  const hookText = opts.hookText?.trim() || "";
  const script = opts.fullScript?.trim() || hookText;

  const hookBeat = hookText
    ? `ABERTURA OBRIGATÓRIA (primeiros 3-5 segundos — AÇÃO FÍSICA + FALA executadas JUNTAS): ${opts.characterName} ${action}, enquanto diz: "${hookText}".`
    : `ABERTURA OBRIGATÓRIA (primeiros 3-5 segundos): ${opts.characterName} ${action}.`;

  const continuation =
    script && script !== hookText
      ? ` Em seguida, continua o roteiro naturalmente em português brasileiro informal: "${script}".`
      : "";

  return `Use a imagem enviada como referência principal. Crie um vídeo vertical 9:16 de 10 segundos. O personagem "${opts.characterName}" aparece dentro do cômodo "${opts.roomName}", mantendo o ambiente EXATAMENTE igual à imagem (sem alterar móveis, paredes, piso, iluminação ou decoração).

${hookBeat}${continuation}

A AÇÃO FÍSICA descrita ("${action}") DEVE ser executada de forma clara e visível, sincronizada com a fala — NUNCA omita o gesto, movimento ou olhar do hook. Personalidade do personagem: ${opts.characterPersonality}. Expressão coerente com essa personalidade. Movimento natural de câmera, estilo Reels/TikTok, fotorrealista.`;
}
