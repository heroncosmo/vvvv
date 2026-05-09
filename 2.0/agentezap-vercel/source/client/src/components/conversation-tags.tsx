import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Tags as TagsIcon, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

// Interface para Tag
export interface Tag {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon?: string | null;
  isDefault: boolean;
  position: number;
  description?: string | null;
}

interface ConversationTagsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  currentTags: Tag[];
  onTagsUpdated?: (tags: Tag[]) => void;
}

export function ConversationTagsModal({
  open,
  onOpenChange,
  conversationId,
  currentTags,
  onTagsUpdated,
}: ConversationTagsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // IDs das tags atuais
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(
    new Set(currentTags.map(t => t.id))
  );

  // Query para buscar todas as tags do usuário
  const { data: allTags = [], isLoading } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    enabled: open,
  });

  // Mutation para atualizar tags da conversa
  const updateTagsMutation = useMutation({
    mutationFn: async (tagIds: string[]): Promise<Tag[]> => {
      const response = await apiRequest("PUT", `/api/conversations/${conversationId}/tags`, { tagIds });
      if (response instanceof Response) {
        return response.json();
      }
      return response as Tag[];
    },
    onSuccess: (updatedTags: Tag[]) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${conversationId}/tags`] });
      onTagsUpdated?.(updatedTags);
      onOpenChange(false);
      toast({
        title: "Etiquetas atualizadas",
        description: "As etiquetas da conversa foram atualizadas.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível atualizar as etiquetas.",
        variant: "destructive",
      });
    },
  });

  // Atualiza selectedTagIds quando currentTags mudar
  useState(() => {
    setSelectedTagIds(new Set(currentTags.map(t => t.id)));
  });

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tagId)) {
        newSet.delete(tagId);
      } else {
        newSet.add(tagId);
      }
      return newSet;
    });
  };

  const handleSave = () => {
    updateTagsMutation.mutate(Array.from(selectedTagIds));
  };

  // Reset quando o modal abrir
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setSelectedTagIds(new Set(currentTags.map(t => t.id)));
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TagsIcon className="w-5 h-5" />
            Etiquetas da Conversa
          </DialogTitle>
          <DialogDescription>
            Selecione as etiquetas para esta conversa
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[300px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : allTags.length === 0 ? (
            <div className="text-center py-8">
              <TagsIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma etiqueta disponível</p>
              <p className="text-sm text-muted-foreground mt-1">
                Crie etiquetas na página de Etiquetas
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {allTags.map((tag) => (
                <label
                  key={tag.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedTagIds.has(tag.id)
                      ? 'bg-accent border-primary'
                      : 'hover:bg-accent/50'
                  }`}
                >
                  <Checkbox
                    checked={selectedTagIds.has(tag.id)}
                    onCheckedChange={() => toggleTag(tag.id)}
                    className="data-[state=checked]:bg-primary"
                  />
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="font-medium flex-1">{tag.name}</span>
                  <Badge
                    style={{ 
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                      borderColor: tag.color
                    }}
                    variant="outline"
                    className="text-xs"
                  >
                    {tag.name}
                  </Badge>
                </label>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Tags selecionadas */}
        {selectedTagIds.size > 0 && (
          <div className="border-t pt-3">
            <p className="text-sm text-muted-foreground mb-2">
              Selecionadas ({selectedTagIds.size}):
            </p>
            <div className="flex flex-wrap gap-1">
              {allTags
                .filter(t => selectedTagIds.has(t.id))
                .map(tag => (
                  <Badge
                    key={tag.id}
                    style={{ 
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                      borderColor: tag.color
                    }}
                    variant="outline"
                    className="text-xs cursor-pointer hover:opacity-70"
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                    <X className="w-3 h-3 ml-1" />
                  </Badge>
                ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave}
            disabled={updateTagsMutation.isPending}
          >
            {updateTagsMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Componente para exibir badges de tags inline
interface TagBadgesProps {
  tags: Tag[];
  maxVisible?: number;
  size?: "sm" | "default";
}

export function TagBadges({ tags, maxVisible = 2, size = "sm" }: TagBadgesProps) {
  if (!tags || tags.length === 0) return null;

  const visibleTags = tags.slice(0, maxVisible);
  const hiddenCount = tags.length - maxVisible;
  
  const badgeClasses = size === "sm" ? "text-[10px] px-1.5 py-0 h-4" : "text-xs";

  return (
    <div className="flex flex-wrap gap-1">
      {visibleTags.map(tag => (
        <Badge
          key={tag.id}
          style={{ 
            backgroundColor: `${tag.color}20`,
            color: tag.color,
            borderColor: tag.color
          }}
          variant="outline"
          className={badgeClasses}
        >
          {tag.name}
        </Badge>
      ))}
      {hiddenCount > 0 && (
        <Badge variant="secondary" className={badgeClasses}>
          +{hiddenCount}
        </Badge>
      )}
    </div>
  );
}

// Componente de filtro por tag
interface TagFilterProps {
  selectedTagId: string | null;
  onTagSelect: (tagId: string | null) => void;
}

export function TagFilter({ selectedTagId, onTagSelect }: TagFilterProps) {
  const { data: tags = [], isLoading } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  if (isLoading || tags.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
      <Button
        variant={selectedTagId === null ? "default" : "outline"}
        size="sm"
        onClick={() => onTagSelect(null)}
        className="flex-shrink-0"
      >
        Todas
      </Button>
      {tags.map(tag => (
        <Button
          key={tag.id}
          variant={selectedTagId === tag.id ? "default" : "outline"}
          size="sm"
          onClick={() => onTagSelect(selectedTagId === tag.id ? null : tag.id)}
          className="flex-shrink-0"
          style={selectedTagId === tag.id ? {
            backgroundColor: tag.color,
            borderColor: tag.color,
          } : {
            borderColor: tag.color,
            color: tag.color,
          }}
        >
          <div
            className="w-2 h-2 rounded-full mr-1.5"
            style={{ backgroundColor: selectedTagId === tag.id ? 'white' : tag.color }}
          />
          {tag.name}
        </Button>
      ))}
    </div>
  );
}
