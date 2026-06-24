import { createFileRoute } from "@tanstack/react-router";
import { CharacterForm } from "@/components/character-form";

export const Route = createFileRoute("/personagens/novo")({
  head: () => ({ meta: [{ title: "Novo Personagem — Corretor IA Studio" }] }),
  component: NovoPersonagem,
});

function NovoPersonagem() {
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Novo personagem</h1>
        <p className="text-muted-foreground mt-1">Defina identidade, jeito de falar, hooks e CTAs.</p>
      </div>
      <CharacterForm />
    </div>
  );
}
