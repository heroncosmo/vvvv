import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { getAuthToken } from "@/lib/supabase";
import { ptBR } from "date-fns/locale";
import { buildSchedulingTabUrl, getSchedulingTabFromSearch, type SchedulingTabValue } from "@/lib/scheduling-tabs";
import { 
  CalendarClock, 
  Settings, 
  Plus, 
  Check, 
  X, 
  Clock, 
  MapPin, 
  User, 
  Phone,
  CalendarDays,
  Loader2,
  Ban,
  CheckCircle2,
  AlertCircle,
  Trash2,
  RefreshCw,
  Calendar as CalendarIcon,
  Link2,
  Link2Off,
  Briefcase,
  Users,
  Palette,
  DollarSign,
  Edit,
  Mail,
  Bell
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextualHelpButton } from "@/components/contextual-help-button";
import { openGoogleCalendarPopup } from "@/lib/google-calendar-popup";

// Types
interface SchedulingConfig {
  id?: string;
  isEnabled: boolean;
  serviceName: string;
  serviceDuration: number;
  location: string;
  locationType: string;
  availableDays: number[];
  workStartTime: string;
  workEndTime: string;
  breakStartTime: string;
  breakEndTime: string;
  hasBreak: boolean;
  slotDuration: number;
  bufferBetweenAppointments: number;
  maxAppointmentsPerDay: number;
  advanceBookingDays: number;
  minBookingNoticeHours: number;
  requireConfirmation: boolean;
  autoConfirm: boolean;
  allowCancellation: boolean;
  sendReminder: boolean;
  reminderHoursBefore: number;
  reminderTimes: number[];
  bookingNotificationEnabled?: boolean;
  bookingNotificationPhone?: string;
  slotSuggestionMode?: "first_available" | "ask_preference";
  // Novas opÃ§Ãµes
  useServices?: boolean;
  useProfessionals?: boolean;
  aiSchedulingEnabled?: boolean;
  aiCanSuggestProfessional?: boolean;
  aiCanSuggestService?: boolean;
  googleCalendarEnabled?: boolean;
  selectedCalendarId?: string;
}

interface Appointment {
  id: string;
  client_name: string;
  client_phone: string;
  client_email?: string;
  service_name?: string;
  service_id?: string;
  professional_id?: string;
  professional_name?: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  location?: string;
  location_type: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  confirmed_by_client: boolean;
  confirmed_by_business: boolean;
  created_by_ai: boolean;
  client_notes?: string;
  internal_notes?: string;
  created_at: string;
  google_event_id?: string;
  ai_conversation_context?: RealEstateAppointmentContext | SchedulingAppointmentContext | null;
}

interface SchedulingAppointmentContext {
  domain: 'scheduling';
  selectedServices: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    price: number | null;
  }>;
  totalDurationMinutes: number;
  totalPrice: number | null;
  customerAddress?: string | null;
}

interface RealEstateAppointmentContext {
  domain: 'real_estate';
  appointmentType: string;
  appointmentTypeLabel?: string | null;
  source?: string | null;
  listingCode?: string | null;
  listingTitle?: string | null;
  listingUrl?: string | null;
  transactionType?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  price?: string | null;
  portalSource?: string | null;
  leadType?: string | null;
  summary?: string | null;
}

interface RealEstateIntegrationPreview {
  integration: {
    active?: boolean;
    matonInboxEmail?: string | null;
    syncToAi?: boolean;
  } | null;
}

interface SchedulingException {
  id: string;
  exception_date: string;
  exception_type: 'blocked' | 'modified_hours' | 'holiday';
  custom_start_time?: string;
  custom_end_time?: string;
  reason?: string;
}

// Novas interfaces para serviÃ§os e profissionais
interface SchedulingService {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price?: number;
  isActive: boolean;
  allowOnline: boolean;
  allowPresencial: boolean;
  requiresCustomerAddress: boolean;
  requiresConfirmation: boolean;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  maxPerDay?: number;
  color: string;
  icon?: string;
  displayOrder: number;
}

interface SchedulingProfessional {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  specialty?: string;
  bio?: string;
  workStartTime: string;
  workEndTime: string;
  breakStartTime: string;
  breakEndTime: string;
  availableDays: number[];
  isActive: boolean;
  isDefault: boolean;
  acceptsOnline: boolean;
  acceptsPresencial: boolean;
  maxAppointmentsPerDay: number;
  displayOrder: number;
  assignedServices?: string[];
}

interface GoogleCalendarStatus {
  isConnected: boolean;
  configured: boolean;
  email?: string;
  provider?: string;
  providerLabel?: string;
  checked?: boolean;
  error?: string;
  selectedCalendarId?: string;
  calendars?: Array<{
    id: string;
    summary: string;
    primary?: boolean;
    accessRole?: string;
  }>;
}

interface CalendarEventDateTimeValue {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface GoogleCalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  transparency?: string;
  htmlLink?: string;
  start?: CalendarEventDateTimeValue | null;
  end?: CalendarEventDateTimeValue | null;
}

interface ExternalCalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startDateTime: string;
  endDateTime: string;
  isAllDay: boolean;
  htmlLink?: string;
}

// Transform functions for snake_case to camelCase
const transformService = (data: any): SchedulingService => ({
  id: data.id,
  name: data.name,
  description: data.description,
  durationMinutes: data.duration_minutes ?? data.durationMinutes ?? 60,
  price: data.price === null || data.price === undefined ? undefined : Number(data.price),
  isActive: data.is_active ?? data.isActive ?? true,
  allowOnline: data.allow_online ?? data.allowOnline ?? true,
  allowPresencial: data.allow_presencial ?? data.allowPresencial ?? true,
  requiresCustomerAddress: data.requires_customer_address ?? data.requiresCustomerAddress ?? false,
  requiresConfirmation: data.requires_confirmation ?? data.requiresConfirmation ?? false,
  bufferBeforeMinutes: data.buffer_before_minutes ?? data.bufferBeforeMinutes ?? 0,
  bufferAfterMinutes: data.buffer_after_minutes ?? data.bufferAfterMinutes ?? 0,
  maxPerDay: data.max_per_day ?? data.maxPerDay,
  color: data.color ?? '#3B82F6',
  icon: data.icon,
  displayOrder: data.display_order ?? data.displayOrder ?? 0,
});

const transformProfessional = (data: any): SchedulingProfessional => ({
  id: data.id,
  name: data.name,
  email: data.email,
  phone: data.phone,
  photoUrl: data.photo_url ?? data.photoUrl,
  specialty: data.specialty,
  bio: data.bio,
  workStartTime: data.work_start_time ?? data.workStartTime ?? '09:00',
  workEndTime: data.work_end_time ?? data.workEndTime ?? '18:00',
  breakStartTime: data.break_start_time ?? data.breakStartTime ?? '12:00',
  breakEndTime: data.break_end_time ?? data.breakEndTime ?? '13:00',
  availableDays: data.available_days ?? data.availableDays ?? [1, 2, 3, 4, 5],
  isActive: data.is_active ?? data.isActive ?? true,
  isDefault: data.is_default ?? data.isDefault ?? false,
  acceptsOnline: data.accepts_online ?? data.acceptsOnline ?? true,
  acceptsPresencial: data.accepts_presencial ?? data.acceptsPresencial ?? true,
  maxAppointmentsPerDay: data.max_appointments_per_day ?? data.maxAppointmentsPerDay ?? 20,
  displayOrder: data.display_order ?? data.displayOrder ?? 0,
  assignedServices: data.assigned_services ?? data.assignedServices ?? [],
});

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Segunda', short: 'Seg' },
  { value: 2, label: 'TerÃ§a', short: 'Ter' },
  { value: 3, label: 'Quarta', short: 'Qua' },
  { value: 4, label: 'Quinta', short: 'Qui' },
  { value: 5, label: 'Sexta', short: 'Sex' },
  { value: 6, label: 'SÃ¡bado', short: 'SÃ¡b' },
];

const STATUS_CONFIG = {
  pending: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
  confirmed: { label: 'Confirmado', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: X },
  completed: { label: 'ConcluÃ­do', color: 'bg-blue-100 text-blue-800', icon: Check },
  no_show: { label: 'NÃ£o compareceu', color: 'bg-gray-100 text-gray-800', icon: Ban },
};

function readCalendarEventDateTime(value?: CalendarEventDateTimeValue | null, fallbackTime: string = "00:00:00") {
  if (!value) return null;
  if (value.dateTime) return value.dateTime;
  if (value.date) return `${value.date}T${fallbackTime}`;
  return null;
}

function transformExternalCalendarEvent(event: GoogleCalendarEvent, index: number): ExternalCalendarEvent | null {
  if (!event || event.status === "cancelled" || event.transparency === "transparent") {
    return null;
  }

  const startDateTime = readCalendarEventDateTime(event.start, "00:00:00");
  const endDateTime = readCalendarEventDateTime(event.end, "23:59:59");
  if (!startDateTime || !endDateTime) {
    return null;
  }

  return {
    id: event.id || `external-event-${index}`,
    title: event.summary || "Compromisso externo",
    description: event.description,
    location: event.location,
    startDateTime,
    endDateTime,
    isAllDay: Boolean(event.start?.date && !event.start?.dateTime),
    htmlLink: event.htmlLink,
  };
}

function formatExternalCalendarEventTime(event: ExternalCalendarEvent): string {
  if (event.isAllDay) {
    return "Dia inteiro";
  }

  return `${format(parseISO(event.startDateTime), "HH:mm")} - ${format(parseISO(event.endDateTime), "HH:mm")}`;
}

function getRealEstateContext(appointment: Appointment): RealEstateAppointmentContext | null {
  const context = appointment.ai_conversation_context;
  if (!context || context.domain !== 'real_estate') return null;
  return context;
}

function getSchedulingContext(appointment: Appointment): SchedulingAppointmentContext | null {
  const context = appointment.ai_conversation_context;
  if (!context || context.domain !== 'scheduling') return null;
  return context;
}

function buildRealEstateContextLine(context: RealEstateAppointmentContext): string {
  return [context.neighborhood, context.city, context.transactionType, context.price].filter(Boolean).join(' â€¢ ');
}

function formatCurrencyBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function timeStringToMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTimeString(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.min(totalMinutes, 23 * 60 + 59));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function getEndTimeFromStart(startTime: string, durationMinutes: number): string {
  const startMinutes = timeStringToMinutes(startTime);
  if (startMinutes === null) {
    return minutesToTimeString(Math.max(durationMinutes, 0));
  }

  return minutesToTimeString(startMinutes + Math.max(durationMinutes, 0));
}

function getAppointmentDuration(startTime: string, endTime: string): number | null {
  const startMinutes = timeStringToMinutes(startTime);
  const endMinutes = timeStringToMinutes(endTime);

  if (
    startMinutes === null ||
    endMinutes === null ||
    endMinutes <= startMinutes
  ) {
    return null;
  }

  return endMinutes - startMinutes;
}

// Helper de fetch autenticado para agendamentos
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}

