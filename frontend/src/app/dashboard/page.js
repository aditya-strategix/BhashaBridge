'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  PlusCircle, Video, Link as LinkIcon, Clock, Users,
  CalendarCheck2, LogOut, Trash2, User as UserIcon, Copy, Check
} from 'lucide-react';
import useAuthStore from '../../stores/authStore';
import api from '../../services/api';
import styles from './dashboard.module.css';
import NotificationBell from '../../components/NotificationBell';

// ------- constants -------
const STATE_CFG = {
  ONGOING:   { label: 'Live',      bg: 'rgba(52,211,153,0.15)',  color: '#34d399' },
  SCHEDULED: { label: 'Scheduled', bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
  COMPLETED: { label: 'Ended',     bg: 'rgba(156,163,175,0.15)', color: '#9ca3af' },
};

const ROLE_CFG = {
  HOST:        { label: 'Host',        color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  COHOST:      { label: 'Co-Host',     color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  PARTICIPANT: { label: 'Participant', color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
};

// ------- tiny components -------
function StateBadge({ state }) {
  const cfg = STATE_CFG[state] || STATE_CFG.SCHEDULED;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem',
      borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.05em',
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}44`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
      {cfg.label}
    </span>
  );
}

function RoleBadge({ role }) {
  const cfg = ROLE_CFG[role] || ROLE_CFG.PARTICIPANT;
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem',
      borderRadius: '999px', textTransform: 'uppercase',
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}44`,
    }}>
      {cfg.label}
    </span>
  );
}

// ------- themed modals -------
const MODAL_STYLE = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  },
  box: {
    background: 'linear-gradient(135deg,rgba(30,41,59,0.98),rgba(15,23,42,0.98))',
    padding: '2rem', borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5),0 0 40px rgba(96,165,250,0.15)',
    maxWidth: '420px', width: '90%',
  },
};

