'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Send,
  Users, Settings, Shield, UserCheck, UserX,
  MessageSquare, Globe, ChevronRight, VolumeX, MoreVertical, Star
} from 'lucide-react';
import useAuthStore from '../../../stores/authStore';
import styles from './meeting.module.css';

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
function Avatar({ name, size = 36, color = '#3b82f6' }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.38, color: 'white', flexShrink: 0,
      border: '2px solid rgba(255,255,255,0.15)',
    }}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

// -------- Video peer tile --------
const VideoPeer = ({ peer, name, isAudioOn = true, isVideoOn = true }) => {
  const ref = useRef();
  useEffect(() => {
    peer.on('stream', stream => { if (ref.current) ref.current.srcObject = stream; });
  }, [peer]);
  return (
    <div className={`${styles.videoTile} ${isAudioOn ? styles.activeSpeaker : ''}`}>
      <video playsInline autoPlay ref={ref} className={styles.video} />
      {!isVideoOn && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
          <Avatar name={name ? name.split(' (')[0] : 'P'} size={60} color="var(--cobalt, #3b82f6)" />
        </div>
      )}
      <div className={styles.tileOverlay}>
        <span className={styles.tileName}>{name || 'Participant'}</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!isAudioOn && <MicOff size={16} color="var(--vermilion, #ef4444)" />}
          {!isVideoOn && <VideoOff size={16} color="var(--vermilion, #ef4444)" />}
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
  const [waitingUsers, setWaitingUsers] = useState([]);
  const [sidebarTab, setSidebarTab] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
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
  
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMoreMenu]);
  const audioLockedRef = useRef(false);
  const videoLockedRef = useRef(false);
  const [isAudioLocked, setIsAudioLocked] = useState(false);
  const [isVideoLocked, setIsVideoLocked] = useState(false);
  const [roomAudioLocked, setRoomAudioLocked] = useState(false);
  const [roomVideoLocked, setRoomVideoLocked] = useState(false);

  useEffect(() => { roleRef.current = participantRole; }, [participantRole]);
  useEffect(() => { audioRef.current = isAudioOn; }, [isAudioOn]);
  useEffect(() => { videoRef.current = isVideoOn; }, [isVideoOn]);
  useEffect(() => { streamRef.current = stream; }, [stream]);

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  };

  const createPeer = (userToSignal, callerID, stream, currentSocket, userName, userRole) => {
    const peer = new Peer({ initiator: true, trickle: false, stream, config: iceServers });
    peer.on('signal', signal => {
      currentSocket.emit('audio:signal', { targetSocketId: userToSignal, callerId: callerID, signal, name: userName, role: userRole, userId: user.id });
    });
    return peer;
  };

  const addPeer = (incomingSignal, callerID, stream, currentSocket, userName, userRole) => {
    const peer = new Peer({ initiator: false, trickle: false, stream, config: iceServers });
    peer.on('signal', signal => {
      currentSocket.emit('audio:signal', { signal, targetSocketId: callerID, callerId: currentSocket.id, name: userName, role: userRole, userId: user.id });
    });
    peer.signal(incomingSignal);
    return peer;
  };

  useEffect(() => {
    if (!user) return;
    if (socketInitialized.current) return;
    socketInitialized.current = true;

    let newSocket;

    const initializeMeeting = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/meetings/join/${meetingId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Meeting ended, not found, or unauthorized');

        const data = await res.json();
        setParticipantStatus(data.participantStatus);
        setParticipantRole(data.participantRole);

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

        newSocket = io(SOCKET_URL);
        setSocket(newSocket);
        newSocket.emit('meeting:join', { meetingId, userId: user.id, peerId: newSocket.id, language: user.language });
        setTimeout(() => newSocket.emit('meeting:status_update', { isAudioOn: audioRef.current, isVideoOn: videoRef.current }), 2000);
          newSocket.emit('user:update_settings', useAuthStore.getState().user || {});

                  newSocket.on('participant:promoted', ({ userId, role }) => {
            if (userId === useAuthStore.getState().user?.id) {
              setParticipantRole(role);
              // role updated to COHOST
              // role updated to PARTICIPANT
            } else {
              setPeers(prev => prev.map(p => p.userId === userId ? { ...p, role } : p));
            }
          });
          newSocket.on('waiting:request', ({ userId, name }) => {
          setWaitingUsers(prev => prev.some(u => u.userId === userId) ? prev : [...prev, { userId, name }]);
          // Auto-show lobby panel for host
          setShowLobby(true);
        });
        newSocket.on('waiting:admitted', ({ userId }) => {
          if (userId === user.id) {
            setParticipantStatus('ADMITTED');
            newSocket.emit('meeting:join', { meetingId, userId: user.id, peerId: newSocket.id, language: user.language });
        setTimeout(() => newSocket.emit('meeting:status_update', { isAudioOn: audioRef.current, isVideoOn: videoRef.current }), 2000);
          } else {
            setWaitingUsers(prev => prev.filter(u => u.userId !== userId));
          }
        });
        newSocket.on('waiting:rejected', ({ userId }) => {
          if (userId === user.id) setParticipantStatus('REJECTED');
          else setWaitingUsers(prev => prev.filter(u => u.userId !== userId));
        });
        newSocket.on('participant:joined', ({ userId, socketId, name, role }) => {
          newSocket.emit('meeting:status_update', { isAudioOn: audioRef.current, isVideoOn: videoRef.current });
          const peer = createPeer(socketId, newSocket.id, currentStream, newSocket, user.name, data.participantRole);
          peersRef.current.push({ peerID: socketId, userId, peer, name, role });
          setPeers([...peersRef.current]);
        });
        newSocket.on('participant:left', ({ socketId }) => {
          const obj = peersRef.current.find(p => p.peerID === socketId);
          if (obj) obj.peer.destroy();
          peersRef.current = peersRef.current.filter(p => p.peerID !== socketId);
          setPeers([...peersRef.current]);
        });
        newSocket.on('audio:signal', payload => {
          const item = peersRef.current.find(p => p.peerID === payload.callerId);
          if (item) {
            item.peer.signal(payload.signal);
          } else {
            const peer = addPeer(payload.signal, payload.callerId, currentStream, newSocket, user.name, data.participantRole);
            peersRef.current.push({ peerID: payload.callerId, userId: payload.userId, peer, name: payload.name, role: payload.role });
            setPeers([...peersRef.current]);
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
            const u = useAuthStore.getState().user || {};
            
            const captionEnabled = u.captionEnabled ?? true;
            const captionLang = u.captionLang || 'original';
            
            if (captionEnabled) {
              const textToShow = captionLang === 'original' ? data.text : (data.translations[captionLang] || `[Rate Limited] ${data.text}`);
              if (textToShow) {
                setCurrentCaption(textToShow);
                setTimeout(() => setCurrentCaption(null), 4000);
              }
            }

            const ttsEnabled = u.ttsEnabled ?? true;
            const ttsLang = u.ttsLang || 'original';
            
            console.log("Caption arrived! ttsEnabled:", ttsEnabled, "speakerSocket:", data.senderSocketId, "mySocket:", newSocket.id);
              if (ttsEnabled && data.senderSocketId !== newSocket.id) {
              console.log("TTS condition passed! Preparing to speak via Backend Proxy API...");
              const textToSpeak = ttsLang === 'original' ? data.text : (data.translations[ttsLang] || data.text);
              if (textToSpeak) {
                const targetLangCode = ttsLang === 'original' ? (data.sourceLanguage || 'en') : ttsLang;
                const url = `${API_URL}/tts?text=${encodeURIComponent(textToSpeak)}&lang=${targetLangCode.split('-')[0]}`;
                const audio = new Audio(url);
                audio.play().catch(e => console.warn("Autoplay blocked for cloud TTS:", e));
                console.log("Playing Cloud TTS:", textToSpeak, "| Lang:", targetLangCode);
              }
            }
          });
      } catch (err) {
        console.error(err);
        setAlertMessage(err.message || 'Failed to join meeting.');
        setTimeout(() => router.push('/dashboard'), 2000);
      }
    };

    initializeMeeting();
    return () => { if (newSocket) newSocket.disconnect(); };
  }, [user, meetingId]);

  // Speech recognition
  useEffect(() => {
    if (!socket || !user || !isAudioOn) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false; // Changed to false to prevent Google Translate IP bans
    recognition.lang = spokenLanguage;

    let isStopped = false;
    recognition.onresult = (event) => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; ++i)
        text += event.results[i][0].transcript;
      if (text.trim()) {
        socket.emit('caption:text', { meetingId, speakerId: user.id, text: text.trim(), language: spokenLanguage });
      }
    };
    recognition.onerror = (e) => { if (e.error !== 'no-speech') console.warn('Speech error:', e.error); };
    recognition.onend = () => { if (!isStopped && isAudioOn) { try { recognition.start(); } catch {} } };
    try { recognition.start(); } catch {}
    return () => { isStopped = true; recognition.stop(); };
  }, [socket, user, isAudioOn, meetingId, spokenLanguage]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const toggleVideo = () => {
    if (videoLockedRef.current) {
      setAlertMessage('Camera is disabled by Host');
      return;
    }
    stream?.getVideoTracks().forEach(t => { t.enabled = !isVideoOn; });
    setIsVideoOn(v => !v);
    if (socket) socket.emit('meeting:status_update', { isAudioOn: audioRef.current, isVideoOn: !videoRef.current });
  };
  const toggleAudio = () => {
    if (audioLockedRef.current) {
      setAlertMessage('Microphone is disabled by Host');
      return;
    }
    stream?.getAudioTracks().forEach(t => { t.enabled = !isAudioOn; });
    setIsAudioOn(a => !a);
    if (socket) socket.emit('meeting:status_update', { isAudioOn: !audioRef.current, isVideoOn: videoRef.current });
  };

  const authFetch = (path, opts = {}) =>
    fetch(`${API_URL}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json', ...opts.headers },
    });

  const handleAdmit = async (targetUserId) => {
    try {
      await authFetch(`/meetings/${meetingId}/admit`, { method: 'POST', body: JSON.stringify({ userId: targetUserId }) });
      socket.emit('meeting:admit', { meetingId, targetUserId });
      setWaitingUsers(prev => prev.filter(u => u.userId !== targetUserId));
    } catch (err) { console.error('Failed to admit', err); }
  };

  const handleReject = async (targetUserId) => {
    try {
      await authFetch(`/meetings/${meetingId}/reject`, { method: 'POST', body: JSON.stringify({ userId: targetUserId }) });
      socket.emit('meeting:reject', { meetingId, targetUserId });
      setWaitingUsers(prev => prev.filter(u => u.userId !== targetUserId));
    } catch (err) { console.error('Failed to reject', err); }
  };

  const leaveMeeting = async () => {
    try { await authFetch(`/meetings/${meetingId}/end`, { method: 'POST' }); } catch {}
    router.push(`/meeting/${meetingId}/report`);
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
        alert(data.error || 'Failed to toggle co-host');
      }
    } catch (err) {
      alert('Failed to toggle co-host');
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
    const phrases = [
      "Hello, this is a test of the speech translation system.",
      "I am speaking in my native language right now.",
      "Technology makes communication so much easier."
    ];
    let count = 0;
    
    // Fire the first one immediately
    socket.emit('caption:text', { meetingId, speakerId: user.id, text: phrases[0], language: spokenLanguage });
    
    const interval = setInterval(() => {
      count++;
      const text = phrases[count % phrases.length];
      socket.emit('caption:text', { meetingId, speakerId: user.id, text, language: spokenLanguage });
    }, 6000); // every 6 seconds

    return () => clearInterval(interval);
  }, [isDemoActive, socket, meetingId, user, spokenLanguage]);

  const isHost = participantRole === 'HOST';
  const isHostOrCoHost = isHost || participantRole === 'COHOST';

  if (!user) return null;

  // ======= REJECTED SCREEN =======
  if (participantStatus === 'REJECTED') {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: 'radial-gradient(ellipse at center, #1a0a0a 0%, #0f172a 100%)', gap: '1.5rem' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <UserX size={36} color="#ef4444" />
        </div>
        <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '1.5rem' }}>Access Denied</h2>
        <p style={{ color: '#9ca3af', margin: 0 }}>The host declined your request to join this meeting.</p>
        <button onClick={() => router.push('/dashboard')} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0.75rem 2rem', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  // ======= WAITING ROOM =======
  if (participantStatus === 'WAITING') {
    return (
      <div style={{ display: 'flex', height: '100vh', background: 'radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.08) 0%, #0f172a 60%)', overflow: 'hidden' }}>

        {/* Left — camera preview */}
        <div style={{ flex: '0 0 55%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
          <div style={{ width: '100%', maxWidth: 560, position: 'relative' }}>
            {/* Video card */}
            <div style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden', background: '#0a0f1e', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.1)', aspectRatio: '16/9' }}>
              <video playsInline muted ref={userVideo} autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {!isVideoOn && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0f1e' }}>
                  <Avatar name={user.name} size={72} color="#3b82f6" />
                </div>
              )}
              {/* Gradient overlay at bottom */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }} />
              {/* Name badge */}
              <div style={{ position: 'absolute', bottom: 16, left: 16, fontSize: '0.88rem', fontWeight: 600, color: 'white', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: '0.3rem 0.7rem', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.15)' }}>
                {user.name} (You)
              </div>
              {/* Controls overlay */}
              <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', gap: '0.6rem' }}>
                <button onClick={toggleAudio} style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: isAudioOn ? 'rgba(255,255,255,0.15)' : '#ef4444', backdropFilter: 'blur(8px)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                  {isAudioOn ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
                <button onClick={toggleVideo} style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: isVideoOn ? 'rgba(255,255,255,0.15)' : '#ef4444', backdropFilter: 'blur(8px)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                  {isVideoOn ? <Video size={18} /> : <VideoOff size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right — waiting info */}
        <div style={{ flex: '0 0 45%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ maxWidth: 380, width: '100%' }}>
            {/* Pulsing icon */}
            <div style={{ position: 'relative', width: 72, height: 72, marginBottom: '2rem' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(59,130,246,0.2)', animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }} />
              <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', background: 'rgba(59,130,246,0.15)', border: '1.5px solid rgba(59,130,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UserCheck size={30} color="#60a5fa" />
              </div>
            </div>

            <h1 style={{ margin: '0 0 0.75rem', color: 'var(--text-primary)', fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2 }}>
              Waiting for host to let you in
            </h1>
            <p style={{ margin: '0 0 2.5rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.95rem', lineHeight: 1.6 }}>
              The host will admit you shortly. You will join automatically once admitted.
            </p>

            {/* Status indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1.2rem', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '0', marginBottom: '1.5rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#60a5fa', animation: 'pulse 2s infinite' }} />
              <span style={{ color: '#93c5fd', fontSize: '0.88rem' }}>Waiting in lobby — meeting: <strong>{meetingId}</strong></span>
            </div>

            <button
              onClick={() => router.push('/dashboard')}
              style={{ width: '100%', padding: '0.875rem', background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.14)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
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
          position: 'fixed', top: '5rem', right: '370px', zIndex: 500,
          width: 300, background: 'rgba(0,0,0,0.8)',
          border: '1px solid var(--vermilion, #ff4500)', borderRadius: '0',
          backdropFilter: 'blur(20px)', overflow: 'hidden', fontFamily: 'var(--font-grotesk)'
        }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--vermilion, #ff4500)', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontWeight: 400, color: 'white', fontSize: '0.9rem' }}>Lobby ({waitingUsers.length})</span>
            </div>
            <button onClick={() => setShowLobby(false)} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
          </div>
          <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 300, overflowY: 'auto' }}>
            {waitingUsers.map(w => (
              <div key={w.userId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem', background: 'transparent', borderRadius: 0, borderBottom: '1px solid var(--text-primary)' }}>
                <Avatar name={w.name} size={34} color="#4b5563" />
                <span style={{ flex: 1, color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                <button onClick={() => handleAdmit(w.userId)} title="Admit" style={{ width: 30, height: 30, borderRadius: '0', background: 'var(--cobalt)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCheck size={15} />
                </button>
                <button onClick={() => handleReject(w.userId)} title="Reject" style={{ width: 30, height: 30, borderRadius: '0', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserX size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === HEADER === */}
      <header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--vermilion, #ff4500)' }} />
            <span className={styles.headerTitle}>BhashaBridge</span>
          </div>
          <div style={{ height: 16, width: 1, background: 'rgba(255,255,255,0.2)' }} />
          <code className={styles.headerBadge}>
            {meetingId}
          </code>
          {participantRole && (
            <span className={styles.headerBadge} style={{ color: participantRole === 'HOST' ? 'var(--vermilion, #ff4500)' : 'var(--cobalt, #a3c4f3)' }}>
              {participantRole}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {isHostOrCoHost && waitingUsers.length > 0 && (
            <button
              onClick={() => setShowLobby(l => !l)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: 'var(--vermilion, #ff4500)', cursor: 'pointer', fontFamily: 'var(--font-grotesk)', fontSize: '0.9rem' }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--vermilion, #ff4500)', animation: 'pulse 1s infinite' }} />
              Lobby ({waitingUsers.length})
            </button>
          )}
          <button onClick={fetchLiveSummary} style={{ background: 'transparent', border: 'none', color: 'var(--cobalt, #a3c4f3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-grotesk)', fontSize: '0.9rem' }}>
            ✨ Summary
          </button>
          <button onClick={() => setShowSettings(true)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-grotesk)', fontSize: '0.9rem' }}>
            <Settings size={16} /> Settings
          </button>
          <button onClick={() => setIsDemoActive(!isDemoActive)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '999px', color: isDemoActive ? 'var(--vermilion, #ff4500)' : 'white', padding: '0.4rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-grotesk)', fontSize: '0.8rem', textTransform: 'uppercase' }}>
            {isDemoActive ? 'Stop Demo' : 'Start Demo'}
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
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
                  <Avatar name={user.name} size={60} color="var(--cobalt, #3b82f6)" />
                </div>
              )}
              <div className={styles.tileOverlay}>
                <span className={styles.tileName}>{user.name} (You)</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!isAudioOn && <MicOff size={16} color="var(--vermilion, #ef4444)" />}
                  {!isVideoOn && <VideoOff size={16} color="var(--vermilion, #ef4444)" />}
                </div>
              </div>
            </div>
            {peers.map((peer, i) => (
              <VideoPeer key={i} peer={peer.peer} name={`${peer.name || `Participant ${i + 1}`}`} isAudioOn={peer.isAudioOn} isVideoOn={peer.isVideoOn} />
            ))}
          </div>

          {/* Caption overlay */}
          {currentCaption && (
            <div className={styles.captionsOverlay}>
              <div className={styles.captionText}>{currentCaption}</div>
            </div>
          )}

          {/* Controls bar */}
          <div style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '1rem', padding: '0.75rem 1.5rem', background: 'var(--bg-ivory)', borderRadius: '0', border: 'var(--border-thick)', boxShadow: '8px 8px 0 rgba(10,10,10,1)', zIndex: 150 }}>
            <button
              onClick={toggleAudio}
              title={isAudioOn ? 'Mute' : 'Unmute'}
              style={{ width: 48, height: 48, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s', background: isAudioOn ? 'transparent' : 'var(--vermilion, #ff4500)', color: 'white' }}
            >
              {isAudioOn ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button
              onClick={toggleVideo}
              title={isVideoLocked ? 'Camera disabled by Host' : (isVideoOn ? 'Turn off camera' : 'Turn on camera')}
              style={{ opacity: isVideoLocked ? 0.5 : 1, cursor: isVideoLocked ? 'not-allowed' : 'pointer', width: 48, height: 48, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s', background: isVideoOn ? 'transparent' : 'var(--vermilion, #ff4500)', color: 'white' }}
            >
              {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              onClick={() => setSidebarTab(t => t === 'CHAT' ? null : 'CHAT')}
              title="Chat / Members"
              style={{ width: 48, height: 48, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: sidebarTab === 'CHAT' ? 'rgba(255,255,255,0.2)' : 'transparent', color: 'white' }}
            >
              <MessageSquare size={20} />
            </button>
            {isHostOrCoHost && (
              <div ref={moreMenuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowMoreMenu(m => !m)}
                  title="More Controls"
                  style={{ width: 48, height: 48, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: showMoreMenu ? 'rgba(255,255,255,0.2)' : 'transparent', color: 'white', transition: 'all 0.3s' }}
                >
                  <MoreVertical size={20} />
                </button>
                {showMoreMenu && (
                  <div style={{ position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0', padding: '0.5rem', minWidth: 220, backdropFilter: 'blur(20px)', zIndex: 100, fontFamily: 'var(--font-grotesk)' }}>
                    <button onClick={() => { if(socket) socket.emit('meeting:force_mute_all', { role: participantRole }); setShowMoreMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'none', border: 'none', color: 'var(--vermilion, #ff4500)', cursor: 'pointer', fontSize: '0.9rem' }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <MicOff size={16} /> Mute All
                    </button>
                    <button onClick={() => { if(socket) socket.emit('meeting:force_video_off_all', { role: participantRole }); setShowMoreMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'none', border: 'none', color: 'var(--vermilion, #ff4500)', cursor: 'pointer', fontSize: '0.9rem' }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <VideoOff size={16} /> Turn Off All Cameras
                    </button>
                    <button onClick={() => {
                      const newLock = !roomAudioLocked;
                      setRoomAudioLocked(newLock);
                      if(socket) socket.emit('meeting:lock_hardware', { role: participantRole, type: 'audio', locked: newLock });
                      setShowMoreMenu(false);
                    }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'none', border: 'none', color: roomAudioLocked ? 'var(--cobalt, #a3c4f3)' : 'var(--vermilion, #ff4500)', cursor: 'pointer', fontSize: '0.9rem' }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <MicOff size={16} /> {roomAudioLocked ? 'Unlock All Mics' : 'Lock All Mics'}
                    </button>
                    <button onClick={() => {
                      const newLock = !roomVideoLocked;
                      setRoomVideoLocked(newLock);
                      if(socket) socket.emit('meeting:lock_hardware', { role: participantRole, type: 'video', locked: newLock });
                      setShowMoreMenu(false);
                    }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'none', border: 'none', color: roomVideoLocked ? 'var(--cobalt, #a3c4f3)' : 'var(--vermilion, #ff4500)', cursor: 'pointer', fontSize: '0.9rem' }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <VideoOff size={16} /> {roomVideoLocked ? 'Unlock All Cameras' : 'Lock All Cameras'}
                    </button>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '0' }} />
                    <button onClick={() => { setShowLobby(l => !l); setShowMoreMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.9rem' }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <Shield size={16} /> {waitingUsers.length > 0 ? `Lobby (${waitingUsers.length})` : 'Lobby'}
                    </button>
                    <button onClick={() => { setSidebarTab(t => t === 'MEMBERS' ? null : 'MEMBERS'); setShowMoreMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.9rem' }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <Users size={16} /> Manage Members
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={leaveMeeting}
              title="Leave meeting"
              style={{ width: 48, height: 48, borderRadius: '0', border: 'var(--border-thin)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--vermilion, #ff4500)', color: 'white' }}
            >
              <PhoneOff size={20} />
            </button>
          </div>
        </div>

        {/* === SIDEBAR === */}
        <aside className={`${styles.chatSection} ${sidebarTab ? styles.chatSectionOpen : ''}`}>
          {/* Sidebar tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            {['CHAT', 'MEMBERS'].map(tab => (
              <button key={tab} onClick={() => setSidebarTab(tab)} style={{ flex: 1, padding: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: sidebarTab === tab ? 'white' : 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-grotesk)', borderBottom: sidebarTab === tab ? '2px solid white' : '2px solid transparent', fontSize: '0.9rem', transition: 'all 0.2s', position: 'relative' }}>
                {tab === 'CHAT' ? <><MessageSquare size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Chat</>
                  : <><Users size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Members ({peers.length + 1}){waitingUsers.length > 0 && isHostOrCoHost && <span style={{ position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: '50%', background: 'var(--vermilion, #ff4500)' }} />}</>}
              </button>
            ))}
          </div>

          {sidebarTab === 'CHAT' ? (
            <>
              <div className={styles.chatMessages}>
                {messages.length === 0 && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#4b5563', padding: '2rem 1rem', textAlign: 'center' }}>
                    <MessageSquare size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: '0.88rem' }}>No messages yet.<br />Start the conversation!</p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`${styles.message} ${m.senderId === user.id ? styles.self : ''}`}>
                    {m.senderId !== user.id && <span style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: '0.2rem', paddingLeft: '0.25rem' }}>{m.senderName}</span>}
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
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
                    Waiting Room ({waitingUsers.length})
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {waitingUsers.map(w => (
                      <div key={w.userId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px' }}>
                        <Avatar name={w.name} size={32} color="#374151" />
                        <span style={{ flex: 1, color: 'var(--text-primary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                        <button onClick={() => handleAdmit(w.userId)} style={{ width: 28, height: 28, borderRadius: '6px', background: 'var(--cobalt)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <UserCheck size={14} />
                        </button>
                        <button onClick={() => handleReject(w.userId)} style={{ width: 28, height: 28, borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <UserX size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* In-meeting participants */}
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.72rem', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em' }}>In Meeting</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 0.75rem', background: 'rgba(59,130,246,0.08)', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <Avatar name={user.name} size={34} color="#3b82f6" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.88rem' }}>{user.name} <span style={{ color: '#6b7280', fontWeight: 400 }}>(You)</span></div>
                    <div style={{ fontSize: '0.72rem', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{participantRole}</div>
                  </div>
                </div>
                {peers.map((peer, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 0.75rem', background: 'transparent', borderRadius: 0, borderBottom: '1px solid var(--text-primary)' }}>
                    <Avatar name={peer.name || `P${i + 1}`} size={34} color="#374151" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{peer.name || `Participant ${i + 1}`}</div>
                      <div style={{ fontSize: '0.72rem', color: peer.role === 'HOST' ? '#fbbf24' : peer.role === 'COHOST' ? '#a78bfa' : '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{peer.role || 'Connected'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexShrink: 0 }}>
                      {(peer.isAudioOn ?? true) ? <Mic size={14} color="#6b7280" /> : <MicOff size={14} color="#ef4444" />}
                      {(peer.isVideoOn ?? true) ? <Video size={14} color="#6b7280" /> : <VideoOff size={14} color="#ef4444" />}
                      {isHost && peer.role !== 'HOST' && (
                        <button onClick={() => handleToggleMeetingCoHost(peer.userId, peer.role === 'COHOST')} title={peer.role === 'COHOST' ? 'Remove Co-Host' : 'Make Co-Host'} style={{ background: 'none', border: 'none', color: peer.role === 'COHOST' ? '#c084fc' : '#6b7280', cursor: 'pointer', padding: '0.1rem', display: 'flex' }}>
                          <Star size={14} fill={peer.role === 'COHOST' ? '#c084fc' : 'none'} />
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
            <div style={{ background: '#000', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '0', padding: '2rem', width: 600, maxWidth: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-grotesk)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexShrink: 0 }}>
                <h2 style={{ margin: 0, color: 'white', fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 400 }}>
                  ✨ Live Summary
                </h2>
                <button onClick={() => setSummaryModal(prev => ({ ...prev, isOpen: false }))} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', color: 'white', fontSize: '1rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {summaryModal.loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', color: 'var(--cobalt, #a3c4f3)' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(163,196,243,0.2)', borderTopColor: 'var(--cobalt, #a3c4f3)', animation: 'spin 1s linear infinite' }} />
                    <p style={{ margin: 0, fontWeight: 400 }}>Analyzing Live Transcript...</p>
                  </div>
                ) : summaryModal.text}
              </div>
              <button onClick={() => setSummaryModal(prev => ({ ...prev, isOpen: false }))} style={{ width: '100%', marginTop: '1.5rem', padding: '0.8rem', background: 'transparent', color: 'var(--cobalt, #a3c4f3)', border: '1px solid var(--cobalt, #a3c4f3)', borderRadius: '0', fontFamily: 'var(--font-grotesk)', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* === SETTINGS MODAL === */}
        {showSettings && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSettings(false)}>
            <div style={{ background: '#000', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '0', padding: '2rem', width: 440, fontFamily: 'var(--font-grotesk)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <h2 style={{ margin: 0, color: 'white', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 400 }}>
                  <Settings size={20} color="white" /> Settings
                </h2>
                <button onClick={() => setShowSettings(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
              </div>
  
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                      }} style={{ width: '100%', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0', fontSize: '0.9rem', outline: 'none' }}>
                      {LANG_OPTIONS.map(l => <option key={l.value} value={l.value} style={{ background: '#0c1527', color: 'white' }}>{l.label}</option>)}
                    </select>
                  </div>
                  
                  {/* Speech to Speech */}
                  <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (user.ttsEnabled ?? true) ? '1rem' : '0' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Speech-to-Speech</p>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', marginTop: '0.2rem' }}>Read out audio translations</p>
                      </div>
                      <label style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer' }}>
                        <input type="checkbox" checked={user.ttsEnabled ?? true} onChange={e => { useAuthStore.getState().user.ttsEnabled = e.target.checked; setMessages([...messages]); if (socket) socket.emit("user:update_settings", useAuthStore.getState().user); }} style={{ display: 'none' }} />
                        <div style={{ width: 44, height: 24, borderRadius: '999px', background: (user.ttsEnabled ?? true) ? '#3b82f6' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 2, left: (user.ttsEnabled ?? true) ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                        </div>
                      </label>
                    </div>
                    {(user.ttsEnabled ?? true) && (
                      <select value={user.ttsLang || 'original'} onChange={e => { useAuthStore.getState().user.ttsLang = e.target.value; setMessages([...messages]); if (socket) socket.emit("user:update_settings", useAuthStore.getState().user); }} style={{ width: '100%', padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', fontSize: '0.9rem', outline: 'none' }}>
                        <option value="original" style={{ background: '#0c1527', color: 'white' }}>Original</option>
                        {LANG_OPTIONS.map(l => <option key={l.value} value={l.value} style={{ background: '#0c1527', color: 'white' }}>{l.label}</option>)}
                      </select>
                    )}
                  </div>
  
                  {/* Message Chat Translation */}
                  <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (user.chatEnabled ?? true) ? '1rem' : '0' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Message Chat Translation</p>
                      </div>
                      <label style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer' }}>
                        <input type="checkbox" checked={user.chatEnabled ?? true} onChange={e => { useAuthStore.getState().user.chatEnabled = e.target.checked; setMessages([...messages]); if (socket) socket.emit("user:update_settings", useAuthStore.getState().user); }} style={{ display: 'none' }} />
                        <div style={{ width: 44, height: 24, borderRadius: '999px', background: (user.chatEnabled ?? true) ? '#3b82f6' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 2, left: (user.chatEnabled ?? true) ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                        </div>
                      </label>
                    </div>
                    {(user.chatEnabled ?? true) && (
                      <select value={user.chatLang || 'original'} onChange={e => { useAuthStore.getState().user.chatLang = e.target.value; setMessages([...messages]); if (socket) socket.emit("user:update_settings", useAuthStore.getState().user); }} style={{ width: '100%', padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', fontSize: '0.9rem', outline: 'none' }}>
                        <option value="original" style={{ background: '#0c1527', color: 'white' }}>Original</option>
                        {LANG_OPTIONS.map(l => <option key={l.value} value={l.value} style={{ background: '#0c1527', color: 'white' }}>{l.label}</option>)}
                      </select>
                    )}
                  </div>
  
                  {/* Speech to Caption */}
                  <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (user.captionEnabled ?? true) ? '1rem' : '0' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Speech to Caption</p>
                      </div>
                      <label style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer' }}>
                        <input type="checkbox" checked={user.captionEnabled ?? true} onChange={e => { useAuthStore.getState().user.captionEnabled = e.target.checked; setMessages([...messages]); if (socket) socket.emit("user:update_settings", useAuthStore.getState().user); }} style={{ display: 'none' }} />
                        <div style={{ width: 44, height: 24, borderRadius: '999px', background: (user.captionEnabled ?? true) ? '#3b82f6' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 2, left: (user.captionEnabled ?? true) ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                        </div>
                      </label>
                    </div>
                    {(user.captionEnabled ?? true) && (
                      <select value={user.captionLang || 'original'} onChange={e => { useAuthStore.getState().user.captionLang = e.target.value; setMessages([...messages]); if (socket) socket.emit("user:update_settings", useAuthStore.getState().user); }} style={{ width: '100%', padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', fontSize: '0.9rem', outline: 'none' }}>
                        <option value="original" style={{ background: '#0c1527', color: 'white' }}>Original</option>
                        {LANG_OPTIONS.map(l => <option key={l.value} value={l.value} style={{ background: '#0c1527', color: 'white' }}>{l.label}</option>)}
                      </select>
                    )}
                  </div>
              </div>
  
              <button onClick={() => setShowSettings(false)} style={{ width: '100%', marginTop: '2rem', padding: '1rem', background: 'transparent', color: 'var(--cobalt, #a3c4f3)', border: '1px solid var(--cobalt, #a3c4f3)', borderRadius: '0', fontWeight: 400, cursor: 'pointer', fontSize: '1rem', fontFamily: 'var(--font-grotesk)' }}>
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
            <p style={{ margin: 0, fontWeight: 400, color: 'white', fontSize: '0.9rem' }}>
              Someone is waiting
            </p>
            <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
              <span style={{ color: 'var(--cobalt, #a3c4f3)' }}>{lobbyToast.name}</span> is in the lobby
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
            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1.1rem', padding: '0.1rem', flexShrink: 0 }}
          >
            ×
          </button>
        </div>
      )}

      {/* === ALERT MODAL === */}
      {alertMessage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-ivory)', padding: '3rem', borderRadius: '0', border: 'var(--border-thick)', boxShadow: '8px 8px 0 rgba(10,10,10,1)', maxWidth: 380, width: '90%', textAlign: 'center' }}>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>{alertMessage}</p>
            <button onClick={() => setAlertMessage(null)} style={{ width: '100%', padding: '0.875rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '0', fontWeight: 700, cursor: 'pointer' }}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}





