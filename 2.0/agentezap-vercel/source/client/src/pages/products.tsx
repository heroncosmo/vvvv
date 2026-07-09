import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Package, 
  Plus, 
  Upload, 
  Search, 
  Trash2, 
  Edit2, 
  ChevronLeft, 
  ChevronRight,
  FileSpreadsheet,
  ArrowRight,
  Check,
  X,
  Bot,
  Settings2,
  HelpCircle,
  Download,
  Globe,
  Loader2,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Product {
  id: string;
  user_id: string;
  name: string;
  price: string | null;
  stock: number;
  control_stock: boolean;
  description: string | null;
  send_description_with_images: boolean;
  category: string | null;
  image_url?: string | null;
  link: string | null;
  sku: string | null;
  unit: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  media_items?: ProductMediaItem[];
  image_count?: number;
  primary_image_url?: string | null;
}

interface ProductMediaItem {
  id: string;
  storage_url: string;
  storage_path?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  caption?: string | null;
  variation_code?: number | null;
  variation_name?: string | null;
  variation_price?: string | null;
  variation_stock?: number | null;
  variation_is_active?: boolean;
  display_order: number;
}

interface ProductMediaDraftItem {
  id: string;
  storageUrl: string;
  fileName: string;
  mimeType?: string | null;
  caption?: string | null;
  variationCode?: number | null;
  variationName: string;
  variationPrice: string;
  variationStock: string;
  variationIsActive: boolean;
  isNew: boolean;
  file?: File;
}

const PRODUCT_MEDIA_UPLOAD_MAX_BATCH_FILES = 6;
const PRODUCT_MEDIA_UPLOAD_MAX_BATCH_BYTES = 2 * 1024 * 1024;

interface ProductsResponse {
  products: Product[];
  total: number;
  page: number;
  totalPages: number;
}

interface ProductsConfig {
  id: string;
  user_id: string;
  is_active: boolean;
  send_to_ai: boolean;
  image_variations_enabled: boolean;
  ai_instructions: string;
  display_instructions: string | null;
  has_products?: boolean;
  product_count?: number;
  created_at: string;
  updated_at: string;
}

interface ImportPreview {
  headers: string[];
  sampleRows: any[][];
  totalRows: number;
  suggestedMapping: Record<string, number | null>;
}

// Campos mapeáveis para importação
const MAPPABLE_FIELDS = [
  { key: 'name', label: 'Nome do Produto', required: true },
  { key: 'price', label: 'Preço' },
  { key: 'stock', label: 'Estoque' },
  { key: 'description', label: 'Descrição' },
  { key: 'category', label: 'Categoria' },
  { key: 'image_url', label: 'Imagem (URL)' },
  { key: 'link', label: 'Link/URL' },
  { key: 'sku', label: 'SKU/Código' },
  { key: 'unit', label: 'Unidade' },
];

const PRODUCT_TAB_QUERY_KEY = "tab";

function normalizeProductsTab(tab?: string | null) {
  return tab === "configuracoes" ? "configuracoes" : "produtos";
}

