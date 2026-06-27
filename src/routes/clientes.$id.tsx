import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, FolderKanban, ArrowLeft } from "lucide-react";
import { SignedImage } from "@/components/signed-image";

export const Route = createFileRoute("/clientes/$id")({
  head: () => ({ meta: [{ title: "Imóveis do cliente — Corretor IA Studio" }] }),
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const { data: client } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, trade_name, contact")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: projects, isLoading } = useQuery({
    queryKey: ["client-projects", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, created_at, project_type, characters(name), animals(name), scenes(generated_character_image, scene_order)")
        .eq("client_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const reels = (projects ?? []).filter((p: any) => (p.project_type ?? "reels") === "reels");
  const tours = (projects ?? []).filter((p: any) => p.project_type === "tour");
  const animalTours = (projects ?? []).filter((p: any) => p.project_type === "animal_tour");

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/clientes" })}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />Clientes
      </Button>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{client?.name ?? "Cliente"}</h1>
          {client?.trade_name && <p className="text-muted-foreground mt-1">{client.trade_name}</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm"><a href="#reels">🎬 Reels ({reels.length})</a></Button>
          <Button asChild variant="outline" size="sm"><a href="#tours">🏠 Tours ({tours.length})</a></Button>
          <Button asChild variant="outline" size="sm"><a href="#animal-tours">🐾 Animal ({animalTours.length})</a></Button>
          <Button asChild>
            <Link to="/projetos/novo" search={{ clientId: id }}><Plus className="mr-1.5 h-4 w-4" />Novo Imóvel</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : (projects ?? []).length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <FolderKanban className="h-10 w-10 mx-auto mb-3 opacity-50" />
            Nenhum imóvel ainda. <Link to="/projetos/novo" search={{ clientId: id }} className="text-primary font-medium">Criar primeiro</Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <ProjectSection id="reels" title="🎬 Reels com corretor" items={reels} emptyText="Nenhum reels ainda." />
          <ProjectSection id="tours" title="🏠 Tours do imóvel" items={tours} emptyText="Nenhum tour ainda." />
          <ProjectSection id="animal-tours" title="🐾 Tour com animal" items={animalTours} emptyText="Nenhum tour com animal ainda." />
        </>
      )}
    </div>
  );
}

function ProjectSection({ id, title, items, emptyText }: { id: string; title: string; items: any[]; emptyText: string }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? "projeto" : "projetos"}</span>
      </div>
      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">{emptyText}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p: any) => {
            const firstScene = [...(p.scenes ?? [])].sort((a: any, b: any) => a.scene_order - b.scene_order)[0];
            const thumb = firstScene?.generated_character_image;
            const subtitle = p.characters?.name ?? p.animals?.name ?? (p.project_type === "tour" ? "Tour" : p.project_type === "animal_tour" ? "Tour animal" : "—");
            return (
              <Link key={p.id} to="/projetos/$id" params={{ id: p.id }}>
                <Card className="shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow h-full overflow-hidden">
                  <SignedImage
                    path={thumb}
                    alt={p.name}
                    className="w-full aspect-[9/16] object-cover"
                    fallbackClassName="w-full aspect-[9/16]"
                  />
                  <CardContent className="p-4">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {subtitle} · {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
