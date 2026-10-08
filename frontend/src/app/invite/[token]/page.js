'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import api from '../../../services/api';
import useAuthStore from '../../../stores/authStore';

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params?.token;
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { user, initialize } = useAuthStore();

  useEffect(() => {
    setMounted(true);
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!token) return;
    const fetchInvite = async () => {
      try {
        const res = await api.get(`/organizations/invite/${token}`);
        setInvite(res.data.invitation);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load invitation');
      } finally {
        setLoading(false);
      }
    };
    fetchInvite();
  }, [token]);

  const handleAccept = async () => {
    if (!user) {
      router.push(`/login?redirect=/invite/${token}`);
      return;
    }
    
    setAccepting(true);
    try {
      await api.post(`/organizations/invite/${token}/accept`);
      router.push('/dashboard?joined=true');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  if (!mounted || loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-ivory, #FAF9F6)' }}>
        <p style={{ fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase' }}>[ RETRIEVING DOSSIER ]</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-ivory, #FAF9F6)', padding: '2rem', color: '#000', fontFamily: 'var(--font-grotesk, sans-serif)' }}>
      <div style={{ maxWidth: '600px', width: '100%', textAlign: 'center' }}>
        {error ? (
          <>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--vermilion, #E34234)', fontSize: '1rem', textTransform: 'uppercase', marginBottom: '2rem' }}>[ FATAL ANOMALY ]</div>
            <h2 style={{ fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic', fontSize: '2.5rem', fontWeight: 'normal', margin: '0 0 1rem' }}>Entry Denied</h2>
            <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.9rem', marginBottom: '3rem' }}>{error}</p>
            <button onClick={() => router.push('/')} style={{ fontFamily: 'var(--font-mono, monospace)', background: 'transparent', color: '#000', padding: '0.75rem 2rem', border: '1px solid #000', cursor: 'pointer', textTransform: 'uppercase' }}>
              Abandon Attempt
            </button>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--cobalt, #0047AB)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>BhashaBridge Summons</div>
            <h1 style={{ fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic', fontSize: '3rem', fontWeight: 'normal', lineHeight: 1.2, margin: '0 0 2rem' }}>
              An invocation to commune.
            </h1>
            
            <div style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '2rem 0', marginBottom: '3rem' }}>
              <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem', margin: '0 0 1rem', textTransform: 'uppercase' }}>
                Initiator: <span style={{ color: 'var(--cobalt, #0047AB)' }}>{invite?.organization?.owner?.name}</span>
              </p>
              <div style={{ fontFamily: 'var(--font-grotesk, sans-serif)', fontSize: '1.5rem', fontWeight: 'bold' }}>
                {invite?.organization?.name}
              </div>
            </div>

            <button 
              onClick={handleAccept} 
              disabled={accepting}
              style={{ 
                fontFamily: 'var(--font-mono, monospace)',
                background: '#000', color: 'var(--bg-ivory, #FAF9F6)', padding: '1rem 3rem', 
                border: '1px solid #000', cursor: accepting ? 'not-allowed' : 'pointer', 
                textTransform: 'uppercase', fontSize: '0.9rem', opacity: accepting ? 0.7 : 1
              }}
            >
              {accepting ? '[ ASSIMILATING ]' : (user ? 'Accept Summons' : 'Identify to Accept')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
