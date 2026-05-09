import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Plus, Search, MessageSquare, Clock, CheckCircle, XCircle, Ticket as TicketIcon, Loader2, BookOpen, Mail, Phone, LifeBuoy, ExternalLink } from 'lucide-react';
import type { Ticket } from '../../types/tickets';
import { apiClient } from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { 
  color: string; 
  bg: string; 
  label: string;
  icon: React.ElementType;
}> = {
  open: { 
    color: 'text-blue-600', 
    bg: 'bg-blue-50', 
    label: 'Aberto',
    icon: TicketIcon
  },
  in_progress: { 
    color: 'text-amber-600', 
    bg: 'bg-amber-50', 
    label: 'Em andamento',
    icon: Clock
  },
  resolved: { 
    color: 'text-emerald-600', 
    bg: 'bg-emerald-50', 
    label: 'Resolvido',
    icon: CheckCircle
  },
  closed: { 
    color: 'text-gray-600', 
    bg: 'bg-gray-50', 
    label: 'Fechado',
    icon: XCircle
  },
};

export const UserTicketList: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await apiClient.get('/tickets');
        setTickets(data.items);
      } catch (err: any) {
        setError(err?.response?.data?.message ?? 'Erro ao carregar chamados.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = tickets.filter(t =>
    !search || 
    t.subject.toLowerCase().includes(search.toLowerCase()) || 
    `#${t.id}`.includes(search)
  );

  // Ordenar: abertos primeiro, depois por data
  const sorted = [...filtered].sort((a, b) => {
    const statusOrder = { open: 0, in_progress: 1, resolved: 2, closed: 3 };
    if (statusOrder[a.status as keyof typeof statusOrder] !== statusOrder[b.status as keyof typeof statusOrder]) {
      return statusOrder[a.status as keyof typeof statusOrder] - statusOrder[b.status as keyof typeof statusOrder];
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-muted-foreground text-sm">Carregando chamados...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-6">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="w-7 h-7 text-destructive" />
        </div>
        <p className="text-destructive text-center">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LifeBuoy className="w-6 h-6 text-primary" />
            Central de Suporte
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tire dúvidas, reporte problemas e acompanhe seus chamados
          </p>
        </div>
        
        <Button asChild>
          <Link href="/tickets/new">
            <Plus className="w-4 h-4 mr-2" />
            Novo Chamado
          </Link>
        </Button>
      </div>

      {/* Cards de Ajuda Rápida */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-sm mb-1">Documentação</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  Guias, tutoriais e FAQ para utilizar todas as funcionalidades
                </p>
                <a 
                  href="https://docs.agentezap.online" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Acessar documentação
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center flex-shrink-0">
                <Mail className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-sm mb-1">Contato Direto</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  Precisa de ajuda imediata? Entre em contato com nossa equipe
                </p>
                <a 
                  href="mailto:suporte@agentezap.online" 
                  className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  suporte@agentezap.online
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar chamados..."
          className="pl-10"
        />
      </div>

      {/* Lista */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-muted-foreground" />
          Meus Chamados
          <span className="text-sm font-normal text-muted-foreground">({sorted.length})</span>
        </h2>
      </div>
      
      {sorted.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Ticket className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-lg font-medium text-foreground mb-1">
            {search ? 'Nenhum resultado encontrado' : 'Nenhum chamado ainda'}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            {search 
              ? 'Tente buscar com outros termos' 
              : 'Crie seu primeiro chamado para receber suporte'}
          </p>
          {!search && (
            <Button asChild>
              <Link href="/tickets/new">
                <Plus className="w-4 h-4 mr-2" />
                Criar primeiro chamado
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(ticket => {
            const status = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
            const StatusIcon = status.icon;
            
            return (
              <Link 
                key={ticket.id} 
                href={`/tickets/${ticket.id}`}
                className="block"
              >
                <div className={cn(
                  "group p-4 rounded-xl border bg-card transition-all",
                  "hover:shadow-md hover:border-primary/20"
                )}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground">
                          #{ticket.id}
                        </span>
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                          status.bg,
                          status.color
                        )}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                        
                        {ticket.unreadCountUser > 0 && (
                          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 bg-primary text-primary-foreground rounded-full text-xs font-semibold">
                            {ticket.unreadCountUser}
                          </span>
                        )}
                      </div>
                      
                      <h3 className="font-medium text-foreground truncate mb-1">
                        {ticket.subject}
                      </h3>
                      
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {ticket.lastMessagePreview || 'Sem mensagens'}
                      </p>
                    </div>
                    
                    <div className="text-right flex-shrink-0">
                      <time className="text-xs text-muted-foreground">
                        {ticket.lastMessageAt 
                          ? new Date(ticket.lastMessageAt).toLocaleDateString('pt-BR', { 
                              day: '2-digit', 
                              month: 'short' 
                            })
                          : new Date(ticket.createdAt).toLocaleDateString('pt-BR', { 
                              day: '2-digit', 
                              month: 'short' 
                            })
                        }
                      </time>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UserTicketList;
