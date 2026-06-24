import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, FolderKanban, Plus, Sparkles, Clock } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Corretor IA Studio" },
      { name: "description", content: "Visão geral dos seus personagens e projetos." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [chars, projs, recent] = await Promise.all([
        supabase.from("characters").select("id", { count: "exact", head: true }),
        supabase.from("projects").select("id", { count: "exact", head: true }),
        supabase
          .from("projects")
          .select("id, name, created_at, character_id, characters(name)")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      return {
        characters: chars.count ?? 0,
        projects: projs.count ?? 0,
        recent: recent.data ?? [],
      };
    },
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Produção de cenas imobiliárias com corretores IA.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/personagens/novo"><Plus className="mr-1.5 h-4 w-4" />Novo Personagem</Link>
          </Button>
          <Button asChild>
            <Link to="/projetos/novo"><Sparkles className="mr-1.5 h-4 w-4" />Novo Projeto</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Personagens</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{stats?.characters ?? "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">cadastrados</p>
          </CardContent>
        </Card>
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Projetos</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{stats?.projects ?? "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">no total</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" /> Projetos recentes
        </h2>
        {stats?.recent.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum projeto ainda. <Link to="/projetos/novo" className="text-primary font-medium">Criar o primeiro</Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {stats?.recent.map((p: any) => (
              <Link key={p.id} to="/projetos/$id" params={{ id: p.id }}>
                <Card className="hover:shadow-[var(--shadow-elevated)] transition-shadow cursor-pointer h-full">
                  <CardContent className="p-4">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {p.characters?.name ?? "—"} · {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
