'use client';

import { useSyncExternalStore } from 'react';

const THEME_KEY = 'bb-theme';
const THEME_EVENT = 'bb-theme-change';

function subscribe(callback) {
  if (typeof window === 'undefined') return () => {};
  const onThemeChange = () => callback();
  const onStorage = (e) => {
    if (e.key === THEME_KEY) callback();
  };
  window.addEventListener(THEME_EVENT, onThemeChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onThemeChange);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot() {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  try {
    return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function getServerSnapshot() {
  return 'light';
}

export function applyTheme(nextTheme) {
  if (typeof document === 'undefined') return;
  const resolved = nextTheme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
  try {
    window.localStorage.setItem(THEME_KEY, resolved);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: resolved } }));
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isDark = theme === 'dark';

  const handleToggle = () => {
    applyTheme(isDark ? 'light' : 'dark');
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      data-theme-toggle="true"
      aria-label={isDark ? 'Switch to Day Light theme' : 'Switch to Night Dark theme'}
      title={isDark ? 'Switch to Day Light theme' : 'Switch to Night Dark theme'}
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        left: '1.25rem',
        zIndex: 99980,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.55rem',
        padding: '0.55rem 0.95rem',
        borderRadius: '999px',
        border: isDark ? '2px solid #3B66FF' : '2px solid #0A0A0A',
        backgroundColor: isDark ? '#13161F' : '#0A0A0A',
        color: '#F4F1EA',
        fontFamily: 'var(--font-geist-mono), "Space Mono", monospace',
        fontSize: '0.72rem',
        fontWeight: 800,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        boxShadow: isDark
          ? '0 0 22px rgba(59, 102, 255, 0.35), 3px 3px 0 #3B66FF'
          : '3px 3px 0 #0022FF',
        transition:
          'transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s ease, background-color 0.2s ease, border-color 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translate(-2px, -2px)';
        e.currentTarget.style.boxShadow = isDark
          ? '0 0 28px rgba(79, 117, 255, 0.55), 5px 5px 0 #4F75FF'
          : '5px 5px 0 #0022FF';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translate(0, 0)';
        e.currentTarget.style.boxShadow = isDark
          ? '0 0 22px rgba(59, 102, 255, 0.35), 3px 3px 0 #3B66FF'
          : '3px 3px 0 #0022FF';
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          backgroundColor: isDark ? '#4F75FF' : '#FF3311',
          color: '#FFFFFF',
          boxShadow: isDark ? '0 0 10px rgba(79, 117, 255, 0.7)' : 'none',
          transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        {isDark ? (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </svg>
        ) : (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        )}
      </span>
      <span>{isDark ? 'DAY' : 'NIGHT'}</span>
    </button>
  );
}
