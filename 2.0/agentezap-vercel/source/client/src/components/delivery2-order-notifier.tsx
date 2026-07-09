import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { useToast } from "@/hooks/use-toast";
import {
  createDelivery2NotificationAudio,
  delivery2OrdersSoundStorageKey,
} from "@/lib/delivery2-notification-audio";

interface Delivery2Config {
  is_active: boolean;
  send_to_ai: boolean;
}

interface Delivery2OrderNotification {
  id: string;
  customerName: string | null;
  summary: string | null;
  status: string;
}

interface Delivery2OrdersResponse {
  data: Delivery2OrderNotification[];
}

export function Delivery2OrderNotifier() {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastKnownOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    audioRef.current = createDelivery2NotificationAudio();

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const { data: config } = useQuery<Delivery2Config>({
    queryKey: ["/api/delivery-2-config"],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const delivery2AlertsEnabled = Boolean(config?.is_active && config?.send_to_ai);

  const { data: ordersData } = useQuery<Delivery2OrdersResponse>({
    queryKey: ["/api/delivery-2/orders?status=pending&limit=20&offset=0"],
    enabled: delivery2AlertsEnabled,
    refetchInterval: delivery2AlertsEnabled ? 10000 : false,
    staleTime: 0,
  });

  const playNotificationSound = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(delivery2OrdersSoundStorageKey) === "false") return;
    if (!audioRef.current) return;

    audioRef.current.currentTime = 0;
    audioRef.current.play().catch((error) => {
      console.warn("[Delivery2OrderNotifier] Audio bloqueado pelo navegador", error);
    });
  }, []);

  useEffect(() => {
    if (!delivery2AlertsEnabled) {
      lastKnownOrderIdsRef.current = new Set();
      return;
    }

    if (!ordersData?.data) return;

    const currentOrderIds = new Set(ordersData.data.map((order) => order.id));

    if (lastKnownOrderIdsRef.current.size === 0) {
      lastKnownOrderIdsRef.current = currentOrderIds;
      return;
    }

    const newPendingOrders = ordersData.data.filter(
      (order) => order.status === "pending" && !lastKnownOrderIdsRef.current.has(order.id),
    );

    if (newPendingOrders.length > 0) {
      playNotificationSound();
      toast({
        title: `${newPendingOrders.length} novo(s) pedido(s)!`,
        description: newPendingOrders[0].customerName || newPendingOrders[0].summary || "Novo pedido pronto para o PDV.",
      });
    }

    lastKnownOrderIdsRef.current = currentOrderIds;
  }, [delivery2AlertsEnabled, ordersData?.data, playNotificationSound, toast]);

  return null;
}

export default Delivery2OrderNotifier;
