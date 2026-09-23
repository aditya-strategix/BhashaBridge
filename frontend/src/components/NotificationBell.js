'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Bell, X, Check, Building2, Clock } from 'lucide-react';
import api from '../services/api';
import useAuthStore from '../stores/authStore';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

// ---- tiny helper ----
function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationBell() {
  const { user } = useAuthStore();
  const [invitations, setInvitations] = useState([]);
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState({}); // { [token]: 'accepting'|'declining' }
  const [toast, setToast] = useState(null); // { message, type }
  const dropdownRef = useRef(null);
  const socketRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchInvites = useCallback(async () => {
    try {
      const res = await api.get('/organizations/my-invites');
      setInvitations(res.data.invitations || []);
    } catch (_) {
      // silently fail
    }
  }, []);

  // Poll every 30 seconds for new invites
  useEffect(() => {
    if (!user) return;
    fetchInvites();
    const interval = setInterval(fetchInvites, 30000);
    return () => clearInterval(interval);
  }, [user, fetchInvites]);

  // Real-time socket listener
  useEffect(() => {
    if (!user) return;

    const sock = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = sock;

    sock.on('connect', () => {
      sock.emit('user:register', { userId: user.id });
    });

    sock.on('notification:invite', (invite) => {
      setInvitations(prev => {
        // avoid duplicates
        if (prev.some(i => i.token === invite.token)) return prev;
        return [{ ...invite, organization: { name: invite.organizationName, owner: { name: invite.invitedBy } } }, ...prev];
      });
      showToast(`You have a new org invite from ${invite.invitedBy}!`, 'info');
    });

    sock.on('notification:org_deleted', ({ organizationName }) => {
      showToast(`"${organizationName}" was deleted by the host.`, 'error');
    });

    return () => {
      sock.disconnect();
    };
  }, [user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleAccept = async (token) => {
    const inv = invitations.find(i => i.token === token);
    const orgName = inv?.organization?.name || 'the organization';
    setProcessing(p => ({ ...p, [token]: 'accepting' }));
    try {
      await api.post(`/organizations/invite/${token}/accept`);
      setInvitations(prev => prev.filter(i => i.token !== token));
      showToast(`You joined "${orgName}" successfully!`, 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to accept invitation', 'error');
    } finally {
      setProcessing(p => { const n = { ...p }; delete n[token]; return n; });
    }
  };

  const handleDecline = async (token) => {
    const inv = invitations.find(i => i.token === token);
    const orgName = inv?.organization?.name || 'the organization';
    setProcessing(p => ({ ...p, [token]: 'declining' }));
    try {
      await api.post(`/organizations/invite/${token}/decline`);
      setInvitations(prev => prev.filter(i => i.token !== token));
      showToast(`Invitation from "${orgName}" declined.`, 'info');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to decline invitation', 'error');
    } finally {
      setProcessing(p => { const n = { ...p }; delete n[token]; return n; });
    }
  };

  const count = invitations.length;

  return (
    <>
      {/* ===== RICH TOAST ===== */}
      {toast && (() => {
        const cfg = {
          success: {
            icon: <Check size={18} strokeWidth={2.5} />,
            title: 'Success',
            accent: '#10b981',
            accentBg: 'rgba(16,185,129,0.12)',
            accentBorder: 'rgba(16,185,129,0.3)',
            iconBg: 'rgba(16,185,129,0.2)',
          },
          error: {
            icon: <X size={18} strokeWidth={2.5} />,
            title: 'Removed',
            accent: '#ef4444',
            accentBg: 'rgba(239,68,68,0.1)',
            accentBorder: 'rgba(239,68,68,0.3)',
            iconBg: 'rgba(239,68,68,0.18)',
          },
          info: {
            icon: <Bell size={18} strokeWidth={2} />,
            title: 'Notification',
            accent: '#60a5fa',
            accentBg: 'rgba(96,165,250,0.1)',
            accentBorder: 'rgba(96,165,250,0.25)',
            iconBg: 'rgba(96,165,250,0.18)',
          },
        }[toast.type] || {};

        return (
          <div style={{
            position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 99999,
            width: 320,
            background: 'linear-gradient(145deg, rgba(15,23,42,0.97), rgba(30,41,59,0.97))',
            border: `1px solid ${cfg.accentBorder}`,
            borderRadius: '16px',
            boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)`,
            backdropFilter: 'blur(20px)',
            animation: 'slideInRight 0.35s cubic-bezier(0.175,0.885,0.32,1.275)',
            overflow: 'hidden',
          }}>
            {/* Body */}
            <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'flex-start', padding: '1rem 1rem 0.85rem' }}>
              {/* Icon */}
              <div style={{
                width: 38, height: 38, borderRadius: '10px', flexShrink: 0,
                background: cfg.iconBg, border: `1px solid ${cfg.accentBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: cfg.accent,
              }}>
                {cfg.icon}
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 0.2rem', fontWeight: 700, color: '#f1f5f9', fontSize: '0.9rem', letterSpacing: '0.01em' }}>
                  {cfg.title}
                </p>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.82rem', lineHeight: 1.45 }}>
                  {toast.message}
                </p>
              </div>

              {/* Close button */}
              <button
                onClick={() => setToast(null)}
                style={{
                  background: 'none', border: 'none', color: '#4b5563',
                  cursor: 'pointer', padding: '0.1rem', flexShrink: 0,
                  display: 'flex', alignItems: 'center',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#9ca3af'}
                onMouseLeave={e => e.currentTarget.style.color = '#4b5563'}
              >
                <X size={14} />
              </button>
            </div>

            {/* Animated progress bar */}
            <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                background: `linear-gradient(90deg, ${cfg.accent}, ${cfg.accent}88)`,
                animation: 'toastProgress 3.5s linear forwards',
                borderRadius: '0 0 2px 2px',
              }} />
            </div>
          </div>
        );
      })()}

      {/* Bell button + dropdown */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            position: 'relative', background: open ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.07)',
            border: `1px solid ${open ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: open ? '#60a5fa' : '#e2e8f0', padding: '0.45rem 0.55rem', borderRadius: '8px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s'
          }}
          title="Invitations"
        >
          <Bell size={18} />
          {count > 0 && (
            <span style={{
              position: 'absolute', top: -6, right: -6,
              background: '#ef4444', color: 'white', borderRadius: '999px',
              fontSize: '0.65rem', fontWeight: 800, minWidth: 18, height: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #0f172a', padding: '0 3px'
            }}>
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        {open && (
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 10px)',
            width: 360, maxHeight: 480, overflowY: 'auto',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.98), rgba(30,41,59,0.98))',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px', zIndex: 9998,
            boxShadow: '0 20px 60px -10px rgba(0,0,0,0.7), 0 0 0 1px rgba(96,165,250,0.05)',
            backdropFilter: 'blur(20px)',
          }}>
            {/* Header */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Bell size={16} style={{ color: '#60a5fa' }} />
                <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.95rem' }}>Organization Invitations</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {count > 0 && (
                  <span style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '999px', padding: '0.1rem 0.5rem', fontSize: '0.72rem', fontWeight: 700 }}>
                    {count} pending
                  </span>
                )}
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            {count === 0 ? (
              <div style={{ padding: '2.5rem 1.25rem', textAlign: 'center', color: '#6b7280' }}>
                <Bell size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>No pending invitations</p>
              </div>
            ) : (
              <div style={{ padding: '0.5rem' }}>
                {invitations.map(inv => {
                  const state = processing[inv.token];
                  const isLoading = !!state;
                  return (
                    <div key={inv.token} style={{
                      padding: '1rem', borderRadius: '12px', marginBottom: '0.35rem',
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                      transition: 'background 0.15s',
                    }}>
                      {/* Org info */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.85rem' }}>
                        <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Building2 size={18} style={{ color: '#60a5fa' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontWeight: 700, color: '#f1f5f9', fontSize: '0.92rem', marginBottom: '0.2rem' }}>
                            {inv.organization?.name || inv.organizationName}
                          </p>
                          <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.8rem' }}>
                            Invited by <strong style={{ color: '#cbd5e1' }}>{inv.organization?.owner?.name || inv.invitedBy}</strong>
                          </p>
                          <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Clock size={11} /> {timeAgo(inv.createdAt)}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleAccept(inv.token)}
                          disabled={isLoading}
                          style={{
                            flex: 1, padding: '0.55rem', borderRadius: '8px',
                            background: isLoading ? 'rgba(16,185,129,0.07)' : 'rgba(16,185,129,0.15)',
                            border: '1px solid rgba(16,185,129,0.3)',
                            color: '#34d399', fontWeight: 700, cursor: isLoading ? 'not-allowed' : 'pointer',
                            fontSize: '0.82rem', transition: 'all 0.15s', opacity: isLoading ? 0.6 : 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem'
                          }}
                        >
                          {state === 'accepting' ? 'Joining…' : <><Check size={13} /> Accept</>}
                        </button>
                        <button
                          onClick={() => handleDecline(inv.token)}
                          disabled={isLoading}
                          style={{
                            flex: 1, padding: '0.55rem', borderRadius: '8px',
                            background: isLoading ? 'rgba(239,68,68,0.04)' : 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            color: '#f87171', fontWeight: 700, cursor: isLoading ? 'not-allowed' : 'pointer',
                            fontSize: '0.82rem', transition: 'all 0.15s', opacity: isLoading ? 0.6 : 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem'
                          }}
                        >
                          {state === 'declining' ? 'Declining…' : <><X size={13} /> Decline</>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer hint */}
            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#4b5563' }}>Invitations expire after 7 days</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
