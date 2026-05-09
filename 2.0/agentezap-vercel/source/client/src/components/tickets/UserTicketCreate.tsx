import React, { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { apiClient } from '../../lib/api';
import type { TicketPriority } from '../../types/tickets';

const priorities: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' }
];

const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s' };
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' };

export const UserTicketCreate: React.FC = () => {
  const [, setLocation] = useLocation();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (subject.trim().length < 3) { setError('Assunto deve ter pelo menos 3 caracteres.'); return; }
    try {
      setLoading(true);
      const { data } = await apiClient.post('/tickets', { subject, description, priority });
      setLocation(`/tickets/${data.ticket.id}`);
    } catch (err: any) { setError(err?.response?.data?.message ?? 'Erro ao criar ticket.'); } finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Link to="/tickets" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#666', textDecoration: 'none', fontSize: 14, marginBottom: 20 }}
        onMouseEnter={(e: any) => e.currentTarget.style.color = '#1a1a1a'} onMouseLeave={(e: any) => e.currentTarget.style.color = '#666'}>
        ← Voltar aos chamados
      </Link>

      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '28px 24px' }}>
        <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 600, color: '#1a1a1a' }}>Abrir Novo Chamado</h2>

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Assunto *</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} maxLength={180} required style={inputStyle}
              onFocus={e => e.currentTarget.style.borderColor = '#10b981'} onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Descrição</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={6} placeholder="Descreva seu problema..."
              style={{ ...inputStyle, resize: 'vertical' as const, minHeight: 120 }}
              onFocus={e => e.currentTarget.style.borderColor = '#10b981'} onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Prioridade</label>
            <select value={priority} onChange={e => setPriority(e.target.value as TicketPriority)} style={inputStyle}
              onFocus={e => e.currentTarget.style.borderColor = '#10b981'} onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}>
              {priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {error && (
            <div style={{ color: '#ef4444', marginBottom: 16, padding: '10px 12px', backgroundColor: '#fef2f2', borderRadius: 8, fontSize: 14, border: '1px solid #fecaca' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px 24px', backgroundColor: loading ? '#9ca3af' : '#10b981', color: 'white', border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 500, transition: 'background-color 0.15s' }}>
            {loading ? 'Criando...' : 'Criar Chamado'}
          </button>
        </form>
      </div>
    </div>
  );
};