// Google Calendar Integration Component
export default function SchedulingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SchedulingTabValue>(() => getSchedulingTabFromSearch(window.location.search));
  const [newAppointmentOpen, setNewAppointmentOpen] = useState(false);
  const [newExceptionOpen, setNewExceptionOpen] = useState(false);
  const [newServiceOpen, setNewServiceOpen] = useState(false);
  const [newProfessionalOpen, setNewProfessionalOpen] = useState(false);
  const [editingService, setEditingService] = useState<SchedulingService | null>(null);
  const [editingProfessional, setEditingProfessional] = useState<SchedulingProfessional | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());


  useEffect(() => {
    const syncTabFromUrl = () => {
      const nextTab = getSchedulingTabFromSearch(window.location.search);
      setActiveTab((currentTab) => currentTab === nextTab ? currentTab : nextTab);
    };

    window.addEventListener('popstate', syncTabFromUrl);
    syncTabFromUrl();

    return () => window.removeEventListener('popstate', syncTabFromUrl);
  }, []);

  const handleTabChange = (nextValue: string) => {
    const nextTab = getSchedulingTabFromSearch(`tab=${nextValue}`);
    setActiveTab(nextTab);

    const nextUrl = buildSchedulingTabUrl(nextTab);
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (currentUrl !== nextUrl) {
      window.history.replaceState({}, "", nextUrl);
    }
  };


  // Helper para converter snake_case do servidor para camelCase
  const transformConfig = (data: any): SchedulingConfig => ({
    id: data.id,
    isEnabled: data.is_enabled ?? false,
    serviceName: data.service_name ?? '',
    serviceDuration: data.service_duration ?? 60,
    location: data.location ?? '',
    locationType: data.location_type ?? 'presencial',
    availableDays: data.available_days ?? [1, 2, 3, 4, 5],
    workStartTime: data.work_start_time ?? '09:00',
    workEndTime: data.work_end_time ?? '18:00',
    breakStartTime: data.break_start_time ?? '12:00',
    breakEndTime: data.break_end_time ?? '13:00',
    hasBreak: data.has_break ?? true,
    slotDuration: data.slot_duration ?? 60,
    bufferBetweenAppointments: data.buffer_between_appointments ?? 15,
    maxAppointmentsPerDay: data.max_appointments_per_day ?? 10,
    advanceBookingDays: data.advance_booking_days ?? 30,
    minBookingNoticeHours: data.min_booking_notice_hours ?? 2,
    requireConfirmation: data.require_confirmation ?? true,
    autoConfirm: data.auto_confirm ?? false,
    allowCancellation: data.allow_cancellation ?? true,
    sendReminder: data.send_reminder ?? true,
    reminderHoursBefore: data.reminder_hours_before ?? 24,
    reminderTimes: data.reminder_times ?? [data.reminder_hours_before ?? 24],
    bookingNotificationEnabled: data.booking_notification_enabled ?? false,
    bookingNotificationPhone: data.booking_notification_phone ?? '',
    slotSuggestionMode: data.slot_suggestion_mode ?? data.slotSuggestionMode ?? 'first_available',
    useServices: data.use_services ?? false,
    useProfessionals: data.use_professionals ?? false,
    aiSchedulingEnabled: data.ai_scheduling_enabled ?? true,
    aiCanSuggestProfessional: data.ai_can_suggest_professional ?? true,
    aiCanSuggestService: data.ai_can_suggest_service ?? true,
    googleCalendarEnabled: data.google_calendar_enabled ?? false,
    selectedCalendarId: data.google_calendar_id ?? undefined,
  });

  // Fetch config
  const { data: config, isLoading: configLoading } = useQuery<SchedulingConfig>({
    queryKey: ['scheduling-config'],
    queryFn: async () => {
      const res = await authFetch('/api/scheduling/config');
      if (!res.ok) throw new Error('Failed to fetch config');
      const data = await res.json();
      return transformConfig(data);
    },
  });

  // Fetch Google Calendar status
  const { data: googleCalendarStatus, refetch: refetchGoogleStatus } = useQuery<GoogleCalendarStatus>({
    queryKey: ['google-calendar-status'],
    queryFn: async () => {
      const res = await authFetch('/api/scheduling/google-calendar/status');
      if (!res.ok) {
        return { isConnected: false, configured: true, provider: 'google', providerLabel: 'Google' };
      }
      const data = await res.json();
      return {
        isConnected: data.isConnected || data.connected || false,
        email: data.email || data.userEmail,
        configured: data.configured ?? true,
        provider: data.provider,
        providerLabel: data.providerLabel,
        checked: data.checked ?? true,
        error: data.error,
        selectedCalendarId: data.selectedCalendarId ?? data.selected_calendar_id,
        calendars: Array.isArray(data.calendars) ? data.calendars : [],
      };
    },
  });

  // Fetch services
  const { data: services = [], refetch: refetchServices } = useQuery<SchedulingService[]>({
    queryKey: ['scheduling-services'],
    queryFn: async () => {
      const res = await authFetch('/api/scheduling/services');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.map(transformService) : [];
    },
  });

  // Fetch professionals
  const { data: professionals = [], refetch: refetchProfessionals } = useQuery<SchedulingProfessional[]>({
    queryKey: ['scheduling-professionals'],
    queryFn: async () => {
      const res = await authFetch('/api/scheduling/professionals?withServices=true');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.map(transformProfessional) : [];
    },
  });

  // Fetch appointments
  const { data: appointments = [], isLoading: appointmentsLoading, refetch: refetchAppointments } = useQuery<Appointment[]>({
    queryKey: ['appointments', filterStatus],
    queryFn: async () => {
      let url = '/api/scheduling/appointments';
      if (filterStatus && filterStatus !== 'all') {
        url += `?status=${filterStatus}`;
      }
      const res = await authFetch(url);
      if (!res.ok) throw new Error('Failed to fetch appointments');
      return res.json();
    },
  });

  const { data: realEstatePreview } = useQuery<RealEstateIntegrationPreview>({
    queryKey: ['grupo-olx-integration-preview'],
    queryFn: async () => {
      const res = await authFetch('/api/integrations/grupo-olx');
      if (!res.ok) return { integration: null };
      return res.json();
    },
  });

  const selectedDateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const { data: externalCalendarEvents = [], isLoading: externalCalendarEventsLoading, refetch: refetchExternalCalendarEvents } = useQuery<ExternalCalendarEvent[]>({
    queryKey: ['google-calendar-events', selectedDateKey, googleCalendarStatus?.selectedCalendarId],
    enabled: Boolean(selectedDateKey && googleCalendarStatus?.isConnected),
    queryFn: async () => {
      if (!selectedDateKey) return [];

      const params = new URLSearchParams({
        from: `${selectedDateKey}T00:00:00`,
        to: `${selectedDateKey}T23:59:59`,
      });

      const res = await authFetch(`/api/google-calendar/events?${params.toString()}`);
      if (!res.ok) return [];

      const data = await res.json();
      return Array.isArray(data.events)
        ? data.events
          .map((event: GoogleCalendarEvent, index: number) => transformExternalCalendarEvent(event, index))
          .filter((event: ExternalCalendarEvent | null): event is ExternalCalendarEvent => Boolean(event))
        : [];
    },
  });

  const selectedDayAppointments = selectedDateKey
    ? appointments.filter(apt => format(parseISO(apt.appointment_date), "yyyy-MM-dd") === selectedDateKey)
    : [];
  const selectedDayInternalEventIds = new Set(
    selectedDayAppointments
      .map((appointment) => appointment.google_event_id)
      .filter((eventId): eventId is string => Boolean(eventId)),
  );
  const selectedDayExternalEvents = externalCalendarEvents.filter(
    (event) => !selectedDayInternalEventIds.has(event.id),
  );
  const selectedDayAgendaItems = [
    ...selectedDayAppointments.map((appointment) => ({
      id: appointment.id,
      kind: 'internal' as const,
      sortKey: `${selectedDateKey}T${appointment.start_time}`,
      appointment,
    })),
    ...selectedDayExternalEvents.map((event) => ({
      id: `external-${event.id}`,
      kind: 'external' as const,
      sortKey: event.startDateTime,
      event,
    })),
  ].sort((firstItem, secondItem) => {
    const firstTime = new Date(firstItem.sortKey).getTime();
    const secondTime = new Date(secondItem.sortKey).getTime();
    return firstTime - secondTime;
  });
  const isRealEstateMode = Boolean(realEstatePreview?.integration?.active);

  // Fetch exceptions
  const { data: exceptions = [] } = useQuery<SchedulingException[]>({
    queryKey: ['scheduling-exceptions'],
    queryFn: async () => {
      const res = await authFetch('/api/scheduling/exceptions');
      if (!res.ok) throw new Error('Failed to fetch exceptions');
      return res.json();
    },
  });

  // Save config mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (newConfig: Partial<SchedulingConfig>) => {
      const res = await authFetch('/api/scheduling/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (!res.ok) throw new Error('Failed to save config');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-config'] });
      toast({ title: "âœ… ConfiguraÃ§Ãµes salvas!", description: "As alteraÃ§Ãµes foram aplicadas." });
    },
    onError: () => {
      toast({ title: "âŒ Erro", description: "NÃ£o foi possÃ­vel salvar as configuraÃ§Ãµes.", variant: "destructive" });
    },
  });

  // Create appointment mutation
  const createAppointmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await authFetch('/api/scheduling/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create appointment');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      setNewAppointmentOpen(false);
      setAppointmentForm(createDefaultAppointmentForm(configForm.slotDuration));
      toast({ title: "âœ… Agendamento criado!", description: "O agendamento foi adicionado com sucesso." });
    },
    onError: (error: Error) => {
      toast({ title: "âŒ Erro", description: error.message, variant: "destructive" });
    },
  });

  // Confirm appointment mutation
  const confirmAppointmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/scheduling/appointments/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmedBy: 'business' }),
      });
      if (!res.ok) throw new Error('Failed to confirm');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: "âœ… Confirmado!", description: "O agendamento foi confirmado." });
    },
  });

  // Cancel appointment mutation
  const cancelAppointmentMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const res = await authFetch(`/api/scheduling/appointments/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelledBy: 'business', reason }),
      });
      if (!res.ok) throw new Error('Failed to cancel');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: "âŒ Cancelado", description: "O agendamento foi cancelado." });
    },
  });

  // Complete appointment mutation
  const completeAppointmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await authFetch(`/api/scheduling/appointments/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to complete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: "âœ… Status atualizado!" });
    },
  });

  // Create exception mutation
  const createExceptionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await authFetch('/api/scheduling/exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create exception');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-exceptions'] });
      setNewExceptionOpen(false);
      toast({ title: "âœ… ExceÃ§Ã£o criada!" });
    },
  });

  // Delete exception mutation
  const deleteExceptionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/scheduling/exceptions/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-exceptions'] });
      toast({ title: "âœ… ExceÃ§Ã£o removida!" });
    },
  });

  // ==================== SERVICES MUTATIONS ====================
  const createServiceMutation = useMutation({
    mutationFn: async (data: Partial<SchedulingService>) => {
      const res = await authFetch('/api/scheduling/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create service');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-services'] });
      setNewServiceOpen(false);
      setEditingService(null);
      toast({ title: "âœ… ServiÃ§o criado com sucesso!" });
    },
  });

  const updateServiceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SchedulingService> }) => {
      const res = await authFetch(`/api/scheduling/services/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update service');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-services'] });
      setEditingService(null);
      toast({ title: "âœ… ServiÃ§o atualizado!" });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/scheduling/services/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete service');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-services'] });
      toast({ title: "âœ… ServiÃ§o removido!" });
    },
  });

  // ==================== PROFESSIONALS MUTATIONS ====================
  const createProfessionalMutation = useMutation({
    mutationFn: async (data: Partial<SchedulingProfessional>) => {
      const res = await authFetch('/api/scheduling/professionals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create professional');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-professionals'] });
      setNewProfessionalOpen(false);
      setEditingProfessional(null);
      toast({ title: "âœ… Profissional adicionado!" });
    },
  });

  const updateProfessionalMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SchedulingProfessional> }) => {
      const res = await authFetch(`/api/scheduling/professionals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update professional');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-professionals'] });
      setEditingProfessional(null);
      toast({ title: "âœ… Profissional atualizado!" });
    },
  });

  const deleteProfessionalMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/scheduling/professionals/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete professional');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-professionals'] });
      toast({ title: "âœ… Profissional removido!" });
    },
  });

  const assignServicesToProfessionalMutation = useMutation({
    mutationFn: async ({ professionalId, serviceIds }: { professionalId: string; serviceIds: string[] }) => {
      const res = await authFetch(`/api/scheduling/professionals/${professionalId}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_ids: serviceIds }),
      });
      if (!res.ok) throw new Error('Failed to assign services');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-professionals'] });
      toast({ title: "âœ… ServiÃ§os atribuÃ­dos!" });
    },
  });


  const connectGoogleCalendarMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/scheduling/google-calendar/connect');
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Nao foi possivel iniciar a conexao com Google Calendar.');
      }

      if (!payload?.authUrl) {
        throw new Error('A resposta da conexao Google nao trouxe a URL de autorizacao.');
      }

      const popupResult = await openGoogleCalendarPopup(payload.authUrl, "scheduling-google-calendar-connect");
      if (!popupResult.success) {
        throw new Error(popupResult.message || 'Nao foi possivel concluir a conexao com Google Calendar.');
      }

      return popupResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      queryClient.invalidateQueries({ queryKey: ['scheduling-config'] });
      toast({ title: 'Google conectado!', description: 'A agenda Google foi vinculada diretamente ao AgenteZap.' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao conectar Google',
        description: error?.message || 'Nao foi possivel concluir a conexao com Google Calendar.',
        variant: 'destructive',
      });
    },
  });

  const disconnectGoogleCalendarMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/scheduling/google-calendar/disconnect', {
        method: 'POST',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || 'Falha ao desconectar o Google Calendar.');
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      queryClient.invalidateQueries({ queryKey: ['scheduling-config'] });
      toast({ title: 'Google desconectado!' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao desconectar Google',
        description: error?.message || 'Falha ao desconectar o Google Calendar.',
        variant: 'destructive',
      });
    },
  });

  const selectGoogleCalendarMutation = useMutation({
    mutationFn: async (calendarId: string) => {
      const res = await authFetch('/api/scheduling/google-calendar/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || 'Falha ao atualizar a agenda selecionada.');
      return payload;
    },
    onSuccess: (payload) => {
      const nextCalendarId = payload?.selectedCalendarId;
      setConfigForm((current) => ({
        ...current,
        selectedCalendarId: nextCalendarId || current.selectedCalendarId,
      }));
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      queryClient.invalidateQueries({ queryKey: ['scheduling-config'] });
      toast({ title: 'Agenda atualizada!' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao trocar agenda',
        description: error?.message || 'Falha ao atualizar a agenda selecionada.',
        variant: 'destructive',
      });
    },
  });


  const toggleGoogleCalendarSyncMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await authFetch('/api/scheduling/config/advanced', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ google_calendar_enabled: enabled }),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-config'] });
      toast({ title: "âœ… SincronizaÃ§Ã£o atualizada!" });
    },
  });

  const toggleAdvancedConfigMutation = useMutation({
    mutationFn: async (data: { use_services?: boolean; use_professionals?: boolean; ai_scheduling_enabled?: boolean }) => {
      const res = await authFetch('/api/scheduling/config/advanced', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update config');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-config'] });
      toast({ title: "âœ… ConfiguraÃ§Ã£o atualizada!" });
    },
  });

  // Form state for config
  const [configForm, setConfigForm] = useState<Partial<SchedulingConfig>>({});
  const createDefaultAppointmentForm = (slotDuration?: number) => {
    const safeDuration =
      Number.isFinite(slotDuration) && Number(slotDuration) > 0
        ? Number(slotDuration)
        : 60;

    return {
      clientName: '',
      clientPhone: '',
      clientEmail: '',
      appointmentDate: format(new Date(), 'yyyy-MM-dd'),
      startTime: '09:00',
      endTime: getEndTimeFromStart('09:00', safeDuration),
      clientNotes: '',
      serviceIds: [] as string[],
      customerAddress: '',
    };
  };

  useEffect(() => {
    if (config) {
      setConfigForm(config);
    }
  }, [config]);

  // New appointment form
  const [appointmentForm, setAppointmentForm] = useState(() =>
    createDefaultAppointmentForm(60),
  );

  // New exception form
  const [exceptionForm, setExceptionForm] = useState({
    exceptionDate: format(new Date(), 'yyyy-MM-dd'),
    exceptionType: 'blocked' as 'blocked' | 'modified_hours' | 'holiday',
    customStartTime: '09:00',
    customEndTime: '18:00',
    reason: '',
  });

  // Service form state
  const [serviceForm, setServiceForm] = useState({
    name: '',
    description: '',
    duration_minutes: 60,
    price: 0,
    color: '#3B82F6',
    is_active: true,
    requires_customer_address: false,
  });
  const [isApplyingSalonTemplate, setIsApplyingSalonTemplate] = useState(false);

  // Professional form state
  const [professionalForm, setProfessionalForm] = useState({
    name: '',
    email: '',
    phone: '',
    specialty: '',
    photo_url: '',
    is_active: true,
    work_start_time: '09:00',
    work_end_time: '18:00',
    break_start_time: '12:00',
    break_end_time: '13:00',
    available_days: [1, 2, 3, 4, 5],
    assigned_services: [] as string[],
  });
  const manualAppointmentDuration = getAppointmentDuration(
    appointmentForm.startTime,
    appointmentForm.endTime,
  );
  const selectedManualServices = services.filter((service) => appointmentForm.serviceIds?.includes(service.id));
  const selectedManualServicesDuration = selectedManualServices.reduce((sum, service) => sum + (service.durationMinutes || 0), 0);
  const selectedManualServicesTotal = selectedManualServices.reduce((sum, service) => sum + Number(service.price || 0), 0);
  const manualAppointmentRequiresAddress = selectedManualServices.some((service) => service.requiresCustomerAddress);
  const manualAppointmentTimeError =
    !appointmentForm.startTime || !appointmentForm.endTime
      ? 'Informe o horÃ¡rio de inÃ­cio e o horÃ¡rio de fim.'
      : manualAppointmentDuration === null
        ? 'O horÃ¡rio de fim precisa ser maior que o horÃ¡rio de inÃ­cio.'
        : null;

  // Reset forms when dialogs close
  useEffect(() => {
    if (!newAppointmentOpen) {
      setAppointmentForm(createDefaultAppointmentForm(configForm.slotDuration));
    }
  }, [newAppointmentOpen, configForm.slotDuration]);

  useEffect(() => {
    if (!newServiceOpen && !editingService) {
      setServiceForm({
        name: '',
        description: '',
        duration_minutes: 60,
        price: 0,
        color: '#3B82F6',
        is_active: true,
        requires_customer_address: false,
      });
    }
  }, [newServiceOpen, editingService]);

  useEffect(() => {
    if (!newProfessionalOpen && !editingProfessional) {
      setProfessionalForm({
        name: '',
        email: '',
        phone: '',
        specialty: '',
        photo_url: '',
        is_active: true,
        work_start_time: '09:00',
        work_end_time: '18:00',
        break_start_time: '12:00',
        break_end_time: '13:00',
        available_days: [1, 2, 3, 4, 5],
        assigned_services: [],
      });
    }
  }, [newProfessionalOpen, editingProfessional]);

  // Load editing data
  useEffect(() => {
    if (editingService) {
      setServiceForm({
        name: editingService.name,
        description: editingService.description || '',
        duration_minutes: editingService.durationMinutes,
        price: editingService.price || 0,
        color: editingService.color || '#3B82F6',
        is_active: editingService.isActive,
        requires_customer_address: editingService.requiresCustomerAddress,
      });
    }
  }, [editingService]);

  useEffect(() => {
    if (!newAppointmentOpen || !appointmentForm.startTime) {
      return;
    }

    if (selectedManualServicesDuration > 0) {
      setAppointmentForm((current) => ({
        ...current,
        endTime: getEndTimeFromStart(current.startTime, selectedManualServicesDuration),
      }));
    }
  }, [newAppointmentOpen, selectedManualServicesDuration, appointmentForm.startTime]);

  useEffect(() => {
    if (editingProfessional) {
      setProfessionalForm({
        name: editingProfessional.name,
        email: editingProfessional.email || '',
        phone: editingProfessional.phone || '',
        specialty: editingProfessional.specialty || '',
        photo_url: editingProfessional.photoUrl || '',
        is_active: editingProfessional.isActive,
        work_start_time: editingProfessional.workStartTime || '09:00',
        work_end_time: editingProfessional.workEndTime || '18:00',
        break_start_time: editingProfessional.breakStartTime || '12:00',
        break_end_time: editingProfessional.breakEndTime || '13:00',
        available_days: editingProfessional.availableDays || [1, 2, 3, 4, 5],
        assigned_services: editingProfessional.assignedServices || [],
      });
    }
  }, [editingProfessional]);

  // Handle service save
  const handleSaveService = () => {
    // Converter snake_case para camelCase antes de enviar ao backend
    const serviceData = {
      name: serviceForm.name,
      description: serviceForm.description,
      durationMinutes: serviceForm.duration_minutes, // Backend espera camelCase
      price: serviceForm.price,
      color: serviceForm.color,
      isActive: serviceForm.is_active, // Backend espera camelCase
      requiresCustomerAddress: serviceForm.requires_customer_address,
    };
    
    if (editingService) {
      updateServiceMutation.mutate({ id: editingService.id, data: serviceData });
    } else {
      createServiceMutation.mutate(serviceData);
    }
  };

  const applySalonTemplate = async () => {
    if (isApplyingSalonTemplate) return;
    setIsApplyingSalonTemplate(true);
    try {
      const templateServices = [
        { name: 'Corte Feminino', description: 'Corte e finalizaÃ§Ã£o', durationMinutes: 60, price: 90, color: '#EC4899', isActive: true },
        { name: 'Corte Masculino', description: 'Corte clÃ¡ssico ou degradÃª', durationMinutes: 45, price: 60, color: '#3B82F6', isActive: true },
        { name: 'Escova', description: 'Escova modeladora', durationMinutes: 60, price: 80, color: '#F59E0B', isActive: true },
        { name: 'ColoraÃ§Ã£o', description: 'ColoraÃ§Ã£o completa', durationMinutes: 120, price: 180, color: '#10B981', isActive: true },
        { name: 'HidrataÃ§Ã£o', description: 'Tratamento capilar', durationMinutes: 60, price: 100, color: '#8B5CF6', isActive: true },
        { name: 'Barba', description: 'Acabamento e alinhamento', durationMinutes: 30, price: 40, color: '#6B7280', isActive: true },
      ];

      for (const service of templateServices) {
        await authFetch('/api/scheduling/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(service),
        });
      }

      toggleAdvancedConfigMutation.mutate({ use_services: true });
      setConfigForm((prev) => ({ ...prev, useServices: true }));
      refetchServices();
      toast({ title: 'âœ… Modelo de cabeleireiro aplicado!', description: 'ServiÃ§os padrÃ£o adicionados.' });
    } catch (error) {
      toast({ title: 'âŒ Erro ao aplicar modelo', description: 'NÃ£o foi possÃ­vel criar os serviÃ§os.', variant: 'destructive' });
    } finally {
      setIsApplyingSalonTemplate(false);
    }
  };

  // Handle professional save
  const handleSaveProfessional = () => {
    if (editingProfessional) {
      updateProfessionalMutation.mutate({ id: editingProfessional.id, data: professionalForm });
    } else {
      createProfessionalMutation.mutate(professionalForm);
    }
  };

  // Toggle professional day
  const toggleProfessionalDay = (day: number) => {
    setProfessionalForm(prev => {
      const currentDays = prev.available_days || [];
      if (currentDays.includes(day)) {
        return { ...prev, available_days: currentDays.filter(d => d !== day) };
      } else {
        return { ...prev, available_days: [...currentDays, day].sort() };
      }
    });
  };

  const handleSaveConfig = () => {
    saveConfigMutation.mutate({
      is_enabled: configForm.isEnabled,
      service_name: configForm.serviceName,
      service_duration: configForm.serviceDuration,
      location: configForm.location,
      location_type: configForm.locationType,
      available_days: configForm.availableDays,
      work_start_time: configForm.workStartTime,
      work_end_time: configForm.workEndTime,
      break_start_time: configForm.breakStartTime,
      break_end_time: configForm.breakEndTime,
      has_break: configForm.hasBreak,
      slot_duration: configForm.slotDuration,
      buffer_between_appointments: configForm.bufferBetweenAppointments,
      max_appointments_per_day: configForm.maxAppointmentsPerDay,
      advance_booking_days: configForm.advanceBookingDays,
      min_booking_notice_hours: configForm.minBookingNoticeHours,
      require_confirmation: configForm.requireConfirmation,
      auto_confirm: configForm.autoConfirm,
      allow_cancellation: configForm.allowCancellation,
      send_reminder: configForm.sendReminder,
      reminder_hours_before: configForm.reminderHoursBefore,
      reminder_times: configForm.reminderTimes,
      booking_notification_enabled: configForm.bookingNotificationEnabled,
      booking_notification_phone: configForm.bookingNotificationPhone,
      slot_suggestion_mode: configForm.slotSuggestionMode,
    } as any);
  };

  const handleCreateAppointment = () => {
    if (manualAppointmentDuration === null) {
      toast({
        title: 'âŒ HorÃ¡rio invÃ¡lido',
        description: manualAppointmentTimeError || 'Revise o intervalo informado.',
        variant: 'destructive',
      });
      return;
    }

    if (manualAppointmentRequiresAddress && !appointmentForm.customerAddress?.trim()) {
      toast({
        title: 'âŒ EndereÃ§o obrigatÃ³rio',
        description: 'Pelo menos um dos serviÃ§os selecionados exige o endereÃ§o do cliente.',
        variant: 'destructive',
      });
      return;
    }

    createAppointmentMutation.mutate({
      ...appointmentForm,
      serviceIds: appointmentForm.serviceIds,
      serviceName: selectedManualServices.length > 0
        ? selectedManualServices.map((service) => service.name).join(' + ')
        : configForm.serviceName,
      customerAddress: appointmentForm.customerAddress,
      location: manualAppointmentRequiresAddress ? appointmentForm.customerAddress : configForm.location,
      locationType: manualAppointmentRequiresAddress ? 'endereco_cliente' : configForm.locationType,
      durationMinutes: selectedManualServicesDuration || manualAppointmentDuration,
    });
  };

  const handleCreateException = () => {
    createExceptionMutation.mutate(exceptionForm);
  };

  const toggleDay = (day: number) => {
    setConfigForm(prev => {
      const currentDays = prev.availableDays || [];
      if (currentDays.includes(day)) {
        return { ...prev, availableDays: currentDays.filter(d => d !== day) };
      } else {
        return { ...prev, availableDays: [...currentDays, day].sort() };
      }
    });
  };

  // Group appointments by date
  const todayAppointments = appointments.filter(a => a.appointment_date === format(new Date(), 'yyyy-MM-dd'));

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <CalendarClock className="w-8 h-8" />
              Agendamentos
            </h1>
            <p className="text-muted-foreground">
              Gerencie seus agendamentos e configure horÃ¡rios disponÃ­veis para a IA
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={configForm.isEnabled || false}
                onCheckedChange={(checked) => {
                  setConfigForm({ ...configForm, isEnabled: checked });
                  saveConfigMutation.mutate({ is_enabled: checked } as any);
                }}
              />
              <Label className={configForm.isEnabled ? "text-green-600 font-medium" : "text-muted-foreground"}>
                {configForm.isEnabled ? "Ativo" : "Desativado"}
              </Label>
            </div>
            <Button
              onClick={() => {
                refetchAppointments();
                refetchGoogleStatus();
                refetchExternalCalendarEvents();
              }}
              variant="outline"
              size="icon"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Dialog open={newAppointmentOpen} onOpenChange={setNewAppointmentOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Agendamento
                </Button>
              </DialogTrigger>
              <DialogContent className="flex max-h-[90vh] max-w-xl flex-col overflow-hidden border-slate-200 p-0">
                <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 text-left">
                  <DialogTitle className="text-2xl">Novo Agendamento</DialogTitle>
                  <DialogDescription className="max-w-lg">
                    Adicione manualmente o cliente, a data e o intervalo completo para a agenda ficar clara logo no primeiro bloco.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Nome do Cliente *</Label>
                      <Input
                        value={appointmentForm.clientName}
                        onChange={(e) => setAppointmentForm({ ...appointmentForm, clientName: e.target.value })}
                        placeholder="Nome completo"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefone *</Label>
                      <Input
                        value={appointmentForm.clientPhone}
                        onChange={(e) => setAppointmentForm({ ...appointmentForm, clientPhone: e.target.value })}
                        placeholder="(11) 99999-9999"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={appointmentForm.clientEmail}
                        onChange={(e) => setAppointmentForm({ ...appointmentForm, clientEmail: e.target.value })}
                        placeholder="email@exemplo.com"
                      />
                    </div>
                  </div>
                  {services.length > 0 ? (
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Label>ServiÃ§os do agendamento</Label>
                          <p className="text-sm text-muted-foreground">
                            Selecione um ou mais serviÃ§os para somar duraÃ§Ã£o e valor automaticamente.
                          </p>
                        </div>
                        <Badge variant="outline" className="bg-slate-50">
                          {selectedManualServicesDuration || (manualAppointmentDuration ?? 0)} min
                        </Badge>
                      </div>
                      <div className="max-h-60 overflow-y-auto pr-2">
                        <div className="flex flex-wrap gap-2">
                        {services.filter((service) => service.isActive).map((service) => {
                          const selected = appointmentForm.serviceIds?.includes(service.id);
                          return (
                            <Button
                              key={service.id}
                              type="button"
                              variant={selected ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => {
                                const nextServiceIds = selected
                                  ? (appointmentForm.serviceIds || []).filter((serviceId) => serviceId !== service.id)
                                  : [...(appointmentForm.serviceIds || []), service.id];
                                setAppointmentForm({ ...appointmentForm, serviceIds: nextServiceIds });
                              }}
                            >
                              {service.name}
                            </Button>
                          );
                        })}
                        </div>
                      </div>
                      {selectedManualServices.length > 0 ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                          <div>DuraÃ§Ã£o total: {selectedManualServicesDuration} min</div>
                          <div>Valor total: {selectedManualServicesTotal > 0 ? formatCurrencyBRL(selectedManualServicesTotal) : 'nÃ£o informado'}</div>
                        </div>
                      ) : null}
                      {manualAppointmentRequiresAddress ? (
                        <div className="space-y-2">
                          <Label>EndereÃ§o do Cliente *</Label>
                          <Textarea
                            value={appointmentForm.customerAddress}
                            onChange={(e) => setAppointmentForm({ ...appointmentForm, customerAddress: e.target.value })}
                            placeholder="Rua, nÃºmero, bairro e referÃªncia"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                      <CalendarIcon className="h-4 w-4" />
                      Janela do atendimento
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Data *</Label>
                        <Input
                          type="date"
                          value={appointmentForm.appointmentDate}
                          onChange={(e) => setAppointmentForm({ ...appointmentForm, appointmentDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>HorÃ¡rio *</Label>
                        <Input
                          type="time"
                          value={appointmentForm.startTime}
                          onChange={(e) => {
                            const nextStartTime = e.target.value;
                            const durationToKeep =
                              selectedManualServicesDuration ||
                              manualAppointmentDuration ||
                              (configForm.slotDuration || 60);
                            setAppointmentForm({
                              ...appointmentForm,
                              startTime: nextStartTime,
                              endTime: getEndTimeFromStart(
                                nextStartTime,
                                durationToKeep,
                              ),
                            });
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Fim *</Label>
                        <Input
                          type="time"
                          value={appointmentForm.endTime}
                          onChange={(e) => setAppointmentForm({ ...appointmentForm, endTime: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      <Badge
                        variant="secondary"
                        className="rounded-full bg-white px-3 py-1 text-slate-700"
                      >
                        {(selectedManualServicesDuration || manualAppointmentDuration) !== null
                          ? `${selectedManualServicesDuration || manualAppointmentDuration} min`
                          : 'Intervalo invÃ¡lido'}
                      </Badge>
                      {selectedManualServices.length > 0 ? (
                        <Badge
                          variant="outline"
                          className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600"
                        >
                          {selectedManualServices.map((service) => service.name).join(' + ')}
                        </Badge>
                      ) : configForm.serviceName ? (
                        <Badge
                          variant="outline"
                          className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600"
                        >
                          {configForm.serviceName}
                        </Badge>
                      ) : null}
                      <span className="text-slate-500">
                        O horÃ¡rio final pode ser ajustado manualmente.
                      </span>
                    </div>
                    {manualAppointmentTimeError ? (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {manualAppointmentTimeError}
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label>ObservaÃ§Ãµes</Label>
                    <Textarea
                      value={appointmentForm.clientNotes}
                      onChange={(e) => setAppointmentForm({ ...appointmentForm, clientNotes: e.target.value })}
                      placeholder="Notas adicionais para esse atendimento"
                      className="min-h-[110px]"
                    />
                  </div>
                </div>
                <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
                  <Button variant="outline" onClick={() => setNewAppointmentOpen(false)}>Cancelar</Button>
                  <Button
                    onClick={handleCreateAppointment}
                    disabled={
                      !appointmentForm.clientName ||
                      !appointmentForm.clientPhone ||
                      !appointmentForm.appointmentDate ||
                      !appointmentForm.startTime ||
                      !appointmentForm.endTime ||
                      (manualAppointmentRequiresAddress && !appointmentForm.customerAddress?.trim()) ||
                      manualAppointmentDuration === null ||
                      createAppointmentMutation.isPending
                    }
                  >
                    {createAppointmentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Criar Agendamento
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Alert when disabled */}
        {!configForm.isEnabled && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">Sistema de agendamento desativado</p>
              <p className="text-sm text-yellow-600">Ative o sistema nas configuraÃ§Ãµes para que a IA possa criar agendamentos automaticamente.</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        {isRealEstateMode && (
          <Card className="border-amber-200 bg-amber-50/70">
            <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-amber-100 text-amber-800">Modo Imobiliaria</Badge>
                  {realEstatePreview?.integration?.syncToAi ? (
                    <Badge variant="outline" className="border-amber-300 text-amber-900">
                      Catalogo ativo na IA
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-amber-950">
                  Neste modo, o motor de agendamento continua o mesmo. O servico representa o tipo de compromisso e o
                  imovel fica salvo como contexto interno para a IA e para a operacao.
                </p>
                {realEstatePreview?.integration?.matonInboxEmail ? (
                  <p className="text-xs text-amber-900/80">
                    Caixa de leads conectada: {realEstatePreview.integration.matonInboxEmail}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="appointments">
              <CalendarDays className="w-4 h-4 mr-2" />
              Agendamentos
            </TabsTrigger>
            <TabsTrigger value="services">
              <Briefcase className="w-4 h-4 mr-2" />
              ServiÃ§os
            </TabsTrigger>
            <TabsTrigger value="professionals">
              <Users className="w-4 h-4 mr-2" />
              Profissionais
            </TabsTrigger>
            <TabsTrigger value="google-calendar">
              <Link2 className="w-4 h-4 mr-2" />
              Google Calendario
            </TabsTrigger>
            <TabsTrigger value="config">
              <Settings className="w-4 h-4 mr-2" />
              ConfiguraÃ§Ãµes
            </TabsTrigger>
            <TabsTrigger value="exceptions">
              <Ban className="w-4 h-4 mr-2" />
              ExceÃ§Ãµes
            </TabsTrigger>
          </TabsList>

          {/* Appointments Tab */}
          <TabsContent value="appointments" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Hoje</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{todayAppointments.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">
                    {appointments.filter(a => a.status === 'pending').length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Confirmados</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {appointments.filter(a => a.status === 'confirmed').length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total do MÃªs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{appointments.length}</div>
                </CardContent>
              </Card>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-4">
              <Label>Filtrar por status:</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="confirmed">Confirmados</SelectItem>
                  <SelectItem value="cancelled">Cancelados</SelectItem>
                  <SelectItem value="completed">ConcluÃ­dos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Agenda do dia */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" />
                  Agenda do Dia
                </CardTitle>
                <CardDescription>
                  Selecione uma data e veja os agendamentos internos e os bloqueios vindos direto do Google Calendar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-[320px_1fr]">
                  <div className="rounded-md border p-3">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      locale={ptBR}
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-medium">
                        {selectedDate
                          ? `Agendamentos de ${format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}`
                          : "Selecione uma data"}
                      </div>
                      <Badge variant="outline" className="bg-white">
                        {selectedDayAppointments.length} internos
                      </Badge>
                      <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                        {selectedDayExternalEvents.length} externos
                      </Badge>
                    </div>
                    {externalCalendarEventsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sincronizando agenda externa...
                      </div>
                    ) : null}
                    {selectedDayAgendaItems.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Nenhum agendamento para este dia.
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {selectedDayAgendaItems.map((item) => item.kind === 'internal' ? (
                          <AppointmentCard
                            key={item.id}
                            appointment={item.appointment}
                            onConfirm={() => confirmAppointmentMutation.mutate(item.appointment.id)}
                            onCancel={() => cancelAppointmentMutation.mutate({ id: item.appointment.id })}
                            onComplete={(status) => completeAppointmentMutation.mutate({ id: item.appointment.id, status })}
                          />
                        ) : (
                          <ExternalCalendarEventCard key={item.id} event={item.event} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Today's Appointments */}
            {todayAppointments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5" />
                    Hoje - {format(new Date(), "dd 'de' MMMM", { locale: ptBR })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {todayAppointments.map((apt) => (
                      <AppointmentCard 
                        key={apt.id} 
                        appointment={apt}
                        onConfirm={() => confirmAppointmentMutation.mutate(apt.id)}
                        onCancel={() => cancelAppointmentMutation.mutate({ id: apt.id })}
                        onComplete={(status) => completeAppointmentMutation.mutate({ id: apt.id, status })}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* All Appointments Table */}
            <Card>
              <CardHeader>
                <CardTitle>Todos os Agendamentos</CardTitle>
                <CardDescription>Lista completa de agendamentos do sistema. A agenda do dia acima tambem mostra eventos externos do Google Calendar.</CardDescription>
              </CardHeader>
              <CardContent>
                {appointmentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                ) : appointments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarClock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum agendamento encontrado</p>
                    <p className="text-sm">Crie um novo agendamento ou aguarde a IA criar automaticamente</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>HorÃ¡rio</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>ServiÃ§o</TableHead>
                        <TableHead>Contexto</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Criado por</TableHead>
                        <TableHead className="text-right">AÃ§Ãµes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {appointments.map((apt) => {
                        const statusConfig = STATUS_CONFIG[apt.status];
                        const StatusIcon = statusConfig.icon;
                        const realEstateContext = getRealEstateContext(apt);
                        return (
                          <TableRow key={apt.id}>
                            <TableCell className="font-medium">
                              {format(parseISO(apt.appointment_date), "dd/MM/yyyy")}
                            </TableCell>
                            <TableCell>{apt.start_time} - {apt.end_time}</TableCell>
                            <TableCell>{apt.client_name}</TableCell>
                            <TableCell>
                              {apt.service_name ? (
                                <Badge variant="outline" className="gap-1 bg-blue-50 text-blue-700 border-blue-200">
                                  <Briefcase className="w-3 h-3" />
                                  {apt.service_name}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {realEstateContext ? (
                                <div className="space-y-1">
                                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                                    {realEstateContext.appointmentTypeLabel || "Compromisso imobiliario"}
                                  </Badge>
                                  <div className="text-sm font-medium text-slate-900">
                                    {realEstateContext.listingCode || "Sem codigo"}
                                    {realEstateContext.listingTitle ? ` â€¢ ${realEstateContext.listingTitle}` : ""}
                                  </div>
                                  {buildRealEstateContextLine(realEstateContext) ? (
                                    <div className="text-xs text-muted-foreground">
                                      {buildRealEstateContextLine(realEstateContext)}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell>{apt.client_phone}</TableCell>
                            <TableCell>
                              <Badge className={cn("gap-1", statusConfig.color)}>
                                <StatusIcon className="w-3 h-3" />
                                {statusConfig.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {apt.created_by_ai ? (
                                <Badge variant="outline" className="gap-1">
                                  ðŸ¤– IA
                                </Badge>
                              ) : (
                                <Badge variant="outline">Manual</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {apt.status === 'pending' && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-green-600"
                                      onClick={() => confirmAppointmentMutation.mutate(apt.id)}
                                    >
                                      <Check className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600"
                                      onClick={() => cancelAppointmentMutation.mutate({ id: apt.id })}
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                                {apt.status === 'confirmed' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => completeAppointmentMutation.mutate({ id: apt.id, status: 'completed' })}
                                  >
                                    Concluir
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Config Tab */}
          <TabsContent value="config" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Basic Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>InformaÃ§Ãµes do ServiÃ§o</CardTitle>
                  <CardDescription>Configure o serviÃ§o oferecido</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome do ServiÃ§o</Label>
                    <Input
                      value={configForm.serviceName || ''}
                      onChange={(e) => setConfigForm({ ...configForm, serviceName: e.target.value })}
                      placeholder="Ex: Consulta, Corte de Cabelo, ReuniÃ£o..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>DuraÃ§Ã£o (minutos)</Label>
                    <Input
                      type="number"
                      value={configForm.slotDuration || 60}
                      onChange={(e) => setConfigForm({ ...configForm, slotDuration: parseInt(e.target.value) })}
                      min={15}
                      max={480}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Local/EndereÃ§o</Label>
                    <Textarea
                      value={configForm.location || ''}
                      onChange={(e) => setConfigForm({ ...configForm, location: e.target.value })}
                      placeholder="Ex: Rua das Flores, 123 - Centro"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de Atendimento</Label>
                    <Select 
                      value={configForm.locationType || 'presencial'}
                      onValueChange={(value) => setConfigForm({ ...configForm, locationType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="presencial">Presencial</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="ambos">Presencial ou Online</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Schedule Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>HorÃ¡rios de Funcionamento</CardTitle>
                  <CardDescription>Defina quando vocÃª estÃ¡ disponÃ­vel</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Dias DisponÃ­veis</Label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <Button
                          key={day.value}
                          variant={configForm.availableDays?.includes(day.value) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleDay(day.value)}
                        >
                          {day.short}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>InÃ­cio do Expediente</Label>
                      <Input
                        type="time"
                        value={configForm.workStartTime || '09:00'}
                        onChange={(e) => setConfigForm({ ...configForm, workStartTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fim do Expediente</Label>
                      <Input
                        type="time"
                        value={configForm.workEndTime || '18:00'}
                        onChange={(e) => setConfigForm({ ...configForm, workEndTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={configForm.hasBreak || false}
                      onCheckedChange={(checked) => setConfigForm({ ...configForm, hasBreak: checked })}
                    />
                    <Label>HorÃ¡rio de AlmoÃ§o/Pausa</Label>
                  </div>
                  {configForm.hasBreak && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>InÃ­cio da Pausa</Label>
                        <Input
                          type="time"
                          value={configForm.breakStartTime || '12:00'}
                          onChange={(e) => setConfigForm({ ...configForm, breakStartTime: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Fim da Pausa</Label>
                        <Input
                          type="time"
                          value={configForm.breakEndTime || '13:00'}
                          onChange={(e) => setConfigForm({ ...configForm, breakEndTime: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                  <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label>Notificador de novos agendamentos</Label>
                        <p className="text-sm text-muted-foreground">
                          Envia um WhatsApp para o nÃºmero informado sempre que um agendamento for criado.
                        </p>
                      </div>
                      <Switch
                        checked={configForm.bookingNotificationEnabled || false}
                        onCheckedChange={(checked) => setConfigForm({ ...configForm, bookingNotificationEnabled: checked })}
                      />
                    </div>
                    {configForm.bookingNotificationEnabled ? (
                      <div className="space-y-2">
                        <Label>NÃºmero do notificador</Label>
                        <Input
                          value={configForm.bookingNotificationPhone || ''}
                          onChange={(e) => setConfigForm({ ...configForm, bookingNotificationPhone: e.target.value })}
                          placeholder="5511999999999"
                        />
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              {/* Advanced Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>ConfiguraÃ§Ãµes AvanÃ§adas</CardTitle>
                  <CardDescription>Limites e regras de agendamento</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>MÃ¡x. por dia</Label>
                      <Input
                        type="number"
                        value={configForm.maxAppointmentsPerDay || 10}
                        onChange={(e) => setConfigForm({ ...configForm, maxAppointmentsPerDay: parseInt(e.target.value) })}
                        min={1}
                        max={50}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Dias de antecedÃªncia</Label>
                      <Input
                        type="number"
                        value={configForm.advanceBookingDays || 30}
                        onChange={(e) => setConfigForm({ ...configForm, advanceBookingDays: parseInt(e.target.value) })}
                        min={1}
                        max={365}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Intervalo entre atendimentos (min)</Label>
                      <Input
                        type="number"
                        value={configForm.bufferBetweenAppointments || 0}
                        onChange={(e) => setConfigForm({ ...configForm, bufferBetweenAppointments: parseInt(e.target.value) })}
                        min={0}
                        max={60}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>AntecedÃªncia mÃ­nima (horas)</Label>
                      <Input
                        type="number"
                        value={configForm.minBookingNoticeHours || 2}
                        onChange={(e) => setConfigForm({ ...configForm, minBookingNoticeHours: parseInt(e.target.value) })}
                        min={0}
                        max={72}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* AI & Confirmation Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>IA e ConfirmaÃ§Ã£o</CardTitle>
                  <CardDescription>Como a IA deve lidar com agendamentos</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                    <div className="space-y-1">
                      <Label>EstratÃ©gia de oferta de horÃ¡rios</Label>
                      <p className="text-sm text-muted-foreground">
                        A IA nunca pode inventar agenda. Ela sÃ³ sugere horÃ¡rio depois de consultar a disponibilidade real.
                      </p>
                    </div>
                    <Select
                      value={configForm.slotSuggestionMode || 'first_available'}
                      onValueChange={(value: "first_available" | "ask_preference") => setConfigForm({ ...configForm, slotSuggestionMode: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first_available">Sempre indicar o primeiro horÃ¡rio real</SelectItem>
                        <SelectItem value="ask_preference">Pedir preferÃªncia antes de sugerir</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      No modo automatico, a IA consulta o Google Calendar e oferece o primeiro slot realmente livre. No modo guiado, ela pergunta dia ou periodo antes de consultar.
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Exigir confirmaÃ§Ã£o manual</Label>
                      <p className="text-sm text-muted-foreground">A IA cria como pendente e vocÃª confirma</p>
                    </div>
                    <Switch
                      checked={configForm.requireConfirmation || false}
                      onCheckedChange={(checked) => setConfigForm({ ...configForm, requireConfirmation: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Enviar lembrete</Label>
                      <p className="text-sm text-muted-foreground">Lembrar cliente antes do agendamento</p>
                    </div>
                    <Switch
                      checked={configForm.sendReminder || false}
                      onCheckedChange={(checked) => setConfigForm({ ...configForm, sendReminder: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Permitir cancelamento pelo cliente</Label>
                      <p className="text-sm text-muted-foreground">Cliente pode cancelar agendamento via IA</p>
                    </div>
                    <Switch
                      checked={configForm.allowCancellation ?? true}
                      onCheckedChange={(checked) => setConfigForm({ ...configForm, allowCancellation: checked })}
                    />
                  </div>
                  {configForm.sendReminder && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>HorÃ¡rios de lembrete (horas antes)</Label>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const times = [...(configForm.reminderTimes || [24])];
                            // Add a new time suggestion (common values)
                            const suggestions = [1, 2, 3, 4, 6, 12, 24, 48, 72];
                            const nextTime = suggestions.find(s => !times.includes(s)) || 1;
                            times.push(nextTime);
                            times.sort((a, b) => b - a);
                            setConfigForm({ ...configForm, reminderTimes: times, reminderHoursBefore: Math.max(...times) });
                          }}
                        >
                          + Adicionar lembrete
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {(configForm.reminderTimes || [24]).map((time, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <div className="flex items-center gap-2 flex-1">
                              <Bell className="w-4 h-4 text-muted-foreground" />
                              <Input
                                type="number"
                                value={time}
                                onChange={(e) => {
                                  const times = [...(configForm.reminderTimes || [24])];
                                  times[index] = parseInt(e.target.value) || 1;
                                  times.sort((a, b) => b - a);
                                  setConfigForm({ ...configForm, reminderTimes: times, reminderHoursBefore: Math.max(...times) });
                                }}
                                min={1}
                                max={72}
                                className="w-20"
                              />
                              <span className="text-sm text-muted-foreground">
                                {time === 1 ? 'hora antes' : time < 24 ? `horas antes` : time === 24 ? '1 dia antes' : `${Math.round(time/24)} dias antes`}
                              </span>
                            </div>
                            {(configForm.reminderTimes || [24]).length > 1 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 h-8 w-8 p-0"
                                onClick={() => {
                                  const times = (configForm.reminderTimes || [24]).filter((_, i) => i !== index);
                                  setConfigForm({ ...configForm, reminderTimes: times, reminderHoursBefore: Math.max(...times) });
                                }}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        A IA gerarÃ¡ mensagens naturais de lembrete e enviarÃ¡ via WhatsApp nos horÃ¡rios configurados
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveConfig} disabled={saveConfigMutation.isPending}>
                {saveConfigMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar ConfiguraÃ§Ãµes
              </Button>
            </div>
          </TabsContent>

          {/* Exceptions Tab */}
          <TabsContent value="exceptions" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>ExceÃ§Ãµes e Dias Bloqueados</CardTitle>
                  <CardDescription>Feriados, dias de folga e horÃ¡rios especiais</CardDescription>
                </div>
                <Dialog open={newExceptionOpen} onOpenChange={setNewExceptionOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Nova ExceÃ§Ã£o
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nova ExceÃ§Ã£o</DialogTitle>
                      <DialogDescription>Bloqueie um dia ou modifique o horÃ¡rio</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Data</Label>
                        <Input
                          type="date"
                          value={exceptionForm.exceptionDate}
                          onChange={(e) => setExceptionForm({ ...exceptionForm, exceptionDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo</Label>
                        <Select
                          value={exceptionForm.exceptionType}
                          onValueChange={(value: any) => setExceptionForm({ ...exceptionForm, exceptionType: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="blocked">Dia Bloqueado (sem atendimento)</SelectItem>
                            <SelectItem value="holiday">Feriado</SelectItem>
                            <SelectItem value="modified_hours">HorÃ¡rio Modificado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {exceptionForm.exceptionType === 'modified_hours' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>InÃ­cio</Label>
                            <Input
                              type="time"
                              value={exceptionForm.customStartTime}
                              onChange={(e) => setExceptionForm({ ...exceptionForm, customStartTime: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Fim</Label>
                            <Input
                              type="time"
                              value={exceptionForm.customEndTime}
                              onChange={(e) => setExceptionForm({ ...exceptionForm, customEndTime: e.target.value })}
                            />
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>Motivo (opcional)</Label>
                        <Input
                          value={exceptionForm.reason}
                          onChange={(e) => setExceptionForm({ ...exceptionForm, reason: e.target.value })}
                          placeholder="Ex: Feriado de Natal, Viagem..."
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setNewExceptionOpen(false)}>Cancelar</Button>
                      <Button onClick={handleCreateException} disabled={createExceptionMutation.isPending}>
                        {createExceptionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Criar ExceÃ§Ã£o
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {exceptions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Ban className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma exceÃ§Ã£o cadastrada</p>
                    <p className="text-sm">Adicione feriados ou dias de folga</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>HorÃ¡rio</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead className="text-right">AÃ§Ãµes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exceptions.map((exc) => (
                        <TableRow key={exc.id}>
                          <TableCell className="font-medium">
                            {format(parseISO(exc.exception_date), "dd/MM/yyyy")}
                          </TableCell>
                          <TableCell>
                            <Badge variant={exc.exception_type === 'blocked' ? 'destructive' : 'outline'}>
                              {exc.exception_type === 'blocked' ? 'Bloqueado' : 
                               exc.exception_type === 'holiday' ? 'Feriado' : 'HorÃ¡rio Especial'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {exc.exception_type === 'modified_hours' 
                              ? `${exc.custom_start_time} - ${exc.custom_end_time}`
                              : '-'}
                          </TableCell>
                          <TableCell>{exc.reason || '-'}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => deleteExceptionMutation.mutate(exc.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== SERVICES TAB ==================== */}
          <TabsContent value="services" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="w-5 h-5" />
                      ServiÃ§os
                    </CardTitle>
                    <CardDescription>
                      Cadastre os serviÃ§os que vocÃª oferece. Seus clientes poderÃ£o escolher qual serviÃ§o agendar.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={configForm.useServices || false}
                        onCheckedChange={(checked) => {
                          setConfigForm({ ...configForm, useServices: checked });
                          toggleAdvancedConfigMutation.mutate({ use_services: checked });
                        }}
                      />
                      <Label className={configForm.useServices ? "text-green-600 font-medium" : "text-muted-foreground"}>
                        {configForm.useServices ? "Ativo" : "Desativado"}
                      </Label>
                    </div>
                    <Button
                      variant="outline"
                      onClick={applySalonTemplate}
                      disabled={isApplyingSalonTemplate}
                    >
                      {isApplyingSalonTemplate ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Palette className="w-4 h-4 mr-2" />
                      )}
                      Modelo Cabeleireiro
                    </Button>
                    <Dialog open={newServiceOpen} onOpenChange={setNewServiceOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="w-4 h-4 mr-2" />
                          Novo ServiÃ§o
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>{editingService ? 'Editar ServiÃ§o' : 'Novo ServiÃ§o'}</DialogTitle>
                          <DialogDescription>
                            {editingService ? 'Atualize os dados do serviÃ§o' : 'Cadastre um novo serviÃ§o para seus clientes'}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Nome do ServiÃ§o *</Label>
                            <Input
                              value={serviceForm.name}
                              onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                              placeholder="Ex: Corte de Cabelo"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>DescriÃ§Ã£o</Label>
                            <Input
                              value={serviceForm.description}
                              onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                              placeholder="Breve descriÃ§Ã£o do serviÃ§o"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>DuraÃ§Ã£o (minutos)</Label>
                              <Input
                                type="number"
                                value={serviceForm.duration_minutes}
                                onChange={(e) => setServiceForm({ ...serviceForm, duration_minutes: parseInt(e.target.value) || 60 })}
                                min={15}
                                step={15}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>PreÃ§o (R$)</Label>
                              <Input
                                type="number"
                                value={serviceForm.price}
                                onChange={(e) => setServiceForm({ ...serviceForm, price: parseFloat(e.target.value) || 0 })}
                                min={0}
                                step={0.01}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Cor de identificaÃ§Ã£o</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="color"
                                value={serviceForm.color}
                                onChange={(e) => setServiceForm({ ...serviceForm, color: e.target.value })}
                                className="w-16 h-10 p-1 cursor-pointer"
                              />
                              <span className="text-sm text-muted-foreground">{serviceForm.color}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={serviceForm.is_active}
                              onCheckedChange={(checked) => setServiceForm({ ...serviceForm, is_active: checked })}
                            />
                            <Label>ServiÃ§o ativo</Label>
                          </div>
                          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3">
                            <div>
                              <Label>Atendimento no endereÃ§o do cliente</Label>
                              <p className="text-sm text-muted-foreground">
                                Quando ativo, a IA e o agendamento manual passam a exigir o endereÃ§o do cliente.
                              </p>
                            </div>
                            <Switch
                              checked={serviceForm.requires_customer_address}
                              onCheckedChange={(checked) => setServiceForm({ ...serviceForm, requires_customer_address: checked })}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => { setNewServiceOpen(false); setEditingService(null); }}>
                            Cancelar
                          </Button>
                          <Button 
                            onClick={handleSaveService}
                            disabled={!serviceForm.name || createServiceMutation.isPending || updateServiceMutation.isPending}
                          >
                            {(createServiceMutation.isPending || updateServiceMutation.isPending) && (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            )}
                            {editingService ? 'Salvar' : 'Criar ServiÃ§o'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!configForm.useServices && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-yellow-800 text-sm">
                      âš ï¸ A funcionalidade de serviÃ§os estÃ¡ desativada. Ative-a para que seus clientes possam escolher qual serviÃ§o agendar.
                    </p>
                  </div>
                )}
                {services.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Briefcase className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <h3 className="text-lg font-medium mb-2">Nenhum serviÃ§o cadastrado</h3>
                    <p className="text-sm mb-4">Adicione seus serviÃ§os para que os clientes possam escolher ao agendar</p>
                    <Button onClick={() => setNewServiceOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Primeiro ServiÃ§o
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {services.map((service) => (
                      <Card key={service.id} className={cn("relative overflow-hidden", !service.isActive && "opacity-60")}>
                        <div 
                          className="absolute top-0 left-0 w-full h-1" 
                          style={{ backgroundColor: service.color || '#3B82F6' }}
                        />
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-lg">{service.name}</CardTitle>
                            <div className="flex gap-1">
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-8 w-8"
                                onClick={() => { setEditingService(service); setNewServiceOpen(true); }}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-8 w-8 text-red-600"
                                onClick={() => deleteServiceMutation.mutate(service.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          {service.description && (
                            <CardDescription>{service.description}</CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              {service.durationMinutes} min
                            </div>
                            {service.price !== null && service.price > 0 && (
                              <div className="flex items-center gap-1 font-medium text-green-600">
                                <DollarSign className="w-4 h-4" />
                                {service.price.toFixed(2)}
                              </div>
                            )}
                          </div>
                          <div className="mt-2">
                            <Badge variant={service.isActive ? "default" : "secondary"}>
                              {service.isActive ? "Ativo" : "Inativo"}
                            </Badge>
                            {service.requiresCustomerAddress ? (
                              <Badge variant="outline" className="ml-2 border-amber-200 bg-amber-50 text-amber-900">
                                Vai atÃ© o cliente
                              </Badge>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== PROFESSIONALS TAB ==================== */}
          <TabsContent value="professionals" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Profissionais
                    </CardTitle>
                    <CardDescription>
                      Cadastre sua equipe. Clientes poderÃ£o escolher com qual profissional agendar.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={configForm.useProfessionals || false}
                        onCheckedChange={(checked) => {
                          setConfigForm({ ...configForm, useProfessionals: checked });
                          toggleAdvancedConfigMutation.mutate({ use_professionals: checked });
                        }}
                      />
                      <Label className={configForm.useProfessionals ? "text-green-600 font-medium" : "text-muted-foreground"}>
                        {configForm.useProfessionals ? "Ativo" : "Desativado"}
                      </Label>
                    </div>
                    <Dialog open={newProfessionalOpen} onOpenChange={setNewProfessionalOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="w-4 h-4 mr-2" />
                          Novo Profissional
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{editingProfessional ? 'Editar Profissional' : 'Novo Profissional'}</DialogTitle>
                          <DialogDescription>
                            {editingProfessional ? 'Atualize os dados do profissional' : 'Adicione um membro da sua equipe'}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Nome *</Label>
                              <Input
                                value={professionalForm.name}
                                onChange={(e) => setProfessionalForm({ ...professionalForm, name: e.target.value })}
                                placeholder="Nome completo"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Especialidade</Label>
                              <Input
                                value={professionalForm.specialty}
                                onChange={(e) => setProfessionalForm({ ...professionalForm, specialty: e.target.value })}
                                placeholder="Ex: Cabeleireiro"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Email</Label>
                              <Input
                                type="email"
                                value={professionalForm.email}
                                onChange={(e) => setProfessionalForm({ ...professionalForm, email: e.target.value })}
                                placeholder="email@exemplo.com"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Telefone</Label>
                              <Input
                                value={professionalForm.phone}
                                onChange={(e) => setProfessionalForm({ ...professionalForm, phone: e.target.value })}
                                placeholder="(11) 99999-9999"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Foto URL</Label>
                            <Input
                              value={professionalForm.photo_url}
                              onChange={(e) => setProfessionalForm({ ...professionalForm, photo_url: e.target.value })}
                              placeholder="https://..."
                            />
                          </div>
                          
                          <Separator />
                          
                          <div className="space-y-2">
                            <Label>HorÃ¡rio de Trabalho</Label>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">InÃ­cio</Label>
                                <Input
                                  type="time"
                                  value={professionalForm.work_start_time}
                                  onChange={(e) => setProfessionalForm({ ...professionalForm, work_start_time: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Fim</Label>
                                <Input
                                  type="time"
                                  value={professionalForm.work_end_time}
                                  onChange={(e) => setProfessionalForm({ ...professionalForm, work_end_time: e.target.value })}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Intervalo</Label>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">InÃ­cio</Label>
                                <Input
                                  type="time"
                                  value={professionalForm.break_start_time}
                                  onChange={(e) => setProfessionalForm({ ...professionalForm, break_start_time: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Fim</Label>
                                <Input
                                  type="time"
                                  value={professionalForm.break_end_time}
                                  onChange={(e) => setProfessionalForm({ ...professionalForm, break_end_time: e.target.value })}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Dias de Trabalho</Label>
                            <div className="flex flex-wrap gap-2">
                              {DAYS_OF_WEEK.map((day) => (
                                <Button
                                  key={day.value}
                                  type="button"
                                  size="sm"
                                  variant={professionalForm.available_days?.includes(day.value) ? "default" : "outline"}
                                  onClick={() => toggleProfessionalDay(day.value)}
                                >
                                  {day.short}
                                </Button>
                              ))}
                            </div>
                          </div>

                          {services.length > 0 && (
                            <>
                              <Separator />
                              <div className="space-y-2">
                                <Label>ServiÃ§os que realiza</Label>
                                <div className="flex flex-wrap gap-2">
                                  {services.map((service) => (
                                    <Button
                                      key={service.id}
                                      type="button"
                                      size="sm"
                                      variant={professionalForm.assigned_services?.includes(service.id) ? "default" : "outline"}
                                      onClick={() => {
                                        const current = professionalForm.assigned_services || [];
                                        if (current.includes(service.id)) {
                                          setProfessionalForm({ ...professionalForm, assigned_services: current.filter(s => s !== service.id) });
                                        } else {
                                          setProfessionalForm({ ...professionalForm, assigned_services: [...current, service.id] });
                                        }
                                      }}
                                      style={{ 
                                        borderColor: service.color || '#3B82F6',
                                        backgroundColor: professionalForm.assigned_services?.includes(service.id) ? service.color : 'transparent',
                                        color: professionalForm.assigned_services?.includes(service.id) ? 'white' : undefined
                                      }}
                                    >
                                      {service.name}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}

                          <div className="flex items-center gap-2">
                            <Switch
                              checked={professionalForm.is_active}
                              onCheckedChange={(checked) => setProfessionalForm({ ...professionalForm, is_active: checked })}
                            />
                            <Label>Profissional ativo</Label>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => { setNewProfessionalOpen(false); setEditingProfessional(null); }}>
                            Cancelar
                          </Button>
                          <Button 
                            onClick={handleSaveProfessional}
                            disabled={!professionalForm.name || createProfessionalMutation.isPending || updateProfessionalMutation.isPending}
                          >
                            {(createProfessionalMutation.isPending || updateProfessionalMutation.isPending) && (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            )}
                            {editingProfessional ? 'Salvar' : 'Adicionar Profissional'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!configForm.useProfessionals && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-yellow-800 text-sm">
                      âš ï¸ A funcionalidade de profissionais estÃ¡ desativada. Ative-a para que seus clientes possam escolher com quem agendar.
                    </p>
                  </div>
                )}
                {professionals.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <h3 className="text-lg font-medium mb-2">Nenhum profissional cadastrado</h3>
                    <p className="text-sm mb-4">Adicione membros da sua equipe para que os clientes possam escolher</p>
                    <Button onClick={() => setNewProfessionalOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Primeiro Profissional
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {professionals.map((professional) => (
                      <Card key={professional.id} className={cn("relative", !professional.isActive && "opacity-60")}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start gap-3">
                            {professional.photoUrl ? (
                              <img 
                                src={professional.photoUrl} 
                                alt={professional.name}
                                className="w-12 h-12 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="w-6 h-6 text-primary" />
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="flex items-start justify-between">
                                <div>
                                  <CardTitle className="text-lg">{professional.name}</CardTitle>
                                  {professional.specialty && (
                                    <CardDescription>{professional.specialty}</CardDescription>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-8 w-8"
                                    onClick={() => { setEditingProfessional(professional); setNewProfessionalOpen(true); }}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-8 w-8 text-red-600"
                                    onClick={() => deleteProfessionalMutation.mutate(professional.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-2 text-sm">
                            {professional.email && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Mail className="w-4 h-4" />
                                {professional.email}
                              </div>
                            )}
                            {professional.phone && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Phone className="w-4 h-4" />
                                {professional.phone}
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              {professional.workStartTime} - {professional.workEndTime}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {professional.availableDays?.map(day => (
                                <Badge key={day} variant="outline" className="text-xs">
                                  {DAYS_OF_WEEK.find(d => d.value === day)?.short}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t">
                            <Badge variant={professional.isActive ? "default" : "secondary"}>
                              {professional.isActive ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== GOOGLE CALENDAR TAB ==================== */}
          <TabsContent value="google-calendar" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Google Calendario
                    </CardTitle>
                    <CardDescription>
                      Conecte sua conta Google direto no AgenteZap para sincronizar os agendamentos sem intermediarios.
                    </CardDescription>
                  </div>
                  <ContextualHelpButton
                    articleId="scheduling-maton-google-calendar"
                    title="Como integrar com Google"
                    label="Ajuda"
                    description="Abra o passo a passo completo para conectar a agenda Google direto no AgenteZap."
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className={cn(
                  "rounded-lg border-2 p-6",
                  googleCalendarStatus?.isConnected ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"
                )}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-center gap-4">
                      {googleCalendarStatus?.isConnected ? (
                        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                          <Link2 className="w-6 h-6 text-green-600" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                          <Link2Off className="w-6 h-6 text-gray-500" />
                        </div>
                      )}
                      <div className="space-y-1">
                        <h3 className="font-semibold text-lg">
                          {googleCalendarStatus?.isConnected ? "Conectado" : "Nao conectado"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {(googleCalendarStatus?.providerLabel || "Google") + " Calendar"}
                        </p>
                        {googleCalendarStatus?.email && (
                          <p className="text-sm text-muted-foreground">{googleCalendarStatus.email}</p>
                        )}
                        {googleCalendarStatus?.checked === false && googleCalendarStatus?.error && (
                          <p className="text-sm text-amber-700">{googleCalendarStatus.error}</p>
                        )}
                      </div>
                    </div>
                    <div className="w-full max-w-xl space-y-3">
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Use o popup seguro do Google para autorizar a agenda. Depois disso, o AgenteZap passa a reconciliar os dois lados em ciclos leves.
                        </p>

                        <p className="text-xs text-muted-foreground">
                          Um clique abre a autorizacao do Google, e o AgenteZap passa a criar e reconciliar eventos com a agenda escolhida.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          onClick={() => connectGoogleCalendarMutation.mutate()}
                          disabled={connectGoogleCalendarMutation.isPending}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {connectGoogleCalendarMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Link2 className="w-4 h-4 mr-2" />
                          )}
                          {googleCalendarStatus?.isConnected ? "Reconectar Google" : "Conectar com Google"}
                        </Button>
                        {googleCalendarStatus?.isConnected && (
                          <Button
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => disconnectGoogleCalendarMutation.mutate()}
                            disabled={disconnectGoogleCalendarMutation.isPending}
                          >
                            {disconnectGoogleCalendarMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Link2Off className="w-4 h-4 mr-2" />
                            )}
                            Desconectar
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        O sincronizador usa a propria conta Google do cliente, sem chave externa intermediaria.
                      </p>
                    </div>
                  </div>
                </div>

                {googleCalendarStatus?.isConnected && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Configuracoes de sincronizacao</CardTitle>
                      <CardDescription>
                        Escolha a agenda que o sistema vai consultar para bloquear horarios e onde novos eventos serao criados.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Agenda usada na sincronizacao</Label>
                        <Select
                          value={googleCalendarStatus.selectedCalendarId || configForm.selectedCalendarId || ""}
                          onValueChange={(value) => selectGoogleCalendarMutation.mutate(value)}
                          disabled={selectGoogleCalendarMutation.isPending}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma agenda" />
                          </SelectTrigger>
                          <SelectContent>
                            {(googleCalendarStatus.calendars || []).filter((calendar) => calendar.accessRole === "owner" || calendar.accessRole === "writer").map((calendar) => (
                              <SelectItem key={calendar.id} value={calendar.id}>
                                {calendar.summary}{calendar.primary ? " (principal)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="font-medium">Sincronizacao automatica</Label>
                          <p className="text-sm text-muted-foreground">
                            Novos agendamentos serao gravados automaticamente na agenda escolhida e a IA tambem consultara esse calendario antes de confirmar horarios.
                          </p>
                        </div>
                        <Switch
                          checked={configForm.googleCalendarEnabled || false}
                          disabled={!googleCalendarStatus?.isConnected || toggleGoogleCalendarSyncMutation.isPending}
                          onCheckedChange={(checked) => {
                            setConfigForm({ ...configForm, googleCalendarEnabled: checked });
                            toggleGoogleCalendarSyncMutation.mutate(checked);
                          }}
                        />
                      </div>

                      <Separator />

                      <div className="space-y-3">
                        <h4 className="font-medium">Quando sincronizar</h4>
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Novo agendamento criado
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Agendamento confirmado
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Agendamento cancelado
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Reagendamento
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Beneficios da integracao</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <CalendarDays className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">Consulta real da agenda</h4>
                          <p className="text-xs text-muted-foreground">
                            O AgenteZap consulta os eventos do Google do cliente antes de liberar um horario.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <Bell className="w-4 h-4 text-green-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">Sem OAuth proprio</h4>
                          <p className="text-xs text-muted-foreground">
                            Cada cliente usa a propria conta Google e mantem a conexao sob controle dele.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                          <Phone className="w-4 h-4 text-purple-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">Agenda unica para operacao</h4>
                          <p className="text-xs text-muted-foreground">
                            A mesma agenda serve para o painel, para a IA e para qualquer ajuste manual feito pelo negocio.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                          <RefreshCw className="w-4 h-4 text-orange-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">Sincronizacao operacional</h4>
                          <p className="text-xs text-muted-foreground">
                            Criacao, atualizacao e cancelamento passam pela mesma integracao e ficam alinhados com a agenda externa.
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* AI Integration Section */}
                <Card className="border-2 border-primary/20 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      ðŸ¤– Agendamento Inteligente com IA
                    </CardTitle>
                    <CardDescription>
                      Quando ativado, a inteligÃªncia artificial faz tudo automaticamente
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-background rounded-lg border">
                      <div>
                        <Label className="font-medium">IA Gerencia Agendamentos</Label>
                        <p className="text-sm text-muted-foreground">
                          A IA conversa com clientes, verifica disponibilidade e cria agendamentos
                        </p>
                      </div>
                      <Switch
                        checked={configForm.aiSchedulingEnabled || false}
                        onCheckedChange={(checked) => {
                          setConfigForm({ ...configForm, aiSchedulingEnabled: checked });
                          toggleAdvancedConfigMutation.mutate({ ai_scheduling_enabled: checked });
                        }}
                      />
                    </div>
                    
                    <div className="text-sm space-y-2">
                      <h4 className="font-medium">A IA irÃ¡ automaticamente:</h4>
                      <ul className="space-y-1 text-muted-foreground">
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Perguntar qual serviÃ§o o cliente deseja
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Mostrar profissionais disponÃ­veis (se configurado)
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Verificar horÃ¡rios livres no calendÃ¡rio
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Criar o agendamento automaticamente
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Sincronizar com Google Agenda (se conectado)
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Enviar confirmaÃ§Ã£o ao cliente
                        </li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ExternalCalendarEventCard({ event }: { event: ExternalCalendarEvent }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Clock className="w-4 h-4 text-slate-500" />
          {formatExternalCalendarEventTime(event)}
        </div>
        <Badge variant="outline" className="gap-1 border-slate-300 bg-white text-slate-700">
          <CalendarDays className="w-3 h-3" />
          Google
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="font-medium text-slate-900">{event.title}</div>
        {event.description ? (
          <p className="text-sm text-muted-foreground">{event.description}</p>
        ) : null}
        {event.location ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            {event.location}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Evento externo sincronizado. Este periodo deve bloquear novos agendamentos da IA.
      </p>
    </div>
  );
}

// Appointment Card Component
function AppointmentCard({ 
  appointment, 
  onConfirm, 
  onCancel, 
  onComplete 
}: { 
  appointment: Appointment;
  onConfirm: () => void;
  onCancel: () => void;
  onComplete: (status: string) => void;
}) {
  const statusConfig = STATUS_CONFIG[appointment.status];
  const StatusIcon = statusConfig.icon;
  const realEstateContext = getRealEstateContext(appointment);
  const schedulingContext = getSchedulingContext(appointment);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Clock className="w-4 h-4 text-muted-foreground" />
          {appointment.start_time} - {appointment.end_time}
        </div>
        <Badge className={cn("gap-1", statusConfig.color)}>
          <StatusIcon className="w-3 h-3" />
          {statusConfig.label}
        </Badge>
      </div>
      
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">{appointment.client_name}</span>
        </div>
        {appointment.service_name && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Briefcase className="w-4 h-4" />
            <span className="font-medium text-primary">{appointment.service_name}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Phone className="w-4 h-4" />
          {appointment.client_phone}
        </div>
        {appointment.location && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            {appointment.location}
          </div>
        )}
      </div>

      {schedulingContext && schedulingContext.selectedServices.length > 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50/80 p-3 space-y-1 text-sm text-slate-700">
          {schedulingContext.selectedServices.map((service) => (
            <div key={`${appointment.id}-${service.id || service.name}`}>
              {service.name}
              {service.price !== null && service.price !== undefined ? ` â€¢ ${formatCurrencyBRL(service.price)}` : ''}
              {service.durationMinutes ? ` â€¢ ${service.durationMinutes} min` : ''}
            </div>
          ))}
          {schedulingContext.totalPrice !== null && schedulingContext.totalPrice !== undefined ? (
            <div className="font-medium text-slate-900">Total combinado: {formatCurrencyBRL(schedulingContext.totalPrice)}</div>
          ) : null}
        </div>
      ) : null}

      {realEstateContext && (
        <div className="rounded-md border border-amber-200 bg-amber-50/80 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-amber-300 text-amber-900">
              Imobiliaria
            </Badge>
            <Badge variant="outline" className="border-amber-300 text-amber-900">
              {realEstateContext.appointmentTypeLabel || "Compromisso imobiliario"}
            </Badge>
          </div>
          <p className="mt-2 text-sm font-medium text-slate-900">
            {realEstateContext.listingCode || "Sem codigo"}
            {realEstateContext.listingTitle ? ` â€¢ ${realEstateContext.listingTitle}` : ""}
          </p>
          {buildRealEstateContextLine(realEstateContext) ? (
            <p className="mt-1 text-xs text-muted-foreground">{buildRealEstateContextLine(realEstateContext)}</p>
          ) : null}
          {realEstateContext.summary ? (
            <p className="mt-1 text-xs text-muted-foreground">{realEstateContext.summary}</p>
          ) : null}
        </div>
      )}

      {appointment.created_by_ai && (
        <Badge variant="outline" className="gap-1">
          ðŸ¤– Criado pela IA
        </Badge>
      )}

      {appointment.status === 'pending' && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={onConfirm}>
            <Check className="w-4 h-4 mr-1" />
            Confirmar
          </Button>
          <Button size="sm" variant="outline" className="text-red-600" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {appointment.status === 'confirmed' && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onComplete('completed')}>
            <CheckCircle2 className="w-4 h-4 mr-1" />
            ConcluÃ­do
          </Button>
          <Button size="sm" variant="outline" className="text-red-600" onClick={() => onComplete('no_show')}>
            NÃ£o compareceu
          </Button>
        </div>
      )}
    </div>
  );
}


