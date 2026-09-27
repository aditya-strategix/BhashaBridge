'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useAuthStore from '../../../stores/authStore';
import styles from '../auth.module.css';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState('en');
  
  const { register, isLoading, error } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await register(name, email, password, language);
    if (success) {
      const urlParams = new URLSearchParams(window.location.search);
      const redirect = urlParams.get('redirect');
      router.push(redirect ? `/login?redirect=${redirect}` : '/login');
    }
  };

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'ja', name: 'Japanese' }
  ];

  return (
    <div className={styles.editorialAuthContainer}>
      <div className={styles.editorialAuthWrapper}>
        <h1 className={styles.sharpTitle}>Join</h1>
        <div className={styles.thickRule}></div>

        {error && <div className={styles.editorialError}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.editorialForm}>
          <div className={styles.formGroup}>
            <label className={styles.editorialLabel}>Name</label>
            <input 
              type="text" 
              className={styles.editorialInput} 
              value={name}
              onChange={(e) => setName(e.target.value)}
              required 
            />
          </div>
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
          <div className={styles.formGroup}>
            <label className={styles.editorialLabel}>Language</label>
            <select 
              className={styles.editorialSelect}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {languages.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className={styles.editorialBtn} disabled={isLoading}>
            {isLoading ? 'Processing...' : 'Register'}
          </button>
        </form>

        <div className={styles.thinRule}></div>
        <Link href={`/login${typeof window !== 'undefined' && window.location.search ? window.location.search : ''}`} className={styles.editorialLink}>
          Or Access
        </Link>
      </div>
    </div>
  );
}
