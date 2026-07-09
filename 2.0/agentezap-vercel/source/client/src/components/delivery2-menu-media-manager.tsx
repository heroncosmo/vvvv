import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FileText, ImageIcon, Save, Upload, WandSparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";

const DELIVERY2_MENU_FLOW_NAME = "DELIVERY2_CARDAPIO";

type Delivery2Config = {
  id: string | null;
  user_id: string;
  is_active: boolean;
  send_to_ai: boolean;
  display_name: string;
  menu_auto_send_on_greeting: boolean;
  menu_auto_send_on_request: boolean;
};

type MediaFlowItem = {
  id?: string;
  order?: number;
  type: "media";
  storageUrl: string;
  mediaType: "image" | "document";
  caption?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
};

type AgentMedia = {
  id: string;
  name: string;
  mediaType: "audio" | "image" | "video" | "document" | "flow";
  storageUrl?: string | null;
  fileName?: string | null;
  caption?: string | null;
  description?: string | null;
  flowItems?: MediaFlowItem[] | null;
};

type MenuAsset = {
  id: string;
  storageUrl: string;
  mediaType: "image" | "document";
  caption: string;
  fileName: string;
  mimeType: string;
};

function inferMediaType(mimeType: string | undefined, fileName: string | undefined): "image" | "document" {
  const mime = String(mimeType || "").toLowerCase();
  const file = String(fileName || "").toLowerCase();
  if (mime.includes("pdf") || file.endsWith(".pdf")) {
    return "document";
  }
  return "image";
}

