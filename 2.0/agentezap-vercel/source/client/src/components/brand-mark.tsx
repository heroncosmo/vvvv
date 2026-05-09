import { Store } from "lucide-react";

type BrandMarkProps = {
  className?: string;
  iconClassName?: string;
};

export function BrandMark({ className = "", iconClassName = "" }: BrandMarkProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-lg shadow-teal-500/20 ${className}`.trim()}
    >
      <Store className={`text-white ${iconClassName}`.trim()} />
    </div>
  );
}
