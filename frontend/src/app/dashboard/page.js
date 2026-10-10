'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  PlusCircle, Video, Link as LinkIcon, Clock, Users,
  CalendarCheck2, LogOut, Trash2, User as UserIcon, Copy, Check,
  Mail, Send, Building, Key, RefreshCw, ArrowRight, ExternalLink,
  FileText, BarChart3, Globe, Calendar, Radio, Sparkles, Shield, Zap
} from 'lucide-react';
import { io } from 'socket.io-client';
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
import useAuthStore from '../../stores/authStore';
import api from '../../services/api';
import styles from './dashboard.module.css';
import NotificationBell from '../../components/NotificationBell';

// ------- constants -------
const LANG_MAP = {
  en: { name: 'English', native: 'English' },
  hi: { name: 'Hindi', native: 'हिन्दी' },
  bn: { name: 'Bengali', native: 'বাংলা' },
  ta: { name: 'Tamil', native: 'தமிழ்' },
  te: { name: 'Telugu', native: 'తెలుగు' },
  mr: { name: 'Marathi', native: 'मराठी' },
  gu: { name: 'Gujarati', native: 'ગુજરાતી' },
  es: { name: 'Spanish', native: 'Español' },
  fr: { name: 'French', native: 'Français' },
  de: { name: 'German', native: 'Deutsch' },
};

const STATE_CFG = {
  ONGOING:   { label: 'Live',      bg: '#FF3311', color: '#FDFBF7' },
  SCHEDULED: { label: 'Scheduled', bg: 'transparent', color: '#111' },
  COMPLETED: { label: 'Ended',     bg: 'transparent', color: '#0022FF' },
  CANCELLED: { label: 'Cancelled', bg: 'transparent', color: '#FF3311' },
};

