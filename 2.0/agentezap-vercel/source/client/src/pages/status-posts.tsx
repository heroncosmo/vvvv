import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  HelpCircle,
  ImageIcon,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Video,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  buildBrazilDateTimeRequest,
  formatBrazilDateTime,
  getBrazilDateInputValue,
  getBrazilNowDate,
  parseBrazilDateTime,
} from "@/lib/brazil-time";
import { cn } from "@/lib/utils";

type StatusContentType = "text" | "image" | "video";
type StatusAction = "now" | "daily" | "weekdays" | "schedule";
type StatusSubmitMode = "now" | "schedule";

interface StatusPostItem {
  id: string;
  connectionId?: string | null;
  contentType: "text" | "image" | "video" | "audio";
  text: string;
  caption: string;
  mediaUrl: string;
  mimeType: string;
  fileName: string;
  storagePath: string;
  summary: string;
  status: string;
  displayStatus?: string;
  statusDetail?: string | null;
  wasInterrupted?: boolean;
  scheduledFor: string;
  lastSentAt?: string | null;
  errorMessage?: string | null;
  recurrenceType: string;
  actionLabel: string;
  selectedWeekdays?: number[];
  aiVariationEnabled?: boolean;
  requestedAction?: StatusAction | null;
  sendRetryCount?: number;
}

interface UploadedMedia {
  storageUrl: string;
  storagePath: string;
  mimeType: string;
  mediaType: "audio" | "image" | "video" | "document";
  fileName: string;
}

interface GeneratedImage {
  dataUrl: string;
  mimeType: string;
  fileName: string;
  model?: string;
}

interface ReuseMediaState {
  contentType: StatusContentType;
  mediaUrl: string;
  mimeType: string;
  fileName: string;
  storagePath: string;
}

interface StatusPostHistoryItem {
  id: string;
  status: string;
  attemptedAt: string;
  scheduledFor?: string | null;
  errorMessage?: string | null;
}

interface StatusConnectionItem {
  id: string;
  connectionName?: string | null;
  phoneNumber?: string | null;
  isConnected?: boolean;
  isRecovering?: boolean;
  isPrimary?: boolean | null;
  providerStatus?: string | null;
}

const weekdayOptions = [
  { value: 0, short: "Dom", full: "Domingo" },
  { value: 1, short: "Seg", full: "Segunda" },
  { value: 2, short: "Ter", full: "Terca" },
  { value: 3, short: "Qua", full: "Quarta" },
  { value: 4, short: "Qui", full: "Quinta" },
  { value: 5, short: "Sex", full: "Sexta" },
  { value: 6, short: "Sab", full: "Sabado" },
];

const automationModeMeta: Record<
  "daily" | "weekdays",
  {
    label: string;
    short: string;
    help: string;
    tone: string;
  }
> = {
  daily: {
    label: "Todo dia",
    short: "Continua todos os dias no mesmo horario.",
    help: "Use quando a mesma campanha precisa voltar diariamente sem voce abrir a tela de novo.",
    tone: "border-emerald-600 bg-emerald-50 text-emerald-700",
  },
  weekdays: {
    label: "Dias da semana",
    short: "Repete apenas nos dias escolhidos.",
    help: "Use quando o status precisa aparecer so em dias especificos, como segunda, quarta e sexta.",
    tone: "border-blue-600 bg-blue-50 text-blue-700",
  },
};

const typeMeta: Record<
  StatusContentType,
  {
    label: string;
    short: string;
    help: string;
  }
> = {
  text: {
    label: "Texto",
    short: "Mensagem pura",
    help: "Use quando a mensagem sozinha ja vende bem e a IA pode variar o texto em recorrencias.",
  },
  image: {
    label: "Imagem",
    short: "Arte ou foto",
    help: "Use uma imagem pronta ou gere uma nova com IA. Aqui voce escreve apenas a legenda.",
  },
  video: {
    label: "Video",
    short: "Video com legenda",
    help: "Envie um video e escreva apenas a legenda que acompanha a postagem.",
  },
};

const statusTone: Record<string, string> = {
  sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  processing: "bg-sky-50 text-sky-700 border-sky-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  retrying: "bg-orange-50 text-orange-700 border-orange-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
};

const statusLabel: Record<string, string> = {
  sent: "Publicado",
  processing: "Postando agora",
  pending: "Na fila",
  retrying: "Tentando novamente",
  failed: "Falhou",
};

function formatDateTime(value?: string | null) {
  return formatBrazilDateTime(value);
}

function buildLocalIso(date: string, time: string) {
  return buildBrazilDateTimeRequest(date, time);
}

function getBrazilTimeInputValue(reference: Date) {
  const hours = String(reference.getHours()).padStart(2, "0");
  const minutes = String(reference.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function buildBrazilDateTimeFromDate(reference: Date) {
  const year = reference.getFullYear().toString().padStart(4, "0");
  const month = String(reference.getMonth() + 1).padStart(2, "0");
  const day = String(reference.getDate()).padStart(2, "0");
  return buildBrazilDateTimeRequest(`${year}-${month}-${day}`, getBrazilTimeInputValue(reference));
}

function buildNextDailyIso(time: string) {
  const now = getBrazilNowDate();
  const nextDate = getBrazilNowDate();
  const [hours, minutes] = time.split(":").map((value) => Number(value) || 0);
  nextDate.setHours(hours, minutes, 0, 0);
  if (nextDate.getTime() <= now.getTime()) {
    nextDate.setDate(nextDate.getDate() + 1);
  }
  return buildBrazilDateTimeFromDate(nextDate);
}

function buildNextWeekdayIso(selectedWeekdays: number[], time: string) {
  const now = getBrazilNowDate();
  const [hours, minutes] = time.split(":").map((value) => Number(value) || 0);

  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);

    if (!selectedWeekdays.includes(candidate.getDay())) {
      continue;
    }

    if (candidate.getTime() > now.getTime()) {
      return buildBrazilDateTimeFromDate(candidate);
    }
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 7);
  fallback.setHours(hours, minutes, 0, 0);
  return buildBrazilDateTimeFromDate(fallback);
}

