import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CharacterForm } from "@/components/character-form";
import type { Character } from "@/lib/types";

export const Route = createFileRoute("/personagens/$id")({
  head: () => ({ meta: [{ title: "Editar Personagem — Corretor IA Studio" }] }),
  component: EditarPersonagem,
});

function EditarPersonagem() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["character", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("characters").select("*").eq("id", id).single();
      if (error) throw error;
      return data as unknown as Character;
    },
  });

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Editar personagem</h1>
        <p className="text-muted-foreground mt-1">{data?.name ?? ""}</p>
      </div>
      {isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : data ? (
        <CharacterForm initial={data} characterId={id} />
      ) : (
        <div>Não encontrado</div>
      )}
    </div>
  );
}
