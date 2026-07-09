import { Bot } from "lucide-react";

type BrandMarkProps = {
  className?: string;
  iconClassName?: string;
};

export function BrandMark({ className = "", iconClassName = "" }: BrandMarkProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm ring-1 ring-black/5 ${className}`.trim()}
    >
      <Bot className={`text-white ${iconClassName}`.trim()} />
    </div>
  );
}
