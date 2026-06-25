import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, FolderKanban, Search } from "lucide-react";
import { SignedImage } from "@/components/signed-image";

export const Route = createFileRoute("/projetos/")({
  head: () => ({ meta: [{ title: "Projetos — Corretor IA Studio" }] }),
  component: ProjectsList,
});

function ProjectsList() {
  const [q, setQ] = useState("");
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, created_at, characters(name), scenes(generated_character_image, scene_order)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return projects ?? [];
    return (projects ?? []).filter(
      (p: any) =>
        p.name?.toLowerCase().includes(needle) ||
        p.characters?.name?.toLowerCase().includes(needle),
    );
  }, [projects, q]);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projetos</h1>
          <p className="text-muted-foreground mt-1">Cada projeto vira uma sequência de cenas.</p>
        </div>
        <Button asChild><Link to="/projetos/novo"><Plus className="mr-1.5 h-4 w-4" />Novo Projeto</Link></Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou personagem..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8"
        />
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <FolderKanban className="h-10 w-10 mx-auto mb-3 opacity-50" />
            {q ? "Nenhum projeto bate com a busca." : (
              <>Nenhum projeto. <Link to="/projetos/novo" className="text-primary font-medium">Criar primeiro</Link></>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p: any) => (
            <Link key={p.id} to="/projetos/$id" params={{ id: p.id }}>
              <Card className="shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow h-full">
                <CardContent className="p-4">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {p.characters?.name} · {new Date(p.created_at).toLocaleDateString("pt-BR")}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
