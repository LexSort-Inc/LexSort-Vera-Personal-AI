import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface LabConfig {
  repo_url: string;
  branch: string;
  agent_count: number;
  github_token: string;
  repo_owner: string;
  repo_name: string;
  machine_id: string;
}

interface LabStatus {
  configured: boolean;
  connected: boolean;
  agent_count: number;
  active_agents: number;
  open_tickets: number;
  claimed_tickets: number;
  completed_tickets: number;
}

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  platform: string;
  claimed_by: string | null;
  created_at: string;
  updated_at: string;
}

export default function TeamLab() {
  const [status, setStatus] = useState<LabStatus | null>(null);
  const [_config, setConfig] = useState<LabConfig | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [editConfig, setEditConfig] = useState<LabConfig | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPlatform, setNewPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStatus = async () => {
    try {
      const s = await invoke<LabStatus>('lab_get_status');
      setStatus(s);
    } catch { }
  };

  const loadConfig = async () => {
    try {
      const c = await invoke<LabConfig>('lab_get_config');
      setConfig(c);
      setEditConfig(c);
    } catch { }
  };

  const loadTickets = async () => {
    try {
      const t = await invoke<Ticket[]>('lab_list_tickets');
      setTickets(t);
    } catch { }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadStatus(), loadConfig(), loadTickets()]);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { const id = setInterval(loadStatus, 5000); return () => clearInterval(id); }, []);

  const handleSaveConfig = async () => {
    if (!editConfig) return;
    try {
      await invoke('lab_save_config', { config: editConfig });
      await loadConfig();
      await loadStatus();
      setError('');
    } catch (e: any) { setError(String(e)); }
  };

  const handleCreateTicket = async () => {
    if (!newTitle.trim()) return;
    try {
      await invoke('lab_create_ticket', { title: newTitle, description: newDesc, platform: newPlatform });
      setNewTitle('');
      setNewDesc('');
      await loadTickets();
      await loadStatus();
    } catch (e: any) { setError(String(e)); }
  };

  const handleClaimTicket = async (id: string) => {
    try {
      await invoke('lab_claim_ticket', { ticketId: id });
      await loadTickets();
      await loadStatus();
    } catch (e: any) { setError(String(e)); }
  };

  const handleStartWork = async (id: string) => {
    try {
      await invoke('lab_start_work', { ticketId: id });
      await loadTickets();
      await loadStatus();
    } catch (e: any) { setError(String(e)); }
  };

  const handleCompleteTicket = async (id: string) => {
    try {
      await invoke('lab_complete_ticket', { ticketId: id });
      await loadTickets();
      await loadStatus();
    } catch (e: any) { setError(String(e)); }
  };

  const handleInitRepo = async () => {
    try {
      await invoke('lab_init_repo');
      await loadStatus();
    } catch (e: any) { setError(String(e)); }
  };

  const handlePushPR = async () => {
    try {
      await invoke('lab_push_tickets');
    } catch (e: any) { setError(String(e)); }
  };

  const handleStopAgents = async () => {
    try {
      await invoke('lab_stop_agents');
      await loadStatus();
    } catch (e: any) { setError(String(e)); }
  };

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = { open: '#f97316', claimed: '#3b82f6', in_progress: '#a855f7', done: '#22c55e', cancelled: '#6b7280' };
    return { background: (colors[s] || '#6b7280') + '22', color: colors[s] || '#6b7280', border: `1px solid ${(colors[s] || '#6b7280')}44` };
  };

  if (loading) return <div className="boot-screen"><div className="spinner" /><p>Loading Team Lab...</p></div>;

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {error && <div style={{ padding: '8px 12px', background: '#ef444422', border: '1px solid #ef444444', borderRadius: '8px', color: '#ef4444', fontSize: '13px' }}>{error}</div>}

      {/* Status Bar */}
      {status && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { label: 'Status', value: status.configured ? (status.connected ? 'Connected' : 'Configured') : 'Not Configured', color: status.connected ? '#22c55e' : status.configured ? '#f97316' : '#6b7280' },
            { label: 'Agents', value: `${status.active_agents}/${status.agent_count}` },
            { label: 'Open', value: status.open_tickets },
            { label: 'In Progress', value: status.claimed_tickets },
            { label: 'Done', value: status.completed_tickets },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', minWidth: '100px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{stat.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: (stat as any).color || 'var(--text)' }}>{(stat as any).color ? <span style={{ color: (stat as any).color }}>●</span> : null} {stat.value}</div>
            </div>
          ))}
          <button onClick={loadAll} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px' }}>↻ Refresh</button>
        </div>
      )}

      {/* Config Section */}
      {editConfig && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>⚙️ Lab Configuration</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {['repo_url', 'branch', 'agent_count', 'github_token', 'repo_owner', 'repo_name'].map(field => (
              <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{field.replace(/_/g, ' ')}</label>
                <input value={(editConfig as any)[field] ?? ''} onChange={e => setEditConfig({ ...editConfig, [field]: field === 'agent_count' ? Number(e.target.value) : e.target.value })} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button onClick={handleSaveConfig} style={{ background: 'var(--accent)', border: 'none', borderRadius: '6px', padding: '6px 14px', color: '#fff', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>Save Config</button>
            <button onClick={handleInitRepo} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 14px', color: 'var(--text)', fontSize: '12px', cursor: 'pointer' }}>Clone Repo</button>
            <button onClick={handleStopAgents} style={{ background: 'transparent', border: '1px solid #ef4444', borderRadius: '6px', padding: '6px 14px', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}>Stop Agents</button>
          </div>
        </div>
      )}

      {/* Create Ticket */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>📋 Create Ticket</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input placeholder="Title" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ flex: '2', minWidth: '200px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }} />
          <input placeholder="Description" value={newDesc} onChange={e => setNewDesc(e.target.value)} style={{ flex: '3', minWidth: '200px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }} />
          <select value={newPlatform} onChange={e => setNewPlatform(e.target.value)} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}>
            <option value="all">All</option>
            <option value="windows">Windows</option>
            <option value="macos">macOS</option>
            <option value="linux">Linux</option>
          </select>
          <button onClick={handleCreateTicket} style={{ background: 'var(--accent)', border: 'none', borderRadius: '6px', padding: '6px 14px', color: '#fff', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>Create</button>
        </div>
      </div>

      {/* Tickets List */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700 }}>🎫 Tickets ({tickets.length})</span>
          <button onClick={handlePushPR} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 12px', color: 'var(--text)', fontSize: '11px', cursor: 'pointer' }}>Create PR</button>
        </div>
        {tickets.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No tickets yet. Create one above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tickets.map(ticket => (
              <div key={ticket.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{ticket.title}</span>
                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', ...statusBadge(ticket.status) }}>{ticket.status.replace('_', ' ')}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>{ticket.platform}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.description}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{ticket.claimed_by ? `Claimed by: ${ticket.claimed_by}` : 'Unclaimed'}</div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {ticket.status === 'open' && <button onClick={() => handleClaimTicket(ticket.id)} style={{ background: 'transparent', border: '1px solid #3b82f6', borderRadius: '5px', padding: '3px 8px', color: '#3b82f6', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>Claim</button>}
                  {ticket.status === 'claimed' && <button onClick={() => handleStartWork(ticket.id)} style={{ background: 'transparent', border: '1px solid #a855f7', borderRadius: '5px', padding: '3px 8px', color: '#a855f7', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>Start</button>}
                  {ticket.status === 'in_progress' && <button onClick={() => handleCompleteTicket(ticket.id)} style={{ background: 'transparent', border: '1px solid #22c55e', borderRadius: '5px', padding: '3px 8px', color: '#22c55e', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>Complete</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
