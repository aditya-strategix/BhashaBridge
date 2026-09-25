const fs = require('fs');
fs.writeFileSync('e:/BhashaBridge/BhashaBridge/frontend/src/app/meeting/[id]/report/page.js', `'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Clock, Users, Globe2, FileText, ArrowLeft, CheckCircle2, Download, Sparkles, ChevronRight, BarChart3 } from 'lucide-react';
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
        const res = await api.get(\`/analytics/\${meetingId}/report\`);
        setReport(res.data.report);
      } catch (err) {
        if (err.response?.status === 404) {
          try {
            await api.get(\`/analytics/\${meetingId}\`);
            const res2 = await api.post(\`/analytics/\${meetingId}/report\`);
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

  if (!user) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Loading user...</div>;
  
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', gap: '1.5rem' }}>
      <div style={{ width: 48, height: 48, border: '4px solid rgba(96, 165, 250, 0.2)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{\`@keyframes spin { to { transform: rotate(360deg); } }\`}</style>
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

  const data = report.reportData.details;

  const formatDuration = (seconds) => {
    if (!seconds) return '00:00';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return \`\${m}:\${s}\`;
  };

  const handleExport = () => {
    const el = document.createElement('div');
    el.style.position = 'fixed';
    el.style.bottom = '30px';
    el.style.right = '30px';
    el.style.background = 'linear-gradient(135deg, #4f46e5, #ec4899)';
    el.style.padding = '1rem 1.5rem';
    el.style.borderRadius = '12px';
    el.style.color = '#fff';
    el.style.zIndex = '9999';
    el.style.fontWeight = '600';
    el.style.boxShadow = '0 10px 40px rgba(236, 72, 153, 0.4)';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '0.75rem';
    el.innerHTML = \`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Transcript Exported Successfully\`;
    document.body.appendChild(el);
    el.animate([{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 300, fill: 'forwards', easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' });
    setTimeout(() => {
      const anim = el.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(20px)' }], { duration: 300, fill: 'forwards' });
      anim.onfinish = () => el.remove();
    }, 3000);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#fafafa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ position: 'fixed', top: '-20%', left: '-10%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(100px)', zIndex: 0, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-20%', right: '-10%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.1) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(100px)', zIndex: 0, pointerEvents: 'none' }} />
      
      <div style={{ position: 'relative', zIndex: 1, padding: '4rem 2rem', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.8rem', borderRadius: '999px', fontSize: '0.8rem', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.25rem' }}>
              <BarChart3 size={14} color="#a78bfa" /> Post-Meeting Analytics
            </div>
            <h1 style={{ fontSize: '3rem', fontWeight: 800, margin: '0 0 0.75rem 0', letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #ffffff 0%, #a1a1aa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Meeting Report
            </h1>
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, color: '#71717a', fontSize: '1.1rem' }}>
              ID: <span style={{ fontFamily: 'monospace', color: '#d4d4d8', background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.5rem', borderRadius: '4px' }}>{meetingId}</span>
            </p>
          </div>
          
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#e4e4e7', textDecoration: 'none', fontWeight: 500, fontSize: '0.95rem', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            <ArrowLeft size={18} /> Back to Dashboard
          </Link>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.5rem', marginBottom: '4rem' }}>
          
          <div style={{ gridColumn: 'span 6', background: 'linear-gradient(145deg, rgba(24,24,27,0.8), rgba(9,9,11,0.8))', padding: '2.5rem', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ position: 'absolute', top: -30, right: -20, opacity: 0.05, transform: 'rotate(15deg)' }}><Users size={200} color="#60a5fa" /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'rgba(96, 165, 250, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={20} color="#60a5fa" />
              </div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#a1a1aa', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Participants</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '4.5rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', background: 'linear-gradient(to right, #fff, #93c5fd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {data.totalParticipants}
              </span>
              <span style={{ fontSize: '1.25rem', color: '#60a5fa', fontWeight: 500 }}>users</span>
            </div>
          </div>

          <div style={{ gridColumn: 'span 6', background: 'linear-gradient(145deg, rgba(24,24,27,0.8), rgba(9,9,11,0.8))', padding: '2.5rem', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ position: 'absolute', top: -30, right: -20, opacity: 0.05, transform: 'rotate(-15deg)' }}><Clock size={200} color="#c084fc" /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'rgba(192, 132, 252, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={20} color="#c084fc" />
              </div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#a1a1aa', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meeting Duration</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '4.5rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', background: 'linear-gradient(to right, #fff, #d8b4fe)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {formatDuration(data.totalDurationSeconds)}
              </span>
              <span style={{ fontSize: '1.25rem', color: '#c084fc', fontWeight: 500 }}>min</span>
            </div>
          </div>

          <div style={{ gridColumn: 'span 7', background: 'linear-gradient(145deg, rgba(24,24,27,0.8), rgba(9,9,11,0.8))', padding: '2.5rem', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ position: 'absolute', top: -30, right: -20, opacity: 0.05 }}><Globe2 size={200} color="#34d399" /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'rgba(52, 211, 153, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Globe2 size={20} color="#34d399" />
              </div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#a1a1aa', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Languages Spoken</h2>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {data.languagesUsed && data.languagesUsed.length > 0 ? (
                data.languagesUsed.map(lang => (
                  <div key={lang} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.2)', padding: '0.6rem 1.25rem', borderRadius: '12px', boxShadow: '0 4px 12px rgba(52,211,153,0.05)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399' }} />
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, color: '#f8fafc' }}>
                      {lang.toUpperCase()}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ padding: '1rem', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px', color: '#71717a', fontSize: '1.1rem' }}>No translations were active</div>
              )}
            </div>
          </div>

          <div style={{ gridColumn: 'span 5', background: 'linear-gradient(135deg, rgba(236,72,153,0.1), rgba(79,70,229,0.1))', padding: '2.5rem', borderRadius: '24px', border: '1px solid rgba(236, 72, 153, 0.2)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '20px', background: 'linear-gradient(135deg, #ec4899, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', boxShadow: '0 10px 25px rgba(236,72,153,0.3)' }}>
              <FileText size={32} color="#fff" />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem 0' }}>Meeting Transcript</h2>
            <p style={{ color: '#a1a1aa', fontSize: '0.95rem', margin: '0 0 2rem 0', lineHeight: 1.5 }}>Download the full AI-translated transcript of your session.</p>
            
            <button 
              onClick={handleExport}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1rem', background: '#fff', color: '#09090b', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '1.05rem', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 8px 20px rgba(255,255,255,0.15)' }}
            >
              <Download size={20} /> Export Transcript
            </button>
          </div>

        </div>

        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '999px' }}>
            <CheckCircle2 size={18} color="#34d399" />
            <span style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>Report finalized on <strong style={{ color: '#f4f4f5', fontWeight: 600 }}>{new Date(report.generatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</strong></span>
          </div>
        </div>
        
      </div>
    </div>
  );
}
`);