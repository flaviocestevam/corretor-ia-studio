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
import {
  Sparkles, Wand2, FileText, Video, Check, Copy, Download, Loader2, Trash2,
  ArrowDown, ArrowUp, Plus, PlayCircle,
} from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { saveAs } from "file-saver";

import {
  generateHooks,
  generateScripts,
  generateSceneImage,
  generateVideoPrompt,
  approveScene,
} from "@/lib/ai.functions";
import type { Scene, Character, SceneHookOption } from "@/lib/types";

export const Route = createFileRoute("/projetos/$id")({
  head: () => ({ meta: [{ title: "Projeto — Corretor IA Studio" }] }),
  component: ProjectDetail,
});

type NextStep = { label: string; tone: "todo" | "done" } | null;

function nextStep(scene: Scene, isFirst: boolean): NextStep {
  if (scene.status === "aprovado") return { label: "✅ Aprovada", tone: "done" };
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
    // swap scene_order
    await supabase.from("scenes").update({ scene_order: -1 }).eq("id", a.id);
    await supabase.from("scenes").update({ scene_order: a.scene_order }).eq("id", b.id);
    await supabase.from("scenes").update({ scene_order: b.scene_order }).eq("id", a.id);
    refresh();
  }

  async function removeScene(sceneId: string) {
    if (!confirm("Excluir esta cena?")) return;
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
    folder.file("personagem.txt", `${data.character.name}\n\n${data.character.short_bio ?? ""}`);
    const sequence: string[] = [];

    for (const s of data.scenes) {
      const sub = folder.folder(`cena-${String(s.scene_order).padStart(2, "0")}-${s.room_name}`)!;
      sequence.push(`Cena ${s.scene_order} — ${s.room_name}\n${s.selected_script ?? "(roteiro não escolhido)"}\n`);
      if (s.original_room_image) {
        try { sub.file("original.jpg", await downloadAsBlob(s.original_room_image)); } catch {}
      }
      if (s.generated_character_image) {
        try { sub.file("gerada.png", await downloadAsBlob(s.generated_character_image)); } catch {}
      }
      sub.file("roteiro.txt", s.selected_script ?? "");
      sub.file("prompt-imagem.txt", s.image_prompt ?? "");
      sub.file("prompt-video.txt", s.video_prompt ?? "");
    }
    folder.file("sequencia-final.txt", sequence.join("\n---\n"));
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `${data.project.name}.zip`);
    toast.success("Pacote baixado");
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
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{data.project.name}</h1>
          <p className="text-muted-foreground mt-1">
            {data.character.name} · {data.scenes.length} cena(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadAll}>
            <Download className="mr-1.5 h-4 w-4" />Baixar pacote
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (confirm("Excluir projeto e todas as cenas?")) deleteProject.mutate();
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
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
              {stats.firstPending && (
                <Button
                  size="sm"
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
  character: Character;
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
  const approve = useServerFn(approveScene);

  const [loadingHooks, setLoadingHooks] = useState(false);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [lastError, setLastError] = useState<{ label: string; message: string; retry: () => void } | null>(null);
  const busy = loadingHooks || loadingScripts || loadingImage || loadingVideo;

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
    const ctas = character.ctas ?? [];
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
              {next && (
                <Badge variant={next.tone === "done" ? "default" : "secondary"} className="text-[10px]">
                  {next.label}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button size="icon" variant="ghost" disabled={!canMoveUp} onClick={onMoveUp} title="Mover pra cima">
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" disabled={!canMoveDown} onClick={onMoveDown} title="Mover pra baixo">
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onRemove} title="Excluir cena">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
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
                  Enquadramento — como o corretor aparece dentro do cômodo
                </div>
                <div className="flex flex-wrap gap-1">
                  {([
                    { v: "auto", l: "✨ IA decide", d: "Deixa a IA escolher" },
                    { v: "selfie", l: "Selfie", d: "POV próximo, rosto e ombros" },
                    { v: "meio_corpo", l: "Meio corpo", d: "Da cintura pra cima" },
                    { v: "corpo_inteiro", l: "Corpo inteiro", d: "Pessoa inteira no cômodo" },
                    { v: "plano_aberto", l: "Plano aberto", d: "Wide, pessoa pequena no ambiente" },
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
                  onClick={() => run(() => genImage({ data: { sceneId: scene.id } }), setLoadingImage, "Imagem gerada ✨", "Gerar imagem")}
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
                            characterId: character.id,
                            sceneId: scene.id,
                            isFirstScene: isFirst,
                            previousSceneScript: previousScript,
                            roomName: scene.room_name,
                          },
                        }),
                      setLoadingHooks,
                      "Hooks gerados",
                    )
                  }
                  disabled={loadingHooks}
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
                            characterId: character.id,
                            sceneId: scene.id,
                            roomName: scene.room_name,
                            selectedHook: scene.selected_hook?.text ?? "",
                            isLastScene: isLast,
                            previousSceneScript: previousScript,
                          },
                        }),
                      setLoadingScripts,
                      "Roteiros gerados",
                    )
                  }
                  disabled={loadingScripts}
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
                onClick={() => run(() => genVideoP({ data: { sceneId: scene.id } }), setLoadingVideo, "Prompt gerado")}
                disabled={loadingVideo || !scene.selected_script}
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

      </CardContent>
    </Card>
  );
}
