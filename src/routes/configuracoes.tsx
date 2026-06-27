import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/configuracoes")({
  component: ConfiguracoesPage,
});

interface ApiKey {
  id: string;
  label: string;
  api_key: string;
  is_active: boolean;
  is_exhausted: boolean;
}

function ConfiguracoesPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadKeys() {
    const { data } = await supabase
      .from("google_api_keys")
      .select("*")
      .order("created_at", { ascending: true });
    setKeys((data as ApiKey[]) || []);
  }

  useEffect(() => {
    loadKeys();
  }, []);

  async function addKey() {
    if (!newLabel || !newKey) return toast.error("Preencha o nome e a API key.");
    if (!newKey.trim().startsWith("AIza")) {
      return toast.error(
        "API key inválida. A chave correta começa com AIza e é gerada em aistudio.google.com/apikey"
      );
    }
    if (keys.length >= 5) return toast.error("Máximo de 5 contas cadastradas.");
    setLoading(true);
    const { error } = await supabase.from("google_api_keys").insert({
      label: newLabel,
      api_key: newKey,
    });
    if (error) toast.error("Erro ao cadastrar key.");
    else {
      toast.success("API key cadastrada com sucesso!");
      setNewLabel("");
      setNewKey("");
      loadKeys();
    }
    setLoading(false);
  }

  async function removeKey(id: string) {
    await supabase.from("google_api_keys").delete().eq("id", id);
    toast.success("API key removida.");
    loadKeys();
  }

  async function resetKeys() {
    await supabase
      .from("google_api_keys")
      .update({ is_exhausted: false, exhausted_at: null })
      .eq("is_exhausted", true);
    toast.success("Cotas resetadas. Todas as contas estão ativas novamente.");
    loadKeys();
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie suas contas do Google AI Pro para geração de vídeos com Veo 3.1
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            API Keys do Google AI Pro
            <Badge variant="outline">{keys.length}/5 contas</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{k.label}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {k.api_key.slice(0, 8)}••••••••{k.api_key.slice(-4)}
                </p>
              </div>
              {k.is_exhausted ? (
                <Badge variant="destructive" className="text-xs">Cota esgotada</Badge>
              ) : (
                <Badge className="text-xs bg-green-600">Ativa</Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => removeKey(k.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {keys.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma API key cadastrada. Adicione até 5 contas abaixo.
            </p>
          )}

          {keys.length < 5 && (
            <div className="space-y-2 pt-2 border-t">
              <Input
                placeholder="Nome da conta (ex: Conta 1)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <Input
                placeholder="API Key do Google AI Studio"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                type="password"
              />
              <Button onClick={addKey} disabled={loading} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar conta
              </Button>
            </div>
          )}

          {keys.some((k) => k.is_exhausted) && (
            <Button variant="outline" onClick={resetKeys} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Resetar cotas (início do mês)
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
