import type { ReactNode } from "react";

type PremiumOverlayProps = {
  title?: string;
  subtitle?: string;
  description?: string;
  ctaLabel?: string;
  benefits?: string[];
  children: ReactNode;
};

export default function PremiumBlocked({ children }: PremiumOverlayProps) {
  return <>{children}</>;
}
