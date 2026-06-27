import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AnimalForm } from "@/components/animal-form";
import type { Animal } from "@/lib/types";

export const Route = createFileRoute("/animais/$id")({
  head: () => ({ meta: [{ title: "Editar Animal — Corretor IA Studio" }] }),
  component: EditAnimal,
});

function EditAnimal() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["animal", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("animals").select("*").eq("id", id).single();
      if (error) throw error;
      return data as unknown as Animal;
    },
  });
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Editar animal</h1>
      {isLoading ? <div className="text-muted-foreground">Carregando...</div> : data && <AnimalForm initial={data} animalId={id} />}
    </div>
  );
}
