import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/supabase";
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
  UtensilsCrossed, 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  ChevronLeft, 
  ChevronRight,
  Bot,
  Settings2,
  HelpCircle,
  FolderPlus,
  ImageIcon,
  Loader2,
  Star,
  Clock,
  DollarSign,
  MapPin,
  Truck,
  Store,
  CreditCard,
  Sparkles,
  XCircle,
  User,
  ShieldCheck,
  MessageSquare
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// Interface para opções de variação (ex: Tamanho P, M, G)
interface VariationOption {
  name: string;
  price: number;
}

// Interface para um grupo de variações (ex: "Tamanho" com opções P, M, G)
interface VariationGroup {
  name: string;
  type: 'single' | 'multiple';
  required: boolean;
  options: VariationOption[];
}

type HalfHalfPricingMode = 'highest_item' | 'fixed' | 'size_map';

interface HalfHalfPricingConfig {
  enabled: boolean;
  mode: HalfHalfPricingMode;
  fixedPrice?: number | string | null;
  sizePrices?: {
    P?: number | string | null;
    M?: number | string | null;
    G?: number | string | null;
  } | null;
}

interface HalfHalfPricingForm {
  enabled: boolean;
  mode: HalfHalfPricingMode;
  fixedPrice: string;
  sizePrices: {
    P: string;
    M: string;
    G: string;
  };
}

interface MenuItem {
  id: string;
  user_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: string;
  promotional_price: string | null;
  image_url: string | null;
  preparation_time: number;
  is_available: boolean;
  is_featured: boolean;
  options: VariationGroup[];
  ingredients: string | null;
  allergens: string | null;
  serves: number;
  display_order: number;
  created_at: string;
  updated_at: string;
  menu_categories?: { id: string; name: string } | null;
}

interface MenuCategory {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  half_half_pricing?: HalfHalfPricingConfig | null;
  created_at: string;
  updated_at: string;
}

const defaultHalfHalfPricingForm = (): HalfHalfPricingForm => ({
  enabled: false,
  mode: 'highest_item',
  fixedPrice: '',
  sizePrices: {
    P: '',
    M: '',
    G: '',
  },
});

const normalizeHalfHalfPricingForm = (raw?: HalfHalfPricingConfig | null): HalfHalfPricingForm => ({
  enabled: raw?.enabled === true,
  mode: raw?.mode === 'fixed' || raw?.mode === 'size_map' ? raw.mode : 'highest_item',
  fixedPrice: raw?.fixedPrice !== null && raw?.fixedPrice !== undefined ? String(raw.fixedPrice) : '',
  sizePrices: {
    P: raw?.sizePrices?.P !== null && raw?.sizePrices?.P !== undefined ? String(raw.sizePrices.P) : '',
    M: raw?.sizePrices?.M !== null && raw?.sizePrices?.M !== undefined ? String(raw.sizePrices.M) : '',
    G: raw?.sizePrices?.G !== null && raw?.sizePrices?.G !== undefined ? String(raw.sizePrices.G) : '',
  },
});

type OpeningHoursDayConfig = {
  enabled: boolean;
  open: string;
  close: string;
};

type OpeningHoursState = Record<string, OpeningHoursDayConfig>;

