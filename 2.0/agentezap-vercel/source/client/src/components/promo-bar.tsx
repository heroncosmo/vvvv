interface PromoBarProps {
  isAuthenticated: boolean;
}

export function PromoBar({ isAuthenticated }: PromoBarProps) {
  void isAuthenticated;
  return null;
}
