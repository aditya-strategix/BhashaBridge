import Link from 'next/link';
import styles from './page.module.css';

export default function Home() {
  return (
    <div className={styles.editorialContainer}>
      <main className={styles.editorialMain}>
        <div className={styles.statementWrapper}>
          <h1 className={styles.massiveTitle}>Say it.</h1>
          <h1 className={`${styles.massiveTitle} ${styles.italicSerif}`}>Feel understood.</h1>
        </div>

        <div className={styles.visualFlow}>
          <div className={styles.flowStep}>PERSON</div>
          <div className={styles.flowRule}></div>
          <div className={styles.flowStep}>SPEECH</div>
          <div className={styles.flowRule}></div>
          <div className={styles.flowStep}>TRANSLATION</div>
          <div className={styles.flowRule}></div>
          <div className={styles.flowStep}>CONNECTION</div>
        </div>
        
        <div className={styles.descriptionBlock}>
          <p className={styles.bodyText}>
            BhashaBridge acts as an instantaneous, seamless interpreter for your video and audio communication.
          </p>
        </div>

        <div className={styles.editorialActions}>
          <Link href="/login" className={styles.actionLink}>
            ENTER
          </Link>
          <div className={styles.thinRule}></div>
          <Link href="/register" className={styles.actionLink}>
            JOIN
          </Link>
        </div>
      </main>
      
      <div className={styles.floatingWord1}>Speak</div>
      <div className={styles.floatingWord2}>Listen</div>
      <div className={styles.floatingWord3}>Connect</div>
      
      <svg className={styles.speechWave} viewBox="0 0 100 20" preserveAspectRatio="none">
        <path d="M0,10 Q25,0 50,10 T100,10" fill="none" stroke="var(--cobalt)" strokeWidth="0.2"/>
      </svg>
    </div>
  );
}
