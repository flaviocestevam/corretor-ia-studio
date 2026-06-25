import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/clientes/")({
  head: () => ({ meta: [{ title: "Clientes — Corretor IA Studio" }] }),
  component: ClientsList,
});

function ClientsList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [contact, setContact] = useState("");

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients-with-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, trade_name, contact, projects(id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nome é obrigatório");
      const { data, error } = await supabase
        .from("clients")
        .insert({ name: name.trim(), trade_name: tradeName.trim() || null, contact: contact.trim() || null })
        .select("id")
        .single();
      if (error || !data) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success("Cliente criado");
      setOpen(false);
      setName(""); setTradeName(""); setContact("");
      qc.invalidateQueries({ queryKey: ["clients-with-counts"] });
      navigate({ to: "/clientes/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">Imobiliárias atendidas — cada cliente agrupa seus imóveis.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1.5 h-4 w-4" />Novo Cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Cliente / Imobiliária</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Instagram" /></div>
              <div><Label>Nome fantasia</Label><Input value={tradeName} onChange={(e) => setTradeName(e.target.value)} placeholder="Ex: Instagram Imóveis" /></div>
              <div><Label>Contato</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="WhatsApp, e-mail..." /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Criando..." : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : (clients ?? []).length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
            Nenhum cliente ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {(clients ?? []).map((c: any) => (
            <Link key={c.id} to="/clientes/$id" params={{ id: c.id }}>
              <Card className="shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow h-full">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{c.name}</div>
                      {c.trade_name && <div className="text-xs text-muted-foreground truncate">{c.trade_name}</div>}
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-muted-foreground">
                    {(c.projects?.length ?? 0)} imóvel(is)
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