function getProductsTabFromUrl() {
  return normalizeProductsTab(new URLSearchParams(window.location.search).get(PRODUCT_TAB_QUERY_KEY));
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productMediaInputRef = useRef<HTMLInputElement>(null);
  
  // Estados
  const [activeTab, setActiveTab] = useState(getProductsTabFromUrl);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  
  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Import wizard states
  const [importStep, setImportStep] = useState(1);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, number | null>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewingImport, setIsPreviewingImport] = useState(false);

  // URL Import state
  const [urlInput, setUrlInput] = useState("");
  const [isAnalyzingUrl, setIsAnalyzingUrl] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    stock: 0,
    controlStock: false,
    description: '',
    sendDescriptionWithImages: false,
    category: '',
    link: '',
    sku: '',
    unit: 'un',
    isActive: true,
  });
  const [productMediaDraft, setProductMediaDraft] = useState<ProductMediaDraftItem[]>([]);
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const [isSyncingMedia, setIsSyncingMedia] = useState(false);
  const [lastResolvedProductsData, setLastResolvedProductsData] = useState<ProductsResponse | null>(null);

  useEffect(() => {
    const syncProductsTabFromUrl = () => {
      setActiveTab(getProductsTabFromUrl());
    };

    window.addEventListener("popstate", syncProductsTabFromUrl);
    return () => window.removeEventListener("popstate", syncProductsTabFromUrl);
  }, []);

  const handleProductsTabChange = (nextTab: string) => {
    const normalizedTab = normalizeProductsTab(nextTab);
    setActiveTab(normalizedTab);

    const nextUrl = new URL(window.location.href);
    if (normalizedTab === "produtos") {
      nextUrl.searchParams.delete(PRODUCT_TAB_QUERY_KEY);
    } else {
      nextUrl.searchParams.set(PRODUCT_TAB_QUERY_KEY, normalizedTab);
    }

    window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  };

  // Build query string for products
  const buildProductsUrl = () => {
    const params = new URLSearchParams({
      page: String(currentPage),
      limit: '20',
    });
    if (searchTerm) params.set('search', searchTerm);
    if (categoryFilter !== 'all') params.set('category', categoryFilter);
    if (statusFilter !== 'all') params.set('isActive', statusFilter);
    return `/api/products?${params.toString()}`;
  };

  // Queries
  const {
    data: productsData,
    isLoading: isLoadingProducts,
    isFetching: isFetchingProducts,
    isError: isProductsError,
    error: productsError,
    refetch: refetchProducts,
  } = useQuery<ProductsResponse>({
    queryKey: [buildProductsUrl()],
    placeholderData: keepPreviousData,
  });

  const {
    data: categories,
    refetch: refetchCategories,
  } = useQuery<string[]>({
    queryKey: ["/api/products/categories"],
  });

  const {
    data: config,
    isLoading: isLoadingConfig,
    isError: isConfigError,
    error: configError,
    refetch: refetchConfig,
  } = useQuery<ProductsConfig>({
    queryKey: ["/api/products-config"],
  });

  useEffect(() => {
    if (productsData) {
      setLastResolvedProductsData(productsData);
    }
  }, [productsData]);

  const effectiveProductsData = productsData ?? lastResolvedProductsData;
  const effectiveProducts = effectiveProductsData?.products ?? [];
  const hasProducts = effectiveProducts.length > 0;
  const isShowingFallbackProducts = isProductsError && hasProducts;
  const productsCount = effectiveProductsData?.total || 0;
  const catalogHasProducts = typeof config?.has_products === 'boolean'
    ? config.has_products
    : productsCount > 0;

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return fallback;
  };

  const productsErrorMessage = getErrorMessage(
    productsError,
    "Não foi possível carregar o catálogo agora.",
  );

  const configErrorMessage = getErrorMessage(
    configError,
    "Não foi possível carregar as configurações do catálogo.",
  );

  const retryProductsScreen = async () => {
    await Promise.all([refetchProducts(), refetchCategories(), refetchConfig()]);
  };

  // Helper para invalidar queries de produtos
  const invalidateProductQueries = () => {
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && key.includes('/api/products');
    }});
  };

  // Mutations
  const createProductMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest('POST', '/api/products', data);
      return res.json();
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await apiRequest('PUT', `/api/products/${id}`, data);
      return res.json();
    },
  });

  const deleteProductsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest('DELETE', '/api/products', { ids });
      return res.json();
    },
    onSuccess: () => {
      invalidateProductQueries();
      setSelectedProducts([]);
      setIsDeleteDialogOpen(false);
      toast({ title: "Produto(s) removido(s) com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao remover produto(s)", variant: "destructive" });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<ProductsConfig>) => {
      const res = await apiRequest('PUT', '/api/products-config', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products-config"] });
      toast({ title: "Configuração salva!" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar configuração", variant: "destructive" });
    },
  });

  // Helpers
  const clearProductMediaDraft = () => {
    setProductMediaDraft((current) => {
      current.forEach((item) => {
        if (item.isNew && item.storageUrl.startsWith("blob:")) {
          URL.revokeObjectURL(item.storageUrl);
        }
      });
      return [];
    });
    setRemovedMediaIds([]);
    if (productMediaInputRef.current) {
      productMediaInputRef.current.value = "";
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      price: '',
      stock: 0,
      controlStock: false,
      description: '',
      sendDescriptionWithImages: false,
      category: '',
      link: '',
      sku: '',
      unit: 'un',
      isActive: true,
    });
    clearProductMediaDraft();
  };

  const buildDraftFromProduct = (product: Product | null): ProductMediaDraftItem[] => {
    if (!product?.media_items?.length) return [];

    return [...product.media_items]
      .sort((a, b) => a.display_order - b.display_order)
      .map((item) => ({
        id: item.id,
        storageUrl: item.storage_url,
        fileName: item.file_name || `Imagem ${item.display_order + 1}`,
        mimeType: item.mime_type,
        caption: item.caption || '',
        variationCode: typeof item.variation_code === "number" ? item.variation_code : null,
        variationName: item.variation_name ? String(item.variation_name) : '',
        variationPrice: item.variation_price ? String(item.variation_price) : '',
        variationStock:
          typeof item.variation_stock === "number" && Number.isFinite(item.variation_stock)
            ? String(item.variation_stock)
            : '',
        variationIsActive: item.variation_is_active !== false,
        isNew: false,
      }));
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      price: product.price || '',
      stock: product.stock,
      controlStock: product.control_stock === true,
      description: product.description || '',
      sendDescriptionWithImages: product.send_description_with_images === true,
      category: product.category || '',
      link: product.link || '',
      sku: product.sku || '',
      unit: product.unit,
      isActive: product.is_active,
    });
    clearProductMediaDraft();
    setProductMediaDraft(buildDraftFromProduct(product));
    setIsEditModalOpen(true);
  };

  const handleProductMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) {
      e.target.value = "";
      return;
    }

    const newItems = files.map((file, index) => ({
      id: `draft-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      storageUrl: URL.createObjectURL(file),
      fileName: file.name,
      mimeType: file.type,
      caption: '',
      variationCode: null,
      variationName: '',
      variationPrice: '',
      variationStock: '',
      variationIsActive: true,
      isNew: true,
      file,
    }));

    setProductMediaDraft((current) => [...current, ...newItems]);
    e.target.value = "";
  };

  const moveDraftMedia = (itemId: string, direction: -1 | 1) => {
    setProductMediaDraft((current) => {
      const index = current.findIndex((item) => item.id === itemId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const removeDraftMedia = (itemId: string) => {
    const target = productMediaDraft.find((item) => item.id === itemId);
    if (!target) return;

    if (target.isNew && target.storageUrl.startsWith("blob:")) {
      URL.revokeObjectURL(target.storageUrl);
    } else if (!target.isNew) {
      setRemovedMediaIds((current) => current.includes(itemId) ? current : [...current, itemId]);
    }

    setProductMediaDraft((current) => current.filter((item) => item.id !== itemId));
  };

  const uploadDraftMedia = async (productId: string, files: File[]) => {
    if (!files.length) return [];

    const uploadBatch = async (batchFiles: File[]): Promise<ProductMediaItem[]> => {
      const formData = new FormData();
      batchFiles.forEach((file) => formData.append("files", file));

      try {
        const response = await apiRequest("POST", `/api/products/${productId}/media/upload`, formData);
        const data = await response.json();
        return Array.isArray(data?.items) ? data.items : [];
      } catch (error) {
        const isPayloadTooLarge = error instanceof Error && error.message.startsWith("413:");
        if (!isPayloadTooLarge) {
          throw error;
        }

        if (batchFiles.length === 1) {
          throw new Error(
            `A imagem "${batchFiles[0].name}" excede o limite aceito pelo servidor. Reduza o arquivo ou envie menos imagens por vez.`,
          );
        }

        const middleIndex = Math.ceil(batchFiles.length / 2);
        const firstHalf = await uploadBatch(batchFiles.slice(0, middleIndex));
        const secondHalf = await uploadBatch(batchFiles.slice(middleIndex));
        return [...firstHalf, ...secondHalf];
      }
    };

    const batches: File[][] = [];
    let currentBatch: File[] = [];
    let currentBatchBytes = 0;

    for (const file of files) {
      const nextBatchWouldExceedFileLimit = currentBatch.length >= PRODUCT_MEDIA_UPLOAD_MAX_BATCH_FILES;
      const nextBatchWouldExceedSizeLimit =
        currentBatch.length > 0 && currentBatchBytes + file.size > PRODUCT_MEDIA_UPLOAD_MAX_BATCH_BYTES;

      if (nextBatchWouldExceedFileLimit || nextBatchWouldExceedSizeLimit) {
        batches.push(currentBatch);
        currentBatch = [];
        currentBatchBytes = 0;
      }

      currentBatch.push(file);
      currentBatchBytes += file.size;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    const uploadedItems: ProductMediaItem[] = [];

    for (const batch of batches) {
      uploadedItems.push(...await uploadBatch(batch));
    }

    return uploadedItems;
  };

  const updateDraftVariationField = (
    itemId: string,
    patch: Partial<Pick<ProductMediaDraftItem, "variationName" | "variationPrice" | "variationStock" | "variationIsActive" | "caption">>,
  ) => {
    setProductMediaDraft((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    );
  };

  const syncProductMedia = async (productId: string) => {
    setIsSyncingMedia(true);

    try {
      for (const mediaId of removedMediaIds) {
        await apiRequest("DELETE", `/api/products/${productId}/media/${mediaId}`);
      }

      const newDraftItems = productMediaDraft.filter((item) => item.isNew && item.file);
      const uploadedItems = await uploadDraftMedia(productId, newDraftItems.map((item) => item.file!));
      let uploadedIndex = 0;

      const resolvedDraftItems: ProductMediaDraftItem[] = productMediaDraft
        .map((item) => {
          if (!item.isNew) return item;
          const uploaded = uploadedItems[uploadedIndex++];
          if (!uploaded?.id) return null;
          return {
            id: String(uploaded.id),
            storageUrl: uploaded.storage_url,
            fileName: uploaded.file_name || item.fileName,
            mimeType: uploaded.mime_type,
            caption: uploaded.caption || item.caption || '',
            variationCode: typeof uploaded.variation_code === "number" ? uploaded.variation_code : null,
            variationName: item.variationName,
            variationPrice: item.variationPrice,
            variationStock: item.variationStock,
            variationIsActive: item.variationIsActive,
            isNew: false,
          } satisfies ProductMediaDraftItem;
        })
        .filter((item): item is ProductMediaDraftItem => Boolean(item));

      const orderedIds = resolvedDraftItems
        .map((item) => item.id)
        .filter((value): value is string => Boolean(value));

      if (orderedIds.length > 0) {
        await apiRequest("PUT", `/api/products/${productId}/media/reorder`, { orderedIds });
      }

      if (resolvedDraftItems.length > 0) {
        for (const item of resolvedDraftItems) {
          await apiRequest("PUT", `/api/products/${productId}/media/${item.id}`, {
            caption: item.caption || null,
            variationName: item.variationName ? item.variationName : null,
            variationPrice: item.variationPrice ? item.variationPrice : null,
            variationStock: item.variationStock ? Number(item.variationStock) : null,
            variationIsActive: item.variationIsActive,
          });
        }
      }

      setProductMediaDraft(resolvedDraftItems);
      setRemovedMediaIds([]);
    } finally {
      setIsSyncingMedia(false);
    }
  };

  const handleCreateProduct = async () => {
    try {
      const createdProduct = await createProductMutation.mutateAsync(formData);
      if (createdProduct?.id && productMediaDraft.length > 0) {
        await syncProductMedia(createdProduct.id);
      }

      invalidateProductQueries();
      setIsAddModalOpen(false);
      resetForm();
      toast({ title: "Produto criado com sucesso!" });
    } catch (error: any) {
      toast({
        title: "Erro ao criar produto",
        description: error?.message || "Não foi possível salvar o produto.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct) return;

    try {
      const updatedProduct = await updateProductMutation.mutateAsync({
        id: editingProduct.id,
        data: formData,
      });

      if (updatedProduct?.id && (productMediaDraft.length > 0 || removedMediaIds.length > 0)) {
        await syncProductMedia(updatedProduct.id);
      }

      invalidateProductQueries();
      setIsEditModalOpen(false);
      setEditingProduct(null);
      resetForm();
      toast({ title: "Produto atualizado com sucesso!" });
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar produto",
        description: error?.message || "Não foi possível atualizar o produto.",
        variant: "destructive",
      });
    }
  };

  const renderProductMediaManager = () => (
    <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-medium">Galeria do produto</div>
          <p className="text-xs text-muted-foreground">
            Anexe uma ou mais imagens. A IA envia todas na ordem abaixo quando o cliente falar desse produto.
          </p>
          {config?.image_variations_enabled ? (
            <p className="mt-1 text-xs text-emerald-700">
              Cada imagem abaixo está funcionando como uma variação deste produto, com código automático e nome/preço/estoque próprios quando você preencher.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={productMediaInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleProductMediaSelect}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => productMediaInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Anexar imagens
          </Button>
        </div>
      </div>

      {productMediaDraft.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma imagem anexada ainda.
        </div>
      ) : (
        <div className="max-h-[38vh] space-y-3 overflow-y-auto pr-1">
          {productMediaDraft.map((item, index) => (
            <div key={item.id} className="rounded-lg border bg-background p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <img
                src={item.storageUrl}
                alt={item.fileName}
                className="h-24 w-full rounded-lg border object-cover sm:w-24"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Imagem {index + 1}</div>
                <div className="truncate text-xs text-muted-foreground">{item.fileName}</div>
                {config?.image_variations_enabled ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">
                      Código {typeof item.variationCode === "number" ? item.variationCode : "será gerado"}
                    </Badge>
                    {item.variationName ? (
                      <Badge variant="outline">{item.variationName}</Badge>
                    ) : null}
                    <Badge variant={item.variationIsActive ? "default" : "secondary"}>
                      {item.variationIsActive ? "Variação ativa" : "Variação desativada"}
                    </Badge>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => moveDraftMedia(item.id, -1)}
                >
                  Subir
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={index === productMediaDraft.length - 1}
                  onClick={() => moveDraftMedia(item.id, 1)}
                >
                  Descer
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => removeDraftMedia(item.id)}
                >
                  Remover
                </Button>
              </div>
            </div>
              {config?.image_variations_enabled ? (
                <div className="mt-3 grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-4">
                  <div className="grid gap-2">
                    <Label className="text-xs">Nome da variação</Label>
                    <Input
                      value={item.variationName}
                      onChange={(e) => updateDraftVariationField(item.id, { variationName: e.target.value })}
                      placeholder="Ex: Painel redondo"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs">Preço da variação</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.variationPrice}
                      onChange={(e) => updateDraftVariationField(item.id, { variationPrice: e.target.value })}
                      placeholder="Ex: 55.00"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs">Estoque da variação</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={item.variationStock}
                      onChange={(e) => updateDraftVariationField(item.id, { variationStock: e.target.value })}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className="flex items-end justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">Variação ativa</div>
                    </div>
                    <Switch
                      checked={item.variationIsActive}
                      onCheckedChange={(checked) => updateDraftVariationField(item.id, { variationIsActive: checked })}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderProductDescriptionToggle = () => (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium">Enviar descricao junto das imagens</div>
          <p className="text-xs text-muted-foreground">
            Quando ativo, depois de enviar todas as fotos desse produto a IA manda a descricao cadastrada em uma mensagem separada no final.
          </p>
        </div>
        <Switch
          checked={formData.sendDescriptionWithImages}
          onCheckedChange={(checked) => setFormData({ ...formData, sendDescriptionWithImages: checked })}
        />
      </div>
    </div>
  );

  const renderProductStockControlToggle = () => (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium">Controlar estoque neste produto</div>
          <p className="text-xs text-muted-foreground">
            Quando ativo, se o estoque ficar zerado ou negativo a IA trata este item como indisponível e não envia imagens nem descrição automática.
          </p>
          <p className="text-xs text-muted-foreground">
            Quando desligado, a IA ignora o estoque deste produto e continua seguindo o prompt normalmente.
          </p>
        </div>
        <Switch
          checked={formData.controlStock}
          onCheckedChange={(checked) => setFormData({ ...formData, controlStock: checked })}
        />
      </div>
    </div>
  );

  const handleSelectAll = () => {
    if (selectedProducts.length === effectiveProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(effectiveProducts.map((p) => p.id));
    }
  };

  const toggleProductSelection = (id: string) => {
    setSelectedProducts(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const formatPrice = (price: string | null) => {
    if (!price) return '-';
    const num = parseFloat(price);
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Import handlers
  const previewImportFile = async (file: File) => {
    if (!file) return;

    setIsPreviewingImport(true);
    setImportFile(file);
    setImportStep(2);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiRequest('POST', '/api/products/import/preview', formData);
      const preview = await response.json();
      setImportPreview(preview);
      setColumnMapping(preview.suggestedMapping);
    } catch (error: any) {
      toast({
        title: "Erro ao processar arquivo",
        description: error?.message || "Verifique se o arquivo é Excel ou CSV válido.",
        variant: "destructive",
      });
      setImportStep(1);
      setImportFile(null);
    } finally {
      setIsPreviewingImport(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await previewImportFile(file);
  };

  const handleImportDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await previewImportFile(file);
  };

  const handleUrlAnalyze = async () => {
    if (!urlInput) return;
    
    setIsAnalyzingUrl(true);
    try {
      const res = await apiRequest('POST', '/api/products/import-url', { url: urlInput });
      const data = await res.json();
      
      // data.products should be [{ name, price, description, image, link }]
      const headers = ['Nome', 'Preço', 'Descrição', 'Imagem', 'Link', 'Categoria', 'SKU'];
      const rows = data.products.map((p: any) => [
        p.name, 
        p.price, 
        p.description || '', 
        p.image || '', 
        p.link || urlInput,
        p.category || '',
        p.sku || ''
      ]);
      
      // Generate CSV content for the backend to parse
      const csvContent = [
        headers.join(','), 
        ...rows.map((row: any[]) => 
          row.map((cell: any) => {
            const str = String(cell || '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          }).join(',')
        )
      ].join('\n');
      
      setImportFile(new File([csvContent], "import-website.csv", { type: 'text/csv' }));

      // Pre-map columns
      const mapping = {
        name: 0,
        price: 1,
        description: 2,
        image_url: 3,
        link: 4,
        category: 5,
        sku: 6, 
        stock: null,
        unit: null
      };

      setImportPreview({
        headers,
        sampleRows: rows.slice(0, 10),
        totalRows: rows.length,
        suggestedMapping: mapping
      });

      setColumnMapping(mapping);
      
      setImportStep(2);
      toast({ title: "Site analisado com sucesso!", description: `${rows.length} produtos encontrados.` });
      
    } catch (error: any) {
      console.error('Erro ao analisar site:', error);
      toast({ 
        title: "Erro ao analisar site", 
        description: error.message || "Verifique a URL ou tente novamente.",
        variant: "destructive" 
      });
    } finally {
      setIsAnalyzingUrl(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    
    setIsImporting(true);
    
    const formData = new FormData();
    formData.append('file', importFile);
    formData.append('columnMapping', JSON.stringify(columnMapping));
    
    try {
      const response = await apiRequest('POST', '/api/products/import', formData);
      
      const result = await response.json();
      /*
      
        throw new Error(result.message || 'Erro na importação');
      }
      
      // Usar a função de invalidação que funciona com predicate
      invalidateProductQueries();
      
      // Mensagem detalhada sobre criados vs atualizados
      */
      invalidateProductQueries();
      const insertedMsg = result.inserted > 0 ? `${result.inserted} criado(s)` : '';
      const updatedMsg = result.updated > 0 ? `${result.updated} atualizado(s)` : '';
      const description = [insertedMsg, updatedMsg].filter(Boolean).join(', ') || result.message;
      
      toast({ 
        title: "Importação concluída!",
        description,
      });
      
      // Reset import state
      setIsImportModalOpen(false);
      setImportStep(1);
      setImportFile(null);
      setImportPreview(null);
      setColumnMapping({});
      
    } catch (error: any) {
      toast({ 
        title: "Erro na importação", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setIsImporting(false);
    }
  };

  const resetImport = () => {
    setImportStep(1);
    setImportFile(null);
    setImportPreview(null);
    setColumnMapping({});
    setUrlInput("");
    setIsAnalyzingUrl(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 pb-28 md:pb-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Catálogo de Produtos
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seus produtos e preços. A IA usará esta lista para responder sobre produtos.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end md:w-auto">
          {/* Toggle IA - Acesso Rápido no Topo */}
          {config && (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/50 px-4 py-2 sm:justify-start">
              <Bot className={`h-4 w-4 ${config.send_to_ai ? 'text-green-600' : 'text-muted-foreground'}`} />
              <span className="text-sm font-medium">
                {catalogHasProducts ? `Lista ${config.send_to_ai ? 'Ativa' : 'Inativa'}` : 'Sem produtos'}
              </span>
              <Switch
                checked={config.send_to_ai || false}
                disabled={!catalogHasProducts}
                onCheckedChange={(checked) => updateConfigMutation.mutate({ send_to_ai: checked })}
              />
            </div>
          )}
          
          <Button 
            variant="outline" 
            className="w-full sm:w-auto"
            onClick={() => {
              setIsImportModalOpen(true);
              resetImport();
            }}
          >
            <Upload className="h-4 w-4 mr-2" />
            Importar Planilha
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => {
            resetForm();
            setIsAddModalOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Produto
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleProductsTabChange}>
        <TabsList className="mb-4 grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 sm:grid-cols-2">
          <TabsTrigger value="produtos" className="w-full justify-start rounded-lg border bg-background px-3 py-2 text-left sm:justify-center">
            <Package className="h-4 w-4 mr-2" />
            Produtos ({productsCount})
          </TabsTrigger>
          <TabsTrigger value="configuracoes" className="w-full justify-start rounded-lg border bg-background px-3 py-2 text-left sm:justify-center">
            <Settings2 className="h-4 w-4 mr-2" />
            Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="produtos">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-4 md:flex-row md:justify-between">
                {/* Search and filters */}
                <div className="flex flex-1 flex-col gap-2 lg:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar produtos..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="pl-9"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-full lg:w-[180px]">
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas categorias</SelectItem>
                      {categories?.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-full lg:w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="true">Ativos</SelectItem>
                      <SelectItem value="false">Inativos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Bulk actions */}
                {selectedProducts.length > 0 && (
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir ({selectedProducts.length})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isShowingFallbackProducts && (
                <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Atualização do catálogo falhou, mantendo a última lista carregada</div>
                      <p className="text-xs text-amber-800">
                        {productsErrorMessage}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={retryProductsScreen} disabled={isFetchingProducts}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isFetchingProducts ? "animate-spin" : ""}`} />
                    Tentar novamente
                  </Button>
                </div>
              )}

              {isConfigError && (
                <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <div className="text-sm font-medium">As configurações do catálogo não carregaram por completo</div>
                      <p className="text-xs text-amber-800">{configErrorMessage}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchConfig()} disabled={isLoadingConfig}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingConfig ? "animate-spin" : ""}`} />
                    Recarregar configurações
                  </Button>
                </div>
              )}

              {isLoadingProducts && !hasProducts ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : isProductsError && !hasProducts ? (
                <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 px-6 py-12 text-center">
                  <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-600" />
                  <h3 className="mb-2 text-lg font-medium text-amber-950">Não foi possível carregar o catálogo agora</h3>
                  <p className="mx-auto mb-5 max-w-xl text-sm text-amber-900">
                    {productsErrorMessage}
                  </p>
                  <div className="flex flex-col justify-center gap-2 sm:flex-row">
                    <Button variant="outline" onClick={retryProductsScreen} disabled={isFetchingProducts}>
                      <RefreshCw className={`mr-2 h-4 w-4 ${isFetchingProducts ? "animate-spin" : ""}`} />
                      Tentar novamente
                    </Button>
                    <Button variant="ghost" onClick={() => window.location.reload()}>
                      Recarregar página
                    </Button>
                  </div>
                </div>
              ) : !hasProducts ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhum produto cadastrado</h3>
                  <p className="text-muted-foreground mb-4">
                    Adicione seus produtos manualmente ou importe de uma planilha.
                  </p>
                  <div className="flex justify-center gap-2">
                    <Button variant="outline" onClick={() => {
                      setIsImportModalOpen(true);
                      resetImport();
                    }}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Importar Planilha
                    </Button>
                    <Button onClick={() => {
                      resetForm();
                      setIsAddModalOpen(true);
                    }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Produto
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox 
                            checked={selectedProducts.length === effectiveProducts.length && effectiveProducts.length > 0}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Preço</TableHead>
                        <TableHead className="text-center">Estoque</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {effectiveProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            <Checkbox 
                              checked={selectedProducts.includes(product.id)}
                              onCheckedChange={() => toggleProductSelection(product.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-start gap-3">
                              {product.primary_image_url ? (
                                <img
                                  src={product.primary_image_url}
                                  alt={product.name}
                                  className="h-12 w-12 rounded-lg border object-cover"
                                />
                              ) : (
                                <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                                  <Package className="h-4 w-4" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-medium">{product.name}</div>
                                {product.sku && (
                                  <div className="text-xs text-muted-foreground">SKU: {product.sku}</div>
                                )}
                                {!!product.image_count && (
                                  <div className="text-xs text-muted-foreground">
                                    {product.image_count === 1 ? "1 imagem pronta para a IA" : `${product.image_count} imagens prontas para a IA`}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {product.category ? (
                              <Badge variant="outline">{product.category}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatPrice(product.price)}
                          </TableCell>
                          <TableCell className="text-center">
                            {product.control_stock ? (
                              product.stock > 0 ? (
                                <span>{product.stock} {product.unit}</span>
                              ) : (
                                <span className="text-amber-600">Indisponível</span>
                              )
                            ) : (
                              <span className="text-muted-foreground">Sem controle</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={product.is_active ? "default" : "secondary"}>
                              {product.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => openEditModal(product)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  {effectiveProductsData && effectiveProductsData.totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-muted-foreground">
                        Mostrando {((currentPage - 1) * 20) + 1} a {Math.min(currentPage * 20, effectiveProductsData.total)} de {effectiveProductsData.total}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(p => p - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage === effectiveProductsData.totalPages}
                          onClick={() => setCurrentPage(p => p + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuracoes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Integração com a IA
              </CardTitle>
              <CardDescription>
                Configure como a IA deve usar sua lista de produtos nas conversas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoadingConfig ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : (
                <>
                  {!catalogHasProducts && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm text-amber-900">
                        Cadastre pelo menos um produto na aba <strong>Produtos</strong> para ativar o catálogo na IA.
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label className="text-base">Módulo de Produtos Ativo</Label>
                      <p className="text-sm text-muted-foreground">
                        Ativa o módulo de produtos no sistema
                      </p>
                    </div>
                    <Switch
                      checked={config?.is_active || false}
                      disabled={!catalogHasProducts}
                      onCheckedChange={(checked) => updateConfigMutation.mutate({ is_active: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label className="text-base">Enviar Produtos para a IA</Label>
                      <p className="text-sm text-muted-foreground">
                        A IA terá acesso à lista de produtos para responder perguntas
                      </p>
                    </div>
                    <Switch
                      checked={config?.send_to_ai || false}
                      disabled={!catalogHasProducts}
                      onCheckedChange={(checked) => updateConfigMutation.mutate({ send_to_ai: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label className="text-base">Variações por imagem</Label>
                      <p className="text-sm text-muted-foreground">
                        Cada imagem do produto passa a funcionar como uma variação com código automático, preço, estoque e status próprios.
                      </p>
                    </div>
                    <Switch
                      checked={config?.image_variations_enabled || false}
                      disabled={!catalogHasProducts}
                      onCheckedChange={(checked) => updateConfigMutation.mutate({ image_variations_enabled: checked })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Instruções para a IA</Label>
                    <Textarea
                      placeholder="Instruções sobre como a IA deve usar os produtos..."
                      value={config?.ai_instructions || ''}
                      onChange={(e) => updateConfigMutation.mutate({ ai_instructions: e.target.value })}
                      disabled={!catalogHasProducts || !config?.is_active || !config?.send_to_ai}
                      rows={4}
                    />
                    <p className="text-xs text-muted-foreground">
                      Diga para a IA como ela deve usar a lista de produtos (ex: informar preços, disponibilidade, etc.)
                    </p>
                  </div>

                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm text-emerald-900">
                      <strong>URL da aba:</strong> ao abrir esta área em Configurações, a página mantém o estado em{" "}
                      <code>?tab=configuracoes</code> para facilitar retorno e compartilhamento interno.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Instruções de Exibição</Label>
                    <Textarea
                      placeholder="Ex: Quando o cliente pedir a lista de produtos, mostre cada produto em uma linha com nome e preço..."
                      value={config?.display_instructions || ''}
                      onChange={(e) => updateConfigMutation.mutate({ display_instructions: e.target.value })}
                      disabled={!catalogHasProducts || !config?.is_active || !config?.send_to_ai}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      💡 Configure como a IA deve formatar a lista de produtos (ex: "Liste um por linha com emoji, nome e preço").
                    </p>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      <strong>📝 Dica:</strong> Para editar os produtos (nomes, preços, descrições), 
                      use a aba "Produtos". Esta seção é para configurar <em>como</em> a IA apresenta os itens.
                    </p>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-start gap-3">
                      <HelpCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium mb-1">Como funciona?</p>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          <li>Quando ativado, a lista de produtos ativos é enviada junto com cada mensagem à IA</li>
                          <li>A IA poderá responder perguntas sobre preços, disponibilidade e detalhes dos produtos</li>
                          <li>Se o produto estiver com controle de estoque ativo e saldo zerado, a IA trata como indisponível</li>
                          <li>Produtos inativos não são enviados à IA</li>
                          <li>Com variações por imagem ativas, cada foto pode ter código, preço e estoque próprios</li>
                          <li>Mantenha a lista atualizada para respostas precisas</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Product Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle>Novo Produto</DialogTitle>
            <DialogDescription>
              Adicione um novo produto ao seu catálogo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome do Produto *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Camiseta Básica M"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="price">Preço</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="stock">Estoque</Label>
                <Input
                  id="stock"
                  type="number"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.controlStock
                    ? "Saldo usado pela IA para decidir se o produto está disponível agora."
                    : "Saldo informativo. Com o controle desligado, a IA não bloqueia o atendimento por estoque."}
                </p>
              </div>
            </div>
            {renderProductStockControlToggle()}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="category">Categoria</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Ex: Vestuário"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sku">SKU/Código</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="Ex: CAM-001"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição do produto..."
                rows={3}
              />
            </div>
            {renderProductDescriptionToggle()}
            {renderProductMediaManager()}
            <div className="grid gap-2">
              <Label htmlFor="link">Link/URL</Label>
              <Input
                id="link"
                value={formData.link}
                onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label>Produto ativo</Label>
            </div>
            </div>
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateProduct}
              disabled={!formData.name || createProductMutation.isPending || isSyncingMedia}
            >
              {(createProductMutation.isPending || isSyncingMedia) ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Product Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle>Editar Produto</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nome do Produto *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="edit-price">Preço</Label>
                <Input
                  id="edit-price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-stock">Estoque</Label>
                <Input
                  id="edit-stock"
                  type="number"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.controlStock
                    ? "Saldo usado pela IA para decidir se o produto está disponível agora."
                    : "Saldo informativo. Com o controle desligado, a IA não bloqueia o atendimento por estoque."}
                </p>
              </div>
            </div>
            {renderProductStockControlToggle()}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="edit-category">Categoria</Label>
                <Input
                  id="edit-category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-sku">SKU/Código</Label>
                <Input
                  id="edit-sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            {renderProductDescriptionToggle()}
            {renderProductMediaManager()}
            <div className="grid gap-2">
              <Label htmlFor="edit-link">Link/URL</Label>
              <Input
                id="edit-link"
                value={formData.link}
                onChange={(e) => setFormData({ ...formData, link: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label>Produto ativo</Label>
            </div>
            </div>
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleUpdateProduct}
              disabled={!formData.name || updateProductMutation.isPending || isSyncingMedia}
            >
              {(updateProductMutation.isPending || isSyncingMedia) ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog open={isImportModalOpen} onOpenChange={(open) => {
        setIsImportModalOpen(open);
        if (!open) resetImport();
      }}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
          <div className="p-6 pb-2">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Importar Produtos
              </DialogTitle>
              <DialogDescription>
                {importStep === 1 && "Escolha o método de importação."}
                {importStep === 2 && "Configure o mapeamento das colunas."}
                {importStep === 3 && "Revise e confirme a importação."}
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="px-6 py-4 flex-1 overflow-y-auto">
            {/* Progress indicator */}
            <div className="flex items-center justify-center mb-6">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    importStep >= step 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {importStep > step ? <Check className="h-4 w-4" /> : step}
                  </div>
                  {step < 3 && (
                    <div className={`w-12 h-1 ${importStep > step ? 'bg-primary' : 'bg-muted'}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Step 1: File selection or URL */}
            {importStep === 1 && (
              <div className="space-y-8 py-4">
                {/* Option 1: File */}
                <div className="text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleImportDrop}
                    className="border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Importar de Planilha</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Arraste seu arquivo Excel/CSV ou clique para selecionar
                    </p>
                    <Button variant="outline" disabled={isPreviewingImport}>
                      {isPreviewingImport ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      {isPreviewingImport ? "Lendo arquivo..." : "Selecionar Arquivo"}
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Ou importar de site</span>
                  </div>
                </div>

                {/* Option 2: URL */}
                <div className="border rounded-lg p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-medium">Extrair de Site (Beta)</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Insira a URL de uma categoria ou lista de produtos. A IA irá identificar os produtos automaticamente.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input 
                      placeholder="https://sualoja.com.br/categoria/produtos" 
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      disabled={isAnalyzingUrl}
                    />
                    <Button className="w-full sm:w-auto" onClick={handleUrlAnalyze} disabled={isAnalyzingUrl || !urlInput}>
                      {isAnalyzingUrl && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isAnalyzingUrl ? "Analisando..." : "Analisar Site"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Column mapping */}
            {importStep === 2 && importPreview && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Arquivo: <span className="font-medium">{importFile?.name}</span> ({importPreview.totalRows} linhas)
                </div>
                
                <div className="space-y-3 md:hidden">
                  {MAPPABLE_FIELDS.map((field) => (
                    <div key={field.key} className="rounded-lg border p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="font-medium">
                          {field.label}
                          {field.required && <span className="text-destructive ml-1">*</span>}
                        </div>
                        {columnMapping[field.key] !== null && columnMapping[field.key] !== undefined && importPreview.sampleRows[0] && (
                          <div className="max-w-[45%] truncate text-right text-sm text-muted-foreground">
                            {importPreview.sampleRows[0][columnMapping[field.key] as number] || '-'}
                          </div>
                        )}
                      </div>
                      <Select
                        value={columnMapping[field.key]?.toString() || 'none'}
                        onValueChange={(v) => setColumnMapping({
                          ...columnMapping,
                          [field.key]: v === 'none' ? null : parseInt(v)
                        })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não mapear</SelectItem>
                          {importPreview.headers.map((header, idx) => (
                            <SelectItem key={idx} value={idx.toString()}>
                              {header || `Coluna ${idx + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-hidden rounded-lg border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-48">Campo do Sistema</TableHead>
                        <TableHead>Coluna da Planilha</TableHead>
                        <TableHead>Amostra</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MAPPABLE_FIELDS.map((field) => (
                        <TableRow key={field.key}>
                          <TableCell className="font-medium">
                            {field.label}
                            {field.required && <span className="text-destructive ml-1">*</span>}
                          </TableCell>
                          <TableCell>
                            <Select 
                              value={columnMapping[field.key]?.toString() || 'none'}
                              onValueChange={(v) => setColumnMapping({
                                ...columnMapping,
                                [field.key]: v === 'none' ? null : parseInt(v)
                              })}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Não mapear</SelectItem>
                                {importPreview.headers.map((header, idx) => (
                                  <SelectItem key={idx} value={idx.toString()}>
                                    {header || `Coluna ${idx + 1}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {columnMapping[field.key] !== null && columnMapping[field.key] !== undefined && importPreview.sampleRows[0] && (
                              <span className="truncate max-w-[200px] block">
                                {importPreview.sampleRows[0][columnMapping[field.key] as number] || '-'}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Step 3: Confirmation */}
            {importStep === 3 && importPreview && (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Resumo da Importação</h4>
                  <ul className="space-y-1 text-sm">
                    <li>Arquivo: {importFile?.name}</li>
                    <li>Total de produtos: {importPreview.totalRows}</li>
                    <li>Campos mapeados: {Object.values(columnMapping).filter(v => v !== null).length}</li>
                  </ul>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Prévia (primeiras 3 linhas)</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {MAPPABLE_FIELDS.filter(f => columnMapping[f.key] !== null).map((field) => (
                            <TableHead key={field.key}>{field.label}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importPreview.sampleRows.slice(0, 3).map((row, rowIdx) => (
                          <TableRow key={rowIdx}>
                            {MAPPABLE_FIELDS.filter(f => columnMapping[f.key] !== null).map((field) => (
                              <TableCell key={field.key}>
                                {row[columnMapping[field.key] as number] || '-'}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            {importStep > 1 && (
              <Button variant="outline" onClick={() => setImportStep(s => s - 1)}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
            )}
            <div className="flex-1" />
            {importStep === 2 && (
              <Button onClick={() => setImportStep(3)} disabled={columnMapping.name === null || columnMapping.name === undefined}>
                Continuar
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
            {importStep === 3 && (
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Confirmar Importação
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Produtos</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedProducts.length} produto(s)? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteProductsMutation.mutate(selectedProducts)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProductsMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
