'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Clock, Users, Globe2, FileText, ArrowLeft, CheckCircle2, Download, Sparkles, ChevronRight, BarChart3 } from 'lucide-react';
import useAuthStore from '../../../../stores/authStore';
import api from '../../../../services/api';

export default function MeetingReport() {
  const params = useParams();
  const { id: meetingId } = params;
  const { user, initialize } = useAuthStore();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [error, setError] = useState(null);

  useEffect(() => { initialize(); }, [initialize]);

  useEffect(() => {
  if (!user) return;
    
    const fetchReport = async () => {
      try {
        const res = await api.get(`/analytics/${meetingId}/report`);
        setReport(res.data.report);
      } catch (err) {
        if (err.response?.status === 404) {
          try {
            await api.get(`/analytics/${meetingId}`);
            const res2 = await api.post(`/analytics/${meetingId}/report`);
            setReport(res2.data.report);
          } catch (e) {
            setError('Failed to generate report');
          }
        } else {
          setError('Failed to load report');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [meetingId, user]);

  if (!mounted) return null;
  if (!user) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Loading user...</div>;
  
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', gap: '1.5rem' }}>
      <div style={{ width: 48, height: 48, border: '4px solid rgba(96, 165, 250, 0.2)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ color: '#94a3b8', fontSize: '1.1rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Sparkles size={20} color="#60a5fa" /> Synthesizing Meeting Analytics...
      </div>
    </div>
  );

  if (error) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '2rem', borderRadius: '16px', color: '#fca5a5', textAlign: 'center' }}>
        <div style={{ marginBottom: '1rem' }}><FileText size={48} opacity={0.5} /></div>
        <h2 style={{ margin: '0 0 0.5rem 0' }}>Error</h2>
        <p style={{ margin: 0 }}>{error}</p>
        <Link href="/dashboard" style={{ display: 'inline-block', marginTop: '1.5rem', color: '#f87171', textDecoration: 'underline' }}>Return to Dashboard</Link>
      </div>
    </div>
  );

  
  const data = report?.reportData?.details || {};

  const formatDuration = (seconds) => {
    if (!seconds) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleExport = async () => {
    try {
      const res = await api.get(`/meetings/${meetingId}/transcript`);
      const transcript = res.data.transcript;
      if (!transcript || transcript.length === 0) {
        alert("No transcript recorded for this meeting.");
        return;
      }
      const lines = transcript.map(t => {
        const time = new Date(t.timestamp).toLocaleTimeString();
        const speaker = t.speaker?.name || 'Unknown';
        return `[${time}] ${speaker}: ${t.originalText}`;
      });
      const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Meeting_Transcript_${meetingId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to export transcript.");
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem 3rem', background: 'rgba(15, 23, 42, 0.6)', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', width: 40, height: 40, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)' }}>
            <BarChart3 size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>Meeting Report</h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Session Analytics & Summary</p>
          </div>
        </div>
        
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#cbd5e1', textDecoration: 'none', fontWeight: 500, fontSize: '0.85rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </header>

      {/* Main Content */}
      <div style={{ maxWidth: 1000, margin: '3rem auto', padding: '0 2rem' }}>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
          
          {/* Card 1: Participants */}
          <div style={{ background: '#0f172a', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(96, 165, 250, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={18} color="#60a5fa" />
              </div>
              <h2 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Participants</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '3rem', fontWeight: 700, color: '#f8fafc', lineHeight: 1 }}>{data?.totalParticipants || 0}</span>
              <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 500 }}>users</span>
            </div>
          </div>

          {/* Card 2: Duration */}
          <div style={{ background: '#0f172a', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(192, 132, 252, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={18} color="#c084fc" />
              </div>
              <h2 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meeting Duration</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '3rem', fontWeight: 700, color: '#f8fafc', lineHeight: 1 }}>{formatDuration(data?.totalDurationSeconds || 0)}</span>
              <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 500 }}>min</span>
            </div>
          </div>

          {/* Card 3: Transcript Export */}
          <div style={{ background: '#0f172a', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(52, 211, 153, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={18} color="#34d399" />
              </div>
              <h2 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transcript</h2>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <button onClick={handleExport} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.85rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', transition: 'background 0.2s', boxShadow: '0 4px 15px rgba(59,130,246,0.2)' }} onMouseEnter={e => e.currentTarget.style.background='#2563eb'} onMouseLeave={e => e.currentTarget.style.background='#3b82f6'}>
                <Download size={18} /> Download TXT
              </button>
            </div>
          </div>
        </div>

        {/* Languages Section */}
        <div style={{ background: '#0f172a', padding: '2.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(244, 63, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Globe2 size={18} color="#f43f5e" />
            </div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>Languages Spoken</h2>
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {data?.languagesUsed && data.languagesUsed.length > 0 ? (
              data.languagesUsed.map(lang => (
                <div key={lang} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.6rem 1.25rem', borderRadius: '999px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f43f5e' }} />
                  <span style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
                    {lang.toUpperCase()}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ color: '#64748b', fontSize: '0.95rem' }}>No translations were active during this session.</div>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
            Report generated on <strong style={{ color: '#94a3b8' }}>{new Date(report?.generatedAt || Date.now()).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
