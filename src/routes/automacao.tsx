import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listGoogleAccounts,
  createGoogleAccount,
  markAccountActive,
  markAccountExhausted,
} from "@/lib/automacao.functions";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/automacao")({
  head: () => ({
    meta: [
      { title: "Contas Google — Corretor IA Studio" },
      { name: "description", content: "Gestão de contas Google usadas na geração de imagens." },
    ],
  }),
  component: AutomacaoPage,
});

function AutomacaoPage() {
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);

  const listFn = useServerFn(listGoogleAccounts);
  const activeFn = useServerFn(markAccountActive);
  const exhaustedFn = useServerFn(markAccountExhausted);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["google_accounts"],
    queryFn: () => listFn(),
    refetchInterval: 10000,
  });

  async function setActive(id: string) {
    try {
      await activeFn({ data: { id } });
      toast.success("Conta marcada como ativa");
      qc.invalidateQueries({ queryKey: ["google_accounts"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function setExhausted(id: string) {
    try {
      await exhaustedFn({ data: { id } });
      toast.success("Conta marcada como esgotada");
      qc.invalidateQueries({ queryKey: ["google_accounts"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contas Google</h1>
        <p className="text-muted-foreground mt-1">
          Chaves de API usadas para gerar imagens de personagens e cenas. Quando uma conta
          esgota o crédito, marque como esgotada e adicione outra.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Suas contas</h2>
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1.5 h-4 w-4" />
                Adicionar conta
              </Button>
            </DialogTrigger>
            <NewAccountDialog onClose={() => setOpenNew(false)} />
          </Dialog>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Créditos usados</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead>Data de reset</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : (accounts ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhuma conta cadastrada.
                  </TableCell>
                </TableRow>
              ) : (
                (accounts ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.email}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          a.status === "ativa"
                            ? "bg-green-500 text-white"
                            : "bg-red-500 text-white"
                        }
                      >
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{a.credits_used}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.last_used_at
                        ? new Date(a.last_used_at).toLocaleDateString("pt-BR")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.reset_at ? new Date(a.reset_at).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.status === "esgotada" && (
                        <Button size="sm" variant="outline" onClick={() => setActive(a.id)}>
                          Marcar como ativa
                        </Button>
                      )}
                      {a.status === "ativa" && (
                        <Button size="sm" variant="outline" onClick={() => setExhausted(a.id)}>
                          Marcar como esgotada
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function NewAccountDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createGoogleAccount);
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!email.trim() || !apiKey.trim()) {
      toast.error("Preencha email e API key");
      return;
    }
    setSaving(true);
    try {
      await createFn({ data: { email: email.trim(), api_key: apiKey.trim() } });
      toast.success("Conta adicionada");
      setEmail("");
      setApiKey("");
      qc.invalidateQueries({ queryKey: ["google_accounts"] });
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
        <DialogTitle>Adicionar conta Google</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Email *</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
        <div>
          <Label>API key *</Label>
          <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? "Salvando..." : "Adicionar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
