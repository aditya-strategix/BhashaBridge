'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useAuthStore from '../../../stores/authStore';
import styles from '../auth.module.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { login, isLoading, error } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSearchQuery(window.location.search);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = email ? email.trim() : '';
    const success = await login(cleanEmail, password);
    if (success) {
      const urlParams = new URLSearchParams(window.location.search);
      const redirect = urlParams.get('redirect');
      router.push(redirect || '/dashboard');
    }
  };

  return (
    <div className={styles.editorialAuthContainer}>
      <div className={styles.editorialAuthWrapper}>
        <h1 className={styles.sharpTitle}>Access</h1>
        <div className={styles.thickRule}></div>

        {error && <div className={styles.editorialError}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.editorialForm}>
          <div className={styles.formGroup}>
            <label className={styles.editorialLabel}>Email</label>
            <input 
              type="email" 
              className={styles.editorialInput} 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>
          <div className={styles.formGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label className={styles.editorialLabel}>Password</label>
              <Link href="/forgot-password" className={styles.editorialLink} style={{ fontSize: '0.78rem', textTransform: 'none', letterSpacing: '0.02em', opacity: 0.85 }}>
                Forgot password?
              </Link>
            </div>
            <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
              <input 
                type={showPassword ? 'text' : 'password'} 
                className={styles.editorialInput} 
                style={{ paddingRight: '2.5rem', width: '100%' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: 'absolute',
                  right: '0',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.35rem',
                  color: 'var(--cobalt, #0047AB)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.8,
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
              >
                {showPassword ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <button type="submit" className={styles.editorialBtn} disabled={isLoading}>
            {isLoading ? 'Processing...' : 'Enter'}
          </button>
        </form>

        <div className={styles.thinRule}></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" className={styles.editorialLink} style={{ textAlign: 'left' }}>
            &larr; Home
          </Link>
          <Link href={`/register${searchQuery}`} className={styles.editorialLink}>
            Or Register
          </Link>
        </div>
      </div>
    </div>
  );
}
