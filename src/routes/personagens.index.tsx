import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { importCharacters } from "@/lib/characters.functions";
import type { Character } from "@/lib/types";

export const Route = createFileRoute("/personagens/")({
  head: () => ({
    meta: [
      { title: "Personagens — Corretor IA Studio" },
      { name: "description", content: "Personagens de corretores IA cadastrados." },
    ],
  }),
  component: PersonagensList,
});

function PersonagensList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: characters, isLoading } = useQuery({
    queryKey: ["characters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as Character[];
    },
  });

  async function handleImport() {
    setLoading(true);
    try {
      const res = await importCharacters({ data: { json } });
      toast.success(`${res.count} personagem(s) importado(s)`);
      setOpen(false);
      setJson("");
      qc.invalidateQueries({ queryKey: ["characters"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Personagens</h1>
          <p className="text-muted-foreground mt-1">Seus corretores IA prontos para entrar em cena.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Upload className="mr-1.5 h-4 w-4" />Importar JSON</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Importar personagens (JSON)</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Cole um array JSON com os campos: name, short_bio, personality, speaking_style,
                canonical_prompt, catchphrases, hooks, ctas. Pode colar com ou sem ```json.
              </p>
              <Textarea
                value={json}
                onChange={(e) => setJson(e.target.value)}
                placeholder='[{"name":"...","hooks":[...], ...}]'
                className="min-h-[280px] font-mono text-xs"
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
                <Button onClick={handleImport} disabled={loading || json.trim().length < 2}>
                  {loading ? "Importando..." : "Importar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button asChild>
            <Link to="/personagens/novo"><Plus className="mr-1.5 h-4 w-4" />Novo Personagem</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="h-48 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {characters?.map((c) => (
            <Card key={c.id} className="shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-lg leading-tight">{c.name}</h3>
                  <Badge variant="secondary" className="shrink-0">{c.hooks?.length ?? 0} hooks</Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-3 min-h-[3.75rem]">
                  {c.short_bio}
                </p>
                {c.personality && (
                  <p className="text-xs text-muted-foreground italic line-clamp-1">
                    {c.personality}
                  </p>
                )}
                <div className="flex gap-2 pt-2">
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link to="/personagens/$id" params={{ id: c.id }}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />Editar
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate({ to: "/projetos/novo", search: { characterId: c.id } as any })}
                  >
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
