# Plano de melhorias de UX

Vou aplicar em **3 fases** pra não quebrar nada e você ir testando. Cada fase é um commit.

---

## Fase 1 — Continuidade (itens 1, 2, 3)
**Objetivo:** abrir o projeto e saber exatamente onde parou.

- **Progresso global no topo do projeto**: barra com `X/Y cenas aprovadas`, contadores (pendente / gerada / aprovada) e filtro "mostrar só pendentes".
- **Auto-save real (não perder trabalho)**: tudo que a IA gera (hooks, roteiros, imagem, prompt de vídeo) já é salvo no banco — vou garantir que ao reabrir o projeto:
  - cena destaca o **próximo passo pendente** (ex: "Falta gerar imagem")
  - botão "Continuar de onde parou" rola até a primeira cena não aprovada
  - badge de status por cena: `Pendente → Hooks ok → Roteiro ok → Imagem ok → Prompt vídeo ok → Aprovada`
- **Cenas: adicionar / remover / reordenar depois de criado** (item 5 do audit, complementar à continuidade): botão `+ Adicionar cena`, remover cena, mover ↑↓.

## Fase 2 — Editor de cena enxuto (itens 9, 10, 11, 12)
- **Mostrar texto "Enquadramento" acima dos botões** (auto / selfie / meio corpo / corpo inteiro / plano aberto) com 1 linha de descrição.
- **Personagem em tabs** (`Identidade · Voz · Hooks · CTAs · Fotos`) em vez de cards empilhados.
- **Preview de como o hook + CTA aparecem** dentro do card da cena (texto sobreposto fake).
- **Dashboard com métricas reais**: cenas pendentes, cenas aprovadas, projetos em andamento.

## Fase 3 — Polish (itens 13, 14, 15, 17, 18)
- Loading states **bloqueiam** ações conflitantes na mesma cena.
- **Mobile**: revisar layout em 375px (sidebar, cards, botões grandes).
- **Toasts informativos**: "3 hooks gerados — escolha 1", "Roteiro salvo", etc.
- **Erros de IA acionáveis**: mensagem fica visível no card com botão "Tentar de novo" (não some como toast).
- **Busca / filtro** em `/personagens` e `/projetos`.

---

## Itens descartados (você confirmou)
- 4 (reordenar cenas durante criação) — vai ficar no `+ Adicionar cena` da Fase 1.
- 6 (AlertDialog no delete) — já tem `confirm()`, ok.
- 7 (efeito visual no Aprovar) — vai junto com o badge da Fase 1.
- 8 (modal "Copiar tudo" com botões individuais) — você só usa Gemini/Veo/Higgsfield, então o "Copiar tudo" atual já serve.
- 16 (atalhos de teclado).

## Detalhes técnicos
- Fase 1 mexe em: `src/routes/projetos.$id.tsx` (progresso + scroll), nova mutation pra add/remove/reorder cena, talvez 1 coluna em `scenes` só pra `last_touched_at` (opcional).
- Nenhuma mudança de schema obrigatória — `status` já existe (`pendente`/`gerado`/`aprovado`); vou apenas derivar o passo pendente a partir dos campos que já gravamos.
- Sem mudança em prompts de IA nem em chamadas pro Gateway.

**Posso começar pela Fase 1?**
