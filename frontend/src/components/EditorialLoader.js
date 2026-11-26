'use client';

import { useEffect, useState } from 'react';
import styles from './EditorialLoader.module.css';

const STREAM_BADGES = [
  'ENGLISH ⇄ हिन्दी',
  'தமிழ் ⇄ বাংলা',
  'ESPAÑOL ⇄ FRANÇAIS',
  'DEUTSCH ⇄ తెలుగు',
  'मराठी ⇄ ગુજરાતી',
];

export default function EditorialLoader({
  title = 'Synchronizing Studio',
  subtitle = 'Preparing live multilingual pipeline...',
  tag = 'LIVE AUDIO PIPELINE',
  variant = 'fullscreen', // 'fullscreen' | 'inline'
}) {
  const [badgeIdx, setBadgeIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setBadgeIdx((prev) => (prev + 1) % STREAM_BADGES.length);
    }, 950);
    return () => clearInterval(id);
  }, []);

  if (variant === 'inline') {
    return (
      <div className={styles.inlineWrap} role="status" aria-live="polite">
        <div className={styles.inlineTop}>
          <div className={styles.waveCluster} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className={styles.inlineTag}>{tag}</span>
        </div>

        <h3 className={styles.inlineTitle}>{title}</h3>
        {subtitle && <p className={styles.inlineSub}>{subtitle}</p>}

        <div className={styles.scanTrack} aria-hidden="true">
          <div className={styles.scanFill} />
        </div>

        <div className={styles.inlineStreamPill}>
          <span className={styles.liveDot} />
          <span>{STREAM_BADGES[badgeIdx]}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.fullscreenWrap} role="status" aria-live="polite">
      {/* Editorial Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.brandMini}>
          <span className={styles.brandSquare} />
          <span>BHASHABRIDGE // STUDIO</span>
        </div>
        <div className={styles.statusTag}>
          <span className={styles.liveDot} />
          <span>{tag}</span>
        </div>
      </div>

      {/* Hero Animated Center */}
      <div className={styles.centerStage}>
        <div className={styles.orbitalBadge}>
          <div className={styles.waveClusterLarge} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>

        <h1 className={styles.heroTitle}>{title}</h1>
        {subtitle && <p className={styles.heroSub}>{subtitle}</p>}

        <div className={styles.streamPill}>
          <span className={styles.liveDot} />
          <span>{STREAM_BADGES[badgeIdx]}</span>
        </div>
      </div>

      {/* Scanning Progress Track */}
      <div className={styles.bottomBar}>
        <div className={styles.scanTrackFull} aria-hidden="true">
          <div className={styles.scanFill} />
        </div>
        <div className={styles.metaRow}>
          <span>NEURAL VAD &bull; STT &bull; DEEPSEEK &bull; TTS</span>
          <span>WEBRTC MESH STANDBY</span>
        </div>
      </div>
    </div>
  );
}
