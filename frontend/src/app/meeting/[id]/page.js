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
  const [stream, setStream] = useState(null);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [currentCaption, setCurrentCaption] = useState(null);

  const userVideo = useRef();
  const peersRef = useRef([]);

  useEffect(() => {
    if (!user) return;

    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
      setStream(currentStream);
      if (userVideo.current) {
        userVideo.current.srcObject = currentStream;
      }

      newSocket.emit('meeting:join', { meetingId, userId: user.id, peerId: newSocket.id, language: user.language });

      newSocket.on('participant:joined', ({ userId, socketId }) => {
        const peer = createPeer(socketId, newSocket.id, currentStream, newSocket);
        peersRef.current.push({
          peerID: socketId,
          peer,
        });
        setPeers([...peersRef.current]);
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
        // Find message and update with translation
        setMessages((prev) => prev.map(m => {
          if (m.id === translatedMsg.messageId) {
            return { ...m, translatedText: translatedMsg.translations[user.language] };
          }
          return m;
        }));
      });

      newSocket.on('caption:text', (data) => {
        // Display caption for a short time if it's in our language
        if (data.language === user.language) {
          setCurrentCaption(data.text);
          setTimeout(() => setCurrentCaption(null), 4000);
        }
      });

      newSocket.on('caption:translated', (data) => {
        if (data.translations[user.language]) {
          setCurrentCaption(data.translations[user.language]);
          setTimeout(() => setCurrentCaption(null), 4000);
        }
      });
    });

    return () => {
      newSocket.disconnect();
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

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript.trim()) {
        socket.emit('caption:text', {
          meetingId,
          speakerId: user.id,
          text: finalTranscript.trim(),
          language: user.language
        });
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
    };

    try {
      recognition.start();
    } catch (e) {
      // already started
    }

    return () => {
      recognition.stop();
    };
  }, [socket, user, isAudioOn, meetingId]);

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };

  function createPeer(userToSignal, callerID, stream, currentSocket) {
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
  }

  function addPeer(incomingSignal, callerID, stream, currentSocket) {
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
  }

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

  const leaveMeeting = () => {
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

  if (!user) return null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.title}>
          Meeting Room <span className={styles.meetingCode}>{meetingId}</span>
        </div>
        <button onClick={simulateCaption} className={styles.btnSecondary} style={{padding:'4px 8px'}}>
          Simulate Speech
        </button>
      </header>

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
            <button onClick={leaveMeeting} className={`${styles.controlBtn} ${styles.danger}`}>
              <PhoneOff size={20} />
            </button>
          </div>
        </div>

        <aside className={styles.chatSection}>
          <div className={styles.chatHeader}>
            <MessageSquare size={18} /> Chat & Translation
          </div>
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
        </aside>
      </main>
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
