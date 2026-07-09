/**
 * 🌐 WEBSITE IMPORTER COMPONENT
 * Permite ao cliente importar dados de seu website para alimentar o agente IA
 * Extrai produtos, preços, informações do negócio automaticamente
 */

import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { 
  Globe, 
  Upload, 
  Package, 
  DollarSign, 
  Store, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Eye,
  Trash2,
  ExternalLink,
  AlertCircle,
  Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// ============================================================================
// TIPOS
// ============================================================================

interface ExtractedProduct {
  name: string;
  description?: string;
  price?: string;
  priceValue?: number;
  currency?: string;
  category?: string;
  imageUrl?: string;
  availability?: string;
  features?: string[];
}

interface ExtractedBusinessInfo {
  businessName?: string;
  businessDescription?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  workingHours?: string;
  socialMedia?: Record<string, string>;
  paymentMethods?: string[];
  shippingInfo?: string;
  returnPolicy?: string;
  categories?: string[];
}

interface WebsiteImport {
  id: string;
  userId: string;
  websiteUrl: string;
  websiteName?: string;
  websiteDescription?: string;
  extractedProducts?: ExtractedProduct[];
  extractedInfo?: ExtractedBusinessInfo;
  formattedContext?: string;
  status: "pending" | "processing" | "completed" | "failed";
  errorMessage?: string;
  pagesScraped: number;
  productsFound: number;
  appliedToPrompt: boolean;
  appliedAt?: string;
  lastScrapedAt?: string;
  createdAt: string;
}

interface PreviewResult {
  success: boolean;
  websiteUrl: string;
  websiteName?: string;
  websiteDescription?: string;
  products: ExtractedProduct[];
  businessInfo: ExtractedBusinessInfo;
  formattedContext: string;
  productsFound: number;
  message?: string;
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export function WebsiteImporter() {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [selectedImport, setSelectedImport] = useState<WebsiteImport | null>(null);
  const [pollingImportId, setPollingImportId] = useState<string | null>(null);

  // Query para listar importações existentes
  const { data: imports, isLoading: loadingImports, refetch: refetchImports } = useQuery<WebsiteImport[]>({
    queryKey: ["/api/agent/website-imports"],
    refetchInterval: pollingImportId ? 3000 : false, // Poll se tiver import em andamento
  });

  // Efeito para parar polling quando import completar
  useEffect(() => {
    if (pollingImportId && imports) {
      const importInProgress = imports.find(i => i.id === pollingImportId);
      if (importInProgress && importInProgress.status !== "processing") {
        setPollingImportId(null);
        if (importInProgress.status === "completed") {
          toast({
            title: "✅ Importação Concluída!",
            description: `${importInProgress.productsFound} produtos extraídos de ${importInProgress.websiteName || importInProgress.websiteUrl}`,
          });
        } else if (importInProgress.status === "failed") {
          toast({
            title: "❌ Falha na Importação",
            description: importInProgress.errorMessage || "Não foi possível acessar o website",
            variant: "destructive",
          });
        }
      }
    }
  }, [imports, pollingImportId, toast]);

  // Mutation para preview
  const previewMutation = useMutation({
    mutationFn: async (websiteUrl: string) => {
      const response = await apiRequest("POST", "/api/agent/website-imports/preview", { url: websiteUrl });
      return await response.json();
    },
    onSuccess: (data: PreviewResult) => {
      if (data.success) {
        setPreviewData(data);
        setIsPreviewOpen(true);
      } else {
        toast({
          title: "Erro ao analisar",
          description: data.message || "Não foi possível extrair dados deste website",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para iniciar importação
  const importMutation = useMutation({
    mutationFn: async (websiteUrl: string) => {
      const response = await apiRequest("POST", "/api/agent/import-website", { url: websiteUrl });
      return await response.json();
    },
    onSuccess: (data) => {
      setUrl("");
      setPollingImportId(data.id);
      toast({
        title: "🔄 Importação Iniciada",
        description: "Analisando website... Isso pode levar alguns segundos.",
      });
      refetchImports();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao importar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para aplicar ao agente
  const applyMutation = useMutation({
    mutationFn: async (importId: string) => {
      const response = await apiRequest("POST", `/api/agent/website-imports/${importId}/apply`, {});
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Aplicado ao Agente!",
        description: `${data.productsAdded} produtos/serviços adicionados ao contexto do seu agente.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/config"] });
      refetchImports();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao aplicar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para excluir importação
  const deleteMutation = useMutation({
    mutationFn: async (importId: string) => {
      const response = await apiRequest("DELETE", `/api/agent/website-imports/${importId}`, {});
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Importação excluída",
      });
      refetchImports();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePreview = () => {
    if (!url.trim()) {
      toast({
        title: "URL obrigatória",
        description: "Digite a URL do website que deseja importar",
        variant: "destructive",
      });
      return;
    }
    previewMutation.mutate(url.trim());
  };

  const handleImport = () => {
    if (!url.trim()) {
      toast({
        title: "URL obrigatória",
        description: "Digite a URL do website que deseja importar",
        variant: "destructive",
      });
      return;
    }
    importMutation.mutate(url.trim());
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Concluído</Badge>;
      case "processing":
        return <Badge className="bg-blue-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processando</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Falhou</Badge>;
      default:
        return <Badge variant="outline">Pendente</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          Importar Website
        </CardTitle>
        <CardDescription>
          Cole a URL do seu website para extrair automaticamente produtos, preços e informações do negócio.
          Nossa IA analisa o site e organiza os dados para alimentar seu agente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input de URL */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Label htmlFor="website-url" className="sr-only">URL do Website</Label>
            <Input
              id="website-url"
              type="url"
              placeholder="https://www.seusite.com.br"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={importMutation.isPending || previewMutation.isPending}
            />
          </div>
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={!url.trim() || previewMutation.isPending}
          >
            {previewMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            <span className="ml-2 hidden sm:inline">Preview</span>
          </Button>
          <Button
            onClick={handleImport}
            disabled={!url.trim() || importMutation.isPending}
          >
            {importMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span className="ml-2">Importar</span>
          </Button>
        </div>

        {/* Dica */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
          <Sparkles className="w-4 h-4 mt-0.5 text-yellow-500" />
          <span>
            <strong>Dica:</strong> Funciona melhor com lojas virtuais e sites com produtos estruturados.
            A IA vai analisar o conteúdo e extrair informações úteis para seu agente.
          </span>
        </div>

        <Separator />

        {/* Lista de Importações */}
        <div>
          <h4 className="text-sm font-medium mb-2">Histórico de Importações</h4>
          
          {loadingImports ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : imports && imports.length > 0 ? (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {imports.map((imp) => (
                  <div
                    key={imp.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Store className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium truncate">
                          {imp.websiteName || new URL(imp.websiteUrl).hostname}
                        </span>
                        {getStatusBadge(imp.status)}
                        {imp.appliedToPrompt && (
                          <Badge variant="outline" className="text-green-600">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Aplicado
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {imp.productsFound} produtos
                        </span>
                        <a 
                          href={imp.websiteUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-primary truncate max-w-[200px]"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {imp.websiteUrl}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {imp.status === "completed" && !imp.appliedToPrompt && (
                        <Button
                          size="sm"
                          onClick={() => applyMutation.mutate(imp.id)}
                          disabled={applyMutation.isPending}
                        >
                          {applyMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            "Aplicar"
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedImport(imp)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(imp.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma importação ainda</p>
              <p className="text-xs">Cole uma URL acima para começar</p>
            </div>
          )}
        </div>

        {/* Dialog de Preview */}
        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Preview da Importação
              </DialogTitle>
              <DialogDescription>
                Veja o que será extraído do website antes de importar
              </DialogDescription>
            </DialogHeader>

            {previewData && (
              <div className="space-y-4">
                {/* Info do Site */}
                <div className="p-3 bg-muted/50 rounded-lg">
                  <h4 className="font-medium">{previewData.websiteName || "Website"}</h4>
                  {previewData.websiteDescription && (
                    <p className="text-sm text-muted-foreground mt-1">{previewData.websiteDescription}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <ExternalLink className="w-3 h-3" />
                    <a href={previewData.websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {previewData.websiteUrl}
                    </a>
                  </div>
                </div>

                {/* Informações do Negócio */}
                {previewData.businessInfo && Object.keys(previewData.businessInfo).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Store className="w-4 h-4" />
                      Informações do Negócio
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {previewData.businessInfo.contactPhone && (
                        <div><strong>Telefone:</strong> {previewData.businessInfo.contactPhone}</div>
                      )}
                      {previewData.businessInfo.contactEmail && (
                        <div><strong>Email:</strong> {previewData.businessInfo.contactEmail}</div>
                      )}
                      {previewData.businessInfo.address && (
                        <div className="col-span-2"><strong>Endereço:</strong> {previewData.businessInfo.address}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Produtos */}
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Produtos Encontrados ({previewData.productsFound})
                  </h4>
                  {previewData.products.length > 0 ? (
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-2">
                        {previewData.products.slice(0, 20).map((product, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 border rounded text-sm">
                            <span className="font-medium truncate flex-1">{product.name}</span>
                            {product.price && (
                              <Badge variant="secondary" className="ml-2">
                                <DollarSign className="w-3 h-3 mr-1" />
                                {product.price}
                              </Badge>
                            )}
                          </div>
                        ))}
                        {previewData.products.length > 20 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            ... e mais {previewData.products.length - 20} produtos
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">
                      Nenhum produto estruturado encontrado. A IA vai tentar identificar os dados no conteúdo da página.
                    </p>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => {
                  setIsPreviewOpen(false);
                  if (previewData) {
                    importMutation.mutate(previewData.websiteUrl);
                  }
                }}
                disabled={importMutation.isPending}
              >
                {importMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Importar Agora
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de Detalhes da Importação */}
        <Dialog open={!!selectedImport} onOpenChange={() => setSelectedImport(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Store className="w-5 h-5" />
                {selectedImport?.websiteName || "Detalhes da Importação"}
              </DialogTitle>
            </DialogHeader>

            {selectedImport && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedImport.status)}
                  {selectedImport.appliedToPrompt && (
                    <Badge variant="outline" className="text-green-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Aplicado ao Agente
                    </Badge>
                  )}
                </div>

                {selectedImport.errorMessage && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="w-4 h-4" />
                      <span className="font-medium">Erro</span>
                    </div>
                    <p className="text-sm mt-1">{selectedImport.errorMessage}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Produtos encontrados:</strong> {selectedImport.productsFound}
                  </div>
                  <div>
                    <strong>Páginas analisadas:</strong> {selectedImport.pagesScraped}
                  </div>
                </div>

                {selectedImport.extractedProducts && selectedImport.extractedProducts.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Produtos</h4>
                    <ScrollArea className="h-[150px]">
                      <div className="space-y-1">
                        {(selectedImport.extractedProducts as ExtractedProduct[]).map((product, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                            <span>{product.name}</span>
                            {product.price && <span className="text-muted-foreground">{product.price}</span>}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedImport(null)}>
                Fechar
              </Button>
              {selectedImport?.status === "completed" && !selectedImport?.appliedToPrompt && (
                <Button 
                  onClick={() => {
                    applyMutation.mutate(selectedImport.id);
                    setSelectedImport(null);
                  }}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Aplicar ao Agente
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default WebsiteImporter;
