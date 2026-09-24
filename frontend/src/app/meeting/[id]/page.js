'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Send,
  Users, Settings, Shield, UserCheck, UserX,
  MessageSquare, Globe, ChevronRight
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
const VideoPeer = ({ peer, name }) => {
  const ref = useRef();
  useEffect(() => {
    peer.on('stream', stream => { if (ref.current) ref.current.srcObject = stream; });
  }, [peer]);
  return (
    <div className={styles.videoTile}>
      <video playsInline autoPlay ref={ref} className={styles.video} />
      <div className={styles.tileOverlay}>
        <span className={styles.tileName}>{name || 'Participant'}</span>
      </div>
    </div>
  );
};

// -------- Main Component --------
export default function MeetingRoom() {
  const params = useParams();
  const { id: meetingId } = params;
  const router = useRouter();
  const { user } = useAuthStore();

  const [socket, setSocket] = useState(null);
  const [peers, setPeers] = useState([]);
  const [stream, setStream] = useState(null);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [currentCaption, setCurrentCaption] = useState(null);
  const [spokenLanguage, setSpokenLanguage] = useState('en');
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const [participantStatus, setParticipantStatus] = useState(null);
  const [participantRole, setParticipantRole] = useState(null);
  const [waitingUsers, setWaitingUsers] = useState([]);
  const [sidebarTab, setSidebarTab] = useState('CHAT');
  const [showSettings, setShowSettings] = useState(false);
  const [showLobby, setShowLobby] = useState(false);
  const [alertMessage, setAlertMessage] = useState(null);
  const chatEndRef = useRef(null);
  const ttsEnabledRef = useRef(true);
  const userVideo = useRef();
  const peersRef = useRef([]);
  const socketInitialized = useRef(false);

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

        newSocket.on('waiting:request', ({ userId, name }) => {
          setWaitingUsers(prev => prev.some(u => u.userId === userId) ? prev : [...prev, { userId, name }]);
          // Auto-show lobby panel for host
          setShowLobby(true);
        });
        newSocket.on('waiting:admitted', ({ userId }) => {
          if (userId === user.id) {
            setParticipantStatus('ADMITTED');
            newSocket.emit('meeting:join', { meetingId, userId: user.id, peerId: newSocket.id, language: user.language });
          } else {
            setWaitingUsers(prev => prev.filter(u => u.userId !== userId));
          }
        });
        newSocket.on('waiting:rejected', ({ userId }) => {
          if (userId === user.id) setParticipantStatus('REJECTED');
          else setWaitingUsers(prev => prev.filter(u => u.userId !== userId));
        });
        newSocket.on('participant:joined', ({ userId, socketId, name, role }) => {
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
        newSocket.on('chat:message', data => {
          setMessages(prev => [...prev, data]);
        });
        newSocket.on('chat:translated', ({ messageId, translations }) => {
          setMessages(prev => prev.map(m =>
            m.id === messageId ? { ...m, translatedText: translations[user.language] } : m
          ));
        });
        newSocket.on('caption:translated', data => {
          if (data.translations[user.language]) {
            setCurrentCaption(data.translations[user.language]);
            if (window.speechSynthesis && ttsEnabledRef.current) {
              const utt = new SpeechSynthesisUtterance(data.translations[user.language]);
              utt.lang = user.language;
              window.speechSynthesis.speak(utt);
            }
            setTimeout(() => setCurrentCaption(null), 4000);
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
    recognition.interimResults = true;
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
    stream?.getVideoTracks().forEach(t => { t.enabled = !isVideoOn; });
    setIsVideoOn(v => !v);
  };
  const toggleAudio = () => {
    stream?.getAudioTracks().forEach(t => { t.enabled = !isAudioOn; });
    setIsAudioOn(a => !a);
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

  const sendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    const msg = { id: Date.now().toString(), meetingId, senderId: user.id, senderName: user.name, text: chatInput, language: user.language };
    socket.emit('chat:message', msg);
    setChatInput('');
  };

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
        <h2 style={{ color: '#f8fafc', margin: 0, fontSize: '1.5rem' }}>Access Denied</h2>
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

            <h1 style={{ margin: '0 0 0.75rem', color: '#f8fafc', fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2 }}>
              Waiting for host to let you in
            </h1>
            <p style={{ margin: '0 0 2.5rem', color: '#64748b', fontSize: '0.95rem', lineHeight: 1.6 }}>
              The host will admit you shortly. You will join automatically once admitted.
            </p>

            {/* Status indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1.2rem', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '12px', marginBottom: '1.5rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#60a5fa', animation: 'pulse 2s infinite' }} />
              <span style={{ color: '#93c5fd', fontSize: '0.88rem' }}>Waiting in lobby — meeting: <strong>{meetingId}</strong></span>
            </div>

            <button
              onClick={() => router.push('/dashboard')}
              style={{ width: '100%', padding: '0.875rem', background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem', transition: 'all 0.2s' }}
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
          width: 300, background: 'linear-gradient(135deg,rgba(15,23,42,0.97),rgba(30,41,59,0.97))',
          border: '1px solid rgba(239,68,68,0.3)', borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)', overflow: 'hidden'
        }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.9rem' }}>Lobby ({waitingUsers.length})</span>
            </div>
            <button onClick={() => setShowLobby(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
          </div>
          <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 300, overflowY: 'auto' }}>
            {waitingUsers.map(w => (
              <div key={w.userId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Avatar name={w.name} size={34} color="#4b5563" />
                <span style={{ flex: 1, color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                <button onClick={() => handleAdmit(w.userId)} title="Admit" style={{ width: 30, height: 30, borderRadius: '8px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCheck size={15} />
                </button>
                <button onClick={() => handleReject(w.userId)} title="Reject" style={{ width: 30, height: 30, borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserX size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === HEADER === */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', background: 'rgba(15,23,42,0.9)', borderBottom: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
            <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.95rem' }}>BhashaBridge</span>
          </div>
          <div style={{ height: 20, width: 1, background: 'rgba(255,255,255,0.1)' }} />
          <code style={{ color: '#60a5fa', fontSize: '0.82rem', background: 'rgba(96,165,250,0.08)', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(96,165,250,0.15)' }}>
            {meetingId}
          </code>
          {participantRole && (
            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '999px', textTransform: 'uppercase', background: participantRole === 'HOST' ? 'rgba(245,158,11,0.15)' : participantRole === 'COHOST' ? 'rgba(167,139,250,0.15)' : 'rgba(96,165,250,0.1)', color: participantRole === 'HOST' ? '#fbbf24' : participantRole === 'COHOST' ? '#a78bfa' : '#60a5fa', border: `1px solid ${participantRole === 'HOST' ? 'rgba(245,158,11,0.3)' : participantRole === 'COHOST' ? 'rgba(167,139,250,0.3)' : 'rgba(96,165,250,0.2)'}` }}>
              {participantRole}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {isHostOrCoHost && waitingUsers.length > 0 && (
            <button
              onClick={() => setShowLobby(l => !l)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: showLobby ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '0.45rem 0.9rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
              Lobby ({waitingUsers.length})
            </button>
          )}
          <button onClick={() => setShowSettings(true)} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', padding: '0.45rem 0.9rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 600 }}>
            <Settings size={15} /> Settings
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {/* === VIDEO AREA === */}
        <div className={styles.videoSection}>
          <div className={styles.videoGrid}>
            {/* Self tile */}
            <div className={styles.videoTile}>
              <video muted ref={userVideo} autoPlay playsInline className={styles.video} />
              {!isVideoOn && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0c1527' }}>
                  <Avatar name={user.name} size={60} color="#3b82f6" />
                </div>
              )}
              <div className={styles.tileOverlay}>
                <span className={styles.tileName}>{user.name} (You)</span>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {!isAudioOn && <span style={{ fontSize: '0.65rem', background: 'rgba(239,68,68,0.8)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>Muted</span>}
                  {!isVideoOn && <span style={{ fontSize: '0.65rem', background: 'rgba(239,68,68,0.8)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>No Video</span>}
                </div>
              </div>
            </div>
            {peers.map((peer, i) => (
              <VideoPeer key={i} peer={peer.peer} name={peer.name || `Participant ${i + 1}`} />
            ))}
          </div>

          {/* Caption overlay */}
          {currentCaption && (
            <div className={styles.captionsOverlay}>
              <div className={styles.captionText}>{currentCaption}</div>
            </div>
          )}

          {/* Controls bar */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem', gap: '0.75rem' }}>
            <button
              onClick={toggleAudio}
              title={isAudioOn ? 'Mute' : 'Unmute'}
              style={{ width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', background: isAudioOn ? 'rgba(255,255,255,0.12)' : '#ef4444', color: 'white' }}
            >
              {isAudioOn ? <Mic size={21} /> : <MicOff size={21} />}
            </button>
            <button
              onClick={toggleVideo}
              title={isVideoOn ? 'Turn off camera' : 'Turn on camera'}
              style={{ width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', background: isVideoOn ? 'rgba(255,255,255,0.12)' : '#ef4444', color: 'white' }}
            >
              {isVideoOn ? <Video size={21} /> : <VideoOff size={21} />}
            </button>
            <button
              onClick={() => setSidebarTab(t => t === 'CHAT' ? 'MEMBERS' : 'CHAT')}
              title="Chat / Members"
              style={{ width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.12)', color: 'white' }}
            >
              <MessageSquare size={21} />
            </button>
            <button
              onClick={leaveMeeting}
              title="Leave meeting"
              style={{ width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ef4444', color: 'white', boxShadow: '0 0 20px rgba(239,68,68,0.4)' }}
            >
              <PhoneOff size={21} />
            </button>
          </div>
        </div>

        {/* === SIDEBAR === */}
        <aside className={styles.chatSection}>
          {/* Sidebar tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {['CHAT', 'MEMBERS'].map(tab => (
              <button key={tab} onClick={() => setSidebarTab(tab)} style={{ flex: 1, padding: '0.9rem 0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: sidebarTab === tab ? '#60a5fa' : '#6b7280', fontWeight: sidebarTab === tab ? 700 : 400, borderBottom: sidebarTab === tab ? '2px solid #60a5fa' : '2px solid transparent', fontSize: '0.88rem', transition: 'all 0.15s', position: 'relative' }}>
                {tab === 'CHAT' ? <><MessageSquare size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Chat</>
                  : <><Users size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Members ({peers.length + 1}){waitingUsers.length > 0 && isHostOrCoHost && <span style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />}</>}
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
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px' }}>
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
                    Waiting Room ({waitingUsers.length})
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {waitingUsers.map(w => (
                      <div key={w.userId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px' }}>
                        <Avatar name={w.name} size={32} color="#374151" />
                        <span style={{ flex: 1, color: '#e2e8f0', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                        <button onClick={() => handleAdmit(w.userId)} style={{ width: 28, height: 28, borderRadius: '6px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <Avatar name={peer.name || `P${i + 1}`} size={34} color="#374151" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, color: '#e2e8f0', fontSize: '0.88rem' }}>{peer.name || `Participant ${i + 1}`}</div>
                      <div style={{ fontSize: '0.72rem', color: peer.role === 'HOST' ? '#fbbf24' : peer.role === 'COHOST' ? '#a78bfa' : '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{peer.role || 'Connected'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </main>

      {/* === SETTINGS MODAL === */}
      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.98))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '2rem', width: 420, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
              <h2 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Settings size={18} color="#60a5fa" /> Settings
              </h2>
              <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.82rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Globe size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} />My spoken language (mic)
                </label>
                <select value={spokenLanguage} onChange={e => setSpokenLanguage(e.target.value)} style={{ width: '100%', padding: '0.65rem 0.9rem', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', fontSize: '0.9rem' }}>
                  {LANG_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.82rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Translate subtitles &amp; audio to
                </label>
                <select value={user.language} onChange={e => { useAuthStore.getState().user.language = e.target.value; setShowSettings(false); }} style={{ width: '100%', padding: '0.65rem 0.9rem', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', fontSize: '0.9rem' }}>
                  {LANG_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, color: '#f1f5f9', fontSize: '0.88rem' }}>Text-to-Speech</p>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '0.78rem' }}>Read translations out loud</p>
                </div>
                <label style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer' }}>
                  <input type="checkbox" checked={isTtsEnabled} onChange={e => { setIsTtsEnabled(e.target.checked); ttsEnabledRef.current = e.target.checked; }} style={{ display: 'none' }} />
                  <div style={{ width: 44, height: 24, borderRadius: '999px', background: isTtsEnabled ? '#3b82f6' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 2, left: isTtsEnabled ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                  </div>
                </label>
              </div>
            </div>

            <button onClick={() => setShowSettings(false)} style={{ width: '100%', marginTop: '1.5rem', padding: '0.875rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* === ALERT MODAL === */}
      {alertMessage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'linear-gradient(135deg,rgba(30,41,59,0.98),rgba(15,23,42,0.98))', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', maxWidth: 380, width: '90%', textAlign: 'center' }}>
            <p style={{ margin: '0 0 1.5rem', color: '#cbd5e1', lineHeight: 1.6 }}>{alertMessage}</p>
            <button onClick={() => setAlertMessage(null)} style={{ width: '100%', padding: '0.875rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
