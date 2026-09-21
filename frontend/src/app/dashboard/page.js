'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PlusCircle, Video, Link as LinkIcon } from 'lucide-react';
import useAuthStore from '../../stores/authStore';
import api from '../../services/api';
import styles from './dashboard.module.css';

export default function Dashboard() {
  const { user, initialize, logout } = useAuthStore();
  const router = useRouter();
  const [meetings, setMeetings] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [joinLink, setJoinLink] = useState('');

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!user) {
      // Small timeout to allow initialize to finish
      const t = setTimeout(() => {
        if (!useAuthStore.getState().user) router.push('/login');
      }, 500);
      return () => clearTimeout(t);
    } else {
      fetchMeetings();
    }
  }, [user, router]);

  const fetchMeetings = async () => {
    try {
      const res = await api.get('/meetings');
      setMeetings(res.data.meetings);
    } catch (error) {
      console.error('Failed to fetch meetings', error);
    }
  };

  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const res = await api.post('/meetings', { title: newTitle });
      setNewTitle('');
      fetchMeetings();
      // Auto-join meeting room
      router.push(`/meeting/${res.data.meeting.meetingLink}`);
    } catch (error) {
      console.error('Create meeting error', error);
    }
  };

  const handleJoinMeeting = (e) => {
    e.preventDefault();
    if (!joinLink.trim()) return;
    router.push(`/meeting/${joinLink}`);
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const [activeTab, setActiveTab] = useState('upcoming'); // upcoming, history
  
  if (!user) return null;

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <div className={styles.userInfo}>
          <span className={styles.userName}>{user.name} ({user.language})</span>
          {(user.role === 'ORG_ADMIN' || user.role === 'PLATFORM_ADMIN') && (
            <Link href="/admin" style={{marginRight: '1rem', textDecoration: 'underline'}}>Admin Panel</Link>
          )}
          <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
        </div>
      </header>

      <div className={styles.grid}>
        <div className={styles.leftCol}>
          <div className={`${styles.card} glass`} style={{ marginBottom: '2rem' }}>
            <h2 className={styles.cardTitle}><PlusCircle size={20} /> New Meeting</h2>
            <form onSubmit={handleCreateMeeting}>
              <input 
                type="text" 
                placeholder="Meeting Title" 
                className={styles.input}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <button type="submit" className={styles.btnPrimary}>Start Meeting</button>
            </form>
          </div>

          <div className={`${styles.card} glass`}>
            <h2 className={styles.cardTitle}><LinkIcon size={20} /> Join by Code</h2>
            <form onSubmit={handleJoinMeeting}>
              <input 
                type="text" 
                placeholder="Meeting Link / Code" 
                className={styles.input}
                value={joinLink}
                onChange={(e) => setJoinLink(e.target.value)}
              />
              <button type="submit" className={styles.btnPrimary}>Join Meeting</button>
            </form>
          </div>
        </div>

        <div className={styles.rightCol}>
          <div className={`${styles.card} glass`} style={{ minHeight: '100%' }}>
            
            <div style={{display: 'flex', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem'}}>
              <h2 
                className={styles.cardTitle} 
                style={{cursor: 'pointer', opacity: activeTab === 'upcoming' ? 1 : 0.5, marginBottom: 0}}
                onClick={() => setActiveTab('upcoming')}
              >
                <Video size={20} style={{verticalAlign: 'middle', marginRight: '8px'}} />
                Upcoming & Ongoing
              </h2>
              <h2 
                className={styles.cardTitle} 
                style={{cursor: 'pointer', opacity: activeTab === 'history' ? 1 : 0.5, marginBottom: 0}}
                onClick={() => setActiveTab('history')}
              >
                Meeting History & Analytics
              </h2>
            </div>

            {meetings.length === 0 ? (
              <div className={styles.emptyState}>No meetings found. Create one to get started!</div>
            ) : (
              <div className={styles.meetingList}>
                {meetings.filter(m => activeTab === 'upcoming' ? !m.analytics : m.analytics).map((m) => (
                  <div key={m.id} className={styles.meetingItem} style={{flexDirection: 'column', alignItems: 'stretch'}}>
                    
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <div className={styles.meetingInfo}>
                        <h4>{m.title}</h4>
                        <p>Code: {m.meetingLink} • Host: {m.hostId === user.id ? 'You' : m.host.name}</p>
                        <p style={{fontSize: '0.8rem', color: '#9ca3af'}}>Created: {new Date(m.createdAt).toLocaleString()}</p>
                      </div>
                      <Link href={`/meeting/${m.meetingLink}`} className={styles.btnJoin}>
                        {activeTab === 'upcoming' ? 'Join' : 'Join Again'}
                      </Link>
                    </div>

                    {activeTab === 'history' && (
                      <div style={{marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)'}}>
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
                          <div>
                            <h5 style={{color: '#a78bfa', marginBottom: '0.5rem'}}>Analytics</h5>
                            <p style={{fontSize: '0.9rem'}}><strong>Duration:</strong> {m.analytics?.totalDurationSeconds}s</p>
                            <p style={{fontSize: '0.9rem'}}><strong>Languages:</strong> {m.analytics?.languagesUsed?.join(', ') || 'N/A'}</p>
                            <p style={{fontSize: '0.9rem'}}><strong>Total Participants:</strong> {m.analytics?.totalParticipants}</p>
                            <Link href={`/meeting/${m.meetingLink}/report`} style={{color: '#60a5fa', fontSize: '0.9rem', textDecoration: 'underline'}}>View Full Report</Link>
                          </div>
                          <div>
                            <h5 style={{color: '#a78bfa', marginBottom: '0.5rem'}}>Detailed Attendance Log</h5>
                            <div style={{maxHeight: '150px', overflowY: 'auto', fontSize: '0.9rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px'}}>
                              {m.participants.map(p => (
                                <div key={p.id} style={{marginBottom: '0.5rem'}}>
                                  <strong>{p.user.name} ({p.role})</strong>
                                  <ul style={{paddingLeft: '1.2rem', margin: '0.2rem 0', color: '#cbd5e1'}}>
                                    {p.sessions && p.sessions.length > 0 ? (
                                      p.sessions.map(s => (
                                        <li key={s.id}>
                                          Joined {new Date(s.joinedAt).toLocaleTimeString()} 
                                          {s.leftAt ? ` - Left ${new Date(s.leftAt).toLocaleTimeString()}` : ' - Still active'}
                                        </li>
                                      ))
                                    ) : (
                                      <li>Joined {new Date(p.joinTime).toLocaleTimeString()}</li>
                                    )}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {meetings.filter(m => activeTab === 'upcoming' ? !m.analytics : m.analytics).length === 0 && (
                  <div className={styles.emptyState}>No {activeTab} meetings found.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
