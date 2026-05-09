import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";

type Sector = {
  id: string;
  name: string;
  description?: string | null;
  keywords: string[];
  autoAssignAgentId?: string | null;
  autoAssignAgentEmail?: string | null;
};

type Agent = {
  id: string;
  email: string;
  role: string;
};

export default function AdminSectorsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [formState, setFormState] = useState({
    name: "",
    description: "",
    keywordsText: "",
    autoAssignAgentId: "none",
  });

  const { data: sectorsData, isLoading } = useQuery<{ items: Sector[] }>({
    queryKey: ["/api/sectors"],
  });

  const { data: agentsData } = useQuery<{ items: Agent[] }>({
    queryKey: ["/api/sectors/agents"],
  });

  const sectors = useMemo(() => sectorsData?.items || [], [sectorsData]);
  const agents = useMemo(() => agentsData?.items || [], [agentsData]);

  const resetForm = () => {
    setFormState({
      name: "",
      description: "",
      keywordsText: "",
      autoAssignAgentId: "none",
    });
    setEditingSector(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (sector: Sector) => {
    setEditingSector(sector);
    setFormState({
      name: sector.name,
      description: sector.description || "",
      keywordsText: (sector.keywords || []).join(", "),
      autoAssignAgentId: sector.autoAssignAgentId || "none",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const keywords = formState.keywordsText
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    const payload = {
      name: formState.name.trim(),
      description: formState.description.trim() || null,
      keywords,
      autoAssignAgentId: formState.autoAssignAgentId === "none" ? null : formState.autoAssignAgentId,
    };

    try {
      if (editingSector) {
        await apiRequest("PATCH", `/api/sectors/${editingSector.id}`, payload);
        toast({ title: "Setor atualizado", description: "As mudancas foram salvas." });
      } else {
        await apiRequest("POST", "/api/sectors", payload);
        toast({ title: "Setor criado", description: "Novo setor adicionado com sucesso." });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/sectors"] });
      setDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar setor",
        description: error?.message || "Nao foi possivel salvar o setor.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (sector: Sector) => {
    const confirmDelete = window.confirm(`Excluir o setor "${sector.name}"?`);
    if (!confirmDelete) return;

    try {
      await apiRequest("DELETE", `/api/sectors/${sector.id}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/sectors"] });
      toast({ title: "Setor removido", description: "O setor foi excluido." });
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error?.message || "Nao foi possivel excluir o setor.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-slate-500 hover:text-slate-800">
            &larr; Voltar ao Painel
          </Link>
          <div>
            <h1 className="text-xl font-bold">Setores de Atendimento</h1>
            <p className="text-sm text-slate-500">Configure palavras-chave e autoatribuicao.</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Novo setor
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingSector ? "Editar setor" : "Novo setor"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sector-name">Nome</Label>
                <Input
                  id="sector-name"
                  value={formState.name}
                  onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Ex: Suporte Tecnico"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sector-description">Descricao</Label>
                <Textarea
                  id="sector-description"
                  value={formState.description}
                  onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Explique o foco do setor"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sector-keywords">Palavras-chave</Label>
                <Input
                  id="sector-keywords"
                  value={formState.keywordsText}
                  onChange={(event) => setFormState((prev) => ({ ...prev, keywordsText: event.target.value }))}
                  placeholder="Ex: bug, erro, falha, suporte"
                />
                <p className="text-xs text-muted-foreground">Separe por virgulas para criar multiplas palavras-chave.</p>
              </div>
              <div className="space-y-2">
                <Label>Autoatribuir agente</Label>
                <Select
                  value={formState.autoAssignAgentId}
                  onValueChange={(value) => setFormState((prev) => ({ ...prev, autoAssignAgentId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um agente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem autoatribuicao</SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={!formState.name.trim()}>
                {editingSector ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <main className="flex-1 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Setores cadastrados</CardTitle>
            <CardDescription>Organize os tickets e configure o roteamento automatico.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Carregando setores...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setor</TableHead>
                    <TableHead>Descricao</TableHead>
                    <TableHead>Palavras-chave</TableHead>
                    <TableHead>Autoatribuicao</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                        Nenhum setor cadastrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sectors.map((sector) => (
                      <TableRow key={sector.id}>
                        <TableCell className="font-medium">{sector.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {sector.description || "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(sector.keywords || []).length === 0 ? (
                              <span className="text-xs text-muted-foreground">Sem palavras-chave</span>
                            ) : (
                              sector.keywords.map((keyword) => (
                                <Badge key={`${sector.id}-${keyword}`} variant="secondary">
                                  {keyword}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {sector.autoAssignAgentEmail || "Sem autoatribuicao"}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(sector)}>
                            <Pencil className="w-4 h-4 mr-1" />
                            Editar
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(sector)}>
                            <Trash2 className="w-4 h-4 mr-1" />
                            Excluir
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
