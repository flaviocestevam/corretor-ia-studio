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
        .select("id, name, created_at, characters(name), scenes(generated_character_image, scene_order)")
        .eq("client_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/clientes" })}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />Clientes
      </Button>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{client?.name ?? "Cliente"}</h1>
          {client?.trade_name && <p className="text-muted-foreground mt-1">{client.trade_name}</p>}
        </div>
        <Button asChild>
          <Link to="/projetos/novo" search={{ clientId: id }}><Plus className="mr-1.5 h-4 w-4" />Novo Imóvel</Link>
        </Button>
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
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {(projects ?? []).map((p: any) => {
            const firstScene = [...(p.scenes ?? [])].sort((a: any, b: any) => a.scene_order - b.scene_order)[0];
            const thumb = firstScene?.generated_character_image;
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
                      {p.characters?.name} · {(p.scenes?.length ?? 0)} cena(s)
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
