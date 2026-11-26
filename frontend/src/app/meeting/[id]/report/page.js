'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import useAuthStore from '../../../../stores/authStore';
import api from '../../../../services/api';
import EditorialLoader from '../../../../components/EditorialLoader';

export default function MeetingReport() {
  const params = useParams();
  const { id: meetingId } = params;
  const router = useRouter();
  const { user, initialize } = useAuthStore();
  const [report, setReport] = useState(null);
  const [summaryModal, setSummaryModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [error, setError] = useState(null);
  const [alertData, setAlertData] = useState(null);

  useEffect(() => {
    initialize();
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
      router.replace(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [initialize, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchReport = async () => {
      try {
        const res = await api.get(`/analytics/${meetingId}/report`);
        if (!cancelled) {
          setReport(res.data.report);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to load report');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchReport();
    return () => { cancelled = true; };
  }, [meetingId, user]);

  if (!mounted) return null;
  if (!user) return (
    <EditorialLoader
      title="Authorizing Access"
      subtitle="Verifying session permissions for post-meeting dossier..."
      tag="ANALYTICS AUTH"
    />
  );
  
  if (loading) return (
    <EditorialLoader
      title="Synthesizing Archives"
      subtitle="Compiling multilingual attendance, duration & transcript telemetry..."
      tag="MEETING REPORT"
    />
  );

  if (error) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bb-bg)', color: 'var(--bb-text)' }}>
      <div style={{ border: '2px solid var(--bb-border)', backgroundColor: 'var(--bb-surface)', boxShadow: '6px 6px 0 var(--bb-shadow)', padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-mono, monospace)' }}>
        <h2 style={{ margin: '0 0 1rem 0', color: 'var(--bb-vermilion)', textTransform: 'uppercase' }}>[ FRAGMENT CORRUPTED ]</h2>
        <p style={{ margin: '0 0 2rem 0', color: 'var(--bb-text-muted)' }}>{error}</p>
        <Link href="/dashboard" style={{ color: 'var(--bb-cobalt)', textDecoration: 'underline', textTransform: 'uppercase', fontWeight: 700 }}>Retreat to Base</Link>
      </div>
    </div>
  );

  const data = report?.reportData?.details || {};

  const formatDuration = (seconds) => {
    if (!seconds) return '0';
    const m = Math.floor(seconds / 60);
    return m.toString();
  };

  const handleExportSummary = () => {
    if (!summaryModal || !summaryModal.text) return;
    const blob = new Blob([summaryModal.text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Meeting_Summary_${meetingId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleViewSummary = async () => {
    setSummaryModal({ loading: true, text: '' });
    try {
      const targetLang = encodeURIComponent(user?.language || user?.preferredLanguage || 'en');
      const res = await api.get(`/meetings/${meetingId}/summary?lang=${targetLang}`);
      setSummaryModal({ loading: false, text: res.data.summary || 'No summary available.' });
    } catch (err) {
      setAlertData(err.response?.data?.error || 'Failed to load summary.');
      setSummaryModal(null);
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.get(`/meetings/${meetingId}/transcript`);
      const transcript = res.data.transcript;
      if (!transcript || transcript.length === 0) {
        setAlertData('No transcript recorded for this meeting.');
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
      setAlertData('Failed to export transcript.');
    }
  };

  return (
    <>
      {summaryModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setSummaryModal(null)}>
          <div style={{ background: 'var(--bb-surface-2)', border: '2px solid var(--bb-border)', boxShadow: '8px 8px 0 var(--bb-shadow)', color: 'var(--bb-text)', padding: '1.5rem', width: '90%', maxWidth: '800px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--bb-border)', paddingBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic', fontSize: '2rem', color: 'var(--bb-cobalt)' }}>Condensed Narrative</h2>
              <div style={{ display: 'flex', gap: '1rem' }}>
                {!summaryModal.loading && summaryModal.text && (
                  <button onClick={handleExportSummary} style={{ fontFamily: 'var(--font-mono, monospace)', background: 'transparent', color: 'var(--bb-text)', border: '1px solid var(--bb-border)', padding: '0.5rem 1rem', cursor: 'pointer', textTransform: 'uppercase' }}>
                    Extract TXT
                  </button>
                )}
                <button onClick={() => setSummaryModal(null)} style={{ fontFamily: 'var(--font-mono, monospace)', background: 'var(--bb-cobalt)', color: '#FFFFFF', border: '1px solid var(--bb-border)', padding: '0.5rem 1rem', cursor: 'pointer', textTransform: 'uppercase' }}>Close</button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, fontFamily: 'var(--font-grotesk, sans-serif)', fontSize: '1.1rem', lineHeight: 1.6, color: 'var(--bb-text)' }}>
              {summaryModal.loading ? (
                <EditorialLoader
                  variant="inline"
                  title="Constructing Summary"
                  subtitle="Extracting translated dialogue & executive insights..."
                  tag="AI NARRATIVE"
                />
              ) : (
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {summaryModal.text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ minHeight: '100vh', width: '100%', maxWidth: '100%', boxSizing: 'border-box', backgroundColor: 'var(--bb-bg)', color: 'var(--bb-text)', padding: 'clamp(1rem, 3vw, 2rem)', position: 'relative', overflowX: 'hidden' }}>
        
        <header style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid var(--bb-border)', paddingBottom: '1rem', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', fontSize: '1rem', margin: 0 }}>BhashaBridge / Analytics</h1>
            <div style={{ fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic', fontSize: '1.2rem', color: 'var(--bb-text-muted)' }}>Post-Mortem Record</div>
          </div>
          <Link href="/dashboard" style={{ fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', color: 'var(--bb-text)', textDecoration: 'none', border: '1px solid var(--bb-border)', padding: '0.5rem 1rem' }}>
            Escape
          </Link>
        </header>

        <div style={{ position: 'relative', minHeight: '70vh', padding: '2rem 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          
          <div className='hide-on-mobile' style={{ position: 'absolute', top: '10%', left: '-5%', fontSize: '20vw', fontFamily: 'var(--font-grotesk, sans-serif)', fontWeight: 'bold', color: 'rgba(79, 117, 255, 0.08)', lineHeight: 0.8, letterSpacing: '-0.05em', zIndex: 1 }}>
            {data?.totalParticipants || 0}
          </div>
          <div className='hide-on-mobile' style={{ position: 'absolute', bottom: '5%', right: '-10%', fontSize: '25vw', fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic', color: 'rgba(255, 77, 46, 0.08)', lineHeight: 0.8, zIndex: 0 }}>
            {formatDuration(data?.totalDurationSeconds || 0)}
          </div>

          <div style={{ position: 'relative', zIndex: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2.5rem', width: '100%', maxWidth: '1200px' }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', marginBottom: '0.5rem', borderBottom: '1px solid var(--bb-border)', display: 'inline-block', paddingBottom: '0.2rem' }}>Total Entities</div>
                <div style={{ fontFamily: 'var(--font-grotesk, sans-serif)', fontSize: '3rem', fontWeight: 'bold', lineHeight: 1, color: 'var(--bb-cobalt)' }}>
                  {data?.totalParticipants || 0}
                </div>
              </div>

              <div>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', marginBottom: '0.5rem', borderBottom: '1px solid var(--bb-border)', display: 'inline-block', paddingBottom: '0.2rem' }}>Duration (Min)</div>
                <div style={{ fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic', fontSize: '3.5rem', lineHeight: 1, color: 'var(--bb-vermilion)' }}>
                  {formatDuration(data?.totalDurationSeconds || 0)}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', marginBottom: '1rem', borderBottom: '1px solid var(--bb-border)', display: 'inline-block', paddingBottom: '0.2rem' }}>Linguistic Vectors</div>
                {data?.languagesUsed && data.languagesUsed.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {data.languagesUsed.map(lang => (
                      <span key={lang} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1.5rem', textTransform: 'uppercase', border: '1px solid var(--bb-border)', padding: '0.2rem 1rem', background: 'var(--bb-surface)' }}>
                        {lang}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic', fontSize: '1.5rem', color: 'var(--bb-text-muted)' }}>Silence.</div>
                )}
              </div>

              <div>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', marginBottom: '1rem', borderBottom: '1px solid var(--bb-border)', display: 'inline-block', paddingBottom: '0.2rem' }}>Artifact Extraction</div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={handleExport} style={{ fontFamily: 'var(--font-mono, monospace)', background: 'var(--bb-surface)', color: 'var(--bb-text)', border: '2px solid var(--bb-border)', padding: '1rem 2rem', fontSize: '1rem', cursor: 'pointer', textTransform: 'uppercase' }}>
                    Raw Transcript
                  </button>
                  <button onClick={handleViewSummary} style={{ fontFamily: 'var(--font-mono, monospace)', background: 'var(--bb-cobalt)', color: '#FFFFFF', border: '2px solid var(--bb-border)', padding: '1rem 2rem', fontSize: '1rem', cursor: 'pointer', textTransform: 'uppercase' }}>
                    View Synthesis
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div style={{ position: 'relative', marginTop: '4rem', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--bb-text-muted)' }}>
          Chronicle generated: {new Date(report?.generatedAt || Date.now()).toLocaleString()}
        </div>


        {alertData && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bb-surface-2)', border: '2px solid var(--bb-border)', boxShadow: '12px 12px 0 var(--bb-shadow)', color: 'var(--bb-text)', padding: '2.5rem', width: 440, fontFamily: 'var(--font-grotesk)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--bb-text)', marginBottom: '1.5rem', fontFamily: 'var(--font-serif)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 12, height: 12, background: 'var(--bb-vermilion)', border: '2px solid var(--bb-border)' }} />
                System Notice
              </div>
              <div style={{ fontSize: '1.1rem', color: 'var(--bb-text)', marginBottom: '2.5rem', lineHeight: 1.5 }}>{alertData}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setAlertData(null)} style={{ background: 'var(--bb-cobalt)', color: '#FFFFFF', border: '2px solid var(--bb-border)', boxShadow: '4px 4px 0 var(--bb-shadow)', padding: '0.75rem 2rem', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', transition: 'transform 0.1s' }} onMouseEnter={e => e.currentTarget.style.transform='translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform='none'}>Acknowledge</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}

