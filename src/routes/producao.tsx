import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listVideoJobs,
  createVideoJob,
  reprocessVideoJob,
  approveVideoJob,
} from "@/lib/video-jobs.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, RefreshCw, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/producao")({
  head: () => ({
    meta: [
      { title: "Fila de Produção — Corretor IA Studio" },
      { name: "description", content: "Acompanhe e gerencie a fila de geração de vídeos." },
    ],
  }),
  component: ProducaoPage,
});

const STATUS_VALUES = [
  "rascunho",
  "pronto_para_gerar",
  "em_geracao",
  "gerado",
  "erro",
  "aprovado",
  "entregue",
] as const;
type Status = (typeof STATUS_VALUES)[number];

const FLOW_VALUES = ["lite", "fast", "quality"] as const;
type Flow = (typeof FLOW_VALUES)[number];

const STATUS_STYLES: Record<Status, string> = {
  rascunho: "bg-muted text-muted-foreground",
  pronto_para_gerar: "bg-blue-500 text-white",
  em_geracao: "bg-yellow-400 text-black animate-pulse",
  gerado: "bg-green-500 text-white",
  erro: "bg-red-500 text-white",
  aprovado: "bg-green-800 text-white",
  entregue: "bg-purple-600 text-white",
};

const FLOW_STYLES: Record<Flow, string> = {
  lite: "bg-muted text-muted-foreground",
  fast: "bg-blue-500 text-white",
  quality: "bg-amber-500 text-white",
};

type VideoJob = {
  id: string;
  prompt: string;
  google_account: string | null;
  attempts: number;
  status: Status;
  flow_model: Flow;
  video_url: string | null;
  character_image: string | null;
  created_at: string;
};

function truncate(text: string, n: number) {
  return text.length > n ? text.slice(0, n) + "…" : text;
}

function ProducaoPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [flowFilter, setFlowFilter] = useState<"all" | Flow>("all");
  const [openNew, setOpenNew] = useState(false);

  const listFn = useServerFn(listVideoJobs);
  const reprocessFn = useServerFn(reprocessVideoJob);
  const approveFn = useServerFn(approveVideoJob);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["video_jobs"],
    queryFn: () => listFn(),
    refetchInterval: 5000,
  });

  const filtered = useMemo(() => {
    return (jobs ?? []).filter((j) => {
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      if (flowFilter !== "all" && j.flow_model !== flowFilter) return false;
      return true;
    });
  }, [jobs, statusFilter, flowFilter]);

  async function reprocess(id: string) {
    try {
      await reprocessFn({ data: { id } });
      toast.success("Job enviado para reprocessamento");
      qc.invalidateQueries({ queryKey: ["video_jobs"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function approve(id: string) {
    try {
      await approveFn({ data: { id } });
      toast.success("Job aprovado");
      qc.invalidateQueries({ queryKey: ["video_jobs"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <TooltipProvider>
      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Fila de Produção</h1>
            <p className="text-muted-foreground mt-1">
              Jobs de geração de vídeo em tempo real.
            </p>
          </div>
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1.5 h-4 w-4" />
                Novo Job
              </Button>
            </DialogTrigger>
            <NewJobDialog onClose={() => setOpenNew(false)} />
          </Dialog>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="w-52">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {STATUS_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-52">
            <Label className="text-xs text-muted-foreground">Modelo Flow</Label>
            <Select value={flowFilter} onValueChange={(v) => setFlowFilter(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {FLOW_VALUES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Flow</TableHead>
                <TableHead>Prompt</TableHead>
                <TableHead>Conta Google</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhum job encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>
                      <Badge className={STATUS_STYLES[j.status]}>{j.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={FLOW_STYLES[j.flow_model]}>{j.flow_model}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">{truncate(j.prompt, 60)}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md whitespace-pre-wrap">
                          {j.prompt}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {j.google_account ?? "—"}
                    </TableCell>
                    <TableCell>{j.attempts}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(j.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {j.status === "erro" && (
                          <Button size="sm" variant="outline" onClick={() => reprocess(j.id)}>
                            <RefreshCw className="mr-1 h-3.5 w-3.5" />
                            Reprocessar
                          </Button>
                        )}
                        {j.status === "gerado" && (
                          <Button size="sm" onClick={() => approve(j.id)}>
                            <Check className="mr-1 h-3.5 w-3.5" />
                            Aprovar
                          </Button>
                        )}
                        {j.video_url && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(j.video_url!, "_blank")}
                          >
                            <ExternalLink className="mr-1 h-3.5 w-3.5" />
                            Ver vídeo
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}

function NewJobDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createVideoJob);
  const [prompt, setPrompt] = useState("");
  const [characterImage, setCharacterImage] = useState("");
  const [flowModel, setFlowModel] = useState<Flow>("fast");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!prompt.trim()) {
      toast.error("Prompt é obrigatório");
      return;
    }
    setSaving(true);
    try {
      await createFn({
        data: {
          prompt: prompt.trim(),
          character_image: characterImage.trim() || null,
          flow_model: flowModel,
        },
      });
      toast.success("Job criado");
      setPrompt("");
      setCharacterImage("");
      setFlowModel("fast");
      qc.invalidateQueries({ queryKey: ["video_jobs"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo Job</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Prompt *</Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="Descreva o vídeo..."
          />
        </div>
        <div>
          <Label>Character image (URL/path)</Label>
          <Input
            value={characterImage}
            onChange={(e) => setCharacterImage(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div>
          <Label>Modelo Flow</Label>
          <Select value={flowModel} onValueChange={(v) => setFlowModel(v as Flow)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLOW_VALUES.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? "Salvando..." : "Criar job"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
