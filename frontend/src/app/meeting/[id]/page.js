'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Send, MessageSquare } from 'lucide-react';
import useAuthStore from '../../../stores/authStore';
import styles from './meeting.module.css';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

export default function MeetingRoom() {
  const params = useParams();
  const { id: meetingId } = params;
  const router = useRouter();
  const { user } = useAuthStore();

  const [socket, setSocket] = useState(null);
  const [peers, setPeers] = useState([]);
  const [sidebarTab, setSidebarTab] = useState('CHAT'); // 'CHAT' or 'MEMBERS'
  const [showSettings, setShowSettings] = useState(false);
  const [alertMessage, setAlertMessage] = useState(null);
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
  const ttsEnabledRef = useRef(true);

  const userVideo = useRef();
  const peersRef = useRef([]);
  const socketInitialized = useRef(false);

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };

  const createPeer = (userToSignal, callerID, stream, currentSocket) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
      config: iceServers
    });

    peer.on('signal', signal => {
      currentSocket.emit('audio:signal', {
        targetSocketId: userToSignal,
        callerId: callerID,
        signal,
      });
    });

    return peer;
  };

  const addPeer = (incomingSignal, callerID, stream, currentSocket) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
      config: iceServers
    });

    peer.on('signal', signal => {
      currentSocket.emit('audio:signal', { signal, targetSocketId: callerID, callerId: currentSocket.id });
    });

    peer.signal(incomingSignal);
    return peer;
  };

  useEffect(() => {
    if (!user) return;
    if (socketInitialized.current) return; // prevent double-init from StrictMode / HMR
    socketInitialized.current = true;

    let newSocket;

    const initializeMeeting = async () => {
      try {
        // Authenticate and join via REST API first
        const token = localStorage.getItem('token');
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/meetings/join/${meetingId}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
          throw new Error('Meeting ended, not found, or unauthorized');
        }
        
        const data = await res.json();
        setParticipantStatus(data.participantStatus);
        setParticipantRole(data.participantRole);

        let currentStream;
        try {
          currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (mediaErr) {
          console.warn('Camera/mic not available, falling back to audio only or dummy stream', mediaErr);
          try {
            currentStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            setIsVideoOn(false);
          } catch (audioErr) {
            console.warn('No media devices available', audioErr);
            // Create dummy stream
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();
            currentStream = ctx.createMediaStreamDestination().stream;
            setIsVideoOn(false);
            setIsAudioOn(false);
          }
        }
        
        setStream(currentStream);
        if (userVideo.current && currentStream) {
          userVideo.current.srcObject = currentStream;
        }

        newSocket = io(SOCKET_URL);
        setSocket(newSocket);

        newSocket.emit('meeting:join', { meetingId, userId: user.id, peerId: newSocket.id, language: user.language });

        newSocket.on('waiting:request', ({ userId, name }) => {
          setWaitingUsers(prev => [...prev, { userId, name }]);
        });

        newSocket.on('waiting:admitted', ({ userId }) => {
          if (userId === user.id) {
            setParticipantStatus('ADMITTED');
            // Re-emit join to trigger participant:joined broadcast from server
            newSocket.emit('meeting:join', { meetingId, userId: user.id, peerId: newSocket.id, language: user.language });
          } else {
            setWaitingUsers(prev => prev.filter(u => u.userId !== userId));
          }
        });

        newSocket.on('waiting:rejected', ({ userId }) => {
          if (userId === user.id) {
            setParticipantStatus('REJECTED');
          } else {
            setWaitingUsers(prev => prev.filter(u => u.userId !== userId));
          }
        });

        newSocket.on('participant:joined', ({ userId, socketId }) => {
          const peer = createPeer(socketId, newSocket.id, currentStream, newSocket);
          peersRef.current.push({
            peerID: socketId,
            userId,
            peer,
          });
          setPeers([...peersRef.current]);
        });

        newSocket.on('participant:left', ({ socketId }) => {
          const peerObj = peersRef.current.find(p => p.peerID === socketId);
          if (peerObj) {
            peerObj.peer.destroy();
          }
          const newPeers = peersRef.current.filter(p => p.peerID !== socketId);
          peersRef.current = newPeers;
          setPeers([...newPeers]);
        });

        newSocket.on('audio:signal', payload => {
          const item = peersRef.current.find(p => p.peerID === payload.callerId);
          if (item) {
            item.peer.signal(payload.signal);
          } else {
            const peer = addPeer(payload.signal, payload.callerId, currentStream, newSocket);
            peersRef.current.push({
              peerID: payload.callerId,
              peer,
            });
            setPeers([...peersRef.current]);
          }
        });

        newSocket.on('chat:message', (message) => {
          setMessages((prev) => [...prev, message]);
        });

        newSocket.on('chat:translated', (translatedMsg) => {
          setMessages((prev) => prev.map(m => {
            if (m.id === translatedMsg.messageId) {
              return { ...m, translatedText: translatedMsg.translations[user.language] };
            }
            return m;
          }));
        });

        newSocket.on('caption:text', (data) => {
          if (data.language === user.language) {
            setCurrentCaption(data.text);
            setTimeout(() => setCurrentCaption(null), 4000);
          }
        });

        newSocket.on('caption:translated', (data) => {
          if (data.translations[user.language]) {
            setCurrentCaption(data.translations[user.language]);
            
            if (window.speechSynthesis && ttsEnabledRef.current) {
              const utterance = new SpeechSynthesisUtterance(data.translations[user.language]);
              utterance.lang = user.language;
              window.speechSynthesis.speak(utterance);
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

    return () => {
      if (newSocket) newSocket.disconnect();
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [user, meetingId]);

  // Setup Web Speech API for free local speech-to-text
  useEffect(() => {
    if (!socket || !user || !isAudioOn) return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = user.language;
    recognition.lang = spokenLanguage;

    let isStopped = false;

    recognition.onresult = (event) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript;
      }
      if (currentTranscript.trim()) {
        socket.emit('caption:text', {
          meetingId,
          speakerId: user.id,
          text: currentTranscript.trim(),
          language: spokenLanguage
        });
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        // Ignore no-speech, it's expected if user is silent
        return;
      }
      console.warn('Speech recognition error:', event.error);
    };

    recognition.onend = () => {
      if (!isStopped && isAudioOn) {
        try {
          recognition.start();
        } catch (e) {}
      }
    };

    try {
      recognition.start();
    } catch (e) {
      // already started
    }

    return () => {
      isStopped = true;
      recognition.stop();
    };
  }, [socket, user, isAudioOn, meetingId]);



  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks()[0].enabled = !isVideoOn;
      setIsVideoOn(!isVideoOn);
    }
  };

  const toggleAudio = () => {
    if (stream) {
      stream.getAudioTracks()[0].enabled = !isAudioOn;
      setIsAudioOn(!isAudioOn);
    }
  };

  const leaveMeeting = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/meetings/${meetingId}/end`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
    } catch(err) { console.error(err); }
    router.push(`/meeting/${meetingId}/report`);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;

    const msg = {
      id: Date.now().toString(),
      meetingId,
      senderId: user.id,
      senderName: user.name,
      text: chatInput,
      language: user.language
    };

    socket.emit('chat:message', msg);
    setChatInput('');
  };

  // Simulate sending voice captions (since Speech API isn't connected yet)
  const simulateCaption = () => {
    if (!socket) return;
    socket.emit('caption:text', {
      meetingId,
      speakerId: user.id,
      text: "This is a simulated speech-to-text caption.",
      language: user.language
    });
  };

  const handleAdmit = async (targetUserId) => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/meetings/${meetingId}/admit`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId })
      });
      socket.emit('meeting:admit', { meetingId, targetUserId });
    } catch (err) { console.error('Failed to admit', err); }
  };

  const handleReject = async (targetUserId) => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/meetings/${meetingId}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId })
      });
      socket.emit('meeting:reject', { meetingId, targetUserId });
    } catch (err) { console.error('Failed to reject', err); }
  };

  const handleMakeCoHost = async (targetUserId) => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/meetings/${meetingId}/cohost`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId })
      });
      setAlertMessage('Promoted to Co-Host');
    } catch (err) { console.error(err); }
  };

  const handleRemoveCoHost = async (targetUserId) => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/meetings/${meetingId}/cohost/${targetUserId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      setAlertMessage('Removed Co-Host permissions');
    } catch (err) { console.error(err); }
  };


  if (!user) return null;

  if (participantStatus === 'REJECTED') {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: '#0f172a' }}>
        <h1 style={{ color: '#ef4444' }}>You have been rejected from this meeting.</h1>
        <button onClick={() => router.push('/dashboard')} className={styles.btnPrimary} style={{ marginTop: '1rem' }}>Back to Dashboard</button>
      </div>
    );
  }

  if (participantStatus === 'WAITING') {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: '#0f172a' }}>
        <div style={{ width: 400, height: 300, background: '#000', borderRadius: 8, overflow: 'hidden', position: 'relative', marginBottom: '2rem' }}>
          <video playsInline muted ref={userVideo} autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '1rem' }}>
            <button onClick={toggleAudio} style={{ background: isAudioOn ? 'rgba(0,0,0,0.5)' : '#ef4444', border: 'none', padding: '10px', borderRadius: '50%', color: '#fff', cursor: 'pointer' }}>
              {isAudioOn ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button onClick={toggleVideo} style={{ background: isVideoOn ? 'rgba(0,0,0,0.5)' : '#ef4444', border: 'none', padding: '10px', borderRadius: '50%', color: '#fff', cursor: 'pointer' }}>
              {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
          </div>
        </div>
        <h2 style={{ color: '#f8fafc', marginBottom: '0.5rem' }}>Waiting for the host to admit you...</h2>
        <p style={{ color: '#9ca3af' }}>You will automatically join when admitted.</p>
        <button onClick={() => router.push('/dashboard')} className={styles.btnSecondary} style={{ marginTop: '2rem' }}>Leave Waiting Room</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.title}>
          Meeting Room <span className={styles.meetingCode}>{meetingId}</span>
        </div>
        <button onClick={simulateCaption} className={styles.btnSecondary} style={{padding:'4px 8px'}}>
          Simulate Speech
        </button>
        <div style={{display: 'flex', gap: '0.5rem'}}>
          <button onClick={() => setShowSettings(true)} className={styles.btnSecondary} style={{padding:'4px 8px'}}>
            Settings
          </button>
          <button onClick={simulateCaption} className={styles.btnSecondary} style={{padding:'4px 8px'}}>
            Simulate Speech
          </button>
        </div>
      </header>

      {showSettings && (
        <div style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{background: 'var(--secondary)', padding: '2rem', borderRadius: '8px', width: '400px'}}>
            <h2>Settings</h2>
            
            <div style={{marginTop: '1rem'}}>
              <label style={{display: 'block', marginBottom: '0.5rem'}}>Translation Language</label>
              <label style={{display: 'block', marginBottom: '0.5rem'}}>I am speaking in (Microphone)</label>
              <select 
                value={spokenLanguage}
                onChange={(e) => {
                  setSpokenLanguage(e.target.value);
                  setAlertMessage('Microphone language updated to: ' + e.target.value);
                }}
                style={{width: '100%', padding: '0.5rem', background: '#1f2937', color: 'white', border: '1px solid #374151', borderRadius: '4px'}}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="hi">Hindi</option>
                <option value="zh">Chinese</option>
              </select>
            </div>

            <div style={{marginTop: '1rem'}}>
              <label style={{display: 'block', marginBottom: '0.5rem'}}>Translate Everything To (Subtitles & Audio)</label>
              <select 
                value={user.language}
                onChange={(e) => {
                  const newLang = e.target.value;
                  useAuthStore.setState({ user: { ...user, language: newLang } });
                  if (user) {
                    useAuthStore.getState().user.language = newLang; // Optimistic update
                    setAlertMessage('Translation language updated to: ' + newLang);
                  }
                  setShowSettings(false);
                }}
                style={{width: '100%', padding: '0.5rem', background: '#1f2937', color: 'white', border: '1px solid #374151', borderRadius: '4px'}}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="hi">Hindi</option>
                <option value="zh">Chinese</option>
              </select>
            </div>
            
            <div style={{marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <input 
                type="checkbox" 
                checked={isTtsEnabled} 
                onChange={(e) => {
                  setIsTtsEnabled(e.target.checked);
                  ttsEnabledRef.current = e.target.checked;
                }}
                id="ttsToggle"
              />
              <label htmlFor="ttsToggle">Read Translations Out Loud (Text-to-Speech)</label>
            </div>

            <button onClick={() => setShowSettings(false)} className={styles.btnSecondary} style={{marginTop: '2rem', width: '100%', padding: '0.5rem'}}>
              Close
            </button>
          </div>
        </div>
      )}

      <main className={styles.main}>
        <div className={styles.videoSection}>
          <div className={styles.videoGrid}>
            <div className={styles.videoTile}>
              <video muted ref={userVideo} autoPlay playsInline className={styles.video} />
              <div className={styles.userName}>{user.name} (You)</div>
            </div>
            {peers.map((peer, index) => {
              return (
                <VideoPeer key={index} peer={peer.peer} />
              );
            })}
          </div>

          {currentCaption && (
            <div className={styles.captionsOverlay}>
              <div className={styles.captionText}>{currentCaption}</div>
            </div>
          )}

          <div className={styles.controls}>
            <button onClick={toggleAudio} className={styles.controlBtn}>
              {isAudioOn ? <Mic size={20} /> : <MicOff size={20} color="#ef4444" />}
            </button>
            <button onClick={toggleVideo} className={styles.controlBtn}>
              {isVideoOn ? <Video size={20} /> : <VideoOff size={20} color="#ef4444" />}
            </button>
            <button onClick={() => setSidebarTab(sidebarTab === 'CHAT' ? 'MEMBERS' : 'CHAT')} className={styles.controlBtn}>
              <MessageSquare size={20} />
            </button>
            <button onClick={leaveMeeting} className={`${styles.controlBtn} ${styles.danger}`}>
              <PhoneOff size={20} />
            </button>
          </div>
        </div>

        <aside className={styles.chatSection}>
          <div className={styles.sidebarTabs} style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            <button 
              onClick={() => setSidebarTab('CHAT')}
              style={{ flex: 1, padding: '1rem', background: 'none', border: 'none', color: sidebarTab === 'CHAT' ? '#60a5fa' : 'white', cursor: 'pointer', borderBottom: sidebarTab === 'CHAT' ? '2px solid #60a5fa' : 'none' }}
            >
              Chat
            </button>
            <button 
              onClick={() => setSidebarTab('MEMBERS')}
              style={{ flex: 1, padding: '1rem', background: 'none', border: 'none', color: sidebarTab === 'MEMBERS' ? '#60a5fa' : 'white', cursor: 'pointer', borderBottom: sidebarTab === 'MEMBERS' ? '2px solid #60a5fa' : 'none' }}
            >
              Members ({peers.length + 1})
            </button>
          </div>

          {sidebarTab === 'CHAT' ? (
            <>
              <div className={styles.chatMessages}>
                {messages.map((m, i) => (
                  <div key={i} className={`${styles.message} ${m.senderId === user.id ? styles.self : ''}`}>
                    <div className={styles.messageContent}>
                      <div className={styles.messageHeader}>
                        <span>{m.senderName}</span>
                      </div>
                      <div>{m.text}</div>
                      {m.translatedText && m.senderId !== user.id && (
                        <div className={styles.translatedText}>
                          {m.translatedText}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={sendMessage} className={styles.chatInputArea}>
                <input 
                  type="text" 
                  className={styles.chatInput}
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                />
                <button type="submit" className={styles.sendBtn}><Send size={18} /></button>
              </form>
            </>
          ) : (
            <div className={styles.membersList} style={{ padding: '1rem', overflowY: 'auto' }}>
              {(participantRole === 'HOST' || participantRole === 'COHOST') && waitingUsers.length > 0 && (
                <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <h4 style={{ margin: '0 0 1rem', color: '#f8fafc' }}>Waiting Room ({waitingUsers.length})</h4>
                  {waitingUsers.map((w, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <span>{w.name}</span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => handleAdmit(w.userId)} style={{ background: '#10b981', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>Admit</button>
                        <button onClick={() => handleReject(w.userId)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <h4 style={{ margin: '0 0 1rem', color: '#9ca3af', fontSize: '0.85rem', textTransform: 'uppercase' }}>In Meeting</h4>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {user.name.charAt(0)}
                </div>
                <div>
                  <div>{user.name} (You)</div>
                  <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{participantRole}</div>
                </div>
              </div>
              
              {peers.map((peer, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#4b5563', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    P
                  </div>
                  <div>
                    <div>Participant {i + 1}</div>
                    <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Connected</div>
                  </div>
                  {participantRole === 'HOST' && peer.userId && (
                    <div style={{ marginLeft: 'auto' }}>
                      <button onClick={() => handleMakeCoHost(peer.userId)} style={{ background: '#3b82f6', border: 'none', color: 'white', padding: '2px 6px', fontSize: '0.7rem', borderRadius: 4, cursor: 'pointer', marginRight: 4 }}>Make Co-Host</button>
                      <button onClick={() => handleRemoveCoHost(peer.userId)} style={{ background: '#4b5563', border: 'none', color: 'white', padding: '2px 6px', fontSize: '0.7rem', borderRadius: 4, cursor: 'pointer' }}>Remove</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </main>
      
      {/* Alert Modal */}
      {alertMessage && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div className="glass" style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))',
            padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(96, 165, 250, 0.2)',
            maxWidth: '400px', width: '90%', textAlign: 'center', animation: 'scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }}>
            <h3 style={{ margin: '0 0 1rem', color: '#f8fafc', fontSize: '1.25rem' }}>Notification</h3>
            <p style={{ margin: '0 0 1.5rem', color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.5 }}>
              {alertMessage}
            </p>
            <button 
              onClick={() => setAlertMessage(null)}
              style={{
                width: '100%', padding: '0.875rem', background: '#3b82f6',
                color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 600,
                cursor: 'pointer', transition: 'transform 0.1s'
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const VideoPeer = ({ peer }) => {
  const ref = useRef();

  useEffect(() => {
    peer.on('stream', stream => {
      ref.current.srcObject = stream;
    });
  }, [peer]);

  return (
    <div className={styles.videoTile}>
      <video playsInline autoPlay ref={ref} className={styles.video} />
      <div className={styles.userName}>Participant</div>
    </div>
  );
};
