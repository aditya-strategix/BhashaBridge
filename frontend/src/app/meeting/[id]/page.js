'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Send,
  Users, Settings, Shield, UserCheck, UserX,
  MessageSquare, Globe, ChevronRight, VolumeX, MoreVertical, Star, Trash2, X,
  Copy, Check, Clock, AlertCircle, FileText, ArrowLeft, RefreshCw,
  Monitor, MonitorOff, Subtitles, Sparkles, Radio, Activity, Volume2, Lock
} from 'lucide-react';
import useAuthStore from '../../../stores/authStore';
import SFUClient from '../../../services/sfuClient';
import { getApiBaseUrl, getSocketBaseUrl } from '../../../services/urls';
import EditorialLoader from '../../../components/EditorialLoader';
import styles from './meeting.module.css';
import './theme.css';

const getSocketUrl = () => getSocketBaseUrl();
const getApiUrl = () => getApiBaseUrl();

const SOCKET_URL = getSocketUrl();
const API_URL = getApiUrl();

// PipeWire/WirePlumber sometimes exposes a Bluetooth *output monitor* as the
// default "microphone". Capturing it records speaker/TTS audio instead of the
// user's voice (the classic "you you you" feedback loop). Detect and avoid it.
const isMonitorAudioTrack = (track) => /monitor|loopback|output/i.test(track?.label || '');

async function acquireNonMonitorMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('getUserMedia is not supported in this browser');
  }

  const first = await navigator.mediaDevices.getUserMedia({ audio: true });
  const firstTrack = first.getAudioTracks?.()[0];
  if (!firstTrack || !isMonitorAudioTrack(firstTrack)) {
    return first;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const candidates = devices.filter(
      (device) => device.kind === 'audioinput'
        && device.deviceId
        && !isMonitorAudioTrack({ label: device.label })
    );
    for (const device of candidates) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: device.deviceId } }
        });
        first.getTracks().forEach((track) => { try { track.stop(); } catch (_) {} });
        console.log('[Mic] Switched away from monitor to:', device.label || device.deviceId);
        return stream;
      } catch (_) {}
    }
  } catch (_) {}

  console.warn('[Mic] Default input looks like a monitor and no alternative was found:', firstTrack.label);
  return first;
}