const OPENING_HOURS_ACCEPT_ANYTIME_KEY = '__accept_orders_any_time';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const DAY_NAMES: Record<(typeof DAY_ORDER)[number], string> = {
  monday: 'Segunda-feira',
  tuesday: 'Terça-feira',
  wednesday: 'Quarta-feira',
  thursday: 'Quinta-feira',
  friday: 'Sexta-feira',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

const DEFAULT_DAY_CONFIG: OpeningHoursDayConfig = {
  enabled: false,
  open: '18:00',
  close: '23:00',
};

const getOpeningHoursMeta = (raw?: Record<string, any> | null) => {
  if (!raw || Array.isArray(raw)) return {};

  return Object.entries(raw).reduce((acc, [key, value]) => {
    if (!DAY_ORDER.includes(key as (typeof DAY_ORDER)[number])) {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, any>);
};

const getAcceptOrdersAnyTime = (raw?: Record<string, any> | null) =>
  raw?.[OPENING_HOURS_ACCEPT_ANYTIME_KEY] === true;

const normalizeOpeningHours = (raw?: Record<string, any> | null): OpeningHoursState => {
  return DAY_ORDER.reduce((acc, day) => {
    const source = raw?.[day] || {};
    acc[day] = {
      enabled: source.enabled === true,
      open: typeof source.open === 'string' && source.open ? source.open : DEFAULT_DAY_CONFIG.open,
      close: typeof source.close === 'string' && source.close ? source.close : DEFAULT_DAY_CONFIG.close,
    };
    return acc;
  }, {} as OpeningHoursState);
};

interface DeliveryConfig {
  id: string | null;
  user_id: string;
  is_active: boolean;
  send_to_ai: boolean;
  business_name: string | null;
  business_type: string;
  menu_send_mode?: 'text' | 'image' | 'image_text';
  delivery_fee: number;
  min_order_value: number;
  estimated_delivery_time: number;
  delivery_radius_km: number;
  payment_methods: string[];
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  accepts_cancellation: boolean;  // Novo campo: permite cancelamento pelo cliente
  opening_hours: Record<string, any>;
  ai_instructions: string;
  display_instructions: string | null;
  whatsapp_order_number: string | null;
  welcome_message?: string;
  order_confirmation_message?: string;
  order_ready_message?: string;
  out_for_delivery_message?: string;
  closed_message?: string;
  use_customer_name?: boolean;
  humanize_responses?: boolean;
  response_variation?: boolean;
  response_delay_min?: number;
  response_delay_max?: number;
  pix_settings?: {
    key: string;
    keyType: string;
    holderName: string;
    bankName: string;
    instructions: string;
    requireProof: boolean;
  };
  cash_settings?: {
    askForChange: boolean;
  };
  delivery_fee_settings?: {
    mode: 'fixed' | 'distance';
    originAddress: string;
    cityContext?: string;
    baseFee: number;
    baseDistanceKm: number;
    additionalFeePerKm: number;
    maxDistanceKm: number | null;
    fallbackFee: number;
  };
}

interface AgentMediaFlowItem {
  id?: string;
  order?: number;
  type: 'media' | 'text';
  storageUrl?: string;
  mediaType?: 'audio' | 'image' | 'video' | 'document';
  caption?: string;
  fileName?: string;
  mimeType?: string;
  text?: string;
}

interface AgentMediaItem {
  id: string;
  name: string;
  mediaType: 'audio' | 'image' | 'video' | 'document' | 'flow';
  storageUrl: string;
  caption?: string | null;
  description?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  flowItems?: AgentMediaFlowItem[] | null;
}

interface DeliveryOpeningImageDraft {
  storageUrl: string;
  caption: string;
  fileName?: string;
  sourceName?: string;
}

const DELIVERY_OPENING_FLOW_NAME = 'DELIVERY_ABERTURA';

type PixSettingsForm = {
  key: string;
  keyType: string;
  holderName: string;
  bankName: string;
  instructions: string;
  requireProof: boolean;
};

type CashSettingsForm = {
  askForChange: boolean;
};

type DeliveryFeeSettingsForm = {
  mode: 'fixed' | 'distance';
  originAddress: string;
  cityContext: string;
  baseFee: string;
  baseDistanceKm: string;
  additionalFeePerKm: string;
  maxDistanceKm: string;
  fallbackFee: string;
};

const defaultPixSettingsForm = (): PixSettingsForm => ({
  key: '',
  keyType: 'random',
  holderName: '',
  bankName: '',
  instructions: '',
  requireProof: false,
});

const defaultCashSettingsForm = (): CashSettingsForm => ({
  askForChange: true,
});

const defaultDeliveryFeeSettingsForm = (): DeliveryFeeSettingsForm => ({
  mode: 'fixed',
  originAddress: '',
  cityContext: '',
  baseFee: '0',
  baseDistanceKm: '2',
  additionalFeePerKm: '1',
  maxDistanceKm: '',
  fallbackFee: '0',
});

const toInputNumberString = (value?: number | string | null) => {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
};

const normalizePixSettingsForm = (raw?: DeliveryConfig['pix_settings'] | null): PixSettingsForm => ({
  key: raw?.key || '',
  keyType: raw?.keyType || 'random',
  holderName: raw?.holderName || '',
  bankName: raw?.bankName || '',
  instructions: raw?.instructions || '',
  requireProof: raw?.requireProof === true,
});

const normalizeCashSettingsForm = (raw?: DeliveryConfig['cash_settings'] | null): CashSettingsForm => ({
  askForChange: raw?.askForChange !== false,
});

const normalizeDeliveryFeeSettingsForm = (
  raw?: DeliveryConfig['delivery_fee_settings'] | null,
  fallbackFee = 0
): DeliveryFeeSettingsForm => ({
  mode: raw?.mode === 'distance' ? 'distance' : 'fixed',
  originAddress: raw?.originAddress || '',
  cityContext: raw?.cityContext || '',
  baseFee: toInputNumberString(raw?.baseFee ?? fallbackFee),
  baseDistanceKm: toInputNumberString(raw?.baseDistanceKm ?? 2),
  additionalFeePerKm: toInputNumberString(raw?.additionalFeePerKm ?? 1),
  maxDistanceKm: toInputNumberString(raw?.maxDistanceKm ?? ''),
  fallbackFee: toInputNumberString(raw?.fallbackFee ?? fallbackFee),
});

const parseDraftNumber = (value: string, fallback = 0) => {
  const normalized = String(value || '').trim().replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

interface ItemsResponse {
  items: MenuItem[];
  total: number;
  page: number;
  totalPages: number;
}

export default function DeliveryMenuPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Estados
  const [activeTab, setActiveTab] = useState("cardapio");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [openingHoursDraft, setOpeningHoursDraft] = useState<OpeningHoursState>(() => normalizeOpeningHours());
  const [openingHoursDirty, setOpeningHoursDirty] = useState(false);
  const [acceptOrdersAnyTime, setAcceptOrdersAnyTime] = useState(false);
  const [paymentMethodsDraft, setPaymentMethodsDraft] = useState<string[]>(['dinheiro', 'cartao', 'pix']);
  const [pixSettingsDraft, setPixSettingsDraft] = useState<PixSettingsForm>(() => defaultPixSettingsForm());
  const [cashSettingsDraft, setCashSettingsDraft] = useState<CashSettingsForm>(() => defaultCashSettingsForm());
  const [deliveryFeeSettingsDraft, setDeliveryFeeSettingsDraft] = useState<DeliveryFeeSettingsForm>(() => defaultDeliveryFeeSettingsForm());
  const [advancedConfigDirty, setAdvancedConfigDirty] = useState(false);
  const [deliveryOpeningImages, setDeliveryOpeningImages] = useState<DeliveryOpeningImageDraft[]>([]);
  const [deliveryOpeningDirty, setDeliveryOpeningDirty] = useState(false);
  const [selectedOpeningMediaUrl, setSelectedOpeningMediaUrl] = useState<string>("");
  const [isUploadingOpeningImage, setIsUploadingOpeningImage] = useState(false);

  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [orderConfirmationMessage, setOrderConfirmationMessage] = useState('');
  const [orderReadyMessage, setOrderReadyMessage] = useState('');
  const [outForDeliveryMessage, setOutForDeliveryMessage] = useState('');
  const [closedMessage, setClosedMessage] = useState('');
  
  // Modal states
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [isEditItemModalOpen, setIsEditItemModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [isUploadingCategoryImage, setIsUploadingCategoryImage] = useState(false);
  
  // Form state para item
  const [itemForm, setItemForm] = useState({
    categoryId: '',
    name: '',
    description: '',
    price: '',
    promotionalPrice: '',
    imageUrl: '',
    preparationTime: 30,
    isAvailable: true,
    isFeatured: false,
    ingredients: '',
    allergens: '',
    serves: 1,
    options: [] as VariationGroup[],
  });

  // Estado para nova variação sendo adicionada
  const [newVariation, setNewVariation] = useState<VariationGroup>({
    name: '',
    type: 'single',
    required: true,
    options: []
  });
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionPrice, setNewOptionPrice] = useState('');

  // Form state para categoria
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    imageUrl: '',
    isActive: true,
    halfHalfPricing: defaultHalfHalfPricingForm(),
  });

  // Build query string para itens
  const buildItemsUrl = () => {
    const params = new URLSearchParams({
      page: String(currentPage),
      limit: '20',
    });
    if (searchTerm) params.set('search', searchTerm);
    if (categoryFilter !== 'all') params.set('categoryId', categoryFilter);
    if (statusFilter !== 'all') params.set('isAvailable', statusFilter);
    return `/api/delivery/items?${params.toString()}`;
  };

  // Queries
  const { data: itemsData, isLoading: isLoadingItems } = useQuery<ItemsResponse>({
    queryKey: [buildItemsUrl()],
  });

  const { data: categories, isLoading: isLoadingCategories } = useQuery<MenuCategory[]>({
    queryKey: ["/api/delivery/categories"],
  });

  const { data: config, isLoading: isLoadingConfig } = useQuery<DeliveryConfig>({
    queryKey: ["/api/delivery-config"],
  });

  const { data: mediaLibrary = [] } = useQuery<AgentMediaItem[]>({
    queryKey: ["/api/agent/media"],
  });

  const imageMediaLibrary = mediaLibrary.filter((media) => media.mediaType === 'image' && !!media.storageUrl);
  const deliveryOpeningFlow = mediaLibrary.find(
    (media) => media.mediaType === 'flow' && media.name === DELIVERY_OPENING_FLOW_NAME
  );

  useEffect(() => {
    if (!config) return;
    setWelcomeMessage(config.welcome_message || '');
    setOrderConfirmationMessage(config.order_confirmation_message || '');
    setOrderReadyMessage(config.order_ready_message || '');
    setOutForDeliveryMessage(config.out_for_delivery_message || '');
    setClosedMessage(config.closed_message || '');
  }, [
    config?.welcome_message,
    config?.order_confirmation_message,
    config?.order_ready_message,
    config?.out_for_delivery_message,
    config?.closed_message,
  ]);

  useEffect(() => {
    if (!config || openingHoursDirty) return;
    setOpeningHoursDraft(normalizeOpeningHours(config.opening_hours));
    setAcceptOrdersAnyTime(getAcceptOrdersAnyTime(config.opening_hours));
  }, [config?.opening_hours, openingHoursDirty]);

  useEffect(() => {
    if (!config || advancedConfigDirty) return;
    setPaymentMethodsDraft(config.payment_methods || ['dinheiro', 'cartao', 'pix']);
    setPixSettingsDraft(normalizePixSettingsForm(config.pix_settings));
    setCashSettingsDraft(normalizeCashSettingsForm(config.cash_settings));
    setDeliveryFeeSettingsDraft(
      normalizeDeliveryFeeSettingsForm(config.delivery_fee_settings, config.delivery_fee || 0)
    );
  }, [
    config?.payment_methods,
    config?.pix_settings,
    config?.cash_settings,
    config?.delivery_fee_settings,
    config?.delivery_fee,
    advancedConfigDirty,
  ]);

  useEffect(() => {
    if (deliveryOpeningDirty) return;
    const flowItems = (deliveryOpeningFlow?.flowItems || [])
      .filter((item) => item.type === 'media' && item.mediaType === 'image' && item.storageUrl)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((item) => ({
        storageUrl: item.storageUrl!,
        caption: item.caption || '',
        fileName: item.fileName || '',
        sourceName: imageMediaLibrary.find((media) => media.storageUrl === item.storageUrl)?.name || '',
      }));
    setDeliveryOpeningImages(flowItems);
  }, [deliveryOpeningFlow, imageMediaLibrary, deliveryOpeningDirty]);

  // Helper para invalidar queries
  const invalidateDeliveryQueries = () => {
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && key.includes('/api/delivery');
    }});
  };

  // Mutations - Items
  const createItemMutation = useMutation({
    mutationFn: async (data: typeof itemForm) => {
      const res = await apiRequest('POST', '/api/delivery/items', data);
      return res.json();
    },
    onSuccess: () => {
      invalidateDeliveryQueries();
      setIsAddItemModalOpen(false);
      resetItemForm();
      toast({ title: "Item criado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao criar item", variant: "destructive" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof itemForm }) => {
      const res = await apiRequest('PUT', `/api/delivery/items/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateDeliveryQueries();
      setIsEditItemModalOpen(false);
      setEditingItem(null);
      resetItemForm();
      toast({ title: "Item atualizado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar item", variant: "destructive" });
    },
  });

  const deleteItemsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest('DELETE', '/api/delivery/items', { ids });
      return res.json();
    },
    onSuccess: () => {
      invalidateDeliveryQueries();
      setSelectedItems([]);
      setIsDeleteDialogOpen(false);
      toast({ title: "Item(s) removido(s) com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao remover item(s)", variant: "destructive" });
    },
  });

  // Mutations - Categories
  const createCategoryMutation = useMutation({
    mutationFn: async (data: typeof categoryForm) => {
      const res = await apiRequest('POST', '/api/delivery/categories', data);
      return res.json();
    },
    onSuccess: () => {
      invalidateDeliveryQueries();
      setIsCategoryModalOpen(false);
      resetCategoryForm();
      toast({ title: "Categoria criada com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao criar categoria", variant: "destructive" });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof categoryForm }) => {
      const res = await apiRequest('PUT', `/api/delivery/categories/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateDeliveryQueries();
      setIsCategoryModalOpen(false);
      setEditingCategory(null);
      resetCategoryForm();
      toast({ title: "Categoria atualizada com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar categoria", variant: "destructive" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/delivery/categories/${id}`);
      return res.json();
    },
    onSuccess: () => {
      invalidateDeliveryQueries();
      toast({ title: "Categoria removida com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao remover categoria", variant: "destructive" });
    },
  });

  // Mutation - Config
  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<DeliveryConfig>) => {
      const res = await apiRequest('PUT', '/api/delivery-config', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-config"] });
      toast({ title: "Configuração salva!" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar configuração", variant: "destructive" });
    },
  });

  // Helpers
  const resetItemForm = () => {
    setItemForm({
      categoryId: '',
      name: '',
      description: '',
      price: '',
      promotionalPrice: '',
      imageUrl: '',
      preparationTime: 30,
      isAvailable: true,
      isFeatured: false,
      ingredients: '',
      allergens: '',
      serves: 1,
      options: [],
    });
    setNewVariation({ name: '', type: 'single', required: true, options: [] });
    setNewOptionName('');
    setNewOptionPrice('');
  };

  const resetCategoryForm = () => {
    setCategoryForm({
      name: '',
      description: '',
      imageUrl: '',
      isActive: true,
      halfHalfPricing: defaultHalfHalfPricingForm(),
    });
  };

  const updateOpeningHoursDraft = (
    day: (typeof DAY_ORDER)[number],
    patch: Partial<OpeningHoursDayConfig>
  ) => {
    setOpeningHoursDraft((current) => ({
      ...current,
      [day]: {
        ...current[day],
        ...patch,
      },
    }));
    setOpeningHoursDirty(true);
  };

  const saveOpeningHours = () => {
    const openingHoursPayload = {
      ...getOpeningHoursMeta(config?.opening_hours),
      ...openingHoursDraft,
      [OPENING_HOURS_ACCEPT_ANYTIME_KEY]: acceptOrdersAnyTime,
    };

    updateConfigMutation.mutate(
      { opening_hours: openingHoursPayload },
      {
        onSuccess: () => {
          setOpeningHoursDirty(false);
        },
      }
    );
  };

  const togglePaymentMethod = (method: string, enabled: boolean) => {
    setPaymentMethodsDraft((current) => {
      const next = enabled
        ? Array.from(new Set([...current, method]))
        : current.filter((item) => item !== method);
      return next;
    });
    setAdvancedConfigDirty(true);
  };

  const saveAdvancedConfig = () => {
    const baseFee = parseDraftNumber(deliveryFeeSettingsDraft.baseFee, config?.delivery_fee || 0);
    const fallbackFee = parseDraftNumber(deliveryFeeSettingsDraft.fallbackFee, baseFee);

    updateConfigMutation.mutate(
      {
        payment_methods: paymentMethodsDraft,
        delivery_fee: baseFee,
        pix_settings: {
          key: pixSettingsDraft.key,
          keyType: pixSettingsDraft.keyType,
          holderName: pixSettingsDraft.holderName,
          bankName: pixSettingsDraft.bankName,
          instructions: pixSettingsDraft.instructions,
          requireProof: pixSettingsDraft.requireProof,
        },
        cash_settings: {
          askForChange: cashSettingsDraft.askForChange,
        },
        delivery_fee_settings: {
          mode: deliveryFeeSettingsDraft.mode,
          originAddress: deliveryFeeSettingsDraft.originAddress,
          cityContext: deliveryFeeSettingsDraft.cityContext,
          baseFee,
          baseDistanceKm: parseDraftNumber(deliveryFeeSettingsDraft.baseDistanceKm, 2),
          additionalFeePerKm: parseDraftNumber(deliveryFeeSettingsDraft.additionalFeePerKm, 1),
          maxDistanceKm: deliveryFeeSettingsDraft.maxDistanceKm.trim()
            ? parseDraftNumber(deliveryFeeSettingsDraft.maxDistanceKm, 0)
            : null,
          fallbackFee,
        },
      },
      {
        onSuccess: () => {
          setAdvancedConfigDirty(false);
        },
      }
    );
  };

  const openEditItemModal = (item: MenuItem) => {
    setEditingItem(item);
    setItemForm({
      categoryId: item.category_id || '',
      name: item.name,
      description: item.description || '',
      price: item.price,
      promotionalPrice: item.promotional_price || '',
      imageUrl: item.image_url || '',
      preparationTime: item.preparation_time,
      isAvailable: item.is_available,
      isFeatured: item.is_featured,
      ingredients: item.ingredients || '',
      allergens: item.allergens || '',
      serves: item.serves,
      options: item.options || [],
    });
    setNewVariation({ name: '', type: 'single', required: true, options: [] });
    setNewOptionName('');
    setNewOptionPrice('');
    setIsEditItemModalOpen(true);
  };

  const openEditCategoryModal = (category: MenuCategory) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description || '',
      imageUrl: category.image_url || '',
      isActive: category.is_active,
      halfHalfPricing: normalizeHalfHalfPricingForm(category.half_half_pricing),
    });
    setIsCategoryModalOpen(true);
  };

  const handleSelectAll = () => {
    if (selectedItems.length === itemsData?.items.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(itemsData?.items.map(i => i.id) || []);
    }
  };

  const toggleItemSelection = (id: string) => {
    setSelectedItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const formatPrice = (price: string | null) => {
    if (!price) return '-';
    const num = parseFloat(price);
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatNumericPrice = (price?: string | number | null) => {
    if (price === null || price === undefined || price === '') return null;
    const numericPrice = typeof price === 'number' ? price : parseFloat(String(price));
    if (!Number.isFinite(numericPrice)) return null;
    return numericPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatDraftCurrency = (price?: string | number | null, fallback = 'R$ 0,00') => {
    return formatNumericPrice(price) || fallback;
  };

  const deliveryFeeBasePreview = parseDraftNumber(deliveryFeeSettingsDraft.baseFee, config?.delivery_fee || 0);
  const deliveryFeeIncludedKm = parseDraftNumber(deliveryFeeSettingsDraft.baseDistanceKm, 2);
  const deliveryFeeAdditionalPreview = parseDraftNumber(deliveryFeeSettingsDraft.additionalFeePerKm, 1);
  const deliveryFeeFallbackPreview = parseDraftNumber(deliveryFeeSettingsDraft.fallbackFee, deliveryFeeBasePreview);
  const deliveryFeeExampleKm = Math.max(deliveryFeeIncludedKm + 2.5, 4);
  const deliveryFeeExtraKm = Math.max(0, deliveryFeeExampleKm - deliveryFeeIncludedKm);
  const deliveryFeeExampleTotal = deliveryFeeBasePreview + (deliveryFeeExtraKm * deliveryFeeAdditionalPreview);
  const deliveryFeeModeSummary = deliveryFeeSettingsDraft.mode === 'distance'
    ? `R$ ${deliveryFeeBasePreview.toFixed(2).replace('.', ',')} ate ${deliveryFeeIncludedKm.toFixed(1).replace('.', ',')} km, depois R$ ${deliveryFeeAdditionalPreview.toFixed(2).replace('.', ',')} por km extra.`
    : `R$ ${deliveryFeeBasePreview.toFixed(2).replace('.', ',')} por entrega.`;
  const deliveryFeeExampleSummary = deliveryFeeSettingsDraft.mode === 'distance'
    ? `Exemplo: uma entrega de ${deliveryFeeExampleKm.toFixed(1).replace('.', ',')} km cobra R$ ${deliveryFeeExampleTotal.toFixed(2).replace('.', ',')}.`
    : `Exemplo: qualquer endereco de entrega cobra R$ ${deliveryFeeBasePreview.toFixed(2).replace('.', ',')}.`;
  const deliveryFeeLocationReady = !!(
    deliveryFeeSettingsDraft.cityContext.trim()
    || /(^|,)\s*[^,\d]+(?:\s*[-/]\s*|\s*,\s*)[A-Za-z]{2}\s*$/.test(deliveryFeeSettingsDraft.originAddress)
  );
  const deliveryFeeNeedsCityGuidance = deliveryFeeSettingsDraft.mode === 'distance' && !deliveryFeeLocationReady;

  const getHalfHalfPricingSummary = (pricing?: HalfHalfPricingConfig | null) => {
    if (!pricing?.enabled) {
      return {
        title: 'Meio a meio desativado',
        description: 'Essa categoria segue o preço normal de cada item.',
      };
    }

    if (pricing.mode === 'fixed') {
      const formattedFixedPrice = formatNumericPrice(pricing.fixedPrice);
      return {
        title: 'Meio a meio com preço fixo',
        description: formattedFixedPrice
          ? `Toda pizza meio a meio desta categoria sai por ${formattedFixedPrice}.`
          : 'Preço fixo habilitado, mas ainda sem valor preenchido.',
      };
    }

    if (pricing.mode === 'size_map') {
      const sizeLabels = (['P', 'M', 'G'] as const)
        .map((size) => {
          const formattedPrice = formatNumericPrice(pricing.sizePrices?.[size]);
          return formattedPrice ? `${size}: ${formattedPrice}` : null;
        })
        .filter(Boolean);

      return {
        title: 'Meio a meio por tamanho',
        description: sizeLabels.length > 0
          ? sizeLabels.join(' | ')
          : 'Tabela por tamanho habilitada, mas ainda sem valores preenchidos.',
      };
    }

    return {
      title: 'Meio a meio pelo maior sabor',
      description: 'O sistema cobra automaticamente o maior preço entre os sabores.',
    };
  };

  // Buscar imagem genérica
  const fetchFoodImage = async (query: string) => {
    setIsLoadingImage(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/delivery/food-image?query=${encodeURIComponent(query)}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.imageUrl) {
        setItemForm(prev => ({ ...prev, imageUrl: data.imageUrl }));
        toast({ title: "Imagem encontrada!", description: "Imagem aplicada ao item." });
      }
    } catch (error) {
      toast({ title: "Erro ao buscar imagem", variant: "destructive" });
    } finally {
      setIsLoadingImage(false);
    }
  };

  const uploadCategoryImage = async (file: File) => {
    setIsUploadingCategoryImage(true);
    try {
      const token = await getAuthToken();
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/agent/media/upload', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
        body: formData,
      });

      const data = await res.json();
      if (data?.storageUrl) {
        setCategoryForm(prev => ({ ...prev, imageUrl: data.storageUrl }));
        toast({ title: "Imagem enviada!", description: "Imagem aplicada à categoria." });
      } else {
        throw new Error(data?.message || 'Falha ao enviar imagem');
      }
    } catch (error) {
      toast({ title: "Erro ao enviar imagem", variant: "destructive" });
    } finally {
      setIsUploadingCategoryImage(false);
    }
  };

  const saveDeliveryOpeningImages = async () => {
    try {
      const payload = {
        name: DELIVERY_OPENING_FLOW_NAME,
        mediaType: 'flow',
        storageUrl: '',
        description: 'Fluxo de imagens iniciais do delivery',
        whenToUse: 'Quando uma nova conversa do delivery comecar',
        caption: 'Abertura do delivery',
        flowItems: deliveryOpeningImages.map((image, index) => ({
          id: `${DELIVERY_OPENING_FLOW_NAME}-${index}`,
          order: index,
          type: 'media' as const,
          storageUrl: image.storageUrl,
          mediaType: 'image' as const,
          caption: image.caption || image.sourceName || 'Abertura do delivery',
          fileName: image.fileName || null,
          mimeType: 'image/*',
        })),
      };

      if (deliveryOpeningFlow?.id) {
        await apiRequest('PUT', `/api/agent/media/${deliveryOpeningFlow.id}`, payload);
      } else {
        await apiRequest('POST', '/api/agent/media', payload);
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/agent/media"] });
      setDeliveryOpeningDirty(false);
      toast({ title: 'Abertura do delivery salva!' });
    } catch (error) {
      toast({ title: 'Erro ao salvar abertura do delivery', variant: 'destructive' });
    }
  };

  const addOpeningImageFromLibrary = (storageUrl: string) => {
    const selectedMedia = imageMediaLibrary.find((media) => media.storageUrl === storageUrl);
    if (!selectedMedia) return;
    if (deliveryOpeningImages.some((image) => image.storageUrl === storageUrl)) {
      toast({ title: 'Essa imagem já está na abertura.' });
      return;
    }

    setDeliveryOpeningImages((current) => [
      ...current,
      {
        storageUrl: selectedMedia.storageUrl,
        caption: selectedMedia.caption || selectedMedia.description || selectedMedia.name,
        fileName: selectedMedia.fileName || undefined,
        sourceName: selectedMedia.name,
      },
    ]);
    setSelectedOpeningMediaUrl('');
    setDeliveryOpeningDirty(true);
  };

  const removeOpeningImage = (storageUrl: string) => {
    setDeliveryOpeningImages((current) => current.filter((image) => image.storageUrl !== storageUrl));
    setDeliveryOpeningDirty(true);
  };

  const moveOpeningImage = (index: number, direction: 'up' | 'down') => {
    setDeliveryOpeningImages((current) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
    setDeliveryOpeningDirty(true);
  };

  const uploadOpeningImage = async (file: File) => {
    setIsUploadingOpeningImage(true);
    try {
      const token = await getAuthToken();
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/agent/media/upload', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
        body: formData,
      });

      const uploadData = await uploadRes.json();
      if (!uploadData?.storageUrl) {
        throw new Error(uploadData?.message || 'Falha ao enviar imagem');
      }

      const mediaPayload = {
        name: `DELIVERY_ABERTURA_${Date.now()}`,
        mediaType: 'image',
        storageUrl: uploadData.storageUrl,
        description: 'Imagem de abertura do delivery',
        whenToUse: 'Disponivel para a abertura do delivery',
        caption: file.name.replace(/\.[^.]+$/, ''),
        fileName: uploadData.fileName || file.name,
        mimeType: uploadData.mimeType || file.type || 'image/*',
      };

      const saveRes = await apiRequest('POST', '/api/agent/media', mediaPayload);
      const savedMedia = await saveRes.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/agent/media"] });

      setDeliveryOpeningImages((current) => [
        ...current,
        {
          storageUrl: savedMedia.storageUrl,
          caption: savedMedia.caption || savedMedia.description || savedMedia.name,
          fileName: savedMedia.fileName || undefined,
          sourceName: savedMedia.name,
        },
      ]);
      setDeliveryOpeningDirty(true);
      toast({ title: 'Imagem enviada para a abertura do delivery!' });
    } catch (error) {
      toast({ title: 'Erro ao enviar imagem de abertura', variant: 'destructive' });
    } finally {
      setIsUploadingOpeningImage(false);
    }
  };

  const businessTypeOptions = [
    { value: 'pizzaria', label: '🍕 Pizzaria' },
    { value: 'hamburgueria', label: '🍔 Hamburgueria' },
    { value: 'lanchonete', label: '🥪 Lanchonete' },
    { value: 'restaurante', label: '🍽️ Restaurante' },
    { value: 'acai', label: '🍨 Açaí' },
    { value: 'japonesa', label: '🍣 Comida Japonesa' },
    { value: 'outros', label: '🍴 Outros' },
  ];

  const updateHalfHalfPricing = (patch: Partial<HalfHalfPricingForm>) => {
    setCategoryForm(prev => ({
      ...prev,
      halfHalfPricing: {
        ...prev.halfHalfPricing,
        ...patch,
      },
    }));
  };

  const updateHalfHalfSizePrice = (size: 'P' | 'M' | 'G', value: string) => {
    setCategoryForm(prev => ({
      ...prev,
      halfHalfPricing: {
        ...prev.halfHalfPricing,
        sizePrices: {
          ...prev.halfHalfPricing.sizePrices,
          [size]: value,
        },
      },
    }));
  };

  // Funções para gerenciar variações
  const addOptionToNewVariation = () => {
    if (!newOptionName.trim()) return;
    const price = parseFloat(newOptionPrice) || 0;
    setNewVariation(prev => ({
      ...prev,
      options: [...prev.options, { name: newOptionName.trim(), price }]
    }));
    setNewOptionName('');
    setNewOptionPrice('');
  };

  const removeOptionFromNewVariation = (index: number) => {
    setNewVariation(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const addVariationToItem = () => {
    if (!newVariation.name.trim() || newVariation.options.length === 0) return;
    setItemForm(prev => ({
      ...prev,
      options: [...prev.options, { ...newVariation }]
    }));
    setNewVariation({ name: '', type: 'single', required: true, options: [] });
  };

  const updateVariationInItem = (
    index: number,
    patch: Partial<Omit<VariationGroup, 'options'>>
  ) => {
    setItemForm(prev => ({
      ...prev,
      options: prev.options.map((variation, variationIndex) =>
        variationIndex === index
          ? {
              ...variation,
              ...patch,
            }
          : variation
      )
    }));
  };

  const updateVariationOptionInItem = (
    variationIndex: number,
    optionIndex: number,
    patch: Partial<VariationOption>
  ) => {
    setItemForm(prev => ({
      ...prev,
      options: prev.options.map((variation, currentVariationIndex) =>
        currentVariationIndex === variationIndex
          ? {
              ...variation,
              options: variation.options.map((option, currentOptionIndex) =>
                currentOptionIndex === optionIndex
                  ? {
                      ...option,
                      ...patch,
                    }
                  : option
              ),
            }
          : variation
      )
    }));
  };

  const addOptionToVariationInItem = (variationIndex: number) => {
    setItemForm(prev => ({
      ...prev,
      options: prev.options.map((variation, currentVariationIndex) =>
        currentVariationIndex === variationIndex
          ? {
              ...variation,
              options: [...variation.options, { name: '', price: 0 }],
            }
          : variation
      )
    }));
  };

  const removeOptionFromVariationInItem = (variationIndex: number, optionIndex: number) => {
    setItemForm(prev => ({
      ...prev,
      options: prev.options.map((variation, currentVariationIndex) =>
        currentVariationIndex === variationIndex
          ? {
              ...variation,
              options: variation.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex),
            }
          : variation
      )
    }));
  };

  const removeVariationFromItem = (index: number) => {
    setItemForm(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const applyVariationTemplate = (template: string) => {
    if (template === 'tamanho-pizza') {
      const sizeVariation: VariationGroup = {
        name: 'Tamanho',
        type: 'single',
        required: true,
        options: [
          { name: 'Pequena (P)', price: 30 },
          { name: 'Média (M)', price: 40 },
          { name: 'Grande (G)', price: 55 },
        ]
      };
      setItemForm(prev => ({
        ...prev,
        options: [...prev.options, sizeVariation]
      }));
    } else if (template === 'tamanho-lanche') {
      const sizeVariation: VariationGroup = {
        name: 'Tamanho',
        type: 'single',
        required: true,
        options: [
          { name: 'Simples', price: 0 },
          { name: 'Duplo', price: 8 },
          { name: 'Triplo', price: 15 },
        ]
      };
      setItemForm(prev => ({
        ...prev,
        options: [...prev.options, sizeVariation]
      }));
    } else if (template === 'tamanho-acai') {
      const sizeVariation: VariationGroup = {
        name: 'Tamanho',
        type: 'single',
        required: true,
        options: [
          { name: '300ml', price: 15 },
          { name: '500ml', price: 22 },
          { name: '700ml', price: 30 },
        ]
      };
      setItemForm(prev => ({
        ...prev,
        options: [...prev.options, sizeVariation]
      }));
    } else if (template === 'adicionais') {
      const addonsVariation: VariationGroup = {
        name: 'Adicionais',
        type: 'multiple',
        required: false,
        options: [
          { name: 'Bacon', price: 5 },
          { name: 'Queijo extra', price: 4 },
          { name: 'Ovo', price: 3 },
        ]
      };
      setItemForm(prev => ({
        ...prev,
        options: [...prev.options, addonsVariation]
      }));
    }
  };

  const hasInvalidVariationConfig = itemForm.options.some((variation) => {
    if (!variation.name.trim() || variation.options.length === 0) {
      return true;
    }

    return variation.options.some((option) => !option.name.trim() || !Number.isFinite(option.price));
  });

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 pb-28 md:pb-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="h-6 w-6" />
            Cardápio Digital - Delivery
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seu cardápio. A IA usará esta lista para receber pedidos via WhatsApp.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end md:w-auto">
          {/* Toggle Delivery Ativo */}
          {config && (
            <div className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2 sm:justify-start ${
              config.is_active && config.send_to_ai 
                ? 'bg-green-50 border-green-200' 
                : 'bg-muted/50'
            }`}>
              <Truck className={`h-4 w-4 ${config.is_active && config.send_to_ai ? 'text-green-600' : 'text-muted-foreground'}`} />
              <span className="text-sm font-medium">
                Delivery {config.is_active && config.send_to_ai ? 'Ativo' : 'Inativo'}
              </span>
              <Switch
                checked={config.is_active && config.send_to_ai}
                onCheckedChange={(checked) => updateConfigMutation.mutate({ 
                  is_active: checked,
                  send_to_ai: checked 
                })}
              />
            </div>
          )}
          
          <Button 
            variant="outline" 
            className="w-full sm:w-auto"
            onClick={() => {
              resetCategoryForm();
              setEditingCategory(null);
              setIsCategoryModalOpen(true);
            }}
          >
            <FolderPlus className="h-4 w-4 mr-2" />
            Nova Categoria
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => {
            resetItemForm();
            setIsAddItemModalOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Item
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 sm:grid-cols-3">
          <TabsTrigger value="cardapio" className="w-full justify-start rounded-lg border bg-background px-3 py-2 text-left sm:justify-center">
            <UtensilsCrossed className="h-4 w-4 mr-2" />
            Cardápio ({itemsData?.total || 0})
          </TabsTrigger>
          <TabsTrigger value="categorias" className="w-full justify-start rounded-lg border bg-background px-3 py-2 text-left sm:justify-center">
            <FolderPlus className="h-4 w-4 mr-2" />
            Categorias ({categories?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="configuracoes" className="w-full justify-start rounded-lg border bg-background px-3 py-2 text-left sm:justify-center">
            <Settings2 className="h-4 w-4 mr-2" />
            Configurações
          </TabsTrigger>
        </TabsList>

        {/* TAB: CARDÁPIO */}
        <TabsContent value="cardapio">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-4 md:flex-row md:justify-between">
                <div className="flex flex-1 flex-col gap-2 lg:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar itens..."
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
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-full lg:w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="true">Disponíveis</SelectItem>
                      <SelectItem value="false">Indisponíveis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {selectedItems.length > 0 && (
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir ({selectedItems.length})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingItems ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : itemsData?.items.length === 0 ? (
                <div className="text-center py-12">
                  <UtensilsCrossed className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhum item no cardápio</h3>
                  <p className="text-muted-foreground mb-4">
                    Adicione itens ao seu cardápio para começar a receber pedidos.
                  </p>
                  <Button onClick={() => {
                    resetItemForm();
                    setIsAddItemModalOpen(true);
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Item
                  </Button>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox 
                            checked={selectedItems.length === itemsData?.items.length && itemsData.items.length > 0}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead className="w-16">Foto</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Preço</TableHead>
                        <TableHead className="text-center">Tempo</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemsData?.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Checkbox 
                              checked={selectedItems.includes(item.id)}
                              onCheckedChange={() => toggleItemSelection(item.id)}
                            />
                          </TableCell>
                          <TableCell>
                            {item.image_url ? (
                              <img 
                                src={item.image_url} 
                                alt={item.name}
                                className="w-12 h-12 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {item.name}
                                {item.is_featured && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                                {item.options && item.options.length > 0 && (
                                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                                    📐 {item.options.length} variação(ões)
                                  </Badge>
                                )}
                              </div>
                              {item.description && (
                                <div className="text-xs text-muted-foreground line-clamp-1">{item.description}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {item.menu_categories?.name ? (
                              <Badge variant="outline">{item.menu_categories.name}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div>
                              {item.promotional_price ? (
                                <>
                                  <span className="line-through text-muted-foreground text-xs mr-1">
                                    {formatPrice(item.price)}
                                  </span>
                                  <span className="font-medium text-green-600">
                                    {formatPrice(item.promotional_price)}
                                  </span>
                                </>
                              ) : (
                                <span className="font-medium">{formatPrice(item.price)}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1 text-muted-foreground text-sm">
                              <Clock className="h-3 w-3" />
                              {item.preparation_time}min
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={item.is_available ? "default" : "secondary"}>
                              {item.is_available ? "Disponível" : "Indisponível"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => openEditItemModal(item)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  {itemsData && itemsData.totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-muted-foreground">
                        Mostrando {((currentPage - 1) * 20) + 1} a {Math.min(currentPage * 20, itemsData.total)} de {itemsData.total}
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
                          disabled={currentPage === itemsData.totalPages}
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

        {/* TAB: CATEGORIAS */}
        <TabsContent value="categorias">
          <Card>
            <CardHeader>
              <CardTitle>Categorias do Cardápio</CardTitle>
              <CardDescription>
                Organize seu cardápio em categorias (Pizzas, Lanches, Bebidas, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-medium">Preço de pizza meio a meio é configurado na categoria, não no produto.</p>
                <p className="mt-1 text-amber-800">
                  Exemplo: abra a categoria <strong>Pizzas</strong>, clique em <strong>Editar</strong> e ajuste a seção
                  <strong> preço especial para meio a meio</strong>.
                </p>
              </div>
              {isLoadingCategories ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : categories?.length === 0 ? (
                <div className="text-center py-12">
                  <FolderPlus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhuma categoria criada</h3>
                  <p className="text-muted-foreground mb-4">
                    Crie categorias para organizar seu cardápio.
                  </p>
                  <Button onClick={() => {
                    resetCategoryForm();
                    setEditingCategory(null);
                    setIsCategoryModalOpen(true);
                  }}>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    Nova Categoria
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {categories?.map((cat) => (
                    <Card key={cat.id} className="relative">
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          {cat.image_url ? (
                            <img 
                              src={cat.image_url} 
                              alt={cat.name}
                              className="w-16 h-16 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                              <FolderPlus className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">{cat.name}</h4>
                              <Badge variant={cat.is_active ? "default" : "secondary"} className="text-xs">
                                {cat.is_active ? "Ativo" : "Inativo"}
                              </Badge>
                            </div>
                            <div className="mt-2 rounded-lg border bg-muted/30 px-3 py-2">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <Sparkles className="h-4 w-4 text-amber-600" />
                                {getHalfHalfPricingSummary(cat.half_half_pricing).title}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {getHalfHalfPricingSummary(cat.half_half_pricing).description}
                              </p>
                            </div>
                            {cat.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                {cat.description}
                              </p>
                            )}
                            <div className="flex gap-2 mt-3">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => openEditCategoryModal(cat)}
                              >
                                <Edit2 className="h-3 w-3 mr-1" />
                                Editar
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => deleteCategoryMutation.mutate(cat.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: CONFIGURAÇÕES */}
        <TabsContent value="configuracoes">
          <div className="grid gap-6">
            {/* Card Principal - Toggle */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Abertura do Delivery
                </CardTitle>
                <CardDescription>
                  Escolha as imagens que entram no começo da conversa. A saudação continua vindo da mensagem de boas-vindas do delivery, com suporte a {'{cliente_nome}'} e variação com IA.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="space-y-1">
                      <Label>Sequência de imagens da abertura</Label>
                      <p className="text-xs text-muted-foreground">
                        A ordem abaixo é a ordem em que as imagens saem antes do cardápio visual.
                      </p>
                    </div>

                    {deliveryOpeningImages.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        Nenhuma imagem configurada ainda.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {deliveryOpeningImages.map((image, index) => (
                          <div key={`${image.storageUrl}-${index}`} className="flex items-center gap-3 rounded-lg border p-3">
                            <img
                              src={image.storageUrl}
                              alt={image.caption || `Imagem ${index + 1}`}
                              className="h-16 w-16 rounded object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{image.caption || image.sourceName || `Imagem ${index + 1}`}</p>
                              <p className="truncate text-xs text-muted-foreground">{image.sourceName || image.fileName || image.storageUrl}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => moveOpeningImage(index, 'up')}>
                                Subir
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={index === deliveryOpeningImages.length - 1}
                                onClick={() => moveOpeningImage(index, 'down')}
                              >
                                Descer
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => removeOpeningImage(image.storageUrl)}>
                                Remover
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button type="button" onClick={saveDeliveryOpeningImages} disabled={!deliveryOpeningDirty}>
                        Salvar abertura do delivery
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="space-y-2">
                      <Label>Usar imagem da biblioteca</Label>
                      <Select value={selectedOpeningMediaUrl} onValueChange={setSelectedOpeningMediaUrl}>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha uma imagem já enviada" />
                        </SelectTrigger>
                        <SelectContent>
                          {imageMediaLibrary.map((media) => (
                            <SelectItem key={media.id} value={media.storageUrl}>
                              {media.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={!selectedOpeningMediaUrl}
                        onClick={() => addOpeningImageFromLibrary(selectedOpeningMediaUrl)}
                      >
                        Adicionar na abertura
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label>Enviar nova imagem</Label>
                      <input
                        type="file"
                        accept="image/*"
                        className="block w-full text-sm"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void uploadOpeningImage(file);
                            event.currentTarget.value = '';
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        A imagem vai para a biblioteca do agente e entra na abertura do delivery.
                      </p>
                      {isUploadingOpeningImage && (
                        <p className="text-xs text-muted-foreground">Enviando imagem...</p>
                      )}
                    </div>

                    <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">Leitura guiada</p>
                      <p className="mt-2">1. A saudação usa a mensagem de boas-vindas logo abaixo.</p>
                      <p>2. Se "Chamar pelo Nome" estiver ligado, {'{cliente_nome}'} vira o nome salvo do cliente.</p>
                      <p>3. Se "Variação de Resposta" estiver ligada, a IA reescreve a saudação mantendo o mesmo sentido.</p>
                      <p>4. Depois entram as imagens desta abertura e só então o cardápio visual do delivery.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Modo Delivery
                </CardTitle>
                <CardDescription>
                  Ative para que a IA receba pedidos automaticamente via WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 border rounded-lg bg-gradient-to-r from-green-50 to-emerald-50">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">🚀 Delivery Ativo</Label>
                    <p className="text-sm text-muted-foreground">
                      A IA receberá pedidos e criará comandas automaticamente
                    </p>
                  </div>
                  <Switch
                    checked={config?.is_active && config?.send_to_ai}
                    onCheckedChange={(checked) => updateConfigMutation.mutate({ 
                      is_active: checked,
                      send_to_ai: checked 
                    })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Informações do Negócio */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="h-5 w-5" />
                  Informações do Negócio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome do Estabelecimento</Label>
                    <Input
                      placeholder="Ex: Pizzaria do João"
                      value={config?.business_name || ''}
                      onChange={(e) => updateConfigMutation.mutate({ business_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de Negócio</Label>
                    <Select 
                      value={config?.business_type || 'restaurante'}
                      onValueChange={(v) => updateConfigMutation.mutate({ business_type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {businessTypeOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Truck className="h-4 w-4" />
                      Taxa de Entrega
                    </Label>
                    <div className="rounded-lg border bg-muted/30 px-4 py-3">
                      <p className="font-medium">
                        {deliveryFeeSettingsDraft.mode === 'distance'
                          ? 'Taxa por distancia ativa'
                          : `Taxa fixa: R$ ${Number(deliveryFeeSettingsDraft.baseFee || 0).toFixed(2).replace('.', ',')}`}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {deliveryFeeModeSummary}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Ajuste a taxa no bloco <strong>Cobranca e pagamento</strong> abaixo.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Pedido Mínimo
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={config?.min_order_value || ''}
                      onChange={(e) => updateConfigMutation.mutate({ min_order_value: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Tempo Estimado (min)
                    </Label>
                    <Input
                      type="number"
                      placeholder="45"
                      value={config?.estimated_delivery_time || 45}
                      onChange={(e) => updateConfigMutation.mutate({ estimated_delivery_time: parseInt(e.target.value) || 45 })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4" />
                      <span>Aceita Delivery</span>
                    </div>
                    <Switch
                      checked={config?.accepts_delivery ?? true}
                      onCheckedChange={(checked) => updateConfigMutation.mutate({ accepts_delivery: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4" />
                      <span>Aceita Retirada</span>
                    </div>
                    <Switch
                      checked={config?.accepts_pickup ?? true}
                      onCheckedChange={(checked) => updateConfigMutation.mutate({ accepts_pickup: checked })}
                    />
                  </div>
                </div>

                {/* Toggle de cancelamento pelo cliente */}
                <div className="flex items-center justify-between p-4 border rounded-lg bg-red-50 border-red-200">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <div>
                      <span className="font-medium">Permitir Cancelamento</span>
                      <p className="text-xs text-muted-foreground">
                        Se ativado, o cliente pode cancelar o pedido pelo chat
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={config?.accepts_cancellation ?? false}
                    onCheckedChange={(checked) => updateConfigMutation.mutate({ accepts_cancellation: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    WhatsApp para Receber Pedidos
                  </Label>
                  <Input
                    placeholder="Ex: 5511999999999"
                    value={config?.whatsapp_order_number || ''}
                    onChange={(e) => updateConfigMutation.mutate({ whatsapp_order_number: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Número que receberá notificação de cada novo pedido
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-sky-200 bg-sky-50/70">
              <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-sky-950">Pix, troco e taxa por distância</p>
                  <p className="text-sm text-sky-900/80">
                    Essa parte continua nesta aba, no bloco <strong>Cobrança e pagamento</strong>.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="border-sky-300 bg-white text-sky-900 hover:bg-sky-100"
                  onClick={() => document.getElementById('delivery-billing-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  Ir para cobrança e pagamento
                </Button>
              </CardContent>
            </Card>

            <Card id="delivery-billing-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Cobranca e pagamento
                </CardTitle>
                <CardDescription>
                  Configure Pix, troco no dinheiro e taxa fixa ou por distancia.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">Pix</p>
                        <p className="text-sm text-muted-foreground">Envia a chave automaticamente no resumo.</p>
                      </div>
                      <Switch
                        checked={paymentMethodsDraft.includes('pix')}
                        onCheckedChange={(checked) => togglePaymentMethod('pix', checked)}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">Dinheiro</p>
                        <p className="text-sm text-muted-foreground">Pode perguntar sobre troco.</p>
                      </div>
                      <Switch
                        checked={paymentMethodsDraft.includes('dinheiro')}
                        onCheckedChange={(checked) => togglePaymentMethod('dinheiro', checked)}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">Cartao</p>
                        <p className="text-sm text-muted-foreground">Credito ou debito.</p>
                      </div>
                      <Switch
                        checked={paymentMethodsDraft.includes('cartao')}
                        onCheckedChange={(checked) => togglePaymentMethod('cartao', checked)}
                      />
                    </div>
                  </div>
                </div>

                {paymentMethodsDraft.includes('pix') && (
                  <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Tipo da chave Pix</Label>
                        <Select
                          value={pixSettingsDraft.keyType}
                          onValueChange={(value) => {
                            setPixSettingsDraft((current) => ({ ...current, keyType: value }));
                            setAdvancedConfigDirty(true);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="random">Chave aleatoria</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="phone">Telefone</SelectItem>
                            <SelectItem value="cpf">CPF</SelectItem>
                            <SelectItem value="cnpj">CNPJ</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Chave Pix</Label>
                        <Input
                          placeholder="Informe a chave"
                          value={pixSettingsDraft.key}
                          onChange={(e) => {
                            setPixSettingsDraft((current) => ({ ...current, key: e.target.value }));
                            setAdvancedConfigDirty(true);
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Titular</Label>
                        <Input
                          placeholder="Ex: The King dos Sabores"
                          value={pixSettingsDraft.holderName}
                          onChange={(e) => {
                            setPixSettingsDraft((current) => ({ ...current, holderName: e.target.value }));
                            setAdvancedConfigDirty(true);
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Banco</Label>
                        <Input
                          placeholder="Ex: Nubank"
                          value={pixSettingsDraft.bankName}
                          onChange={(e) => {
                            setPixSettingsDraft((current) => ({ ...current, bankName: e.target.value }));
                            setAdvancedConfigDirty(true);
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Instrucoes extras</Label>
                      <Textarea
                        placeholder="Ex: Envie o comprovante para agilizar a baixa."
                        value={pixSettingsDraft.instructions}
                        onChange={(e) => {
                          setPixSettingsDraft((current) => ({ ...current, instructions: e.target.value }));
                          setAdvancedConfigDirty(true);
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border bg-white px-4 py-3">
                      <div>
                        <p className="font-medium">Pedir comprovante</p>
                        <p className="text-sm text-muted-foreground">A IA pede o comprovante apos o Pix.</p>
                      </div>
                      <Switch
                        checked={pixSettingsDraft.requireProof}
                        onCheckedChange={(checked) => {
                          setPixSettingsDraft((current) => ({ ...current, requireProof: checked }));
                          setAdvancedConfigDirty(true);
                        }}
                      />
                    </div>
                  </div>
                )}

                {paymentMethodsDraft.includes('dinheiro') && (
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium">Perguntar sobre troco</p>
                      <p className="text-sm text-muted-foreground">
                        Quando o cliente escolher dinheiro, a IA pergunta se precisa de troco e para quanto.
                      </p>
                    </div>
                    <Switch
                      checked={cashSettingsDraft.askForChange}
                      onCheckedChange={(checked) => {
                        setCashSettingsDraft({ askForChange: checked });
                        setAdvancedConfigDirty(true);
                      }}
                    />
                  </div>
                )}

                  <div className="space-y-4 rounded-lg border p-4">
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <div className="space-y-2">
                      <p className="font-medium">Como preencher a taxa</p>
                      <p className="text-sm text-muted-foreground">
                        Escolha <strong>Taxa fixa</strong> se toda entrega custa o mesmo valor.
                        Escolha <strong>Taxa por distancia</strong> se voce quer cobrar um valor inicial e somar um valor por km extra.
                      </p>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-lg border bg-background p-3">
                        <p className="text-sm font-medium">1. Valor inicial</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Esse e o valor em reais que ja entra na entrega.
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background p-3">
                        <p className="text-sm font-medium">2. Km incluidos</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Ate essa distancia, o cliente paga so a taxa base.
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background p-3">
                        <p className="text-sm font-medium">3. Valor por km extra</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          A partir do km excedente, a IA soma esse valor automaticamente.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg border bg-background p-4">
                      <p className="text-sm font-medium">Exemplo automatico</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {deliveryFeeExampleSummary}
                      </p>
                      {deliveryFeeSettingsDraft.mode === 'distance' && (
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <p>
                            Calculo atual: R$ {deliveryFeeBasePreview.toFixed(2).replace('.', ',')}
                            {" "}ate {deliveryFeeIncludedKm.toFixed(1).replace('.', ',')} km + R$ {deliveryFeeAdditionalPreview.toFixed(2).replace('.', ',')}
                            {" "}por km extra. Se nao der para calcular a distancia, usa R$ {deliveryFeeFallbackPreview.toFixed(2).replace('.', ',')}.
                          </p>
                          <p>
                            Se o cliente escrever apenas <strong>"Rua X, 123"</strong>, a IA usa a <strong>cidade e UF da loja</strong> para completar a busca do endereco.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Como cobrar a entrega</Label>
                      <Select
                        value={deliveryFeeSettingsDraft.mode}
                        onValueChange={(value: 'fixed' | 'distance') => {
                          setDeliveryFeeSettingsDraft((current) => ({ ...current, mode: value }));
                          setAdvancedConfigDirty(true);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Taxa fixa</SelectItem>
                          <SelectItem value="distance">Taxa por distancia</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Use <strong>Taxa fixa</strong> para um unico valor. Use <strong>Taxa por distancia</strong> para cobrar por km.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>{deliveryFeeSettingsDraft.mode === 'distance' ? 'Valor inicial em R$' : 'Valor da entrega em R$'}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={deliveryFeeSettingsDraft.baseFee}
                        onChange={(e) => {
                          setDeliveryFeeSettingsDraft((current) => ({ ...current, baseFee: e.target.value }));
                          setAdvancedConfigDirty(true);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        {deliveryFeeSettingsDraft.mode === 'distance'
                          ? 'Esse valor entra primeiro no calculo da entrega.'
                          : 'Esse valor sera cobrado em toda entrega.'}
                      </p>
                    </div>
                  </div>

                  {deliveryFeeSettingsDraft.mode === 'distance' && (
                    <>
                      {deliveryFeeNeedsCityGuidance && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                          <p className="font-medium">Falta a base da cidade para calcular direito</p>
                          <p className="mt-1">
                            Se o cliente mandar so <strong>"Rua X, 123"</strong>, a IA precisa saber em qual cidade essa rua fica.
                            Preencha <strong>Cidade e UF da loja</strong> ou coloque a cidade completa no endereco da loja.
                          </p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Endereco da loja para calcular a distancia</Label>
                        <Input
                          placeholder="Ex: Rua da Loja, 123 - Centro, Cidade/UF"
                          value={deliveryFeeSettingsDraft.originAddress}
                          onChange={(e) => {
                            setDeliveryFeeSettingsDraft((current) => ({ ...current, originAddress: e.target.value }));
                            setAdvancedConfigDirty(true);
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          Informe a rua e o numero da loja. Se quiser, pode incluir bairro tambem.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Cidade e UF da loja</Label>
                        <Input
                          placeholder="Ex: Marilia - SP"
                          value={deliveryFeeSettingsDraft.cityContext}
                          onChange={(e) => {
                            setDeliveryFeeSettingsDraft((current) => ({ ...current, cityContext: e.target.value }));
                            setAdvancedConfigDirty(true);
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          Campo importante quando o cliente manda so rua e numero. A IA usa essa cidade como referencia para completar o endereco.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Km ja incluidos na taxa base</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={deliveryFeeSettingsDraft.baseDistanceKm}
                            onChange={(e) => {
                              setDeliveryFeeSettingsDraft((current) => ({ ...current, baseDistanceKm: e.target.value }));
                              setAdvancedConfigDirty(true);
                            }}
                          />
                          <p className="text-xs text-muted-foreground">
                            Ate essa distancia, o cliente paga so o valor inicial.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Valor por km extra em R$</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={deliveryFeeSettingsDraft.additionalFeePerKm}
                            onChange={(e) => {
                              setDeliveryFeeSettingsDraft((current) => ({ ...current, additionalFeePerKm: e.target.value }));
                              setAdvancedConfigDirty(true);
                            }}
                          />
                          <p className="text-xs text-muted-foreground">
                            Digite quanto deve ser somado para cada km acima do limite incluido.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Distancia maxima aceita (km)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="Opcional"
                            value={deliveryFeeSettingsDraft.maxDistanceKm}
                            onChange={(e) => {
                              setDeliveryFeeSettingsDraft((current) => ({ ...current, maxDistanceKm: e.target.value }));
                              setAdvancedConfigDirty(true);
                            }}
                          />
                          <p className="text-xs text-muted-foreground">
                            Campo opcional. Use se voce quiser limitar o raio de entrega.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Valor se nao der para calcular</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={deliveryFeeSettingsDraft.fallbackFee}
                            onChange={(e) => {
                              setDeliveryFeeSettingsDraft((current) => ({ ...current, fallbackFee: e.target.value }));
                              setAdvancedConfigDirty(true);
                            }}
                          />
                          <p className="text-xs text-muted-foreground">
                            Valor usado quando o endereco nao permite calcular a distancia automaticamente.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={saveAdvancedConfig}
                    disabled={!advancedConfigDirty || updateConfigMutation.isPending}
                  >
                    {updateConfigMutation.isPending ? 'Salvando configuracoes...' : 'Salvar Pix e taxa'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Horários de Funcionamento */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Horários de Funcionamento
                </CardTitle>
                <CardDescription>
                  Configure os dias e horários que seu estabelecimento funciona. 
                  A IA informará automaticamente quando estiver fechado.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium text-emerald-900">Receber pedidos a qualquer hora</p>
                      <p className="text-sm text-emerald-800">
                        A IA continua anotando pedidos fora do horario e avisa quando o atendimento comeca.
                      </p>
                    </div>
                    <Switch
                      checked={acceptOrdersAnyTime}
                      onCheckedChange={(checked) => {
                        setAcceptOrdersAnyTime(checked);
                        setOpeningHoursDirty(true);
                      }}
                    />
                  </div>
                </div>

                {DAY_ORDER.map((day) => {
                  const dayConfig = openingHoursDraft[day] || DEFAULT_DAY_CONFIG;
                  
                  return (
                    <div
                      key={day}
                      className="flex flex-col gap-3 rounded-lg border p-3 lg:flex-row lg:items-center lg:gap-4"
                    >
                      <div className="w-full lg:w-32">
                        <span className="font-medium">{DAY_NAMES[day]}</span>
                      </div>
                      <Switch
                        checked={dayConfig.enabled}
                        onCheckedChange={(checked) => updateOpeningHoursDraft(day, { enabled: checked })}
                      />
                      {dayConfig.enabled ? (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <div className="flex items-center gap-2">
                            <Label className="text-sm">Abre:</Label>
                            <Input
                              type="time"
                              value={dayConfig.open}
                              onChange={(e) => updateOpeningHoursDraft(day, { open: e.target.value })}
                              className="w-32"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-sm">Fecha:</Label>
                            <Input
                              type="time"
                              value={dayConfig.close}
                              onChange={(e) => updateOpeningHoursDraft(day, { close: e.target.value })}
                              className="w-32"
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Fechado</span>
                      )}
                    </div>
                  );
                })}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={saveOpeningHours}
                    disabled={!openingHoursDirty || updateConfigMutation.isPending}
                  >
                    {updateConfigMutation.isPending ? 'Salvando horários...' : 'Salvar horários'}
                  </Button>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mt-4">
                  <p className="text-sm text-amber-800">
                    <strong>💡 Dica:</strong> Quando o cliente enviar mensagem fora do horário de funcionamento, 
                    a IA informará automaticamente os horários disponíveis.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Instruções de Exibição para IA */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Instruções de Comportamento do Cardápio
                </CardTitle>
                <CardDescription>
                  Configure como a IA deve apresentar o cardápio para os clientes.
                  Você pode definir se envia tudo de uma vez ou pergunta primeiro o que o cliente quer.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Modo de envio do cardápio</Label>
                  <Select
                    value={config?.menu_send_mode || 'text'}
                    onValueChange={(value) => updateConfigMutation.mutate({ menu_send_mode: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o modo de envio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Somente texto</SelectItem>
                      <SelectItem value="image_text">Imagem + texto</SelectItem>
                      <SelectItem value="image">Somente imagem</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Use as imagens das categorias para enviar o cardápio visual pelo WhatsApp.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display_instructions">Instruções de Apresentação</Label>
                  <textarea
                    id="display_instructions"
                    className="w-full min-h-[150px] p-3 text-sm rounded-lg border border-input bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Ex: Primeiro pergunte ao cliente se ele quer ver Pizzas, Esfihas, Bebidas ou o cardápio completo. Só envie o cardápio da categoria que ele escolher."
                    value={config?.display_instructions || ''}
                    onChange={(e) => updateConfigMutation.mutate({ display_instructions: e.target.value })}
                  />
                </div>
                
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">💡 Exemplos de instruções:</p>
                  
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm font-medium text-blue-800 mb-1">🎯 Perguntar primeiro (recomendado para cardápios grandes):</p>
                    <p className="text-xs text-blue-700 italic">
                      "Quando o cliente quiser ver o cardápio, primeiro pergunte: 'Você quer ver: 🍕 Pizzas, 🥟 Esfihas, 🍹 Bebidas ou o cardápio completo?' 
                      Só envie o menu da categoria escolhida."
                    </p>
                  </div>
                  
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-800 mb-1">📋 Enviar tudo organizado:</p>
                    <p className="text-xs text-green-700 italic">
                      "Liste cada item em uma linha separada com emoji, nome e preço. Organize por categoria. 
                      Use negrito para os nomes das categorias."
                    </p>
                  </div>
                  
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-sm font-medium text-purple-800 mb-1">⭐ Destacar promoções:</p>
                    <p className="text-xs text-purple-700 italic">
                      "Ao apresentar o cardápio, destaque primeiro os itens em promoção com ⭐. 
                      Depois mostre as demais categorias."
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <strong>📝 Dica:</strong> Para editar os itens do cardápio (nomes, preços, descrições), 
                    use a aba "Cardápio". Esta seção é apenas para configurar o <em>comportamento</em> da IA ao apresentar.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Mensagens Personalizadas */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Mensagens Personalizadas
                </CardTitle>
                <CardDescription>
                  Configure as mensagens que a IA envia em cada etapa do atendimento.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>📋 Mensagem de Boas-vindas</Label>
                  <textarea
                    className="w-full min-h-[80px] p-3 text-sm rounded-lg border border-input bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Olá! 👋 Bem-vindo ao nosso delivery! Como posso ajudar você hoje?"
                    value={welcomeMessage}
                    onChange={(e) => {
                      const value = e.target.value;
                      setWelcomeMessage(value);
                      updateConfigMutation.mutate({ welcome_message: value });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Enviada quando o cliente inicia uma conversa</p>
                </div>

                <div className="space-y-2">
                  <Label>✅ Confirmação de Pedido</Label>
                  <textarea
                    className="w-full min-h-[80px] p-3 text-sm rounded-lg border border-input bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Seu pedido foi recebido! ✅ Em breve enviaremos a confirmação."
                    value={orderConfirmationMessage}
                    onChange={(e) => {
                      const value = e.target.value;
                      setOrderConfirmationMessage(value);
                      updateConfigMutation.mutate({ order_confirmation_message: value });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Enviada quando o pedido é finalizado pelo cliente</p>
                </div>

                <div className="space-y-2">
                  <Label>🍕 Pedido Pronto</Label>
                  <textarea
                    className="w-full min-h-[80px] p-3 text-sm rounded-lg border border-input bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Seu pedido está pronto! 🍕"
                    value={orderReadyMessage}
                    onChange={(e) => {
                      const value = e.target.value;
                      setOrderReadyMessage(value);
                      updateConfigMutation.mutate({ order_ready_message: value });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Enviada quando você marca o pedido como "Pronto"</p>
                </div>

                <div className="space-y-2">
                  <Label>🚚 Saiu para Entrega</Label>
                  <textarea
                    className="w-full min-h-[80px] p-3 text-sm rounded-lg border border-input bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Seu pedido saiu para entrega! 🚚 Aguarde!"
                    value={outForDeliveryMessage}
                    onChange={(e) => {
                      const value = e.target.value;
                      setOutForDeliveryMessage(value);
                      updateConfigMutation.mutate({ out_for_delivery_message: value });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Enviada quando o pedido sai para entrega</p>
                </div>

                <div className="space-y-2">
                  <Label>🔒 Estabelecimento Fechado</Label>
                  <textarea
                    className="w-full min-h-[80px] p-3 text-sm rounded-lg border border-input bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Estamos fechados no momento. Nosso horário de funcionamento é: {horarios}"
                    value={closedMessage}
                    onChange={(e) => {
                      const value = e.target.value;
                      setClosedMessage(value);
                      updateConfigMutation.mutate({ closed_message: value });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Enviada quando cliente tenta pedir fora do horário. Use {'{horarios}'} para inserir os horários automaticamente</p>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>💡 Dica:</strong> Use variáveis como {'{cliente_nome}'} para personalizar as mensagens. 
                    A IA irá substituir automaticamente pelo nome do cliente.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Humanização e Anti-Ban */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Humanização e Anti-Ban
                </CardTitle>
                <CardDescription>
                  Configure como a IA deve responder para parecer mais humana e evitar bloqueios do WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <div>
                      <span className="font-medium">Chamar pelo Nome</span>
                      <p className="text-xs text-muted-foreground">
                        A IA chama o cliente pelo nome quando disponível
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={config?.use_customer_name ?? true}
                    onCheckedChange={(checked) => updateConfigMutation.mutate({ use_customer_name: checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    <div>
                      <span className="font-medium">Humanizar Respostas</span>
                      <p className="text-xs text-muted-foreground">
                        A IA varia as respostas para parecer mais humana
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={config?.humanize_responses ?? true}
                    onCheckedChange={(checked) => updateConfigMutation.mutate({ humanize_responses: checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    <div>
                      <span className="font-medium">Variação de Resposta</span>
                      <p className="text-xs text-muted-foreground">
                        Varia estrutura das mensagens para evitar detecção de bot
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={config?.response_variation ?? true}
                    onCheckedChange={(checked) => updateConfigMutation.mutate({ response_variation: checked })}
                  />
                </div>

                <div className="p-4 border rounded-lg bg-amber-50 border-amber-200">
                  <Label className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4" />
                    Delay Anti-Ban (segundos)
                  </Label>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm">Mínimo</Label>
                      <Input
                        type="number"
                        min="1"
                        max="30"
                        value={config?.response_delay_min || 2}
                        onChange={(e) => updateConfigMutation.mutate({ response_delay_min: parseInt(e.target.value) || 2 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Máximo</Label>
                      <Input
                        type="number"
                        min="1"
                        max="60"
                        value={config?.response_delay_max || 5}
                        onChange={(e) => updateConfigMutation.mutate({ response_delay_max: parseInt(e.target.value) || 5 })}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-amber-700 mt-2">
                    ⚠️ Intervalo aleatório entre mensagens para evitar bloqueio do WhatsApp
                  </p>
                </div>

                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800">
                    <strong>✅ Recomendação:</strong> Mantenha todas as opções ativas e use delay entre 2-5 segundos 
                    para uma experiência natural e segura.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Como funciona o Delivery */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" />
                  Como funciona o Delivery?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-start gap-3">
                    <Bot className="h-5 w-5 text-primary mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium mb-2">O atendimento é configurado em "Meu Agente IA"</p>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                        <li>Configure o comportamento do agente em <strong>/meu-agente-ia</strong></li>
                        <li>Quando o delivery estiver <strong>ativo</strong>, o cardápio será enviado automaticamente à IA</li>
                        <li>A IA apresenta o cardápio quando o cliente perguntar</li>
                        <li>Ela anota os itens, quantidades e observações</li>
                        <li>Confirma o pedido completo antes de finalizar</li>
                        <li>Pede nome, telefone e endereço de entrega</li>
                        <li>Cria o pedido automaticamente no sistema</li>
                        <li>O pedido aparece no painel de <strong>Pedidos Delivery</strong> para você confirmar</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal: Adicionar/Editar Item */}
      <Dialog open={isAddItemModalOpen || isEditItemModalOpen} onOpenChange={(open) => {
        if (!open) {
          setIsAddItemModalOpen(false);
          setIsEditItemModalOpen(false);
          setEditingItem(null);
          resetItemForm();
        }
      }}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Editar Item' : 'Novo Item'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Atualize as informações do item.' : 'Adicione um novo item ao cardápio.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome do Item *</Label>
              <Input
                id="name"
                value={itemForm.name}
                onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                placeholder="Ex: Pizza Calabresa Grande"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Categoria</Label>
                <Select value={itemForm.categoryId || "none"} onValueChange={(v) => setItemForm({ ...itemForm, categoryId: v === "none" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {categories?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="price">Preço *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={itemForm.price}
                  onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="promotionalPrice">Preço Promocional</Label>
                <Input
                  id="promotionalPrice"
                  type="number"
                  step="0.01"
                  value={itemForm.promotionalPrice}
                  onChange={(e) => setItemForm({ ...itemForm, promotionalPrice: e.target.value })}
                  placeholder="Deixe vazio se não houver"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="preparationTime">Tempo de Preparo (min)</Label>
                <Input
                  id="preparationTime"
                  type="number"
                  value={itemForm.preparationTime}
                  onChange={(e) => setItemForm({ ...itemForm, preparationTime: parseInt(e.target.value) || 30 })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="Descreva o item, ingredientes, etc."
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label>Imagem</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={itemForm.imageUrl}
                  onChange={(e) => setItemForm({ ...itemForm, imageUrl: e.target.value })}
                  placeholder="URL da imagem ou clique para buscar"
                  className="flex-1"
                />
                <Button 
                  type="button" 
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => fetchFoodImage(itemForm.name || 'comida')}
                  disabled={isLoadingImage || !itemForm.name}
                >
                  {isLoadingImage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  <span className="ml-2">Auto</span>
                </Button>
              </div>
              {itemForm.imageUrl && (
                <img 
                  src={itemForm.imageUrl} 
                  alt="Preview" 
                  className="w-32 h-32 rounded-lg object-cover mt-2"
                />
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="ingredients">Ingredientes</Label>
                <Input
                  id="ingredients"
                  value={itemForm.ingredients}
                  onChange={(e) => setItemForm({ ...itemForm, ingredients: e.target.value })}
                  placeholder="Ex: Queijo, tomate, orégano"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="serves">Serve (pessoas)</Label>
                <Input
                  id="serves"
                  type="number"
                  value={itemForm.serves}
                  onChange={(e) => setItemForm({ ...itemForm, serves: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="isAvailable"
                  checked={itemForm.isAvailable}
                  onCheckedChange={(checked) => setItemForm({ ...itemForm, isAvailable: checked as boolean })}
                />
                <Label htmlFor="isAvailable">Disponível</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="isFeatured"
                  checked={itemForm.isFeatured}
                  onCheckedChange={(checked) => setItemForm({ ...itemForm, isFeatured: checked as boolean })}
                />
                <Label htmlFor="isFeatured" className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-yellow-500" />
                  Destaque
                </Label>
              </div>
            </div>

            {/* Seção de Variações */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold flex items-center gap-2">
                  📐 Variações (Tamanhos/Opções)
                </Label>
              </div>
              
              <p className="text-sm text-muted-foreground mb-3">
                Adicione tamanhos (P, M, G) ou opções para este item. O cliente escolherá no pedido.
              </p>

              {/* Templates rápidos */}
              <div className="flex flex-wrap gap-2 mb-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => applyVariationTemplate('tamanho-pizza')}
                >
                  🍕 Tamanho Pizza
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => applyVariationTemplate('tamanho-lanche')}
                >
                  🍔 Tamanho Lanche
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => applyVariationTemplate('tamanho-acai')}
                >
                  🍨 Tamanho Açaí
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => applyVariationTemplate('adicionais')}
                >
                  ➕ Adicionais
                </Button>
              </div>

              {/* Variações existentes */}
              {itemForm.options.length > 0 && (
                <div className="space-y-3 mb-4">
                  {itemForm.options.map((variation, vIndex) => (
                    <div key={vIndex} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{variation.name}</span>
                          <Badge variant={variation.required ? "default" : "secondary"} className="text-xs">
                            {variation.required ? 'Obrigatório' : 'Opcional'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {variation.type === 'single' ? 'Escolha única' : 'Múltipla escolha'}
                          </Badge>
                        </div>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          className="text-destructive h-8 w-8 p-0"
                          onClick={() => removeVariationFromItem(vIndex)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {variation.options.map((opt, oIndex) => (
                          <Badge key={oIndex} variant="secondary" className="px-2 py-1">
                            {opt.name}: R$ {opt.price.toFixed(2)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Formulário para nova variação */}
              <div className="p-3 border rounded-lg bg-blue-50/50">
                <Label className="text-sm font-medium mb-2 block">+ Adicionar nova variação</Label>
                <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Input
                    placeholder="Nome (ex: Tamanho)"
                    value={newVariation.name}
                    onChange={(e) => setNewVariation({ ...newVariation, name: e.target.value })}
                    className="col-span-1"
                  />
                  <Select 
                    value={newVariation.type} 
                    onValueChange={(v: 'single' | 'multiple') => setNewVariation({ ...newVariation, type: v })}
                  >
                    <SelectTrigger className="col-span-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Escolha única</SelectItem>
                      <SelectItem value="multiple">Múltipla</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="varRequired"
                      checked={newVariation.required}
                      onCheckedChange={(checked) => setNewVariation({ ...newVariation, required: checked as boolean })}
                    />
                    <Label htmlFor="varRequired" className="text-sm">Obrigatório</Label>
                  </div>
                </div>

                {/* Opções da nova variação */}
                {newVariation.options.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {newVariation.options.map((opt, i) => (
                      <Badge key={i} variant="secondary" className="px-2 py-1 flex items-center gap-1">
                        {opt.name}: R$ {opt.price.toFixed(2)}
                        <button 
                          type="button"
                          onClick={() => removeOptionFromNewVariation(i)}
                          className="ml-1 text-destructive hover:text-destructive"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    placeholder="Nome opção (ex: Grande)"
                    value={newOptionName}
                    onChange={(e) => setNewOptionName(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Preço"
                    value={newOptionPrice}
                    onChange={(e) => setNewOptionPrice(e.target.value)}
                    className="w-24"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={addOptionToNewVariation}
                    disabled={!newOptionName.trim()}
                  >
                    + Opção
                  </Button>
                </div>

                {newVariation.name && newVariation.options.length > 0 && (
                  <Button 
                    type="button" 
                    variant="default" 
                    size="sm"
                    className="mt-2 w-full"
                    onClick={addVariationToItem}
                  >
                    ✓ Adicionar Variação "{newVariation.name}"
                  </Button>
                )}
              </div>

              {itemForm.options.length > 0 && (
                <div className="mt-3 space-y-3 rounded-lg border border-border/70 bg-background/70 p-3">
                  <Label className="block text-sm font-medium">Editar variações existentes</Label>

                  {itemForm.options.map((variation, vIndex) => (
                    <div key={`variation-editor-${vIndex}`} className="space-y-3 rounded-lg border bg-muted/30 p-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                        <Input
                          value={variation.name}
                          onChange={(e) => updateVariationInItem(vIndex, { name: e.target.value })}
                          placeholder="Nome da variação"
                        />
                        <Select
                          value={variation.type}
                          onValueChange={(value: 'single' | 'multiple') => updateVariationInItem(vIndex, { type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="single">Escolha única</SelectItem>
                            <SelectItem value="multiple">Múltipla</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2 rounded-md border bg-background px-3">
                          <Checkbox
                            id={`variation-required-${vIndex}`}
                            checked={variation.required}
                            onCheckedChange={(checked) => updateVariationInItem(vIndex, { required: checked as boolean })}
                          />
                          <Label htmlFor={`variation-required-${vIndex}`} className="text-sm">Obrigatório</Label>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {variation.options.map((opt, oIndex) => (
                          <div key={`variation-option-${vIndex}-${oIndex}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                            <Input
                              value={opt.name}
                              onChange={(e) => updateVariationOptionInItem(vIndex, oIndex, { name: e.target.value })}
                              placeholder="Nome da opção"
                            />
                            <Input
                              type="number"
                              step="0.01"
                              value={String(opt.price)}
                              onChange={(e) => updateVariationOptionInItem(vIndex, oIndex, { price: parseFloat(e.target.value) || 0 })}
                              placeholder="Preço"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-destructive"
                              onClick={() => removeOptionFromVariationInItem(vIndex, oIndex)}
                            >
                              Remover
                            </Button>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {variation.options
                          .filter((opt) => opt.name.trim())
                          .map((opt, oIndex) => (
                            <Badge key={`variation-preview-${vIndex}-${oIndex}`} variant="secondary" className="px-2 py-1">
                              {opt.name}: R$ {opt.price.toFixed(2)}
                            </Badge>
                          ))}
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addOptionToVariationInItem(vIndex)}
                      >
                        + Adicionar opção nesta variação
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {hasInvalidVariationConfig && (
                <p className="mt-3 text-sm text-amber-700">
                  Preencha o nome da variação e de cada opção antes de salvar. Cada variação precisa ter pelo menos uma opção.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsAddItemModalOpen(false);
              setIsEditItemModalOpen(false);
              setEditingItem(null);
              resetItemForm();
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (editingItem) {
                  updateItemMutation.mutate({ id: editingItem.id, data: itemForm });
                } else {
                  createItemMutation.mutate(itemForm);
                }
              }}
              disabled={!itemForm.name || !itemForm.price || hasInvalidVariationConfig}
            >
              {editingItem ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Categoria */}
      <Dialog open={isCategoryModalOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCategoryModalOpen(false);
          setEditingCategory(null);
          resetCategoryForm();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
            <DialogDescription>
              {editingCategory ? 'Atualize as informações da categoria.' : 'Crie uma nova categoria para o cardápio.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="catName">Nome da Categoria *</Label>
              <Input
                id="catName"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="Ex: Pizzas, Lanches, Bebidas"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="catDescription">Descrição</Label>
              <Textarea
                id="catDescription"
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                placeholder="Descrição opcional da categoria"
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="catImage">URL da Imagem</Label>
              <Input
                id="catImage"
                value={categoryForm.imageUrl}
                onChange={(e) => setCategoryForm({ ...categoryForm, imageUrl: e.target.value })}
                placeholder="URL da imagem da categoria"
              />
            </div>
            <div className="grid gap-2">
              <Label>Enviar imagem da categoria</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    uploadCategoryImage(file);
                    e.currentTarget.value = '';
                  }
                }}
                disabled={isUploadingCategoryImage}
              />
              {categoryForm.imageUrl && (
                <div className="flex items-center gap-3 rounded-lg border p-2">
                  <img
                    src={categoryForm.imageUrl}
                    alt="Prévia da categoria"
                    className="h-12 w-12 rounded-md object-cover"
                  />
                  <div className="text-xs text-muted-foreground break-all">
                    {categoryForm.imageUrl}
                  </div>
                </div>
              )}
              {isUploadingCategoryImage && (
                <p className="text-xs text-muted-foreground">Enviando imagem...</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox 
                id="catActive"
                checked={categoryForm.isActive}
                onCheckedChange={(checked) => setCategoryForm({ ...categoryForm, isActive: checked as boolean })}
              />
              <Label htmlFor="catActive">Categoria Ativa</Label>
            </div>
            <div className="rounded-xl border p-4 space-y-4 bg-muted/20">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="catHalfHalfEnabled"
                  checked={categoryForm.halfHalfPricing.enabled}
                  onCheckedChange={(checked) => updateHalfHalfPricing({ enabled: checked as boolean })}
                />
                <div className="space-y-1">
                  <Label htmlFor="catHalfHalfEnabled">Ativar preço especial para meio a meio</Label>
                  <p className="text-xs text-muted-foreground">
                    Use isso para categorias como pizzas, quando o valor do meio a meio não deve seguir o preço normal do item.
                  </p>
                </div>
              </div>

              {categoryForm.halfHalfPricing.enabled && (
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label>Como calcular o preço do meio a meio</Label>
                    <Select
                      value={categoryForm.halfHalfPricing.mode}
                      onValueChange={(value: HalfHalfPricingMode) => updateHalfHalfPricing({ mode: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a regra" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="highest_item">Usar o maior preço entre os sabores</SelectItem>
                        <SelectItem value="fixed">Usar um preço fixo para qualquer meio a meio</SelectItem>
                        <SelectItem value="size_map">Usar preço por tamanho (P, M, G)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {categoryForm.halfHalfPricing.mode === 'fixed' && (
                    <div className="grid gap-2">
                      <Label htmlFor="catHalfHalfFixedPrice">Preço fixo do meio a meio</Label>
                      <Input
                        id="catHalfHalfFixedPrice"
                        type="number"
                        step="0.01"
                        placeholder="Ex: 35.00"
                        value={categoryForm.halfHalfPricing.fixedPrice}
                        onChange={(e) => updateHalfHalfPricing({ fixedPrice: e.target.value })}
                      />
                    </div>
                  )}

                  {categoryForm.halfHalfPricing.mode === 'size_map' && (
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="grid gap-2">
                        <Label htmlFor="catHalfHalfPriceP">Preço P</Label>
                        <Input
                          id="catHalfHalfPriceP"
                          type="number"
                          step="0.01"
                          placeholder="Ex: 35.00"
                          value={categoryForm.halfHalfPricing.sizePrices.P}
                          onChange={(e) => updateHalfHalfSizePrice('P', e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="catHalfHalfPriceM">Preço M</Label>
                        <Input
                          id="catHalfHalfPriceM"
                          type="number"
                          step="0.01"
                          placeholder="Ex: 45.00"
                          value={categoryForm.halfHalfPricing.sizePrices.M}
                          onChange={(e) => updateHalfHalfSizePrice('M', e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="catHalfHalfPriceG">Preço G</Label>
                        <Input
                          id="catHalfHalfPriceG"
                          type="number"
                          step="0.01"
                          placeholder="Ex: 55.00"
                          value={categoryForm.halfHalfPricing.sizePrices.G}
                          onChange={(e) => updateHalfHalfSizePrice('G', e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCategoryModalOpen(false);
              setEditingCategory(null);
              resetCategoryForm();
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (editingCategory) {
                  updateCategoryMutation.mutate({ id: editingCategory.id, data: categoryForm });
                } else {
                  createCategoryMutation.mutate(categoryForm);
                }
              }}
              disabled={!categoryForm.name}
            >
              {editingCategory ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedItems.length} item(s)? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteItemsMutation.mutate(selectedItems)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
