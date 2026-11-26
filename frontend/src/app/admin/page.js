'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '../../stores/authStore';
import api from '../../services/api';
import EditorialLoader from '../../components/EditorialLoader';

export default function AdminDashboard() {
  const { user, initialize } = useAuthStore();
  const router = useRouter();
  const [health, setHealth] = useState(null);
  const [orgUsers, setOrgUsers] = useState([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [alertMessage, setAlertMessage] = useState(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'PARTICIPANT' || user.role === 'HOST') {
      router.push('/dashboard');
      return;
    }

    const fetchAdminData = async () => {
      try {
        if (user.role === 'PLATFORM_ADMIN') {
          const resHealth = await api.get('/admin/platform/health');
          setHealth(resHealth.data);
        }
        
        const resUsers = await api.get('/admin/org/users');
        setOrgUsers(resUsers.data.users);
      } catch (error) {
        console.error('Failed to fetch admin data', error);
      }
    };

    fetchAdminData();
  }, [user, router]);

  const fetchUsers = async () => {
    try {
      const resUsers = await api.get('/admin/org/users');
      setOrgUsers(resUsers.data.users);
    } catch (error) {
      console.error('Failed to fetch org users', error);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUserEmail) return;
    try {
      await api.post('/admin/org/users', { email: newUserEmail });
      setNewUserEmail('');
      fetchUsers();
    } catch (err) {
      setAlertMessage(err.response?.data?.error || 'Failed to add user');
    }
  };

  const handleRemoveUser = async (userId) => {
    try {
      await api.delete(`/admin/org/users/${userId}`);
      fetchUsers();
    } catch (err) {
      setAlertMessage('Failed to remove user');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.patch(`/admin/org/users/${userId}/role`, { role: newRole });
      fetchUsers();
    } catch (err) {
      setAlertMessage('Failed to change role');
    }
  };

  if (!mounted || !user) {
    return (
      <EditorialLoader
        title="Directory Access"
        subtitle="Authenticating organization administrator credentials..."
        tag="ADMIN CONSOLE"
      />
    );
  }
  if (user.role !== 'ORG_ADMIN' && user.role !== 'PLATFORM_ADMIN') return null;

  return (
    <div style={{ backgroundColor: 'var(--bb-bg)', minHeight: '100vh', width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden', padding: 'clamp(1rem, 3vw, 2rem)', fontFamily: 'var(--font-grotesk, sans-serif)', color: 'var(--bb-text)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <header style={{ borderBottom: '2px solid var(--bb-border)', paddingBottom: '2rem', marginBottom: '4rem' }}>
          <h1 style={{ fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic', fontSize: '2rem', margin: 0, fontWeight: 'normal', color: 'var(--bb-cobalt)' }}>BhashaBridge Directory</h1>
          <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem', marginTop: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--bb-text-muted)' }}>
            OPERATOR: {user.name} // ACCESS_LEVEL: {user.role}
          </p>
        </header>

        {user.role === 'PLATFORM_ADMIN' && health && (
          <section style={{ marginBottom: '4rem', borderBottom: '1px solid var(--bb-border)', paddingBottom: '4rem' }}>
            <h2 style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1rem', textTransform: 'uppercase', marginBottom: '2rem' }}>[ SYSTEM STATUS ]</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
              <div style={{ borderLeft: '1px solid var(--bb-border)', paddingLeft: '1rem' }}>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--bb-cobalt)' }}>Status</div>
                <div style={{ fontSize: '2rem' }}>{health.status}</div>
              </div>
              <div style={{ borderLeft: '1px solid var(--bb-border)', paddingLeft: '1rem' }}>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--bb-cobalt)' }}>Active Nodes</div>
                <div style={{ fontSize: '2rem' }}>{health.activeMeetings}</div>
              </div>
              <div style={{ borderLeft: '1px solid var(--bb-border)', paddingLeft: '1rem' }}>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--bb-cobalt)' }}>Uptime</div>
                <div style={{ fontSize: '2rem' }}>{health.uptime}s</div>
              </div>
            </div>
          </section>
        )}

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--bb-border)' }}>
            <h2 style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1rem', textTransform: 'uppercase', margin: 0 }}>[ ORGANIZATION INDEX ]</h2>
            <form onSubmit={handleAddUser} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxWidth: '100%' }}>
              <input 
                type="email" 
                placeholder="PROSPECT_EMAIL" 
                value={newUserEmail} 
                onChange={(e) => setNewUserEmail(e.target.value)} 
                style={{ fontFamily: 'var(--font-mono, monospace)', padding: '0.5rem', border: '1px solid var(--bb-border)', background: 'var(--bb-surface)', color: 'var(--bb-text)', outline: 'none', width: '100%' }}
              />
              <button type="submit" style={{ fontFamily: 'var(--font-mono, monospace)', padding: '0.5rem 1rem', background: 'var(--bb-cobalt)', color: '#FFFFFF', border: '1px solid var(--bb-border)', cursor: 'pointer', textTransform: 'uppercase' }}>
                Induct
              </button>
            </form>
          </div>

          {orgUsers.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic', fontSize: '1.2rem', color: 'var(--bb-text-muted)' }}>The registry is currently vacant.</p>
          ) : (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}><div style={{ display: 'flex', flexDirection: 'column', minWidth: '540px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--bb-border)', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                <div>Identifier</div>
                <div>Contact Route</div>
                <div>Clearance</div>
                <div style={{ textAlign: 'right' }}>Directives</div>
              </div>
              {orgUsers.map(u => (
                <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr', gap: '1rem', padding: '1rem 0', borderBottom: '1px solid var(--bb-border-soft)', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic', fontSize: '1.2rem' }}>{u.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.9rem' }}>{u.email}</div>
                  <div>
                    <select 
                      value={u.role} 
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      style={{ fontFamily: 'var(--font-mono, monospace)', padding: '0.25rem', background: 'var(--bb-surface)', color: 'var(--bb-text)', border: '1px solid var(--bb-border)', cursor: 'pointer', textTransform: 'uppercase' }}
                    >
                      <option value="PARTICIPANT">PARTICIPANT</option>
                      <option value="HOST">HOST</option>
                      <option value="ORG_ADMIN">ORG_ADMIN</option>
                    </select>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <button 
                      onClick={() => handleRemoveUser(u.id)}
                      style={{ fontFamily: 'var(--font-mono, monospace)', background: 'transparent', color: 'var(--bb-vermilion)', border: '1px solid var(--bb-vermilion)', padding: '0.25rem 0.5rem', cursor: 'pointer', textTransform: 'uppercase', fontSize: '0.8rem' }}
                    >
                      Expel
                    </button>
                  </div>
                </div>
              ))}</div></div>)}
        </section>

        <div style={{ marginTop: '4rem' }}>
          <button onClick={() => router.push('/dashboard')} style={{ fontFamily: 'var(--font-mono, monospace)', padding: '0.5rem 1rem', background: 'var(--bb-surface)', border: '1px solid var(--bb-border)', color: 'var(--bb-text)', cursor: 'pointer', textTransform: 'uppercase' }}>
            Return to Dashboard
          </button>
        </div>

        {alertMessage && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
          }}>
            <div style={{
              background: 'var(--bb-surface-2)', color: 'var(--bb-text)', border: '2px solid var(--bb-border)', boxShadow: '6px 6px 0 var(--bb-shadow)', padding: '3rem', maxWidth: '500px', width: '90%', textAlign: 'center'
            }}>
              <h3 style={{ fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', margin: '0 0 1rem', color: 'var(--bb-vermilion)' }}>[ EXCEPTION ]</h3>
              <p style={{ fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic', fontSize: '1.2rem', margin: '0 0 2rem' }}>
                {alertMessage}
              </p>
              <button 
                onClick={() => setAlertMessage(null)}
                style={{
                  padding: '0.5rem 2rem', background: 'var(--bb-cobalt)', color: '#FFFFFF', border: '1px solid var(--bb-border)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', cursor: 'pointer'
                }}
              >
                Acknowledge
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
