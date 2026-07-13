import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, GripVertical, X, Sparkles } from "lucide-react";
import { uploadSceneFile } from "@/lib/storage";
import { toast } from "sonner";

const search = z.object({
  characterId: z.string().optional(),
  animalId: z.string().optional(),
  clientId: z.string().optional(),
});

export const Route = createFileRoute("/projetos/novo")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Novo Projeto — Corretor IA Studio" }] }),
  component: NovoProjeto,
});

type ProjectType = "reels" | "tour" | "animal_tour";

interface RoomDraft {
  id: string;
  name: string;
  file: File;
  previewUrl: string;
}

function NovoProjeto() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [name, setName] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>(
    search.animalId ? "animal_tour" : "reels",
  );
  const [characterId, setCharacterId] = useState(search.characterId ?? "");
  const [animalId, setAnimalId] = useState(search.animalId ?? "");
  const [clientId, setClientId] = useState(search.clientId ?? "");
  const [rooms, setRooms] = useState<RoomDraft[]>([]);
  const [creating, setCreating] = useState(false);

  const { data: characters } = useQuery({
    queryKey: ["characters-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("characters").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: animals } = useQuery({
    queryKey: ["animals-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("animals").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).map((f) => ({
      id: crypto.randomUUID(),
      name: f.name.replace(/\.[^.]+$/, ""),
      file: f,
      previewUrl: URL.createObjectURL(f),
    }));
    setRooms((prev) => [...prev, ...next]);
  }

  function move(idx: number, dir: -1 | 1) {
    setRooms((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nome do projeto é obrigatório");
      if (!clientId) throw new Error("Selecione o cliente (imobiliária)");
      if (projectType === "reels" && !characterId) throw new Error("Selecione um personagem");
      if (projectType === "animal_tour" && !animalId) throw new Error("Selecione um animal");
      if (rooms.length === 0) throw new Error("Adicione pelo menos uma foto");

      const sceneMode =
        projectType === "tour" ? "room_tour" :
        projectType === "animal_tour" ? "animal_tour" :
        "character";

      const { data: project, error: pErr } = await supabase
        .from("projects")
        .insert({
          name: name.trim(),
          character_id: projectType === "reels" ? characterId : null,
          animal_id: projectType === "animal_tour" ? animalId : null,
          client_id: clientId,
          project_type: projectType,
        } as any)
        .select("id")
        .single();
      if (pErr || !project) throw pErr;

      const scenesPayload = [];
      for (let i = 0; i < rooms.length; i++) {
        const r = rooms[i];
        const path = await uploadSceneFile(r.file, project.id, "original");
        scenesPayload.push({
          project_id: project.id,
          scene_order: i + 1,
          room_name: r.name.trim() || `Cena ${i + 1}`,
          original_room_image: path,
          status: "pendente",
          scene_mode: sceneMode,
        });
      }
      const { error: sErr } = await supabase.from("scenes").insert(scenesPayload);
      if (sErr) throw sErr;
      return project.id;
    },
    onSuccess: (id) => {
      toast.success("Projeto criado");
      navigate({ to: "/projetos/$id", params: { id } });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setCreating(false);
    },
  });

  const typeOptions: { v: ProjectType; title: string; desc: string }[] = [
    { v: "reels", title: "🎬 Reels com corretor", desc: "Hooks, roteiros, CTA e cenas com personagem" },
    { v: "tour", title: "🏠 Tour do imóvel", desc: "Câmera passeando pelos cômodos, sem personagem" },
    { v: "animal_tour", title: "🐾 Tour com animal", desc: "POV body-mount: câmera presa no animal explorando o imóvel" },
  ];

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Novo projeto</h1>
        <p className="text-muted-foreground mt-1">Escolha o tipo, suba as fotos e organize a ordem das cenas.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Projeto</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Tipo de projeto *</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
              {typeOptions.map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setProjectType(opt.v)}
                  className={`rounded-md border px-3 py-3 text-left text-sm transition ${projectType === opt.v ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"}`}
                >
                  <div className="font-semibold">{opt.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Cliente (imobiliária) *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Selecionar cliente..." /></SelectTrigger>
              <SelectContent>
                {clients?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nome do imóvel *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Casa Jardim Paulista" />
          </div>
          {projectType === "reels" && (
            <div>
              <Label>Personagem *</Label>
              <Select value={characterId} onValueChange={setCharacterId}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {characters?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {projectType === "animal_tour" && (
            <div>
              <Label>Animal *</Label>
              <Select value={animalId} onValueChange={setAnimalId}>
                <SelectTrigger><SelectValue placeholder="Selecionar animal..." /></SelectTrigger>
                <SelectContent>
                  {animals?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!animals?.length && (
                <p className="text-xs text-muted-foreground mt-1">
                  Nenhum animal cadastrado. <Link to="/animais/novo" className="text-primary underline">Cadastrar primeiro</Link>
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cômodos (cenas)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <label className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/40 transition">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium">Clique ou arraste fotos dos cômodos</span>
            <span className="text-xs text-muted-foreground">Cada foto vira uma cena independente</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>

          {rooms.length > 0 && (
            <div className="space-y-2">
              {rooms.map((r, i) => (
                <div key={r.id} className="flex items-center gap-3 border border-border rounded-lg p-2 bg-card">
                  <div className="flex flex-col">
                    <button type="button" onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground">▲</button>
                    <button type="button" onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground">▼</button>
                  </div>
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <img src={r.previewUrl} className="w-16 h-16 object-cover rounded-md" alt="" />
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground mb-1">Cena {i + 1}</div>
                    <Input
                      value={r.name}
                      onChange={(e) => setRooms((arr) => arr.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
                      placeholder="Nome do cômodo (Ex: Sala)"
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setRooms((arr) => arr.filter((x) => x.id !== r.id))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur py-3 -mx-6 px-6 border-t border-border">
        <Button variant="ghost" onClick={() => navigate({ to: "/projetos" })}>Cancelar</Button>
        <Button
          onClick={() => {
            setCreating(true);
            create.mutate();
          }}
          disabled={creating || create.isPending}
        >
          <Sparkles className="mr-1.5 h-4 w-4" />
          {create.isPending ? "Criando cenas..." : "Criar cenas"}
        </Button>
      </div>
    </div>
  );
}
