import { useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { downloadAsBlob, getSignedUrl, uploadSceneFile } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { SignedImage } from "@/components/signed-image";
import { ConfirmButton } from "@/components/confirm-button";
import {
  Sparkles, Wand2, FileText, Video, Check, Copy, Download, Loader2, Trash2,
  ArrowDown, ArrowUp, Plus, PlayCircle,
} from "lucide-react";
import { toast } from "sonner";

import JSZip from "jszip";
import fileSaver from "file-saver";
const { saveAs } = fileSaver;

import {
  generateHooks,
  generateScripts,
  generateSceneImage,
  generateVideoPrompt,
  generateRoomTour,
  generateAnimalTour,
  approveScene,
} from "@/lib/ai.functions";
import type { Scene, Character, SceneHookOption, SceneMode } from "@/lib/types";

export const Route = createFileRoute("/projetos/$id")({
  head: () => ({ meta: [{ title: "Projeto — Corretor IA Studio" }] }),
  component: ProjectDetail,
});

type NextStep = { label: string; tone: "todo" | "done" } | null;

function nextStep(scene: Scene, isFirst: boolean): NextStep {
  if (scene.scene_mode === "skip") return { label: "⏸️ Pulada", tone: "done" };
  if (scene.status === "aprovado") return { label: "✅ Aprovada", tone: "done" };
  if (scene.scene_mode === "room_tour" || scene.scene_mode === "animal_tour") {
    if (!scene.generated_character_image || !scene.video_prompt) return { label: "Falta: gerar tour", tone: "todo" };
    return { label: "Pronta — falta aprovar", tone: "todo" };
  }
  if (!scene.generated_character_image) return { label: "Falta: gerar imagem", tone: "todo" };
  if (isFirst && !scene.selected_hook) return { label: "Falta: escolher hook", tone: "todo" };
  if (!isFirst && !scene.selected_script) return { label: "Falta: escolher roteiro", tone: "todo" };
  if (!scene.video_prompt) return { label: "Falta: prompt de vídeo", tone: "todo" };
  return { label: "Pronta — falta aprovar", tone: "todo" };
}

function ProjectDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  const [addingScene, setAddingScene] = useState(false);
  const [autoRunning, setAutoRunning] = useState<string | null>(null); // scene id ou "project"

  const genImageFn = useServerFn(generateSceneImage);
  const genHooksFn = useServerFn(generateHooks);
  const genScriptsFn = useServerFn(generateScripts);
  const genVideoPromptFn = useServerFn(generateVideoPrompt);
  const genTourFn = useServerFn(generateRoomTour);
  const genAnimalTourFn = useServerFn(generateAnimalTour);
  const approveFn = useServerFn(approveScene);

  const { data, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const [{ data: project }, { data: scenes }] = await Promise.all([
        supabase.from("projects").select("*, characters(*)").eq("id", id).single(),
        supabase.from("scenes").select("*").eq("project_id", id).order("scene_order"),
      ]);
      if (!project) throw new Error("Projeto não encontrado");
      return {
        project,
        character: (project as any).characters as Character,
        scenes: (scenes ?? []) as unknown as Scene[],
      };
    },
  });

  const deleteProject = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Projeto excluído");
      navigate({ to: "/projetos" });
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["project", id] });

  async function moveScene(sceneId: string, dir: -1 | 1) {
    if (!data) return;
    const arr = [...data.scenes];
    const idx = arr.findIndex((x) => x.id === sceneId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= arr.length) return;
    const a = arr[idx], b = arr[target];
    const [r1, r2] = await Promise.all([
      supabase.from("scenes").update({ scene_order: b.scene_order }).eq("id", a.id),
      supabase.from("scenes").update({ scene_order: a.scene_order }).eq("id", b.id),
    ]);
    if (r1.error || r2.error) toast.error("Falha ao reordenar — recarregue a página");
    refresh();
  }

  async function removeScene(sceneId: string) {
    const { error } = await supabase.from("scenes").delete().eq("id", sceneId);
    if (error) toast.error(error.message);
    else { toast.success("Cena excluída"); refresh(); }
  }

  async function addSceneFromFile(file: File, name: string) {
    if (!data) return;
    setAddingScene(true);
    try {
      const path = await uploadSceneFile(file, id, "original");
      const nextOrder = (data.scenes.at(-1)?.scene_order ?? 0) + 1;
      const { error } = await supabase.from("scenes").insert({
        project_id: id,
        scene_order: nextOrder,
        room_name: name.trim() || `Cena ${nextOrder}`,
        original_room_image: path,
        status: "pendente",
      });
      if (error) throw error;
      toast.success("Cena adicionada");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAddingScene(false);
    }
  }

  async function downloadAll() {
    if (!data) return;
    const zip = new JSZip();
    const folder = zip.folder(data.project.name) ?? zip;
    folder.file(
      "personagem.txt",
      `${data.character?.name ?? "(personagem removido)"}\n\n${data.character?.short_bio ?? ""}`,
    );
    const sequence: string[] = [];

    await Promise.all(
      data.scenes.map(async (s) => {
        const sub = folder.folder(`cena-${String(s.scene_order).padStart(2, "0")}-${s.room_name}`)!;
        sequence.push(`Cena ${s.scene_order} — ${s.room_name}\n${s.selected_script ?? "(roteiro não escolhido)"}\n`);
        const [orig, gen] = await Promise.all([
          s.original_room_image ? downloadAsBlob(s.original_room_image).catch(() => null) : null,
          s.generated_character_image ? downloadAsBlob(s.generated_character_image).catch(() => null) : null,
        ]);
        if (orig) sub.file("original.jpg", orig);
        if (gen) sub.file("gerada.png", gen);
        sub.file("roteiro.txt", s.selected_script ?? "");
        sub.file("prompt-imagem.txt", s.image_prompt ?? "");
        sub.file("prompt-video.txt", s.video_prompt ?? "");
      }),
    );
    folder.file("sequencia-final.txt", sequence.join("\n---\n"));
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `${data.project.name}.zip`);
    toast.success("Pacote baixado");
  }

  function exportScript() {
    if (!data) return;
    const lines: string[] = [];
    lines.push(`ROTEIRO — ${data.project.name}`);
    lines.push(`Personagem: ${data.character?.name ?? "(sem personagem)"}`);
    lines.push("");
    data.scenes.forEach((s, i) => {
      lines.push(`━━━ Cena ${i + 1} — ${s.room_name} ━━━`);
      if (s.selected_hook) lines.push(`Hook: ${s.selected_hook}`);
      if (s.selected_script) lines.push(`Roteiro: ${s.selected_script}`);
      if (s.video_prompt) {
        lines.push("");
        lines.push("Prompt de vídeo (colar no Google Vids):");
        lines.push(s.video_prompt);
      }
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `${data.project.name}-roteiro.txt`);
    toast.success("Roteiro exportado");
  }

  // Refetch da cena atual (evita usar snapshot desatualizado após generateSceneImage etc.)
  async function fetchScene(sceneId: string): Promise<Scene> {
    const { data: s, error } = await supabase.from("scenes").select("*").eq("id", sceneId).single();
    if (error || !s) throw new Error(error?.message ?? "Cena não encontrada");
    return s as unknown as Scene;
  }

  // Executa em sequência TUDO que falta pra uma cena (imagem → hook/roteiro → prompt de vídeo).
  // Auto-escolhe o 1º hook/roteiro gerado. Não aprova (usuário revisa).
  async function runFullScene(sceneId: string): Promise<void> {
    if (!data) return;
    let scene = data.scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const idx = data.scenes.findIndex((s) => s.id === sceneId);
    const isFirst = idx === 0;
    const isLast = idx === data.scenes.length - 1;
    const previousScript = idx > 0 ? data.scenes[idx - 1].selected_script : null;
    const mode: SceneMode = (data.project as any).project_type === "animal_tour"
      ? "animal_tour"
      : (data.project as any).project_type === "tour"
      ? "room_tour"
      : ((scene.scene_mode ?? "character") as SceneMode);

    if (mode === "skip" || scene.status === "aprovado") return;

    // TOURS: um clique só faz tudo
    if (mode === "room_tour") {
      await genTourFn({ data: { sceneId, musicMood: "sofisticado" } });
      return;
    }
    if (mode === "animal_tour") {
      await genAnimalTourFn({ data: { sceneId, musicMood: "sofisticado" } });
      return;
    }

    // MODO CORRETOR
    // 1. imagem
    if (!scene.generated_character_image) {
      await genImageFn({ data: { sceneId } });
      scene = await fetchScene(sceneId);
    }
    // 2. hook (só 1ª cena) ou roteiro (demais)
    if (isFirst) {
      if (!scene.selected_hook) {
        const hooks: any = await genHooksFn({
          data: {
            characterId: data.character?.id ?? "",
            sceneId,
            isFirstScene: true,
            previousSceneScript: null,
            roomName: scene.room_name,
          },
        });
        const picked = Array.isArray(hooks) ? hooks[0] : (hooks?.[0] ?? null);
        if (picked) {
          await supabase.from("scenes")
            .update({ selected_hook: picked, selected_script: picked.text })
            .eq("id", sceneId);
        }
        scene = await fetchScene(sceneId);
      }
    } else {
      if (!scene.selected_script) {
        const scripts: any = await genScriptsFn({
          data: {
            characterId: data.character?.id ?? "",
            sceneId,
            roomName: scene.room_name,
            selectedHook: scene.selected_hook?.text ?? "",
            isLastScene: isLast,
            previousSceneScript: previousScript,
          },
        });
        const first = Array.isArray(scripts) ? scripts[0] : null;
        if (first) {
          const ctas = data.character?.ctas ?? [];
          const cta = isLast
            ? ctas[Math.floor(Math.random() * Math.max(ctas.length, 1))]?.text ?? "Clica no link da bio."
            : null;
          await supabase.from("scenes").update({ selected_script: first, cta }).eq("id", sceneId);
        }
        scene = await fetchScene(sceneId);
      }
    }
    // 3. prompt de vídeo
    if (!scene.video_prompt) {
      await genVideoPromptFn({ data: { sceneId } });
    }
  }

  async function runFullProject() {
    if (!data) return;
    const pending = data.scenes.filter((s, i) => {
      const step = nextStep(s, i === 0);
      return step?.tone === "todo";
    });
    if (pending.length === 0) {
      toast.info("Nada pra fazer — todas as cenas já estão prontas ou aprovadas");
      return;
    }
    setAutoRunning("project");
    let ok = 0;
    let fail = 0;
    for (const s of pending) {
      try {
        await runFullScene(s.id);
        ok++;
        refresh();
      } catch (e) {
        fail++;
        toast.error(`Cena "${s.room_name}": ${(e as Error).message}`);
      }
    }
    setAutoRunning(null);
    refresh();
    toast.success(`Projeto gerado: ${ok} ok${fail ? `, ${fail} com erro` : ""}`);
  }

  async function approveAllReady() {
    if (!data) return;
    const ready = data.scenes.filter((s) => s.status === "gerado" || (s.video_prompt && s.status !== "aprovado" && s.scene_mode !== "skip"));
    if (ready.length === 0) {
      toast.info("Nenhuma cena pronta pra aprovar");
      return;
    }
    let ok = 0;
    for (const s of ready) {
      try { await approveFn({ data: { sceneId: s.id } }); ok++; } catch {}
    }
    refresh();
    toast.success(`${ok} cena(s) aprovada(s)`);
  }

  const stats = useMemo(() => {
    const scenes = data?.scenes ?? [];
    const approved = scenes.filter((s) => s.status === "aprovado").length;
    const generated = scenes.filter((s) => s.status === "gerado").length;
    const pending = scenes.length - approved - generated;
    const firstPending = scenes.find((s, i) => nextStep(s, i === 0)?.tone === "todo");
    return { total: scenes.length, approved, generated, pending, firstPending };
  }, [data?.scenes]);

  if (isLoading) return <div className="p-10 text-muted-foreground">Carregando...</div>;
  if (!data) return <div className="p-10">Não encontrado</div>;

  const visibleScenes = showOnlyPending
    ? data.scenes.filter((s, i) => nextStep(s, i === 0)?.tone === "todo")
    : data.scenes;

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">
            {data.project.name}
            {(data.project as any).project_type === "tour" && (
              <Badge variant="outline" className="ml-2 align-middle">🏠 Tour</Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">
            {data.character?.name ?? "Sem corretor (Tour)"} · {data.scenes.length} cena(s)
          </p>
          <PropertyUrlField projectId={id} initial={(data.project as any).property_url ?? ""} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportScript}>
            <FileText className="mr-1.5 h-4 w-4" />Exportar roteiro
          </Button>
          <Button variant="outline" onClick={downloadAll}>
            <Download className="mr-1.5 h-4 w-4" />Baixar pacote
          </Button>
          <ConfirmButton
            variant="ghost"
            size="icon"
            destructive
            title="Excluir projeto?"
            description="Isso apaga o projeto e todas as cenas. Não dá pra desfazer."
            confirmLabel="Excluir"
            onConfirm={() => deleteProject.mutate()}
            aria-label="Excluir projeto"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </ConfirmButton>
        </div>
      </div>


      {/* Progresso global */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-medium">
              Progresso: <span className="text-primary">{stats.approved}</span> / {stats.total} cenas aprovadas
            </div>
            <div className="flex gap-2 flex-wrap">
              {stats.pending > 0 && (
                <Button
                  size="sm"
                  onClick={runFullProject}
                  disabled={autoRunning !== null}
                >
                  {autoRunning === "project" ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-4 w-4" />
                  )}
                  {autoRunning === "project" ? "Gerando..." : `Gerar projeto inteiro (${stats.pending})`}
                </Button>
              )}
              {stats.generated > 0 && (
                <Button size="sm" variant="outline" onClick={approveAllReady} disabled={autoRunning !== null}>
                  <Check className="mr-1.5 h-4 w-4" />Aprovar todas prontas ({stats.generated})
                </Button>
              )}
              {stats.firstPending && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const el = document.getElementById(`scene-${stats.firstPending!.id}`);
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <PlayCircle className="mr-1.5 h-4 w-4" />Continuar de onde parou
                </Button>
              )}
              <Button
                size="sm"
                variant={showOnlyPending ? "default" : "outline"}
                onClick={() => setShowOnlyPending((v) => !v)}
              >
                {showOnlyPending ? "Mostrar todas" : "Só pendentes"}
              </Button>
            </div>
          </div>
          <Progress value={stats.total ? (stats.approved / stats.total) * 100 : 0} />
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>⏳ Pendentes: {stats.pending}</span>
            <span>🎨 Geradas: {stats.generated}</span>
            <span>✅ Aprovadas: {stats.approved}</span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {visibleScenes.map((s) => {
          const realIdx = data.scenes.findIndex((x) => x.id === s.id);
          return (
            <SceneCard
              key={s.id}
              scene={s}
              character={data.character}
              isTourProject={(data.project as any).project_type === "tour"}
              isAnimalTourProject={(data.project as any).project_type === "animal_tour"}
              previousScript={realIdx > 0 ? data.scenes[realIdx - 1].selected_script : null}
              isFirst={realIdx === 0}
              isLast={realIdx === data.scenes.length - 1}
              canMoveUp={realIdx > 0}
              canMoveDown={realIdx < data.scenes.length - 1}
              onMoveUp={() => moveScene(s.id, -1)}
              onMoveDown={() => moveScene(s.id, 1)}
              onRemove={() => removeScene(s.id)}
              onChange={refresh}
            />
          );
        })}
        {visibleScenes.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">
            Nenhuma cena pendente 🎉
          </div>
        )}
      </div>

      {/* Adicionar cena */}
      <AddSceneCard onAdd={addSceneFromFile} disabled={addingScene} />
    </div>
  );
}