function AlertModal({ message, onClose }) {
  return (
    <div style={MODAL_STYLE.overlay}>
      <div style={MODAL_STYLE.box}>
        <h3 style={{ margin: '0 0 1rem', color: '#f8fafc', fontSize: '1.1rem' }}>Notice</h3>
        <p style={{ margin: '0 0 1.5rem', color: '#cbd5e1', lineHeight: 1.6 }}>{message}</p>
        <button onClick={onClose} style={{ width: '100%', padding: '0.875rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '1rem' }}>OK</button>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, onConfirm, onClose }) {
  return (
    <div style={MODAL_STYLE.overlay}>
      <div style={MODAL_STYLE.box}>
        <h3 style={{ margin: '0 0 1rem', color: '#f8fafc', fontSize: '1.1rem' }}>{title || 'Are you sure?'}</h3>
        <p style={{ margin: '0 0 1.5rem', color: '#cbd5e1', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '0.875rem', background: 'transparent', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '0.875rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ------- main component -------
function DashboardContent() {
  const { user, initialize, logout } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Meeting state
  const [meetings, setMeetings] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [joinLink, setJoinLink] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [scheduledMeetingCode, setScheduledMeetingCode] = useState(null);

  // Organization state
  const [organizations, setOrganizations] = useState([]);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  // Per-org invite email refs (to avoid shared state bleed)
  const inviteEmailRefs = useRef({});

  // Profile state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLanguage, setEditLanguage] = useState('');

  // Modal state
  const [alertMessage, setAlertMessage] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { title, message, onConfirm }
  const [showAllMembersOrg, setShowAllMembersOrg] = useState(null); // org object
  const [transcriptModal, setTranscriptModal] = useState(null); // { loading, entries }

  // Copy feedback
  const [copiedCode, setCopiedCode] = useState(null);

  // Initialize auth
  useEffect(() => { initialize(); }, [initialize]);

  // Handle ?joined=true redirect from invite page
  useEffect(() => {
    if (searchParams.get('joined') === 'true') {
      setAlertMessage('You have successfully joined the organization!');
      // Clean URL without reload
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    try {
      const [meetRes, orgRes] = await Promise.all([
        api.get('/meetings'),
        api.get('/organizations/my'),
      ]);
      setMeetings(meetRes.data.meetings || []);
      setOrganizations(orgRes.data.organizations || []);
    } catch (err) {
      console.error('Failed to fetch data', err);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      const t = setTimeout(() => {
        if (!useAuthStore.getState().user) router.push('/login');
      }, 500);
      return () => clearTimeout(t);
    }
    fetchData();
  }, [user, router, fetchData]);

  // ------- copy helper -------
  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  // ------- meeting handlers -------
  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const payload = { title: newTitle || 'Untitled Meeting' };

      if (scheduledTime) {
        let parsed = new Date(scheduledTime);
        if (isNaN(parsed.getTime())) {
          const parts = scheduledTime.match(/(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})/);
          if (parts) parsed = new Date(`${parts[3]}-${parts[2]}-${parts[1]}T${parts[4]}:${parts[5]}`);
        }
        payload.startTime = isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
        payload.state = 'SCHEDULED';
      } else {
        payload.state = 'ONGOING';
      }

      if (selectedOrgId) payload.organizationId = selectedOrgId;

      const res = await api.post('/meetings', payload);
      const link = res.data.meeting.meetingLink;

      if (payload.state === 'ONGOING') {
        router.push(`/meeting/${link}`);
      } else {
        setScheduledMeetingCode(link);
        setNewTitle('');
        setScheduledTime('');
        setSelectedOrgId('');
        fetchData();
      }
    } catch (err) {
      setAlertMessage(err.response?.data?.error || 'Failed to create meeting.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinMeeting = (e) => {
    e.preventDefault();
    if (!joinLink.trim()) return;
    router.push(`/meeting/${joinLink.trim()}`);
  };

  const handleDeleteMeeting = (meetingId) => {
    setConfirmModal({
      title: 'Delete Meeting',
      message: 'This will permanently delete all chats, transcripts, and analytics for this meeting.',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.delete(`/meetings/${meetingId}`);
          fetchData();
        } catch (err) {
          setAlertMessage('Failed to delete meeting.');
        }
      },
    });
  };

  
  const handleExportTranscript = () => {
    if (!transcriptModal || !transcriptModal.entries || transcriptModal.entries.length === 0) return;
    const lines = transcriptModal.entries.map(t => {
      const time = new Date(t.timestamp).toLocaleTimeString();
      const speaker = t.speaker?.name || 'Unknown';
      return `[${time}] ${speaker}: ${t.originalText}`;
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Meeting_Transcript_${transcriptModal.link}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleViewTranscript = async (meetingLink) => {
    setTranscriptModal({ loading: true, entries: [], link: meetingLink });
    try {
      const res = await api.get(`/meetings/${meetingLink}/transcript`);
      setTranscriptModal({ loading: false, entries: res.data.transcript || [], link: meetingLink });
    } catch (err) {
      setAlertMessage(err.response?.data?.error || 'Failed to load transcript.');
      setTranscriptModal(null);
    }
  };

  // ------- org handlers -------
  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    try {
      await api.post('/organizations', { name: newOrgName.trim() });
      setNewOrgName('');
      setShowOrgModal(false);
      fetchData();
    } catch (err) {
      setAlertMessage(err.response?.data?.error || 'Failed to create organization.');
    }
  };

  const handleRegenerateCode = (orgId) => {
    setConfirmModal({
      title: 'Regenerate Access Code',
      message: 'The old code will stop working immediately. All new members must use the new code.',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.post(`/organizations/${orgId}/regenerate-code`);
          fetchData();
        } catch (err) {
          setAlertMessage('Failed to regenerate code.');
        }
      },
    });
  };

  const handleInviteMembers = async (e, orgId) => {
    e.preventDefault();
    const input = inviteEmailRefs.current[orgId];
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) return;
    const emails = raw.split(',').map(s => s.trim()).filter(Boolean);
    try {
      await api.post(`/organizations/${orgId}/invite`, { emails });
      input.value = '';
      setAlertMessage(`Invitation${emails.length > 1 ? 's' : ''} sent successfully!`);
      fetchData();
    } catch (err) {
      setAlertMessage(err.response?.data?.error || 'Failed to send invitations.');
    }
  };

  const handleLeaveOrg = (orgId, orgName) => {
    setConfirmModal({
      title: 'Leave Organization',
      message: `Are you sure you want to leave "${orgName}"?`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.delete(`/organizations/${orgId}/leave`);
          fetchData();
        } catch (err) {
          setAlertMessage(err.response?.data?.error || 'Failed to leave organization.');
        }
      },
    });
  };

  const handleToggleOrgCoHost = async (orgId, targetUserId, isCurrentlyCoHost) => {
    try {
      if (isCurrentlyCoHost) {
        await api.delete(`/organizations/${orgId}/cohost/${targetUserId}`);
      } else {
        await api.post(`/organizations/${orgId}/cohost`, { userId: targetUserId });
      }
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to toggle co-host');
    }
  };

  const handleRemoveMember = (orgId, memberId, memberName) => {
    setConfirmModal({
      title: 'Remove Member',
      message: `Remove "${memberName}" from this organization? They will lose access to all org meetings.`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.delete(`/organizations/${orgId}/members/${memberId}`);
          fetchData();
          // Update the "view all" modal if open
          setShowAllMembersOrg(prev => {
            if (!prev || prev.id !== orgId) return prev;
            return { ...prev, users: prev.users.filter(u => u.id !== memberId) };
          });
        } catch (err) {
          setAlertMessage(err.response?.data?.error || 'Failed to remove member.');
        }
      },
    });
  };

  const handleDeleteOrg = (orgId, orgName) => {
    setConfirmModal({
      title: 'Delete Organization',
      message: `Permanently delete "${orgName}"? All members will lose access and all pending invitations will be cancelled. This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.delete(`/organizations/${orgId}`);
          fetchData();
        } catch (err) {
          setAlertMessage(err.response?.data?.error || 'Failed to delete organization.');
        }
      },
    });
  };

  // ------- profile handler -------
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
      const res = await api.put('/auth/profile', { name: editName, preferredLanguage: editLanguage });
      useAuthStore.getState().updateUser(res.data.token, res.data.user);
      setShowProfileModal(false);
      setAlertMessage('Profile updated successfully!');
    } catch (err) {
      setAlertMessage(err.response?.data?.error || 'Failed to update profile.');
    }
  };

  const handleLogout = () => { logout(); router.push('/'); };

  if (!user) return null;

  // ------- derived state -------
  const upcomingMeetings = meetings.filter(m => m.state === 'SCHEDULED' || m.state === 'ONGOING');
  const historyMeetings  = meetings.filter(m => m.state === 'COMPLETED');
  const displayedHistory = showAllHistory ? historyMeetings : historyMeetings.slice(0, 3);
  const displayMeetings  = activeTab === 'upcoming' ? upcomingMeetings : displayedHistory;

  // ------- render -------
  return (
    <>
      {/* ===== MODALS (outside transformed container) ===== */}

      {/* Scheduled Meeting Success */}
      {scheduledMeetingCode && (
        <div style={MODAL_STYLE.overlay}>
          <div style={{ ...MODAL_STYLE.box, textAlign: 'center' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#34d399' }}>
              <CalendarCheck2 size={32} />
            </div>
            <h2 style={{ margin: '0 0 0.5rem', color: '#f8fafc' }}>Meeting Scheduled!</h2>
            <p style={{ margin: '0 0 1.5rem', color: '#94a3b8', lineHeight: 1.5 }}>Share this code with participants so they can join.</p>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.2)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <code style={{ fontSize: '1.2rem', color: '#60a5fa', fontWeight: 700, letterSpacing: '2px' }}>{scheduledMeetingCode}</code>
              <button onClick={() => copyCode(scheduledMeetingCode)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: copiedCode === scheduledMeetingCode ? '#34d399' : 'white', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                {copiedCode === scheduledMeetingCode ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
              </button>
            </div>
            <button onClick={() => setScheduledMeetingCode(null)} style={{ width: '100%', padding: '0.875rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Done</button>
          </div>
        </div>
      )}

      {/* Alert */}
      {alertMessage && <AlertModal message={alertMessage} onClose={() => setAlertMessage(null)} />}

      {/* Confirm */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {/* Create Org Modal */}
      {showOrgModal && (
        <div style={MODAL_STYLE.overlay}>
          <div style={MODAL_STYLE.box}>
            <h2 style={{ margin: '0 0 1.5rem', color: '#f8fafc', textAlign: 'center' }}>Create Organization</h2>
            <form onSubmit={handleCreateOrg}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#9ca3af' }}>Organization Name</label>
              <input
                type="text"
                placeholder="e.g. My Dream Team"
                className={styles.input}
                value={newOrgName}
                onChange={e => setNewOrgName(e.target.value)}
                required
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem' }}
              />
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" onClick={() => setShowOrgModal(false)} style={{ flex: 1, padding: '0.875rem', background: 'transparent', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '0.875rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <div style={MODAL_STYLE.overlay}>
          <div style={MODAL_STYLE.box}>
            <h2 style={{ margin: '0 0 1.5rem', color: '#f8fafc', textAlign: 'center' }}>Edit Profile</h2>
            <form onSubmit={handleUpdateProfile}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#9ca3af' }}>Display Name</label>
                <input type="text" className={styles.input} value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#9ca3af' }}>Preferred Language</label>
                <select className={styles.input} value={editLanguage} onChange={e => setEditLanguage(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="bn">Bengali</option>
                  <option value="ta">Tamil</option>
                  <option value="te">Telugu</option>
                  <option value="mr">Marathi</option>
                  <option value="gu">Gujarati</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" onClick={() => setShowProfileModal(false)} style={{ flex: 1, padding: '0.875rem', background: 'transparent', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '0.875rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transcript Modal */}
      {transcriptModal && (
        <div style={{ ...MODAL_STYLE.overlay }}>
          <div style={{ background: 'linear-gradient(135deg,rgba(30,41,59,0.98),rgba(15,23,42,0.98))', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem' }}>📝 Meeting Transcript</h2>
                {!transcriptModal.loading && transcriptModal.entries.length > 0 && (
                  <button onClick={handleExportTranscript} style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Export TXT
                  </button>
                )}
              </div>
              <button onClick={() => setTranscriptModal(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {transcriptModal.loading ? (
                <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem 0' }}>Loading transcript...</p>
              ) : transcriptModal.entries.length === 0 ? (
                <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem 0' }}>No transcript recorded for this meeting.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {transcriptModal.entries.map(t => (
                    <div key={t.id} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: 600, color: '#60a5fa', fontSize: '0.88rem' }}>{t.speaker?.name || 'Unknown'}</span>
                        <span style={{ color: '#6b7280', fontSize: '0.72rem' }}>{new Date(t.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p style={{ margin: 0, color: '#e2e8f0', lineHeight: 1.5, fontSize: '0.92rem' }}>{t.originalText}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All Members Modal */}
      {showAllMembersOrg && (
        <div style={MODAL_STYLE.overlay}>
          <div style={{ background: 'linear-gradient(135deg,rgba(30,41,59,0.98),rgba(15,23,42,0.98))', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', width: '90%', maxWidth: '520px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div>
                <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem' }}>{showAllMembersOrg.name}</h2>
                <p style={{ margin: '0.25rem 0 0', color: '#9ca3af', fontSize: '0.8rem' }}>{showAllMembersOrg.users?.length} member{showAllMembersOrg.users?.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowAllMembersOrg(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {showAllMembersOrg.users?.map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', gap: '1rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500, color: '#f1f5f9', fontSize: '0.9rem' }}>{u.name}</span>
                      <RoleBadge role={u.id === showAllMembersOrg.ownerId ? 'HOST' : (showAllMembersOrg.coHosts?.some(c => c.id === u.id) ? 'COHOST' : 'PARTICIPANT')} />
                    </div>
                    <p style={{ margin: '0.2rem 0 0', color: '#9ca3af', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                  </div>
                  {showAllMembersOrg.ownerId === user.id && u.id !== user.id && (
                    <button onClick={() => handleRemoveMember(showAllMembersOrg.id, u.id, u.name)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0 }}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== MAIN CONTENT ===== */}
      <div className={`${styles.container} animate-fade-in`}>

        {/* Header */}
        <header className={styles.header}>
          <h1 className={styles.title}>Dashboard</h1>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user.name} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({user.language})</span></span>
            {(user.role === 'ORG_ADMIN' || user.role === 'PLATFORM_ADMIN') && (
              <Link href="/admin" style={{ color: '#a78bfa', textDecoration: 'none', fontWeight: 600 }}>Admin Panel</Link>
            )}
            <button
              onClick={() => { setEditName(user.name); setEditLanguage(user.language); setShowProfileModal(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer' }}
            >
              <UserIcon size={14} /> Profile
            </button>
            <NotificationBell />
            <button onClick={handleLogout} className={styles.logoutBtn} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <LogOut size={14} /> Logout
            </button>
          </div>
        </header>

        <div className={styles.grid}>
          {/* ===== LEFT COLUMN ===== */}
          <div className={styles.leftCol}>

            {/* New Meeting */}
            <div className={`${styles.card} glass`} style={{ marginBottom: '1.5rem' }}>
              <h2 className={styles.cardTitle}><PlusCircle size={18} /> New Meeting</h2>
              <form onSubmit={handleCreateMeeting}>
                <input
                  type="text"
                  placeholder="Meeting Title (optional)"
                  className={styles.input}
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                />
                <div style={{ margin: '0.75rem 0' }}>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: '#9ca3af' }}>Organization (Optional)</label>
                  <select className={styles.input} value={selectedOrgId} onChange={e => setSelectedOrgId(e.target.value)} style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <option value="">No Organization</option>
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ margin: '0.75rem 0' }}>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: '#9ca3af' }}>Schedule For (leave blank to start now)</label>
                  <input
                    type="datetime-local"
                    className={styles.input}
                    value={scheduledTime}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={e => setScheduledTime(e.target.value)}
                  />
                </div>
                <button type="submit" className={styles.btnPrimary} disabled={isCreating}>
                  {isCreating ? 'Creating…' : scheduledTime ? '📅 Schedule Meeting' : '🚀 Start Now'}
                </button>
              </form>
            </div>

            {/* Join by Code */}
            <div className={`${styles.card} glass`}>
              <h2 className={styles.cardTitle}><LinkIcon size={18} /> Join by Code</h2>
              <form onSubmit={handleJoinMeeting}>
                <input
                  type="text"
                  placeholder="Paste meeting or org access code"
                  className={styles.input}
                  value={joinLink}
                  onChange={e => setJoinLink(e.target.value)}
                />
                <button type="submit" className={styles.btnPrimary}>Join Meeting</button>
              </form>
            </div>
          </div>

          {/* ===== RIGHT COLUMN ===== */}
          <div className={styles.rightCol}>
            <div className={`${styles.card} glass`} style={{ minHeight: '100%' }}>

              {/* Tabs */}
              <div style={{ display: 'flex', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['upcoming', 'history', 'organizations'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      flex: 1, padding: '0.9rem 0.5rem', background: 'none', border: 'none', cursor: 'pointer',
                      color: activeTab === tab ? '#60a5fa' : '#9ca3af',
                      fontWeight: activeTab === tab ? 700 : 400,
                      borderBottom: activeTab === tab ? '2px solid #60a5fa' : '2px solid transparent',
                      fontSize: '0.9rem', transition: 'all 0.15s',
                    }}
                  >
                    {tab === 'upcoming' ? <><Video size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />Upcoming</>
                      : tab === 'history' ? '📋 History'
                      : '🏢 Organizations'}
                  </button>
                ))}
              </div>

              {/* ===== ORGANIZATIONS TAB ===== */}
              {activeTab === 'organizations' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ margin: 0, color: '#f1f5f9' }}>My Organizations</h3>
                    <button onClick={() => setShowOrgModal(true)} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                      + Create Org
                    </button>
                  </div>

                  {organizations.length === 0 ? (
                    <div className={styles.emptyState}>
                      You don&apos;t belong to any organizations yet. Create one or accept an invite!
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {organizations.map(org => {
                        const isOwner = org.ownerId === user.id;
                        return (
                          <div key={org.id} style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.07)' }}>

                            {/* Org header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                  <h4 style={{ margin: 0, color: '#f1f5f9' }}>{org.name}</h4>
                                  {isOwner && <RoleBadge role="HOST" />}
                                </div>
                                <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: '#9ca3af' }}>
                                  Hosted by {isOwner ? 'You' : org.owner?.name}
                                </p>
                              </div>

                              {/* Owner: access code + controls | Member: leave button */}
                              {isOwner ? (
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', justifyContent: 'flex-end' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Code:</span>
                                    <code style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.9rem' }}>{org.accessCode}</code>
                                    <button
                                      onClick={() => copyCode(org.accessCode)}
                                      title="Copy access code"
                                      style={{ background: 'none', border: 'none', color: copiedCode === org.accessCode ? '#34d399' : '#6b7280', cursor: 'pointer', padding: '0.1rem', display: 'flex', alignItems: 'center' }}
                                    >
                                      {copiedCode === org.accessCode ? <Check size={13} /> : <Copy size={13} />}
                                    </button>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                    <button onClick={() => handleRegenerateCode(org.id)} style={{ background: 'rgba(255,255,255,0.07)', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.1)', padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
                                      Regenerate
                                    </button>
                                    <button onClick={() => handleDeleteOrg(org.id, org.name)} style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
                                      Delete Org
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button onClick={() => handleLeaveOrg(org.id, org.name)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '0.4rem 0.9rem', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer', flexShrink: 0 }}>
                                  Leave Org
                                </button>
                              )}
                            </div>

                            {/* Members preview */}
                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
                              <p style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Members ({org.users?.length || 0})
                              </p>
                              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                {org.users?.slice(0, 5).map(u => (
                                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.78rem', color: '#93c5fd' }}>
                                    <span>{u.name}</span>
                                    {u.id === org.ownerId ? <RoleBadge role="HOST" /> : (org.coHosts?.some(c => c.id === u.id) && <RoleBadge role="COHOST" />)}
                                    {isOwner && u.id !== user.id && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.2rem' }}>
                                        <button onClick={() => handleToggleOrgCoHost(org.id, u.id, org.coHosts?.some(c => c.id === u.id))} title={org.coHosts?.some(c => c.id === u.id) ? "Remove Co-Host" : "Make Co-Host"} style={{ background: 'none', border: 'none', color: org.coHosts?.some(c => c.id === u.id) ? '#c084fc' : '#9ca3af', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '0.9rem' }}>★</button>
                                        <button onClick={() => handleRemoveMember(org.id, u.id, u.name)} title="Remove" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '1rem' }}>×</button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {(org.users?.length || 0) > 5 && (
                                  <button onClick={() => setShowAllMembersOrg(org)} style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    +{org.users.length - 5} more
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Pending invitations */}
                            {isOwner && org.invitations?.length > 0 && (
                              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.07)', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
                                <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  Pending Invitations ({org.invitations.length})
                                </p>
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  {org.invitations.map(inv => (
                                    <span key={inv.id} style={{ background: 'rgba(245,158,11,0.08)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem' }}>
                                      ⏳ {inv.email}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Invite form (owner only) */}
                            {isOwner && (
                              <form
                                onSubmit={e => handleInviteMembers(e, org.id)}
                                style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}
                              >
                                <input
                                  type="text"
                                  placeholder="Email addresses separated by comma"
                                  ref={el => { if (el) inviteEmailRefs.current[org.id] = el; }}
                                  className={styles.input}
                                  style={{ flex: 1, margin: 0, padding: '0.65rem 0.9rem', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.85rem' }}
                                />
                                <button type="submit" style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0.65rem 1.2rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                                  Invite
                                </button>
                              </form>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ===== UPCOMING / HISTORY TABS ===== */}
              {activeTab !== 'organizations' && (
                <>
                  {displayMeetings.length === 0 ? (
                    <div className={styles.emptyState}>
                      {activeTab === 'upcoming'
                        ? 'No upcoming meetings. Create or schedule one!'
                        : 'No past meetings yet.'}
                    </div>
                  ) : (
                    <div className={styles.meetingList}>
                      {displayMeetings.map(m => (
                        <div key={m.id} className={styles.meetingItem} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>

                          {/* Top row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                                <h4 style={{ margin: 0, fontSize: '1rem', color: '#f1f5f9' }}>{m.title}</h4>
                                <StateBadge state={m.state} />
                              </div>
                              <p style={{ margin: '0.15rem 0', fontSize: '0.83rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span>
                                  Code: <code style={{ background: 'rgba(255,255,255,0.08)', padding: '0.1rem 0.4rem', borderRadius: 4 }}>{m.meetingLink}</code>
                                </span>
                                <button
                                  onClick={() => copyCode(m.meetingLink)}
                                  style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: copiedCode === m.meetingLink ? '#34d399' : '#9ca3af', cursor: 'pointer', fontSize: '0.72rem', padding: '0.1rem 0.5rem' }}
                                >
                                  {copiedCode === m.meetingLink ? '✓ Copied!' : 'Copy'}
                                </button>
                                <span style={{ color: '#6b7280' }}>•</span>
                                <span>Host: <strong>{m.hostId === user.id ? 'You' : m.host?.name}</strong></span>
                              </p>
                              <p style={{ margin: 0, fontSize: '0.78rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Clock size={12} />
                                {m.state === 'SCHEDULED' && m.startTime
                                  ? `Scheduled for ${new Date(m.startTime).toLocaleString()}`
                                  : `Created ${new Date(m.createdAt).toLocaleString()}`}
                              </p>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                              {m.hostId === user.id && (
                                <button
                                  onClick={() => handleDeleteMeeting(m.id)}
                                  title="Delete Meeting"
                                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}

                              {m.state === 'COMPLETED' ? (
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                  <button
                                    onClick={() => handleViewTranscript(m.meetingLink)}
                                    style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', padding: '0.5rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap', fontWeight: 600 }}
                                  >
                                    📝 Transcript
                                  </button>
                                  <Link
                                    href={`/meeting/${m.meetingLink}/report`}
                                    style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)', padding: '0.5rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                                  >
                                    📊 Report
                                  </Link>
                                </div>
                              ) : (
                                <Link
                                  href={`/meeting/${m.meetingLink}`}
                                  className={styles.btnJoin}
                                  style={{ whiteSpace: 'nowrap' }}
                                >
                                  {m.state === 'SCHEDULED' ? '▶ Start' : 'Join'}
                                </Link>
                              )}
                            </div>
                          </div>

                          {/* Attendance log (history only) */}
                          {activeTab === 'history' && m.participants?.length > 0 && (
                            <details style={{ fontSize: '0.82rem', color: '#9ca3af' }}>
                              <summary style={{ cursor: 'pointer', color: '#a78bfa', marginBottom: '0.4rem' }}>
                                <Users size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                Attendance Log ({m.participants.length} participants)
                              </summary>
                              <div style={{ paddingLeft: '1rem', maxHeight: 140, overflowY: 'auto' }}>
                                {m.participants.map(p => (
                                  <div key={p.id} style={{ marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <strong style={{ color: '#e5e7eb' }}>{p.user?.name}</strong>
                                    <RoleBadge role={p.role} />
                                    {p.sessions?.map(s => (
                                      <span key={s.id} style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                                        {new Date(s.joinedAt).toLocaleTimeString()}{s.leftAt ? ` - ${new Date(s.leftAt).toLocaleTimeString()}` : ' (active)'}
                                      </span>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      ))}

                      {/* Show more / less for history */}
                      {activeTab === 'history' && historyMeetings.length > 3 && (
                        <div style={{ textAlign: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <button
                            onClick={() => setShowAllHistory(!showAllHistory)}
                            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#9ca3af', cursor: 'pointer', padding: '0.5rem 1.5rem', fontSize: '0.85rem' }}
                          >
                            {showAllHistory ? '▲ Show Less' : `▼ View All ${historyMeetings.length} Meetings`}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0a0f1e', color: '#60a5fa' }}>Loading Dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}



