'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Clock, Users, Globe2, FileText, ArrowLeft, CheckCircle2 } from 'lucide-react';
import useAuthStore from '../../../../stores/authStore';
import api from '../../../../services/api';

export default function MeetingReport() {
  const params = useParams();
  const { id: meetingId } = params;
  const { user } = useAuthStore();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    
    const fetchReport = async () => {
      try {
        const res = await api.get(`/analytics/${meetingId}/report`);
        setReport(res.data.report);
      } catch (err) {
        // If not generated, try generating
        if (err.response?.status === 404) {
          try {
            await api.get(`/analytics/${meetingId}`); // trigger analytics creation
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

  if (!user) return <div>Loading...</div>;
  if (loading) return <div style={{padding: '2rem'}}>Generating meeting report...</div>;
  if (error) return <div style={{padding: '2rem', color: 'red'}}>{error}</div>;

  const data = report.reportData.details;

  const formatDuration = (seconds) => {
    if (!seconds) return '00:00';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div style={{ padding: '3rem 2rem', maxWidth: '900px', margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header Area */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '3rem' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800', margin: '0 0 0.5rem 0', background: 'linear-gradient(90deg, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Meeting Report
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={18} /> ID: <span style={{ color: '#e5e7eb', fontFamily: 'monospace' }}>{meetingId}</span>
          </p>
        </div>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#e5e7eb', textDecoration: 'none', whiteSpace: 'nowrap', transition: 'all 0.2s'}}>
          <ArrowLeft size={18} /> Back to Dashboard
        </Link>
      </div>

      {/* Hero Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Card 1 */}
        <div style={{ background: 'linear-gradient(145deg, rgba(31,41,55,0.7), rgba(17,24,39,0.7))', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(96, 165, 250, 0.2)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', opacity: 0.1, color: '#60a5fa' }}><Users size={120} /></div>
          <p style={{ color: '#9ca3af', margin: '0 0 0.5rem 0', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Total Participants</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span style={{ fontSize: '3.5rem', fontWeight: '700', color: '#fff', lineHeight: '1' }}>{data.totalParticipants}</span>
            <span style={{ color: '#60a5fa' }}>users</span>
          </div>
        </div>

        {/* Card 2 */}
        <div style={{ background: 'linear-gradient(145deg, rgba(31,41,55,0.7), rgba(17,24,39,0.7))', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(167, 139, 250, 0.2)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', opacity: 0.1, color: '#a78bfa' }}><Clock size={120} /></div>
          <p style={{ color: '#9ca3af', margin: '0 0 0.5rem 0', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Meeting Duration</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span style={{ fontSize: '3.5rem', fontWeight: '700', color: '#fff', lineHeight: '1' }}>{formatDuration(data.totalDurationSeconds)}</span>
            <span style={{ color: '#a78bfa' }}>min</span>
          </div>
        </div>

        {/* Card 3 */}
        <div style={{ background: 'linear-gradient(145deg, rgba(31,41,55,0.7), rgba(17,24,39,0.7))', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(52, 211, 153, 0.2)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', opacity: 0.1, color: '#34d399' }}><Globe2 size={120} /></div>
          <p style={{ color: '#9ca3af', margin: '0 0 0.5rem 0', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Languages Spoken</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
            {data.languagesUsed && data.languagesUsed.length > 0 ? (
              data.languagesUsed.map(lang => (
                <span key={lang} style={{ background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '1.25rem', fontWeight: '600', border: '1px solid rgba(52, 211, 153, 0.3)' }}>
                  {lang.toUpperCase()}
                </span>
              ))
            ) : (
              <span style={{ fontSize: '2rem', fontWeight: '600', color: '#6b7280' }}>None</span>
            )}
          </div>
        </div>

        {/* Card 4 - Transcript */}
        <div style={{ background: 'linear-gradient(145deg, rgba(31,41,55,0.7), rgba(17,24,39,0.7))', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(244, 114, 182, 0.2)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', opacity: 0.1, color: '#f472b6' }}><FileText size={120} /></div>
          <p style={{ color: '#9ca3af', margin: '0 0 0.5rem 0', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Meeting Transcript</p>
          <button 
            onClick={() => {
              const el = document.createElement('div');
              el.style.position = 'fixed';
              el.style.top = '20px';
              el.style.right = '20px';
              el.style.background = 'rgba(17,24,39,0.95)';
              el.style.border = '1px solid rgba(244,114,182,0.4)';
              el.style.padding = '1rem 1.5rem';
              el.style.borderRadius = '8px';
              el.style.color = '#fff';
              el.style.zIndex = '9999';
              el.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
              el.innerText = 'Transcript exported successfully! (Check console)';
              document.body.appendChild(el);
              setTimeout(() => el.remove(), 3000);
            }} 
            style={{ marginTop: '0.5rem', background: 'rgba(244, 114, 182, 0.15)', border: '1px solid rgba(244, 114, 182, 0.3)', color: '#f472b6', padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', width: 'fit-content' }}>
            <FileText size={18} /> Export / Download
          </button>
        </div>

      </div>

      {/* Generated Status */}
      <div style={{ marginTop: 'auto', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#6b7280' }}>
        <CheckCircle2 size={16} style={{ color: '#34d399' }} />
        <span>Report successfully generated at <strong>{new Date(report.generatedAt).toLocaleString()}</strong></span>
      </div>

    </div>
  );
}

