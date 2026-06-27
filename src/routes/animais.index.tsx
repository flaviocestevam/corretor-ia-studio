import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Sparkles, PawPrint } from "lucide-react";
import { SignedImage } from "@/components/signed-image";
import type { Animal } from "@/lib/types";

export const Route = createFileRoute("/animais/")({
  head: () => ({ meta: [{ title: "Animais — Corretor IA Studio" }] }),
  component: AnimaisList,
});

function AnimaisList() {
  const navigate = useNavigate();
  const { data: animals, isLoading } = useQuery({
    queryKey: ["animals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("animals").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as Animal[];
    },
  });

  return (
    <div className="px-4 py-6 sm:px-6 md:p-10 max-w-7xl mx-auto space-y-6 w-full overflow-x-hidden">
      <div className="grid grid-cols-1 gap-4 sm:flex sm:items-end sm:justify-between sm:flex-wrap">
        <div className="min-w-0">
          <h1 className="font-bold tracking-tight text-[clamp(1.75rem,4vw,2rem)] flex items-center gap-2"><PawPrint className="h-7 w-7" />Animais</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Catálogo de animais para tours POV imersivos pelo imóvel.</p>
        </div>
        <Button asChild className="min-h-11"><Link to="/animais/novo"><Plus className="mr-1.5 h-4 w-4" />Novo Animal</Link></Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : !animals?.length ? (
        <Card className="border-dashed"><CardContent className="py-16 text-center text-muted-foreground">
          Nenhum animal ainda. <Link to="/animais/novo" className="text-primary font-medium">Criar primeiro</Link>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
          {animals.map((a) => (
            <Card key={a.id} className="shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow overflow-hidden">
              <Link to="/animais/$id" params={{ id: a.id }} className="block group">
                <SignedImage
                  path={a.canonical_image}
                  alt={a.name}
                  className="w-full aspect-square object-cover bg-muted transition-transform group-hover:scale-[1.02]"
                  fallbackClassName="w-full aspect-square rounded-none border-0 border-b"
                />
              </Link>
              <CardContent className="p-4 space-y-2">
                <div>
                  <h3 className="font-semibold text-base leading-tight">{a.name}</h3>
                  {a.species && <p className="text-xs text-muted-foreground">{a.species}</p>}
                </div>
                {a.short_bio && <p className="text-xs text-muted-foreground line-clamp-2">{a.short_bio}</p>}
                <div className="flex gap-2 pt-1">
                  <Button asChild variant="outline" size="sm" className="flex-1 min-h-10">
                    <Link to="/animais/$id" params={{ id: a.id }}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Link>
                  </Button>
                  <Button size="sm" className="flex-1 min-h-10" onClick={() => navigate({ to: "/projetos/novo", search: { animalId: a.id } as any })}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />Usar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
