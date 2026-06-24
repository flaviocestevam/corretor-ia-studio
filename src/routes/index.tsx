import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, FolderKanban, Plus, Sparkles, Clock, CheckCircle2, AlertCircle, Film } from "lucide-react";

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
      const [chars, projs, scenes, recent] = await Promise.all([
        supabase.from("characters").select("id", { count: "exact", head: true }),
        supabase.from("projects").select("id", { count: "exact", head: true }),
        supabase.from("scenes").select("id, status, project_id"),
        supabase
          .from("projects")
          .select("id, name, created_at, character_id, characters(name)")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      const allScenes = scenes.data ?? [];
      const approved = allScenes.filter((s) => s.status === "aprovado").length;
      const generated = allScenes.filter((s) => s.status === "gerado").length;
      const pending = allScenes.length - approved - generated;
      // projetos em andamento = têm pelo menos 1 cena não aprovada
      const projectsInProgress = new Set(
        allScenes.filter((s) => s.status !== "aprovado").map((s) => s.project_id),
      ).size;
      return {
        characters: chars.count ?? 0,
        projects: projs.count ?? 0,
        scenesTotal: allScenes.length,
        scenesApproved: approved,
        scenesGenerated: generated,
        scenesPending: pending,
        projectsInProgress,
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Personagens" value={stats?.characters} icon={<Users className="h-4 w-4 text-muted-foreground" />} sub="cadastrados" />
        <Stat label="Projetos em andamento" value={stats?.projectsInProgress} icon={<FolderKanban className="h-4 w-4 text-muted-foreground" />} sub={`${stats?.projects ?? 0} no total`} />
        <Stat label="Cenas pendentes" value={stats?.scenesPending} icon={<AlertCircle className="h-4 w-4 text-warning" />} sub="aguardando você" tone="warn" />
        <Stat label="Cenas aprovadas" value={stats?.scenesApproved} icon={<CheckCircle2 className="h-4 w-4 text-success" />} sub={`de ${stats?.scenesTotal ?? 0}`} tone="ok" />
      </div>

      {(stats?.scenesGenerated ?? 0) > 0 && (
        <Card className="border-secondary/40 bg-secondary/5">
          <CardContent className="p-4 flex items-center gap-3 text-sm">
            <Film className="h-4 w-4 text-secondary-foreground" />
            <span>
              <b>{stats?.scenesGenerated}</b> cena(s) já com imagem gerada, esperando aprovação.
            </span>
          </CardContent>
        </Card>
      )}

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

function Stat({ label, value, icon, sub, tone }: { label: string; value: number | undefined; icon: React.ReactNode; sub?: string; tone?: "ok" | "warn" }) {
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-4xl font-bold ${tone === "warn" && (value ?? 0) > 0 ? "text-warning" : tone === "ok" ? "text-success" : ""}`}>
          {value ?? "—"}
        </div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
