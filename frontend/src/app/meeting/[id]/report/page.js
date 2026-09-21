'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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

  return (
    <div style={{padding: '2rem', maxWidth: '800px', margin: '0 auto'}}>
      <h1>Meeting Report</h1>
      <p style={{marginBottom: '2rem'}}>Meeting ID: {meetingId}</p>

      <div style={{background: 'rgba(255,255,255,0.05)', padding: '2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)'}}>
        <h2>Analytics Summary</h2>
        <ul style={{listStyle: 'none', padding: 0, lineHeight: 1.8}}>
          <li><strong>Total Participants:</strong> {data.totalParticipants}</li>
          <li><strong>Total Duration (sec):</strong> {data.totalDurationSeconds}</li>
          <li><strong>Languages Used:</strong> {data.languagesUsed?.join(', ') || 'None'}</li>
        </ul>
        
        <p style={{marginTop: '2rem', color: '#888'}}>Report generated at {new Date(report.generatedAt).toLocaleString()}</p>
      </div>

      <div style={{marginTop: '2rem'}}>
        <Link href="/dashboard" style={{textDecoration: 'underline'}}>← Back to Dashboard</Link>
      </div>
    </div>
  );
}

