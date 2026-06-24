import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Save, Check, Shirt, User, UserSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { uploadSceneFile } from "@/lib/storage";
import { SignedImage } from "@/components/signed-image";
import type { Character, CharacterHook, CharacterCTA } from "@/lib/types";
import { useNavigate } from "@tanstack/react-router";


interface Props {
  initial?: Partial<Character>;
  characterId?: string;
}

export function CharacterForm({ initial, characterId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [shortBio, setShortBio] = useState(initial?.short_bio ?? "");
  const [personality, setPersonality] = useState(initial?.personality ?? "");
  const [speakingStyle, setSpeakingStyle] = useState(initial?.speaking_style ?? "");
  const [catchphrases, setCatchphrases] = useState<string[]>(initial?.catchphrases ?? [""]);
  const [canonicalPrompt, setCanonicalPrompt] = useState(initial?.canonical_prompt ?? "");
  const [canonicalImages, setCanonicalImages] = useState<string[]>(initial?.canonical_images ?? []);
  const [faceRef, setFaceRef] = useState<string | null>(initial?.face_reference_image ?? null);
  const [bodyRef, setBodyRef] = useState<string | null>(initial?.body_reference_image ?? null);
  const [activeOutfit, setActiveOutfit] = useState<string | null>(initial?.active_outfit_image ?? null);
  const [hooks, setHooks] = useState<CharacterHook[]>(
    initial?.hooks ?? [{ text: "", action: "", duration: 4 }],
  );
  const [ctas, setCtas] = useState<CharacterCTA[]>(initial?.ctas ?? [{ text: "", note: "" }]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        short_bio: shortBio,
        personality,
        speaking_style: speakingStyle,
        catchphrases: catchphrases.filter((c) => c.trim()) as any,
        canonical_prompt: canonicalPrompt,
        canonical_images: canonicalImages as any,
        face_reference_image: faceRef,
        body_reference_image: bodyRef,
        active_outfit_image: activeOutfit,
        hooks: hooks.filter((h) => h.text.trim()) as any,
        ctas: ctas.filter((c) => c.text.trim()) as any,
      };
      if (characterId) {
        const { error } = await supabase.from("characters").update(payload).eq("id", characterId);
        if (error) throw error;
        return characterId;
      } else {
        const { data, error } = await supabase.from("characters").insert(payload).select("id").single();
        if (error) throw error;
        return data.id as string;
      }
    },
    onSuccess: () => {
      toast.success(characterId ? "Personagem atualizado" : "Personagem criado");
      qc.invalidateQueries({ queryKey: ["characters"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      navigate({ to: "/personagens" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    try {
      const paths: string[] = [];
      for (const f of Array.from(files)) {
        const p = await uploadSceneFile(f, "characters", "original");
        paths.push(p);
      }
      setCanonicalImages((prev) => {
        const next = [...prev, ...paths];
        // se ainda não tem roupa ativa definida, marca a primeira nova como ativa
        if (!activeOutfit && paths[0]) setActiveOutfit(paths[0]);
        return next;
      });
      toast.success(`${paths.length} look(s) adicionado(s)`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      e.target.value = "";
    }
  }

  async function handleSingleUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (p: string | null) => void,
  ) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const p = await uploadSceneFile(f, "characters", "original");
      setter(p);
      toast.success("Foto salva");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      e.target.value = "";
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return toast.error("Nome é obrigatório");
        mutation.mutate();
      }}
      className="space-y-6"
    >
      <Tabs defaultValue="identidade" className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="identidade">Identidade</TabsTrigger>
          <TabsTrigger value="fotos">Fotos</TabsTrigger>
          <TabsTrigger value="looks">Looks</TabsTrigger>
          <TabsTrigger value="hooks">Hooks</TabsTrigger>
          <TabsTrigger value="ctas">CTAs</TabsTrigger>
        </TabsList>

        <TabsContent value="identidade" className="space-y-4 mt-4">
      <Card>

        <CardHeader><CardTitle>Identidade</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nome do personagem *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Corretor Sincero Demais" />
          </div>
          <div>
            <Label>Bio curta</Label>
            <Textarea value={shortBio} onChange={(e) => setShortBio(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Personalidade</Label>
            <Textarea value={personality} onChange={(e) => setPersonality(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Jeito de falar</Label>
            <Textarea value={speakingStyle} onChange={(e) => setSpeakingStyle(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Prompt visual canônico</Label>
            <Textarea
              value={canonicalPrompt}
              onChange={(e) => setCanonicalPrompt(e.target.value)}
              rows={3}
              placeholder="Descrição visual usada pela IA ao inserir o personagem nos cômodos"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bordões</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {catchphrases.map((c, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={c}
                onChange={(e) => setCatchphrases((arr) => arr.map((x, idx) => (idx === i ? e.target.value : x)))}
                placeholder="Ex: Vou falar a verdade…"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => setCatchphrases((arr) => arr.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setCatchphrases((a) => [...a, ""])}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Adicionar bordão
          </Button>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="fotos" className="space-y-4 mt-4">
      <Card>

        <CardHeader>
          <CardTitle>Fotos de referência fixas</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Sempre enviadas para a IA junto da roupa ativa. Mantêm a identidade do personagem entre cenas.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Rosto frontal</Label>
            {faceRef ? (
              <div className="relative group">
                <SignedImage path={faceRef} alt="" className="w-full aspect-[9/16] rounded-md object-contain bg-muted" />
                <button type="button" onClick={() => setFaceRef(null)} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <Input type="file" accept="image/*" onChange={(e) => handleSingleUpload(e, setFaceRef)} className="cursor-pointer border-2 border-dashed border-primary bg-primary/10 hover:bg-primary/20 text-primary file:bg-primary file:text-primary-foreground file:border-0 file:rounded-md file:px-3 file:py-1 file:mr-3 file:font-medium" />
            )}
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><UserSquare className="h-3.5 w-3.5" />Corpo inteiro</Label>
            {bodyRef ? (
              <div className="relative group">
                <SignedImage path={bodyRef} alt="" className="w-full aspect-[9/16] rounded-md object-contain bg-muted" />
                <button type="button" onClick={() => setBodyRef(null)} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <Input type="file" accept="image/*" onChange={(e) => handleSingleUpload(e, setBodyRef)} className="cursor-pointer border-2 border-dashed border-primary bg-primary/10 hover:bg-primary/20 text-primary file:bg-primary file:text-primary-foreground file:border-0 file:rounded-md file:px-3 file:py-1 file:mr-3 file:font-medium" />
            )}
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="looks" className="space-y-4 mt-4">
      <Card>

        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shirt className="h-4 w-4" />Looks / Roupas</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Suba quantas roupas quiser. A marcada como <strong>"Roupa ativa"</strong> é a que aparecerá nas cenas geradas. Troque a qualquer momento.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input type="file" accept="image/*" multiple onChange={handleImageUpload} className="cursor-pointer h-12 border-2 border-dashed border-success bg-success/10 hover:bg-success/20 text-success file:bg-success file:text-success-foreground file:border-0 file:rounded-md file:px-3 file:py-1.5 file:mr-3 file:font-medium" />
          {canonicalImages.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {canonicalImages.map((path) => {
                const isActive = path === activeOutfit;
                return (
                  <div key={path} className={`relative group border-2 rounded-lg overflow-hidden ${isActive ? "border-primary" : "border-border"}`}>
                    <SignedImage path={path} alt="" className="w-full aspect-[9/16] object-contain bg-muted" />
                    {isActive && (
                      <Badge className="absolute top-1 left-1 gap-1"><Check className="h-3 w-3" />Roupa ativa</Badge>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-background/90 backdrop-blur p-2 flex gap-1">
                      {!isActive && (
                        <Button type="button" size="sm" variant="secondary" className="flex-1 h-7 text-xs" onClick={() => setActiveOutfit(path)}>
                          Usar como roupa
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          setCanonicalImages((arr) => arr.filter((p) => p !== path));
                          if (isActive) setActiveOutfit(null);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="hooks" className="space-y-4 mt-4">
      <Card>

        <CardHeader><CardTitle>Hooks do personagem</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {hooks.map((h, i) => (
            <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Hook #{i + 1}</span>
                <Button type="button" variant="ghost" size="icon" onClick={() => setHooks((arr) => arr.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input
                value={h.text}
                onChange={(e) => setHooks((arr) => arr.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)))}
                placeholder="Texto do hook"
              />
              <Textarea
                value={h.action}
                onChange={(e) => setHooks((arr) => arr.map((x, idx) => (idx === i ? { ...x, action: e.target.value } : x)))}
                placeholder="Ação visual"
                rows={2}
              />
              <div className="flex items-center gap-2">
                <Label className="text-xs">Duração (s):</Label>
                <Input
                  type="number"
                  value={h.duration}
                  onChange={(e) => setHooks((arr) => arr.map((x, idx) => (idx === i ? { ...x, duration: +e.target.value } : x)))}
                  className="w-20"
                />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setHooks((a) => [...a, { text: "", action: "", duration: 4 }])}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Adicionar hook
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>CTAs do personagem</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {ctas.map((c, i) => (
            <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">CTA #{i + 1}</span>
                <Button type="button" variant="ghost" size="icon" onClick={() => setCtas((arr) => arr.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                value={c.text}
                onChange={(e) => setCtas((arr) => arr.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)))}
                placeholder="Texto do CTA (sempre direcionando para o link da bio)"
                rows={2}
              />
              <Input
                value={c.note ?? ""}
                onChange={(e) => setCtas((arr) => arr.map((x, idx) => (idx === i ? { ...x, note: e.target.value } : x)))}
                placeholder="Observação de estilo"
              />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setCtas((a) => [...a, { text: "", note: "" }])}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Adicionar CTA
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur py-3 -mx-6 px-6 border-t border-border">
        <Button type="button" variant="ghost" onClick={() => navigate({ to: "/personagens" })}>Cancelar</Button>
        <Button type="submit" disabled={mutation.isPending}>
          <Save className="mr-1.5 h-4 w-4" />
          {mutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