function downsampleTo16k(samples, inputSampleRate) {
  if (!inputSampleRate || inputSampleRate === 16000) return samples;
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(samples.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < samples.length; i++) {
      accum += samples[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function encodeWav(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Uint8Array(buffer);
}

const BCP47_LANG_MAP = {
  en: 'en-US',
  hi: 'hi-IN',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  zh: 'zh-CN',
  ta: 'ta-IN',
  te: 'te-IN',
  bn: 'bn-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  pa: 'pa-IN',
  ur: 'ur-PK',
};

const LANG_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'bn', label: 'Bengali' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
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
const VideoPeer = ({ peer, stream, name, role, isAudioOn = true, isVideoOn = true, isScreenSharing = false, avatarUrl, suppressAudio = false }) => {
  const ref = useRef();
  const suppressAudioRef = useRef(Boolean(suppressAudio));
  const showVideo = isVideoOn || isScreenSharing;

  useEffect(() => {
    suppressAudioRef.current = Boolean(suppressAudio);
    if (ref.current) {
      ref.current.muted = Boolean(suppressAudio);
      ref.current.volume = suppressAudio ? 0 : 1;
    }
  }, [suppressAudio]);

  useEffect(() => {
    const handleStream = nextStream => {
      if (!nextStream) return;
      if (ref.current) {
        ref.current.muted = suppressAudioRef.current;
        ref.current.volume = suppressAudioRef.current ? 0 : 1;
        if (ref.current.srcObject !== nextStream) {
          ref.current.srcObject = nextStream;
        }
        ref.current.play().catch(() => {});
      }
    };
    const handleTrack = (_track, nextStream) => {
      handleStream(nextStream);
    };

    // SFU consumers supply a MediaStream directly; P2P mesh uses simple-peer.
    const directStream = stream || (peer && peer._remoteStreams && peer._remoteStreams[0]);
    if (directStream) {
      handleStream(directStream);
    }
    if (peer) {
      peer.on('stream', handleStream);
      peer.on('track', handleTrack);
    }
    return () => {
      if (peer) {
        try { peer.off('stream', handleStream); } catch (_) {}
        try { peer.off('track', handleTrack); } catch (_) {}
      }
    };
  }, [peer, stream]);

  useEffect(() => {
    if (showVideo && ref.current && ref.current.srcObject) {
      ref.current.play().catch(() => {});
    }
  }, [showVideo]);

  return (
    <div className={`${styles.videoTile} ${isAudioOn ? styles.videoTileActiveSpeaker : ''}`}>
      <video
        playsInline
        autoPlay
        muted={Boolean(suppressAudio)}
        ref={ref}
        className={styles.videoElement}
        style={{
          display: showVideo ? 'block' : 'none',
          objectFit: isScreenSharing ? 'contain' : 'cover',
          backgroundColor: isScreenSharing ? '#000' : 'transparent'
        }}
        onLoadedMetadata={() => {
          if (ref.current) {
            ref.current.muted = Boolean(suppressAudio);
            ref.current.volume = suppressAudio ? 0 : 1;
            ref.current.play().catch(() => {});
          }
        }}
      />
      {!showVideo && (
        <div className={styles.avatarPlaceholder}>
          <div className={styles.avatarPulseRing}>
            {isAudioOn && <div className={styles.speakingWaves} />}
            <Avatar name={name ? name.split(' (')[0] : 'P'} size={68} color="#0022FF" avatarUrl={avatarUrl} />
          </div>
          <span className={styles.avatarNameLabel}>{name || 'Participant'}</span>
        </div>
      )}
      <div className={styles.tileOverlay}>
        <div className={styles.tileIdentity}>
          <span className={styles.tileNamePill}>
            {isScreenSharing && <Monitor size={12} color="#10B981" />}
            {name || 'Participant'}
          </span>
          {role && role !== 'PARTICIPANT' && (
            <span className={`${styles.tileRoleTag} ${role === 'HOST' ? styles.roleHost : styles.roleCoHost}`}>
              {role}
            </span>
          )}
        </div>
        <div className={styles.tileStatusIcons}>
          <div className={`${styles.statusIconPill} ${isAudioOn ? styles.iconActive : styles.iconMuted}`}>
            {isAudioOn ? <Mic size={14} /> : <MicOff size={14} />}
          </div>
          <div className={`${styles.statusIconPill} ${showVideo ? styles.iconActive : styles.iconMuted}`}>
            {showVideo ? <Video size={14} /> : <VideoOff size={14} />}
          </div>
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
  // Spoken language during a meeting is strictly locked to the user's profile language.
  const spokenLanguage = user?.preferredLanguage || user?.language || 'en';
  const [peers, setPeers] = useState([]);
  const [stream, setStream] = useState(null);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [currentCaption, setCurrentCaption] = useState(null);
  const [isDemoActive, setIsDemoActive] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const micVolumeRef = useRef(0);
  const [isSpeakingLive, setIsSpeakingLive] = useState(false);
  const [speechStatusText, setSpeechStatusText] = useState('');
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
  const [endedByInfo, setEndedByInfo] = useState(null);
  const [showLobby, setShowLobby] = useState(false);
  const [summaryModal, setSummaryModal] = useState({ isOpen: false, text: '', loading: false });
  const [lobbyToast, setLobbyToast] = useState(null); // { name }
  const lobbyToastTimer = useRef(null);

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef(null);
  const [showCaptions, setShowCaptions] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const meetingStartTimeRef = useRef(null);
  const [micVolume, setMicVolume] = useState(0);
  const activeMicVolume = (stream && isAudioOn) ? micVolume : 0;
  const membersToggleBtnRef = useRef(null);

  useEffect(() => {
    if (participantStatus !== 'ADMITTED' || meetingEnded) return;

    const tick = () => {
      if (!meetingStartTimeRef.current) {
        meetingStartTimeRef.current = Date.now();
      }
      const diff = Math.max(0, Math.floor((Date.now() - meetingStartTimeRef.current) / 1000));
      setElapsedSeconds(diff);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [participantStatus, meetingEnded]);

  const formatTimer = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!stream || !isAudioOn) {
      micVolumeRef.current = 0;
      return;
    }
    let audioContext;
    let animId;
    let removeGesture = null;

    const audioTrack = stream.getAudioTracks?.()[0];
    console.log('[Mic Meter] track:', audioTrack ? {
      readyState: audioTrack.readyState,
      enabled: audioTrack.enabled,
      muted: audioTrack.muted,
      label: audioTrack.label
    } : 'none');

    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.fftSize);

      const resume = () => {
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume().catch(() => {});
        }
      };
      resume();
      window.addEventListener('pointerdown', resume, { passive: true });
      window.addEventListener('keydown', resume);
      removeGesture = () => {
        window.removeEventListener('pointerdown', resume);
        window.removeEventListener('keydown', resume);
      };

      const updateVolume = () => {
        analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const x = (dataArray[i] - 128) / 128;
          sumSquares += x * x;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        const vol = Math.min(100, Math.round(rms * 200));
        micVolumeRef.current = vol;
        setMicVolume(vol);
        animId = requestAnimationFrame(updateVolume);
      };
      updateVolume();
      setTimeout(() => {
        console.log('[Mic Meter] context:', audioContext?.state);
      }, 1200);
    } catch (err) {
      console.log('[Mic Meter] failed:', err?.message);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (removeGesture) removeGesture();
      if (audioContext) {
        try { audioContext.close(); } catch (_) {}
      }
    };
  }, [stream, isAudioOn]);

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
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const setTtsPlayingState = useCallback((active) => {
    isTtsPlayingRef.current = active;
    setIsTtsPlaying(active);
  }, []);
  const recentTtsMapRef = useRef(new Map());
  const captionTimerRef = useRef(null);
  const lastTtsPlaybackRef = useRef({ text: '', timestamp: 0 });
  const lastTtsAtRef = useRef(0);
  const pendingAudioPlaybackRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const demoTimerRef = useRef(null);
  const lastSpeechEmitRef = useRef({ text: '', timestamp: 0 });
  const myLastSpokenTextRef = useRef('');
  const myLastSpokenTimeRef = useRef(0);
  const isJoiningInProgressRef = useRef(false);
  const processedCaptionIdsRef = useRef(new Set());
  const activeSpeechRecRef = useRef(null);
  const availableVoicesRef = useRef([]);

  useEffect(() => {
    // Cache browser speechSynthesis voices as soon as they become ready
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        try {
          const v = window.speechSynthesis.getVoices();
          if (v && v.length > 0) {
            availableVoicesRef.current = v;
          }
        } catch (_) {}
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Audio unlock is installed after playTtsAudio is defined (see below) so a
  // blocked first playback can be retried on the next user gesture.

  const isDummyAudioText = (t) => {
    if (!t || !t.trim()) return true;
    const s = t.trim().toLowerCase();
    return s.startsWith('[') || s.includes('audio stream') || s.includes('stream chunk') || s.includes('875 bytes') || s.includes('ऑडियो स्ट्रीम');
  };

  const playTtsAudio = useCallback((cleanText, targetLangCode, bcpLang, options = {}) => {
    if (isDummyAudioText(cleanText)) return;

    // Global guard: never chain TTS clips faster than this. Prevents echo
    // feedback from turning into a rapid "you you you" loop.
    const startedAt = Date.now();
    if (!options.force && startedAt - lastTtsAtRef.current < 500) return;
    lastTtsAtRef.current = startedAt;

    // Safety watchdog: ensure isTtsPlayingRef never gets stuck
    if (typeof window !== 'undefined') {
      if (window._ttsPlayingTimeout) clearTimeout(window._ttsPlayingTimeout);
      window._ttsPlayingTimeout = setTimeout(() => {
        setTtsPlayingState(false);
      }, 12000);
    }

    // Remember what we are about to say so the microphone recognizer can
    // discard its own echo. Do NOT abort recognition here: that made the mic
    // deaf for several seconds after every TTS clip (including Test Audio).
    lastTtsPlaybackRef.current = { text: cleanText.toLowerCase(), timestamp: startedAt };

    const shortLang = (targetLangCode || 'en').toLowerCase().split('-')[0];
    let backendAttempted = false;
    let nativeAttempted = false;

    const stopActive = () => {
      if (typeof window === 'undefined') return;
      if (window._activeTtsAudio) {
        const active = window._activeTtsAudio;
        active.__bbStopped = true;
        try {
          active.pause();
          active.src = '';
        } catch (_) {}
        window._activeTtsAudio = null;
      }
    };

    const getVoices = () => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
      return (availableVoicesRef.current && availableVoicesRef.current.length > 0)
        ? availableVoicesRef.current
        : (window.speechSynthesis.getVoices() || []);
    };

    const findMatchingVoice = () => {
      const target = (targetLangCode || '').toLowerCase();
      const bcp = (bcpLang || '').toLowerCase();
      return getVoices().find(v => {
        const vLang = (v.lang || '').replace('_', '-').toLowerCase();
        return vLang === bcp
          || vLang === target
          || vLang.startsWith(target + '-')
          || vLang.startsWith(shortLang + '-');
      }) || null;
    };

    // Real on-device voice. `allowAnyVoice` is only used as a last resort after
    // the neural backend fails, so the user still hears actual speech instead
    // of a beep or silence (even if the accent is imperfect).
    // ---- Native SpeechSynthesis path ----
    const speakNative = (allowAnyVoice) => {
      if (nativeAttempted) return false;
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;

      const matchingVoice = findMatchingVoice();
      if (!matchingVoice && !allowAnyVoice) return false;

      const voices = getVoices();
      const voice = matchingVoice || voices[0] || null;
      nativeAttempted = true;
      setTtsPlayingState(true);

      try {
        stopActive();
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = matchingVoice ? (bcpLang || matchingVoice.lang) : (voice?.lang || bcpLang || 'en-US');
        if (voice) utterance.voice = voice;
        window._activeUtterance = utterance;

        let endedOrErrored = false;
        const speechStartTime = Date.now();

        utterance.onend = () => {
          endedOrErrored = true;
          window._activeUtterance = null;
          // A native voice that returns instantly without speaking means the
          // language is not really installed → use the neural engine instead.
          if (!allowAnyVoice && cleanText.length > 3 && (Date.now() - speechStartTime < 120) && !backendAttempted) {
            console.warn(`[Meeting TTS] Native synthesis skipped "${targetLangCode}" instantly. Falling back to backend.`);
            playViaBackend();
            return;
          }
          setTimeout(() => { setTtsPlayingState(false); }, 1500);
        };

        utterance.onerror = (e) => {
          endedOrErrored = true;
          window._activeUtterance = null;
          const errType = e?.error;
          // cancel()/new utterance intentionally interrupts the previous one.
          if (errType === 'interrupted' || errType === 'canceled') {
            setTtsPlayingState(false);
            return;
          }
          // Autoplay policy: no gesture yet on this tab. Ask for a tap and
          // retry the same caption once audio is unlocked.
          if (errType === 'not-allowed') {
            pendingAudioPlaybackRef.current = { text: cleanText, lang: targetLangCode, bcp: bcpLang };
            setAlertMessage('Tap anywhere once to enable translated audio.');
            setTtsPlayingState(false);
            return;
          }
          console.warn('[Meeting TTS] SpeechSynthesis error:', errType || e);
          if (!allowAnyVoice && !backendAttempted) {
            playViaBackend();
          } else {
            setTtsPlayingState(false);
          }
        };

        // Watchdog: if synthesis stalls without speaking, try the neural engine.
        setTimeout(() => {
          if (!endedOrErrored && !backendAttempted) {
            console.warn('[Meeting TTS] SpeechSynthesis watchdog fired, falling back to backend');
            try { window.speechSynthesis.cancel(); } catch (_) {}
            playViaBackend();
          }
        }, 700);

        window.speechSynthesis.speak(utterance);
        return true;
      } catch (e) {
        console.warn('[Meeting TTS] Native TTS exception:', e);
        nativeAttempted = false;
        setTtsPlayingState(false);
        return false;
      }
    };

    // ---- Neural backend path (Bhashini Indic-TTS) ----
    const playViaBackend = () => {
      if (backendAttempted) return;
      backendAttempted = true;
      setTtsPlayingState(true);
      let backendRetried = false;

      try {
        stopActive();
        if (window._activeUtterance) {
          try { window.speechSynthesis.cancel(); } catch (_) {}
          window._activeUtterance = null;
        }

        const backendUrl = getApiUrl();
        const url = `${backendUrl}/tts?text=${encodeURIComponent(cleanText)}&lang=${shortLang}`;
        const audio = new Audio(url);
        audio.preload = 'auto';
        // Do not set crossOrigin: plain media playback does not need CORS and
        // setting it turns a missing header into a hard load failure.
        window._activeTtsAudio = audio;

        audio.onended = () => {
          if (window._activeTtsAudio === audio) {
            window._activeTtsAudio = null;
          }
          setTimeout(() => { setTtsPlayingState(false); }, 1000);
        };
        audio.onerror = () => {
          if (audio.__bbStopped) return;
          // One retry covers transient network/engine hiccups (e.g. a 503 while
          // the TTS model is loading) before falling back to a native voice.
          if (!backendRetried) {
            backendRetried = true;
            try {
              audio.src = `${url}&retry=1`;
              audio.load();
              const p = audio.play();
              if (p && typeof p.catch === 'function') p.catch(() => {});
              return;
            } catch (_) {}
          }
          console.warn('[Meeting TTS] Backend audio error:', audio.error?.code);
          console.warn('[Meeting TTS] Neural TTS unavailable. Using an available real browser voice.');
          if (window._activeTtsAudio === audio) {
            window._activeTtsAudio = null;
          }
          if (!speakNative(true)) {
            setTimeout(() => { setTtsPlayingState(false); }, 200);
          }
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            if (window._activeTtsAudio === audio) {
              window._activeTtsAudio = null;
            }
            // Replacing/stopping a clip aborts play(); that's not a failure.
            if (audio.__bbStopped || e?.name === 'AbortError') {
              return;
            }
            // Autoplay policy: require one tap, then retry the same phrase.
            if (e?.name === 'NotAllowedError') {
              pendingAudioPlaybackRef.current = { text: cleanText, lang: targetLangCode, bcp: bcpLang };
              setAlertMessage('Tap anywhere once to enable translated audio.');
              setTtsPlayingState(false);
              return;
            }
            console.warn('[Meeting TTS] Backend audio play failed (autoplay or network):', e?.name, e?.message);
            if (!speakNative(true)) {
              setTtsPlayingState(false);
            }
          });
        }
      } catch (err) {
        console.warn('[Meeting TTS] playViaBackend exception:', err);
        if (!speakNative(true)) {
          setTtsPlayingState(false);
        }
      }
    };

    // Primary path: Use high-fidelity sovereign neural GPU TTS (Bhashini Indic-TTS on :5000/api/tts).
    // If neural backend encounters an error, playViaBackend automatically falls back to speakNative(true).
    playViaBackend();
  }, [setTtsPlayingState]);

  useEffect(() => {
    // Browsers gate audio behind a user gesture. Keep listening (not once) and
    // retry a playback that was blocked with NotAllowedError.
    const unlockAudio = () => {
      if (typeof window === 'undefined') return;
      if ('speechSynthesis' in window) {
        try {
          const u = new SpeechSynthesisUtterance(' ');
          u.volume = 0.01;
          window.speechSynthesis.speak(u);
        } catch (_) {}
      }
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') ctx.resume();
        }
      } catch (_) {}
      try {
        const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
        silentAudio.volume = 0.01;
        silentAudio.play().catch(() => {});
      } catch (_) {}

      audioUnlockedRef.current = true;
      setAudioUnlocked(true);
      if (typeof window !== 'undefined') window.__bbUnlockAudio = unlockAudio;
      const pending = pendingAudioPlaybackRef.current;
      if (pending) {
        pendingAudioPlaybackRef.current = null;
        setTimeout(() => {
          try { playTtsAudio(pending.text, pending.lang, pending.bcp, { force: true }); } catch (_) {}
        }, 80);
      }
    };

    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio);
    unlockAudio();
    return () => {
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [playTtsAudio]);

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
  const peerStatusMapRef = useRef(new Map());
  const sfuClientRef = useRef(null);
  const sfuActiveRef = useRef(false);
  const sfuStartingRef = useRef(false);

  const setPeerCachedStatus = (key, status) => {
    if (!key) return;
    const existing = peerStatusMapRef.current.get(key) || {};
    peerStatusMapRef.current.set(key, { ...existing, ...status });
  };

  const getPeerCachedStatus = (socketId, userId) => {
    return (socketId ? peerStatusMapRef.current.get(socketId) : null) ||
           (userId ? peerStatusMapRef.current.get(userId) : null) || null;
  };

  const socketInitialized = useRef(false);
  const roleRef = useRef(null);
  const hostIdRef = useRef(null);
  const [meetingHostId, setMeetingHostId] = useState(null);
  const audioRef = useRef(true);
  const videoRef = useRef(true);
  const streamRef = useRef(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef(null);
  const sidebarRef = useRef(null);
  const chatToggleBtnRef = useRef(null);

  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    const mediaStream = streamRef.current || stream;
    if (mediaStream) {
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = videoRef.current;
        if (sfuActiveRef.current && sfuClientRef.current) {
          const client = sfuClientRef.current;
          client.replaceVideoTrack(videoTrack)
            .then(() => client.setProducerPaused('video', !videoRef.current))
            .catch((err) => {
              console.warn('[SFU] Failed to restore camera track:', err.message);
            });
        } else {
          peersRef.current.forEach(({ peer }) => {
            try {
              const senders = peer._pc?.getSenders() || [];
              const sender = senders.find(s => s.track && s.track.kind === 'video') || senders.find(s => s.track?.kind === 'video');
              if (sender) {
                sender.replaceTrack(videoTrack);
              }
            } catch (e) {
              console.error('Error restoring video track:', e);
            }
          });
        }
      }
      if (userVideo.current) {
        userVideo.current.srcObject = mediaStream;
        userVideo.current.play().catch(() => {});
      }
    }
    setIsScreenSharing(false);
    if (socket) {
      socket.emit('meeting:status_update', {
        isAudioOn: audioRef.current,
        isVideoOn: videoRef.current,
        isScreenSharing: false
      });
    }
  }, [stream, socket]);

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setAlertMessage('Screen sharing is not supported on this browser or mobile device. Please use Google Chrome or Safari on HTTPS.');
      return;
    }

    try {
      // Mobile Safari / Android WebKit requires simple constraints ({ video: true } with NO audio constraint)
      let screenStream = null;
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      } catch (constraintErr) {
        // Fallback for browsers requiring empty constraints or basic invocation
        screenStream = await navigator.mediaDevices.getDisplayMedia();
      }

      if (!screenStream) return;
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) return;
      screenTrack.enabled = true;

      if (userVideo.current) {
        userVideo.current.srcObject = screenStream;
        userVideo.current.play().catch(() => {});
      }

      if (sfuActiveRef.current && sfuClientRef.current) {
        const client = sfuClientRef.current;
        client.replaceVideoTrack(screenTrack)
          .then(() => client.setProducerPaused('video', false))
          .catch((err) => {
            console.warn('[SFU] Failed to replace video with screen track:', err.message);
          });
      } else {
        peersRef.current.forEach(({ peer }) => {
          try {
            const senders = peer._pc?.getSenders() || [];
            const sender = senders.find(s => s.track && s.track.kind === 'video') || senders.find(s => s.track?.kind === 'video');
            if (sender) {
              sender.replaceTrack(screenTrack);
            }
          } catch (e) {
            console.error('Error replacing track for screen share:', e);
          }
        });
      }

      screenTrack.onended = () => {
        stopScreenShare();
      };

      setIsScreenSharing(true);
      if (socket) {
        socket.emit('meeting:status_update', {
          isAudioOn: audioRef.current,
          isVideoOn: true,
          isScreenSharing: true
        });
      }
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        // User cancelled the prompt - harmless
        return;
      }
      console.error('Failed to get display media:', err);
      setAlertMessage('Could not share screen: ' + (err.message || 'Permission denied or unsupported by this device.'));
    }
  };
  
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
      if (membersToggleBtnRef.current && membersToggleBtnRef.current.contains(event.target)) {
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
  useEffect(() => {
    audioRef.current = isAudioOn;
    const s = streamRef.current || stream;
    if (s) {
      s.getAudioTracks().forEach(t => { t.enabled = isAudioOn; });
    }
  }, [isAudioOn, stream]);

  useEffect(() => {
    videoRef.current = isVideoOn;
    const s = streamRef.current || stream;
    if (s) {
      s.getVideoTracks().forEach(t => { t.enabled = isVideoOn; });
    }
  }, [isVideoOn, stream]);
  useEffect(() => { streamRef.current = stream; }, [stream]);

  const handleUserVideoRef = useCallback((el) => {
    userVideo.current = el;
    const activeStream = screenStreamRef.current || streamRef.current || stream;
    if (el && activeStream) {
      if (el.srcObject !== activeStream) {
        el.srcObject = activeStream;
      }
      el.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    const activeStream = screenStreamRef.current || streamRef.current || stream;
    if (userVideo.current && activeStream) {
      if (userVideo.current.srcObject !== activeStream) {
        userVideo.current.srcObject = activeStream;
      }
      userVideo.current.play().catch(() => {});
    }
  }, [stream, participantStatus, isVideoOn, isScreenSharing]);

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
        currentSocket.emit('audio:signal', {
          targetSocketId: userToSignal,
          callerId: callerID,
          signal,
          name: userName,
          role: userRole,
          userId: user.id,
          avatar: user.avatar,
          isAudioOn: audioRef.current,
          isVideoOn: videoRef.current,
          isScreenSharing: screenStreamRef.current ? true : false
        });
      }
    });
    peer.on('connect', () => {
      if (currentSocket) {
        currentSocket.emit('meeting:status_update', {
          isAudioOn: audioRef.current,
          isVideoOn: videoRef.current,
          isScreenSharing: screenStreamRef.current ? true : false
        });
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
        currentSocket.emit('audio:signal', {
          signal,
          targetSocketId: callerID,
          callerId: currentSocket.id,
          name: userName,
          role: userRole,
          userId: user.id,
          avatar: user.avatar,
          isAudioOn: audioRef.current,
          isVideoOn: videoRef.current,
          isScreenSharing: screenStreamRef.current ? true : false
        });
      }
    });
    peer.on('connect', () => {
      if (currentSocket) {
        currentSocket.emit('meeting:status_update', {
          isAudioOn: audioRef.current,
          isVideoOn: videoRef.current,
          isScreenSharing: screenStreamRef.current ? true : false
        });
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

  // ---------------------------------------------------------------------------
  // SFU media plane (primary transport). Falls back to the P2P mesh below when
  // the SFU microservice is unavailable or running the Virtual engine.
  // ---------------------------------------------------------------------------
  const upsertSfuPeer = useCallback((info) => {
    if (!info) return;
    const currentUserId = useAuthStore.getState().user?.id;
    if (info.userId && currentUserId && String(info.userId) === String(currentUserId)) return;

    const idx = peersRef.current.findIndex(
      (p) => (info.userId && p.userId === info.userId) ||
             (info.peerId && (p.peerID === info.peerId || p.sfuPeerId === info.peerId))
    );
    const hId = hostIdRef.current;
    const cleanRole = info.role
      ? ((hId && info.userId !== hId && info.role === 'HOST') ? 'COHOST' : info.role)
      : undefined;
    const cachedStatus = getPeerCachedStatus(info.socketId || info.peerId, info.userId);

    if (idx !== -1) {
      const existing = peersRef.current[idx];
      peersRef.current[idx] = {
        ...existing,
        peerID: info.peerId || existing.peerID,
        sfuPeerId: info.peerId || existing.sfuPeerId,
        socketId: info.socketId || existing.socketId,
        userId: info.userId || existing.userId,
        name: info.name || existing.name,
        role: cleanRole || existing.role,
        avatar: info.avatar || existing.avatar,
        language: info.language || existing.language,
        stream: info.stream || existing.stream,
        isAudioOn: info.isAudioOn !== undefined ? info.isAudioOn : existing.isAudioOn,
        isVideoOn: info.isVideoOn !== undefined ? info.isVideoOn : existing.isVideoOn,
        isScreenSharing: info.isScreenSharing !== undefined ? info.isScreenSharing : existing.isScreenSharing,
        sfu: true
      };
    } else {
      peersRef.current.push({
        peerID: info.peerId || info.userId,
        sfuPeerId: info.peerId || null,
        socketId: info.socketId || null,
        userId: info.userId || null,
        name: info.name || 'Participant',
        role: cleanRole || 'PARTICIPANT',
        avatar: info.avatar || null,
        language: info.language || null,
        stream: info.stream || null,
        isAudioOn: info.isAudioOn !== undefined ? info.isAudioOn : (cachedStatus?.isAudioOn ?? true),
        isVideoOn: info.isVideoOn !== undefined ? info.isVideoOn : (cachedStatus?.isVideoOn ?? true),
        isScreenSharing: info.isScreenSharing !== undefined ? info.isScreenSharing : (cachedStatus?.isScreenSharing ?? false),
        sfu: true
      });
    }
    setPeers([...peersRef.current]);
  }, []);

  const removeSfuPeer = useCallback(({ peerId, userId } = {}) => {
    if (!peerId && !userId) return;
    peersRef.current = peersRef.current.filter(
      (p) => !((userId && p.userId === userId) ||
               (peerId && (p.peerID === peerId || p.sfuPeerId === peerId || p.socketId === peerId)))
    );
    setPeers([...peersRef.current]);
  }, []);

  const startSfu = useCallback(async (mediaStream) => {
    if (sfuActiveRef.current || sfuStartingRef.current || sfuClientRef.current) {
      return sfuActiveRef.current;
    }

    const currentUser = useAuthStore.getState().user;
    if (!currentUser || !mediaStream) return false;

    sfuStartingRef.current = true;
    const client = new SFUClient({
      meetingId,
      user: {
        userId: currentUser.id,
        name: currentUser.name,
        avatar: currentUser.avatar,
        language: currentUser.language
      },
      role: roleRef.current,
      onPeer: upsertSfuPeer,
      onPeerLeft: removeSfuPeer,
      onCaption: (payload) => {
        if (payload?.captionEvent && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bhashabridge:sfu-caption', { detail: payload.captionEvent }));
        }
      },
      onError: (err) => console.warn('[Meeting] SFU warning:', err.message)
    });

    try {
      await client.init();
      await client.produce(mediaStream);
      sfuClientRef.current = client;
      sfuActiveRef.current = true;

      // Retire any P2P mesh peers created before the SFU became active. The
      // participant metadata entries are kept so muted participants still show.
      peersRef.current.forEach((p) => {
        if (p.peer) {
          try { p.peer.destroy(); } catch (_) {}
          p.peer = null;
        }
      });
      setPeers([...peersRef.current]);

      console.log('[Meeting] SFU media plane active (O(1) uplink)');
      return true;
    } catch (err) {
      console.warn('[Meeting] SFU unavailable, continuing with P2P mesh:', err.message);
      try { await client.close(); } catch (_) {}
      sfuClientRef.current = null;
      sfuActiveRef.current = false;
      return false;
    } finally {
      sfuStartingRef.current = false;
    }
  }, [meetingId, upsertSfuPeer, removeSfuPeer]);

  useEffect(() => {
    const handleSfuCaption = (event) => {
      const caption = event.detail;
      if (!caption) return;
      const rawText = (caption.transcriptText || '').trim();
      if (isDummyAudioText(rawText)) {
        return;
      }
      const u = useAuthStore.getState().user || {};
      const captionEnabled = u.captionEnabled ?? true;
      const captionLang = u.captionLang || 'original';
      if (captionEnabled && rawText) {
        setCurrentCaption({
          text: rawText,
          speaker: caption.speakerId || 'Speaker',
          sourceLang: caption.sourceLanguage || 'auto',
          targetLang: captionLang === 'original' ? (caption.sourceLanguage || 'en') : captionLang,
        });
        if (captionTimerRef.current) clearTimeout(captionTimerRef.current);
        captionTimerRef.current = setTimeout(() => setCurrentCaption(null), 5000);
      }
      if (socketRef.current && caption.speakerId && String(caption.speakerId) === String(u.id) && rawText) {
        socketRef.current.emit('caption:text', {
          meetingId,
          speakerId: u.id,
          text: rawText,
          language: caption.sourceLanguage || u.language || 'en'
        });
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('bhashabridge:sfu-caption', handleSfuCaption);
      return () => window.removeEventListener('bhashabridge:sfu-caption', handleSfuCaption);
    }
  }, []);

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
            let endedDesc = 'This meeting has already concluded and is no longer active. You can view the meeting summary & report or return to your dashboard.';
            if (errData.endedBy) {
              setEndedByInfo(errData.endedBy);
              const rLabel = errData.endedBy.role === 'COHOST' ? 'Co-host' : 'Host';
              const nLabel = errData.endedBy.name ? ` ${errData.endedBy.name}` : '';
              endedDesc = `${rLabel}${nLabel} has ended this meeting for everyone.`;
            }
            description = endedDesc;
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
        if (data.meeting) {
          if (data.meeting.hostId) {
            hostIdRef.current = data.meeting.hostId;
            setMeetingHostId(data.meeting.hostId);
          }
          const rawStart = data.meeting.startTime || data.meeting.createdAt;
          if (rawStart) {
            const parsedTime = new Date(rawStart).getTime();
            if (!isNaN(parsedTime) && parsedTime <= Date.now()) {
              meetingStartTimeRef.current = parsedTime;
            } else {
              meetingStartTimeRef.current = Date.now();
            }
          } else {
            meetingStartTimeRef.current = Date.now();
          }
        }
        setParticipantStatus(data.participantStatus);
        statusRef.current = data.participantStatus;
        const myInitialRole = (data.meeting?.hostId && user.id !== data.meeting.hostId && data.participantRole === 'HOST') ? 'COHOST' : data.participantRole;
        setParticipantRole(myInitialRole);
        roleRef.current = myInitialRole;
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
            videoRef.current = false;
          } catch {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            currentStream = ctx.createMediaStreamDestination().stream;
            setIsVideoOn(false);
            setIsAudioOn(false);
            videoRef.current = false;
            audioRef.current = false;
            setAlertMessage('Microphone unavailable. Please allow microphone access and refresh the page.');
          }
        }
        currentStream.getAudioTracks().forEach(t => { t.enabled = audioRef.current; });
        currentStream.getVideoTracks().forEach(t => { t.enabled = videoRef.current; });

        // If the browser defaulted to a PipeWire output monitor, replace it
        // with a real microphone (otherwise we record our own TTS output).
        try {
          const defaultAudio = currentStream.getAudioTracks()[0];
          if (defaultAudio && isMonitorAudioTrack(defaultAudio)) {
            const micStream = await acquireNonMonitorMicrophone();
            const micTrack = micStream.getAudioTracks()[0];
            if (micTrack) {
              currentStream.getAudioTracks().forEach((t) => {
                try { t.stop(); } catch (_) {}
                currentStream.removeTrack(t);
              });
              micTrack.enabled = audioRef.current;
              currentStream.addTrack(micTrack);
              console.log('[Mic] Replaced monitor with real microphone:', micTrack.label);
            }
          }
        } catch (micErr) {
          console.warn('[Mic] Monitor replacement failed:', micErr.message);
        }

        setStream(currentStream);
        streamRef.current = currentStream;
        if (userVideo.current) userVideo.current.srcObject = currentStream;

        if (isCancelled) {
          if (currentStream) currentStream.getTracks().forEach(t => t.stop());
          return;
        }

        // Attempt the SFU media plane before joining the signaling room. If it
        // is unavailable we keep the existing P2P mesh path below untouched.
        const isAdmittedNow = data.participantStatus === 'ADMITTED' ||
          (data.meeting?.hostId && user.id === data.meeting.hostId);
        if (isAdmittedNow) {
          await startSfu(currentStream);
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
          transports: ['websocket', 'polling'],
          auth: { token: localStorage.getItem('token') }
        });
        let hasConnectedOnce = false;
        newSocket.on('connect', () => {
          if (!hasConnectedOnce) {
            hasConnectedOnce = true;
            return;
          }
          // Rejoin the meeting room after a network blip / backend restart;
          // Socket.IO reconnects the transport but not the server-side rooms.
          const latestUser = useAuthStore.getState().user || user;
          newSocket.emit('meeting:join', {
            meetingId,
            userId: user.id,
            peerId: newSocket.id,
            language: latestUser.preferredLanguage || latestUser.language,
            captionLang: latestUser.captionLang,
            ttsLang: latestUser.ttsLang,
            captionEnabled: latestUser.captionEnabled,
            ttsEnabled: latestUser.ttsEnabled,
            isAudioOn: audioRef.current,
            isVideoOn: videoRef.current
          });
          newSocket.emit('meeting:status_update', { isAudioOn: audioRef.current, isVideoOn: videoRef.current });
          newSocket.emit('user:update_settings', latestUser);
        });
        socketRef.current = newSocket;
        setSocket(newSocket);
        const initUser = useAuthStore.getState().user || user;
        newSocket.emit('meeting:join', {
          meetingId,
          userId: user.id,
          peerId: newSocket.id,
          language: initUser.preferredLanguage || initUser.language,
          captionLang: initUser.captionLang,
          ttsLang: initUser.ttsLang,
          captionEnabled: initUser.captionEnabled,
          ttsEnabled: initUser.ttsEnabled,
          isAudioOn: audioRef.current,
          isVideoOn: videoRef.current
        });
        newSocket.emit('meeting:status_update', { isAudioOn: audioRef.current, isVideoOn: videoRef.current });
        newSocket.emit('user:update_settings', initUser);
        newSocket.on('meeting:joined', () => {
          newSocket.emit('user:update_settings', useAuthStore.getState().user || {});
        });

                  
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
              if (screenStreamRef.current) {
                try { screenStreamRef.current.getTracks().forEach(t => t.stop()); } catch (_) {}
                screenStreamRef.current = null;
              }
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
              if (sfuClientRef.current) {
                try { sfuClientRef.current.removePeer({ userId }); } catch (_) {}
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

                // If current user is no longer admitted, redirect to dashboard.
                // Never do this while we are still in the WAITING lobby: waiting
                // users are intentionally absent from the admitted roster.
                const myData = data.find(p => p.userId === currentUserId);
                if (currentUserId && !myData && roleRef.current !== 'HOST' && statusRef.current === 'ADMITTED') {
                  if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
                  peersRef.current.forEach(p => { if (p.peer) { try { p.peer.destroy(); } catch (e) {} } });
                  peersRef.current = [];
                  setPeers([]);
                  router.push('/dashboard');
                  return;
                }
                if (myData) {
                  const hId = hostIdRef.current;
                  const myCleanRole = (hId && currentUserId !== hId && myData.role === 'HOST') ? 'COHOST' : myData.role;
                  setParticipantRole(myCleanRole);
                  roleRef.current = myCleanRole;
                }

                // Remove peers not in admitted DB list
                peersRef.current.forEach(p => {
                  if (p.userId && !admittedUserIds.has(p.userId)) {
                    if (p.peer) { try { p.peer.destroy(); } catch (e) {} }
                  }
                });
                peersRef.current = peersRef.current.filter(p => !p.userId || admittedUserIds.has(p.userId));

                // Update remaining peers with latest roles
                const hId = hostIdRef.current;
                data.forEach(dbPeer => {
                  const idx = peersRef.current.findIndex(p => p.userId === dbPeer.userId);
                  if (idx !== -1) {
                    const cleanRole = (hId && dbPeer.userId !== hId && dbPeer.role === 'HOST') ? 'COHOST' : dbPeer.role;
                    peersRef.current[idx] = { ...peersRef.current[idx], role: cleanRole, name: dbPeer.name, avatar: dbPeer.avatar };
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
              const admittedUser = useAuthStore.getState().user || user;
              newSocket.emit('meeting:join', {
                meetingId,
                userId: user.id,
                peerId: newSocket.id,
                language: admittedUser.preferredLanguage || admittedUser.language,
                captionLang: admittedUser.captionLang,
                ttsLang: admittedUser.ttsLang,
                captionEnabled: admittedUser.captionEnabled,
                ttsEnabled: admittedUser.ttsEnabled,
                isAudioOn: audioRef.current,
                isVideoOn: videoRef.current
              });
              newSocket.emit('meeting:status_update', { isAudioOn: audioRef.current, isVideoOn: videoRef.current });
              newSocket.emit('user:update_settings', admittedUser);
              startSfu(streamRef.current || currentStream).catch(() => {});
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
        newSocket.on('meeting:ended', (payload) => {
          if (payload?.endedBy) {
            setEndedByInfo(payload.endedBy);
          }
          setMeetingEnded(true);
          if (sfuClientRef.current) {
            try { sfuClientRef.current.close(); } catch (_) {}
            sfuClientRef.current = null;
            sfuActiveRef.current = false;
          }
          if (streamRef.current) {
            try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (_) {}
          }
          if (screenStreamRef.current) {
            try { screenStreamRef.current.getTracks().forEach(t => t.stop()); } catch (_) {}
            screenStreamRef.current = null;
          }
        });
        newSocket.on('participant:joined', ({ userId, socketId, name, role, avatar, language, isAudioOn, isVideoOn }) => {
          if (!userId || userId === user.id) return;
          newSocket.emit('meeting:status_update', { isAudioOn: audioRef.current, isVideoOn: videoRef.current });

          if (isAudioOn !== undefined || isVideoOn !== undefined) {
            if (socketId) setPeerCachedStatus(socketId, { isAudioOn, isVideoOn });
            if (userId) setPeerCachedStatus(userId, { isAudioOn, isVideoOn });
          }

          if (sfuActiveRef.current) {
            upsertSfuPeer({
              userId,
              peerId: socketId,
              socketId,
              name,
              role,
              avatar,
              language,
              isAudioOn,
              isVideoOn
            });
            return;
          }

          // Destroy any existing peer instance for this user or socket
          const existingIdx = peersRef.current.findIndex(p => (userId && p.userId === userId) || (socketId && p.peerID === socketId));
          if (existingIdx !== -1) {
            try { peersRef.current[existingIdx].peer?.destroy(); } catch (_) {}
            peersRef.current.splice(existingIdx, 1);
          }

          const cached = getPeerCachedStatus(socketId, userId);
          const initialAudio = isAudioOn !== undefined ? isAudioOn : (cached?.isAudioOn !== undefined ? cached.isAudioOn : true);
          const initialVideo = isVideoOn !== undefined ? isVideoOn : (cached?.isVideoOn !== undefined ? cached.isVideoOn : true);

          const hId = hostIdRef.current;
          const cleanRole = (hId && userId !== hId && role === 'HOST') ? 'COHOST' : role;
          const peer = createPeer(socketId, newSocket.id, streamRef.current || currentStream, newSocket, user.name, roleRef.current);
          peersRef.current.push({
            peerID: socketId,
            userId,
            peer,
            name,
            role: cleanRole,
            avatar,
            language: language || null,
            isAudioOn: initialAudio,
            isVideoOn: initialVideo
          });
          setPeers([...peersRef.current]);
        });
        newSocket.on('participant:left', ({ socketId, userId }) => {
          if (socketId) peerStatusMapRef.current.delete(socketId);
          if (userId) peerStatusMapRef.current.delete(userId);

          if (sfuActiveRef.current) {
            removeSfuPeer({ peerId: socketId, userId });
            return;
          }

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

          // SFU mode does not use P2P signaling; status is carried by
          // participant:status_update and media by the SFU consumers.
          if (sfuActiveRef.current) return;

          if (payload.isAudioOn !== undefined || payload.isVideoOn !== undefined || payload.isScreenSharing !== undefined) {
            if (payload.callerId) setPeerCachedStatus(payload.callerId, { isAudioOn: payload.isAudioOn, isVideoOn: payload.isVideoOn, isScreenSharing: payload.isScreenSharing });
            if (payload.userId) setPeerCachedStatus(payload.userId, { isAudioOn: payload.isAudioOn, isVideoOn: payload.isVideoOn, isScreenSharing: payload.isScreenSharing });
          }

          const item = peersRef.current.find(p => p.peerID === payload.callerId || (payload.userId && p.userId === payload.userId));
          if (item && item.peer && !item.peer.destroyed) {
            let updated = false;
            if (payload.isAudioOn !== undefined && item.isAudioOn !== payload.isAudioOn) {
              item.isAudioOn = payload.isAudioOn;
              updated = true;
            }
            if (payload.isVideoOn !== undefined && item.isVideoOn !== payload.isVideoOn) {
              item.isVideoOn = payload.isVideoOn;
              updated = true;
            }
            if (payload.isScreenSharing !== undefined && item.isScreenSharing !== payload.isScreenSharing) {
              item.isScreenSharing = payload.isScreenSharing;
              updated = true;
            }
            if (updated) {
              setPeers([...peersRef.current]);
            }
            try {
              item.peer.signal(payload.signal);
            } catch (err) {
              console.warn('[WebRTC] Stale signal ignored:', err.message);
            }
          } else {
            // Destroy any previous stale or destroyed peer for this userId or callerId
            const staleIndices = peersRef.current
              .map((p, idx) => (((payload.userId && p.userId === payload.userId) || p.peerID === payload.callerId || p.peer?.destroyed) ? idx : -1))
              .filter(idx => idx !== -1)
              .reverse();

            staleIndices.forEach(idx => {
              try { peersRef.current[idx].peer?.destroy(); } catch (_) {}
              peersRef.current.splice(idx, 1);
            });

            try {
              const cached = getPeerCachedStatus(payload.callerId, payload.userId);
              const initialAudio = payload.isAudioOn !== undefined ? payload.isAudioOn : (cached?.isAudioOn !== undefined ? cached.isAudioOn : true);
              const initialVideo = payload.isVideoOn !== undefined ? payload.isVideoOn : (cached?.isVideoOn !== undefined ? cached.isVideoOn : true);
              const initialScreenShare = payload.isScreenSharing !== undefined ? payload.isScreenSharing : (cached?.isScreenSharing !== undefined ? cached.isScreenSharing : false);

              const hId = hostIdRef.current;
              const cleanRole = (hId && payload.userId !== hId && payload.role === 'HOST') ? 'COHOST' : payload.role;
              const peer = addPeer(payload.signal, payload.callerId, streamRef.current || currentStream, newSocket, user.name, roleRef.current);
              peersRef.current.push({
                peerID: payload.callerId,
                userId: payload.userId,
                peer,
                name: payload.name,
                role: cleanRole,
                avatar: payload.avatar,
                isAudioOn: initialAudio,
                isVideoOn: initialVideo,
                isScreenSharing: initialScreenShare
              });
              setPeers([...peersRef.current]);
            } catch (err) {
              console.warn('[WebRTC] addPeer error:', err.message);
            }
          }
        });
        newSocket.on('participant:status_update', ({ socketId, userId, isAudioOn, isVideoOn, isScreenSharing }) => {
          if (socketId) setPeerCachedStatus(socketId, { isAudioOn, isVideoOn, isScreenSharing });
          if (userId) setPeerCachedStatus(userId, { isAudioOn, isVideoOn, isScreenSharing });

          const idx = peersRef.current.findIndex(p => (socketId && (p.peerID === socketId || p.socketId === socketId)) || (userId && p.userId === userId));
          if (idx !== -1) {
            peersRef.current[idx] = {
              ...peersRef.current[idx],
              isAudioOn: isAudioOn !== undefined ? isAudioOn : peersRef.current[idx].isAudioOn,
              isVideoOn: isVideoOn !== undefined ? isVideoOn : peersRef.current[idx].isVideoOn,
              isScreenSharing: isScreenSharing !== undefined ? isScreenSharing : peersRef.current[idx].isScreenSharing
            };
            setPeers([...peersRef.current]);
          }
        });

        newSocket.on('participant:force_mute_received', ({ muterRole }) => {
          const myRole = roleRef.current;
          if (muterRole === 'HOST' || (muterRole === 'COHOST' && myRole !== 'HOST')) {
            setIsAudioOn(false);
            audioRef.current = false;
            if (streamRef.current) {
              streamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
            }
            if (sfuClientRef.current) {
              sfuClientRef.current.setProducerPaused('audio', true).catch(() => {});
            }
            newSocket.emit('meeting:status_update', { isAudioOn: false, isVideoOn: videoRef.current });
          }
        });

        newSocket.on('participant:force_video_off_received', ({ muterRole }) => {
          const myRole = roleRef.current;
          if (muterRole === 'HOST' || (muterRole === 'COHOST' && myRole !== 'HOST')) {
            setIsVideoOn(false);
            videoRef.current = false;
            if (streamRef.current) {
              streamRef.current.getVideoTracks().forEach(t => { t.enabled = false; });
            }
            if (sfuClientRef.current) {
              sfuClientRef.current.setProducerPaused('video', true).catch(() => {});
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
                if (sfuClientRef.current) sfuClientRef.current.setProducerPaused('audio', true).catch(() => {});
                newSocket.emit('meeting:status_update', { isAudioOn: false, isVideoOn: videoRef.current });
              }
            } else if (type === 'video') {
              setIsVideoLocked(locked);
              videoLockedRef.current = locked;
              if (locked) {
                setIsVideoOn(false);
                if (streamRef.current) streamRef.current.getVideoTracks().forEach(t => { t.enabled = false; });
                if (videoRef.current) videoRef.current = false;
                if (sfuClientRef.current) sfuClientRef.current.setProducerPaused('video', true).catch(() => {});
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
            const normSrc = String(sourceLanguage || 'en').trim().toLowerCase().split(/[-_]/)[0];
            const shortChatLang = String(chatLang).trim().toLowerCase().split(/[-_]/)[0];
            
            setMessages(prev => prev.map(m => {
              if (m.id === messageId) {
                const showTranslation = chatEnabled && chatLang !== 'original' && shortChatLang !== normSrc;
                return { ...m, translatedText: showTranslation ? (translations?.[chatLang] || translations?.[shortChatLang] || null) : null };
              }
              return m;
            }));
          });
          newSocket.on('caption:translated', async data => {
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
            const normSrc = String(data.sourceLanguage || 'en').trim().toLowerCase().split(/[-_]/)[0];

            // Record remote speaker's actual spoken language on their peer entry
            // so raw WebRTC audio muting matches Speech-to-Speech target language.
            if (data.speakerId || data.senderSocketId) {
              const pIdx = peersRef.current.findIndex(
                p => (data.speakerId && p.userId === data.speakerId) ||
                     (data.senderSocketId && (p.peerID === data.senderSocketId || p.socketId === data.senderSocketId))
              );
              if (pIdx !== -1 && peersRef.current[pIdx].language !== normSrc) {
                peersRef.current[pIdx] = { ...peersRef.current[pIdx], language: normSrc };
                setPeers([...peersRef.current]);
              }
            }

            const captionEnabled = u.captionEnabled ?? true;
            const captionLang = u.captionLang || 'original';
            const shortCaptionLang = String(captionLang).trim().toLowerCase().split(/[-_]/)[0];

            if (captionEnabled) {
              const textToShow = (captionLang === 'original' || shortCaptionLang === normSrc)
                ? data.text
                : (data.translations?.[captionLang] || data.translations?.[shortCaptionLang] || data.text);
              if (textToShow) {
                setCurrentCaption({
                  text: textToShow,
                  speaker: data.speakerName || 'Speaker',
                  sourceLang: data.sourceLanguage || 'auto',
                  targetLang: captionLang === 'original' ? (data.sourceLanguage || 'en') : captionLang,
                });
                if (captionTimerRef.current) clearTimeout(captionTimerRef.current);
        captionTimerRef.current = setTimeout(() => setCurrentCaption(null), 5000);
              }
            }

            const ttsEnabled = u.ttsEnabled ?? true;
            const ttsLang = u.ttsLang || 'original';
            
            // Do not play TTS for own speech — spoken/test audio should only play on remote participants' side.
            const isOwnSpeech = Boolean(data.senderSocketId
              ? (newSocket && data.senderSocketId === newSocket.id)
              : (u?.id && String(data.speakerId) === String(u.id)));

            if (ttsEnabled && !isOwnSpeech) {
              const shortTarget = String(ttsLang).trim().toLowerCase().split(/[-_]/)[0];
              if (ttsLang === 'original') {
                // Normal speech in 'original' uses WebRTC directly (no TTS);
                // Test Audio has no WebRTC mic stream so remote listeners hear it via TTS.
                if (!data.isTestAudio) return;
              } else if (!shortTarget || (shortTarget === normSrc && !data.isTestAudio)) {
                return;
              }
              const targetLangCode = ttsLang === 'original' ? normSrc : ttsLang;
              let translatedText = (ttsLang !== 'original')
                ? (data.translations?.[targetLangCode] || data.translations?.[shortTarget] || null)
                : null;

              // If the listener switched Speech-to-Speech just as this caption was
              // broadcast, translate on-the-fly instead of speaking the untranslated source.
              if (ttsLang !== 'original' && shortTarget !== normSrc && !translatedText && data.text) {
                try {
                  const res = await fetch(`${getApiUrl()}/translate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      text: data.text,
                      sourceLanguage: normSrc,
                      targetLanguages: [shortTarget]
                    })
                  });
                  if (res.ok) {
                    const trData = await res.json();
                    translatedText = trData?.translations?.[shortTarget] || trData?.translations?.[targetLangCode] || null;
                  }
                } catch (_) {}
              }

              if (ttsLang !== 'original' && shortTarget !== normSrc && !translatedText) {
                return;
              }

              const textToSpeak = ttsLang === 'original' ? data.text : (translatedText || data.text);

              if (textToSpeak && textToSpeak.trim()) {
                const cleanText = textToSpeak.trim();
                if (isDummyAudioText(cleanText)) {
                  return;
                }

                // One-word pronoun/article/filler captions are the classic
                // signature of the mic re-hearing TTS. Keep them as captions
                // but do not speak them back (which is what loops "you you").
                const echoWords = new Set(['you', 'the', 'a', 'an', 'and', 'uh', 'um', 'hmm']);
                const spokenWords = cleanText
                  .toLowerCase()
                  .replace(/[^\p{L}\p{N}\s]/gu, '')
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean);
                if (spokenWords.length === 1 && echoWords.has(spokenWords[0])) {
                  return;
                }

                const actualLangCode = ttsLang === 'original' ? normSrc : shortTarget;
                const bcpLang = BCP47_LANG_MAP[actualLangCode] || actualLangCode || 'en-US';
                const normKey = `${actualLangCode}:${cleanText.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()}`;
                const now = Date.now();

                // 1. Deduplication: Don't repeat identical audio within 2.5 seconds
                const lastPlayed = recentTtsMapRef.current.get(normKey) || 0;
                if (now - lastPlayed < 2500) {
                  return;
                }
                recentTtsMapRef.current.set(normKey, now);
                if (recentTtsMapRef.current.size > 200) {
                  for (const [key, seenAt] of recentTtsMapRef.current) {
                    if (now - seenAt > 30000) recentTtsMapRef.current.delete(key);
                  }
                }

                // 2. Self-echo suppression: If this sentence is an exact repeat of what I spoke recently, skip
                if (myLastSpokenTextRef.current && cleanText.toLowerCase().trim() === myLastSpokenTextRef.current.trim() && (now - myLastSpokenTimeRef.current < 4000)) {
                  return;
                }

                // 3. Play TTS audio via sovereign neural GPU backend /api/tts
                console.log(`[Meeting TTS] Playing ${actualLangCode} caption from ${data.speakerName || data.speakerId}: "${cleanText.slice(0, 60)}"`);
                playTtsAudio(cleanText, actualLangCode, bcpLang);
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
        if (sfuClientRef.current) {
          try { sfuClientRef.current.close(); } catch (_) {}
          sfuClientRef.current = null;
        }
        sfuActiveRef.current = false;
        sfuStartingRef.current = false;
        peersRef.current.forEach(p => { if (p.peer) { try { p.peer.destroy(); } catch (_) {} } }); 
        peersRef.current = []; 
        setPeers([]);
        if (streamRef.current) {
          try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (_) {}
          streamRef.current = null;
        }
        if (screenStreamRef.current) {
          try { screenStreamRef.current.getTracks().forEach(t => t.stop()); } catch (_) {}
          screenStreamRef.current = null;
        }
        if (activeSpeechRecRef.current) {
          try { activeSpeechRecRef.current.abort(); } catch (_) {}
          activeSpeechRecRef.current = null;
        } 
      };
  }, [user?.id, meetingId, retryCount]);

  // Speech recognition - starts when mic is unmuted and participant is admitted
  useEffect(() => {
    if (!socket || !user) return;
    if (!isAudioOn) {
      console.log('[Meeting STT] Mic is muted; speech recognition disabled');
      return;
    }
    if (meetingEnded) return;
    if (participantStatus !== 'ADMITTED' && !isHostOrCoHost) {
      console.log('[Meeting STT] Participant not admitted yet; recognition disabled');
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.log('[Meeting STT] SpeechRecognition API not available in this browser');
      return;
    }
    if (activeSpeechRecRef.current) {
      try { activeSpeechRecRef.current.abort(); } catch (_) {}
      activeSpeechRecRef.current = null;
    }
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const rec = new SR();
    activeSpeechRecRef.current = rec;
    rec.continuous = !isMobile;
    rec.interimResults = !isMobile;
    rec.lang = BCP47_LANG_MAP[spokenLanguage] || spokenLanguage || 'en-US';
    console.log('[Meeting STT] Listening in', rec.lang);
    let stopped = false;
    let restartTimer = null;
    let interimDebounceTimer = null;
    let pendingInterimText = '';

    const emitSpeech = (txt) => {
      if (!txt || !txt.trim()) return;
      const clean = txt.trim();
      const norm = clean.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
      if (!norm) return;

      // Echo suppression
      const lastTts = lastTtsPlaybackRef.current;
      const ttsRecentlyPlayed = Boolean(lastTts.text) && (Date.now() - lastTts.timestamp < 2500);
      if (ttsRecentlyPlayed && (lastTts.text.includes(norm) || (norm.length > 5 && lastTts.text.startsWith(norm)))) {
        return;
      }

      const now = Date.now();
      if (lastSpeechEmitRef.current.text === norm && (now - lastSpeechEmitRef.current.timestamp < 2000)) {
        return;
      }
      lastSpeechEmitRef.current = { text: norm, timestamp: now };
      myLastSpokenTextRef.current = norm;
      myLastSpokenTimeRef.current = now;

      console.log('[Meeting STT] Emitting caption:', clean.slice(0, 80));
      socket.emit('caption:text', {
        meetingId,
        speakerId: user?.id || socket.id,
        text: clean,
        language: spokenLanguage
      });
      pendingInterimText = '';
    };

    rec.onresult = (ev) => {
      // Acoustic echo suppression: never transcribe while our own TTS output is actively synthesizing
      if (isTtsPlayingRef.current) {
        return;
      }

      let latestTranscript = '';
      let isFinal = false;

      for (let i = ev.resultIndex; i < ev.results.length; ++i) {
        const item = ev.results[i];
        if (item && item[0] && item[0].transcript) {
          const t = item[0].transcript.trim();
          if (t) {
            latestTranscript = t;
            if (item.isFinal) isFinal = true;
          }
        }
      }

      if (!latestTranscript) return;

      if (isFinal || isMobile) {
        if (interimDebounceTimer) {
          clearTimeout(interimDebounceTimer);
          interimDebounceTimer = null;
        }
        emitSpeech(latestTranscript);
      } else {
        // Desktop interim debounce: emit if user pauses for 900ms without waiting for Chrome's delayed isFinal
        pendingInterimText = latestTranscript;
        if (interimDebounceTimer) clearTimeout(interimDebounceTimer);
        interimDebounceTimer = setTimeout(() => {
          if (pendingInterimText) {
            emitSpeech(pendingInterimText);
          }
        }, 900);
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
      if (interimDebounceTimer) {
        clearTimeout(interimDebounceTimer);
        interimDebounceTimer = null;
      }
      if (pendingInterimText) {
        emitSpeech(pendingInterimText);
      }
      if (!stopped && audioRef.current) {
        restartTimer = setTimeout(() => {
          if (!stopped && audioRef.current) {
            try { rec.start(); } catch (e) {
              console.log('[Meeting STT] restart failed:', e?.message || e);
            }
          }
        }, isMobile ? 150 : 350);
      }
    };
    try { rec.start(); } catch (e) {
      console.log('[Meeting STT] start failed:', e?.message || e);
    }
    return () => {
      stopped = true;
      if (interimDebounceTimer) clearTimeout(interimDebounceTimer);
      if (restartTimer) clearTimeout(restartTimer);
      try { rec.abort(); } catch (_) {
        try { rec.stop(); } catch (_) {}
      }
    };
 }, [socket, user?.id, isAudioOn, spokenLanguage, meetingId, participantStatus, isHostOrCoHost, meetingEnded]);

  // Sovereign GPU Faster-Whisper Web Audio VAD Speech Ingress
  useEffect(() => {
    if (!socket || !isAudioOn || meetingEnded) return;

    const mediaStream = streamRef.current || stream;
    const audioTrack = mediaStream?.getAudioTracks?.()[0];
    if (!audioTrack || !audioTrack.enabled) return;

    let audioCtx = null;
    let sourceNode = null;
    let processorNode = null;
    let silenceGain = null;
    let isCancelled = false;

    let speechChunks = [];
    let isSpeaking = false;
    let silenceTimer = null;
    let maxSpeechTimer = null;

    const sendSpeechBuffer = () => {
      if (isCancelled || speechChunks.length === 0) return;
      if (isTtsPlayingRef.current) {
        speechChunks = [];
        return;
      }

      const totalLength = speechChunks.reduce((acc, c) => acc + c.length, 0);
      const sampleRate = audioCtx?.sampleRate || 44100;
      const minSamples = Math.round(sampleRate * 0.4); // At least 0.4s

      if (totalLength < minSamples) {
        speechChunks = [];
        return;
      }

      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of speechChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      speechChunks = [];

      const downsampled = downsampleTo16k(merged, sampleRate);
      const wavBytes = encodeWav(downsampled, 16000);

      let binary = '';
      const len = wavBytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(wavBytes[i]);
      }
      const base64 = btoa(binary);

      console.log(`[Meeting VAD] Emitting speech WAV (${(downsampled.length / 16000).toFixed(1)}s) to Faster-Whisper`);
      setSpeechStatusText('Transcribing speech...');

      socket.emit('caption:audio', {
        meetingId,
        speakerId: user?.id || socket.id,
        speakerName: user?.name,
        language: spokenLanguage,
        audioBase64: base64
      });

      setTimeout(() => {
        setSpeechStatusText('');
      }, 2500);
    };

    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtxClass();

      if (audioCtx.state === 'suspended') {
        const resumeCtx = () => {
          if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }
        };
        window.addEventListener('pointerdown', resumeCtx, { once: true });
        window.addEventListener('keydown', resumeCtx, { once: true });
        audioCtx.resume().catch(() => {});
      }

      sourceNode = audioCtx.createMediaStreamSource(mediaStream);
      processorNode = audioCtx.createScriptProcessor(4096, 1, 1);

      silenceGain = audioCtx.createGain();
      silenceGain.gain.value = 0;

      processorNode.onaudioprocess = (e) => {
        if (isCancelled || !audioRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);

        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const vol = Math.min(100, Math.round(rms * 250));
        micVolumeRef.current = vol;

        if (isTtsPlayingRef.current) {
          if (isSpeaking) {
            isSpeaking = false;
            setIsSpeakingLive(false);
            speechChunks = [];
          }
          return;
        }

        const isVoiceEnergy = rms >= 0.012;

        if (isVoiceEnergy) {
          if (!isSpeaking) {
            isSpeaking = true;
            setIsSpeakingLive(true);
            setSpeechStatusText('Speaking...');
          }

          if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
          }

          speechChunks.push(new Float32Array(inputData));

          if (!maxSpeechTimer) {
            maxSpeechTimer = setTimeout(() => {
              maxSpeechTimer = null;
              if (isSpeaking) {
                isSpeaking = false;
                setIsSpeakingLive(false);
                sendSpeechBuffer();
              }
            }, 6000);
          }
        } else if (isSpeaking) {
          if (speechChunks.length < 150) {
            speechChunks.push(new Float32Array(inputData));
          }

          if (!silenceTimer) {
            silenceTimer = setTimeout(() => {
              silenceTimer = null;
              if (maxSpeechTimer) {
                clearTimeout(maxSpeechTimer);
                maxSpeechTimer = null;
              }
              isSpeaking = false;
              setIsSpeakingLive(false);
              sendSpeechBuffer();
            }, 650);
          }
        }
      };

      sourceNode.connect(processorNode);
      processorNode.connect(silenceGain);
      silenceGain.connect(audioCtx.destination);
    } catch (vadErr) {
      console.warn('[Meeting VAD] Init error:', vadErr.message);
    }

    return () => {
      isCancelled = true;
      setIsSpeakingLive(false);
      setSpeechStatusText('');
      if (silenceTimer) clearTimeout(silenceTimer);
      if (maxSpeechTimer) clearTimeout(maxSpeechTimer);
      if (processorNode) {
        try { processorNode.disconnect(); } catch (_) {}
      }
      if (sourceNode) {
        try { sourceNode.disconnect(); } catch (_) {}
      }
      if (silenceGain) {
        try { silenceGain.disconnect(); } catch (_) {}
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        try { audioCtx.close(); } catch (_) {}
      }
    };
  }, [socket, stream, isAudioOn, meetingEnded, spokenLanguage]);

  const toggleVideo = () => {
    if (videoLockedRef.current) {
      setAlertMessage('Camera is disabled by Host');
      return;
    }
    const nextVideo = !isVideoOn;
    videoRef.current = nextVideo;
    setIsVideoOn(nextVideo);
    const mediaStream = streamRef.current || stream;
    mediaStream?.getVideoTracks().forEach(t => { t.enabled = nextVideo; });
    if (sfuClientRef.current) {
      sfuClientRef.current.setProducerPaused('video', !nextVideo).catch(() => {});
    }
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
    const mediaStream = streamRef.current || stream;
    mediaStream?.getAudioTracks().forEach(t => { t.enabled = nextAudio; });
    if (!nextAudio && activeSpeechRecRef.current) {
      try { activeSpeechRecRef.current.abort(); } catch (_) {}
    }
    if (sfuClientRef.current) {
      sfuClientRef.current.setProducerPaused('audio', !nextAudio).catch(() => {});
    }
    if (socket) socket.emit('meeting:status_update', { isAudioOn: nextAudio, isVideoOn: videoRef.current });
  };

  const updateUserSettings = (key, value) => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;
    const updated = { ...currentUser, [key]: value };
    const token = localStorage.getItem('token');
    useAuthStore.getState().updateUser(token, updated);

    // Selecting Speech-to-Speech settings is a direct user gesture; unlock audio
    // playback immediately so translated TTS is never blocked by browser autoplay.
    if ((key === 'ttsLang' && value && value !== 'original') || (key === 'ttsEnabled' && value)) {
      audioUnlockedRef.current = true;
      setAudioUnlocked(true);
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') ctx.resume().catch(() => {});
          setTimeout(() => { try { ctx.close(); } catch (_) {} }, 250);
        }
      } catch (_) {}
    }

    const activeSocket = socketRef.current || socket;
    if (activeSocket) {
      activeSocket.emit('user:update_settings', updated);
    }
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
      stopScreenShare();
      router.push(`/meeting/${meetingId}/report`);
    }
  };

  const confirmEndMeeting = async () => {
    stopScreenShare();
    const myRole = isHost ? 'HOST' : 'COHOST';
    const myName = user?.name || (isHost ? 'Host' : 'Co-host');
    const endedByPayload = { name: myName, role: myRole, userId: user?.id };
    try {
      await authFetch(`/meetings/${meetingId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endedBy: endedByPayload })
      });
    } catch (e) {
      console.error('Failed to end meeting via API', e);
    }
    if (socket) {
      socket.emit('meeting:end', { meetingId, endedBy: endedByPayload });
    }
    router.push(`/meeting/${meetingId}/report`);
  };

  const confirmLeaveMeeting = () => {
    stopScreenShare();
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

  const handleTestAudio = () => {
    if (isDemoActive) {
      setIsDemoActive(false);
      if (demoTimerRef.current) {
        clearTimeout(demoTimerRef.current);
        demoTimerRef.current = null;
      }
      // Stop the test playback immediately when toggled off.
      try { window.speechSynthesis?.cancel(); } catch (_) {}
      if (typeof window !== 'undefined' && window._activeTtsAudio) {
        try {
          window._activeTtsAudio.pause();
          window._activeTtsAudio.src = '';
        } catch (_) {}
        window._activeTtsAudio = null;
      }
      setTtsPlayingState(false);
      return;
    }

    const phrase = 'Hello, this is a live test of the BhashaBridge translation system.';

    setIsDemoActive(true);
    setAlertMessage('Sent audio test phrase to other meeting participants.');

    if (socket && user?.id) {
      socket.emit('caption:text', {
        meetingId,
        speakerId: user.id,
        text: phrase,
        language: 'en',
        isTestAudio: true
      });
    }

    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    demoTimerRef.current = setTimeout(() => {
      setIsDemoActive(false);
      demoTimerRef.current = null;
    }, 3000);
  };

  useEffect(() => () => {
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
  }, []);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    const msg = { id: Date.now().toString(), meetingId, senderId: user.id, senderName: user.name, text: chatInput, language: spokenLanguage };
    socket.emit('chat:message', msg);
    setChatInput('');
  };

  // Test Audio is driven by handleTestAudio (button click) so it plays exactly
  // once per click instead of re-firing whenever an effect dependency changes.

  // ======= MEETING JOIN ERROR POPUP (Ended, Cancelled, Restricted, Not Found) =======
  if (joinError) {
    const isEnded = joinError.type === 'ENDED';
    const isCancelled = joinError.type === 'CANCELLED';
    const accentColor = isEnded ? '#0022FF' : (isCancelled ? '#777' : '#FF3311');

    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bb-bg)',
        backgroundImage: 'radial-gradient(var(--bb-bg-grid) 1px, transparent 0)',
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
          background: 'var(--bb-surface-2)',
          border: '3px solid var(--bb-border)',
          boxShadow: '12px 12px 0 var(--bb-shadow)',
          maxWidth: 480,
          width: '100%',
          padding: '2.5rem',
          textAlign: 'center',
          position: 'relative',
          color: 'var(--bb-text)'
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
            background: 'var(--bb-surface)',
            color: 'var(--bb-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            border: '2px solid var(--bb-border)',
            boxShadow: `6px 6px 0 ${accentColor}`
          }}>
            {isEnded ? (
              <Clock size={36} color="var(--bb-text)" />
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
            color: 'var(--bb-text)',
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
              color: 'var(--bb-text)',
              background: 'transparent',
              border: '1px solid var(--bb-border)',
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
            color: 'var(--bb-text-muted)',
            fontSize: '0.95rem',
            lineHeight: 1.6,
            fontFamily: 'var(--font-grotesk)'
          }}>
            {isEnded ? (
              endedByInfo?.name ? (
                <>
                  <strong style={{ color: 'var(--bb-text)' }}>
                    {endedByInfo.role === 'COHOST' ? 'Co-host' : 'Host'} {endedByInfo.name}
                  </strong>{' '}
                  has ended this meeting for everyone.
                </>
              ) : endedByInfo?.role === 'COHOST' ? (
                'The co-host has ended this meeting for everyone.'
              ) : (
                'The host has ended this meeting for everyone.'
              )
            ) : (
              joinError.message
            )}
          </p>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {joinError.showReport && (
              <button
                onClick={() => router.push(`/meeting/${meetingId}/report`)}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: 'var(--bb-cobalt)',
                  color: '#FFFFFF',
                  border: '2px solid var(--bb-border)',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  boxShadow: '4px 4px 0 var(--bb-shadow)',
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
                  background: 'var(--bb-cobalt)',
                  color: '#FFFFFF',
                  border: '2px solid var(--bb-border)',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  boxShadow: '4px 4px 0 var(--bb-shadow)',
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
                background: 'var(--bb-surface)',
                color: 'var(--bb-text)',
                border: '2px solid var(--bb-border)',
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
      <EditorialLoader
        title="Connecting to Studio"
        subtitle="Preparing encrypted WebRTC audio/video & multilingual speech pipeline..."
        tag="MEETING CONNECT"
      />
    );
  }

  // ======= REJECTED SCREEN =======
  if (participantStatus === 'REJECTED') {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: 'var(--bb-bg)', gap: '1.5rem', border: '2px solid var(--bb-border)', margin: '2rem', color: 'var(--bb-text)' }}>
        <div style={{ width: 80, height: 80, borderRadius: '0', background: 'var(--bb-surface)', border: '2px solid var(--bb-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '8px 8px 0 var(--bb-vermilion)' }}>
          <UserX size={36} color="var(--bb-text)" />
        </div>
        <h2 style={{ color: 'var(--bb-text)', margin: 0, fontSize: '3rem', fontFamily: 'var(--font-serif)', fontStyle: 'italic', letterSpacing: '-0.02em' }}>Access Denied</h2>
        <p style={{ color: 'var(--bb-text-muted)', margin: 0, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>The host declined your request to join this meeting.</p>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'var(--bb-cobalt)', color: 'white', border: 'none', padding: '1rem 2rem', borderRadius: '0', fontWeight: 600, cursor: 'pointer', fontSize: '1rem', marginTop: '1rem', boxShadow: '4px 4px 0 var(--bb-shadow)', fontFamily: 'var(--font-grotesk)' }}>
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
          background: 'var(--bb-surface-2)',
          border: '3px solid var(--bb-border)',
          boxShadow: '12px 12px 0 var(--bb-shadow)',
          maxWidth: 480,
          width: '100%',
          padding: '2.5rem',
          textAlign: 'center',
          position: 'relative',
          color: 'var(--bb-text)'
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: 'var(--bb-cobalt)'
          }} />
          <div style={{
            width: 72,
            height: 72,
            background: 'var(--bb-surface)',
            color: 'var(--bb-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            border: '2px solid var(--bb-border)',
            boxShadow: '6px 6px 0 var(--bb-cobalt)'
          }}>
            <Clock size={36} color="var(--bb-text)" />
          </div>
          <h2 style={{
            margin: '0 0 0.5rem',
            color: 'var(--bb-text)',
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
              color: 'var(--bb-text)',
              border: '1px solid var(--bb-border)',
              padding: '0.25rem 0.65rem',
              fontWeight: 700,
              textTransform: 'uppercase'
            }}>
              <span style={{ width: 8, height: 8, background: 'var(--bb-cobalt)', display: 'inline-block' }} />
              ID: {meetingId}
            </span>
          </div>
          <p style={{
            margin: '0 0 2rem',
            color: 'var(--bb-text-muted)',
            fontSize: '0.95rem',
            lineHeight: 1.6,
            fontFamily: 'var(--font-grotesk)'
          }}>
            {endedByInfo?.name ? (
              <>
                <strong style={{ color: 'var(--bb-text)' }}>
                  {endedByInfo.role === 'COHOST' ? 'Co-host' : 'Host'} {endedByInfo.name}
                </strong>{' '}
                has ended this meeting for everyone.
              </>
            ) : endedByInfo?.role === 'COHOST' ? (
              'The co-host has ended this meeting for everyone.'
            ) : (
              'The host has ended this meeting for everyone.'
            )}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={() => router.push(`/meeting/${meetingId}/report`)}
              style={{
                width: '100%',
                padding: '1rem',
                background: 'var(--bb-cobalt)',
                color: '#FFFFFF',
                border: '2px solid var(--bb-border)',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.9rem',
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                boxShadow: '4px 4px 0 var(--bb-shadow)',
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
                background: 'var(--bb-surface)',
                color: 'var(--bb-text)',
                border: '2px solid var(--bb-border)',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.9rem',
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                boxShadow: '4px 4px 0 var(--bb-shadow)',
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
              <video
                playsInline
                muted
                ref={handleUserVideoRef}
                autoPlay
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: isVideoOn ? 'block' : 'none' }}
                onLoadedMetadata={() => {
                  if (userVideo.current) {
                    userVideo.current.play().catch(() => {});
                  }
                }}
              />
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
            
            <h1 style={{ margin: '0 0 0.75rem', color: 'var(--bb-text)', fontSize: '2.5rem', fontWeight: 600, lineHeight: 1.1, fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
              Waiting to Connect
            </h1>
            <p style={{ margin: '0 0 2.5rem', color: 'var(--bb-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', lineHeight: 1.6, textTransform: 'uppercase' }}>
              The host will admit you shortly. You will join automatically once admitted.
            </p>

            {/* Status indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: 'var(--bb-surface)', border: '2px solid var(--bb-border)', borderRadius: '0', marginBottom: '1.5rem', boxShadow: '4px 4px 0 var(--bb-shadow)' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--bb-cobalt)', animation: 'pulse 2s infinite' }} />
              <span style={{ color: 'var(--bb-text)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>Lobby <strong>{meetingId}</strong></span>
            </div>

            <button
              onClick={handleLeaveWaitingRoom}
              style={{ width: '100%', padding: '1rem', background: 'var(--bb-cobalt)', color: '#FFFFFF', border: '2px solid var(--bb-border)', borderRadius: '0', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem', transition: 'transform 0.2s', boxShadow: '4px 4px 0 #FF3311', fontFamily: 'var(--font-grotesk)' }}
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
            width: 340, background: 'var(--bb-surface-2)',
            border: '2px solid var(--bb-border)', borderRadius: '0',
            boxShadow: '8px 8px 0 var(--bb-shadow)', overflow: 'hidden', fontFamily: 'var(--font-grotesk)', color: 'var(--bb-text)'
          }}>
            <div style={{ padding: '1rem', borderBottom: '2px solid var(--bb-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bb-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: '0', background: 'var(--bb-vermilion)', animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontWeight: 600, color: 'var(--bb-text)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Lobby ({waitingUsers.length})</span>
              </div>
              <button onClick={() => setShowLobby(false)} style={{ background: 'none', border: 'none', color: 'var(--bb-text)', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 600 }}>&times;</button>
            </div>
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 350, overflowY: 'auto' }}>
              {waitingUsers.map(w => (
                <div key={w.userId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 0', borderBottom: '1px solid var(--bb-border-soft)' }}>
                  <Avatar name={w.name} size={34} color="var(--bb-cobalt)" avatarUrl={w.avatar} />
                  <span style={{ flex: 1, color: 'var(--bb-text)', fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button onClick={() => handleAdmit(w.userId)} title="Admit" style={{ width: 34, height: 34, borderRadius: '0', background: 'var(--bb-cobalt)', border: '2px solid var(--bb-border)', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '2px 2px 0 var(--bb-shadow)', transition: 'transform 0.1s' }} onMouseEnter={e => e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e => e.currentTarget.style.transform='none'}>
                      <UserCheck size={16} />
                    </button>
                    <button onClick={() => handleReject(w.userId)} title="Reject" style={{ width: 34, height: 34, borderRadius: '0', background: 'var(--bb-vermilion)', border: '2px solid var(--bb-border)', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '2px 2px 0 var(--bb-shadow)', transition: 'transform 0.1s' }} onMouseEnter={e => e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e => e.currentTarget.style.transform='none'}>
                      <UserX size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === STUDIO BROADCAST HEADER === */}
        <header className={styles.studioHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.brandEmblem}>
              <div className={styles.onAirDot} />
              <span className={styles.brandName}>BhashaBridge</span>
            </div>
            <div className={styles.headerDivider} />
            <div className={styles.roomMetaGroup}>
              <div className={styles.roomCodePill}>
                <span>ROOM:</span>
                <code>{meetingId}</code>
              </div>
              <button
                onClick={handleCopyInviteLink}
                title={copiedLink ? "Link copied!" : "Copy meeting invite link"}
                className={styles.copyCodeBtn}
              >
                {copiedLink ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
                <span>{copiedLink ? 'COPIED' : 'COPY'}</span>
              </button>
              <div className={styles.timerBadge}>
                <Clock size={12} />
                <span>{formatTimer(elapsedSeconds)}</span>
              </div>
              {participantRole && (
                <span className={`${styles.rolePill} ${participantRole === 'HOST' ? styles.roleHost : participantRole === 'COHOST' ? styles.roleCoHost : styles.roleParticipant}`}>
                  {participantRole}
                </span>
              )}
            </div>
          </div>

          <div className={styles.headerRight}>
            {/* Locked Spoken Language Badge (synced to Profile) */}
            <div
              className={`${styles.dialectSelectorPill} ${styles.dialectSelectorPillLocked}`}
              title="Spoken language is locked to your profile language during meetings"
            >
              <Mic size={13} color="var(--cobalt)" />
              <select
                className={styles.dialectSelect}
                value={spokenLanguage}
                disabled
                aria-label="My spoken language (locked to profile)"
              >
                {LANG_OPTIONS.map(l => (
                  <option key={l.value} value={l.value}>
                    MIC: {l.label}
                  </option>
                ))}
              </select>
              <Lock size={11} color="#5A5A5A" style={{ marginLeft: 2, flexShrink: 0 }} />
            </div>

            {/* Host Lobby Alert */}
            {isHostOrCoHost && waitingUsers.length > 0 && (
              <button
                onClick={() => setShowLobby(l => !l)}
                className={`${styles.headerBtn} ${styles.lobbyAlertBtn}`}
              >
                <div className={styles.onAirDot} />
                <span>Lobby ({waitingUsers.length})</span>
              </button>
            )}

            {/* AI Summary */}
            <button
              onClick={fetchLiveSummary}
              className={styles.headerBtn}
              title="Generate Instant Meeting Summary"
            >
              <Sparkles size={14} color="#0022FF" />
              <span>AI Summary</span>
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(true)}
              className={`${styles.headerBtn} ${styles.headerBtnDark}`}
            >
              <Settings size={14} />
              <span>Settings</span>
            </button>

            {/* Test Audio Demo */}
            <button
              onClick={handleTestAudio}
              className={`${styles.headerBtn} ${isDemoActive ? styles.headerBtnLive : ''}`}
            >
              <Radio size={14} />
              <span>{isDemoActive ? 'Demo Playing...' : '⚡ Test Audio'}</span>
            </button>
          </div>
        </header>

        {/* Audio Autoplay Unlock Banner */}
        {!audioUnlocked && (
          <div
            onClick={() => {
              if (typeof window !== 'undefined' && window.__bbUnlockAudio) {
                window.__bbUnlockAudio();
              }
              setAudioUnlocked(true);
            }}
            className={styles.audioUnlockBanner}
          >
            <Volume2 size={16} />
            <span>Click once to enable live translated audio</span>
          </div>
        )}

        <main className={styles.main}>
          {/* === VIDEO STAGE === */}
          <div className={styles.videoSection}>
            <div className={styles.videoStageContainer}>
              <div
                className={`${styles.videoGrid} ${
                  (peers.length + 1) === 1 ? styles.gridCount1 :
                  (peers.length + 1) === 2 ? styles.gridCount2 :
                  (peers.length + 1) <= 4 ? styles.gridCount3 : styles.gridCountMany
                }`}
                data-count={peers.length + 1}
              >
                {/* Self Tile */}
                <div className={`${styles.videoTile} ${isAudioOn ? styles.videoTileActiveSpeaker : ''}`}>
                  <video
                    muted
                    playsInline
                    ref={handleUserVideoRef}
                    autoPlay
                    className={styles.videoElement}
                    style={{
                      display: (isVideoOn || isScreenSharing) ? 'block' : 'none',
                      objectFit: isScreenSharing ? 'contain' : 'cover',
                      backgroundColor: isScreenSharing ? '#000' : 'transparent'
                    }}
                    onLoadedMetadata={() => {
                      if (userVideo.current) {
                        userVideo.current.play().catch(() => {});
                      }
                    }}
                  />
                  {(!isVideoOn && !isScreenSharing) && (
                    <div className={styles.avatarPlaceholder}>
                      <div className={styles.avatarPulseRing}>
                        {isAudioOn && <div className={styles.speakingWaves} />}
                        <Avatar name={user.name} size={68} color="#0022FF" avatarUrl={user.avatar} />
                      </div>
                      <span className={styles.avatarNameLabel}>{user.name || 'You'} (You)</span>
                    </div>
                  )}
                  <div className={styles.tileOverlay}>
                    <div className={styles.tileIdentity}>
                      <span className={styles.tileNamePill}>
                        {isScreenSharing && <Monitor size={12} color="#10B981" />}
                        {user.name || 'You'} (You)
                      </span>
                      {participantRole && participantRole !== 'PARTICIPANT' && (
                        <span className={`${styles.tileRoleTag} ${participantRole === 'HOST' ? styles.roleHost : styles.roleCoHost}`}>
                          {participantRole}
                        </span>
                      )}
                    </div>
                    <div className={styles.tileStatusIcons}>
                      <div className={`${styles.statusIconPill} ${isAudioOn ? styles.iconActive : styles.iconMuted}`}>
                        {isAudioOn ? <Mic size={14} /> : <MicOff size={14} />}
                      </div>
                      <div className={`${styles.statusIconPill} ${(isVideoOn || isScreenSharing) ? styles.iconActive : styles.iconMuted}`}>
                        {(isVideoOn || isScreenSharing) ? <Video size={14} /> : <VideoOff size={14} />}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Peer Tiles */}
                {peers
                  .filter((peer, index, self) => index === self.findIndex(p => (p.userId && p.userId === peer.userId) || p.peerID === peer.peerID))
                  .map((peer, i) => {
                    const myTtsEnabled = user?.ttsEnabled ?? true;
                    const myTtsLang = String(user?.ttsLang || 'original').trim().toLowerCase().split(/[-_]/)[0];
                    const peerLang = peer.language ? String(peer.language).trim().toLowerCase().split(/[-_]/)[0] : null;
                    const suppressOriginalAudio = isTtsPlaying || (myTtsEnabled && myTtsLang !== 'original' && peerLang !== myTtsLang);
                    return (
                      <VideoPeer
                        key={peer.userId || peer.peerID || i}
                        peer={peer.peer}
                        stream={peer.stream}
                        name={peer.name || `Participant ${i + 1}`}
                        role={peer.role}
                        isAudioOn={peer.isAudioOn}
                        isVideoOn={peer.isVideoOn}
                        isScreenSharing={peer.isScreenSharing}
                        avatarUrl={peer.avatar}
                        suppressAudio={suppressOriginalAudio}
                      />
                    );
                  })}
              </div>
            </div>

            {/* Subtitle / Caption HUD */}
            {currentCaption && showCaptions && (
              <div className={styles.captionsOverlay}>
                <div className={styles.captionCard}>
                  <div className={styles.captionSpeakerBadge}>
                    <div className={styles.captionLiveDot} />
                    <span>{typeof currentCaption === 'object' ? (currentCaption.speaker || 'Speaker') : 'Speaker'}</span>
                    {typeof currentCaption === 'object' && currentCaption.sourceLang && (
                      <span className={styles.captionLangTag}>
                        [{currentCaption.sourceLang.toUpperCase()} → {currentCaption.targetLang ? currentCaption.targetLang.toUpperCase() : 'AUTO'}]
                      </span>
                    )}
                  </div>
                  <p className={styles.captionText}>
                    {typeof currentCaption === 'object' ? currentCaption.text : currentCaption}
                  </p>
                </div>
              </div>
            )}

            {/* Live Mic Speech VAD Broadcast HUD */}
            {isAudioOn && (
              <div
                className={`${styles.vadHudPill} ${
                  isSpeakingLive
                    ? styles.vadHudSpeaking
                    : speechStatusText
                      ? styles.vadHudTranscribing
                      : ''
                }`}
              >
                <span className={styles.vadLiveDot} />
                <span>
                  {isSpeakingLive
                    ? `Speaking (${spokenLanguage.toUpperCase()})`
                    : (speechStatusText || `Mic Live · ${spokenLanguage.toUpperCase()}`)}
                </span>
                {activeMicVolume > 0 && (
                  <span className={styles.vadVolReadout}>{activeMicVolume}%</span>
                )}
              </div>
            )}

            {/* Floating Controls Dock */}
            <div className={styles.meetingControlsBar}>
              {/* Mic Toggle */}
              <button
                onClick={toggleAudio}
                title={isAudioLocked ? 'Microphone locked by host' : (isAudioOn ? 'Mute Microphone' : 'Unmute Microphone')}
                disabled={isAudioLocked}
                className={`${styles.controlBtn} ${!isAudioOn ? styles.controlBtnDisabled : ''}`}
              >
                {isAudioOn ? <Mic size={20} /> : <MicOff size={20} />}
              </button>

              {/* Video Toggle */}
              <button
                onClick={toggleVideo}
                title={isVideoLocked ? 'Camera disabled by Host' : (isVideoOn ? 'Turn off camera' : 'Turn on camera')}
                disabled={isVideoLocked}
                className={`${styles.controlBtn} ${!isVideoOn ? styles.controlBtnDisabled : ''}`}
              >
                {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
              </button>

              {/* Screen Share Toggle */}
              <button
                onClick={toggleScreenShare}
                title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
                className={`${styles.controlBtn} ${isScreenSharing ? styles.controlBtnScreenShare : ''}`}
              >
                {isScreenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
              </button>

              {/* Captions CC Toggle */}
              <button
                onClick={() => setShowCaptions(c => !c)}
                title={showCaptions ? 'Hide Subtitles' : 'Show Subtitles'}
                className={`${styles.controlBtn} ${showCaptions ? styles.controlBtnActive : ''}`}
              >
                <Subtitles size={20} />
              </button>

              {/* Chat Toggle */}
              <button
                ref={chatToggleBtnRef}
                onClick={() => setSidebarTab(t => t === 'CHAT' ? null : 'CHAT')}
                title="Chat"
                className={`${styles.controlBtn} ${sidebarTab === 'CHAT' ? styles.controlBtnActive : ''}`}
              >
                <MessageSquare size={20} />
                {messages.length > 0 && <span className={styles.btnBadge}>{messages.length}</span>}
              </button>

              {/* Members Toggle */}
              <button
                ref={membersToggleBtnRef}
                onClick={() => setSidebarTab(t => t === 'MEMBERS' ? null : 'MEMBERS')}
                title="Members"
                className={`${styles.controlBtn} ${sidebarTab === 'MEMBERS' ? styles.controlBtnActive : ''}`}
              >
                <Users size={20} />
                <span className={styles.btnBadge}>{peers.length + 1}</span>
              </button>

              {/* Host Controls */}
              {isHostOrCoHost && (
                <div ref={moreMenuRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowMoreMenu(m => !m)}
                    title="More Controls"
                    className={`${styles.controlBtn} ${showMoreMenu ? styles.controlBtnActive : ''}`}
                  >
                    <MoreVertical size={20} />
                  </button>
                  {showMoreMenu && (
                    <div className={styles.moreMenuDropdown}>
                      <button
                        className={styles.moreMenuItem}
                        onClick={() => { if(socket) socket.emit('meeting:force_mute_all', { role: participantRole }); setShowMoreMenu(false); }}
                      >
                        <MicOff size={16} color="#FF3311" /> Mute All
                      </button>
                      <button
                        className={styles.moreMenuItem}
                        onClick={() => { if(socket) socket.emit('meeting:force_video_off_all', { role: participantRole }); setShowMoreMenu(false); }}
                      >
                        <VideoOff size={16} color="#FF3311" /> Turn Off All Cameras
                      </button>
                      <button
                        className={styles.moreMenuItem}
                        onClick={() => {
                          const newLock = !roomAudioLocked;
                          setRoomAudioLocked(newLock);
                          if(socket) socket.emit('meeting:lock_hardware', { role: participantRole, type: 'audio', locked: newLock });
                          setShowMoreMenu(false);
                        }}
                      >
                        <MicOff size={16} color={roomAudioLocked ? "#0022FF" : "#0A0A0A"} /> {roomAudioLocked ? 'Unlock All Mics' : 'Lock All Mics'}
                      </button>
                      <button
                        className={styles.moreMenuItem}
                        onClick={() => {
                          const newLock = !roomVideoLocked;
                          setRoomVideoLocked(newLock);
                          if(socket) socket.emit('meeting:lock_hardware', { role: participantRole, type: 'video', locked: newLock });
                          setShowMoreMenu(false);
                        }}
                      >
                        <VideoOff size={16} color={roomVideoLocked ? "#0022FF" : "#0A0A0A"} /> {roomVideoLocked ? 'Unlock All Cameras' : 'Lock All Cameras'}
                      </button>
                      <div className={styles.moreMenuDivider} />
                      <button
                        className={styles.moreMenuItem}
                        onClick={() => { setShowLobby(l => !l); setShowMoreMenu(false); }}
                      >
                        <Shield size={16} color="#0022FF" /> {waitingUsers.length > 0 ? `Lobby (${waitingUsers.length})` : 'Lobby'}
                      </button>
                      <button
                        className={styles.moreMenuItem}
                        onClick={() => { setSidebarTab('MEMBERS'); setShowMoreMenu(false); }}
                      >
                        <Users size={16} /> Manage Members
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Leave Meeting */}
              <button
                onClick={leaveMeeting}
                title="Leave meeting"
                className={`${styles.controlBtn} ${styles.controlBtnDanger}`}
              >
                <PhoneOff size={20} />
              </button>
            </div>
          </div>

          {/* === SIDEBAR === */}
          <aside ref={sidebarRef} className={`${styles.chatSection} ${sidebarTab ? styles.chatSectionOpen : ''}`}>
            {/* Sidebar tabs */}
            <div className={styles.sidebarHeaderRow}>
              {['CHAT', 'MEMBERS'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setSidebarTab(tab)}
                  className={`${styles.sidebarTabBtn} ${sidebarTab === tab ? styles.sidebarTabBtnActive : ''}`}
                >
                  {tab === 'CHAT' ? (
                    <><MessageSquare size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Chat</>
                  ) : (
                    <><Users size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Members ({peers.length + 1}){waitingUsers.length > 0 && isHostOrCoHost && <span style={{ marginLeft: 6, width: 8, height: 8, borderRadius: '50%', background: '#FF3311', display: 'inline-block' }} />}</>
                  )}
                </button>
              ))}
              <button
                onClick={() => setSidebarTab(null)}
                title="Close panel"
                className={styles.sidebarCloseBtn}
              >
                <X size={18} />
              </button>
            </div>

            {sidebarTab === 'CHAT' ? (
              <>
                <div className={styles.chatMessages}>
                  {messages.length === 0 && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--bb-text-muted)', padding: '2rem 1rem', textAlign: 'center' }}>
                      <MessageSquare size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                      <p style={{ margin: 0, fontSize: '0.88rem' }}>No messages yet.<br />Start the conversation!</p>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`${styles.message} ${m.senderId === user.id ? styles.self : ''}`}>
                      {m.senderId !== user.id && <span style={{ fontSize: '0.72rem', color: 'var(--bb-text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.2rem', paddingLeft: '0.25rem' }}>{m.senderName}</span>}
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
              <div className={styles.membersPanel}>
                {/* Waiting room section for host */}
                {isHostOrCoHost && waitingUsers.length > 0 && (
                  <div style={{ marginBottom: '0.5rem', padding: '0.75rem', background: 'var(--bb-vermilion-soft)', border: '1px solid var(--bb-vermilion)', boxShadow: '2px 2px 0 var(--bb-shadow)' }}>
                    <div className={styles.membersSectionTitle} style={{ color: 'var(--vermilion)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--vermilion)', animation: 'pulseBeacon 1s infinite' }} />
                      Waiting Room ({waitingUsers.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {waitingUsers.map(w => (
                        <div key={w.userId} className={styles.memberCard}>
                          <Avatar name={w.name} size={32} color="#0A0A0A" avatarUrl={w.avatar} />
                          <span className={styles.memberName}>{w.name}</span>
                          <div className={styles.memberActions}>
                            <button onClick={() => handleAdmit(w.userId)} className={styles.memberBtnIcon} title="Admit" style={{ color: 'var(--cobalt)' }}>
                              <UserCheck size={16} />
                            </button>
                            <button onClick={() => handleReject(w.userId)} className={styles.memberBtnIcon} title="Reject" style={{ color: 'var(--vermilion)' }}>
                              <UserX size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* In-meeting participants */}
                <h4 className={styles.membersSectionTitle}>In Meeting</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div className={styles.memberCard}>
                    <div className={styles.memberMeta}>
                      <Avatar name={user.name} size={34} color="#0022FF" avatarUrl={user.avatar} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className={styles.memberName}>{user.name} <span style={{ color: '#6B7280', fontSize: '0.75rem' }}>(You)</span></div>
                        <span className={styles.memberRole}>{participantRole || 'PARTICIPANT'}</span>
                      </div>
                    </div>
                    <div className={styles.memberActions}>
                      {isAudioOn ? <Mic size={14} color="#10B981" /> : <MicOff size={14} color="#FF3311" />}
                      {isVideoOn ? <Video size={14} color="#10B981" /> : <VideoOff size={14} color="#FF3311" />}
                    </div>
                  </div>

                  {peers.map((peer, i) => (
                    <div key={peer.userId || peer.peerID || i} className={styles.memberCard}>
                      <div className={styles.memberMeta}>
                        <Avatar name={peer.name || `P${i + 1}`} size={34} color="#0A0A0A" avatarUrl={peer.avatar} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className={styles.memberName}>{peer.name || `Participant ${i + 1}`}</div>
                          <span className={styles.memberRole}>{peer.role || 'PARTICIPANT'}</span>
                        </div>
                      </div>
                      <div className={styles.memberActions}>
                        {(peer.isAudioOn ?? true) ? <Mic size={14} color="#10B981" /> : <MicOff size={14} color="#FF3311" />}
                        {(peer.isVideoOn ?? true) ? <Video size={14} color="#10B981" /> : <VideoOff size={14} color="#FF3311" />}

                        {isHost && peer.role !== 'HOST' && (
                          <button
                            onClick={() => handleToggleMeetingCoHost(peer.userId, peer.role === 'COHOST')}
                            title={peer.role === 'COHOST' ? 'Remove Co-Host' : 'Make Co-Host'}
                            className={styles.memberBtnIcon}
                          >
                            <Star size={14} fill={peer.role === 'COHOST' ? '#FF3311' : 'none'} color={peer.role === 'COHOST' ? '#FF3311' : '#6B7280'} />
                          </button>
                        )}
                        {((isHost && peer.role !== 'HOST') || (participantRole === 'COHOST' && peer.role === 'PARTICIPANT')) && (
                          <button
                            onClick={() => handleRemoveParticipant(peer.userId)}
                            title="Remove Participant"
                            className={styles.memberBtnIcon}
                            style={{ color: '#FF3311' }}
                          >
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
            <div style={{ background: 'var(--bb-surface-2)', border: '2px solid var(--bb-border)', boxShadow: '8px 8px 0 var(--bb-shadow)', borderRadius: '0', padding: '2rem', width: 600, maxWidth: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-grotesk)', color: 'var(--bb-text)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexShrink: 0 }}>
                <h2 style={{ margin: 0, color: 'var(--bb-text)', fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 400 }}>
                  ✨ Live Summary
                </h2>
                <button onClick={() => setSummaryModal(prev => ({ ...prev, isOpen: false }))} style={{ background: 'transparent', border: 'none', color: 'var(--bb-text)', cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', color: 'var(--bb-text)', fontSize: '1rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {summaryModal.loading ? (
                  <EditorialLoader
                    variant="inline"
                    title="Analyzing Live Transcript"
                    subtitle="Synthesizing speaker statements & action items in real time..."
                    tag="AI SYNTHESIS"
                  />
                ) : summaryModal.text}
              </div>
              <button onClick={() => setSummaryModal(prev => ({ ...prev, isOpen: false }))} style={{ width: '100%', marginTop: '1.5rem', padding: '0.8rem', background: 'var(--bb-cobalt)', color: '#FFFFFF', border: '2px solid var(--bb-border)', boxShadow: '4px 4px 0 var(--bb-shadow)', borderRadius: '0', fontFamily: 'var(--font-grotesk)', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* === SETTINGS MODAL === */}        {showLeaveModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setShowLeaveModal(false)}>
            <div style={{ background: 'var(--bb-surface-2)', border: '2px solid var(--bb-border)', borderRadius: '0', padding: 'clamp(1.5rem, 5vw, 3rem)', width: '100%', maxWidth: 440, boxSizing: 'border-box', fontFamily: 'var(--font-grotesk)', boxShadow: '8px 8px 0 var(--bb-shadow)', color: 'var(--bb-text)' }} onClick={(e) => e.stopPropagation()}>
              <h2 style={{ margin: '0 0 1rem 0', color: 'var(--bb-text)', fontSize: '1.8rem', fontWeight: 600, fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Leave Meeting</h2>
              <p style={{ margin: '0 0 2rem 0', color: 'var(--bb-text-muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>
                {isHost
                  ? 'You are the host. Do you want to end the meeting for everyone, or just leave?'
                  : 'You are a co-host. Do you want to end the meeting for everyone, or just leave?'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <button onClick={confirmEndMeeting} style={{ padding: '1rem', background: 'var(--bb-vermilion)', color: '#FFFFFF', border: '2px solid var(--bb-border)', fontWeight: 600, cursor: 'pointer', fontSize: '1rem', textTransform: 'uppercase', boxShadow: '4px 4px 0 var(--bb-shadow)' }}>
                  End Meeting for All
                </button>
                <button onClick={confirmLeaveMeeting} style={{ padding: '1rem', background: 'var(--bb-surface)', color: 'var(--bb-text)', border: '2px solid var(--bb-border)', fontWeight: 600, cursor: 'pointer', fontSize: '1rem', textTransform: 'uppercase', boxShadow: '4px 4px 0 var(--bb-shadow)' }}>
                  Just Leave
                </button>
                <button onClick={() => setShowLeaveModal(false)} style={{ padding: '0.75rem', background: 'transparent', color: 'var(--bb-text)', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'underline' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showSettings && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setShowSettings(false)}>
            <div style={{ background: 'var(--bb-surface-2)', border: '2px solid var(--bb-border)', borderRadius: '0', padding: 'clamp(1.5rem, 5vw, 3rem)', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', fontFamily: 'var(--font-grotesk)', boxShadow: '8px 8px 0 var(--bb-shadow)', color: 'var(--bb-text)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <h2 style={{ margin: 0, color: 'var(--bb-text)', fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 600, fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
                  <Settings size={20} color="var(--bb-text)" /> <span style={{ color: 'var(--bb-text)' }}>Settings</span>
                </h2>
                <button onClick={() => setShowSettings(false)} style={{ background: 'transparent', border: 'none', color: 'var(--bb-text)', cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
              </div>
  
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Microphone Live Level Monitor */}
                  <div style={{ padding: '0.85rem 1rem', background: 'var(--bb-surface)', border: '2px solid var(--bb-border)', boxShadow: '3px 3px 0 var(--bb-shadow)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Activity size={14} color="var(--bb-cobalt)" />
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--bb-text)', fontFamily: 'var(--font-mono)' }}>
                          Mic Input Level
                        </span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: isAudioOn ? '#10B981' : 'var(--bb-vermilion)' }}>
                        {isAudioOn ? `${activeMicVolume}%` : 'MUTED'}
                      </span>
                    </div>
                    <div className={styles.audioMeterTrack}>
                      <div className={styles.audioMeterFill} style={{ width: `${activeMicVolume}%` }} />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--bb-text)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <span><Globe size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} />My spoken language (mic)</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', color: 'var(--bb-text-muted)' }}>
                        <Lock size={11} /> Locked to Profile
                      </span>
                    </label>
                    <select
                      value={spokenLanguage}
                      disabled
                      title="Spoken language is locked to your profile language during a meeting"
                      style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bb-surface-3)', color: 'var(--bb-text-muted)', border: '2px solid var(--bb-border)', borderRadius: '0', fontSize: '0.9rem', outline: 'none', cursor: 'not-allowed' }}
                    >
                      {LANG_OPTIONS.map(l => <option key={l.value} value={l.value} style={{ background: 'var(--bb-surface-2)', color: 'var(--bb-text)' }}>{l.label}</option>)}
                    </select>
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: 'var(--bb-text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Matches your profile language and cannot be changed mid-meeting.
                    </p>
                  </div>
                  
                  {/* Speech to Speech */}
                  <div style={{ padding: '1.25rem', background: 'transparent', borderRadius: '0', borderBottom: '1px solid var(--bb-border-soft)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (user.ttsEnabled ?? true) ? '1rem' : '0' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, color: 'var(--bb-text)', fontSize: '0.9rem' }}>Speech-to-Speech</p>
                        <p style={{ margin: 0, color: 'var(--bb-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', marginTop: '0.2rem' }}>Read out audio translations</p>
                      </div>
                      <label style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer' }}>
                        <input type="checkbox" checked={user.ttsEnabled ?? true} onChange={e => updateUserSettings('ttsEnabled', e.target.checked)} style={{ display: 'none' }} />
                        <div style={{ width: 44, height: 24, borderRadius: '999px', background: (user.ttsEnabled ?? true) ? 'var(--bb-cobalt)' : 'var(--bb-border)', transition: 'background 0.2s', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 2, left: (user.ttsEnabled ?? true) ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                        </div>
                      </label>
                    </div>
                    {(user.ttsEnabled ?? true) && (
                      <select value={user.ttsLang || 'original'} onChange={e => updateUserSettings('ttsLang', e.target.value)} style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bb-surface)', color: 'var(--bb-text)', border: '1px solid var(--bb-border)', borderRadius: '0', fontSize: '0.9rem', outline: 'none' }}>
                        <option value="original" style={{ background: 'var(--bb-surface-2)', color: 'var(--bb-text)' }}>Original</option>
                        {LANG_OPTIONS.map(l => <option key={l.value} value={l.value} style={{ background: 'var(--bb-surface-2)', color: 'var(--bb-text)' }}>{l.label}</option>)}
                      </select>
                    )}
                  </div>
  
                  {/* Message Chat Translation */}
                  <div style={{ padding: '1.25rem', background: 'transparent', borderRadius: '0', borderBottom: '1px solid var(--bb-border-soft)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (user.chatEnabled ?? true) ? '1rem' : '0' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, color: 'var(--bb-text)', fontSize: '0.9rem' }}>Message Chat Translation</p>
                      </div>
                      <label style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer' }}>
                        <input type="checkbox" checked={user.chatEnabled ?? true} onChange={e => updateUserSettings('chatEnabled', e.target.checked)} style={{ display: 'none' }} />
                        <div style={{ width: 44, height: 24, borderRadius: '999px', background: (user.chatEnabled ?? true) ? 'var(--bb-cobalt)' : 'var(--bb-border)', transition: 'background 0.2s', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 2, left: (user.chatEnabled ?? true) ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                        </div>
                      </label>
                    </div>
                    {(user.chatEnabled ?? true) && (
                      <select value={user.chatLang || 'original'} onChange={e => updateUserSettings('chatLang', e.target.value)} style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bb-surface)', color: 'var(--bb-text)', border: '1px solid var(--bb-border)', borderRadius: '0', fontSize: '0.9rem', outline: 'none' }}>
                        <option value="original" style={{ background: 'var(--bb-surface-2)', color: 'var(--bb-text)' }}>Original</option>
                        {LANG_OPTIONS.map(l => <option key={l.value} value={l.value} style={{ background: 'var(--bb-surface-2)', color: 'var(--bb-text)' }}>{l.label}</option>)}
                      </select>
                    )}
                  </div>
  
                  {/* Speech to Caption */}
                  <div style={{ padding: '1.25rem', background: 'transparent', borderRadius: '0', borderBottom: '1px solid var(--bb-border-soft)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (user.captionEnabled ?? true) ? '1rem' : '0' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, color: 'var(--bb-text)', fontSize: '0.9rem' }}>Speech to Caption</p>
                      </div>
                      <label style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer' }}>
                        <input type="checkbox" checked={user.captionEnabled ?? true} onChange={e => updateUserSettings('captionEnabled', e.target.checked)} style={{ display: 'none' }} />
                        <div style={{ width: 44, height: 24, borderRadius: '999px', background: (user.captionEnabled ?? true) ? 'var(--bb-cobalt)' : 'var(--bb-border)', transition: 'background 0.2s', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 2, left: (user.captionEnabled ?? true) ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                        </div>
                      </label>
                    </div>
                    {(user.captionEnabled ?? true) && (
                      <select value={user.captionLang || 'original'} onChange={e => updateUserSettings('captionLang', e.target.value)} style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bb-surface)', color: 'var(--bb-text)', border: '1px solid var(--bb-border)', borderRadius: '0', fontSize: '0.9rem', outline: 'none' }}>
                        <option value="original" style={{ background: 'var(--bb-surface-2)', color: 'var(--bb-text)' }}>Original</option>
                        {LANG_OPTIONS.map(l => <option key={l.value} value={l.value} style={{ background: 'var(--bb-surface-2)', color: 'var(--bb-text)' }}>{l.label}</option>)}
                      </select>
                    )}
                  </div>
              </div>
  
              <button onClick={() => setShowSettings(false)} style={{ width: '100%', marginTop: '2rem', padding: '1rem', background: 'var(--bb-cobalt)', color: '#FFFFFF', border: '2px solid var(--bb-border)', boxShadow: '4px 4px 0 var(--bb-shadow)', borderRadius: '0', fontWeight: 600, cursor: 'pointer', fontSize: '1rem', fontFamily: 'var(--font-grotesk)' }}>
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
          <div style={{ background: 'var(--bb-surface-2)', padding: '3rem', borderRadius: '0', border: '2px solid var(--bb-border)', boxShadow: '8px 8px 0 var(--bb-shadow)', maxWidth: 380, width: '90%', textAlign: 'center', color: 'var(--bb-text)' }}>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--bb-text)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>{alertMessage}</p>
            <button onClick={() => setAlertMessage(null)} style={{ width: '100%', padding: '0.875rem', background: 'var(--bb-cobalt)', color: '#FFFFFF', border: 'none', borderRadius: '0', fontWeight: 700, cursor: 'pointer' }}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}





















