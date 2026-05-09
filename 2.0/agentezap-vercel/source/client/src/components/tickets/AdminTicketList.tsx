import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { apiClient } from '../../lib/api';
import type { Ticket, TicketStatus, TicketPriority } from '../../types/tickets';

export const AdminTicketList: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (status) params.status = status;
      if (priority) params.priority = priority;
      const { data } = await apiClient.get('/admin/tickets', { params });
      setTickets(data.items);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Erro ao carregar chamados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [status, priority]);

  const getStatusLabel = (s: string) => ({
    open: 'Aberto',
    in_progress: 'Em andamento',
    resolved: 'Resolvido',
    closed: 'Fechado'
  })[s] || s;

  const getStatusColor = (s: string) => ({
    open: '#28a745',
    in_progress: '#ffc107',
    resolved: '#17a2b8',
    closed: '#6c757d'
  })[s] || '#6c757d';

  const getPriorityLabel = (p: string) => ({
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
    urgent: 'Urgente'
  })[p] || p;

  const assignToMe = async (ticketId: number) => {
    try {
      await apiClient.patch(`/admin/tickets/${ticketId}`, { assignedAdminId: 'me' });
      fetchTickets();
    } catch (err) {
      alert('Erro ao assumir chamado.');
    }
  };

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}>Carregando...</div>;
  if (error) return <div style={{ padding: 20, color: '#dc3545' }}>{error}</div>;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
      <h2 style={{ marginBottom: 20 }}>Painel de Chamados</h2>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <select
          value={status}
          onChange={e => setStatus(e.target.value as TicketStatus | '')}
          style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
        >
          <option value="">Todos status</option>
          <option value="open">Aberto</option>
          <option value="in_progress">Em andamento</option>
          <option value="resolved">Resolvido</option>
          <option value="closed">Fechado</option>
        </select>

        <select
          value={priority}
          onChange={e => setPriority(e.target.value as TicketPriority | '')}
          style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
        >
          <option value="">Todas prioridades</option>
          <option value="low">Baixa</option>
          <option value="medium">Média</option>
          <option value="high">Alta</option>
          <option value="urgent">Urgente</option>
        </select>

        <button
          onClick={fetchTickets}
          style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Atualizar
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tickets.map(t => (
          <div
            key={t.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 16,
              border: '1px solid #dee2e6',
              borderRadius: 8,
              backgroundColor: t.unreadCountAdmin > 0 ? '#e3f2fd' : 'white'
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  <Link to={`/admin/tickets/${t.id}`} style={{ color: '#007bff', textDecoration: 'none' }}>
                    #{t.id} - {t.subject}
                  </Link>
                </h3>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 500,
                  backgroundColor: getStatusColor(t.status),
                  color: t.status === 'in_progress' ? '#212529' : 'white'
                }}>
                  {getStatusLabel(t.status)}
                </span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  backgroundColor: t.priority === 'urgent' ? '#dc3545' : t.priority === 'high' ? '#fd7e14' : '#6c757d',
                  color: 'white'
                }}>
                  {getPriorityLabel(t.priority)}
                </span>
              </div>
              <div style={{ fontSize: 14, color: '#6c757d' }}>
                <strong>Cliente:</strong> {(t as any).userName || 'N/A'} |
                <strong> Admin:</strong> {(t as any).adminName || 'Não atribuído'} |
                <strong> Última msg:</strong> {t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleString('pt-BR') : '—'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {t.unreadCountAdmin > 0 && (
                <span style={{
                  padding: '4px 10px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600
                }}>
                  {t.unreadCountAdmin} não {t.unreadCountAdmin === 1 ? 'lida' : 'lid'}
                </span>
              )}
              {!t.assignedAdminId && (
                <button
                  onClick={() => assignToMe(t.id)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 13
                  }}
                >
                  Assumir
                </button>
              )}
              <Link
                to={`/admin/tickets/${t.id}`}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: 4,
                  fontSize: 13
                }}
              >
                Ver
              </Link>
            </div>
          </div>
        ))}
      </div>

      {tickets.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#6c757d' }}>
          Nenhum chamado encontrado com os filtros selecionados.
        </div>
      )}
    </div>
  );
};
