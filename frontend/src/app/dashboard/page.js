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
  ONGOING:   { label: 'Live',      bg: '#111',  color: '#FDFBF7' },
  SCHEDULED: { label: 'Scheduled', bg: 'transparent',  color: '#111' },
  COMPLETED: { label: 'Ended',     bg: 'transparent', color: '#111' },
};

const ROLE_CFG = {
  HOST:        { label: 'Host',        color: '#E34234', bg: 'transparent' },
  COHOST:      { label: 'Co-Host',     color: '#0047AB', bg: 'transparent' },
  PARTICIPANT: { label: 'Participant', color: '#111', bg: 'transparent' },
};

// ------- tiny components -------
function StateBadge({ state }) {
  const cfg = STATE_CFG[state] || STATE_CFG.SCHEDULED;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem',
      textTransform: 'uppercase', letterSpacing: '0.05em',
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}`,
    }}>
      <span style={{ width: 6, height: 6, background: cfg.color, display: 'inline-block' }} />
      {cfg.label}
    </span>
  );
}

function RoleBadge({ role }) {
  const cfg = ROLE_CFG[role] || ROLE_CFG.PARTICIPANT;
  return (
    <span style={{
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem',
      textTransform: 'uppercase',
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}`,
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
    background: '#FDFBF7', border: '4px solid #111', borderRadius: '0',
    padding: '2rem', borderRadius: '0',
    border: '2px solid #111',
    boxShadow: '10px 10px 0 #111',
    maxWidth: '420px', width: '90%',
  },
};