function createAssetId() {
  return `delivery2-menu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function stripFileExtension(value: string) {
  const fileName = String(value || "");
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) return fileName;
  return fileName.slice(0, lastDot);
}

export function Delivery2MenuMediaManager({
  config,
  onUpdateConfig,
}: {
  config?: Delivery2Config;
  onUpdateConfig: (patch: Partial<Delivery2Config>) => Promise<unknown>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [menuAssets, setMenuAssets] = useState<MenuAsset[]>([]);
  const [selectedLibraryMediaId, setSelectedLibraryMediaId] = useState("");
  const [sendOnGreeting, setSendOnGreeting] = useState(false);
  const [sendOnRequest, setSendOnRequest] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  const { data: mediaLibrary = [] } = useQuery<AgentMedia[]>({
    queryKey: ["/api/agent/media"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/agent/media");
      return response.json();
    },
    staleTime: 60000,
  });

  const delivery2MenuFlow = useMemo(
    () => mediaLibrary.find((media) => media.name === DELIVERY2_MENU_FLOW_NAME && media.mediaType === "flow"),
    [mediaLibrary],
  );

  const selectableLibraryMedia = useMemo(
    () =>
      mediaLibrary.filter(
        (media) =>
          (media.mediaType === "image" || media.mediaType === "document") &&
          Boolean(media.storageUrl),
      ),
    [mediaLibrary],
  );

  useEffect(() => {
    if (!config) return;
    setSendOnGreeting(config.menu_auto_send_on_greeting === true);
    setSendOnRequest(config.menu_auto_send_on_request !== false);
  }, [config?.menu_auto_send_on_greeting, config?.menu_auto_send_on_request]);

  useEffect(() => {
    if (isDirty) return;

    const loadedItems = (delivery2MenuFlow?.flowItems || [])
      .filter((item): item is MediaFlowItem => item.type === "media" && Boolean(item.storageUrl))
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((item): MenuAsset => ({
        id: item.id || createAssetId(),
        storageUrl: String(item.storageUrl),
        mediaType: item.mediaType === "document" ? "document" : "image",
        caption: String(item.caption || ""),
        fileName: String(item.fileName || "midia"),
        mimeType: String(item.mimeType || (item.mediaType === "document" ? "application/pdf" : "image/*")),
      }));

    setMenuAssets(loadedItems);
  }, [delivery2MenuFlow, isDirty]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await onUpdateConfig({
        menu_auto_send_on_greeting: sendOnGreeting,
        menu_auto_send_on_request: sendOnRequest,
      });

      const normalizedFlowItems = menuAssets.map((asset, index) => ({
        id: asset.id,
        order: index,
        type: "media" as const,
        storageUrl: asset.storageUrl,
        mediaType: asset.mediaType,
        caption: asset.caption || asset.fileName,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
      }));

      if (normalizedFlowItems.length === 0) {
        if (delivery2MenuFlow?.id) {
          await apiRequest("DELETE", `/api/agent/media/${delivery2MenuFlow.id}`);
        }
      } else {
        const payload = {
          name: DELIVERY2_MENU_FLOW_NAME,
          mediaType: "flow",
          storageUrl: "",
          description: "Cardapio automatico do Delivery 2.0",
          whenToUse: "Usado pelo Delivery 2.0 quando o cliente pedir cardapio ou quando a configuracao mandar enviar no oi",
          caption: "Cardapio do Delivery 2.0",
          isActive: true,
          sendAlone: false,
          flowItems: normalizedFlowItems,
        };

        if (delivery2MenuFlow?.id) {
          await apiRequest("PUT", `/api/agent/media/${delivery2MenuFlow.id}`, payload);
        } else {
          await apiRequest("POST", "/api/agent/media", payload);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/agent/media"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/delivery-2-config"] });
    },
    onSuccess: () => {
      setIsDirty(false);
      setSelectedLibraryMediaId("");
      toast({
        title: "Cardapio do Delivery 2.0 salvo",
        description: "A ordem das midias e os gatilhos automaticos foram atualizados.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Falha ao salvar cardapio",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  async function handleUpload(file?: File | null) {
    if (!file) return;

    try {
      const token = await getAuthToken();
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/agent/media/upload", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await response.json();

      if (!response.ok || !data?.storageUrl) {
        throw new Error(data?.message || "Falha ao enviar arquivo");
      }

      setMenuAssets((current) => [
        ...current,
        {
          id: createAssetId(),
          storageUrl: String(data.storageUrl),
          mediaType: inferMediaType(data.mimeType, data.fileName || file.name),
          caption: stripFileExtension(file.name),
          fileName: data.fileName || file.name,
          mimeType: data.mimeType || file.type || "application/octet-stream",
        },
      ]);
      setIsDirty(true);
      toast({
        title: "Arquivo enviado",
        description: "Ele ja entrou na fila do cardapio do Delivery 2.0.",
      });
    } catch (error: any) {
      toast({
        title: "Erro no upload",
        description: error?.message || "Nao foi possivel enviar o arquivo.",
        variant: "destructive",
      });
    }
  }

  function addFromLibrary() {
    const media = selectableLibraryMedia.find((item) => item.id === selectedLibraryMediaId);
    if (!media?.storageUrl) return;

    if (menuAssets.some((asset) => asset.storageUrl === media.storageUrl)) {
      toast({
        title: "Midia ja adicionada",
        description: "Essa imagem ou PDF ja esta na sequencia do cardapio.",
      });
      return;
    }

    setMenuAssets((current) => [
      ...current,
      {
        id: createAssetId(),
        storageUrl: media.storageUrl,
        mediaType: media.mediaType === "document" ? "document" : "image",
        caption: media.caption || media.description || media.name,
        fileName: media.fileName || media.name,
        mimeType: media.mediaType === "document" ? "application/pdf" : "image/*",
      },
    ]);
    setIsDirty(true);
    setSelectedLibraryMediaId("");
  }

  function moveAsset(index: number, direction: "up" | "down") {
    setMenuAssets((current) => {
      const next = [...current];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return current;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
    setIsDirty(true);
  }

  function removeAsset(index: number) {
    setMenuAssets((current) => current.filter((_, assetIndex) => assetIndex !== index));
    setIsDirty(true);
  }

  function updateCaption(index: number, caption: string) {
    setMenuAssets((current) =>
      current.map((asset, assetIndex) => (assetIndex === index ? { ...asset, caption } : asset)),
    );
    setIsDirty(true);
  }

  return (
    <Card className="border-border/70 bg-background/95">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <WandSparkles className="h-4 w-4" />
          Cardapio em imagem ou PDF
        </CardTitle>
        <CardDescription>
          Suba as paginas do cardapio, escolha a ordem e decida quando o Delivery 2.0 deve enviar esse material.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">Enviar no primeiro oi</p>
                <p className="text-sm text-muted-foreground">
                  Se o cliente abrir a conversa com saudacao simples, o cardapio sai automaticamente.
                </p>
              </div>
              <Switch
                checked={sendOnGreeting}
                onCheckedChange={(checked) => {
                  setSendOnGreeting(checked);
                  setIsDirty(true);
                }}
              />
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">Enviar quando pedir cardapio</p>
                <p className="text-sm text-muted-foreground">
                  Quando o cliente pedir menu, cardapio ou sabores, a sequencia e disparada sozinha.
                </p>
              </div>
              <Switch
                checked={sendOnRequest}
                onCheckedChange={(checked) => {
                  setSendOnRequest(checked);
                  setIsDirty(true);
                }}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3 rounded-2xl border border-border/70 p-4">
            <div className="space-y-2">
              <Label>Adicionar nova pagina</Label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  void handleUpload(file);
                  event.currentTarget.value = "";
                }}
              />
              <p className="text-xs text-muted-foreground">
                Aceita imagem e PDF. A ordem final define o que o cliente recebe primeiro, segundo e terceiro.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Adicionar da biblioteca</Label>
              <div className="flex gap-2">
                <Select value={selectedLibraryMediaId} onValueChange={setSelectedLibraryMediaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha uma imagem ou PDF existente" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableLibraryMedia.length === 0 ? (
                      <SelectItem value="__empty" disabled>
                        Nenhuma midia elegivel
                      </SelectItem>
                    ) : (
                      selectableLibraryMedia.map((media) => (
                        <SelectItem key={media.id} value={media.id}>
                          {media.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={addFromLibrary} disabled={!selectedLibraryMediaId}>
                  Adicionar
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-border/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Sequencia do cardapio</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  O cliente recebe exatamente nesta ordem.
                </p>
              </div>
              <Badge variant="secondary">{menuAssets.length} item(ns)</Badge>
            </div>

            {menuAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhuma pagina configurada ainda.
              </div>
            ) : (
              <div className="space-y-3">
                {menuAssets.map((asset, index) => (
                  <div key={asset.id} className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-background">
                        {asset.mediaType === "image" ? (
                          <img src={asset.storageUrl} alt={asset.fileName} className="h-full w-full object-cover" />
                        ) : (
                          <FileText className="h-6 w-6 text-rose-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">#{index + 1}</Badge>
                          <Badge variant="outline">
                            {asset.mediaType === "image" ? <ImageIcon className="mr-1 h-3 w-3" /> : <FileText className="mr-1 h-3 w-3" />}
                            {asset.mediaType === "image" ? "Imagem" : "PDF"}
                          </Badge>
                          <span className="truncate text-sm text-muted-foreground">{asset.fileName}</span>
                        </div>
                        <Input
                          value={asset.caption}
                          onChange={(event) => updateCaption(index, event.target.value)}
                          placeholder="Legenda opcional para esta pagina"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button type="button" variant="ghost" size="icon" onClick={() => moveAsset(index, "up")} disabled={index === 0}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => moveAsset(index, "down")}
                          disabled={index === menuAssets.length - 1}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeAsset(index)}>
                          <X className="h-4 w-4 text-rose-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Upload className="mr-2 h-4 w-4 animate-pulse" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar cardapio do Delivery 2.0
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
