/**
 * Hook para obter branding white-label
 * Retorna as configurações de marca do revendedor se o usuário for cliente de um revendedor
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getAuthToken } from "@/lib/supabase";

export interface BrandingInfo {
  isWhiteLabel: boolean;
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  supportEmail?: string;
  supportPhone?: string;
  welcomeMessage?: string;
}

const defaultBranding: BrandingInfo = {
  isWhiteLabel: false,
  companyName: "AgenteZap",
  logoUrl: null,
  primaryColor: "#000000",
  secondaryColor: "#ffffff",
  accentColor: "#22c55e",
};

export function useBranding() {
  const { isAuthenticated } = useAuth();
  
  const { data, isLoading, error } = useQuery<BrandingInfo>({
    queryKey: ["/api/user/branding"],
    queryFn: async () => {
      const token = await getAuthToken();
      
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const response = await fetch("/api/user/branding", {
        credentials: "include",
        headers,
      });
      
      if (!response.ok) {
        // Return default branding on error
        return defaultBranding;
      }
      
      return response.json();
    },
    enabled: !!isAuthenticated, // Only fetch when authenticated
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });

  return {
    branding: data || defaultBranding,
    isLoading,
    error,
    isWhiteLabel: data?.isWhiteLabel || false,
  };
}
