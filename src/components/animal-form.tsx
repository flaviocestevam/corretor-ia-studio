import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { uploadSceneFile } from "@/lib/storage";
import { SignedImage } from "@/components/signed-image";
import type { Animal } from "@/lib/types";

export function AnimalForm({ initial, animalId }: { initial?: Partial<Animal>; animalId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [canonicalPrompt, setCanonicalPrompt] = useState(initial?.canonical_prompt ?? "");
  const [canonicalImage, setCanonicalImage] = useState<string | null>(initial?.canonical_image ?? null);

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        canonical_prompt: canonicalPrompt || null,
        canonical_image: canonicalImage,
      };
      if (animalId) {
        const { error } = await supabase.from("animals").update(payload).eq("id", animalId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("animals").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(animalId ? "Animal atualizado" : "Animal criado");
      qc.invalidateQueries({ queryKey: ["animals"] });
      navigate({ to: "/animais" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const p = await uploadSceneFile(f, "animals", "original");
      setCanonicalImage(p);
      toast.success("Foto salva");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      e.target.value = "";
    }
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return toast.error("Nome obrigatório"); mut.mutate(); }}
      className="space-y-6"
    >
      <Card>
        <CardHeader><CardTitle>Identidade</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Leo, Mel, Thor" /></div>
          <div>
            <Label>Prompt visual canônico (em português ou inglês)</Label>
            <Textarea
              value={canonicalPrompt}
              onChange={(e) => setCanonicalPrompt(e.target.value)}
              rows={4}
              placeholder="Descrição física fiel para a IA recriar o animal entre cenas (cor da pelagem, porte, marcas, tamanho aproximado em relação a humanos, etc.)"
            />
          </div>

        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Foto canônica (POV body-mount, fundo neutro)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Suba uma foto do animal já na posição POV: vista de cima do dorso, próxima aos ombros e pescoço, apontada para frente. Fundo neutro/transparente facilita a IA inserir nos cômodos.
          </p>
        </CardHeader>
        <CardContent>
          {canonicalImage ? (
            <div className="relative inline-block">
              <SignedImage path={canonicalImage} alt="" className="w-64 aspect-[9/16] rounded-md object-contain bg-muted" />
              <button type="button" onClick={() => setCanonicalImage(null)} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <Input type="file" accept="image/*" onChange={handleUpload} className="cursor-pointer border-2 border-dashed" />
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur py-3 -mx-6 px-6 border-t border-border">
        <Button type="button" variant="ghost" onClick={() => navigate({ to: "/animais" })}>Cancelar</Button>
        <Button type="submit" disabled={mut.isPending}>
          <Save className="mr-1.5 h-4 w-4" />{mut.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