function AddSceneCard({ onAdd, disabled }: { onAdd: (file: File, name: string) => void; disabled: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  return (
    <Card className="border-dashed">
      <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-end">
        <div className="flex-1">
          <div className="text-sm font-medium mb-1">Adicionar cena</div>
          <div className="flex gap-2 flex-col sm:flex-row">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
            <Input
              placeholder="Nome do cômodo (Ex: Suíte)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <Button
          disabled={!file || disabled}
          onClick={() => {
            if (!file) return;
            onAdd(file, name);
            setFile(null);
            setName("");
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />Adicionar
        </Button>
      </CardContent>
    </Card>
  );
}


function statusVariant(status: string): "secondary" | "default" | "outline" {
  if (status === "aprovado") return "default";
  if (status === "gerado") return "secondary";
  return "outline";
}

function SceneCard({
  scene,
  character,
  isTourProject,
  isAnimalTourProject,
  previousScript,
  isFirst,
  isLast,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
  onChange,
}: {
  scene: Scene;
  character: Character | null;
  isTourProject: boolean;
  isAnimalTourProject: boolean;
  previousScript: string | null;
  isFirst: boolean;
  isLast: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onChange: () => void;
}) {

  const genHooks = useServerFn(generateHooks);
  const genScripts = useServerFn(generateScripts);
  const genImage = useServerFn(generateSceneImage);
  const genVideoP = useServerFn(generateVideoPrompt);
  const genTour = useServerFn(generateRoomTour);
  const genAnimalTour = useServerFn(generateAnimalTour);
  const approve = useServerFn(approveScene);

  const [loadingHooks, setLoadingHooks] = useState(false);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [loadingTour, setLoadingTour] = useState(false);
  const [musicMood, setMusicMood] = useState<"aconchegante" | "sofisticado" | "energetico">("sofisticado");
  const [lastError, setLastError] = useState<{ label: string; message: string; retry: () => void } | null>(null);
  const busy = loadingHooks || loadingScripts || loadingImage || loadingVideo || loadingTour;
  const mode: SceneMode = isAnimalTourProject
    ? "animal_tour"
    : isTourProject
    ? "room_tour"
    : ((scene.scene_mode ?? "character") as SceneMode);

  async function changeMode(next: SceneMode) {
    if (next === mode) return;
    const { error } = await supabase.from("scenes").update({ scene_mode: next }).eq("id", scene.id);
    if (error) toast.error(error.message);
    else { toast.success(next === "character" ? "Modo: Com Corretor" : next === "room_tour" ? "Modo: Tour no Cômodo" : "Modo: Pular"); onChange(); }
  }

  async function run<T>(
    fn: () => Promise<T>,
    setL: (v: boolean) => void,
    successMsg: string | ((res: T) => string),
    label = "Ação",
  ) {
    setL(true);
    setLastError(null);
    try {
      const res = await fn();
      toast.success(typeof successMsg === "function" ? successMsg(res) : successMsg);
      onChange();
    } catch (e) {
      const message = (e as Error).message ?? "Erro desconhecido";
      toast.error(`${label}: ${message}`);
      setLastError({ label, message, retry: () => run(fn, setL, successMsg, label) });
    } finally {
      setL(false);
    }
  }


  async function pickHook(h: SceneHookOption) {
    // 1ª cena: hook é o roteiro inteiro. CTA fica SÓ na última cena.
    const updates = isFirst
      ? { selected_hook: h as any, selected_script: h.text }
      : { selected_hook: h as any };
    const { error } = await supabase.from("scenes").update(updates).eq("id", scene.id);
    if (error) toast.error(error.message);
    else { toast.success("Hook selecionado"); onChange(); }
  }

  async function clearHook() {
    const updates = isFirst
      ? { selected_hook: null, selected_script: null }
      : { selected_hook: null };
    const { error } = await supabase.from("scenes").update(updates).eq("id", scene.id);
    if (error) toast.error(error.message);
    else { toast.success("Seleção limpa"); onChange(); }
  }

  async function pickScript(s: string) {
    // CTA só na última cena
    const ctas = character?.ctas ?? [];
    const cta = isLast
      ? ctas[Math.floor(Math.random() * Math.max(ctas.length, 1))]?.text ?? "Clica no link da bio."
      : null;
    const { error } = await supabase
      .from("scenes")
      .update({ selected_script: s, cta })
      .eq("id", scene.id);
    if (error) toast.error(error.message);
    else { toast.success("Roteiro selecionado"); onChange(); }
  }


  async function clearScript() {
    const { error } = await supabase
      .from("scenes")
      .update({ selected_script: null, cta: null })
      .eq("id", scene.id);
    if (error) toast.error(error.message);
    else { toast.success("Roteiro limpo"); onChange(); }
  }


  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  }

  async function downloadOriginal() {
    if (!scene.original_room_image) return;
    const url = await getSignedUrl(scene.original_room_image);
    window.open(url, "_blank");
  }

  async function downloadGenerated() {
    if (!scene.generated_character_image) return;
    const url = await getSignedUrl(scene.generated_character_image);
    window.open(url, "_blank");
  }

  const next = nextStep(scene, isFirst);

  return (
    <Card id={`scene-${scene.id}`} className={`shadow-[var(--shadow-card)] scroll-mt-24 ${scene.status === "aprovado" ? "border-primary/40 bg-primary/[0.02]" : ""}`}>
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary font-semibold">
            {scene.scene_order}
          </div>
          <div>
            <CardTitle className="text-base">{scene.room_name}</CardTitle>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              <Badge variant={statusVariant(scene.status)}>{scene.status}</Badge>
              {isFirst && <Badge variant="outline">Abertura</Badge>}
              {isLast && <Badge variant="outline">CTA final</Badge>}
              {scene.model_used && (
                <Badge
                  variant="outline"
                  className={
                    scene.model_used.includes("pro")
                      ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
                      : "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-500"
                  }
                  title={`Imagem gerada com ${scene.model_used}`}
                >
                  {scene.model_used.includes("pro") ? "Gerado com Pro" : "Gerado com Flash"}
                </Badge>
              )}
              {next && (
                <Badge variant={next.tone === "done" ? "default" : "secondary"} className="text-[10px]">
                  {next.label}
                </Badge>
              )}
            </div>
            {/* Modo da cena (só projetos Reels) */}
            {!isTourProject && (
              <div className="mt-2 inline-flex rounded-md border border-border overflow-hidden text-xs">
                {([
                  { v: "character", l: "🧑 Corretor" },
                  { v: "room_tour", l: "🎥 Tour no Cômodo" },
                  { v: "skip", l: "⏸️ Pular" },
                ] as const).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => changeMode(opt.v)}
                    className={`px-2.5 py-1 transition ${mode === opt.v ? "bg-primary text-primary-foreground font-medium" : "bg-muted/40 hover:bg-muted text-foreground"}`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button size="icon" variant="ghost" disabled={!canMoveUp} onClick={onMoveUp} title="Mover pra cima">
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" disabled={!canMoveDown} onClick={onMoveDown} title="Mover pra baixo">
            <ArrowDown className="h-4 w-4" />
          </Button>
          <ConfirmButton
            size="icon"
            variant="ghost"
            title="Excluir esta cena?"
            description="A imagem original e os prompts gerados serão removidos."
            confirmLabel="Excluir"
            destructive
            onConfirm={onRemove}
            aria-label="Excluir cena"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </ConfirmButton>
          {(scene.image_prompt || scene.video_prompt) && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const txt = [
                  scene.selected_script ? `🎬 ROTEIRO:\n${scene.selected_script}` : "",
                  scene.cta ? `📣 CTA:\n${scene.cta}` : "",
                  scene.image_prompt ? `🖼️ PROMPT DE IMAGEM:\n${scene.image_prompt}` : "",
                  scene.video_prompt ? `🎥 PROMPT DE VÍDEO:\n${scene.video_prompt}` : "",
                ].filter(Boolean).join("\n\n");
                copy(txt, "Tudo da cena");
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />Copiar tudo
            </Button>
          )}
          {scene.status !== "aprovado" && (
            <Button size="sm" variant="outline" onClick={() => run(() => approve({ data: { sceneId: scene.id } }), () => {}, "Cena aprovada")}>
              <Check className="mr-1.5 h-3.5 w-3.5" />Aprovar
            </Button>
          )}
        </div>

      </CardHeader>

      <CardContent className="space-y-4">
        {lastError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="font-semibold text-destructive">⚠ Falhou: {lastError.label}</div>
              <div className="text-xs text-destructive/80 mt-0.5 break-words">{lastError.message}</div>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={lastError.retry} disabled={busy}>
                Tentar de novo
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLastError(null)}>Fechar</Button>
            </div>
          </div>
        )}

        {mode === "skip" && (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            ⏸️ Cena marcada como <b>Pular</b>. A foto está salva mas nada será gerado nem entrará no pacote final.
            Mude o modo no topo da cena para começar a produzir.
            <div className="mt-4">
              <SignedImage path={scene.original_room_image} alt="Original" className="mx-auto w-48 aspect-video rounded-md border border-border opacity-60" />
            </div>
          </div>
        )}

        {mode === "room_tour" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-xs space-y-1">
              <div className="font-semibold text-foreground">🎥 Tour no Cômodo — passo a passo</div>
              <div>1️⃣ Escolha a vibe da música abaixo.</div>
              <div>2️⃣ Clique em <b>Gerar tour</b> — a IA descreve o cômodo e cria uma <b>imagem vertical 9:16</b> recomposta da foto original (com fidelidade total).</div>
              <div>3️⃣ Suba a <b>imagem vertical 9:16</b> + o prompt no gerador de vídeo (Veo/Sora/Kling, saída 9:16, 5s). Isso garante que o vídeo saia vertical de verdade.</div>
              <div>4️⃣ Clique em <b>Aprovar</b> quando estiver pronta.</div>

            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">Foto original (horizontal)</div>
                <SignedImage path={scene.original_room_image} alt="Original" className="w-full aspect-video rounded-lg border border-border object-cover" />
                {scene.original_room_image && (
                  <Button variant="ghost" size="sm" className="mt-1" onClick={downloadOriginal}>
                    <Download className="mr-1.5 h-3 w-3" />Baixar foto
                  </Button>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">Imagem vertical 9:16 (use ESTA no Veo/Sora/Kling)</div>
                {scene.generated_character_image ? (
                  <SignedImage path={scene.generated_character_image} alt="Vertical 9:16" className="w-full max-w-[260px] aspect-[9/16] rounded-lg border border-primary/40 object-cover" />
                ) : (
                  <div className="w-full max-w-[260px] aspect-[9/16] rounded-lg border border-dashed border-border bg-muted/30 flex items-center justify-center text-xs text-muted-foreground p-3 text-center">Clique em Gerar tour pra criar a versão vertical</div>
                )}
              </div>
            </div>


            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5">Vibe da música</div>
              <div className="flex gap-1 flex-wrap">
                {([
                  { v: "aconchegante", l: "🛋️ Aconchegante" },
                  { v: "sofisticado", l: "💎 Sofisticado" },
                  { v: "energetico", l: "⚡ Energético" },
                ] as const).map((opt) => (
                  <Button
                    key={opt.v}
                    type="button"
                    size="sm"
                    variant={musicMood === opt.v ? "default" : "outline"}
                    className="h-7 text-xs px-2"
                    onClick={() => setMusicMood(opt.v)}
                  >
                    {opt.l}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => run(
                () => genTour({ data: { sceneId: scene.id, musicMood } }),
                setLoadingTour,
                "Tour gerado ✨ prompt pronto pra copiar",
                "Gerar tour",
              )}
              disabled={busy || !scene.original_room_image}
            >
              {loadingTour ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
              {scene.video_prompt ? "Regerar tour" : "Gerar tour"}
            </Button>

            <section>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-muted-foreground">Prompt único do vídeo 9:16 — 5s, com música, fidelidade total à foto (editável)</div>
                {scene.video_prompt && (
                  <Button size="sm" variant="ghost" onClick={() => copy(scene.video_prompt!, "Prompt do tour")}>
                    <Copy className="mr-1.5 h-3 w-3" />Copiar tudo
                  </Button>
                )}
              </div>
              <Textarea
                key={`tour-vid-${scene.id}-${scene.updated_at}`}
                defaultValue={scene.video_prompt ?? ""}
                rows={18}
                className="text-xs font-mono"
                placeholder="Clique em Gerar tour"
                onBlur={async (e) => {
                  if (e.target.value === (scene.video_prompt ?? "")) return;
                  const { error } = await supabase.from("scenes").update({ video_prompt: e.target.value || null }).eq("id", scene.id);
                  if (error) toast.error(error.message); else { toast.success("Prompt atualizado"); onChange(); }
                }}
              />
            </section>
          </div>
        )}

        {mode === "animal_tour" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-xs space-y-1">
              <div className="font-semibold text-foreground">🐾 Tour com Animal — passo a passo</div>
              <div>1️⃣ Escolha a vibe da música.</div>
              <div>2️⃣ Clique em <b>Gerar tour</b>. A IA cria a <b>imagem vertical 9:16 POV body-mount</b> (câmera no dorso do animal) + analisa a imagem e gera o <b>FINAL PROMPT em inglês</b>, NEGATIVE PROMPT e ROUTE SUMMARY.</div>
              <div>3️⃣ Cole o FINAL PROMPT + use a imagem vertical no Veo/Sora/Kling (9:16, ~5s).</div>
              <div>4️⃣ Clique em <b>Aprovar</b>.</div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">Foto original do cômodo</div>
                <SignedImage path={scene.original_room_image} alt="Original" className="w-full aspect-video rounded-lg border border-border object-cover" />
                {scene.original_room_image && (
                  <Button variant="ghost" size="sm" className="mt-1" onClick={downloadOriginal}>
                    <Download className="mr-1.5 h-3 w-3" />Baixar foto
                  </Button>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">Imagem POV vertical 9:16</div>
                {scene.generated_character_image ? (
                  <>
                    <SignedImage path={scene.generated_character_image} alt="POV" className="w-full max-w-[260px] aspect-[9/16] rounded-lg border border-primary/40 object-cover" />
                    <Button variant="ghost" size="sm" className="mt-1" onClick={downloadGenerated}>
                      <Download className="mr-1.5 h-3 w-3" />Baixar
                    </Button>
                  </>
                ) : (
                  <div className="w-full max-w-[260px] aspect-[9/16] rounded-lg border border-dashed border-border bg-muted/30 flex items-center justify-center text-xs text-muted-foreground p-3 text-center">Clique em Gerar tour</div>
                )}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5">Vibe da música</div>
              <div className="flex gap-1 flex-wrap">
                {([
                  { v: "aconchegante", l: "🛋️ Aconchegante" },
                  { v: "sofisticado", l: "💎 Sofisticado" },
                  { v: "energetico", l: "⚡ Energético" },
                ] as const).map((opt) => (
                  <Button
                    key={opt.v}
                    type="button"
                    size="sm"
                    variant={musicMood === opt.v ? "default" : "outline"}
                    className="h-7 text-xs px-2"
                    onClick={() => setMusicMood(opt.v)}
                  >
                    {opt.l}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => run(
                () => genAnimalTour({ data: { sceneId: scene.id, musicMood } }),
                setLoadingTour,
                "Tour com animal gerado ✨",
                "Gerar tour com animal",
              )}
              disabled={busy || !scene.original_room_image}
            >
              {loadingTour ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
              {scene.video_prompt ? "Regerar tour" : "Gerar tour"}
            </Button>

            <section>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-muted-foreground">FINAL PROMPT (inglês, pronto pra Veo/Sora/Kling — editável)</div>
                {scene.video_prompt && (
                  <Button size="sm" variant="ghost" onClick={() => copy(scene.video_prompt!, "FINAL PROMPT")}>
                    <Copy className="mr-1.5 h-3 w-3" />Copiar
                  </Button>
                )}
              </div>
              <Textarea
                key={`atour-vid-${scene.id}-${scene.updated_at}`}
                defaultValue={scene.video_prompt ?? ""}
                rows={14}
                className="text-xs font-mono"
                placeholder="Clique em Gerar tour"
                onBlur={async (e) => {
                  if (e.target.value === (scene.video_prompt ?? "")) return;
                  const { error } = await supabase.from("scenes").update({ video_prompt: e.target.value || null }).eq("id", scene.id);
                  if (error) toast.error(error.message); else { toast.success("FINAL PROMPT atualizado"); onChange(); }
                }}
              />
            </section>

            <section>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-muted-foreground">NEGATIVE PROMPT (editável)</div>
                {scene.negative_prompt && (
                  <Button size="sm" variant="ghost" onClick={() => copy(scene.negative_prompt!, "NEGATIVE PROMPT")}>
                    <Copy className="mr-1.5 h-3 w-3" />Copiar
                  </Button>
                )}
              </div>
              <Textarea
                key={`atour-neg-${scene.id}-${scene.updated_at}`}
                defaultValue={scene.negative_prompt ?? ""}
                rows={5}
                className="text-xs font-mono"
                placeholder="Será preenchido após gerar o tour"
                onBlur={async (e) => {
                  if (e.target.value === (scene.negative_prompt ?? "")) return;
                  const { error } = await supabase.from("scenes").update({ negative_prompt: e.target.value || null }).eq("id", scene.id);
                  if (error) toast.error(error.message); else { toast.success("NEGATIVE PROMPT atualizado"); onChange(); }
                }}
              />
            </section>

            <section>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-muted-foreground">ROUTE SUMMARY (trajeto escolhido — editável)</div>
                {scene.route_summary && (
                  <Button size="sm" variant="ghost" onClick={() => copy(scene.route_summary!, "ROUTE SUMMARY")}>
                    <Copy className="mr-1.5 h-3 w-3" />Copiar
                  </Button>
                )}
              </div>
              <Textarea
                key={`atour-route-${scene.id}-${scene.updated_at}`}
                defaultValue={scene.route_summary ?? ""}
                rows={3}
                className="text-xs"
                placeholder="Será preenchido após gerar o tour"
                onBlur={async (e) => {
                  if (e.target.value === (scene.route_summary ?? "")) return;
                  const { error } = await supabase.from("scenes").update({ route_summary: e.target.value || null }).eq("id", scene.id);
                  if (error) toast.error(error.message); else { toast.success("ROUTE SUMMARY atualizado"); onChange(); }
                }}
              />
            </section>
          </div>
        )}



        {mode === "character" && (<>
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs space-y-1">
          <div className="font-semibold text-foreground">Passo a passo desta cena</div>
          <div>1️⃣ Escolha o enquadramento e clique em <b>Gerar imagem</b>.</div>
          {isFirst ? (
            <div>2️⃣ Clique em <b>Gerar hooks</b> e selecione 1. O hook É o roteiro desta cena (≤10s).</div>
          ) : (
            <div>2️⃣ Clique em <b>Gerar roteiros</b> e selecione 1 (≤10s, máx ~25 palavras).{isLast && " Edite o CTA se quiser."}</div>
          )}
          <div>3️⃣ Clique em <b>Gerar prompt de vídeo</b> (vídeo de ~10s).</div>
          <div>4️⃣ Clique em <b>Aprovar</b> quando estiver pronta.</div>
        </div>


        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1.5">Foto original</div>
            <SignedImage path={scene.original_room_image} alt="Original" className="w-full aspect-video rounded-lg border border-border" />
            {scene.original_room_image && (
              <Button variant="ghost" size="sm" className="mt-1" onClick={downloadOriginal}>
                <Download className="mr-1.5 h-3 w-3" />Baixar
              </Button>
            )}
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1.5">Com corretor</div>
            <div className="relative w-full aspect-[9/16] max-h-[480px] bg-muted rounded-lg border border-border overflow-hidden">
              <SignedImage path={scene.generated_character_image} alt="Gerada" className="absolute inset-0 w-full h-full object-contain" />
              {/* Preview Reels: roteiro + CTA sobrepostos */}
              {(scene.selected_script || scene.cta) && (
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white pointer-events-none">
                  {scene.selected_script && (
                    <div className="text-sm font-semibold leading-tight drop-shadow line-clamp-3">
                      {scene.selected_script}
                    </div>
                  )}
                  {scene.cta && (
                    <div className="text-xs mt-1.5 bg-primary/90 inline-block px-2 py-0.5 rounded font-medium">
                      {scene.cta}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-2 space-y-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Enquadramento da câmera — escolha como o corretor aparece dentro do cômodo (a IA seguirá à risca)
                </div>
                <div className="flex flex-wrap gap-1">
                  {([
                    { v: "auto", l: "✨ IA decide", d: "Deixa a IA escolher o melhor plano" },
                    { v: "selfie", l: "📱 Selfie (POV)", d: "POV próximo: rosto e ombros, fundo desfocado" },
                    { v: "meio_corpo", l: "🎯 Meio corpo", d: "Da cintura pra cima, equilibrando pessoa e ambiente" },
                    { v: "corpo_inteiro", l: "🧍 Corpo inteiro", d: "Pessoa inteira dos pés à cabeça dentro do cômodo" },
                    { v: "plano_aberto", l: "🏠 Plano aberto (Wide)", d: "Cômodo domina, pessoa pequena ao fundo" },
                  ] as const).map((opt) => {
                    const active = (scene.camera_framing ?? "corpo_inteiro") === opt.v;
                    return (
                      <Button
                        key={opt.v}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className="h-7 text-xs px-2"
                        title={opt.d}
                        onClick={async () => {
                          await supabase.from("scenes").update({ camera_framing: opt.v }).eq("id", scene.id);
                          onChange();
                        }}
                      >
                        {opt.l}
                      </Button>
                    );
                  })}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {{
                    auto: "✨ A IA escolhe o melhor enquadramento pra esta cena.",
                    selfie: "📱 POV de quem grava: rosto, ombros, fundo desfocado.",
                    meio_corpo: "🎯 Da cintura pra cima — equilibra pessoa e ambiente.",
                    corpo_inteiro: "🧍 Pessoa inteira, dos pés à cabeça.",
                    plano_aberto: "🏠 Tour imobiliário: cômodo domina, pessoa pequena ao fundo.",
                  }[(scene.camera_framing ?? "corpo_inteiro") as "auto" | "selfie" | "meio_corpo" | "corpo_inteiro" | "plano_aberto"]}
                </div>
              </div>

              <div className="flex gap-1 flex-wrap items-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => run(
                    () => genImage({ data: { sceneId: scene.id } }),
                    setLoadingImage,
                    (res) => (res as { usedFallback?: boolean }).usedFallback
                      ? "Pro atingiu limite diário. Gerando com Flash — qualidade um pouco menor."
                      : "Imagem gerada ✨",
                    "Gerar imagem",
                  )}
                  disabled={busy || !scene.original_room_image}

                >
                  {loadingImage ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
                  {scene.generated_character_image ? "Regerar" : "Gerar imagem"}
                </Button>
                <label className="inline-flex items-center text-xs cursor-pointer border border-input rounded-md px-2 h-8 hover:bg-muted">
                  Substituir
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      try {
                        const path = await uploadSceneFile(f, scene.project_id, "generated");
                        const { error } = await supabase.from("scenes").update({ generated_character_image: path }).eq("id", scene.id);
                        if (error) throw error;
                        toast.success("Imagem substituída");
                        onChange();
                      } catch (err) {
                        toast.error((err as Error).message);
                      }
                    }}
                  />
                </label>
                {scene.generated_character_image && (
                  <Button variant="ghost" size="sm" onClick={downloadGenerated}>
                    <Download className="mr-1.5 h-3 w-3" />Baixar
                  </Button>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* HOOKS — só na 1ª cena (hook = abertura do vídeo) */}
        {isFirst && (
          <section>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div className="text-sm font-medium">Passo 2 — Hooks ({scene.hook_options?.length ?? 0})</div>
              <div className="flex gap-1">
                {scene.selected_hook && (
                  <Button size="sm" variant="ghost" onClick={clearHook}>
                    Limpar seleção
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    run(
                      () =>
                        genHooks({
                          data: {
                            characterId: character?.id ?? "",
                            sceneId: scene.id,
                            isFirstScene: isFirst,
                            previousSceneScript: previousScript,
                            roomName: scene.room_name,
                          },
                        }),
                      setLoadingHooks,
                      (res: any) => `${Array.isArray(res) ? res.length : 3} hooks gerados — escolha 1 abaixo`,
                      "Gerar hooks",
                    )
                  }
                  disabled={busy}

                >
                  {loadingHooks ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                  {scene.hook_options?.length > 0 ? "Gerar novos" : "Gerar hooks"}
                </Button>
              </div>
            </div>

            {scene.hook_options?.length > 0 && (
              <div className="grid gap-2">
                {scene.hook_options.map((h, i) => {
                  const isSelected = scene.selected_hook?.text === h.text;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickHook(h)}
                      className={`text-left border rounded-lg p-3 transition ${
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="font-medium text-sm">"{h.text}"</div>
                      <div className="text-xs text-muted-foreground mt-1">🎬 {h.action}</div>
                      <div className="text-xs text-muted-foreground">⏱ {h.duration}s</div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}


        {/* ROTEIROS — só aparecem da 2ª cena em diante; na 1ª, o hook É o roteiro */}
        {isFirst ? (
          <div className="text-xs text-muted-foreground border border-dashed border-border rounded-lg p-3">
            ✨ Cena de abertura: o <b>hook selecionado já é o roteiro completo</b> (máx 10s). Não precisa gerar roteiro extra.
          </div>
        ) : (
          <section>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div className="text-sm font-medium">Passo 3 — Roteiros ({scene.script_options?.length ?? 0})</div>
              <div className="flex gap-1">
                {scene.selected_script && (
                  <Button size="sm" variant="ghost" onClick={clearScript}>
                    Limpar seleção
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    run(
                      () =>
                        genScripts({
                          data: {
                            characterId: character?.id ?? "",
                            sceneId: scene.id,
                            roomName: scene.room_name,
                            selectedHook: scene.selected_hook?.text ?? "",
                            isLastScene: isLast,
                            previousSceneScript: previousScript,
                          },
                        }),
                      setLoadingScripts,
                      (res: any) => `${Array.isArray(res) ? res.length : 3} roteiros gerados — escolha 1 abaixo`,
                      "Gerar roteiros",
                    )
                  }
                  disabled={busy}

                >
                  {loadingScripts ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
                  {scene.script_options?.length > 0 ? "Gerar novos" : "Gerar roteiros"}
                </Button>
              </div>
            </div>

            {scene.script_options?.length > 0 && (
              <div className="grid gap-2">
                {scene.script_options.map((s, i) => {
                  const isSelected = scene.selected_script === s;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickScript(s)}
                      className={`text-left border rounded-lg p-3 transition whitespace-pre-wrap text-sm ${
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}


        {scene.selected_script && (
          <section>
            <div className="text-xs font-medium text-muted-foreground mb-1">Roteiro selecionado (editável)</div>
            <Textarea
              key={`script-${scene.id}-${scene.updated_at}`}
              defaultValue={scene.selected_script ?? ""}
              rows={3}
              className="text-sm"
              onBlur={async (e) => {
                if (e.target.value === (scene.selected_script ?? "")) return;
                const { error } = await supabase.from("scenes").update({ selected_script: e.target.value }).eq("id", scene.id);
                if (error) toast.error(error.message); else { toast.success("Roteiro atualizado"); onChange(); }
              }}
            />
          </section>
        )}

        {isLast && (
          <section>
            <div className="text-xs font-medium text-muted-foreground mb-1">CTA (editável)</div>
            <Textarea
              key={`cta-${scene.id}-${scene.updated_at}`}
              defaultValue={scene.cta ?? ""}
              rows={2}
              className="text-sm"
              placeholder="Ex: Clica no link da bio."
              onBlur={async (e) => {
                if (e.target.value === (scene.cta ?? "")) return;
                const { error } = await supabase.from("scenes").update({ cta: e.target.value || null }).eq("id", scene.id);
                if (error) toast.error(error.message); else { toast.success("CTA atualizado"); onChange(); }
              }}
            />
          </section>
        )}

        {/* PROMPTS */}
        <div className="grid md:grid-cols-2 gap-3">
          <section>
            <details open={!scene.generated_character_image}>
              <summary className="text-xs font-medium text-muted-foreground mb-1 cursor-pointer select-none">
                Prompt de imagem {scene.generated_character_image ? "(usado — clique para ver/editar e regerar)" : "(editável)"}
              </summary>
              <Textarea
                key={`imgp-${scene.id}-${scene.updated_at}`}
                defaultValue={scene.image_prompt ?? ""}
                rows={4}
                className="text-xs mt-1"
                onBlur={async (e) => {
                  if (e.target.value === (scene.image_prompt ?? "")) return;
                  const { error } = await supabase.from("scenes").update({ image_prompt: e.target.value || null }).eq("id", scene.id);
                  if (error) toast.error(error.message); else { toast.success("Prompt de imagem atualizado"); onChange(); }
                }}
              />
              {scene.image_prompt && (
                <Button size="sm" variant="ghost" className="mt-1" onClick={() => copy(scene.image_prompt!, "Prompt de imagem")}>
                  <Copy className="mr-1.5 h-3 w-3" />Copiar
                </Button>
              )}
            </details>

          </section>
          <section>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-medium text-muted-foreground">Prompt de vídeo (editável)</div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => run(() => genVideoP({ data: { sceneId: scene.id } }), setLoadingVideo, "Prompt de vídeo gerado", "Gerar prompt de vídeo")}
                disabled={busy || !scene.selected_script}

              >
                {loadingVideo ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Video className="mr-1.5 h-3 w-3" />}
                Gerar
              </Button>
            </div>
            <Textarea
              key={`vidp-${scene.id}-${scene.updated_at}`}
              defaultValue={scene.video_prompt ?? ""}
              rows={4}
              className="text-xs"
              onBlur={async (e) => {
                if (e.target.value === (scene.video_prompt ?? "")) return;
                const { error } = await supabase.from("scenes").update({ video_prompt: e.target.value || null }).eq("id", scene.id);
                if (error) toast.error(error.message); else { toast.success("Prompt de vídeo atualizado"); onChange(); }
              }}
            />
            {scene.video_prompt && (
              <Button size="sm" variant="ghost" className="mt-1" onClick={() => copy(scene.video_prompt!, "Prompt de vídeo")}>
                <Copy className="mr-1.5 h-3 w-3" />Copiar
              </Button>
            )}
          </section>
        </div>
        </>)}

      </CardContent>
    </Card>
  );
}

function PropertyUrlField({ projectId, initial }: { projectId: string; initial: string }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(!initial);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("projects")
        .update({ property_url: value.trim() || null })
        .eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Link salvo");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!editing && value) {
    return (
      <div className="mt-2 flex items-center gap-2 text-sm">
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline truncate max-w-md"
        >
          🔗 {value}
        </a>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Editar</Button>
      </div>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2 max-w-xl">
      <Input
        type="url"
        placeholder="https://link-do-imovel.com"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>
      {initial && (
        <Button size="sm" variant="ghost" onClick={() => { setValue(initial); setEditing(false); }}>
          Cancelar
        </Button>
      )}
    </div>
  );
}

