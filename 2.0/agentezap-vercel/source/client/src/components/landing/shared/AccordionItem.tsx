import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface AccordionItemProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  icon?: React.ReactNode;
}

export default function AccordionItem({ 
  title, 
  children, 
  defaultOpen = false,
  className = "",
  icon
}: AccordionItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className={`border-0 shadow-md hover:shadow-lg transition-all duration-300 ${className}`}>
      <CardContent className="p-0">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-neutral-50 transition-colors duration-200 rounded-lg"
          aria-expanded={isOpen}
          aria-controls={`accordion-content-${title.replace(/\s+/g, '-').toLowerCase()}`}
        >
          <div className="flex items-center gap-3">
            {icon && (
              <div className="flex-shrink-0">
                {icon}
              </div>
            )}
            <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
          </div>
          
          <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-neutral-100 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
            {isOpen ? (
              <ChevronUp className="w-4 h-4 text-neutral-600" />
            ) : (
              <ChevronDown className="w-4 h-4 text-neutral-600" />
            )}
          </div>
        </button>
        
        <div
          id={`accordion-content-${title.replace(/\s+/g, '-').toLowerCase()}`}
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="px-6 pb-4 text-neutral-600">
            {children}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
