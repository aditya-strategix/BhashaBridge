'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, XCircle } from 'lucide-react';
import api from '../../../services/api';
import useAuthStore from '../../../stores/authStore';

export default function InvitePage({ params }) {
  const router = useRouter();
  const { token } = params;
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const user = useAuthStore(state => state.user);

  useEffect(() => {
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

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading invitation...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '1rem' }}>
      <div className="glass" style={{ maxWidth: '450px', width: '100%', padding: '2.5rem', borderRadius: '16px', textAlign: 'center' }}>
        {error ? (
          <>
            <XCircle size={48} color="#ef4444" style={{ margin: '0 auto 1rem' }} />
            <h2 style={{ color: '#f8fafc', marginBottom: '1rem' }}>Invitation Error</h2>
            <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>{error}</p>
            <button onClick={() => router.push('/')} style={{ background: '#3b82f6', color: 'white', padding: '0.75rem 1.5rem', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
              Go to Homepage
            </button>
          </>
        ) : (
          <>
            <CheckCircle size={48} color="#10b981" style={{ margin: '0 auto 1rem' }} />
            <h2 style={{ color: '#f8fafc', marginBottom: '0.5rem' }}>You&apos;ve been invited!</h2>
            <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
              <strong>{invite?.organization?.owner?.name}</strong> has invited you to join 
              <br/>
              <strong style={{ color: '#60a5fa', fontSize: '1.2rem', display: 'block', marginTop: '0.5rem' }}>
                {invite?.organization?.name}
              </strong>
            </p>

            <button 
              onClick={handleAccept} 
              disabled={accepting}
              style={{ 
                width: '100%', background: '#3b82f6', color: 'white', padding: '0.875rem', 
                border: 'none', borderRadius: '8px', cursor: accepting ? 'not-allowed' : 'pointer', 
                fontWeight: 600, fontSize: '1rem', transition: 'background 0.2s', opacity: accepting ? 0.7 : 1
              }}
            >
              {accepting ? 'Accepting...' : (user ? 'Accept Invitation' : 'Login to Accept')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
