import { useState } from "react";
import { generateSceneVideo } from "@/lib/generateVideo";
import { getSignedUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Video, Loader2, Download, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface SceneVideoSectionProps {
  sceneId: string;
  videoPrompt: string | null;
  generatedCharacterImage: string | null;
  videoStatus: string;
  generatedVideoUrl: string | null;
  videoError: string | null;
  onVideoGenerated: () => void;
}

export function SceneVideoSection({
  sceneId,
  videoPrompt,
  generatedCharacterImage,
  videoStatus,
  generatedVideoUrl,
  videoError,
  onVideoGenerated,
}: SceneVideoSectionProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerate() {
    if (!videoPrompt) return toast.error("Selecione um roteiro antes de gerar o vídeo.");
    if (!generatedCharacterImage) return toast.error("Gere a imagem da cena antes de gerar o vídeo.");

    setIsGenerating(true);
    toast.info("Gerando vídeo com Veo 3.1... Isso leva cerca de 2 minutos.");

    let result;
    try {
      const startImageUrl = /^https?:\/\//.test(generatedCharacterImage)
        ? generatedCharacterImage
        : await getSignedUrl(generatedCharacterImage, 60 * 60);
      result = await generateSceneVideo({ sceneId, videoPrompt, startImageUrl });
    } catch (e: any) {
      result = { success: false, error: e?.message || "Erro ao preparar imagem" };
    }

    setIsGenerating(false);

    if (result.success) {
      toast.success("Vídeo gerado com sucesso!");
      onVideoGenerated();
    } else {
      toast.error(result.error || "Erro ao gerar vídeo.");
    }
  }

  return (
    <div className="mt-4 pt-4 border-t space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Vídeo — Veo 3.1 Fast</span>
        </div>
        {videoStatus === "gerado" && <Badge className="bg-green-600 text-xs">Gerado</Badge>}
        {videoStatus === "gerando" && <Badge variant="secondary" className="text-xs">Gerando...</Badge>}
        {videoStatus === "erro" && <Badge variant="destructive" className="text-xs">Erro</Badge>}
      </div>

      {videoError && (
        <div className="flex items-start gap-2 text-destructive text-xs p-2 rounded bg-destructive/10">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{videoError}</span>
        </div>
      )}

      {generatedVideoUrl && videoStatus === "gerado" ? (
        <div className="space-y-2">
          <video
            src={generatedVideoUrl}
            controls
            className="w-full rounded-lg aspect-[9/16] object-cover bg-black"
          />
          <Button variant="outline" size="sm" className="w-full" asChild>
            <a href={generatedVideoUrl} download target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4 mr-2" />
              Baixar vídeo
            </a>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            Gerar novamente
          </Button>
        </div>
      ) : (
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || videoStatus === "gerando" || !generatedCharacterImage || !videoPrompt}
          className="w-full"
          size="sm"
        >
          {isGenerating || videoStatus === "gerando" ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Gerando vídeo...
            </>
          ) : (
            <>
              <Video className="h-4 w-4 mr-2" />
              Gerar vídeo (Veo 3.1 Fast)
            </>
          )}
        </Button>
      )}

      {!generatedCharacterImage && (
        <p className="text-xs text-muted-foreground text-center">
          Gere a imagem da cena primeiro para habilitar o vídeo.
        </p>
      )}
    </div>
  );
}
