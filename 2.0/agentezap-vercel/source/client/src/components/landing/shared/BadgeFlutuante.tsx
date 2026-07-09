import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";

interface BadgeFlutuanteProps {
  text: string;
  icon?: LucideIcon;
  variant?: 'default' | 'success' | 'info' | 'warning' | 'highlight';
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  className?: string;
}

export default function BadgeFlutuante({ 
  text, 
  icon: Icon, 
  variant = 'default',
  position = 'top-right',
  className = "" 
}: BadgeFlutuanteProps) {
  const positionClasses = {
    'top-left': '-top-4 -left-4',
    'top-right': '-top-4 -right-4', 
    'bottom-left': '-bottom-4 -left-4',
    'bottom-right': '-bottom-4 -right-4'
  };

  const variantClasses = {
    'default': 'bg-gradient-to-r from-info to-success text-white',
    'success': 'bg-success text-white',
    'info': 'bg-info text-white',
    'warning': 'bg-warning text-white',
    'highlight': 'bg-highlight text-white'
  };

  return (
    <div className={`absolute z-20 ${positionClasses[position]} ${className}`}>
      <Badge className={`px-4 py-2 rounded-full text-sm font-semibold shadow-xl border-2 border-white/20 backdrop-blur-md animate-bounce ${variantClasses[variant]}`}>
        {Icon && <Icon className="w-4 h-4 inline mr-2" />}
        {text}
      </Badge>
    </div>
  );
}
