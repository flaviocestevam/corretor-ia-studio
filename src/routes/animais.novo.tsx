import { createFileRoute } from "@tanstack/react-router";
import { AnimalForm } from "@/components/animal-form";

export const Route = createFileRoute("/animais/novo")({
  head: () => ({ meta: [{ title: "Novo Animal — Corretor IA Studio" }] }),
  component: () => (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Novo animal</h1>
      <AnimalForm />
    </div>
  ),
});
