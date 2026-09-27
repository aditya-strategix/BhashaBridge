'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useAuthStore from '../../../stores/authStore';
import styles from '../auth.module.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await login(email, password);
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
            <label className={styles.editorialLabel}>Password</label>
            <input 
              type="password" 
              className={styles.editorialInput} 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>
          <button type="submit" className={styles.editorialBtn} disabled={isLoading}>
            {isLoading ? 'Processing...' : 'Enter'}
          </button>
        </form>

        <div className={styles.thinRule}></div>
        <Link href={`/register${typeof window !== 'undefined' && window.location.search ? window.location.search : ''}`} className={styles.editorialLink}>
          Or Register
        </Link>
      </div>
    </div>
  );
}