function AlertModal({ message, onClose }) {
  return (
    <div style={MODAL_STYLE.overlay}>
      <div style={MODAL_STYLE.box}>
        <h3 style={{ margin: '0 0 1rem', color: '#111', fontSize: '1.1rem' }}>Notice</h3>
        <p style={{ margin: '0 0 1.5rem', color: '#444', lineHeight: 1.6 }}>{message}</p>
        <button onClick={onClose} style={{ width: '100%', padding: '0.875rem', background: '#111', color: '#FDFBF7', border: 'none', borderRadius: '0', fontWeight: 600, cursor: 'pointer', fontSize: '1rem' }}>OK</button>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, onConfirm, onClose }) {
  return (
    <div style={MODAL_STYLE.overlay}>
      <div style={MODAL_STYLE.box}>
        <h3 style={{ margin: '0 0 1rem', color: '#111', fontSize: '1.1rem' }}>{title || 'Are you sure?'}</h3>
        <p style={{ margin: '0 0 1.5rem', color: '#444', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '0.875rem', background: 'transparent', color: '#555', border: '2px solid #111', borderRadius: '0', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '0.875rem', background: '#ef4444', color: '#FDFBF7', border: 'none', borderRadius: '0', fontWeight: 600, cursor: 'pointer' }}>Confirm</button>
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
  const [editAvatar, setEditAvatar] = useState('');
  const [editLanguage, setEditLanguage] = useState('');

  // Modal state
  const [alertMessage, setAlertMessage] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { title, message, onConfirm }
  const [showAllMembersOrg, setShowAllMembersOrg] = useState(null); // org object
  const [transcriptModal, setTranscriptModal] = useState(null); // { loading, entries }
  const [summaryModal, setSummaryModal] = useState(null); // { loading, text }

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
        title: 'Remove Meeting',
        message: 'This will remove the meeting from your history.',
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

  
  
  const handleExportAttendance = (meeting) => {
    if (!meeting.participants) return;
    const rows = ['Name,Role,Total Time,Sessions Detail'];
    meeting.participants.forEach(p => {
      const name = p.user?.name || 'Unknown';
      const role = p.role || 'PARTICIPANT';
      let totalMs = 0;
      const sessionDetails = [];
      (p.sessions || []).forEach((s, index, arr) => {
        const start = new Date(s.joinedAt).getTime();
        let end, endTimeStr;
        if (s.leftAt) {
          end = new Date(s.leftAt).getTime();
          endTimeStr = new Date(s.leftAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
          if (index === arr.length - 1) {
            end = meeting.endTime ? new Date(meeting.endTime).getTime() : Date.now();
            endTimeStr = meeting.endTime ? 'Meeting Ended' : 'Active';
          } else {
            end = start;
            endTimeStr = 'Dropped';
          }
        }
        
        const durationMs = end - start;
        totalMs += durationMs;
        
        const mins = Math.floor(durationMs / 60000);
        const durationStr = mins < 1 ? '<1m' : `${mins}m`;
        
        const startTimeStr = new Date(s.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        sessionDetails.push(`${index + 1}. ${startTimeStr} to ${endTimeStr} (${durationStr})`);
      });
      const mins = Math.floor(totalMs / 60000);
      const timeStr = mins < 1 ? '<1m' : `${mins}m`;
      rows.push(`"${name}","${role}","${timeStr}","${sessionDetails.join('\n')}"`);
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Attendance_${meeting.meetingLink}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSummary = () => {
    if (!summaryModal || !summaryModal.text) return;
    const blob = new Blob([summaryModal.text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Meeting_Summary_${summaryModal.link}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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

  
  const handleViewSummary = async (meetingLink) => {
    setSummaryModal({ loading: true, text: '', link: meetingLink });
    try {
      const res = await api.get(`/meetings/${meetingLink}/summary`);
      setSummaryModal({ loading: false, text: res.data.summary || 'No summary available.', link: meetingLink });
    } catch (err) {
      setAlertMessage(err.response?.data?.error || 'Failed to load summary.');
      setSummaryModal(null);
    }
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
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditAvatar(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
      const res = await api.put('/auth/profile', { name: editName, preferredLanguage: editLanguage, avatar: editAvatar });
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
        <div style={MODAL_STYLE.overlay} onClick={() => setScheduledMeetingCode(null)}>
          <div style={{ ...MODAL_STYLE.box, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#34d399' }}>
              <CalendarCheck2 size={32} />
            </div>
            <h2 style={{ margin: '0 0 0.5rem', color: '#111' }}>Meeting Scheduled!</h2>
            <p style={{ margin: '0 0 1.5rem', color: '#666', lineHeight: 1.5 }}>Share this code with participants so they can join.</p>
            <div style={{ background: 'rgba(0,0,0,0.05)', padding: '1rem', borderRadius: '0', border: '1px dashed rgba(255,255,255,0.2)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <code style={{ fontSize: '1.2rem', color: '#60a5fa', fontWeight: 700, letterSpacing: '2px' }}>{scheduledMeetingCode}</code>
              <button onClick={() => copyCode(scheduledMeetingCode)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: copiedCode === scheduledMeetingCode ? '#34d399' : 'white', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                {copiedCode === scheduledMeetingCode ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
              </button>
            </div>
            <button onClick={() => setScheduledMeetingCode(null)} style={{ width: '100%', padding: '0.875rem', background: '#111', color: '#FDFBF7', border: 'none', borderRadius: '0', fontWeight: 600, cursor: 'pointer' }}>Done</button>
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
        <div style={MODAL_STYLE.overlay} onClick={() => setShowOrgModal(false)}>
          <div style={MODAL_STYLE.box} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1.5rem', color: '#111', textAlign: 'center' }}>Create Organization</h2>
            <form onSubmit={handleCreateOrg}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#555' }}>Organization Name</label>
              <input
                type="text"
                placeholder="e.g. My Dream Team"
                className={styles.input}
                value={newOrgName}
                onChange={e => setNewOrgName(e.target.value)}
                required
                style={{ width: '100%', background: 'transparent', border: '2px solid #111', marginBottom: '1.5rem', padding: '0.75rem 1rem', fontSize: '1rem', color: '#111', outline: 'none', fontFamily: 'var(--font-grotesk)' }}
              />
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" onClick={() => setShowOrgModal(false)} style={{ flex: 1, padding: '0.875rem', background: 'transparent', color: '#555', border: '2px solid #111', borderRadius: '0', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '0.875rem', background: '#111', color: '#FDFBF7', border: 'none', borderRadius: '0', fontWeight: 600, cursor: 'pointer' }}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <div style={MODAL_STYLE.overlay} onClick={() => setShowProfileModal(false)}>
          <div style={MODAL_STYLE.box} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1.5rem', color: '#111', textAlign: 'center' }}>Edit Profile</h2>
            <form onSubmit={handleUpdateProfile}>
              <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {editAvatar ? (
                    <img src={editAvatar} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid #0A0A0A' }} />
                  ) : (
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#0022FF', border: '2px solid #0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.5rem', color: '#F7F5F0' }}>
                      {(editName || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#555', cursor: 'pointer' }}>
                       <span style={{ display: 'block', marginBottom: '0.4rem' }}>Profile Photo</span>
                       <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                       <div style={{ background: '#F7F5F0', color: '#0A0A0A', border: '2px solid #0A0A0A', padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)', display: 'inline-block', boxShadow: '2px 2px 0 rgba(10,10,10,1)' }}>Upload Image</div>
                    </label>
                  </div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#555' }}>Display Name</label>
                  <input type="text" className={styles.input} value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '100%', background: 'transparent', border: '2px solid #111', padding: '0.75rem 1rem', fontSize: '1rem', color: '#111', outline: 'none', fontFamily: 'var(--font-grotesk)' }} />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#555' }}>Preferred Language</label>
                <select className={styles.input} value={editLanguage} onChange={e => setEditLanguage(e.target.value)} style={{ width: '100%', background: 'transparent', border: '2px solid #111', padding: '0.75rem 1rem', fontSize: '1rem', color: '#111', outline: 'none', fontFamily: 'var(--font-grotesk)' }}>
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
                <button type="button" onClick={() => setShowProfileModal(false)} style={{ flex: 1, padding: '0.875rem', background: 'transparent', color: '#555', border: '2px solid #111', borderRadius: '0', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '0.875rem', background: '#111', color: '#FDFBF7', border: 'none', borderRadius: '0', fontWeight: 600, cursor: 'pointer' }}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      
        {/* Summary Modal */}
        {summaryModal && (
          <div style={{ ...MODAL_STYLE.overlay }} onClick={() => setSummaryModal(null)}>
            <div style={{ background: '#FDFBF7', border: '4px solid #111', padding: '2rem', borderRadius: '0', border: '1px solid #262626', boxShadow: '10px 10px 0 #111', width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #262626' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h2 style={{ margin: 0, color: '#111', fontSize: '1.1rem' }}>✨ AI Meeting Summary</h2>
                    {!summaryModal.loading && summaryModal.text && (
                      <button onClick={handleExportSummary} style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Export TXT
                      </button>
                    )}
                  </div>
                <button onClick={() => setSummaryModal(null)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}>&times;</button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {summaryModal.loading ? (
                  <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                    <div className="spinner" style={{ border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #10b981', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }}></div>
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                    <p style={{ color: '#10b981', fontWeight: 600 }}>AI is generating the summary in your language... This may take up to 15 seconds.</p>
                  </div>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', color: '#111', lineHeight: 1.6, fontSize: '0.95rem' }}>
                    {summaryModal.text}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Transcript Modal */}
      {transcriptModal && (
        <div style={{ ...MODAL_STYLE.overlay }} onClick={() => setTranscriptModal(null)}>
          <div style={{ background: '#FDFBF7', border: '4px solid #111', borderRadius: '0', padding: '2rem', borderRadius: '0', border: '2px solid #111', boxShadow: '10px 10px 0 #111', width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid #111' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h2 style={{ margin: 0, color: '#111', fontSize: '1.1rem' }}>📝 Meeting Transcript</h2>
                {!transcriptModal.loading && transcriptModal.entries.length > 0 && (
                  <button onClick={handleExportTranscript} style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Export TXT
                  </button>
                )}
              </div>
              <button onClick={() => setTranscriptModal(null)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {transcriptModal.loading ? (
                <p style={{ color: '#555', textAlign: 'center', padding: '2rem 0' }}>Loading transcript...</p>
              ) : transcriptModal.entries.length === 0 ? (
                <p style={{ color: '#555', textAlign: 'center', padding: '2rem 0' }}>No transcript recorded for this meeting.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {transcriptModal.entries.map(t => (
                    <div key={t.id} style={{ background: 'transparent', padding: '0.75rem 1rem', borderRadius: '0', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: 600, color: '#60a5fa', fontSize: '0.88rem' }}>{t.speaker?.name || 'Unknown'}</span>
                        <span style={{ color: '#777', fontSize: '0.72rem' }}>{new Date(t.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p style={{ margin: 0, color: '#111', lineHeight: 1.5, fontSize: '0.92rem' }}>{t.originalText}</p>
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
        <div style={MODAL_STYLE.overlay} onClick={() => setShowAllMembersOrg(null)}>
          <div style={{ background: '#FDFBF7', border: '4px solid #111', borderRadius: '0', padding: '2rem', borderRadius: '0', border: '2px solid #111', boxShadow: '10px 10px 0 #111', width: '90%', maxWidth: '520px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid #111' }}>
              <div>
                <h2 style={{ margin: 0, color: '#111', fontSize: '1.1rem' }}>{showAllMembersOrg.name}</h2>
                <p style={{ margin: '0.25rem 0 0', color: '#555', fontSize: '0.8rem' }}>{showAllMembersOrg.users?.length} member{showAllMembersOrg.users?.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowAllMembersOrg(null)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {showAllMembersOrg.users?.map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'transparent', borderRadius: '0', gap: '1rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500, color: '#111', fontSize: '0.9rem' }}>{u.name}</span>
                      <RoleBadge role={u.id === showAllMembersOrg.ownerId ? 'HOST' : (showAllMembersOrg.coHosts?.some(c => c.id === u.id) ? 'COHOST' : 'PARTICIPANT')} />
                    </div>
                    <p style={{ margin: '0.2rem 0 0', color: '#555', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
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
          <h1 className={styles.title}>BhashaBridge</h1>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user.name} <span style={{ color: '#111', fontWeight: 400, textTransform: 'none' }}>({user.language})</span></span>
            {(user.role === 'ORG_ADMIN' || user.role === 'PLATFORM_ADMIN') && (
              <Link href="/admin" style={{ color: 'var(--cobalt)', textDecoration: 'none', fontWeight: 600 }}>Admin Panel</Link>
            )}
            <button
              onClick={() => { setEditName(user.name); setEditLanguage(user.language); setEditAvatar(user.avatar || ''); setShowProfileModal(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'transparent', border: '1px solid #111', color: '#111', padding: '0.4rem 0.8rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
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
            <div className={styles.card} style={{ marginBottom: '1.5rem' }}>
              <h2 className={styles.cardTitle}>New Conversation</h2>
              <form onSubmit={handleCreateMeeting}>
                <input
                  type="text"
                  placeholder="Topic (optional)"
                  className={styles.input}
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                />
                {organizations.some(org => org.ownerId === user.id || org.coHosts?.some(c => c.id === user.id)) && (
                  <div style={{ margin: '0.75rem 0' }}>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: '#111', fontFamily: 'var(--font-mono)' }}>Organization (Optional)</label>
                    <select className={styles.input} value={selectedOrgId} onChange={e => setSelectedOrgId(e.target.value)}>
                      <option value="">No Organization</option>
                      {organizations
                        .filter(org => org.ownerId === user.id || org.coHosts?.some(c => c.id === user.id))
                        .map(org => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                  </div>
                  )}
                <div style={{ margin: '0.75rem 0' }}>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: '#111', fontFamily: 'var(--font-mono)' }}>Schedule For (leave blank to start now)</label>
                  <input
                    type="datetime-local"
                    className={styles.input}
                    value={scheduledTime}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={e => setScheduledTime(e.target.value)}
                  />
                </div>
                <button type="submit" className={styles.btnPrimary} disabled={isCreating}>
                  {isCreating ? 'CREATING…' : scheduledTime ? 'SCHEDULE' : 'LAUNCH'}
                </button>
              </form>
            </div>

            {/* Join by Code */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Join</h2>
              <form onSubmit={handleJoinMeeting}>
                <input
                  type="text"
                  placeholder="Paste code here"
                  className={styles.input}
                  value={joinLink}
                  onChange={e => setJoinLink(e.target.value)}
                />
                <button type="submit" className={styles.btnPrimary}>JOIN</button>
              </form>
            </div>
          </div>

          {/* ===== RIGHT COLUMN ===== */}
          <div className={styles.rightCol}>
            <div className={styles.card} style={{ minHeight: '100%' }}>

              {/* Tabs */}
              <div style={{ display: 'flex', marginBottom: '2.5rem', borderBottom: '2px solid #111' }}>
                {['upcoming', 'history', 'organizations'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      flex: 1, padding: '1rem', background: 'none', border: 'none', cursor: 'pointer',
                      color: activeTab === tab ? 'var(--cobalt)' : 'rgba(0,0,0,0.4)',
                      fontWeight: 700,
                      borderBottom: activeTab === tab ? '4px solid var(--cobalt)' : '4px solid transparent',
                      fontSize: '1rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', transition: 'all 0.15s',
                      marginBottom: '-3px'
                    }}
                  >
                    {tab === 'upcoming' ? 'Upcoming' : tab === 'history' ? 'History' : 'Organizations'}
                  </button>
                ))}
              </div>

              {/* ===== ORGANIZATIONS TAB ===== */}
              {activeTab === 'organizations' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ margin: 0, color: '#111' }}>My Organizations</h3>
                    <button onClick={() => setShowOrgModal(true)} style={{ background: '#111', color: '#FDFBF7', border: 'none', padding: '0.5rem 1rem', borderRadius: '0', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
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
                          <div key={org.id} style={{ padding: '1.25rem', background: 'transparent', borderRadius: '0', border: '2px solid #111' }}>

                            {/* Org header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                  <h4 style={{ margin: 0, color: '#111' }}>{org.name}</h4>
                                  {isOwner && <RoleBadge role="HOST" />}
                                </div>
                                <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: '#555' }}>
                                  Hosted by {isOwner ? 'You' : org.owner?.name}
                                </p>
                              </div>

                              {/* Owner: access code + controls | Member: leave button */}
                              {isOwner ? (
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', justifyContent: 'flex-end' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#555' }}>Code:</span>
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
                                    <button onClick={() => handleRegenerateCode(org.id)} style={{ background: 'rgba(255,255,255,0.07)', color: '#111', border: '2px solid #111', padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
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
                            <div style={{ borderTop: '2px solid #111', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
                              <p style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', color: '#777', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                                  <button onClick={() => setShowAllMembersOrg(org)} style={{ background: 'rgba(255,255,255,0.05)', color: '#555', border: '2px solid #111', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    +{org.users.length - 5} more
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Pending invitations */}
                            {isOwner && org.invitations?.length > 0 && (
                              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.07)', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
                                <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#777', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                                  style={{ flex: 1, margin: 0, padding: '0.65rem 0.9rem', background: 'rgba(0,0,0,0.25)', border: '2px solid #111', fontSize: '0.85rem' }}
                                />
                                <button type="submit" style={{ background: '#111', color: '#FDFBF7', border: 'none', padding: '0.65rem 1.2rem', borderRadius: '0', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
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
                        
                          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem', background: 'transparent', borderTop: '2px solid #0A0A0A', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: 'min(200px, 100%)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  <h3 style={{ margin: 0, fontSize: '1.75rem', color: '#0A0A0A', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 600 }}>{m.title || 'Untitled Meeting'}</h3>
                                  <span style={{ background: m.state === 'COMPLETED' ? '#0022FF' : '#FF3311', color: '#F7F5F0', padding: '0.2rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', border: '1px solid #0A0A0A', boxShadow: '2px 2px 0 rgba(10,10,10,1)' }}>
                                    {m.state}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                  <code style={{ fontSize: '0.9rem', color: '#0022FF', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>ID: {m.meetingLink}</code>
                                  <span style={{ color: '#5A5A5A', fontSize: '0.85rem' }}>Host: <strong style={{ color: '#0A0A0A' }}>{m.host?.name || 'Unknown'}</strong></span>
                                  <span style={{ color: '#5A5A5A', fontSize: '0.85rem' }}>{new Date(m.createdAt).toLocaleString()}</span>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                {m.state === 'COMPLETED' ? (
                                  <>
                                    <button onClick={() => handleViewTranscript(m.meetingLink)} style={{ background: '#F7F5F0', color: '#0A0A0A', border: '2px solid #0A0A0A', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-mono)', boxShadow: '4px 4px 0 rgba(10,10,10,1)', textTransform: 'uppercase' }}>
                                      Transcript
                                    </button>
                                    <button onClick={(e) => { e.preventDefault(); handleViewSummary(m.meetingLink); }} style={{ background: '#0A0A0A', color: '#F7F5F0', border: '2px solid #0A0A0A', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-mono)', boxShadow: '4px 4px 0 rgba(10,10,10,1)', textTransform: 'uppercase' }}>
                                      Summary
                                    </button>
                                    <Link href={`/meeting/${m.meetingLink}/report`} style={{ background: '#0022FF', color: '#F7F5F0', border: '2px solid #0A0A0A', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-mono)', boxShadow: '4px 4px 0 rgba(10,10,10,1)', textTransform: 'uppercase', textDecoration: 'none' }}>
                                      Report
                                    </Link>
                                  </>
                                ) : (
                                  <Link href={`/meeting/${m.meetingLink}`} style={{ background: '#FF3311', color: '#F7F5F0', border: '2px solid #0A0A0A', padding: '0.5rem 2rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700, fontFamily: 'var(--font-mono)', boxShadow: '4px 4px 0 rgba(10,10,10,1)', textTransform: 'uppercase', textDecoration: 'none' }}>
                                    {m.state === 'SCHEDULED' ? 'Start' : 'Join'}
                                  </Link>
                                )}
                                <button onClick={() => handleDeleteMeeting(m.id)} title="Remove" style={{ background: '#FF3311', color: '#F7F5F0', border: '2px solid #0A0A0A', padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: '4px 4px 0 rgba(10,10,10,1)' }}>
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                            
                            {activeTab === 'history' && m.participants?.length > 0 && (
                              <div style={{ padding: '1rem', border: '2px solid #0A0A0A', background: 'transparent' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: '#0A0A0A' }}>Attendance Log ({m.participants.length} Users)</span>
                                  <button onClick={(e) => { e.preventDefault(); handleExportAttendance(m); }} style={{ background: 'transparent', color: '#0022FF', border: '2px solid #0022FF', padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', cursor: 'pointer' }}>
                                    Export CSV
                                  </button>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                  {m.participants.map(p => (
                                    <div key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #0A0A0A', padding: '0.25rem 0.75rem', fontSize: '0.85rem', color: '#0A0A0A' }}>
                                      <strong style={{ fontWeight: 600 }}>{p.user?.name || 'Unknown'}</strong>
                                      <span style={{ fontSize: '0.7rem', color: '#FF3311', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{p.role}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Show more / less for history */}
                      {activeTab === 'history' && historyMeetings.length > 3 && (
                        <div style={{ textAlign: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '2px solid #111' }}>
                          <button
                            onClick={() => setShowAllHistory(!showAllHistory)}
                            style={{ background: 'none', border: '1px solid #111', borderRadius: 8, color: '#555', cursor: 'pointer', padding: '0.5rem 1.5rem', fontSize: '0.85rem' }}
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



