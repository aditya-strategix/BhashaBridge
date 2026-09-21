'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '../../stores/authStore';
import api from '../../services/api';

export default function AdminDashboard() {
  const { user, initialize } = useAuthStore();
  const router = useRouter();
  const [health, setHealth] = useState(null);
  const [orgUsers, setOrgUsers] = useState([]);

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

  const [newUserEmail, setNewUserEmail] = useState('');

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
      alert(err.response?.data?.error || 'Failed to add user');
    }
  };

  const handleRemoveUser = async (userId) => {
    try {
      await api.delete(`/admin/org/users/${userId}`);
      fetchUsers();
    } catch (err) {
      alert('Failed to remove user');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.patch(`/admin/org/users/${userId}/role`, { role: newRole });
      fetchUsers();
    } catch (err) {
      alert('Failed to change role');
    }
  };

  if (!user || (user.role !== 'ORG_ADMIN' && user.role !== 'PLATFORM_ADMIN')) return null;

  return (
    <div style={{padding: '2rem', maxWidth: '1000px', margin: '0 auto'}}>
      <h1>Admin Dashboard</h1>
      <p style={{marginBottom: '2rem'}}>Logged in as: {user.name} ({user.role})</p>

      {user.role === 'PLATFORM_ADMIN' && health && (
        <div style={{background: 'rgba(255,255,255,0.05)', padding: '2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '2rem'}}>
          <h2>Platform Health</h2>
          <ul style={{listStyle: 'none', padding: 0, lineHeight: 1.8}}>
            <li><strong>Status:</strong> {health.status}</li>
            <li><strong>Active Meetings:</strong> {health.activeMeetings}</li>
            <li><strong>Uptime (sec):</strong> {health.uptime}</li>
          </ul>
        </div>
      )}

      <div style={{background: 'rgba(255,255,255,0.05)', padding: '2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)'}}>
        <h2>Organization Users</h2>
        
        <form onSubmit={handleAddUser} style={{marginBottom: '1rem', display: 'flex', gap: '0.5rem'}}>
          <input 
            type="email" 
            placeholder="User Email" 
            value={newUserEmail} 
            onChange={(e) => setNewUserEmail(e.target.value)} 
            style={{padding: '0.5rem', borderRadius: '4px', border: 'none', flex: 1}}
          />
          <button type="submit" style={{padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Add User</button>
        </form>

        {orgUsers.length === 0 ? (
          <p>No users found in your organization.</p>
        ) : (
          <table style={{width: '100%', textAlign: 'left', borderCollapse: 'collapse', marginTop: '1rem'}}>
            <thead>
              <tr style={{borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
                <th style={{padding: '0.5rem'}}>Name</th>
                <th style={{padding: '0.5rem'}}>Email</th>
                <th style={{padding: '0.5rem'}}>Role</th>
                <th style={{padding: '0.5rem'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgUsers.map(u => (
                <tr key={u.id} style={{borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
                  <td style={{padding: '0.5rem'}}>{u.name}</td>
                  <td style={{padding: '0.5rem'}}>{u.email}</td>
                  <td style={{padding: '0.5rem'}}>
                    <select 
                      value={u.role} 
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      style={{padding: '0.2rem', background: '#1f2937', color: 'white', border: 'none'}}
                    >
                      <option value="PARTICIPANT">PARTICIPANT</option>
                      <option value="HOST">HOST</option>
                      <option value="ORG_ADMIN">ORG_ADMIN</option>
                    </select>
                  </td>
                  <td style={{padding: '0.5rem'}}>
                    <button 
                      onClick={() => handleRemoveUser(u.id)}
                      style={{background: 'red', color: 'white', border: 'none', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer'}}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      <div style={{marginTop: '2rem'}}>
        <button onClick={() => router.push('/dashboard')} style={{padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer'}}>
          ← Back to Main Dashboard
        </button>
      </div>
    </div>
  );
}

