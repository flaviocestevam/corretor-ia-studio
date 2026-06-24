import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { downloadAsBlob, getSignedUrl } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { SignedImage } from "@/components/signed-image";
import {
  Sparkles, Wand2, FileText, Video, Check, Copy, Download, Loader2, Trash2,
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

function ProjectDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

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

  if (isLoading) return <div className="p-10 text-muted-foreground">Carregando...</div>;
  if (!data) return <div className="p-10">Não encontrado</div>;

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

      <div className="space-y-4">
        {data.scenes.map((s, idx) => (
          <SceneCard
            key={s.id}
            scene={s}
            character={data.character}
            previousScript={idx > 0 ? data.scenes[idx - 1].selected_script : null}
            isFirst={idx === 0}
            isLast={idx === data.scenes.length - 1}
            onChange={() => qc.invalidateQueries({ queryKey: ["project", id] })}
          />
        ))}
      </div>
    </div>
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
  onChange,
}: {
  scene: Scene;
  character: Character;
  previousScript: string | null;
  isFirst: boolean;
  isLast: boolean;
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

  async function run<T>(fn: () => Promise<T>, setL: (v: boolean) => void, ok: string) {
    setL(true);
    try {
      await fn();
      toast.success(ok);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setL(false);
    }
  }

  async function pickHook(h: SceneHookOption) {
    const ctas = character.ctas ?? [];
    const cta = ctas[Math.floor(Math.random() * Math.max(ctas.length, 1))]?.text ?? "Clica no link da bio.";
    const updates = isFirst
      ? { selected_hook: h as any, selected_script: h.text, cta }
      : { selected_hook: h as any };
    const { error } = await supabase.from("scenes").update(updates).eq("id", scene.id);

    if (error) toast.error(error.message);
    else { toast.success("Hook selecionado"); onChange(); }
  }

  async function clearHook() {
    const updates = isFirst
      ? { selected_hook: null, selected_script: null, cta: null }
      : { selected_hook: null };
    const { error } = await supabase.from("scenes").update(updates).eq("id", scene.id);
    if (error) toast.error(error.message);
    else { toast.success("Seleção limpa"); onChange(); }
  }


  async function pickScript(s: string) {
    const ctas = character.ctas ?? [];
    const cta = ctas[Math.floor(Math.random() * Math.max(ctas.length, 1))]?.text ?? "Clica no link da bio.";
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

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary font-semibold">
            {scene.scene_order}
          </div>
          <div>
            <CardTitle className="text-base">{scene.room_name}</CardTitle>
            <div className="flex gap-1.5 mt-1">
              <Badge variant={statusVariant(scene.status)}>{scene.status}</Badge>
              {isFirst && <Badge variant="outline">Abertura</Badge>}
              {isLast && <Badge variant="outline">CTA final</Badge>}
            </div>
          </div>
        </div>
        {scene.status !== "aprovado" && (
          <Button size="sm" variant="outline" onClick={() => run(() => approve({ data: { sceneId: scene.id } }), () => {}, "Cena aprovada")}>
            <Check className="mr-1.5 h-3.5 w-3.5" />Aprovar
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
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
            <SignedImage path={scene.generated_character_image} alt="Gerada" className="w-full aspect-video rounded-lg border border-border" />
            <div className="mt-2 space-y-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Enquadramento</div>
                <div className="flex flex-wrap gap-1">
                  {([
                    { v: "auto", l: "✨ IA decide" },
                    { v: "selfie", l: "Selfie" },
                    { v: "meio_corpo", l: "Meio corpo" },
                    { v: "corpo_inteiro", l: "Corpo inteiro" },
                    { v: "plano_aberto", l: "Plano aberto" },
                  ] as const).map((opt) => {
                    const active = (scene.camera_framing ?? "corpo_inteiro") === opt.v;
                    return (
                      <Button
                        key={opt.v}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className="h-7 text-xs px-2"
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
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => run(() => genImage({ data: { sceneId: scene.id } }), setLoadingImage, "Imagem gerada")}
                  disabled={loadingImage || !scene.original_room_image}
                >
                  {loadingImage ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
                  Gerar imagem
                </Button>
                {scene.generated_character_image && (
                  <Button variant="ghost" size="sm" onClick={downloadGenerated}>
                    <Download className="mr-1.5 h-3 w-3" />Baixar
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* HOOKS */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Hooks ({scene.hook_options?.length ?? 0})</div>
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
              Gerar hooks
            </Button>
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

        {/* ROTEIROS */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Roteiros ({scene.script_options?.length ?? 0})</div>
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
              disabled={loadingScripts || !scene.selected_hook}
            >
              {loadingScripts ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
              Gerar roteiros
            </Button>
          </div>
          {!scene.selected_hook && scene.hook_options?.length > 0 && (
            <div className="text-xs text-muted-foreground">Selecione um hook primeiro.</div>
          )}
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

        {scene.cta && (
          <section>
            <div className="text-xs font-medium text-muted-foreground mb-1">CTA sugerido</div>
            <div className="text-sm border border-border rounded-lg p-3 bg-accent/30">{scene.cta}</div>
          </section>
        )}

        {/* PROMPTS */}
        <div className="grid md:grid-cols-2 gap-3">
          <section>
            <div className="text-xs font-medium text-muted-foreground mb-1">Prompt de imagem</div>
            <Textarea value={scene.image_prompt ?? ""} readOnly rows={4} className="text-xs" />
            {scene.image_prompt && (
              <Button size="sm" variant="ghost" className="mt-1" onClick={() => copy(scene.image_prompt!, "Prompt de imagem")}>
                <Copy className="mr-1.5 h-3 w-3" />Copiar
              </Button>
            )}
          </section>
          <section>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-medium text-muted-foreground">Prompt de vídeo</div>
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
            <Textarea value={scene.video_prompt ?? ""} readOnly rows={4} className="text-xs" />
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
