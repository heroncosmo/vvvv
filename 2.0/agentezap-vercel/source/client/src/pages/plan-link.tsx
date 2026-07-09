import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";

export default function PlanLinkPage() {
  const [, params] = useRoute("/p/:slug");
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (params?.slug) {
      // Salva o slug no sessionStorage para ser capturado na landing/cadastro
      sessionStorage.setItem("plan_link_slug", params.slug);
    }
    // Redireciona imediatamente para home - sem loading, sem delay
    window.location.href = "/";
  }, [params?.slug]);

  // Retorna null - página não renderiza nada, só redireciona
  return null;
}
