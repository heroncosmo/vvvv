import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Trash2, RotateCcw, Phone, Bot, MessageSquare, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ExclusionItem {
  id: string;
  phoneNumber: string;
  isActive: boolean;
  excludeFromFollowup: boolean;
  createdAt: string;
}

const ITEMS_PER_PAGE_OPTIONS = [25, 50, 100, 200];

export default function ExclusionList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Estado para importação em massa
  const [bulkNumbers, setBulkNumbers] = useState("");
  const [protectionEnabled, setProtectionEnabled] = useState(true);
  const [followupProtection, setFollowupProtection] = useState(true);
  
  // Estado para paginação - Ativos
  const [activeCurrentPage, setActiveCurrentPage] = useState(1);
  const [activeItemsPerPage, setActiveItemsPerPage] = useState(50);
  const [activeSearchTerm, setActiveSearchTerm] = useState("");
  
  // Estado para paginação - Inativos
  const [inactiveCurrentPage, setInactiveCurrentPage] = useState(1);
  const [inactiveItemsPerPage, setInactiveItemsPerPage] = useState(50);
  const [inactiveSearchTerm, setInactiveSearchTerm] = useState("");

  // Buscar lista de exclusão
  const { data: exclusionListData, isLoading } = useQuery<ExclusionItem[]>({
    queryKey: ["/api/exclusion/list"],
  });

  // Garantir que sempre seja um array válido
  const exclusionList = Array.isArray(exclusionListData) ? exclusionListData : [];

  // Separar ativos e inativos com busca
  const { activeItems, inactiveItems } = useMemo(() => {
    if (!exclusionList || !Array.isArray(exclusionList)) {
      return { activeItems: [], inactiveItems: [] };
    }
    
    // Todos os itens são "ativos" (na lista), já que não há soft delete
    // O isActive controla se a proteção está ativa ou não
    const allItems = exclusionList.filter(item => item);
    
    // Aplicar filtro de busca
    const filteredItems = activeSearchTerm 
      ? allItems.filter(item => item.phoneNumber?.includes(activeSearchTerm))
      : allItems;
    
    return { 
      activeItems: filteredItems, 
      inactiveItems: [] // Não há itens inativos (soft delete não existe)
    };
  }, [exclusionList, activeSearchTerm]);

  // Calcular paginação - Ativos
  const activePagination = useMemo(() => {
    const items = activeItems || [];
    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / activeItemsPerPage));
    const startIndex = (activeCurrentPage - 1) * activeItemsPerPage;
    const endIndex = startIndex + activeItemsPerPage;
    const paginatedItems = items.slice(startIndex, endIndex);
    
    return {
      totalItems,
      totalPages,
      startIndex,
      endIndex: Math.min(endIndex, totalItems),
      paginatedItems,
      hasNext: activeCurrentPage < totalPages,
      hasPrev: activeCurrentPage > 1
    };
  }, [activeItems, activeCurrentPage, activeItemsPerPage]);

  // Calcular paginação - Inativos
  const inactivePagination = useMemo(() => {
    const items = inactiveItems || [];
    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / inactiveItemsPerPage));
    const startIndex = (inactiveCurrentPage - 1) * inactiveItemsPerPage;
    const endIndex = startIndex + inactiveItemsPerPage;
    const paginatedItems = items.slice(startIndex, endIndex);
    
    return {
      totalItems,
      totalPages,
      startIndex,
      endIndex: Math.min(endIndex, totalItems),
      paginatedItems,
      hasNext: inactiveCurrentPage < totalPages,
      hasPrev: inactiveCurrentPage > 1
    };
  }, [inactiveItems, inactiveCurrentPage, inactiveItemsPerPage]);

  // Reset página quando mudar itens por página ou busca
  const handleActiveItemsPerPageChange = (value: string) => {
    setActiveItemsPerPage(Number(value));
    setActiveCurrentPage(1);
  };

  const handleInactiveItemsPerPageChange = (value: string) => {
    setInactiveItemsPerPage(Number(value));
    setInactiveCurrentPage(1);
  };

  const handleActiveSearchChange = (value: string) => {
    setActiveSearchTerm(value);
    setActiveCurrentPage(1);
  };

  const handleInactiveSearchChange = (value: string) => {
    setInactiveSearchTerm(value);
    setInactiveCurrentPage(1);
  };

  // Mutation para importação em massa
  const bulkMutation = useMutation({
    mutationFn: async (data: { numbers: string[]; isActive: boolean; excludeFromFollowup: boolean }) => {
      return apiRequest("POST", "/api/exclusion/list/bulk", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
      setBulkNumbers("");
      toast({ title: "✅ Números importados com sucesso!" });
    },
    onError: () => {
      toast({ title: "❌ Erro ao importar", variant: "destructive" });
    }
  });

  // Mutation para toggle individual
  const toggleMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: boolean }) => {
      return apiRequest("PUT", `/api/exclusion/list/${id}`, { [field]: value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
    },
    onError: () => {
      toast({ title: "❌ Erro ao atualizar", variant: "destructive" });
    }
  });

  // Mutation para excluir permanente
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/exclusion/list/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
      toast({ title: "🗑️ Número removido!" });
    },
    onError: () => {
      toast({ title: "❌ Erro ao remover", variant: "destructive" });
    }
  });

  // Mutation para reativar
  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/exclusion/list/${id}/reactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
      toast({ title: "✅ Número reativado!" });
    },
    onError: () => {
      toast({ title: "❌ Erro ao reativar", variant: "destructive" });
    }
  });

  // Parser de números
  const parseNumbers = (text: string): string[] => {
    return text
      .split(/[\n,;|\s]+/)
      .map(n => n.replace(/\D/g, ""))
      .filter(n => n.length >= 10 && n.length <= 15);
  };

  const handleBulkImport = () => {
    const numbers = parseNumbers(bulkNumbers);
    if (numbers.length === 0) {
      toast({ title: "⚠️ Nenhum número válido encontrado", variant: "destructive" });
      return;
    }
    bulkMutation.mutate({
      numbers,
      isActive: protectionEnabled,
      excludeFromFollowup: followupProtection
    });
  };

  const formatPhone = (phone: string | undefined | null) => {
    if (!phone) return '';
    if (phone.length === 13) {
      return `+${phone.slice(0,2)} (${phone.slice(2,4)}) ${phone.slice(4,9)}-${phone.slice(9)}`;
    }
    return phone;
  };

  // Componente de Paginação
  const PaginationControls = ({ 
    currentPage, 
    totalPages, 
    totalItems,
    startIndex,
    endIndex,
    hasNext, 
    hasPrev,
    onPageChange,
    itemsPerPage,
    onItemsPerPageChange,
    searchTerm,
    onSearchChange,
    label
  }: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    startIndex: number;
    endIndex: number;
    hasNext: boolean;
    hasPrev: boolean;
    onPageChange: (page: number) => void;
    itemsPerPage: number;
    onItemsPerPageChange: (value: string) => void;
    searchTerm: string;
    onSearchChange: (value: string) => void;
    label: string;
  }) => (
    <div className="space-y-3">
      {/* Busca e Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar número..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Por página:</span>
          <Select value={String(itemsPerPage)} onValueChange={onItemsPerPageChange}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEMS_PER_PAGE_OPTIONS.map(opt => (
                <SelectItem key={opt} value={String(opt)}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Info e Controles de Página */}
      {totalItems > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-muted/50 rounded-lg p-3">
          <div className="text-sm text-muted-foreground">
            Mostrando <span className="font-medium text-foreground">{startIndex + 1}</span> a{" "}
            <span className="font-medium text-foreground">{endIndex}</span> de{" "}
            <span className="font-medium text-foreground">{totalItems}</span> {label}
          </div>
          
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(1)}
                disabled={!hasPrev}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={!hasPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center gap-1 px-2">
                <span className="text-sm font-medium">{currentPage}</span>
                <span className="text-sm text-muted-foreground">/</span>
                <span className="text-sm text-muted-foreground">{totalPages}</span>
              </div>
              
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={!hasNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(totalPages)}
                disabled={!hasNext}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Lista de Exclusão</h1>
        <p className="text-muted-foreground">
          Gerencie números que não devem receber IA ou follow-up
        </p>
      </div>

      {/* Importação em Massa */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Importar Números em Massa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Cole os números aqui (um por linha, separados por vírgula, espaço, etc.)&#10;&#10;Exemplo:&#10;5511999998888&#10;5521988887777&#10;5531977776666"
            value={bulkNumbers}
            onChange={(e) => setBulkNumbers(e.target.value)}
            rows={5}
            className="font-mono text-sm"
          />
          
          {bulkNumbers && (
            <p className="text-sm text-muted-foreground">
              {parseNumbers(bulkNumbers).length} números válidos detectados
            </p>
          )}

          {/* Toggles globais para importação */}
          <div className="flex flex-col sm:flex-row gap-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3 flex-1">
              <Bot className="h-4 w-4 text-blue-500" />
              <span className="text-sm">Bloquear IA</span>
              <Switch
                checked={protectionEnabled}
                onCheckedChange={setProtectionEnabled}
              />
            </div>
            <div className="flex items-center gap-3 flex-1">
              <MessageSquare className="h-4 w-4 text-orange-500" />
              <span className="text-sm">Bloquear Follow-up</span>
              <Switch
                checked={followupProtection}
                onCheckedChange={setFollowupProtection}
              />
            </div>
          </div>

          <Button
            onClick={handleBulkImport}
            disabled={!bulkNumbers.trim() || bulkMutation.isPending}
            className="w-full"
          >
            {bulkMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Importar Números
          </Button>
        </CardContent>
      </Card>

      {/* Lista de Números Ativos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Números Protegidos
            <span className="text-sm font-normal text-muted-foreground">
              ({activeItems.length} total)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Controles de Paginação */}
          <PaginationControls
            currentPage={activeCurrentPage}
            totalPages={activePagination.totalPages}
            totalItems={activePagination.totalItems}
            startIndex={activePagination.startIndex}
            endIndex={activePagination.endIndex}
            hasNext={activePagination.hasNext}
            hasPrev={activePagination.hasPrev}
            onPageChange={setActiveCurrentPage}
            itemsPerPage={activeItemsPerPage}
            onItemsPerPageChange={handleActiveItemsPerPageChange}
            searchTerm={activeSearchTerm}
            onSearchChange={handleActiveSearchChange}
            label="números"
          />

          {/* Lista de Itens */}
          {activePagination.paginatedItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {activeSearchTerm ? "Nenhum número encontrado com essa busca" : "Nenhum número na lista"}
            </div>
          ) : (
            <div className="grid gap-2">
              {activePagination.paginatedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 bg-muted/30 rounded-lg border"
                >
                  {/* Número */}
                  <div className="flex-1 font-mono text-sm">
                    {formatPhone(item.phoneNumber)}
                  </div>
                  
                  {/* Controles */}
                  <div className="flex items-center gap-4 flex-wrap">
                    {/* Toggle IA */}
                    <div className="flex items-center gap-2">
                      <Bot className={`h-4 w-4 ${item.isActive ? 'text-blue-500' : 'text-muted-foreground'}`} />
                      <span className="text-xs text-muted-foreground">IA</span>
                      <Switch
                        checked={item.isActive}
                        onCheckedChange={(checked) => 
                          toggleMutation.mutate({ id: item.id, field: 'isActive', value: checked })
                        }
                        disabled={toggleMutation.isPending}
                      />
                    </div>
                    
                    {/* Toggle Follow-up */}
                    <div className="flex items-center gap-2">
                      <MessageSquare className={`h-4 w-4 ${item.excludeFromFollowup ? 'text-orange-500' : 'text-muted-foreground'}`} />
                      <span className="text-xs text-muted-foreground">Follow-up</span>
                      <Switch
                        checked={item.excludeFromFollowup}
                        onCheckedChange={(checked) => 
                          toggleMutation.mutate({ id: item.id, field: 'excludeFromFollowup', value: checked })
                        }
                        disabled={toggleMutation.isPending}
                      />
                    </div>
                    
                    {/* Botão Excluir */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => deleteMutation.mutate(item.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Paginação inferior para listas grandes */}
          {activePagination.totalPages > 1 && (
            <div className="flex justify-center pt-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveCurrentPage(p => p - 1)}
                  disabled={!activePagination.hasPrev}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <span className="px-4 text-sm">
                  Página {activeCurrentPage} de {activePagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveCurrentPage(p => p + 1)}
                  disabled={!activePagination.hasNext}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de Números Inativos (Excluídos) */}
      {inactiveItems.length > 0 && (
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-muted-foreground">
              <RotateCcw className="h-5 w-5" />
              Números Removidos
              <span className="text-sm font-normal">
                ({inactiveItems.length} total)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Controles de Paginação */}
            <PaginationControls
              currentPage={inactiveCurrentPage}
              totalPages={inactivePagination.totalPages}
              totalItems={inactivePagination.totalItems}
              startIndex={inactivePagination.startIndex}
              endIndex={inactivePagination.endIndex}
              hasNext={inactivePagination.hasNext}
              hasPrev={inactivePagination.hasPrev}
              onPageChange={setInactiveCurrentPage}
              itemsPerPage={inactiveItemsPerPage}
              onItemsPerPageChange={handleInactiveItemsPerPageChange}
              searchTerm={inactiveSearchTerm}
              onSearchChange={handleInactiveSearchChange}
              label="números"
            />

            {/* Lista de Itens Inativos */}
            {inactivePagination.paginatedItems.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                Nenhum número encontrado com essa busca
              </div>
            ) : (
              <div className="grid gap-2">
                {inactivePagination.paginatedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-3 bg-muted/20 rounded-lg border border-dashed opacity-60"
                  >
                    <div className="flex-1 font-mono text-sm line-through">
                      {formatPhone(item.phoneNumber)}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => reactivateMutation.mutate(item.id)}
                      disabled={reactivateMutation.isPending}
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Reativar
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Paginação inferior */}
            {inactivePagination.totalPages > 1 && (
              <div className="flex justify-center pt-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setInactiveCurrentPage(p => p - 1)}
                    disabled={!inactivePagination.hasPrev}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Anterior
                  </Button>
                  <span className="px-4 text-sm">
                    Página {inactiveCurrentPage} de {inactivePagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setInactiveCurrentPage(p => p + 1)}
                    disabled={!inactivePagination.hasNext}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Info Box */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <div className="text-sm text-blue-800 space-y-2">
            <p><strong>💡 Como funciona:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Bloquear IA:</strong> O número não receberá respostas automáticas da IA</li>
              <li><strong>Bloquear Follow-up:</strong> O número não receberá mensagens de follow-up</li>
              <li>Você pode ativar/desativar cada proteção individualmente por número</li>
              <li>Use a busca para encontrar números específicos rapidamente</li>
              <li>Ajuste a quantidade por página conforme necessário</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
