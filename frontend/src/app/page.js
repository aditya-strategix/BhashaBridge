import Link from 'next/link';
import styles from './page.module.css';
import { Globe2, MessageSquareText, Video } from 'lucide-react';

export default function Home() {
  return (
    <div className={`${styles.container} animate-fade-in`}>
      <main className={styles.hero}>
        <h1 className={styles.title}>Speak Your Language. <br /> Connect the World.</h1>
        <p className={styles.subtitle}>
          BhashaBridge brings real-time, live-translated multilingual communication 
          to your audio and video meetings. Break language barriers instantly.
        </p>
        
        <div className={styles.ctaContainer}>
          <Link href="/login">
            <button className={styles.btnPrimary}>Get Started</button>
          </Link>
          <Link href="/register">
            <button className={styles.btnSecondary}>Create Account</button>
          </Link>
        </div>

        <div className={styles.features}>
          <div className={`${styles.featureCard} glass`}>
            <Video className={styles.featureIcon} />
            <h3 className={styles.featureTitle}>HD Video Meetings</h3>
            <p className={styles.featureDesc}>Peer-to-peer fast and secure video conferencing built for remote teams.</p>
          </div>
          <div className={`${styles.featureCard} glass`}>
            <Globe2 className={styles.featureIcon} />
            <h3 className={styles.featureTitle}>Live Translation</h3>
            <p className={styles.featureDesc}>Automatic audio transcription and real-time captions in your preferred language.</p>
          </div>
          <div className={`${styles.featureCard} glass`}>
            <MessageSquareText className={styles.featureIcon} />
            <h3 className={styles.featureTitle}>Translated Chat</h3>
            <p className={styles.featureDesc}>Type in your native tongue. Messages are instantly translated for everyone else.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
