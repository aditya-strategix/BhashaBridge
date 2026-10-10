'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Send,
  Users, Settings, Shield, UserCheck, UserX,
  MessageSquare, Globe, ChevronRight, VolumeX, MoreVertical, Star, Trash2, X,
  Copy, Check, Clock, AlertCircle, FileText, ArrowLeft, RefreshCw
} from 'lucide-react';
import useAuthStore from '../../../stores/authStore';
import styles from './meeting.module.css';
import './theme.css';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const LANG_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'bn', label: 'Bengali' },
];

// -------- Avatar initial --------
function Avatar({ name, size = 36, color = '#0022FF', avatarUrl }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.38, color: '#F7F5F0', flexShrink: 0,
      border: '2px solid #0A0A0A',
    }}>
      {avatarUrl ? <img src={avatarUrl} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

// -------- Video peer tile --------
const VideoPeer = ({ peer, name, role, isAudioOn = true, isVideoOn = true, avatarUrl }) => {
  const ref = useRef();
  useEffect(() => {
    const handleStream = stream => {
      if (ref.current) ref.current.srcObject = stream;
    };
    peer.on('stream', handleStream);
    return () => {
      try { peer.off('stream', handleStream); } catch (_) {}
    };
  }, [peer]);
  return (
    <div className={`${styles.videoTile} ${isAudioOn ? styles.activeSpeaker : ''}`}>
      <video playsInline autoPlay ref={ref} className={styles.video} />
      {!isVideoOn && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F5F0' }}>
          <Avatar name={name ? name.split(' (')[0] : 'P'} size={60} color="#0022FF" avatarUrl={avatarUrl} />
        </div>
      )}
      <div className={styles.tileOverlay}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span className={styles.tileName}>{name || 'Participant'}</span>
          {role && role !== 'PARTICIPANT' && (
            <span style={{
              background: role === 'HOST' ? '#FF3311' : '#0022FF',
              color: '#F7F5F0',
              padding: '0.15rem 0.45rem',
              fontSize: '0.65rem',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              border: '1px solid #0A0A0A',
              boxShadow: '1px 1px 0 rgba(10,10,10,1)'
            }}>
              {role}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!isAudioOn && <MicOff size={16} color="var(--vermilion, #FF3311)" />}
          {!isVideoOn && <VideoOff size={16} color="var(--vermilion, #FF3311)" />}
        </div>
      </div>
    </div>
  );
};

// -------- Main Component --------
export default function MeetingRoom() {

  const params = useParams();
  const { id: meetingId } = params;
  const router = useRouter();
  const { user, initialize } = useAuthStore();

  const [socket, setSocket] = useState(null);
  useEffect(() => { initialize(); }, [initialize]);
  const [peers, setPeers] = useState([]);
  const [stream, setStream] = useState(null);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [currentCaption, setCurrentCaption] = useState(null);
  const [spokenLanguage, setSpokenLanguage] = useState(useAuthStore.getState().user?.language || 'en');
  const [isDemoActive, setIsDemoActive] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const [participantStatus, setParticipantStatus] = useState(null);
  const [participantRole, setParticipantRole] = useState(null);
  const isHost = participantRole === 'HOST';
  const isHostOrCoHost = isHost || participantRole === 'COHOST';
  const [waitingUsers, setWaitingUsers] = useState([]);
  const [sidebarTab, setSidebarTab] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [showLobby, setShowLobby] = useState(false);
  const [summaryModal, setSummaryModal] = useState({ isOpen: false, text: '', loading: false });
  const [lobbyToast, setLobbyToast] = useState(null); // { name }
  const lobbyToastTimer = useRef(null);

  const showLobbyToast = (name) => {
    if (lobbyToastTimer.current) clearTimeout(lobbyToastTimer.current);
    setLobbyToast({ name });
    lobbyToastTimer.current = setTimeout(() => setLobbyToast(null), 6000);
  };
  const [alertMessage, setAlertMessage] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  const isTtsPlayingRef = useRef(false);
  const recentTtsMapRef = useRef(new Map());
  const lastSpeechEmitRef = useRef({ text: '', timestamp: 0 });
  const myLastSpokenTextRef = useRef('');
  const myLastSpokenTimeRef = useRef(0);
  const isJoiningInProgressRef = useRef(false);
  const processedCaptionIdsRef = useRef(new Set());
  const activeSpeechRecRef = useRef(null);

  const handleCopyInviteLink = () => {
    const url = `${window.location.origin}/meeting/${meetingId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };
  const chatEndRef = useRef(null);
  const ttsEnabledRef = useRef(true);
  const userVideo = useRef();
  const peersRef = useRef([]);
  const socketInitialized = useRef(false);
  const roleRef = useRef(null);
  const audioRef = useRef(true);
  const videoRef = useRef(true);
  const streamRef = useRef(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef(null);
  const sidebarRef = useRef(null);
  const chatToggleBtnRef = useRef(null);
  
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showMoreMenu]);

  useEffect(() => {
    const handleSidebarClickOutside = (event) => {
      if (!sidebarTab) return;
      if (sidebarRef.current && sidebarRef.current.contains(event.target)) {
        return;
      }
      if (chatToggleBtnRef.current && chatToggleBtnRef.current.contains(event.target)) {
        return;
      }
      if (moreMenuRef.current && moreMenuRef.current.contains(event.target)) {
        return;
      }
      setSidebarTab(null);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSidebarTab(null);
      }
    };

    if (sidebarTab) {
      document.addEventListener('mousedown', handleSidebarClickOutside);
      document.addEventListener('touchstart', handleSidebarClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleSidebarClickOutside);
      document.removeEventListener('touchstart', handleSidebarClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sidebarTab]);
  const audioLockedRef = useRef(false);
  const videoLockedRef = useRef(false);
  const [isAudioLocked, setIsAudioLocked] = useState(false);
  const [isVideoLocked, setIsVideoLocked] = useState(false);
  const [roomAudioLocked, setRoomAudioLocked] = useState(false);
  const [roomVideoLocked, setRoomVideoLocked] = useState(false);

  const statusRef = useRef(participantStatus);
  const socketRef = useRef(socket);
  const userRef = useRef(user);

  useEffect(() => { statusRef.current = participantStatus; }, [participantStatus]);
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { roleRef.current = participantRole; }, [participantRole]);
  useEffect(() => { audioRef.current = isAudioOn; }, [isAudioOn]);
  useEffect(() => { videoRef.current = isVideoOn; }, [isVideoOn]);
  useEffect(() => { streamRef.current = stream; }, [stream]);

  useEffect(() => {
    const handleUnload = () => {
      if (statusRef.current === 'WAITING') {
        const token = localStorage.getItem('token');
        if (token && meetingId) {
          try {
            fetch(`${API_URL}/meetings/${meetingId}/leave-waiting`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              keepalive: true
            }).catch(() => {});
          } catch (_) {}
          try {
            if (navigator.sendBeacon) {
              navigator.sendBeacon(`${API_URL}/meetings/${meetingId}/leave-waiting?token=${encodeURIComponent(token)}`);
            }
          } catch (_) {}
        }
        if (socketRef.current) {
          try {
            socketRef.current.emit('waiting:leave', { meetingId, userId: userRef.current?.id });
            socketRef.current.disconnect();
          } catch (_) {}
        }
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [meetingId]);

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  };

  const createPeer = (userToSignal, callerID, stream, currentSocket, userName, userRole) => {
    const peer = new Peer({ initiator: true, trickle: false, stream, config: iceServers });
    peer.on('signal', signal => {
      if (currentSocket) {
        currentSocket.emit('audio:signal', { targetSocketId: userToSignal, callerId: callerID, signal, name: userName, role: userRole, userId: user.id, avatar: user.avatar });
      }
    });
    peer.on('error', err => {
      console.warn('[WebRTC] Peer warning (createPeer):', err.message);
    });
    return peer;
  };

  const addPeer = (incomingSignal, callerID, stream, currentSocket, userName, userRole) => {
    const peer = new Peer({ initiator: false, trickle: false, stream, config: iceServers });
    peer.on('signal', signal => {
      if (currentSocket) {
        currentSocket.emit('audio:signal', { signal, targetSocketId: callerID, callerId: currentSocket.id, name: userName, role: userRole, userId: user.id, avatar: user.avatar });
      }
    });
    peer.on('error', err => {
      console.warn('[WebRTC] Peer warning (addPeer):', err.message);
    });
    try {
      peer.signal(incomingSignal);
    } catch (err) {
      console.warn('[WebRTC] Signal error in addPeer:', err.message);
    }
    return peer;
  };

  useEffect(() => {
    if (!user) return;
    if (socketInitialized.current || isJoiningInProgressRef.current) return;
    isJoiningInProgressRef.current = true;

    let newSocket;
    let isCancelled = false;

    const initializeMeeting = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          router.push(`/login?redirect=/meeting/${meetingId}`);
          return;
        }

        // Retry loop for transient network or server pool spikes
        let res = null;
        let lastErr = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (isCancelled) return;
          try {
            res = await fetch(`${API_URL}/meetings/join/${meetingId}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) break;
            // Immediate stop if permission denied or meeting ended/not found
            if (res.status === 403 || res.status === 404) break;
            // Otherwise wait briefly before retrying
            await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
          } catch (fetchErr) {
            lastErr = fetchErr;
            await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
          }
        }

        if (isCancelled) return;

        if (!res || !res.ok) {
          const errData = res ? await res.json().catch(() => ({})) : {};
          const errMsg = errData.error || lastErr?.message || 'Unable to connect to meeting';

          let errorType = 'ERROR';
          let title = 'Unable to Join Meeting';
          let description = errMsg;
          let showReport = false;

          const lowerMsg = errMsg.toLowerCase();
          if (lowerMsg.includes('ended')) {
            errorType = 'ENDED';
            title = 'Meeting Has Ended';
            description = 'This meeting has already concluded and is no longer active. You can view the meeting summary & report or return to your dashboard.';
            showReport = true;
          } else if (lowerMsg.includes('cancelled') || lowerMsg.includes('canceled')) {
            errorType = 'CANCELLED';
            title = 'Meeting Cancelled';
            description = 'This scheduled meeting was cancelled by the host and is no longer available.';
            showReport = false;
          } else if (lowerMsg.includes('organization') || lowerMsg.includes('member') || lowerMsg.includes('unauthorized')) {
            errorType = 'UNAUTHORIZED';
            title = 'Access Restricted';
            description = 'This meeting is restricted to organization members. Please request access or contact the organization host.';
            showReport = false;
          } else if (lowerMsg.includes('not found')) {
            errorType = 'NOT_FOUND';
            title = 'Meeting Not Found';
            description = `No meeting was found with ID "${meetingId}". Please check the invite link and try again.`;
            showReport = false;
          } else if (lowerMsg.includes('server error') || lowerMsg.includes('failed to connect')) {
            title = 'Server Syncing';
            description = 'The meeting session is syncing. Please click "Try Joining Again" below to connect.';
          }

          setJoinError({
            type: errorType,
            title,
            message: description,
            rawError: errMsg,
            showReport
          });
          isJoiningInProgressRef.current = false;
          return;
        }

        socketInitialized.current = true;
        isJoiningInProgressRef.current = false;

        const data = await res.json();
        setParticipantStatus(data.participantStatus);
        statusRef.current = data.participantStatus;
        setParticipantRole(data.participantRole);
        roleRef.current = data.participantRole;
        if (data.waitingUsers) {
          setWaitingUsers(data.waitingUsers);
          if (data.waitingUsers.length > 0) setShowLobby(true);
        }

        let currentStream;
        try {
          currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch {
          try {
            currentStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            setIsVideoOn(false);
          } catch {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            currentStream = ctx.createMediaStreamDestination().stream;
            setIsVideoOn(false);
            setIsAudioOn(false);
          }
        }
        setStream(currentStream);
        if (userVideo.current) userVideo.current.srcObject = currentStream;

        if (isCancelled) {
          if (currentStream) currentStream.getTracks().forEach(t => t.stop());
          return;
        }

        // Evict any existing socket before creating a new one to prevent duplicate listeners
        if (socketRef.current) {
          try {
            socketRef.current.removeAllListeners();
            socketRef.current.disconnect();
          } catch (_) {}
          socketRef.current = null;
        }

        newSocket = io(SOCKET_URL, {
          forceNew: true,
          transports: ['websocket', 'polling']
        });
        socketRef.current = newSocket;
        setSocket(newSocket);
        newSocket.emit('meeting:join', { meetingId, userId: user.id, peerId: newSocket.id, language: user.language });
        setTimeout(() => newSocket.emit('meeting:status_update', { isAudioOn: audioRef.current, isVideoOn: videoRef.current }), 2000);
          newSocket.emit('user:update_settings', useAuthStore.getState().user || {});

                  
                    newSocket.on('participant:promoted', ({ userId, role }) => {
            if (userId === useAuthStore.getState().user?.id) {
              setParticipantRole(role);
              roleRef.current = role;
            }
            const idx = peersRef.current.findIndex(p => p.userId === userId); 
            if (idx !== -1) { 
              peersRef.current[idx] = { ...peersRef.current[idx], role }; 
              setPeers([...peersRef.current]); 
            }
          });

          newSocket.on('participant:removed', ({ userId }) => {
            const currentUserId = useAuthStore.getState().user?.id;
            if (userId === currentUserId) {
              setAlertMessage('You have been removed from the meeting.');
              if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
              peersRef.current.forEach(p => { if (p.peer) { try { p.peer.destroy(); } catch (e) {} } });
              peersRef.current = [];
              setPeers([]);
              setTimeout(() => {
                router.push('/dashboard');
              }, 1200);
            } else {
              const peerToRemove = peersRef.current.find(p => p.userId === userId);
              if (peerToRemove && peerToRemove.peer) {
                try { peerToRemove.peer.destroy(); } catch (e) {}
              }
              peersRef.current = peersRef.current.filter(p => p.userId !== userId);
              setPeers([...peersRef.current]);
              setWaitingUsers(prev => prev.filter(u => u.userId !== userId));
            }
          });

          newSocket.on('meeting:refresh', async () => {
            try {
              const token = localStorage.getItem('token');
              const res = await fetch(`${API_URL}/meetings/${meetingId}/participants`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (res.ok) {
                const data = await res.json();
                const currentUserId = useAuthStore.getState().user?.id;
                const admittedUserIds = new Set(data.map(p => p.userId));

                // If current user is no longer admitted, redirect to dashboard
                const myData = data.find(p => p.userId === currentUserId);
                if (currentUserId && !myData && roleRef.current !== 'HOST') {
                  if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
                  peersRef.current.forEach(p => { if (p.peer) { try { p.peer.destroy(); } catch (e) {} } });
                  peersRef.current = [];
                  setPeers([]);
                  router.push('/dashboard');
                  return;
                }
                if (myData) {
                  setParticipantRole(myData.role);
                  roleRef.current = myData.role;
                }

                // Remove peers not in admitted DB list
                peersRef.current.forEach(p => {
                  if (p.userId && !admittedUserIds.has(p.userId)) {
                    if (p.peer) { try { p.peer.destroy(); } catch (e) {} }
                  }
                });
                peersRef.current = peersRef.current.filter(p => !p.userId || admittedUserIds.has(p.userId));

                // Update remaining peers with latest roles
                data.forEach(dbPeer => {
                  const idx = peersRef.current.findIndex(p => p.userId === dbPeer.userId);
                  if (idx !== -1) {
                    peersRef.current[idx] = { ...peersRef.current[idx], role: dbPeer.role, name: dbPeer.name, avatar: dbPeer.avatar };
                  }
                });
                setPeers([...peersRef.current]);
              }
            } catch (err) {
              console.error("Meeting refresh failed", err);
            }
          });

          newSocket.on('waiting:request', ({ userId, name, avatar }) => {
          setWaitingUsers(prev => prev.some(u => u.userId === userId) ? prev : [...prev, { userId, name, avatar }]);
          // Auto-show lobby panel for host
          setShowLobby(true);
        });
        newSocket.on('waiting:admitted', ({ userId }) => {
          if (userId === user.id) {
            if (statusRef.current !== 'ADMITTED') {
              setParticipantStatus('ADMITTED');
              statusRef.current = 'ADMITTED';
              newSocket.emit('meeting:join', { meetingId, userId: user.id, peerId: newSocket.id, language: user.language });
              setTimeout(() => newSocket.emit('meeting:status_update', { isAudioOn: audioRef.current, isVideoOn: videoRef.current }), 2000);
            }
          } else {
            setWaitingUsers(prev => {
              const updated = prev.filter(u => u.userId !== userId);
              if (updated.length === 0) setShowLobby(false);
              return updated;
            });
          }
        });
        newSocket.on('waiting:rejected', ({ userId }) => {
          if (userId === user.id) setParticipantStatus('REJECTED');
          else setWaitingUsers(prev => {
            const updated = prev.filter(u => u.userId !== userId);
            if (updated.length === 0) setShowLobby(false);
            return updated;
          });
        });
        newSocket.on('waiting:left', ({ userId }) => {
          setWaitingUsers(prev => {
            const updated = prev.filter(u => u.userId !== userId);
            if (updated.length === 0) setShowLobby(false);
            return updated;
          });
        });
        newSocket.on('meeting:ended', () => {
          setMeetingEnded(true);
          if (streamRef.current) {
            try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (_) {}
          }
        });
        newSocket.on('participant:joined', ({ userId, socketId, name, role, avatar }) => {
          if (!userId || userId === user.id) return;
          newSocket.emit('meeting:status_update', { isAudioOn: audioRef.current, isVideoOn: videoRef.current });

          // Destroy any existing peer instance for this user or socket
          const existingIdx = peersRef.current.findIndex(p => p.userId === userId || p.peerID === socketId);
          if (existingIdx !== -1) {
            try { peersRef.current[existingIdx].peer?.destroy(); } catch (_) {}
            peersRef.current.splice(existingIdx, 1);
          }

          const peer = createPeer(socketId, newSocket.id, currentStream, newSocket, user.name, data.participantRole);
          peersRef.current.push({ peerID: socketId, userId, peer, name, role, avatar });
          setPeers([...peersRef.current]);
        });
        newSocket.on('participant:left', ({ socketId, userId }) => {
          const toRemove = peersRef.current.filter(p => (socketId && p.peerID === socketId) || (userId && p.userId === userId));
          toRemove.forEach(p => {
            if (p.peer) {
              try { p.peer.destroy(); } catch (_) {}
            }
          });
          peersRef.current = peersRef.current.filter(p => (!socketId || p.peerID !== socketId) && (!userId || p.userId !== userId));
          setPeers([...peersRef.current]);
        });
        newSocket.on('audio:signal', payload => {
          if (!payload.userId || payload.userId === user.id) return;
          const item = peersRef.current.find(p => p.peerID === payload.callerId);
          if (item && item.peer && !item.peer.destroyed) {
            try {
              item.peer.signal(payload.signal);
            } catch (err) {
              console.warn('[WebRTC] Stale signal ignored:', err.message);
            }
          } else {
            // Destroy any previous stale or destroyed peer for this userId or callerId
            const staleIndices = peersRef.current
              .map((p, idx) => ((p.userId === payload.userId || p.peerID === payload.callerId || p.peer?.destroyed) ? idx : -1))
              .filter(idx => idx !== -1)
              .reverse();

            staleIndices.forEach(idx => {
              try { peersRef.current[idx].peer?.destroy(); } catch (_) {}
              peersRef.current.splice(idx, 1);
            });

            try {
              const peer = addPeer(payload.signal, payload.callerId, currentStream, newSocket, user.name, data.participantRole);
              peersRef.current.push({ peerID: payload.callerId, userId: payload.userId, peer, name: payload.name, role: payload.role, avatar: payload.avatar });
              setPeers([...peersRef.current]);
            } catch (err) {
              console.warn('[WebRTC] addPeer error:', err.message);
            }
          }
        });
        newSocket.on('participant:status_update', ({ socketId, isAudioOn, isVideoOn }) => {
          const idx = peersRef.current.findIndex(p => p.peerID === socketId);
          if (idx !== -1) {
            peersRef.current[idx] = { ...peersRef.current[idx], isAudioOn, isVideoOn };
            setPeers([...peersRef.current]);
          }
        });

        newSocket.on('participant:force_mute_received', ({ muterRole }) => {
          const myRole = roleRef.current;
          if (muterRole === 'HOST' || (muterRole === 'COHOST' && myRole !== 'HOST')) {
            setIsAudioOn(false);
            if (streamRef.current) {
              streamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
            }
            newSocket.emit('meeting:status_update', { isAudioOn: false, isVideoOn: videoRef.current });
          }
        });

        newSocket.on('participant:force_video_off_received', ({ muterRole }) => {
          const myRole = roleRef.current;
          if (muterRole === 'HOST' || (muterRole === 'COHOST' && myRole !== 'HOST')) {
            setIsVideoOn(false);
            if (streamRef.current) {
              streamRef.current.getVideoTracks().forEach(t => { t.enabled = false; });
            }
            newSocket.emit('meeting:status_update', { isAudioOn: audioRef.current, isVideoOn: false });
          }
        });
        newSocket.on('participant:hardware_locked', ({ muterRole, type, locked }) => {
          const myRole = roleRef.current;
          if (muterRole === 'HOST' || (muterRole === 'COHOST' && myRole !== 'HOST')) {
            if (type === 'audio') {
              setIsAudioLocked(locked);
              audioLockedRef.current = locked;
              if (locked) {
                setIsAudioOn(false);
                if (streamRef.current) streamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
                if (audioRef.current) audioRef.current = false;
                newSocket.emit('meeting:status_update', { isAudioOn: false, isVideoOn: videoRef.current });
              }
            } else if (type === 'video') {
              setIsVideoLocked(locked);
              videoLockedRef.current = locked;
              if (locked) {
                setIsVideoOn(false);
                if (streamRef.current) streamRef.current.getVideoTracks().forEach(t => { t.enabled = false; });
                if (videoRef.current) videoRef.current = false;
                newSocket.emit('meeting:status_update', { isAudioOn: audioRef.current, isVideoOn: false });
              }
            }
          }
        });

        newSocket.on('chat:message', data => {
          setMessages(prev => [...prev, data]);
        });
        newSocket.on('chat:translated', ({ messageId, translations, sourceLanguage }) => {
            const u = useAuthStore.getState().user || {};
            const chatEnabled = u.chatEnabled ?? true;
            const chatLang = u.chatLang || 'original';
            
            setMessages(prev => prev.map(m => {
              if (m.id === messageId) {
                const showTranslation = chatEnabled && chatLang !== 'original';
                return { ...m, translatedText: showTranslation ? (translations[chatLang] || `[Rate Limited] ${m.text}`) : null };
              }
              return m;
            }));
          });
          newSocket.on('caption:translated', data => {
            // Drop duplicate emissions of the exact same speech translation packet
            if (data?.id) {
              if (processedCaptionIdsRef.current.has(data.id)) {
                return;
              }
              processedCaptionIdsRef.current.add(data.id);
              if (processedCaptionIdsRef.current.size > 200) {
                const arr = Array.from(processedCaptionIdsRef.current);
                processedCaptionIdsRef.current = new Set(arr.slice(100));
              }
            }

            const u = useAuthStore.getState().user || {};
            
            const captionEnabled = u.captionEnabled ?? true;
            const captionLang = u.captionLang || 'original';
            
            if (captionEnabled) {
              const textToShow = captionLang === 'original' ? data.text : (data.translations?.[captionLang] || `[Rate Limited] ${data.text}`);
              if (textToShow) {
                setCurrentCaption(textToShow);
                setTimeout(() => setCurrentCaption(null), 4000);
              }
            }

            const ttsEnabled = u.ttsEnabled ?? true;
            const ttsLang = u.ttsLang || 'original';
            
            // Do not play TTS for own speech
            if (ttsEnabled && data.speakerId !== u.id) {
              const textToSpeak = ttsLang === 'original' ? data.text : (data.translations?.[ttsLang] || data.text);
              if (textToSpeak && textToSpeak.trim()) {
                const cleanText = textToSpeak.trim();
                const targetLangCode = ttsLang === 'original' ? (data.sourceLanguage || 'en') : ttsLang;
                const normKey = `${targetLangCode}:${cleanText.toLowerCase()}`;
                const now = Date.now();

                // 1. Deduplication: Don't repeat identical audio within 5 seconds
                const lastPlayed = recentTtsMapRef.current.get(normKey) || 0;
                if (now - lastPlayed < 5000) {
                  return;
                }
                recentTtsMapRef.current.set(normKey, now);

                // 2. Self-echo suppression: If this sentence matches what I just spoke, skip
                if (myLastSpokenTextRef.current && cleanText.toLowerCase().includes(myLastSpokenTextRef.current) && (now - myLastSpokenTimeRef.current < 6000)) {
                  return;
                }

                // 3. Mark TTS as active so local mic SpeechRecognition suppresses audio input during playback
                isTtsPlayingRef.current = true;

                // Try native browser TTS first (much faster, bypasses strict MP3 autoplay rules)
                if ('speechSynthesis' in window) {
                  try { window.speechSynthesis.cancel(); } catch (_) {}
                  const utterance = new SpeechSynthesisUtterance(cleanText);
                  utterance.lang = targetLangCode;
                  utterance.onend = () => {
                    setTimeout(() => { isTtsPlayingRef.current = false; }, 600);
                  };
                  utterance.onerror = () => {
                    setTimeout(() => { isTtsPlayingRef.current = false; }, 300);
                  };
                  window.speechSynthesis.speak(utterance);
                } else {
                  const url = `${API_URL}/tts?text=${encodeURIComponent(cleanText)}&lang=${targetLangCode.split("-")[0]}`;
                  const audio = new Audio(url);
                  audio.onended = () => {
                    setTimeout(() => { isTtsPlayingRef.current = false; }, 600);
                  };
                  audio.onerror = () => {
                    setTimeout(() => { isTtsPlayingRef.current = false; }, 300);
                  };
                  audio.play().catch(e => {
                    isTtsPlayingRef.current = false;
                    setAlertMessage('Browser blocked audio playback. Please click anywhere on the page first.');
                  });
                }
              }
            }
          });
      } catch (err) {
        console.warn('[Meeting] Join error:', err.message);
        setJoinError({
          type: 'ERROR',
          title: 'Connection Error',
          message: err.message || 'Failed to connect to the meeting server. Please check your network and try again.',
          showReport: false
        });
      }
    };

    initializeMeeting();
    return () => { 
        isCancelled = true;
        isJoiningInProgressRef.current = false;
        socketInitialized.current = false;
        if (statusRef.current === 'WAITING') {
          const t = localStorage.getItem('token');
          if (t && meetingId) {
            try {
              fetch(`${API_URL}/meetings/${meetingId}/leave-waiting`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
                keepalive: true
              }).catch(() => {});
            } catch (_) {}
          }
          if (socketRef.current) {
            try {
              socketRef.current.emit('waiting:leave', { meetingId, userId: userRef.current?.id });
            } catch (_) {}
          }
        }
        if (newSocket) {
          try {
            newSocket.removeAllListeners();
            newSocket.disconnect();
          } catch (_) {}
        }
        if (socketRef.current) {
          try {
            socketRef.current.removeAllListeners();
            socketRef.current.disconnect();
          } catch (_) {}
          socketRef.current = null;
        }
        peersRef.current.forEach(p => { if (p.peer) { try { p.peer.destroy(); } catch (_) {} } }); 
        peersRef.current = []; 
        setPeers([]);
        if (streamRef.current) {
          try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (_) {}
          streamRef.current = null;
        }
        if (activeSpeechRecRef.current) {
          try { activeSpeechRecRef.current.abort(); } catch (_) {}
          activeSpeechRecRef.current = null;
        } 
      };
  }, [user, meetingId, retryCount]);

  // Speech recognition - starts when mic is unmuted and participant is admitted
  useEffect(() => {
    if (!socket || !user) return;
    if (!isAudioOn) return;
    if (meetingEnded) return;
    if (participantStatus !== 'ADMITTED' && !isHostOrCoHost) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (activeSpeechRecRef.current) {
      try { activeSpeechRecRef.current.abort(); } catch (_) {}
      activeSpeechRecRef.current = null;
    }
    const rec = new SR();
    activeSpeechRecRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = spokenLanguage;
    let stopped = false;
    let restartTimer = null;

    rec.onresult = (ev) => {
      // Acoustic echo suppression: If TTS is speaking, suppress local mic recognition!
      if (isTtsPlayingRef.current || (typeof window !== 'undefined' && window.speechSynthesis?.speaking)) {
        return;
      }

      for (let i = ev.resultIndex; i < ev.results.length; ++i) {
        if (ev.results[i].isFinal) {
          const txt = ev.results[i][0].transcript.trim();
          if (txt) {
            const norm = txt.toLowerCase();
            const now = Date.now();
            // Outgoing deduplication: Do not re-emit duplicate sentence within 3.5 seconds
            if (lastSpeechEmitRef.current.text === norm && (now - lastSpeechEmitRef.current.timestamp < 3500)) {
              continue;
            }
            lastSpeechEmitRef.current = { text: norm, timestamp: now };
            myLastSpokenTextRef.current = norm;
            myLastSpokenTimeRef.current = now;

            socket.emit('caption:text', { meetingId, speakerId: user.id, text: txt, language: spokenLanguage });
          }
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech') {
        // Normal silence event from browser; do not spam logs
        return;
      }
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopped = true;
        return;
      }
    };
    rec.onend = () => {
      if (!stopped && audioRef.current) {
        restartTimer = setTimeout(() => {
          if (!stopped && audioRef.current) {
            try { rec.start(); } catch (_) {}
          }
        }, 350);
      }
    };
    try { rec.start(); } catch (_) {}
    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      try { rec.abort(); } catch (_) {
        try { rec.stop(); } catch (_) {}
      }
    };
  }, [socket, user, isAudioOn, spokenLanguage, meetingId, participantStatus, isHostOrCoHost, meetingEnded]);

  const toggleVideo = () => {
    if (videoLockedRef.current) {
      setAlertMessage('Camera is disabled by Host');
      return;
    }
    const nextVideo = !isVideoOn;
    videoRef.current = nextVideo;
    setIsVideoOn(nextVideo);
    stream?.getVideoTracks().forEach(t => { t.enabled = nextVideo; });
    if (socket) socket.emit('meeting:status_update', { isAudioOn: audioRef.current, isVideoOn: nextVideo });
  };
  const toggleAudio = () => {
    if (audioLockedRef.current) {
      setAlertMessage('Microphone is disabled by Host');
      return;
    }
    const nextAudio = !isAudioOn;
    audioRef.current = nextAudio;
    setIsAudioOn(nextAudio);
    stream?.getAudioTracks().forEach(t => { t.enabled = nextAudio; });
    if (socket) socket.emit('meeting:status_update', { isAudioOn: nextAudio, isVideoOn: videoRef.current });
  };

  const updateUserSettings = (key, value) => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;
    const updated = { ...currentUser, [key]: value };
    const token = localStorage.getItem('token');
    useAuthStore.getState().updateUser(token, updated);
    if (socket) socket.emit('user:update_settings', updated);
  };


  

  const authFetch = (path, opts = {}) =>

    fetch(`${API_URL}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json', ...opts.headers },
    });

  const handleAdmit = async (targetUserId) => {
    try {
      setWaitingUsers(prev => {
        const next = prev.filter(u => u.userId !== targetUserId);
        if (next.length === 0) setShowLobby(false);
        return next;
      });
      if (socketRef.current) {
        socketRef.current.emit('meeting:admit', { meetingId, targetUserId });
      } else {
        await authFetch(`/meetings/${meetingId}/admit`, { method: 'POST', body: JSON.stringify({ userId: targetUserId }) });
      }
    } catch (err) { console.error('Failed to admit', err); }
  };

  const handleReject = async (targetUserId) => {
    try {
      setWaitingUsers(prev => {
        const next = prev.filter(u => u.userId !== targetUserId);
        if (next.length === 0) setShowLobby(false);
        return next;
      });
      if (socketRef.current) {
        socketRef.current.emit('meeting:reject', { meetingId, targetUserId });
      } else {
        await authFetch(`/meetings/${meetingId}/reject`, { method: 'POST', body: JSON.stringify({ userId: targetUserId }) });
      }
    } catch (err) { console.error('Failed to reject', err); }
  };

  const handleLeaveWaitingRoom = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token && meetingId) {
        await fetch(`${API_URL}/meetings/${meetingId}/leave-waiting`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          keepalive: true
        });
      }
    } catch (e) {
      console.warn('Failed to call leave-waiting API', e);
    }
    if (socketRef.current) {
      try {
        socketRef.current.emit('waiting:leave', { meetingId, userId: userRef.current?.id });
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      } catch (_) {}
      socketRef.current = null;
    }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (_) {}
      streamRef.current = null;
    }
    peersRef.current.forEach(p => { if (p.peer) { try { p.peer.destroy(); } catch (_) {} } });
    peersRef.current = [];
    setPeers([]);
    socketInitialized.current = false;
    isJoiningInProgressRef.current = false;
    if (activeSpeechRecRef.current) {
      try { activeSpeechRecRef.current.abort(); } catch (_) {}
      activeSpeechRecRef.current = null;
    }
    router.push('/dashboard');
  };

  const leaveMeeting = () => {
    if (isHostOrCoHost) {
      setShowLeaveModal(true);
    } else {
      router.push(`/meeting/${meetingId}/report`);
    }
  };

  const confirmEndMeeting = async () => {
    try {
      await authFetch(`/meetings/${meetingId}/end`, { method: 'POST' });
    } catch (e) {
      console.error('Failed to end meeting via API', e);
    }
    if (socket) {
      socket.emit('meeting:end', { meetingId });
    }
    router.push(`/meeting/${meetingId}/report`);
  };

  const confirmLeaveMeeting = () => {
    router.push(`/meeting/${meetingId}/report`);
  };



    
  const handleRemoveParticipant = async (userId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/meetings/${meetingId}/participant/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errorData = await res.json();
        setAlertMessage(errorData.error || 'Failed to remove participant');
      } else {
        if (socket) {
          socket.emit('meeting:remove_participant', { meetingId, targetUserId: userId });
        }
        const peerObj = peersRef.current.find(p => p.userId === userId);
        if (peerObj && peerObj.peer) {
          try { peerObj.peer.destroy(); } catch (e) {}
        }
        peersRef.current = peersRef.current.filter(p => p.userId !== userId);
        setPeers([...peersRef.current]);
      }
    } catch (err) {
      console.error(err);
      setAlertMessage('Error removing participant');
    }
  };

  const handleToggleMeetingCoHost = async (targetUserId, isCoHost) => {

    try {
      const token = localStorage.getItem('token');
      let res;
      if (isCoHost) {
        res = await fetch(`${API_URL}/meetings/${meetingId}/cohost/${targetUserId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
      } else {
        res = await fetch(`${API_URL}/meetings/${meetingId}/cohost`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: targetUserId }) });
      }
      if (!res.ok) {
        const data = await res.json();
        setAlertMessage(data.error || 'Failed to toggle co-host');
      }
    } catch (err) {
      setAlertMessage('Failed to toggle co-host');
    }
  };

  const fetchLiveSummary = async () => {
    setSummaryModal({ isOpen: true, text: '', loading: true });
    try {
      const res = await authFetch(`/meetings/${meetingId}/summary?lang=${spokenLanguage}`);
      const data = await res.json();
      if (res.ok) {
        setSummaryModal({ isOpen: true, text: data.summary, loading: false });
      } else {
        setSummaryModal({ isOpen: true, text: `Error: ${data.error}`, loading: false });
      }
    } catch (err) {
      setSummaryModal({ isOpen: true, text: 'Network error occurred.', loading: false });
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    const msg = { id: Date.now().toString(), meetingId, senderId: user.id, senderName: user.name, text: chatInput, language: user.language };
    socket.emit('chat:message', msg);
    setChatInput('');
  };

  useEffect(() => {
    if (!isDemoActive || !socket || !user) return;
    const phrase = "Hello, this is a live test of the BhashaBridge translation system.";
    socket.emit('caption:text', { meetingId, speakerId: user.id, text: phrase, language: spokenLanguage });
    
    // Automatically reset Demo so it doesn't loop infinitely in the background
    const stopTimer = setTimeout(() => {
      setIsDemoActive(false);
    }, 2500);

    return () => clearTimeout(stopTimer);
  }, [isDemoActive, socket, meetingId, user, spokenLanguage]);

  // ======= MEETING JOIN ERROR POPUP (Ended, Cancelled, Restricted, Not Found) =======
  if (joinError) {
    const isEnded = joinError.type === 'ENDED';
    const isCancelled = joinError.type === 'CANCELLED';
    const accentColor = isEnded ? '#0022FF' : (isCancelled ? '#777' : '#FF3311');

    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: '#FDFBF7',
        backgroundImage: 'radial-gradient(rgba(10,10,10,0.08) 1px, transparent 0)',
        backgroundSize: '24px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        zIndex: 99999,
        fontFamily: 'var(--font-grotesk)'
      }}>
        {/* Brutalist modal box */}
        <div style={{
          background: '#F7F5F0',
          border: '3px solid #0A0A0A',
          boxShadow: '12px 12px 0 #0A0A0A',
          maxWidth: 480,
          width: '100%',
          padding: '2.5rem',
          textAlign: 'center',
          position: 'relative'
        }}>
          {/* Top colored accent stripe */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: accentColor
          }} />

          {/* Icon Badge */}
          <div style={{
            width: 72,
            height: 72,
            background: '#0A0A0A',
            color: '#F7F5F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            border: '2px solid #0A0A0A',
            boxShadow: `6px 6px 0 ${accentColor}`
          }}>
            {isEnded ? (
              <Clock size={36} color="#F7F5F0" />
            ) : isCancelled ? (
              <Trash2 size={36} color="#FF3311" />
            ) : joinError.type === 'UNAUTHORIZED' ? (
              <Shield size={36} color="#FF3311" />
            ) : (
              <AlertCircle size={36} color="#FF3311" />
            )}
          </div>

          {/* Title */}
          <h2 style={{
            margin: '0 0 0.5rem',
            color: '#0A0A0A',
            fontSize: '2.2rem',
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.15
          }}>
            {joinError.title}
          </h2>

          {/* Meeting Code Badge */}
          <div style={{ marginBottom: '1.25rem' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: '#0A0A0A',
              background: 'transparent',
              border: '1px solid #0A0A0A',
              padding: '0.25rem 0.65rem',
              fontWeight: 700,
              textTransform: 'uppercase'
            }}>
              <span style={{ width: 8, height: 8, background: accentColor, display: 'inline-block' }} />
              ID: {meetingId}
            </span>
          </div>

          {/* Description message */}
          <p style={{
            margin: '0 0 2rem',
            color: '#4A4A4A',
            fontSize: '0.95rem',
            lineHeight: 1.6,
            fontFamily: 'var(--font-grotesk)'
          }}>
            {joinError.message}
          </p>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {joinError.showReport && (
              <button
                onClick={() => router.push(`/meeting/${meetingId}/report`)}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: '#0022FF',
                  color: '#F7F5F0',
                  border: '2px solid #0A0A0A',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  boxShadow: '4px 4px 0 #0A0A0A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'transform 0.1s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translate(-2px, -2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'none'}
              >
                <FileText size={16} />
                <span>View Summary & Report</span>
              </button>
            )}

            {!isEnded && !isCancelled && (
              <button
                onClick={() => {
                  setJoinError(null);
                  socketInitialized.current = false;
                  isJoiningInProgressRef.current = false;
                  setRetryCount(prev => prev + 1);
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: '#0022FF',
                  color: '#F7F5F0',
                  border: '2px solid #0A0A0A',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  boxShadow: '4px 4px 0 #0A0A0A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'transform 0.1s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translate(-2px, -2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'none'}
              >
                <RefreshCw size={16} />
                <span>Try Joining Again</span>
              </button>
            )}

            <button
              onClick={() => router.push('/dashboard')}
              style={{
                width: '100%',
                padding: '1rem',
                background: joinError.showReport ? '#F7F5F0' : '#0A0A0A',
                color: joinError.showReport ? '#0A0A0A' : '#F7F5F0',
                border: '2px solid #0A0A0A',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.9rem',
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                boxShadow: '4px 4px 0 #0A0A0A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'transform 0.1s'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translate(-2px, -2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
            >
              <ArrowLeft size={16} />
              <span>Back to Dashboard</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user || !participantStatus) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#FDFBF7', color: '#0047AB' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '2rem' }}>Connecting to meeting...</h2>
      </div>
    );
  }

  // ======= REJECTED SCREEN =======
  if (participantStatus === 'REJECTED') {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: '#F7F5F0', gap: '1.5rem', border: '2px solid #0A0A0A', margin: '2rem' }}>
        <div style={{ width: 80, height: 80, borderRadius: '0', background: '#0A0A0A', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '8px 8px 0 #FF3311' }}>
          <UserX size={36} color="#F7F5F0" />
        </div>
        <h2 style={{ color: '#0A0A0A', margin: 0, fontSize: '3rem', fontFamily: 'var(--font-serif)', fontStyle: 'italic', letterSpacing: '-0.02em' }}>Access Denied</h2>
        <p style={{ color: '#5A5A5A', margin: 0, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>The host declined your request to join this meeting.</p>
        <button onClick={() => router.push('/dashboard')} style={{ background: '#0022FF', color: 'white', border: 'none', padding: '1rem 2rem', borderRadius: '0', fontWeight: 600, cursor: 'pointer', fontSize: '1rem', marginTop: '1rem', boxShadow: '4px 4px 0 rgba(10,10,10,1)', fontFamily: 'var(--font-grotesk)' }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  // ======= MEETING ENDED SCREEN =======
  if (meetingEnded) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,10,10,0.92)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        zIndex: 99999,
        fontFamily: 'var(--font-grotesk)'
      }}>
        <div style={{
          background: '#F7F5F0',
          border: '3px solid #0A0A0A',
          boxShadow: '12px 12px 0 #0A0A0A',
          maxWidth: 480,
          width: '100%',
          padding: '2.5rem',
          textAlign: 'center',
          position: 'relative'
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: '#0022FF'
          }} />
          <div style={{
            width: 72,
            height: 72,
            background: '#0A0A0A',
            color: '#F7F5F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            border: '2px solid #0A0A0A',
            boxShadow: '6px 6px 0 #0022FF'
          }}>
            <Clock size={36} color="#F7F5F0" />
          </div>
          <h2 style={{
            margin: '0 0 0.5rem',
            color: '#0A0A0A',
            fontSize: '2.2rem',
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.15
          }}>
            Meeting Ended
          </h2>
          <div style={{ marginBottom: '1.25rem' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: '#0A0A0A',
              border: '1px solid #0A0A0A',
              padding: '0.25rem 0.65rem',
              fontWeight: 700,
              textTransform: 'uppercase'
            }}>
              <span style={{ width: 8, height: 8, background: '#0022FF', display: 'inline-block' }} />
              ID: {meetingId}
            </span>
          </div>
          <p style={{
            margin: '0 0 2rem',
            color: '#4A4A4A',
            fontSize: '0.95rem',
            lineHeight: 1.6,
            fontFamily: 'var(--font-grotesk)'
          }}>
            The host has ended this meeting for everyone.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={() => router.push(`/meeting/${meetingId}/report`)}
              style={{
                width: '100%',
                padding: '1rem',
                background: '#0022FF',
                color: '#F7F5F0',
                border: '2px solid #0A0A0A',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.9rem',
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                boxShadow: '4px 4px 0 #0A0A0A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              <FileText size={16} />
              <span>View Summary & Report</span>
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              style={{
                width: '100%',
                padding: '1rem',
                background: '#F7F5F0',
                color: '#0A0A0A',
                border: '2px solid #0A0A0A',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.9rem',
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                boxShadow: '4px 4px 0 #0A0A0A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              <ArrowLeft size={16} />
              <span>Back to Dashboard</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ======= WAITING ROOM =======
  if (participantStatus === 'WAITING' || (participantStatus !== 'ADMITTED' && !isHostOrCoHost)) {
    return (
      <div className={styles.lobbyContainer}>

        {/* Left - camera preview */}
        <div className={styles.lobbyLeft}>
          <div style={{ width: '100%', maxWidth: 560, position: 'relative' }}>
            {/* Video card */}
            <div style={{ position: 'relative', borderRadius: '0', overflow: 'hidden', background: '#000', border: '2px solid #0A0A0A', boxShadow: '12px 12px 0 rgba(10,10,10,1)', aspectRatio: '16/9' }}>
              <video playsInline muted ref={userVideo} autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {!isVideoOn && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
                  <Avatar name={user.name} size={72} color="#0022FF" avatarUrl={user.avatar} />
                </div>
              )}
              {/* Name badge */}
              <div style={{ position: 'absolute', bottom: 16, left: 16, fontSize: '0.88rem', fontWeight: 600, color: '#F7F5F0', background: '#0A0A0A', padding: '0.3rem 0.7rem', borderRadius: '0', border: 'none', fontFamily: 'var(--font-mono)' }}>
                {user.name} (You)
              </div>
              {/* Controls overlay */}
              <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', gap: '0.6rem' }}>
                <button onClick={toggleAudio} style={{ width: 42, height: 42, borderRadius: '0', border: 'none', background: isAudioOn ? '#F7F5F0' : '#FF3311', color: isAudioOn ? '#0A0A0A' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', boxShadow: '4px 4px 0 rgba(10,10,10,1)' }}>
                  {isAudioOn ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
                <button onClick={toggleVideo} style={{ width: 42, height: 42, borderRadius: '0', border: 'none', background: isVideoOn ? '#F7F5F0' : '#FF3311', color: isVideoOn ? '#0A0A0A' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', boxShadow: '4px 4px 0 rgba(10,10,10,1)' }}>
                  {isVideoOn ? <Video size={18} /> : <VideoOff size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right - waiting info */}
        <div className={styles.lobbyRight}>
          <div style={{ maxWidth: 380, width: '100%' }}>
            
            <h1 style={{ margin: '0 0 0.75rem', color: '#0A0A0A', fontSize: '2.5rem', fontWeight: 600, lineHeight: 1.1, fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
              Waiting to Connect
            </h1>
            <p style={{ margin: '0 0 2.5rem', color: '#5A5A5A', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', lineHeight: 1.6, textTransform: 'uppercase' }}>
              The host will admit you shortly. You will join automatically once admitted.
            </p>

            {/* Status indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: 'transparent', border: '2px solid #0A0A0A', borderRadius: '0', marginBottom: '1.5rem', boxShadow: '4px 4px 0 rgba(10,10,10,1)' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#0022FF', animation: 'pulse 2s infinite' }} />
              <span style={{ color: '#0A0A0A', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>Lobby <strong>{meetingId}</strong></span>
            </div>

            <button
              onClick={handleLeaveWaitingRoom}
              style={{ width: '100%', padding: '1rem', background: '#0A0A0A', color: '#F7F5F0', border: 'none', borderRadius: '0', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem', transition: 'transform 0.2s', boxShadow: '4px 4px 0 #FF3311', fontFamily: 'var(--font-grotesk)' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              Leave Waiting Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ======= MAIN MEETING ROOM =======
  return (
    <div className={styles.container}>

      {/* === LOBBY PANEL (Host only, floating overlay) === */}
        {isHostOrCoHost && waitingUsers.length > 0 && showLobby && (
          <div style={{
            position: 'fixed', top: '5rem', right: '1rem', zIndex: 500,
            width: 340, background: '#F7F5F0',
            border: '2px solid #0A0A0A', borderRadius: '0',
            boxShadow: '8px 8px 0 rgba(10,10,10,1)', overflow: 'hidden', fontFamily: 'var(--font-grotesk)'
          }}>
            <div style={{ padding: '1rem', borderBottom: '2px solid #0A0A0A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0A0A0A' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: '0', background: '#FF3311', animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontWeight: 600, color: '#F7F5F0', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Lobby ({waitingUsers.length})</span>
              </div>
              <button onClick={() => setShowLobby(false)} style={{ background: 'none', border: 'none', color: '#F7F5F0', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 600 }}>&times;</button>
            </div>
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 350, overflowY: 'auto' }}>
              {waitingUsers.map(w => (
                <div key={w.userId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 0', borderBottom: '1px solid #0A0A0A' }}>
                  <Avatar name={w.name} size={34} color="#0022FF" avatarUrl={w.avatar} />
                  <span style={{ flex: 1, color: '#0A0A0A', fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button onClick={() => handleAdmit(w.userId)} title="Admit" style={{ width: 34, height: 34, borderRadius: '0', background: '#0022FF', border: '2px solid #0A0A0A', color: '#F7F5F0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '2px 2px 0 rgba(10,10,10,1)', transition: 'transform 0.1s' }} onMouseEnter={e => e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e => e.currentTarget.style.transform='none'}>
                      <UserCheck size={16} />
                    </button>
                    <button onClick={() => handleReject(w.userId)} title="Reject" style={{ width: 34, height: 34, borderRadius: '0', background: '#FF3311', border: '2px solid #0A0A0A', color: '#F7F5F0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '2px 2px 0 rgba(10,10,10,1)', transition: 'transform 0.1s' }} onMouseEnter={e => e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e => e.currentTarget.style.transform='none'}>
                      <UserX size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === HEADER === */}
        <header style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', gap: '0.75rem', background: '#F7F5F0', borderBottom: '2px solid #0A0A0A', zIndex: 10, fontFamily: 'var(--font-grotesk)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: '0', background: '#FF3311' }} />
              <span style={{ fontWeight: 600, color: '#0A0A0A', fontSize: '1.35rem', fontFamily: 'var(--font-serif)', fontStyle: 'italic', letterSpacing: '-0.02em' }}>BhashaBridge</span>
            </div>
            <div style={{ height: 20, width: 2, background: '#0A0A0A' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#0022FF', fontWeight: 600 }}>{meetingId}</code>
              <button
                onClick={handleCopyInviteLink}
                title={copiedLink ? "Copied invite link!" : "Copy Invite Link"}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: copiedLink ? '#10b981' : '#F7F5F0',
                  color: copiedLink ? '#FFFFFF' : '#0A0A0A',
                  border: '2px solid #0A0A0A',
                  padding: '0.2rem 0.5rem',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  boxShadow: '2px 2px 0 rgba(10,10,10,1)',
                  transition: 'all 0.1s'
                }}
              >
                {copiedLink ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
              </button>
              {participantRole && (
                <span style={{ background: participantRole === 'HOST' ? '#FF3311' : '#0022FF', color: '#F7F5F0', padding: '0.2rem 0.45rem', fontSize: '0.68rem', fontWeight: 700, fontFamily: 'var(--font-mono)', border: '2px solid #0A0A0A', boxShadow: '2px 2px 0 rgba(10,10,10,1)' }}>
                  {participantRole}
                </span>
              )}
            </div>
          </div>

          <div className='meetingHeaderRight' style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {isHostOrCoHost && waitingUsers.length > 0 && (
              <button
                onClick={() => setShowLobby(l => !l)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#F7F5F0', border: '2px solid #0A0A0A', color: '#0A0A0A', cursor: 'pointer', fontFamily: 'var(--font-grotesk)', fontSize: '0.82rem', padding: '0.35rem 0.75rem', boxShadow: '2px 2px 0 rgba(10,10,10,1)' }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '0', background: '#FF3311', animation: 'pulse 1s infinite' }} />
                <span style={{ fontWeight: 700 }}>Lobby ({waitingUsers.length})</span>
              </button>
            )}
            <button onClick={fetchLiveSummary} style={{ background: '#F7F5F0', border: '2px solid #0A0A0A', color: '#0A0A0A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-grotesk)', fontSize: '0.82rem', padding: '0.35rem 0.75rem', boxShadow: '2px 2px 0 rgba(10,10,10,1)', fontWeight: 600 }}>
              ✨ Summary
            </button>
            <button onClick={() => setShowSettings(true)} style={{ background: '#0A0A0A', border: '2px solid #0A0A0A', color: '#F7F5F0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-grotesk)', fontSize: '0.82rem', padding: '0.35rem 0.75rem', boxShadow: '2px 2px 0 rgba(10,10,10,1)', fontWeight: 600 }}>
              <Settings size={14} /> Settings
            </button>
            <button
              onClick={() => {
                if (!isDemoActive) {
                  setIsDemoActive(true);
                  setAlertMessage('Broadcasting audio test phrase...');
                } else {
                  setIsDemoActive(false);
                }
              }}
              style={{
                background: isDemoActive ? '#FF3311' : '#0022FF',
                border: '2px solid #0A0A0A',
                color: '#F7F5F0',
                padding: '0.35rem 0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontFamily: 'var(--font-grotesk)',
                fontSize: '0.8rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                boxShadow: '2px 2px 0 rgba(10,10,10,1)'
              }}
            >
              {isDemoActive ? 'Demo Playing...' : '⚡ Test Audio'}
            </button>
          </div>
        </header>

        <main className={styles.main}>
        {/* === VIDEO AREA === */}
        <div className={styles.videoSection}>
          <div className={styles.videoGrid} data-count={peers.length + 1}>
            {/* Self tile */}
            <div className={`${styles.videoTile} ${isAudioOn ? styles.activeSpeaker : ''}`}>
              <video muted ref={userVideo} autoPlay playsInline className={styles.video} />
              {!isVideoOn && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F5F0' }}>
                  <Avatar name={user.name} size={60} color="#0022FF" avatarUrl={user.avatar} />
                </div>
              )}
              <div className={styles.tileOverlay}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className={styles.tileName}>{user.name} (You)</span>
                  {participantRole && participantRole !== 'PARTICIPANT' && (
                    <span style={{
                      background: participantRole === 'HOST' ? '#FF3311' : '#0022FF',
                      color: '#F7F5F0',
                      padding: '0.15rem 0.45rem',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      border: '1px solid #0A0A0A',
                      boxShadow: '1px 1px 0 rgba(10,10,10,1)'
                    }}>
                      {participantRole}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!isAudioOn && <MicOff size={16} color="var(--vermilion, #FF3311)" />}
                  {!isVideoOn && <VideoOff size={16} color="var(--vermilion, #FF3311)" />}
                </div>
              </div>
            </div>
            {peers
              .filter((peer, index, self) => index === self.findIndex(p => (p.userId && p.userId === peer.userId) || p.peerID === peer.peerID))
              .map((peer, i) => (
                <VideoPeer key={peer.userId || peer.peerID || i} peer={peer.peer} name={`${peer.name || `Participant ${i + 1}`}`} role={peer.role} isAudioOn={peer.isAudioOn} isVideoOn={peer.isVideoOn} avatarUrl={peer.avatar} />
            ))}
          </div>

          {/* Caption overlay */}
          {currentCaption && (
            <div className={styles.captionsOverlay}>
              <div className={styles.captionText}>{currentCaption}</div>
            </div>
          )}

          {/* Controls bar */}
          <div className='meetingControlsBar' style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '0.75rem', padding: '0.75rem 1rem', background: '#F7F5F0', border: '2px solid #0A0A0A', boxShadow: '8px 8px 0 rgba(10,10,10,1)', zIndex: 150 }}>
            <button
              onClick={toggleAudio}
              title={isAudioOn ? 'Mute' : 'Unmute'}
              style={{ width: 48, height: 48, borderRadius: '0', border: '2px solid #0A0A0A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s', background: isAudioOn ? 'transparent' : '#FF3311', color: isAudioOn ? '#0A0A0A' : 'white' }}
            >
              {isAudioOn ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button
              onClick={toggleVideo}
              title={isVideoLocked ? 'Camera disabled by Host' : (isVideoOn ? 'Turn off camera' : 'Turn on camera')}
              disabled={isVideoLocked}
              style={{ width: 48, height: 48, borderRadius: '0', border: '2px solid #0A0A0A', cursor: isVideoLocked ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s', background: isVideoOn ? 'transparent' : '#FF3311', color: isVideoOn ? '#0A0A0A' : 'white', opacity: isVideoLocked ? 0.5 : 1 }}
            >
              {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              ref={chatToggleBtnRef}
              onClick={() => setSidebarTab(t => t === 'CHAT' ? null : 'CHAT')}
              title="Chat"
              style={{ width: 48, height: 48, borderRadius: '0', border: '2px solid #0A0A0A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: sidebarTab === 'CHAT' ? '#0022FF' : 'transparent', color: sidebarTab === 'CHAT' ? 'white' : '#0A0A0A' }}
            >
              <MessageSquare size={20} />
            </button>
            {isHostOrCoHost && (
              <div ref={moreMenuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowMoreMenu(m => !m)}
                  title="More Controls"
                  style={{ width: 48, height: 48, borderRadius: '0', border: '2px solid #0A0A0A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: showMoreMenu ? '#0A0A0A' : 'transparent', color: showMoreMenu ? '#F7F5F0' : '#0A0A0A', transition: 'all 0.1s' }}
                >
                  <MoreVertical size={20} />
                </button>
                {showMoreMenu && (
                  <div style={{ position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)', background: '#F7F5F0', border: '2px solid #0A0A0A', borderRadius: '0', padding: '0.5rem', minWidth: 220, zIndex: 100, fontFamily: 'var(--font-grotesk)', boxShadow: '8px 8px 0 rgba(10,10,10,1)' }}>
                    <button onClick={() => { if(socket) socket.emit('meeting:force_mute_all', { role: participantRole }); setShowMoreMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'none', border: 'none', color: '#0A0A0A', cursor: 'pointer', fontSize: '0.9rem', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background='rgba(10,10,10,0.05)'} onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <MicOff size={16} color="#FF3311" /> Mute All
                    </button>
                    <button onClick={() => { if(socket) socket.emit('meeting:force_video_off_all', { role: participantRole }); setShowMoreMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'none', border: 'none', color: '#0A0A0A', cursor: 'pointer', fontSize: '0.9rem', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background='rgba(10,10,10,0.05)'} onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <VideoOff size={16} color="#FF3311" /> Turn Off All Cameras
                    </button>
                    <button onClick={() => {
                      const newLock = !roomAudioLocked;
                      setRoomAudioLocked(newLock);
                      if(socket) socket.emit('meeting:lock_hardware', { role: participantRole, type: 'audio', locked: newLock });
                      setShowMoreMenu(false);
                    }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'none', border: 'none', color: '#0A0A0A', cursor: 'pointer', fontSize: '0.9rem', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background='rgba(10,10,10,0.05)'} onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <MicOff size={16} color={roomAudioLocked ? "#0022FF" : "#0A0A0A"} /> {roomAudioLocked ? 'Unlock All Mics' : 'Lock All Mics'}
                    </button>
                    <button onClick={() => {
                      const newLock = !roomVideoLocked;
                      setRoomVideoLocked(newLock);
                      if(socket) socket.emit('meeting:lock_hardware', { role: participantRole, type: 'video', locked: newLock });
                      setShowMoreMenu(false);
                    }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'none', border: 'none', color: '#0A0A0A', cursor: 'pointer', fontSize: '0.9rem', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background='rgba(10,10,10,0.05)'} onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <VideoOff size={16} color={roomVideoLocked ? "#0022FF" : "#0A0A0A"} /> {roomVideoLocked ? 'Unlock All Cameras' : 'Lock All Cameras'}
                    </button>
                    <div style={{ height: 1, background: 'rgba(10,10,10,0.1)', margin: '0' }} />
                    <button onClick={() => { setShowLobby(l => !l); setShowMoreMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'none', border: 'none', color: '#0A0A0A', cursor: 'pointer', fontSize: '0.9rem', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background='rgba(10,10,10,0.05)'} onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <Shield size={16} color="#0022FF" /> {waitingUsers.length > 0 ? `Lobby (${waitingUsers.length})` : 'Lobby'}
                    </button>
                    <button onClick={() => { setSidebarTab(t => t === 'MEMBERS' ? null : 'MEMBERS'); setShowMoreMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'none', border: 'none', color: '#0A0A0A', cursor: 'pointer', fontSize: '0.9rem', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background='rgba(10,10,10,0.05)'} onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <Users size={16} /> Manage Members
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={leaveMeeting}
              title="Leave meeting"
              style={{ width: 48, height: 48, borderRadius: '0', border: '2px solid #0A0A0A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FF3311', color: '#F7F5F0', boxShadow: '4px 4px 0 rgba(10,10,10,1)', transition: 'transform 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <PhoneOff size={20} />
            </button>
          </div>
        </div>

        {/* === SIDEBAR === */}
        <aside ref={sidebarRef} className={`${styles.chatSection} ${sidebarTab ? styles.chatSectionOpen : ''}`}>
          {/* Sidebar tabs */}
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '2px solid #0A0A0A' }}>
            {['CHAT', 'MEMBERS'].map(tab => (
              <button key={tab} onClick={() => setSidebarTab(tab)} style={{ flex: 1, padding: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: sidebarTab === tab ? '#0A0A0A' : '#5A5A5A', fontFamily: 'var(--font-grotesk)', borderBottom: sidebarTab === tab ? '2px solid #0A0A0A' : '3px solid transparent', fontSize: '0.9rem', transition: 'all 0.2s', position: 'relative', fontWeight: sidebarTab === tab ? 600 : 400 }}>
                {tab === 'CHAT' ? <><MessageSquare size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Chat</>
                  : <><Users size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Members ({peers.length + 1}){waitingUsers.length > 0 && isHostOrCoHost && <span style={{ position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: '50%', background: 'var(--vermilion, #ff4500)' }} />}</>}
              </button>
            ))}
            <button
              onClick={() => setSidebarTab(null)}
              title="Close panel"
              style={{
                background: 'none',
                border: 'none',
                borderLeft: '2px solid #0A0A0A',
                padding: '0 1rem',
                alignSelf: 'stretch',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#0A0A0A',
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(10,10,10,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <X size={18} />
            </button>
          </div>

          {sidebarTab === 'CHAT' ? (
            <>
              <div className={styles.chatMessages}>
                {messages.length === 0 && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#5A5A5A', padding: '2rem 1rem', textAlign: 'center' }}>
                    <MessageSquare size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: '0.88rem' }}>No messages yet.<br />Start the conversation!</p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`${styles.message} ${m.senderId === user.id ? styles.self : ''}`}>
                    {m.senderId !== user.id && <span style={{ fontSize: '0.72rem', color: '#5A5A5A', fontFamily: 'var(--font-mono)', marginBottom: '0.2rem', paddingLeft: '0.25rem' }}>{m.senderName}</span>}
                    <div className={styles.messageContent}>
                      <div style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>{m.text}</div>
                      {m.translatedText && m.senderId !== user.id && (
                        <div className={styles.translatedText}>{m.translatedText}</div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={sendMessage} className={styles.chatInputArea}>
                <input type="text" className={styles.chatInput} placeholder="Type a message..." value={chatInput} onChange={e => setChatInput(e.target.value)} />
                <button type="submit" className={styles.sendBtn}><Send size={16} /></button>
              </form>
            </>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
              {/* Waiting room section for host */}
              {isHostOrCoHost && waitingUsers.length > 0 && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0' }}>
                  <div style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: '#FF3311', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF3311', animation: 'pulse 1s infinite' }} /> Waiting Room ({waitingUsers.length}) </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {waitingUsers.map(w => (
                      <div key={w.userId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px' }}>
                        <Avatar name={w.name} size={32} color="#0A0A0A" avatarUrl={w.avatar} />
                        <span style={{ flex: 1, color: '#0A0A0A', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                        <button onClick={() => handleAdmit(w.userId)} style={{ width: 28, height: 28, borderRadius: '6px', background: '#0022FF', border: 'none', color: '#0A0A0A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <UserCheck size={14} />
                        </button>
                        <button onClick={() => handleReject(w.userId)} style={{ width: 28, height: 28, borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#FF3311', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <UserX size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* In-meeting participants */}
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.72rem', fontWeight: 700, color: '#5A5A5A', textTransform: 'uppercase', letterSpacing: '0.08em' }}>In Meeting</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 0.75rem', background: 'transparent', borderRadius: '0', border: 'none', borderBottom: '1px solid #5A5A5A' }}>
                  <Avatar name={user.name} size={34} color="#0022FF" avatarUrl={user.avatar} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#0A0A0A', fontSize: '0.88rem' }}>{user.name} <span style={{ color: '#5A5A5A', fontFamily: 'var(--font-mono)', fontWeight: 400 }}>(You)</span></div>
                    <div style={{ fontSize: '0.72rem', color: '#0022FF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{participantRole}</div>
                  </div>
                </div>
                {peers.map((peer, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 0.75rem', background: 'transparent', borderRadius: 0, borderBottom: '1px solid #0A0A0A' }}>
                    <Avatar name={peer.name || `P${i + 1}`} size={34} color="#0A0A0A" avatarUrl={peer.avatar} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: '#0A0A0A', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{peer.name || `Participant ${i + 1}`}</div>
                      <div style={{ fontSize: '0.72rem', color: peer.role === 'HOST' ? '#0022FF' : peer.role === 'COHOST' ? '#FF3311' : '#5A5A5A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{peer.role || 'Connected'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexShrink: 0 }}>
                      {(peer.isAudioOn ?? true) ? <Mic size={14} color="#5A5A5A" /> : <MicOff size={14} color="#FF3311" />}
                      {(peer.isVideoOn ?? true) ? <Video size={14} color="#5A5A5A" /> : <VideoOff size={14} color="#FF3311" />}
                      
                      {isHost && peer.role !== 'HOST' && (
                        <button onClick={() => handleToggleMeetingCoHost(peer.userId, peer.role === 'COHOST')} title={peer.role === 'COHOST' ? 'Remove Co-Host' : 'Make Co-Host'} style={{ background: 'none', border: 'none', color: peer.role === 'COHOST' ? '#FF3311' : '#5A5A5A', cursor: 'pointer', padding: '0.1rem', display: 'flex' }}>
                          <Star size={14} fill={peer.role === 'COHOST' ? '#FF3311' : 'none'} />
                        </button>
                      )}
                      {((isHost && peer.role !== 'HOST') || (participantRole === 'COHOST' && peer.role === 'PARTICIPANT')) && (
                        <button onClick={() => handleRemoveParticipant(peer.userId)} title="Remove Participant" style={{ background: 'none', border: 'none', color: '#FF3311', cursor: 'pointer', padding: '0.1rem', display: 'flex' }}>
                          <Trash2 size={14} />
                        </button>
                      )}

                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </main>

      {/* === SUMMARY MODAL === */}
        {summaryModal.isOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSummaryModal(prev => ({ ...prev, isOpen: false }))}>
            <div style={{ background: '#F7F5F0', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '0', padding: '2rem', width: 600, maxWidth: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-grotesk)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexShrink: 0 }}>
                <h2 style={{ margin: 0, color: '#0A0A0A', fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 400 }}>
                  ✨ Live Summary
                </h2>
                <button onClick={() => setSummaryModal(prev => ({ ...prev, isOpen: false }))} style={{ background: 'transparent', border: 'none', color: '#0A0A0A', cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', color: '#0A0A0A', fontSize: '1rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {summaryModal.loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', color: 'var(--cobalt, #a3c4f3)' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(163,196,243,0.2)', borderTopColor: 'var(--cobalt, #a3c4f3)', animation: 'spin 1s linear infinite' }} />
                    <p style={{ margin: 0, fontWeight: 400 }}>Analyzing Live Transcript...</p>
                  </div>
                ) : summaryModal.text}
              </div>
              <button onClick={() => setSummaryModal(prev => ({ ...prev, isOpen: false }))} style={{ width: '100%', marginTop: '1.5rem', padding: '0.8rem', background: 'transparent', background: '#0022FF', color: '#F7F5F0', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 rgba(10,10,10,1)', borderRadius: '0', fontFamily: 'var(--font-grotesk)', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* === SETTINGS MODAL === */}        {showLeaveModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setShowLeaveModal(false)}>
            <div style={{ background: '#F7F5F0', border: '2px solid #0A0A0A', borderRadius: '0', padding: 'clamp(1.5rem, 5vw, 3rem)', width: '100%', maxWidth: 440, boxSizing: 'border-box', fontFamily: 'var(--font-grotesk)', boxShadow: '8px 8px 0 rgba(10,10,10,1)' }} onClick={(e) => e.stopPropagation()}>
              <h2 style={{ margin: '0 0 1rem 0', color: '#0A0A0A', fontSize: '1.8rem', fontWeight: 600, fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Leave Meeting</h2>
              <p style={{ margin: '0 0 2rem 0', color: '#5A5A5A', fontSize: '0.95rem', lineHeight: 1.5 }}>
                You are the host. Do you want to end the meeting for everyone, or just leave?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <button onClick={confirmEndMeeting} style={{ padding: '1rem', background: '#FF3311', color: '#F7F5F0', border: '2px solid #0A0A0A', fontWeight: 600, cursor: 'pointer', fontSize: '1rem', textTransform: 'uppercase', boxShadow: '4px 4px 0 rgba(10,10,10,1)' }}>
                  End Meeting for All
                </button>
                <button onClick={confirmLeaveMeeting} style={{ padding: '1rem', background: '#0A0A0A', color: '#F7F5F0', border: '2px solid #0A0A0A', fontWeight: 600, cursor: 'pointer', fontSize: '1rem', textTransform: 'uppercase', boxShadow: '4px 4px 0 rgba(10,10,10,1)' }}>
                  Just Leave
                </button>
                <button onClick={() => setShowLeaveModal(false)} style={{ padding: '0.75rem', background: 'transparent', color: '#0A0A0A', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'underline' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showSettings && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setShowSettings(false)}>
            <div style={{ background: '#F7F5F0', border: '2px solid #0A0A0A', borderRadius: '0', padding: 'clamp(1.5rem, 5vw, 3rem)', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', fontFamily: 'var(--font-grotesk)', boxShadow: '8px 8px 0 rgba(10,10,10,1)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <h2 style={{ margin: 0, color: '#0A0A0A', fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 600, fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
                  <Settings size={20} color="#0A0A0A" /> <span style={{color: "#0A0A0A"}}>Settings</span>
                </h2>
                <button onClick={() => setShowSettings(false)} style={{ background: 'transparent', border: 'none', color: '#0A0A0A', cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
              </div>
  
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', color: '#0A0A0A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <Globe size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} />My spoken language (mic)
                    </label>
                    <select value={spokenLanguage} onChange={e => {
                        const val = e.target.value;
                        setSpokenLanguage(val);
                        if (useAuthStore.getState().user) {
                          useAuthStore.getState().user.language = val;
                        }
                        if (socket) socket.emit("user:update_settings", useAuthStore.getState().user);
                        const token = localStorage.getItem('token');
                        if (token) {
                          fetch(`${API_URL}/auth/profile`, {
                            method: 'PUT',
                            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ preferredLanguage: val })
                          }).catch(console.error);
                        }
                      }} style={{ width: '100%', padding: '0.75rem 1rem', background: 'transparent', color: '#0A0A0A', border: '2px solid #0A0A0A', borderRadius: '0', fontSize: '0.9rem', outline: 'none', boxShadow: '4px 4px 0 rgba(10,10,10,1)' }}>
                      {LANG_OPTIONS.map(l => <option key={l.value} value={l.value} style={{ background: '#F7F5F0', color: '#0A0A0A' }}>{l.label}</option>)}
                    </select>
                  </div>
                  
                  {/* Speech to Speech */}
                  <div style={{ padding: '1.25rem', background: 'transparent', borderRadius: '0', borderBottom: '1px solid rgba(10,10,10,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (user.ttsEnabled ?? true) ? '1rem' : '0' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, color: '#0A0A0A', fontSize: '0.9rem' }}>Speech-to-Speech</p>
                        <p style={{ margin: 0, color: '#5A5A5A', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', marginTop: '0.2rem' }}>Read out audio translations</p>
                      </div>
                      <label style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer' }}>
                        <input type="checkbox" checked={user.ttsEnabled ?? true} onChange={e => updateUserSettings('ttsEnabled', e.target.checked)} style={{ display: 'none' }} />
                        <div style={{ width: 44, height: 24, borderRadius: '999px', background: (user.ttsEnabled ?? true) ? '#0022FF' : 'rgba(10,10,10,0.2)', transition: 'background 0.2s', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 2, left: (user.ttsEnabled ?? true) ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                        </div>
                      </label>
                    </div>
                    {(user.ttsEnabled ?? true) && (
                      <select value={user.ttsLang || 'original'} onChange={e => updateUserSettings('ttsLang', e.target.value)} style={{ width: '100%', padding: '0.75rem 1rem', background: 'transparent', color: '#0A0A0A', border: '1px solid #0A0A0A', borderRadius: '0', fontSize: '0.9rem', outline: 'none' }}>
                        <option value="original" style={{ background: '#F7F5F0', color: '#0A0A0A' }}>Original</option>
                        {LANG_OPTIONS.map(l => <option key={l.value} value={l.value} style={{ background: '#F7F5F0', color: '#0A0A0A' }}>{l.label}</option>)}
                      </select>
                    )}
                  </div>
  
                  {/* Message Chat Translation */}
                  <div style={{ padding: '1.25rem', background: 'transparent', borderRadius: '0', borderBottom: '1px solid rgba(10,10,10,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (user.chatEnabled ?? true) ? '1rem' : '0' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, color: '#0A0A0A', fontSize: '0.9rem' }}>Message Chat Translation</p>
                      </div>
                      <label style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer' }}>
                        <input type="checkbox" checked={user.chatEnabled ?? true} onChange={e => updateUserSettings('chatEnabled', e.target.checked)} style={{ display: 'none' }} />
                        <div style={{ width: 44, height: 24, borderRadius: '999px', background: (user.chatEnabled ?? true) ? '#0022FF' : 'rgba(10,10,10,0.2)', transition: 'background 0.2s', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 2, left: (user.chatEnabled ?? true) ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                        </div>
                      </label>
                    </div>
                    {(user.chatEnabled ?? true) && (
                      <select value={user.chatLang || 'original'} onChange={e => updateUserSettings('chatLang', e.target.value)} style={{ width: '100%', padding: '0.75rem 1rem', background: 'transparent', color: '#0A0A0A', border: '1px solid #0A0A0A', borderRadius: '0', fontSize: '0.9rem', outline: 'none' }}>
                        <option value="original" style={{ background: '#F7F5F0', color: '#0A0A0A' }}>Original</option>
                        {LANG_OPTIONS.map(l => <option key={l.value} value={l.value} style={{ background: '#F7F5F0', color: '#0A0A0A' }}>{l.label}</option>)}
                      </select>
                    )}
                  </div>
  
                  {/* Speech to Caption */}
                  <div style={{ padding: '1.25rem', background: 'transparent', borderRadius: '0', borderBottom: '1px solid rgba(10,10,10,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (user.captionEnabled ?? true) ? '1rem' : '0' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, color: '#0A0A0A', fontSize: '0.9rem' }}>Speech to Caption</p>
                      </div>
                      <label style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer' }}>
                        <input type="checkbox" checked={user.captionEnabled ?? true} onChange={e => updateUserSettings('captionEnabled', e.target.checked)} style={{ display: 'none' }} />
                        <div style={{ width: 44, height: 24, borderRadius: '999px', background: (user.captionEnabled ?? true) ? '#0022FF' : 'rgba(10,10,10,0.2)', transition: 'background 0.2s', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 2, left: (user.captionEnabled ?? true) ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                        </div>
                      </label>
                    </div>
                    {(user.captionEnabled ?? true) && (
                      <select value={user.captionLang || 'original'} onChange={e => updateUserSettings('captionLang', e.target.value)} style={{ width: '100%', padding: '0.75rem 1rem', background: 'transparent', color: '#0A0A0A', border: '1px solid #0A0A0A', borderRadius: '0', fontSize: '0.9rem', outline: 'none' }}>
                        <option value="original" style={{ background: '#F7F5F0', color: '#0A0A0A' }}>Original</option>
                        {LANG_OPTIONS.map(l => <option key={l.value} value={l.value} style={{ background: '#F7F5F0', color: '#0A0A0A' }}>{l.label}</option>)}
                      </select>
                    )}
                  </div>
              </div>
  
              <button onClick={() => setShowSettings(false)} style={{ width: '100%', marginTop: '2rem', padding: '1rem', background: 'transparent', background: '#0022FF', color: '#F7F5F0', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 rgba(10,10,10,1)', borderRadius: '0', fontWeight: 400, cursor: 'pointer', fontSize: '1rem', fontFamily: 'var(--font-grotesk)' }}>
                Done
              </button>
            </div>
          </div>
        )}
  
      {/* === LOBBY TOAST NOTIFICATION === */}
      {lobbyToast && (
        <div style={{
          position: 'fixed', bottom: '5.5rem', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9998,
          background: 'rgba(0,0,0,0.8)',
          border: '1px solid var(--vermilion, #ff4500)',
          borderRadius: '0',
          padding: '0.9rem 1.4rem',
          display: 'flex', alignItems: 'center', gap: '0.8rem',
          backdropFilter: 'blur(20px)',
          minWidth: 280, maxWidth: 380,
          animation: 'slideUp 0.3s ease',
          fontFamily: 'var(--font-grotesk)'
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--vermilion, #ff4500)', flexShrink: 0, animation: 'pulse 1s infinite' }} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 600, color: '#F7F5F0', fontSize: '0.9rem' }}>
              Someone is waiting
            </p>
            <p style={{ margin: 0, color: '#DDD', fontSize: '0.8rem', marginTop: '0.15rem' }}>
              <span style={{ color: '#0022FF', fontWeight: 600 }}>{lobbyToast.name}</span> is in the lobby
            </p>
          </div>
          <button
            onClick={() => { setShowLobby(true); setLobbyToast(null); }}
            style={{ background: 'transparent', border: '1px solid var(--vermilion, #ff4500)', color: 'var(--vermilion, #ff4500)', padding: '0.4rem 0.85rem', borderRadius: '0', cursor: 'pointer', fontFamily: 'var(--font-grotesk)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
          >
            Let In
          </button>
          <button
            onClick={() => setLobbyToast(null)}
            style={{ background: 'none', border: 'none', color: '#F7F5F0', cursor: 'pointer', fontSize: '1.1rem', padding: '0.1rem', flexShrink: 0 }}
          >
            ×
          </button>
        </div>
      )}

        {/* === ALERT MODAL === */}
      {alertMessage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#F7F5F0', padding: '3rem', borderRadius: '0', border: '2px solid #0A0A0A', boxShadow: '8px 8px 0 rgba(10,10,10,1)', maxWidth: 380, width: '90%', textAlign: 'center' }}>
            <p style={{ margin: '0 0 1.5rem', color: '#0A0A0A', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>{alertMessage}</p>
            <button onClick={() => setAlertMessage(null)} style={{ width: '100%', padding: '0.875rem', background: '#0022FF', color: '#0A0A0A', border: 'none', borderRadius: '0', fontWeight: 700, cursor: 'pointer' }}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}





