function formatWeekdayList(selectedWeekdays?: number[]) {
  const labels = weekdayOptions
    .filter((option) => selectedWeekdays?.includes(option.value))
    .map((option) => option.full);
  return labels.join(", ");
}

function buildUpcomingOccurrences(item: StatusPostItem, limit = 5) {
  const occurrences: string[] = [];
  if (!item.scheduledFor) {
    return occurrences;
  }

  const parsedBase = parseBrazilDateTime(item.scheduledFor);
  if (!parsedBase) {
    return occurrences;
  }

  const base = getBrazilNowDate(parsedBase);
  const now = getBrazilNowDate();

  if (item.recurrenceType === "none") {
    if (base.getTime() > now.getTime()) {
      occurrences.push(buildBrazilDateTimeFromDate(base));
    }
    return occurrences;
  }

  if (item.recurrenceType === "daily") {
    const cursor = new Date(base);
    while (occurrences.length < limit) {
      if (cursor.getTime() > now.getTime()) {
        occurrences.push(buildBrazilDateTimeFromDate(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return occurrences;
  }

  if (item.recurrenceType === "weekly") {
    const selected = item.selectedWeekdays || [];
    if (selected.length === 0) {
      return occurrences;
    }
    const cursor = new Date(base);
    let guard = 0;
    while (occurrences.length < limit && guard < 90) {
      if (
        cursor.getTime() > now.getTime() &&
        selected.includes(cursor.getDay())
      ) {
        occurrences.push(buildBrazilDateTimeFromDate(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  }

  return occurrences;
}

function getAcceptedFiles(contentType: StatusContentType) {
  if (contentType === "image") return "image/*";
  if (contentType === "video") return "video/*";
  return "";
}

function getLifecycleStatus(
  item: Pick<StatusPostItem, "status" | "displayStatus">,
) {
  return item.displayStatus || item.status;
}

function formatMediaUrlLabel(value?: string | null) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return "";
  }

  try {
    const parsed = new URL(safeValue);
    return `${parsed.hostname}${parsed.pathname}`.slice(0, 72);
  } catch {
    return safeValue.slice(0, 72);
  }
}

function buildConnectionLabel(connection?: StatusConnectionItem | null) {
  if (!connection) {
    return "Canal";
  }

  const connectionName = String(connection.connectionName || "").trim();
  const phoneNumber = String(connection.phoneNumber || "").trim();

  if (connectionName && phoneNumber) {
    return `${connectionName} • ${phoneNumber}`;
  }

  if (connectionName) {
    return connectionName;
  }

  if (phoneNumber) {
    return phoneNumber;
  }

  return `Conexao ${connection.id.slice(0, 6)}`;
}

async function statusRequest(url: string, options: RequestInit = {}) {
  const memberToken = localStorage.getItem("memberToken");
  const token = memberToken || (await getAuthToken());
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });
}

function HelpTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] text-xs leading-5">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export default function StatusPostsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previousStatusMapRef = useRef<Record<string, string>>({});
  const topRef = useRef<HTMLDivElement | null>(null);
  const [contentType, setContentType] = useState<StatusContentType>("text");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(
    null,
  );
  const [reuseMedia, setReuseMedia] = useState<ReuseMediaState | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [isScheduleEnabled, setIsScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() =>
    getBrazilDateInputValue(),
  );
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [imagePrompt, setImagePrompt] = useState("");
  const [isImagePromptOpen, setIsImagePromptOpen] = useState(false);
  const [aiVariationEnabled, setAiVariationEnabled] = useState(true);
  const [aiVariationPrompt, setAiVariationPrompt] = useState("");
  const [continueAutomationAfterNow, setContinueAutomationAfterNow] =
    useState(false);
  const [afterNowAction, setAfterNowAction] = useState<"daily" | "weekdays">(
    "daily",
  );
  const [afterNowDailyTime, setAfterNowDailyTime] = useState("09:00");
  const [afterNowWeekdayTime, setAfterNowWeekdayTime] = useState("09:00");
  const [afterNowWeekdays, setAfterNowWeekdays] = useState<number[]>([
    1, 2, 3, 4, 5,
  ]);
  const [detailsPostId, setDetailsPostId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");

  const { data: posts = [], isLoading } = useQuery<StatusPostItem[]>({
    queryKey: ["/api/status/posts"],
    refetchInterval: (query) => {
      const items = (query.state.data as StatusPostItem[] | undefined) || [];
      return items.some((item) =>
        ["pending", "processing", "retrying"].includes(
          getLifecycleStatus(item),
        ),
      )
        ? 5000
        : false;
    },
  });

  const { data: allConnections = [] } = useQuery<StatusConnectionItem[]>({
    queryKey: ["/api/whatsapp/connections"],
    queryFn: async () => {
      const response = await statusRequest("/api/whatsapp/connections");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Falha ao carregar canais");
      }
      return data as StatusConnectionItem[];
    },
  });

  const selectedDetailsPost = detailsPostId
    ? posts.find((item) => item.id === detailsPostId) || null
    : null;
  const { data: postHistory = [], isLoading: isHistoryLoading } = useQuery<
    StatusPostHistoryItem[]
  >({
    queryKey: ["/api/status/posts", detailsPostId, "history"],
    enabled: Boolean(detailsPostId),
    queryFn: async () => {
      const response = await statusRequest(
        `/api/status/posts/${detailsPostId}/history`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Falha ao carregar historico");
      }
      return data as StatusPostHistoryItem[];
    },
  });

  useEffect(() => {
    if (selectedFile) {
      const nextUrl = URL.createObjectURL(selectedFile);
      setPreviewUrl(nextUrl);
      return () => URL.revokeObjectURL(nextUrl);
    }

    if (generatedImage) {
      setPreviewUrl(generatedImage.dataUrl);
      return;
    }

    if (reuseMedia?.mediaUrl) {
      setPreviewUrl(reuseMedia.mediaUrl);
      return;
    }

    setPreviewUrl("");
  }, [generatedImage, reuseMedia, selectedFile]);

  useEffect(() => {
    if (contentType === "text") {
      setSelectedFile(null);
      setGeneratedImage(null);
      setIsImagePromptOpen(false);
      return;
    }

    if (selectedFile) {
      const fileMatchesImage =
        contentType === "image" && selectedFile.type.startsWith("image/");
      const fileMatchesVideo =
        contentType === "video" && selectedFile.type.startsWith("video/");
      if (!fileMatchesImage && !fileMatchesVideo) {
        setSelectedFile(null);
      }
    }

    if (contentType === "video" && generatedImage) {
      setGeneratedImage(null);
    }

    if (reuseMedia && reuseMedia.contentType !== contentType) {
      setReuseMedia(null);
    }

    if (contentType !== "image") {
      setIsImagePromptOpen(false);
    }
  }, [contentType, generatedImage, reuseMedia, selectedFile]);

  const availableConnections = allConnections.filter(
    (connection) =>
      connection.isConnected ||
      connection.isRecovering ||
      connection.providerStatus === "connected",
  );

  useEffect(() => {
    const source =
      availableConnections.length > 0 ? availableConnections : allConnections;

    if (source.length === 0) {
      if (selectedConnectionId) {
        setSelectedConnectionId("");
      }
      return;
    }

    const stillExists = source.some(
      (connection) => connection.id === selectedConnectionId,
    );
    if (stillExists) {
      return;
    }

    const preferredConnection =
      source.find((connection) => connection.isPrimary) || source[0];
    setSelectedConnectionId(preferredConnection.id);
  }, [allConnections, availableConnections, selectedConnectionId]);

  useEffect(() => {
    const previousMap = previousStatusMapRef.current;
    for (const item of posts) {
      const previous = previousMap[item.id];
      if (!previous || previous === item.status) {
        continue;
      }

      const nextStatus = getLifecycleStatus(item);
      if (
        ["pending", "processing", "retrying"].includes(previous) &&
        nextStatus === "sent"
      ) {
        toast({
          title: "Status publicado",
          description: `${item.summary} foi enviado com sucesso.`,
        });
      }

      if (
        ["pending", "processing", "retrying"].includes(previous) &&
        nextStatus === "failed"
      ) {
        toast({
          title: "Falha na postagem",
          description:
            item.errorMessage || "Nao foi possivel concluir a postagem.",
          variant: "destructive",
        });
      }
    }

    previousStatusMapRef.current = Object.fromEntries(
      posts.map((item) => [item.id, getLifecycleStatus(item)]),
    );
  }, [posts, toast]);

  async function requestImageIdea() {
    const message = bodyText.trim();
    if (!message) {
      throw new Error(
        "Escreva a mensagem base antes de pedir uma ideia de imagem",
      );
    }

    const response = await statusRequest(
      "/api/status/posts/generate-image-idea",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          businessHint: "Status comercial para cliente do AgenteZap",
        }),
      },
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao criar ideia de imagem");
    }

    return String(data?.prompt || "").trim();
  }

  const generateIdeaMutation = useMutation({
    mutationFn: requestImageIdea,
    onSuccess: (prompt) => {
      setIsImagePromptOpen(true);
      setImagePrompt(prompt);
      toast({
        title: "Ideia pronta",
        description: "Voce pode editar o prompt antes de gerar a imagem.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar ideia",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateImageMutation = useMutation({
    mutationFn: async () => {
      const prompt = imagePrompt.trim();
      if (!prompt) {
        throw new Error("Descreva a imagem que deseja gerar");
      }

      const response = await statusRequest("/api/status/posts/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Falha ao gerar imagem");
      }

      return data as GeneratedImage;
    },
    onSuccess: (data) => {
      setSelectedFile(null);
      setGeneratedImage(data);
      setReuseMedia(null);
      toast({
        title: "Imagem gerada",
        description: "A imagem ja ficou pronta para usar no status.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao gerar imagem",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateIdeaAndImageMutation = useMutation({
    mutationFn: async () => {
      const prompt = await requestImageIdea();
      const response = await statusRequest("/api/status/posts/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Falha ao gerar imagem");
      }

      return {
        prompt,
        image: data as GeneratedImage,
      };
    },
    onSuccess: ({ prompt, image }) => {
      setIsImagePromptOpen(true);
      setImagePrompt(prompt);
      setSelectedFile(null);
      setGeneratedImage(image);
      setReuseMedia(null);
      toast({
        title: "Ideia e imagem prontas",
        description: "A IA sugeriu o prompt e ja gerou a arte para o status.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao gerar ideia com imagem",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createPostMutation = useMutation({
    mutationFn: async (mode: StatusSubmitMode) => {
      if (contentType === "text" && !bodyText.trim()) {
        throw new Error("Digite a mensagem do status");
      }

      if (allConnections.length > 0 && !selectedConnectionId) {
        throw new Error("Escolha o canal que vai publicar o status");
      }

      const hasMedia = Boolean(selectedFile || generatedImage || reuseMedia);
      if ((contentType === "image" || contentType === "video") && !hasMedia) {
        throw new Error(
          contentType === "image"
            ? "Envie ou gere uma imagem"
            : "Envie um video",
        );
      }

      if (
        mode === "now" &&
        continueAutomationAfterNow &&
        afterNowAction === "weekdays" &&
        afterNowWeekdays.length === 0
      ) {
        throw new Error("Escolha ao menos um dia para continuar no automatico");
      }

      if (mode === "schedule" && !isScheduleEnabled) {
        throw new Error(
          "Ative o agendamento antes de salvar uma postagem agendada",
        );
      }

      let fileToUpload = selectedFile;
      if (!fileToUpload && generatedImage) {
        const imageResponse = await fetch(generatedImage.dataUrl);
        const blob = await imageResponse.blob();
        fileToUpload = new File([blob], generatedImage.fileName, {
          type: generatedImage.mimeType,
        });
      }

      let uploadData: UploadedMedia | undefined;

      if (fileToUpload) {
        const formData = new FormData();
        formData.append("file", fileToUpload);

        const uploadRes = await apiRequest(
          "POST",
          "/api/agent/media/upload",
          formData,
        );
        const uploaded = await uploadRes.json();
        if (!uploaded?.success) {
          throw new Error("Falha ao enviar a midia");
        }

        if (
          (contentType === "image" && uploaded.mediaType !== "image") ||
          (contentType === "video" && uploaded.mediaType !== "video")
        ) {
          throw new Error(
            contentType === "image"
              ? "Envie uma imagem valida"
              : "Envie um video valido",
          );
        }

        uploadData = uploaded as UploadedMedia;
      }

      let scheduledFor: string | undefined;
      if (mode === "schedule") {
        scheduledFor = buildLocalIso(scheduleDate, scheduleTime);
      }

      let followUpScheduledFor: string | undefined;
      if (mode === "now" && continueAutomationAfterNow) {
        followUpScheduledFor =
          afterNowAction === "daily"
            ? buildNextDailyIso(afterNowDailyTime)
            : buildNextWeekdayIso(afterNowWeekdays, afterNowWeekdayTime);
      }

      const response = await statusRequest("/api/status/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectionId: selectedConnectionId || undefined,
          action: mode === "schedule" ? "schedule" : "now",
          contentType,
          text: contentType === "text" ? bodyText : "",
          caption: contentType !== "text" ? bodyText : "",
          mediaUrl: uploadData?.storageUrl || reuseMedia?.mediaUrl,
          mimeType: uploadData?.mimeType || reuseMedia?.mimeType,
          fileName: uploadData?.fileName || reuseMedia?.fileName,
          storagePath: uploadData?.storagePath || reuseMedia?.storagePath,
          scheduledFor,
          selectedWeekdays: [],
          aiVariationEnabled:
            contentType === "text" &&
            mode === "now" &&
            continueAutomationAfterNow
              ? aiVariationEnabled
              : false,
          aiVariationPrompt: contentType === "text" ? aiVariationPrompt : "",
          continueAutomationAfterNow:
            mode === "now" ? continueAutomationAfterNow : false,
          followUpAction:
            mode === "now" && continueAutomationAfterNow
              ? afterNowAction
              : undefined,
          followUpScheduledFor,
          followUpSelectedWeekdays:
            mode === "now" &&
            continueAutomationAfterNow &&
            afterNowAction === "weekdays"
              ? afterNowWeekdays
              : [],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Falha ao salvar a postagem");
      }

      return data;
    },
    onSuccess: (data: {
      message?: string;
      audienceCount?: number;
      audienceSource?: "saved_contacts" | "session_contacts" | "none";
      statusPrivacyLabel?: string | null;
      followUpCreated?: boolean;
      followUpAction?: "daily" | "weekdays" | null;
      followUpScheduledFor?: string | null;
    }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/status/posts"] });
      setSelectedFile(null);
      setGeneratedImage(null);
      setReuseMedia(null);
      setBodyText("");
      setImagePrompt("");
      setIsImagePromptOpen(false);
      setAiVariationPrompt("");
      setIsScheduleEnabled(false);
      setContinueAutomationAfterNow(false);
      toast({
        title: "Postagem criada",
        description: data?.followUpCreated
          ? `${data?.message || "A tentativa foi criada."} A rotina ${data.followUpAction === "weekdays" ? "por dias da semana" : "diaria"} ficou marcada para ${formatDateTime(data.followUpScheduledFor)}.`
          : data?.message ||
            (typeof data?.audienceCount === "number" && data.audienceCount > 0
              ? `Tentativa criada para ${data.audienceCount} contatos elegiveis desta conexao.`
              : "A tentativa foi criada e a lista abaixo mostra quando ela enviar."),
      });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/status/posts"] });
      toast({
        title: "Erro ao postar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/status/posts/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/status/posts"] });
      toast({ title: "Postagem excluida" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validImage =
      contentType === "image" && file.type.startsWith("image/");
    const validVideo =
      contentType === "video" && file.type.startsWith("video/");
    if (!validImage && !validVideo) {
      toast({
        title: "Arquivo invalido",
        description:
          contentType === "image"
            ? "Selecione uma imagem"
            : "Selecione um video",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    setGeneratedImage(null);
    setSelectedFile(file);
    setReuseMedia(null);
  };

  const openFilePicker = () => {
    if (contentType === "text") {
      return;
    }
    fileInputRef.current?.click();
  };

  const clearMedia = () => {
    setSelectedFile(null);
    setGeneratedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const toggleAfterNowWeekday = (value: number) => {
    setAfterNowWeekdays((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value].sort((left, right) => left - right),
    );
  };

  const activeType = typeMeta[contentType];
  const selectedConnection =
    allConnections.find(
      (connection) => connection.id === selectedConnectionId,
    ) || null;
  const showTextVariation =
    contentType === "text" && continueAutomationAfterNow;
  const messageLabel = contentType === "text" ? "Mensagem" : "Legenda";
  const messagePlaceholder =
    contentType === "text"
      ? "Digite a mensagem principal do seu status"
      : contentType === "image"
        ? "Escreva a legenda da imagem"
        : "Escreva a legenda do video";
  const mediaBadgeLabel =
    selectedFile?.name ||
    generatedImage?.fileName ||
    reuseMedia?.fileName ||
    "";
  const canOpenUploader = contentType === "image" || contentType === "video";
  const isSubmittingNow =
    createPostMutation.isPending && createPostMutation.variables === "now";
  const isSubmittingSchedule =
    createPostMutation.isPending && createPostMutation.variables === "schedule";
  const primarySubmitMode: StatusSubmitMode = isScheduleEnabled
    ? "schedule"
    : "now";
  const primarySubmitLabel = isScheduleEnabled ? "Salvar" : "Postar";
  const automaticSummary =
    afterNowAction === "daily"
      ? formatDateTime(buildNextDailyIso(afterNowDailyTime))
      : formatDateTime(
          buildNextWeekdayIso(afterNowWeekdays, afterNowWeekdayTime),
        );

  const handleContinueAutomationToggle = (checked: boolean) => {
    setContinueAutomationAfterNow(checked);
  };

  const handleScheduleToggle = (checked: boolean) => {
    setIsScheduleEnabled(checked);
  };

  const handleContentTypeChange = (nextType: StatusContentType) => {
    setContentType(nextType);
    if (reuseMedia && reuseMedia.contentType !== nextType) {
      setReuseMedia(null);
    }
  };

  const handleRepost = (item: StatusPostItem) => {
    setContentType(item.contentType);
    setSelectedConnectionId(item.connectionId || selectedConnectionId);
    setBodyText(item.contentType === "text" ? item.text : item.caption || "");
    setSelectedFile(null);
    setGeneratedImage(null);
    setReuseMedia(null);
    setImagePrompt("");
    setIsImagePromptOpen(false);
    setAiVariationEnabled(Boolean(item.aiVariationEnabled));
    setAiVariationPrompt(item.aiVariationPrompt || "");
    setIsScheduleEnabled(false);
    setContinueAutomationAfterNow(false);

    if (item.contentType !== "text" && item.mediaUrl) {
      setReuseMedia({
        contentType: item.contentType,
        mediaUrl: item.mediaUrl,
        mimeType: item.mimeType || "",
        fileName: item.fileName || "midia",
        storagePath: item.storagePath || "",
      });
    }

    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const upcomingOccurrences = selectedDetailsPost
    ? buildUpcomingOccurrences(selectedDetailsPost, 6)
    : [];
  const detailsScheduleLabel = selectedDetailsPost
    ? selectedDetailsPost.recurrenceType === "daily"
      ? "Todos os dias"
      : selectedDetailsPost.recurrenceType === "weekly"
        ? formatWeekdayList(selectedDetailsPost.selectedWeekdays) ||
          "Dias da semana"
        : "Postagem unica"
    : "";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-3 md:p-4">
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="space-y-4 p-4 md:p-4">
          <div ref={topRef} className="space-y-4">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-[2rem]">
              Postar status
            </h1>

            {allConnections.length > 1 && (
              <div className="rounded-[24px] border border-slate-200 bg-white p-2.5">
                <Select
                  value={selectedConnectionId}
                  onValueChange={setSelectedConnectionId}
                >
                  <SelectTrigger className="h-11 rounded-full border-slate-200 bg-slate-50 text-sm font-medium text-slate-700">
                    <SelectValue placeholder="Escolha o canal" />
                  </SelectTrigger>
                  <SelectContent>
                    {(availableConnections.length > 0
                      ? availableConnections
                      : allConnections
                    ).map((connection) => (
                      <SelectItem key={connection.id} value={connection.id}>
                        {buildConnectionLabel(connection)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 md:flex">
              {(["text", "image", "video"] as StatusContentType[]).map(
                (option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleContentTypeChange(option)}
                    className={cn(
                      "inline-flex h-11 min-w-0 items-center justify-center rounded-full border px-3 text-sm font-semibold transition",
                      contentType === option
                        ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                    )}
                  >
                    {typeMeta[option].label}
                  </button>
                ),
              )}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-2.5">
              <div className="grid grid-cols-3 gap-2">
                <div className="contents md:flex md:items-center md:gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleContinueAutomationToggle(
                        !continueAutomationAfterNow,
                      )
                    }
                    className={cn(
                      "inline-flex h-11 min-w-0 items-center justify-center rounded-full border px-3 text-[13px] font-medium transition sm:text-sm",
                      continueAutomationAfterNow
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                    )}
                  >
                    Automatico
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScheduleToggle(!isScheduleEnabled)}
                    className={cn(
                      "inline-flex h-11 min-w-0 items-center justify-center rounded-full border px-3 text-[13px] font-medium transition sm:text-sm",
                      isScheduleEnabled
                        ? "border-amber-500 bg-amber-500 text-slate-950"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                    )}
                  >
                    Agendar
                  </button>
                </div>

                <Button
                  className={cn(
                    "h-11 w-full rounded-full px-4 text-sm font-medium",
                    isScheduleEnabled
                      ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
                      : "bg-slate-900 hover:bg-slate-800",
                  )}
                  onClick={() => createPostMutation.mutate(primarySubmitMode)}
                  disabled={createPostMutation.isPending}
                >
                  {isScheduleEnabled ? (
                    isSubmittingSchedule ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarClock className="mr-2 h-4 w-4" />
                    )
                  ) : isSubmittingNow ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {primarySubmitLabel}
                </Button>
              </div>
              {selectedConnection && (
                <div className="px-1 pt-2 text-xs text-slate-500">
                  Canal:{" "}
                  <span className="font-medium text-slate-700">
                    {buildConnectionLabel(selectedConnection)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <Card className="order-2 hidden border-slate-200 xl:order-1 xl:block">
              <CardHeader className="space-y-2 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Preview</CardTitle>
                  <Badge
                    variant="outline"
                    className="border-slate-200 bg-white text-slate-500"
                  >
                    {activeType.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <button
                  type="button"
                  onClick={openFilePicker}
                  className={cn(
                    "relative mx-auto flex w-full max-w-[220px] items-center justify-center overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950 text-left shadow-inner",
                    contentType === "text" ? "aspect-[4/5]" : "aspect-[9/16]",
                    canOpenUploader && "cursor-pointer",
                  )}
                >
                  {contentType === "text" && !bodyText.trim() && (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,#0f766e_0%,#0f172a_78%)] px-6 text-center text-slate-200">
                      <Type className="h-8 w-8" />
                      <p className="text-sm leading-6">
                        Sua mensagem aparece aqui.
                      </p>
                    </div>
                  )}

                  {contentType === "text" && bodyText.trim() && (
                    <div className="flex h-full w-full items-end bg-[radial-gradient(circle_at_top,#0f766e_0%,#0f172a_78%)] p-6">
                      <p className="text-lg font-medium leading-8 text-white">
                        {bodyText}
                      </p>
                    </div>
                  )}

                  {contentType !== "text" && !previewUrl && (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-300">
                      <Upload className="h-8 w-8" />
                      <p className="text-sm leading-6">
                        {contentType === "image"
                          ? "Clique para carregar ou gerar sua imagem."
                          : "Clique para carregar o video."}
                      </p>
                    </div>
                  )}

                  {contentType === "image" && previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Preview da imagem"
                      className="h-full w-full object-cover"
                    />
                  )}

                  {contentType === "video" && previewUrl && (
                    <video
                      src={previewUrl}
                      className="h-full w-full object-cover"
                      muted
                    />
                  )}

                  {contentType !== "text" && bodyText.trim() && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-10 text-sm leading-6 text-white">
                      {bodyText}
                    </div>
                  )}
                </button>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">
                    {activeType.short}
                  </p>
                  <p className="mt-1 leading-6">
                    {bodyText.trim() || previewUrl
                      ? "Preview pronto para revisar."
                      : "Monte a postagem e publique."}
                  </p>
                </div>

                {mediaBadgeLabel && (
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className="border-slate-200 bg-white text-slate-700"
                    >
                      {contentType === "image" ? (
                        <ImageIcon className="mr-1 h-3.5 w-3.5" />
                      ) : (
                        <Video className="mr-1 h-3.5 w-3.5" />
                      )}
                      {mediaBadgeLabel}
                    </Badge>
                    {reuseMedia && !selectedFile && !generatedImage && (
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-white text-slate-500"
                      >
                        Reaproveitando midia
                      </Badge>
                    )}
                    {generatedImage?.model && (
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-white text-slate-500"
                      >
                        {generatedImage.model}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="order-1 space-y-4 xl:order-2">
              <Card className="border-slate-200">
                <CardContent className="space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={getAcceptedFiles(contentType)}
                    onChange={handleFileChange}
                  />

                  {contentType === "image" && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="bg-slate-900 hover:bg-slate-800"
                          onClick={openFilePicker}
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Carregar imagem
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => generateIdeaMutation.mutate()}
                          disabled={
                            generateIdeaMutation.isPending ||
                            generateIdeaAndImageMutation.isPending
                          }
                        >
                          {generateIdeaMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="mr-2 h-4 w-4" />
                          )}
                          Gerar ideia
                        </Button>
                        <Button
                          type="button"
                          variant={isImagePromptOpen ? "default" : "outline"}
                          className={cn(
                            isImagePromptOpen &&
                              "bg-amber-500 text-slate-950 hover:bg-amber-400",
                          )}
                          onClick={() =>
                            setIsImagePromptOpen((current) => !current)
                          }
                        >
                          <WandSparkles className="mr-2 h-4 w-4" />
                          Gerar com IA
                        </Button>
                        <Button
                          type="button"
                          className="bg-emerald-600 hover:bg-emerald-500"
                          onClick={() => generateIdeaAndImageMutation.mutate()}
                          disabled={
                            generateImageMutation.isPending ||
                            generateIdeaAndImageMutation.isPending
                          }
                        >
                          {generateIdeaAndImageMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <WandSparkles className="mr-2 h-4 w-4" />
                          )}
                          Gerar ideia + imagem
                        </Button>
                        {(selectedFile || generatedImage) && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={clearMedia}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Limpar
                          </Button>
                        )}
                      </div>

                      {isImagePromptOpen && (
                        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                          <Textarea
                            value={imagePrompt}
                            onChange={(event) =>
                              setImagePrompt(event.target.value)
                            }
                            placeholder="Descreva como a imagem deve ficar. Exemplo: promocao vertical, neon, produto em destaque."
                            className="min-h-[110px] resize-none rounded-2xl border-slate-200 bg-white"
                          />
                          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                            <p className="font-medium text-slate-900">
                              Geracao sob demanda
                            </p>
                            <p className="mt-2 leading-6">
                              O prompt fica visivel para voce editar. Se
                              preferir, a IA tambem pode criar a ideia antes da
                              arte.
                            </p>
                            <Button
                              type="button"
                              className="mt-4 w-full bg-slate-900 hover:bg-slate-800"
                              onClick={() => generateImageMutation.mutate()}
                              disabled={
                                generateImageMutation.isPending ||
                                generateIdeaAndImageMutation.isPending
                              }
                            >
                              {generateImageMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="mr-2 h-4 w-4" />
                              )}
                              Gerar imagem
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {contentType === "video" && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="bg-slate-900 hover:bg-slate-800"
                          onClick={openFilePicker}
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Carregar video
                        </Button>
                        {selectedFile && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={clearMedia}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Limpar
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      {contentType === "text" ? (
                        <Type className="h-4 w-4" />
                      ) : (
                        <ImageIcon className="h-4 w-4" />
                      )}
                      {messageLabel}
                      <HelpTip
                        text={
                          contentType === "text"
                            ? "Essa e a mensagem principal do status."
                            : "Aqui voce escreve apenas a legenda. Nao existe campo separado de variacao de texto para imagem ou video."
                        }
                      />
                    </div>
                    <Textarea
                      value={bodyText}
                      onChange={(event) => setBodyText(event.target.value)}
                      placeholder={messagePlaceholder}
                      className="min-h-[92px] resize-none rounded-2xl border-slate-200"
                    />
                  </div>

                  {showTextVariation && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                            <Sparkles className="h-4 w-4 text-amber-500" />
                            Variacao automatica com IA
                            <HelpTip text="A IA cria uma nova versao da mensagem base a cada disparo recorrente." />
                          </div>
                          <p className="mt-1 text-sm leading-6 text-slate-500">
                            Disponivel so para postagem em texto, porque aqui
                            faz sentido variar a mensagem.
                          </p>
                        </div>
                        <Switch
                          checked={aiVariationEnabled}
                          onCheckedChange={setAiVariationEnabled}
                        />
                      </div>

                      {aiVariationEnabled && (
                        <Input
                          value={aiVariationPrompt}
                          onChange={(event) =>
                            setAiVariationPrompt(event.target.value)
                          }
                          placeholder="Opcional: diga o estilo desejado. Exemplo: mais vendedor, mais direto, mais urgencia."
                          className="mt-3 rounded-2xl border-slate-200 bg-white"
                        />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {(continueAutomationAfterNow || isScheduleEnabled) && (
                <Card className="border-slate-200">
                  <CardContent className="space-y-4">
                    {continueAutomationAfterNow && (
                      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                          <Clock3 className="h-4 w-4" />
                          Continuacao automatica
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {(["daily", "weekdays"] as const).map((mode) => {
                            const isActive = afterNowAction === mode;
                            return (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => setAfterNowAction(mode)}
                                className={cn(
                                  "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition",
                                  isActive
                                    ? automationModeMeta[mode].tone
                                    : "border-slate-200 bg-white text-slate-600",
                                )}
                              >
                                {mode === "daily" ? (
                                  <Clock3 className="h-4 w-4" />
                                ) : (
                                  <CalendarClock className="h-4 w-4" />
                                )}
                                {automationModeMeta[mode].label}
                              </button>
                            );
                          })}
                        </div>

                        {afterNowAction === "daily" && (
                          <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
                            <Input
                              type="time"
                              value={afterNowDailyTime}
                              onChange={(event) =>
                                setAfterNowDailyTime(event.target.value)
                              }
                            />
                            <p className="text-sm text-slate-500">
                              Continua todos os dias a partir de{" "}
                              {formatDateTime(
                                buildNextDailyIso(afterNowDailyTime),
                              )}
                              .
                            </p>
                          </div>
                        )}

                        {afterNowAction === "weekdays" && (
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                              {weekdayOptions.map((option) => {
                                const active = afterNowWeekdays.includes(
                                  option.value,
                                );
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() =>
                                      toggleAfterNowWeekday(option.value)
                                    }
                                    className={cn(
                                      "rounded-full border px-3 py-2 text-sm font-medium transition",
                                      active
                                        ? "border-blue-600 bg-blue-600 text-white"
                                        : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700",
                                    )}
                                  >
                                    {option.short}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
                              <Input
                                type="time"
                                value={afterNowWeekdayTime}
                                onChange={(event) =>
                                  setAfterNowWeekdayTime(event.target.value)
                                }
                              />
                              <p className="text-sm text-slate-500">
                                Repete em{" "}
                                {formatWeekdayList(afterNowWeekdays) ||
                                  "nenhum dia"}
                                .
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                          Proximo automatico em{" "}
                          <span className="font-medium text-slate-900">
                            {automaticSummary}
                          </span>
                          .
                        </div>
                      </div>
                    )}

                    {isScheduleEnabled && (
                      <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                          <CalendarClock className="h-4 w-4" />
                          Agendamento
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            type="date"
                            value={scheduleDate}
                            onChange={(event) =>
                              setScheduleDate(event.target.value)
                            }
                          />
                          <Input
                            type="time"
                            value={scheduleTime}
                            onChange={(event) =>
                              setScheduleTime(event.target.value)
                            }
                          />
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-600">
                          Vai sair em{" "}
                          <span className="font-medium text-slate-900">
                            {formatDateTime(
                              buildLocalIso(scheduleDate, scheduleTime),
                            )}
                          </span>
                          .
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Status das postagens</CardTitle>
        </CardHeader>
        <CardContent>
          {posts.some((item) =>
            ["pending", "processing", "retrying"].includes(
              getLifecycleStatus(item),
            ),
          ) && (
            <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700">
              Estamos cuidando dos envios em segundo plano. Se o app reiniciar
              no meio, o sistema retoma sozinho em vez de deixar o card preso
              para sempre.
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Carregando postagens
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Nenhuma postagem ainda. Monte a primeira acima e escolha como
              publicar.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {posts.map((item) => {
                const lifecycleStatus = getLifecycleStatus(item);
                const itemConnection =
                  allConnections.find(
                    (connection) => connection.id === item.connectionId,
                  ) || null;
                return (
                  <div
                    key={item.id}
                    className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-white text-slate-600"
                          >
                            {item.actionLabel}
                          </Badge>
                          <Badge
                            className={cn(
                              "border",
                              statusTone[lifecycleStatus] ||
                                "border-slate-200 bg-slate-100 text-slate-600",
                            )}
                          >
                            {lifecycleStatus === "sent" && (
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            )}
                            {statusLabel[lifecycleStatus] || lifecycleStatus}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-white text-slate-500"
                          >
                            {item.contentType}
                          </Badge>
                          {item.aiVariationEnabled && (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-amber-700"
                            >
                              <Sparkles className="mr-1 h-3.5 w-3.5" />
                              IA varia o texto
                            </Badge>
                          )}
                        </div>
                        <h3 className="break-words text-base font-semibold text-slate-900">
                          {item.summary}
                        </h3>
                        {itemConnection && (
                          <p className="break-words text-sm text-slate-500">
                            Canal: {buildConnectionLabel(itemConnection)}
                          </p>
                        )}
                      </div>
                      <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
                        <Button
                          variant="outline"
                          className="w-full justify-center sm:w-auto"
                          onClick={() => setDetailsPostId(item.id)}
                        >
                          Detalhes
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full justify-center sm:w-auto"
                          onClick={() => handleRepost(item)}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Postar novamente
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full justify-center sm:w-auto"
                          onClick={() => deletePostMutation.mutate(item.id)}
                          disabled={deletePostMutation.isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </Button>
                      </div>
                    </div>

                    {item.recurrenceType === "weekly" &&
                      item.selectedWeekdays &&
                      item.selectedWeekdays.length > 0 && (
                        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                          Repetir em: {formatWeekdayList(item.selectedWeekdays)}
                        </div>
                      )}

                    {(item.mediaUrl || item.text || item.caption) && (
                      <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                        {item.mediaUrl && item.contentType === "image" && (
                          <img
                            src={item.mediaUrl}
                            alt={item.summary}
                            className="mb-3 h-44 w-full rounded-xl object-cover"
                          />
                        )}
                        {item.mediaUrl && item.contentType === "video" && (
                          <video
                            src={item.mediaUrl}
                            className="mb-3 h-44 w-full rounded-xl object-cover"
                            controls
                          />
                        )}
                        <p className="leading-6">
                          {item.contentType === "text"
                            ? item.text
                            : item.caption || item.fileName}
                        </p>
                        {item.mediaUrl && (
                          <a
                            href={item.mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline"
                          >
                            <ExternalLink className="h-4 w-4" />
                            URL da midia: {formatMediaUrlLabel(item.mediaUrl)}
                          </a>
                        )}
                      </div>
                    )}

                    {item.statusDetail && (
                      <div
                        className={cn(
                          "mt-4 rounded-xl border px-3 py-2 text-sm leading-6",
                          item.wasInterrupted
                            ? "border-orange-200 bg-orange-50 text-orange-800"
                            : lifecycleStatus === "failed"
                              ? "border-rose-100 bg-rose-50 text-rose-700"
                              : "border-slate-200 bg-slate-50 text-slate-600",
                        )}
                      >
                        {item.statusDetail}
                      </div>
                    )}

                    <div className="mt-4 grid gap-3 text-sm text-slate-500 sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <span className="block text-xs uppercase tracking-wide text-slate-400">
                          Programado
                        </span>
                        <span className="font-medium text-slate-700">
                          {formatDateTime(item.scheduledFor)}
                        </span>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <span className="block text-xs uppercase tracking-wide text-slate-400">
                          Ultimo envio
                        </span>
                        <span className="font-medium text-slate-700">
                          {formatDateTime(item.lastSentAt)}
                        </span>
                      </div>
                    </div>

                    {item.errorMessage &&
                      lifecycleStatus !== "sent" &&
                      !item.statusDetail && (
                        <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                          {item.errorMessage}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(detailsPostId)}
        onOpenChange={(open) => (!open ? setDetailsPostId(null) : null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da campanha</DialogTitle>
            <DialogDescription>
              {selectedDetailsPost
                ? selectedDetailsPost.summary
                : "Postagem selecionada"}
            </DialogDescription>
          </DialogHeader>

          {!selectedDetailsPost ? (
            <div className="text-sm text-slate-500">Carregando detalhes...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <span className="block text-xs uppercase tracking-wide text-slate-400">
                    Tipo
                  </span>
                  <span className="font-medium">
                    {selectedDetailsPost.contentType}
                  </span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <span className="block text-xs uppercase tracking-wide text-slate-400">
                    Agenda
                  </span>
                  <span className="font-medium">{detailsScheduleLabel}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">
                  Proximos envios
                </div>
                {upcomingOccurrences.length === 0 ? (
                  <div className="mt-2 text-sm text-slate-500">
                    Sem novos agendamentos ativos.
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {upcomingOccurrences.map((dateValue) => (
                      <div
                        key={dateValue}
                        className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600"
                      >
                        {formatDateTime(dateValue)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">
                  Historico de envios
                </div>
                {isHistoryLoading ? (
                  <div className="mt-2 text-sm text-slate-500">
                    Carregando historico...
                  </div>
                ) : postHistory.length === 0 ? (
                  <div className="mt-2 text-sm text-slate-500">
                    Nenhum envio registrado ainda.
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {postHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "border",
                              statusTone[entry.status] ||
                                "border-slate-200 bg-white text-slate-600",
                            )}
                          >
                            {statusLabel[entry.status] || entry.status}
                          </Badge>
                          <span>{formatDateTime(entry.attemptedAt)}</span>
                        </div>
                        {entry.errorMessage && (
                          <div className="mt-1 text-xs text-rose-600">
                            {entry.errorMessage}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