const ROLE_CFG = {
  HOST:        { label: 'Host',        color: '#FF3311', bg: 'transparent' },
  COHOST:      { label: 'Co-Host',     color: '#0022FF', bg: 'transparent' },
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
    padding: '1rem', boxSizing: 'border-box',
  },
  box: {
    background: '#FDFBF7',
    padding: 'clamp(1.25rem, 5vw, 2rem)',
    border: '2px solid #111',
    boxShadow: '6px 6px 0 #111',
    maxWidth: '440px', width: '100%',
    boxSizing: 'border-box',
    maxHeight: '90vh',
    overflowY: 'auto',
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
  const [meetingMode, setMeetingMode] = useState('instant'); // 'instant' | 'schedule'
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
  const [showJoinOrgModal, setShowJoinOrgModal] = useState(false);
  const [joinOrgCodeInput, setJoinOrgCodeInput] = useState('');
  const [joinOrgLoading, setJoinOrgLoading] = useState(false);
  const [joinOrgError, setJoinOrgError] = useState(null);
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

  // Email Invite modal state
  const [emailInviteModal, setEmailInviteModal] = useState(null); // meeting object
  const [inviteEmailInput, setInviteEmailInput] = useState('');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(null);

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

  const fetchData = useCallback(async (retryCount = 0) => {
    if (!useAuthStore.getState().user) return;
    try {
      const [meetRes, orgRes] = await Promise.all([
        api.get('/meetings'),
        api.get('/organizations/my'),
      ]);
      setMeetings(meetRes.data?.meetings || []);
      const freshOrgs = orgRes.data?.organizations || [];
      setOrganizations(freshOrgs);
      setShowAllMembersOrg(prev => {
        if (!prev) return null;
        return freshOrgs.find(o => o.id === prev.id) || prev;
      });
    } catch (err) {
      if (err.response?.status === 401) return;
      console.error('Failed to fetch data', err);
      // Auto-retry transient failures (e.g. PgBouncer reconnect)
      if (retryCount < 2) {
        setTimeout(() => fetchData(retryCount + 1), 1200 * (retryCount + 1));
      }
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

  // Dual real-time sync: SSE + Socket.IO + Polling
  useEffect(() => {
    if (!user) return;

    const sseUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/events`;
    const eventSource = new EventSource(sseUrl);

    eventSource.addEventListener('dashboard:refresh', () => {
      console.log('[SSE] dashboard:refresh event received -> refetching data');
      fetchData();
    });

    eventSource.onerror = (err) => {
      console.warn('[SSE] EventSource status / reconnecting:', err);
    };

    // Socket.IO real-time channel
    const socket = io(SOCKET_URL);
    socket.on('dashboard:refresh', () => {
      console.log('[Socket] dashboard:refresh received -> refetching data');
      fetchData();
    });
    if (user?.id) {
      socket.emit('user:register', { userId: user.id });
    }

    // Periodic heartbeat sync every 20 seconds
    const interval = setInterval(() => {
      fetchData();
    }, 20000);

    return () => {
      eventSource.close();
      socket.disconnect();
      clearInterval(interval);
    };
  }, [fetchData, user]);

  // ------- copy helper -------
  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  // ------- meeting handlers -------
  const handleCreateMeeting = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setIsCreating(true);
    try {
      const payload = { title: newTitle.trim() || 'Multilingual Meeting' };

      if (meetingMode === 'schedule' && scheduledTime) {
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
      console.error('Create meeting error:', err);
      setAlertMessage(err.response?.data?.error || err.message || 'Failed to create meeting.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinMeeting = (e) => {
    e.preventDefault();
    if (!joinLink.trim()) return;
    router.push(`/meeting/${joinLink.trim()}`);
  };

  const handleDeleteMeeting = (meetingId, isScheduledAndHost = false) => {
    setConfirmModal({
      title: isScheduledAndHost ? 'Cancel Scheduled Meeting' : 'Remove Meeting',
      message: isScheduledAndHost 
        ? 'Are you sure you want to cancel this scheduled meeting? It will be marked as Cancelled for all participants.' 
        : 'This will remove the meeting from your history.',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.delete(`/meetings/${meetingId}`);
          fetchData();
        } catch (err) {
          setAlertMessage('Failed to update meeting.');
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

  const handleJoinOrgByCode = async (e) => {
    e.preventDefault();
    const cleanCode = joinOrgCodeInput.trim().toUpperCase();
    if (!cleanCode) return;
    setJoinOrgLoading(true);
    setJoinOrgError(null);
    try {
      const res = await api.post('/organizations/join-by-code', { 
        code: cleanCode,
        accessCode: cleanCode 
      });
      setShowJoinOrgModal(false);
      setJoinOrgCodeInput('');
      setAlertMessage(res.data.message || 'Join request sent to the host successfully!');
      fetchData();
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to send join request.';
      setJoinOrgError(errMsg);
    } finally {
      setJoinOrgLoading(false);
    }
  };

  const handleApproveJoinRequest = async (requestId) => {
    try {
      const res = await api.post(`/organizations/join-requests/${requestId}/approve`);
      setAlertMessage(res.data.message || 'Join request approved!');
      fetchData();
    } catch (err) {
      setAlertMessage(err.response?.data?.error || 'Failed to approve join request.');
    }
  };

  const handleRejectJoinRequest = async (requestId) => {
    try {
      const res = await api.post(`/organizations/join-requests/${requestId}/reject`);
      setAlertMessage(res.data.message || 'Join request rejected.');
      fetchData();
    } catch (err) {
      setAlertMessage(err.response?.data?.error || 'Failed to reject join request.');
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
      console.error(err.response?.data?.error || 'Failed to toggle co-host');
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

  const handleSendEmailInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmailInput.trim() || !emailInviteModal) return;
    setIsSendingInvite(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const res = await api.post(`/meetings/${emailInviteModal.meetingLink}/invite`, {
        emails: inviteEmailInput.trim()
      });
      const count = res.data?.count || 1;
      setInviteSuccess(`Invitation email successfully sent to ${count} recipient${count > 1 ? 's' : ''}!`);
      setTimeout(() => {
        setEmailInviteModal(null);
        setInviteEmailInput('');
        setInviteSuccess(null);
      }, 1800);
    } catch (err) {
      console.error('Failed to send email invite', err);
      const errMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to send invitation. Please verify email addresses.';
      setInviteError(errMsg);
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleLogout = () => { logout(); router.push('/'); };

  if (!user) return null;

  // ------- derived state -------
  const upcomingMeetings = meetings.filter(m => m.state === 'SCHEDULED' || m.state === 'ONGOING');
  const historyMeetings  = meetings.filter(m => {
    if (m.state !== 'COMPLETED' && m.state !== 'CANCELLED') return false;
    // Host always sees their created meetings in history
    if (m.hostId === user?.id) return true;
    // Other participants only see the meeting if they were actually admitted/attended
    const part = m.participants?.find(p => p.userId === user?.id);
    return part && part.status === 'ADMITTED';
  });
  const hasLiveMeeting = upcomingMeetings.some(m => m.state === 'ONGOING');
  const userLangInfo = LANG_MAP[user?.language] || { name: user?.language?.toUpperCase() || 'EN', native: '' };
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
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => {
                  const m = meetings.find(item => item.meetingLink === scheduledMeetingCode) || { meetingLink: scheduledMeetingCode, title: 'Scheduled Meeting' };
                  setScheduledMeetingCode(null);
                  setEmailInviteModal(m);
                  setInviteEmailInput('');
                  setInviteError(null);
                  setInviteSuccess(null);
                }}
                style={{ flex: 1, padding: '0.875rem', background: '#0022FF', color: '#FDFBF7', border: '2px solid #111', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', boxShadow: '2px 2px 0 #111' }}
              >
                <Mail size={15} /> Send Invite
              </button>
              <button onClick={() => setScheduledMeetingCode(null)} style={{ flex: 1, padding: '0.875rem', background: '#111', color: '#FDFBF7', border: 'none', borderRadius: '0', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Email Invite Modal */}
      {emailInviteModal && (
        <div style={MODAL_STYLE.overlay} onClick={() => { if (!isSendingInvite) { setEmailInviteModal(null); setInviteError(null); setInviteSuccess(null); } }}>
          <div style={{ ...MODAL_STYLE.box, maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '2px solid #0A0A0A' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: 10, height: 10, background: '#0022FF' }} />
                <h2 style={{ margin: 0, color: '#0A0A0A', fontSize: '1.2rem', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700 }}>
                  Send Meeting Invitation
                </h2>
              </div>
              <button
                onClick={() => { setEmailInviteModal(null); setInviteError(null); setInviteSuccess(null); }}
                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
                disabled={isSendingInvite}
              >
                ×
              </button>
            </div>

            {/* Meeting Preview Dossier */}
            <div style={{ background: '#F7F5F0', border: '2px solid #0A0A0A', padding: '1rem', marginBottom: '1.25rem', boxShadow: '3px 3px 0 #0A0A0A' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', color: '#777', display: 'block' }}>Topic</span>
                <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0A0A0A', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                  {emailInviteModal.title || 'Untitled Meeting'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', color: '#777', display: 'block' }}>Meeting ID</span>
                  <code style={{ fontSize: '0.85rem', color: '#0022FF', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{emailInviteModal.meetingLink}</code>
                </div>
                {(emailInviteModal.startTime || emailInviteModal.scheduledTime) && (
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', color: '#777', display: 'block' }}>Scheduled For</span>
                    <span style={{ fontSize: '0.82rem', color: '#0A0A0A', fontFamily: 'var(--font-mono)' }}>
                      {new Date(emailInviteModal.startTime || emailInviteModal.scheduledTime).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {inviteSuccess && (
              <div style={{ background: '#ecfdf5', border: '2px solid #10b981', color: '#065f46', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600 }}>
                ✓ {inviteSuccess}
              </div>
            )}

            {inviteError && (
              <div style={{ background: '#fef2f2', border: '2px solid #ef4444', color: '#991b1b', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                ⚠ {inviteError}
              </div>
            )}

            <form onSubmit={handleSendEmailInvite}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#0A0A0A', fontFamily: 'var(--font-mono)' }}>
                  Recipient Email Address(es)
                </label>
                <input
                  type="text"
                  placeholder="colleague@example.com, team@partner.com"
                  className={styles.input}
                  value={inviteEmailInput}
                  onChange={e => { setInviteEmailInput(e.target.value); setInviteError(null); }}
                  required
                  disabled={isSendingInvite}
                  autoFocus
                  style={{ width: '100%', background: '#fff', border: '2px solid #0A0A0A', padding: '0.75rem 1rem', fontSize: '0.9rem', color: '#0A0A0A', outline: 'none', fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }}
                />
                <span style={{ display: 'block', marginTop: '0.4rem', fontSize: '0.75rem', color: '#666', lineHeight: 1.4 }}>
                  Invitees will receive a branded BhashaBridge email with the meeting ID, scheduled timing, and a 1-click join link. Separate multiple emails with commas.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => { setEmailInviteModal(null); setInviteError(null); setInviteSuccess(null); }}
                  disabled={isSendingInvite}
                  style={{ flex: 1, padding: '0.75rem', background: 'transparent', color: '#555', border: '2px solid #0A0A0A', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingInvite || !inviteEmailInput.trim()}
                  style={{ flex: 2, padding: '0.75rem', background: '#0022FF', color: '#F7F5F0', border: '2px solid #0A0A0A', fontWeight: 700, cursor: isSendingInvite ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '3px 3px 0 #0A0A0A' }}
                >
                  <Send size={15} />
                  <span>{isSendingInvite ? 'Sending...' : 'Send Invitation'}</span>
                </button>
              </div>
            </form>
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
          <div style={{ ...MODAL_STYLE.box, maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '2px solid #0A0A0A' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: 10, height: 10, background: '#0022FF' }} />
                <h2 style={{ margin: 0, color: '#0A0A0A', fontSize: '1.25rem', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 700 }}>
                  Create Organization
                </h2>
              </div>
              <button
                onClick={() => setShowOrgModal(false)}
                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <p style={{ margin: '0 0 1.25rem', color: '#555', fontSize: '0.85rem', lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}>
              Set up a shared workspace for your company or team. As the creator, you will be the organization Host.
            </p>
            <form onSubmit={handleCreateOrg}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', fontWeight: 700, color: '#0A0A0A', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                  Organization Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Engineering, Design Studio"
                  className={styles.input}
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  required
                  autoFocus
                  style={{ width: '100%', background: '#fff', border: '2px solid #0A0A0A', padding: '0.75rem 1rem', fontSize: '0.95rem', color: '#0A0A0A', outline: 'none', fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowOrgModal(false)}
                  style={{ flex: 1, padding: '0.8rem', background: 'transparent', color: '#555', border: '2px solid #0A0A0A', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ flex: 2, padding: '0.8rem', background: '#0022FF', color: '#F7F5F0', border: '2px solid #0A0A0A', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', boxShadow: '3px 3px 0 #0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                >
                  <Building size={15} />
                  <span>Create Organization</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Org with Code Modal */}
      {showJoinOrgModal && (
        <div style={MODAL_STYLE.overlay} onClick={() => { setShowJoinOrgModal(false); setJoinOrgError(null); }}>
          <div style={{ ...MODAL_STYLE.box, maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '2px solid #0A0A0A' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: 10, height: 10, background: '#FF3311' }} />
                <h2 style={{ margin: 0, color: '#0A0A0A', fontSize: '1.25rem', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 700 }}>
                  Join Organization
                </h2>
              </div>
              <button
                onClick={() => { setShowJoinOrgModal(false); setJoinOrgError(null); }}
                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <p style={{ margin: '0 0 1.25rem', color: '#555', fontSize: '0.85rem', lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}>
              Enter the organization access pass (e.g. <code>BB-E01D16</code>). The host or co-host will review and approve your membership.
            </p>
            {joinOrgError && (
              <div style={{ color: '#FF3311', background: 'rgba(255,51,17,0.06)', padding: '0.65rem 0.9rem', border: '2px solid #FF3311', marginBottom: '1.25rem', fontSize: '0.82rem', lineHeight: 1.4, fontFamily: 'var(--font-mono)' }}>
                ⚠ {joinOrgError}
              </div>
            )}
            <form onSubmit={handleJoinOrgByCode}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', fontWeight: 700, color: '#0A0A0A', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                  Organization Access Pass
                </label>
                <input
                  type="text"
                  placeholder="e.g. BB-E01D16"
                  className={styles.input}
                  value={joinOrgCodeInput}
                  onChange={e => { setJoinOrgCodeInput(e.target.value.toUpperCase()); setJoinOrgError(null); }}
                  required
                  autoFocus
                  style={{ width: '100%', background: '#fff', border: '2px solid #0A0A0A', padding: '0.75rem 1rem', fontSize: '1.1rem', color: '#0022FF', fontWeight: 700, outline: 'none', fontFamily: 'var(--font-mono)', letterSpacing: '1.5px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => { setShowJoinOrgModal(false); setJoinOrgError(null); }}
                  style={{ flex: 1, padding: '0.8rem', background: 'transparent', color: '#555', border: '2px solid #0A0A0A', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={joinOrgLoading || !joinOrgCodeInput.trim()}
                  style={{ flex: 2, padding: '0.8rem', background: '#0022FF', color: '#F7F5F0', border: '2px solid #0A0A0A', fontWeight: 700, cursor: joinOrgLoading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', boxShadow: '3px 3px 0 #0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                >
                  <Key size={15} />
                  <span>{joinOrgLoading ? 'Sending Request...' : 'Submit Request'}</span>
                </button>
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
            <div style={{ background: '#FDFBF7', border: '2px solid #111', padding: 'clamp(1rem, 4vw, 2rem)', boxShadow: '6px 6px 0 #111', width: '100%', maxWidth: '640px', maxHeight: '85vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #262626' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, color: '#111', fontSize: '1.1rem' }}>✨ AI Meeting Summary</h2>
                    {!summaryModal.loading && summaryModal.text && (
                      <button onClick={handleExportSummary} style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
          <div style={{ background: '#FDFBF7', border: '2px solid #111', padding: 'clamp(1rem, 4vw, 2rem)', boxShadow: '6px 6px 0 #111', width: '100%', maxWidth: '640px', maxHeight: '85vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid #111' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, color: '#111', fontSize: '1.1rem' }}>📝 Meeting Transcript</h2>
                {!transcriptModal.loading && transcriptModal.entries.length > 0 && (
                  <button onClick={handleExportTranscript} style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
          <div style={{ background: '#FDFBF7', border: '2px solid #0A0A0A', padding: 'clamp(1.25rem, 4vw, 2rem)', boxShadow: '6px 6px 0 #0A0A0A', width: '100%', maxWidth: '540px', maxHeight: '85vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '2px solid #0A0A0A' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: 10, height: 10, background: '#0022FF' }} />
                <div>
                  <h2 style={{ margin: 0, color: '#0A0A0A', fontSize: '1.25rem', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 700 }}>
                    {showAllMembersOrg.name} — Member Roster
                  </h2>
                  <p style={{ margin: '0.2rem 0 0', color: '#666', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                    Total: {showAllMembersOrg.users?.length || 0} active member{showAllMembersOrg.users?.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAllMembersOrg(null)}
                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingRight: '0.25rem' }}>
              {showAllMembersOrg.users?.map(u => {
                const isOrgOwner = u.id === showAllMembersOrg.ownerId;
                const isUserCoHost = showAllMembersOrg.coHosts?.some(c => c.id === u.id);
                return (
                  <div
                    key={u.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem 1rem',
                      background: '#F7F5F0',
                      border: '1px solid #0A0A0A',
                      gap: '1rem',
                      boxShadow: '1px 1px 0 #0A0A0A'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                      {u.avatar ? (
                        <img src={u.avatar} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '1px solid #0A0A0A', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: isOrgOwner ? '#FF3311' : (isUserCoHost ? '#0022FF' : '#555'), color: '#F7F5F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', fontWeight: 700, border: '1px solid #0A0A0A', flexShrink: 0 }}>
                          {(u.name || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, color: '#0A0A0A', fontSize: '0.9rem' }}>{u.name}</span>
                          <RoleBadge role={isOrgOwner ? 'HOST' : (isUserCoHost ? 'COHOST' : 'PARTICIPANT')} />
                        </div>
                        <p style={{ margin: '0.15rem 0 0', color: '#666', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                          {u.email}
                        </p>
                      </div>
                    </div>

                    {showAllMembersOrg.ownerId === user.id && u.id !== user.id && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                        <button
                          onClick={() => handleToggleOrgCoHost(showAllMembersOrg.id, u.id, isUserCoHost)}
                          title={isUserCoHost ? "Revoke Co-Host" : "Promote to Co-Host"}
                          style={{
                            background: '#FDFBF7',
                            color: isUserCoHost ? '#0022FF' : '#666',
                            border: '1px solid #0A0A0A',
                            padding: '0.3rem 0.6rem',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            cursor: 'pointer',
                            boxShadow: '1px 1px 0 #0A0A0A'
                          }}
                        >
                          {isUserCoHost ? '★ Co-Host' : '☆ Make Co-Host'}
                        </button>
                        <button
                          onClick={() => handleRemoveMember(showAllMembersOrg.id, u.id, u.name)}
                          title={`Remove ${u.name}`}
                          style={{
                            background: '#FDFBF7',
                            color: '#FF3311',
                            border: '1px solid #FF3311',
                            padding: '0.3rem 0.6rem',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            cursor: 'pointer',
                            boxShadow: '1px 1px 0 #FF3311'
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== MAIN CONTENT ===== */}
      <div className={`${styles.container} animate-fade-in`}>

        {/* Header */}
        <header className={styles.header}>
          <div className={styles.brandGroup}>
            <h1 className={styles.title}>
              BhashaBridge <span className={styles.titleArchive}>/ Workspace</span>
            </h1>
            <div className={styles.brandMeta}>
              <span className={styles.versionBadge}>v2.4 Live</span>
              <span>•</span>
              <span>Multilingual Conference Hub</span>
              <span>•</span>
              <span style={{ color: '#10B981', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <span className={styles.pulseDotGreen} style={{ width: 6, height: 6 }} /> WebRTC Mesh Online
              </span>
            </div>
          </div>

          <div className={styles.userInfo}>
            {/* User Capsule */}
            <div className={styles.userCapsule}>
              <div className={styles.avatarCircle}>
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className={styles.avatarImg} />
                ) : (
                  (user.name || '?').charAt(0).toUpperCase()
                )}
              </div>
              <div className={styles.userTexts}>
                <span className={styles.userName}>{user.name}</span>
                <span className={styles.userLangTag}>
                  <Globe size={11} color="var(--cobalt)" />
                  <span>{userLangInfo.name} ({user.language?.toUpperCase()})</span>
                </span>
              </div>
            </div>

            {/* Admin Panel button if ORG_ADMIN or PLATFORM_ADMIN */}
            {(user.role === 'ORG_ADMIN' || user.role === 'PLATFORM_ADMIN') && (
              <Link href="/admin" className={`${styles.navActionBtn} ${styles.adminBtn}`}>
                <Shield size={13} />
                <span>Admin</span>
              </Link>
            )}

            {/* Edit Profile */}
            <button
              onClick={() => { setEditName(user.name); setEditLanguage(user.language); setEditAvatar(user.avatar || ''); setShowProfileModal(true); }}
              className={styles.navActionBtn}
            >
              <UserIcon size={13} />
              <span>Profile</span>
            </button>

            {/* Notification Bell */}
            <NotificationBell />

            {/* Logout */}
            <button onClick={handleLogout} className={`${styles.navActionBtn} ${styles.logoutBtn}`}>
              <LogOut size={13} />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Executive Hero & KPI Metrics Strip */}
        <section className={styles.heroStrip}>
          <div className={styles.heroTopRow}>
            <div>
              <h2 className={styles.heroGreeting}>Welcome back, {user.name}.</h2>
              <p className={styles.heroSubtitle}>
                Multilingual conference control center. Speak in your native dialect; peers receive live translated subtitles and synthetic speech in real-time.
              </p>
            </div>
            <div className={styles.systemStatusPill}>
              {hasLiveMeeting ? (
                <>
                  <span className={styles.pulseDotRed} />
                  <span style={{ color: 'var(--vermilion)' }}>Meeting in Progress</span>
                </>
              ) : (
                <>
                  <span className={styles.pulseDotGreen} />
                  <span>All Systems Operational</span>
                </>
              )}
            </div>
          </div>

          {/* 4-KPI Grid */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Upcoming Meetings</span>
                {hasLiveMeeting ? <Radio size={16} color="var(--vermilion)" /> : <Calendar size={16} color="var(--cobalt)" />}
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{upcomingMeetings.length}</span>
                {hasLiveMeeting && (
                  <span className={styles.liveBadge} style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                    ● 1 Live
                  </span>
                )}
              </div>
              <span className={styles.kpiSub}>Scheduled or currently active</span>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Meeting Archive</span>
                <Clock size={16} color="var(--muted)" />
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{historyMeetings.length}</span>
              </div>
              <span className={styles.kpiSub}>Transcripts & summaries recorded</span>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Organizations</span>
                <Building size={16} color="var(--cobalt)" />
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{organizations.length}</span>
              </div>
              <span className={styles.kpiSub}>Team workspaces & access passes</span>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Speech Translation</span>
                <Sparkles size={16} color="#D97706" />
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue} style={{ fontSize: '1.75rem' }}>10+</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700 }}>LANGS</span>
              </div>
              <span className={styles.kpiSub}>Sub-350ms neural latency</span>
            </div>
          </div>
        </section>

        <div className={styles.grid}>
          {/* ===== LEFT COLUMN ===== */}
          <div className={styles.leftCol}>

            {/* Launch Meeting Card */}
            <div className={styles.actionCard}>
              <div className={styles.cardHeaderRow}>
                <span className={styles.cardDot} style={{ background: meetingMode === 'instant' ? 'var(--vermilion)' : 'var(--cobalt)' }} />
                <h3 className={styles.cardTitle}>
                  {meetingMode === 'instant' ? 'Instant Meeting' : 'Schedule Meeting'}
                </h3>
              </div>

              {/* Segmented Switch */}
              <div className={styles.segmentedSwitch}>
                <button
                  type="button"
                  onClick={() => { setMeetingMode('instant'); setScheduledTime(''); }}
                  className={`${styles.switchBtn} ${meetingMode === 'instant' ? styles.switchBtnActive : ''}`}
                >
                  <Zap size={13} />
                  <span>Instant</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMeetingMode('schedule')}
                  className={`${styles.switchBtn} ${meetingMode === 'schedule' ? styles.switchBtnActive : ''}`}
                >
                  <Calendar size={13} />
                  <span>Schedule</span>
                </button>
              </div>

              <form onSubmit={handleCreateMeeting} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Meeting Topic</label>
                  <input
                    type="text"
                    placeholder="e.g. Design Review, Multilingual Sync"
                    className={styles.brutalistInput}
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                  />
                </div>

                {organizations.some(org => org.ownerId === user.id || org.coHosts?.some(c => c.id === user.id)) && (
                  <div className={styles.inputGroup}>
                    <label className={styles.inputLabel}>Organization (Optional)</label>
                    <select
                      className={styles.brutalistSelect}
                      value={selectedOrgId}
                      onChange={e => setSelectedOrgId(e.target.value)}
                    >
                      <option value="">No Organization (Personal Room)</option>
                      {organizations
                        .filter(org => org.ownerId === user.id || org.coHosts?.some(c => c.id === user.id))
                        .map(org => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {meetingMode === 'schedule' && (
                  <div className={styles.inputGroup}>
                    <label className={styles.inputLabel}>Scheduled Time</label>
                    <input
                      type="datetime-local"
                      className={`${styles.brutalistInput} ${styles.monoInput}`}
                      value={scheduledTime}
                      min={new Date().toISOString().slice(0, 16)}
                      onChange={e => setScheduledTime(e.target.value)}
                      required={meetingMode === 'schedule'}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className={`${styles.btnLaunch} ${meetingMode === 'schedule' ? styles.btnSchedule : ''}`}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : meetingMode === 'instant' ? (
                    <Video size={16} />
                  ) : (
                    <CalendarCheck2 size={16} />
                  )}
                  <span>
                    {isCreating ? 'CREATING...' : meetingMode === 'instant' ? 'LAUNCH INSTANT MEETING' : 'SCHEDULE CONFERENCE'}
                  </span>
                </button>
              </form>
            </div>

            {/* Join by Code Card */}
            <div className={styles.actionCard}>
              <div className={styles.cardHeaderRow}>
                <span className={styles.cardDot} style={{ background: 'var(--ink)' }} />
                <h3 className={styles.cardTitle}>Join by Code</h3>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                Have an invite code or room pass? Enter it below to join the conference directly.
              </p>
              <form onSubmit={handleJoinMeeting} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <input
                  type="text"
                  placeholder="e.g. bha-lob-786"
                  className={`${styles.brutalistInput} ${styles.monoInput}`}
                  value={joinLink}
                  onChange={e => setJoinLink(e.target.value)}
                  required
                />
                <button type="submit" className={styles.btnJoinCode}>
                  <ArrowRight size={15} />
                  <span>JOIN CONFERENCE</span>
                </button>
              </form>
            </div>

            {/* Tip / Intelligence dossier card */}
            <div className={styles.tipCard}>
              <div className={styles.tipHeader}>
                <Sparkles size={14} color="var(--cobalt)" />
                <span>Multilingual Intelligence</span>
              </div>
              <p className={styles.tipText}>
                Your audio will be recognized in <strong>{userLangInfo.name}</strong> and translated on-the-fly for listeners across Bengali, French, German, Gujarati, Hindi, Marathi, Spanish, Tamil, and Telugu.
              </p>
            </div>
          </div>

          {/* ===== RIGHT COLUMN ===== */}
          <div className={styles.rightCol}>
            <div className={styles.workspaceCard}>

              {/* Tabs */}
              <div className={styles.tabsContainer}>
                {[
                  { id: 'upcoming', label: 'Upcoming', count: upcomingMeetings.length, hasLive: hasLiveMeeting },
                  { id: 'history', label: 'History', count: historyMeetings.length },
                  { id: 'organizations', label: 'Organizations', count: organizations.length }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`${styles.tabBtn} ${activeTab === t.id ? styles.tabBtnActive : styles.tabBtnInactive}`}
                  >
                    {t.hasLive && <span className={styles.pulseDotRed} style={{ width: 6, height: 6 }} />}
                    <span>{t.label}</span>
                    <span className={styles.tabCounterBadge}>
                      {t.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* ===== ORGANIZATIONS TAB ===== */}
              {activeTab === 'organizations' && (
                <div>
                  {/* Tab Top Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1.25rem', borderBottom: '2px solid #0A0A0A', paddingBottom: '1.25rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{ width: 12, height: 12, background: '#0022FF' }} />
                        <h3 style={{ margin: 0, color: '#0A0A0A', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '1.85rem', fontWeight: 600 }}>
                          Team Organizations
                        </h3>
                      </div>
                      <p style={{ margin: '0.35rem 0 0', color: '#5A5A5A', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                        Collaborative spaces for team meetings, role delegations, and shared access passes.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setShowJoinOrgModal(true)}
                        style={{
                          background: '#F7F5F0',
                          color: '#0A0A0A',
                          border: '2px solid #0A0A0A',
                          padding: '0.6rem 1.1rem',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          fontFamily: 'var(--font-mono)',
                          textTransform: 'uppercase',
                          boxShadow: '3px 3px 0 #0A0A0A',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                        }}
                      >
                        <Key size={14} />
                        <span>Join with Code</span>
                      </button>
                      <button
                        onClick={() => setShowOrgModal(true)}
                        style={{
                          background: '#0022FF',
                          color: '#F7F5F0',
                          border: '2px solid #0A0A0A',
                          padding: '0.6rem 1.15rem',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          fontFamily: 'var(--font-mono)',
                          textTransform: 'uppercase',
                          boxShadow: '3px 3px 0 #0A0A0A',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                        }}
                      >
                        <Building size={14} />
                        <span>+ Create Org</span>
                      </button>
                    </div>
                  </div>

                  {/* Empty State */}
                  {organizations.length === 0 ? (
                    <div style={{
                      background: '#FDFBF7',
                      border: '2px solid #0A0A0A',
                      boxShadow: '6px 6px 0 #0A0A0A',
                      padding: '3.5rem 2rem',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '1.25rem'
                    }}>
                      <div style={{
                        width: 68,
                        height: 68,
                        background: '#0022FF',
                        color: '#F7F5F0',
                        border: '2px solid #0A0A0A',
                        boxShadow: '4px 4px 0 #0A0A0A',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Building size={32} />
                      </div>
                      <div>
                        <h4 style={{ margin: '0 0 0.5rem', color: '#0A0A0A', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '1.85rem', fontWeight: 600 }}>
                          No Organizations Joined Yet
                        </h4>
                        <p style={{ margin: 0, color: '#555', maxWidth: 520, lineHeight: 1.6, fontSize: '0.88rem', fontFamily: 'var(--font-mono)' }}>
                          Organizations unify team collaboration on BhashaBridge. Create an organization to schedule meetings with persistent access passes, delegate co-host powers, and manage participant rosters.
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button
                          onClick={() => setShowOrgModal(true)}
                          style={{
                            background: '#0022FF',
                            color: '#F7F5F0',
                            border: '2px solid #0A0A0A',
                            padding: '0.75rem 1.5rem',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            textTransform: 'uppercase',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            boxShadow: '3px 3px 0 #0A0A0A',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}
                        >
                          <Building size={15} />
                          <span>+ Create Organization</span>
                        </button>
                        <button
                          onClick={() => setShowJoinOrgModal(true)}
                          style={{
                            background: '#F7F5F0',
                            color: '#0A0A0A',
                            border: '2px solid #0A0A0A',
                            padding: '0.75rem 1.5rem',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            textTransform: 'uppercase',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            boxShadow: '3px 3px 0 #0A0A0A',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}
                        >
                          <Key size={15} />
                          <span>Join with Code</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                      {organizations.map(org => {
                        const isOwner = org.ownerId === user.id;
                        const isCoHost = org.coHosts?.some(c => c.id === user.id);
                        const hasJoinRequests = (isOwner || isCoHost) && org.joinRequests?.length > 0;
                        const role = isOwner ? 'HOST' : (isCoHost ? 'COHOST' : 'PARTICIPANT');

                        return (
                          <div key={org.id} className={styles.orgCard}>
                            {/* Org Header Row */}
                            <div className={styles.orgHeaderRow}>
                              <div className={styles.orgTitleArea}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                                  <div style={{ width: 10, height: 10, background: isOwner ? '#FF3311' : (isCoHost ? '#0022FF' : '#0A0A0A'), flexShrink: 0 }} />
                                  <h4 className={styles.orgTitle}>
                                    {org.name}
                                  </h4>
                                  <RoleBadge role={role} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', fontSize: '0.8rem', color: '#555', fontFamily: 'var(--font-mono)' }}>
                                  <span>Hosted by: <strong style={{ color: '#0A0A0A' }}>{isOwner ? 'You (Owner)' : org.owner?.name}</strong></span>
                                  <span>•</span>
                                  <span>{org.users?.length || 0} Member{org.users?.length !== 1 ? 's' : ''}</span>
                                  {hasJoinRequests && (
                                    <>
                                      <span>•</span>
                                      <span style={{ color: '#FF3311', fontWeight: 700 }}>
                                        ⚠ {org.joinRequests.length} Pending Request{org.joinRequests.length !== 1 ? 's' : ''}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Access Code & Controls */}
                              <div className={styles.orgAccessControlArea}>
                                <div className={styles.orgPassBox}>
                                  <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#666', textTransform: 'uppercase', fontWeight: 700 }}>
                                    Pass Code:
                                  </span>
                                  <code style={{ color: '#0022FF', fontWeight: 700, fontSize: '0.92rem', fontFamily: 'var(--font-mono)', letterSpacing: '1px' }}>
                                    {org.accessCode}
                                  </code>
                                  <button
                                    onClick={() => copyCode(org.accessCode)}
                                    title={copiedCode === org.accessCode ? 'Copied code!' : 'Copy access code'}
                                    style={{
                                      background: copiedCode === org.accessCode ? '#10b981' : '#0A0A0A',
                                      border: 'none',
                                      color: '#F7F5F0',
                                      cursor: 'pointer',
                                      padding: '0.25rem 0.5rem',
                                      fontSize: '0.72rem',
                                      fontFamily: 'var(--font-mono)',
                                      fontWeight: 700,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                    }}
                                  >
                                    {copiedCode === org.accessCode ? <Check size={12} /> : <Copy size={12} />}
                                    <span>{copiedCode === org.accessCode ? 'Copied' : 'Copy'}</span>
                                  </button>
                                </div>

                                <div className={styles.orgControlsButtons}>
                                  {isOwner ? (
                                    <>
                                      <button
                                        onClick={() => handleRegenerateCode(org.id)}
                                        title="Generate a new access code. Old code will expire immediately."
                                        style={{
                                          background: '#F7F5F0',
                                          color: '#0A0A0A',
                                          border: '1px solid #0A0A0A',
                                          padding: '0.3rem 0.65rem',
                                          fontSize: '0.75rem',
                                          fontWeight: 700,
                                          fontFamily: 'var(--font-mono)',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.3rem',
                                          boxShadow: '1px 1px 0 #0A0A0A'
                                        }}
                                      >
                                        <RefreshCw size={11} /> Regenerate
                                      </button>
                                      <button
                                        onClick={() => handleDeleteOrg(org.id, org.name)}
                                        title="Permanently delete organization"
                                        style={{
                                          background: '#F7F5F0',
                                          color: '#FF3311',
                                          border: '1px solid #FF3311',
                                          padding: '0.3rem 0.65rem',
                                          fontSize: '0.75rem',
                                          fontWeight: 700,
                                          fontFamily: 'var(--font-mono)',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.3rem',
                                          boxShadow: '1px 1px 0 #FF3311'
                                        }}
                                      >
                                        <Trash2 size={11} /> Delete Org
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => handleLeaveOrg(org.id, org.name)}
                                      style={{
                                        background: '#F7F5F0',
                                        color: '#FF3311',
                                        border: '1px solid #FF3311',
                                        padding: '0.35rem 0.75rem',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        fontFamily: 'var(--font-mono)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        boxShadow: '1px 1px 0 #FF3311'
                                      }}
                                    >
                                      <LogOut size={12} /> Leave Org
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Pending Join Requests (Host / Co-host Action Required) */}
                            {hasJoinRequests && (
                              <div style={{
                                background: 'rgba(255,51,17,0.04)',
                                border: '2px solid #FF3311',
                                boxShadow: '3px 3px 0 #FF3311',
                                padding: '1rem'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    <span style={{ background: '#FF3311', color: '#F7F5F0', padding: '0.15rem 0.4rem', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                      ACTION REQUIRED
                                    </span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FF3311', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                                      Pending Join Requests ({org.joinRequests.length})
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '0.75rem', color: '#666', fontFamily: 'var(--font-mono)' }}>
                                    Approve or reject applicant requests below
                                  </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  {org.joinRequests.map(req => (
                                    <div
                                      key={req.id}
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        background: '#FDFBF7',
                                        border: '1px solid #0A0A0A',
                                        padding: '0.65rem 0.85rem',
                                        gap: '0.75rem',
                                        flexWrap: 'wrap',
                                        boxShadow: '1px 1px 0 #0A0A0A'
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                        {req.user?.avatar ? (
                                          <img src={req.user.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid #0A0A0A' }} />
                                        ) : (
                                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0022FF', color: '#FDFBF7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, border: '1px solid #0A0A0A' }}>
                                            {(req.user?.name || req.user?.email || '?').charAt(0).toUpperCase()}
                                          </div>
                                        )}
                                        <div>
                                          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0A0A0A' }}>{req.user?.name || 'Applicant'}</span>
                                          <span style={{ fontSize: '0.78rem', color: '#666', marginLeft: '0.5rem', fontFamily: 'var(--font-mono)' }}>({req.user?.email})</span>
                                        </div>
                                      </div>

                                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                                        <button
                                          onClick={() => handleApproveJoinRequest(req.id)}
                                          style={{
                                            background: '#10b981',
                                            color: '#F7F5F0',
                                            border: '1px solid #0A0A0A',
                                            padding: '0.35rem 0.85rem',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            fontFamily: 'var(--font-mono)',
                                            textTransform: 'uppercase',
                                            boxShadow: '2px 2px 0 #0A0A0A'
                                          }}
                                        >
                                          ✓ Approve
                                        </button>
                                        <button
                                          onClick={() => handleRejectJoinRequest(req.id)}
                                          style={{
                                            background: '#FF3311',
                                            color: '#F7F5F0',
                                            border: '1px solid #0A0A0A',
                                            padding: '0.35rem 0.85rem',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            fontFamily: 'var(--font-mono)',
                                            textTransform: 'uppercase',
                                            boxShadow: '2px 2px 0 #0A0A0A'
                                          }}
                                        >
                                          ✕ Reject
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Members Roster Section */}
                            <div style={{ borderTop: '2px solid #0A0A0A', paddingTop: '1rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <span style={{ fontSize: '0.78rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                  Membership Roster ({org.users?.length || 0})
                                </span>
                                {(org.users?.length || 0) > 6 && (
                                  <button
                                    onClick={() => setShowAllMembersOrg(org)}
                                    style={{
                                      background: 'transparent',
                                      color: '#0022FF',
                                      border: 'none',
                                      cursor: 'pointer',
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      fontFamily: 'var(--font-mono)',
                                      textDecoration: 'underline'
                                    }}
                                  >
                                    View All ({org.users.length}) &rarr;
                                  </button>
                                )}
                              </div>

                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                {org.users?.slice(0, 6).map(u => {
                                  const isOrgOwner = u.id === org.ownerId;
                                  const isUserCoHost = org.coHosts?.some(c => c.id === u.id);
                                  return (
                                    <div
                                      key={u.id}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        background: '#F7F5F0',
                                        border: '1px solid #0A0A0A',
                                        padding: '0.35rem 0.75rem',
                                        fontSize: '0.82rem',
                                        color: '#0A0A0A',
                                        boxShadow: '1px 1px 0 #0A0A0A'
                                      }}
                                    >
                                      {u.avatar ? (
                                        <img src={u.avatar} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', border: '1px solid #0A0A0A' }} />
                                      ) : (
                                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: isOrgOwner ? '#FF3311' : (isUserCoHost ? '#0022FF' : '#555'), color: '#F7F5F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700 }}>
                                          {(u.name || '?').charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                      <span style={{ fontWeight: 600 }}>{u.name}</span>
                                      {isOrgOwner ? (
                                        <RoleBadge role="HOST" />
                                      ) : isUserCoHost ? (
                                        <RoleBadge role="COHOST" />
                                      ) : null}

                                      {isOwner && u.id !== user.id && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.25rem', borderLeft: '1px solid #CCC', paddingLeft: '0.35rem' }}>
                                          <button
                                            onClick={() => handleToggleOrgCoHost(org.id, u.id, isUserCoHost)}
                                            title={isUserCoHost ? "Revoke Co-Host privileges" : "Promote to Co-Host"}
                                            style={{
                                              background: 'none',
                                              border: 'none',
                                              color: isUserCoHost ? '#0022FF' : '#999',
                                              cursor: 'pointer',
                                              padding: 0,
                                              fontSize: '0.95rem',
                                              lineHeight: 1,
                                            }}
                                          >
                                            ★
                                          </button>
                                          <button
                                            onClick={() => handleRemoveMember(org.id, u.id, u.name)}
                                            title={`Remove ${u.name} from organization`}
                                            style={{
                                              background: 'none',
                                              border: 'none',
                                              color: '#FF3311',
                                              cursor: 'pointer',
                                              padding: 0,
                                              fontSize: '1rem',
                                              lineHeight: 1
                                            }}
                                          >
                                            ×
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}

                                {(org.users?.length || 0) > 6 && (
                                  <button
                                    onClick={() => setShowAllMembersOrg(org)}
                                    style={{
                                      background: '#FDFBF7',
                                      color: '#0A0A0A',
                                      border: '1px solid #0A0A0A',
                                      padding: '0.35rem 0.65rem',
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      fontFamily: 'var(--font-mono)',
                                      cursor: 'pointer',
                                      boxShadow: '1px 1px 0 #0A0A0A'
                                    }}
                                  >
                                    +{org.users.length - 6} more
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Pending Invitations Strip */}
                            {isOwner && org.invitations?.length > 0 && (
                              <div style={{ borderTop: '1px dashed #0A0A0A', paddingTop: '0.75rem' }}>
                                <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                  Pending Email Invitations ({org.invitations.length})
                                </p>
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  {org.invitations.map(inv => (
                                    <span
                                      key={inv.id}
                                      style={{
                                        background: '#FEF9C3',
                                        color: '#854D0E',
                                        border: '1px solid #0A0A0A',
                                        padding: '0.2rem 0.55rem',
                                        fontSize: '0.75rem',
                                        fontFamily: 'var(--font-mono)',
                                        boxShadow: '1px 1px 0 #0A0A0A',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem'
                                      }}
                                    >
                                      <Clock size={11} />
                                      <span>{inv.email}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Invite Form (Owner Only) */}
                            {isOwner && (
                              <div style={{ borderTop: '2px solid #0A0A0A', paddingTop: '1rem' }}>
                                <span style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                  Invite Members via Email
                                </span>
                                <form
                                  onSubmit={e => handleInviteMembers(e, org.id)}
                                  style={{ display: 'flex', gap: '0.6rem', alignItems: 'stretch', flexWrap: 'wrap' }}
                                >
                                  <input
                                    type="text"
                                    placeholder="colleague@domain.com, partner@team.org"
                                    ref={el => { if (el) inviteEmailRefs.current[org.id] = el; }}
                                    className={styles.input}
                                    style={{
                                      flex: 1,
                                      minWidth: 'min(240px, 100%)',
                                      margin: 0,
                                      padding: '0.65rem 0.9rem',
                                      background: '#fff',
                                      border: '2px solid #0A0A0A',
                                      fontSize: '0.85rem',
                                      fontFamily: 'var(--font-mono)',
                                      color: '#0A0A0A',
                                      boxShadow: '2px 2px 0 #0A0A0A',
                                      boxSizing: 'border-box'
                                    }}
                                  />
                                  <button
                                    type="submit"
                                    style={{
                                      background: '#0022FF',
                                      color: '#F7F5F0',
                                      border: '2px solid #0A0A0A',
                                      padding: '0.65rem 1.4rem',
                                      fontWeight: 700,
                                      fontFamily: 'var(--font-mono)',
                                      cursor: 'pointer',
                                      whiteSpace: 'nowrap',
                                      fontSize: '0.85rem',
                                      textTransform: 'uppercase',
                                      boxShadow: '2px 2px 0 #0A0A0A',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.4rem'
                                    }}
                                  >
                                    <Mail size={14} />
                                    <span>Send Invite</span>
                                  </button>
                                </form>
                              </div>
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
                    <div className={styles.emptyStateCard}>
                      <div className={styles.emptyStateIcon}>
                        {activeTab === 'upcoming' ? <Calendar size={32} /> : <Clock size={32} />}
                      </div>
                      <h3 className={styles.emptyStateTitle}>
                        {activeTab === 'upcoming'
                          ? 'No Upcoming Sessions Scheduled'
                          : 'No Past Archives Found'}
                      </h3>
                      <p className={styles.emptyStateText}>
                        {activeTab === 'upcoming'
                          ? 'You do not have any active or scheduled briefings right now. Launch an instant room or schedule one using the dispatcher on the left.'
                          : 'Once meetings wrap up, their audio transcripts, AI executive summaries, multilingual metrics, and attendance manifests will appear here.'}
                      </p>
                      {activeTab === 'upcoming' && (
                        <button
                          onClick={() => {
                            setMeetingMode('instant');
                            setNewTitle('Instant Briefing');
                            window.scrollTo({ top: 300, behavior: 'smooth' });
                          }}
                          className={styles.btnLaunch}
                          style={{ maxWidth: '300px', marginTop: '0.5rem' }}
                        >
                          <Zap size={16} />
                          <span>Launch Instant Meeting Now</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className={styles.meetingList}>
                      {displayMeetings.map(m => {
                        const isMainHost = m.hostId === user?.id;
                        const participant = m.participants?.find(p => p.userId === user?.id);
                        const role = isMainHost ? 'HOST' : (participant?.role || 'PARTICIPANT');
                        const isHostOrCoHost = isMainHost || participant?.role === 'COHOST';

                        return (
                          <div key={m.id} className={styles.meetingDossierCard}>
                            {/* Top row: Badges + Title */}
                            <div className={styles.dossierTopRow}>
                              <div className={styles.dossierTitleArea}>
                                <div className={styles.dossierBadgeRow}>
                                  {m.state === 'ONGOING' ? (
                                    <span className={styles.liveBadge}>
                                      <Radio size={12} />
                                      <span>LIVE NOW</span>
                                    </span>
                                  ) : m.state === 'SCHEDULED' ? (
                                    <span className={styles.scheduledBadge}>
                                      <Calendar size={12} />
                                      <span>SCHEDULED</span>
                                    </span>
                                  ) : m.state === 'COMPLETED' ? (
                                    <span className={styles.completedBadge}>
                                      <span>COMPLETED</span>
                                    </span>
                                  ) : (
                                    <span className={styles.cancelledBadge}>
                                      <span>{m.state}</span>
                                    </span>
                                  )}
                                  <RoleBadge role={role} />
                                </div>
                                <h3 className={styles.dossierTitle}>{m.title || 'Untitled Session'}</h3>
                              </div>
                            </div>

                            {/* Meta strip */}
                            <div className={styles.dossierMetaStrip}>
                              <div className={styles.dossierMetaItem} style={{ width: '100%' }}>
                                <span className={styles.meetingIdPill}>
                                  <code>ID: {m.meetingLink}</code>
                                  <button
                                    onClick={() => {
                                      const fullUrl = `${window.location.origin}/meeting/${m.meetingLink}`;
                                      navigator.clipboard.writeText(fullUrl);
                                      setCopiedCode(m.meetingLink);
                                      setTimeout(() => setCopiedCode(null), 2000);
                                    }}
                                    className={styles.copyCodeBtn}
                                    title="Copy Invite Link"
                                  >
                                    {copiedCode === m.meetingLink ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                                    <span>{copiedCode === m.meetingLink ? 'Copied' : 'Copy Link'}</span>
                                  </button>
                                </span>
                              </div>
                              <div className={styles.dossierMetaItem}>
                                <span>Host: <strong>{m.host?.name || 'Unknown'}</strong></span>
                              </div>
                              <div className={styles.dossierMetaItem}>
                                <Calendar size={13} />
                                <span>
                                  {(m.startTime || m.scheduledAt)
                                    ? new Date(m.startTime || m.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                                    : new Date(m.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                </span>
                              </div>
                            </div>

                            {/* Actions row */}
                            <div className={styles.dossierActionsRow}>
                              {activeTab === 'history' ? (
                                <>
                                  {m.state === 'COMPLETED' ? (
                                    <>
                                      <button
                                        onClick={() => handleViewTranscript(m.meetingLink)}
                                        className={styles.btnActionSecondary}
                                      >
                                        <FileText size={14} />
                                        <span>Transcript</span>
                                      </button>
                                      <button
                                        onClick={(e) => { e.preventDefault(); handleViewSummary(m.meetingLink); }}
                                        className={styles.btnActionSecondary}
                                      >
                                        <Sparkles size={14} />
                                        <span>AI Summary</span>
                                      </button>
                                      <Link
                                        href={`/meeting/${m.meetingLink}/report`}
                                        className={`${styles.btnActionSecondary} ${styles.btnActionReport}`}
                                      >
                                        <BarChart3 size={14} />
                                        <span>Executive Report</span>
                                      </Link>
                                    </>
                                  ) : (
                                    <span className={styles.cancelledBadge}>Archived</span>
                                  )}
                                  <button
                                    onClick={() => handleDeleteMeeting(m.id, false)}
                                    title="Delete Record"
                                    className={styles.btnActionDelete}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  {isHostOrCoHost && (
                                    <button
                                      onClick={() => {
                                        setEmailInviteModal(m);
                                        setInviteEmailInput('');
                                        setInviteError(null);
                                        setInviteSuccess(null);
                                      }}
                                      title="Send invitation via email"
                                      className={`${styles.btnActionSecondary} ${styles.btnActionInvite}`}
                                    >
                                      <Mail size={15} />
                                      <span>Send Invite</span>
                                    </button>
                                  )}
                                  <Link
                                    href={`/meeting/${m.meetingLink}`}
                                    className={styles.btnActionPrimary}
                                  >
                                    <span>{m.state === 'SCHEDULED' ? (isHostOrCoHost ? 'Start Session' : 'Join Room') : 'Enter Live Room'}</span>
                                    <ArrowRight size={15} />
                                  </Link>
                                  <button
                                    onClick={() => handleDeleteMeeting(m.id, m.state === 'SCHEDULED' && m.hostId === user?.id)}
                                    title={m.state === 'SCHEDULED' && m.hostId === user?.id ? "Cancel Meeting" : "Remove"}
                                    className={styles.btnActionDelete}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              )}
                            </div>

                            {/* History: Attendance Log */}
                            {activeTab === 'history' && m.participants?.length > 0 && (
                              <div style={{
                                padding: '0.85rem 0.75rem',
                                border: '2px solid #0A0A0A',
                                background: '#FFFFFF',
                                boxShadow: '2px 2px 0 #0A0A0A',
                                marginTop: '0.25rem',
                                maxWidth: '100%',
                                boxSizing: 'border-box',
                                overflow: 'hidden'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#0A0A0A' }}>
                                    Attendance Manifest ({m.participants.length} Users)
                                  </span>
                                  <button
                                    onClick={(e) => { e.preventDefault(); handleExportAttendance(m); }}
                                    style={{
                                      background: 'transparent',
                                      color: '#0022FF',
                                      border: '1px solid #0022FF',
                                      padding: '0.2rem 0.5rem',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      fontFamily: 'var(--font-mono)',
                                      textTransform: 'uppercase',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem'
                                    }}
                                  >
                                    <span>Export CSV</span>
                                  </button>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                  {m.participants.map(p => (
                                    <div key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', border: '1px solid #0A0A0A', background: '#FDFBF7', padding: '0.2rem 0.5rem', fontSize: '0.75rem', color: '#0A0A0A', fontFamily: 'var(--font-mono)', maxWidth: '100%' }}>
                                      <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{p.user?.name || 'Unknown'}</strong>
                                      <span style={{ fontSize: '0.65rem', color: '#FF3311', fontWeight: 800, textTransform: 'uppercase' }}>({p.role})</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Show more / less for history */}
                      {activeTab === 'history' && historyMeetings.length > 3 && (
                        <div style={{ textAlign: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '2px dashed #0A0A0A' }}>
                          <button
                            onClick={() => setShowAllHistory(!showAllHistory)}
                            className={styles.btnActionSecondary}
                            style={{ margin: '0 auto', fontSize: '0.78rem', padding: '0.5rem 1rem' }}
                          >
                            {showAllHistory ? '▲ Show Less' : `▼ View All ${historyMeetings.length} Meeting Archives`}
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






