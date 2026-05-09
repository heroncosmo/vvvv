import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  createDeliveryNotificationAudio,
  deliveryOrdersSoundStorageKey,
} from "@/lib/delivery-notification-audio";

interface DeliveryConfig {
  is_active: boolean;
  send_to_ai: boolean;
}

interface DeliveryOrderNotification {
  id: string;
  order_number: string;
  customer_name: string;
  status: string;
}

interface DeliveryOrdersResponse {
  orders: DeliveryOrderNotification[];
}

export function DeliveryOrderNotifier() {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastKnownOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    audioRef.current = createDeliveryNotificationAudio();

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const { data: deliveryConfig } = useQuery<DeliveryConfig>({
    queryKey: ["/api/delivery-config"],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const deliveryAlertsEnabled = Boolean(deliveryConfig?.is_active && deliveryConfig?.send_to_ai);

  const { data: ordersData } = useQuery<DeliveryOrdersResponse>({
    queryKey: ["/api/delivery/orders?page=1&limit=20&status=pending"],
    enabled: deliveryAlertsEnabled,
    refetchInterval: deliveryAlertsEnabled ? 10000 : false,
    staleTime: 0,
  });

  const playNotificationSound = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(deliveryOrdersSoundStorageKey) === "false") return;
    if (!audioRef.current) return;

    audioRef.current.currentTime = 0;
    audioRef.current.play().catch((error) => {
      console.warn("[DeliveryOrderNotifier] Audio bloqueado pelo navegador", error);
    });
  }, []);

  useEffect(() => {
    if (!deliveryAlertsEnabled) {
      lastKnownOrderIdsRef.current = new Set();
      return;
    }

    if (!ordersData?.orders) return;

    const currentOrderIds = new Set(ordersData.orders.map((order) => order.id));

    if (lastKnownOrderIdsRef.current.size === 0) {
      lastKnownOrderIdsRef.current = currentOrderIds;
      return;
    }

    const newPendingOrders = ordersData.orders.filter(
      (order) => order.status === "pending" && !lastKnownOrderIdsRef.current.has(order.id),
    );

    if (newPendingOrders.length > 0) {
      playNotificationSound();
      toast({
        title: `${newPendingOrders.length} novo(s) pedido(s)!`,
        description: `Pedido #${newPendingOrders[0].order_number} - ${newPendingOrders[0].customer_name}`,
      });
    }

    lastKnownOrderIdsRef.current = currentOrderIds;
  }, [deliveryAlertsEnabled, ordersData?.orders, playNotificationSound, toast]);

  return null;
}
