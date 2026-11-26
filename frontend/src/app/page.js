'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, Video, Volume2, Sparkles, Shield,
  Mail, Check, Globe, Mic, MessageSquare, Key, Building
} from 'lucide-react';
import styles from './page.module.css';

const LANGUAGES = [
  { name: 'Hindi', script: 'हिन्दी', code: 'HI' },
  { name: 'English', script: 'Global', code: 'EN' },
  { name: 'Bengali', script: 'বাংলা', code: 'BN' },
  { name: 'Tamil', script: 'தமிழ்', code: 'TA' },
  { name: 'Telugu', script: 'తెలుగు', code: 'TE' },
  { name: 'Marathi', script: 'मराठी', code: 'MR' },
  { name: 'Gujarati', script: 'ગુજરાતી', code: 'GU' },
  { name: 'Spanish', script: 'Español', code: 'ES' },
  { name: 'French', script: 'Français', code: 'FR' },
  { name: 'German', script: 'Deutsch', code: 'DE' },
];

const FEATURES = [
  {
    icon: <Volume2 size={24} />,
    title: 'Instant Voice Translation',
    desc: 'Real-time speech translation. Speak naturally in your own language while other participants hear and read in theirs.',
    tag: 'Live Voice Translation'
  },
  {
    icon: <Video size={24} />,
    title: 'Instant Browser Meetings',
    desc: 'High-definition encrypted video and audio calls directly inside modern browsers. No downloads, apps, or plugins required.',
    tag: 'No Downloads Required'
  },
  {
    icon: <Sparkles size={24} />,
    title: 'DeepSeek AI Intelligence',
    desc: 'Instant post-session executive summaries, key talking points, action items, and full multilingual transcripts delivered upon meeting conclusion.',
    tag: 'DeepSeek V4.1 Flash'
  },
  {
    icon: <MessageSquare size={24} />,
    title: 'Live Multilingual Captions',
    desc: 'Synchronized live subtitles translated in real time into each participant\'s preferred language.',
    tag: 'Live Subtitles'
  },
  {
    icon: <Shield size={24} />,
    title: 'Host Lobbies & Access Passes',
    desc: 'Granular gatekeeping with waiting room admissions, persistent organization access passes, co-host role delegations, and member rosters.',
    tag: 'Enterprise Security'
  },
  {
    icon: <Mail size={24} />,
    title: '1-Click Email Invitations',
    desc: 'Dispatch branded invitations directly from your dashboard featuring meeting dossiers, scheduled timings, and instant join links.',
    tag: 'Resend Transactional'
  }
];

const DEMO_TARGET_SAMPLES = [
  {
    code: 'EN',
    label: 'English (US)',
    speaker: 'Elena (New York)',
    initial: 'E',
    color: '#0022FF',
    latency: '312ms',
    text: 'Hello! In today’s meeting, we will discuss the new product roadmap in detail.'
  },
  {
    code: 'TA',
    label: 'தமிழ் (Tamil)',
    speaker: 'Karthik (Chennai)',
    initial: 'K',
    color: '#0F766E',
    latency: '328ms',
    text: 'வணக்கம்! இன்றைய கூட்டத்தில் புதிய தயாரிப்பு திட்டத்தைப் பற்றி விரிவாக விவாதிப்போம்.'
  },
  {
    code: 'BN',
    label: 'বাংলা (Bengali)',
    speaker: 'Ananya (Kolkata)',
    initial: 'A',
    color: '#7C3AED',
    latency: '319ms',
    text: 'নমস্কার! আজকের মিটিংয়ে আমরা নতুন প্রোডাক্ট রোডম্যাপ নিয়ে বিস্তারিত আলোচনা করব।'
  },
  {
    code: 'ES',
    label: 'Español (Spanish)',
    speaker: 'Mateo (Madrid)',
    initial: 'M',
    color: '#B45309',
    latency: '305ms',
    text: '¡Hola! En la reunión de hoy analizaremos en detalle la nueva hoja de ruta del producto.'
  }
];

const INTRO_GREETINGS = [
  { word: 'नमस्ते', lang: 'HINDI · HI', accent: '#FF3311' },
  { word: 'வணக்கம்', lang: 'TAMIL · TA', accent: '#10B981' },
  { word: 'নমস্কার', lang: 'BENGALI · BN', accent: '#F59E0B' },
  { word: 'నమస్కారం', lang: 'TELUGU · TE', accent: '#0022FF' },
  { word: 'Hola', lang: 'ESPAÑOL · ES', accent: '#FF3311' },
  { word: 'BhashaBridge', lang: 'SPEAK FREELY · BE UNDERSTOOD', accent: '#0022FF', isBrand: true }
];

export default function Home() {
  const [meetingCode, setMeetingCode] = useState('');
  const [demoTargetCode, setDemoTargetCode] = useState('EN');
  const [introStage, setIntroStage] = useState('playing'); // 'playing' | 'exiting' | 'done'
  const [greetingIdx, setGreetingIdx] = useState(0);
  const router = useRouter();
  const activeDemoTarget = DEMO_TARGET_SAMPLES.find(d => d.code === demoTargetCode) || DEMO_TARGET_SAMPLES[0];
  const activeGreeting = INTRO_GREETINGS[greetingIdx] || INTRO_GREETINGS[INTRO_GREETINGS.length - 1];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      const quick = setTimeout(() => setIntroStage('done'), 0);
      return () => clearTimeout(quick);
    }

    const stepInterval = setInterval(() => {
      setGreetingIdx((prev) => {
        if (prev < INTRO_GREETINGS.length - 1) return prev + 1;
        return prev;
      });
    }, 290);

    const exitTimer = setTimeout(() => {
      setIntroStage('exiting');
    }, 1850);

    const doneTimer = setTimeout(() => {
      setIntroStage('done');
    }, 2500);

    return () => {
      clearInterval(stepInterval);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  const handleSkipIntro = () => {
    setIntroStage('exiting');
    setTimeout(() => setIntroStage('done'), 500);
  };

  const handleJoinByCode = (e) => {
    e.preventDefault();
    const clean = meetingCode.trim();
    if (!clean) return;
    router.push(`/meeting/${clean.toUpperCase()}`);
  };

  return (
    <div className={styles.pageContainer}>

      {/* ===== FULL-PAGE MULTILINGUAL EDITORIAL INTRO CURTAIN ===== */}
      {introStage !== 'done' && (
        <div
          className={`${styles.introOverlay} ${introStage === 'exiting' ? styles.introOverlayExiting : ''}`}
          role="presentation"
        >
          <div className={styles.introTopBar}>
            <div className={styles.introBrandMini}>
              <span className={styles.introSquare} />
              <span>BHASHABRIDGE // LIVE STUDIO</span>
            </div>
            <button type="button" onClick={handleSkipIntro} className={styles.introSkipBtn}>
              <span>Skip Intro</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <div className={styles.introCenter}>
            <div className={styles.introWaveCluster} aria-hidden="true">
              <span style={{ animationDelay: '0s', background: activeGreeting.accent }} />
              <span style={{ animationDelay: '0.12s', background: activeGreeting.accent }} />
              <span style={{ animationDelay: '0.24s', background: activeGreeting.accent }} />
              <span style={{ animationDelay: '0.08s', background: activeGreeting.accent }} />
              <span style={{ animationDelay: '0.2s', background: activeGreeting.accent }} />
            </div>

            <div
              key={greetingIdx}
              className={`${styles.introWord} ${activeGreeting.isBrand ? styles.introWordBrand : ''}`}
            >
              {activeGreeting.word}
            </div>

            <div className={styles.introLangPill} style={{ borderColor: activeGreeting.accent }}>
              <span className={styles.introLangDot} style={{ background: activeGreeting.accent }} />
              <span>{activeGreeting.lang}</span>
            </div>
          </div>

          <div className={styles.introBottomBar}>
            <div className={styles.introTrack}>
              <div className={styles.introProgressFill} />
            </div>
            <div className={styles.introMetaRow}>
              <span>FASTER-WHISPER STT · INDICTRANS2 · BHASHINI TTS</span>
              <span>REAL-TIME MULTILINGUAL ENGINE</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== NAVIGATION BAR ===== */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.navBrand}>
          <span className={styles.brandSquare} />
          <span className={styles.brandText}>BhashaBridge</span>
          <span className={styles.brandTag}>v2.4 Live</span>
        </Link>

        <div className={styles.navLinks}>
          <a href="#demo" className={styles.navLinkItem}>Live Demo</a>
          <a href="#features" className={styles.navLinkItem}>Features</a>
          <a href="#languages" className={styles.navLinkItem}>Languages</a>
          <a href="#workflow" className={styles.navLinkItem}>How It Works</a>
        </div>

        <div className={styles.navActions}>
          <Link href="/login" className={styles.btnNavLogin}>
            Sign In
          </Link>
          <Link href="/register" className={styles.btnNavRegister}>
            Get Started
          </Link>
        </div>
      </nav>

      {/* ===== HERO SECTION ===== */}
      <section className={styles.hero}>
        <div className={styles.heroTagline}>
          <span>●</span>
          <span>Next-Generation Multilingual Video Conferencing</span>
        </div>

        <h1 className={styles.heroTitle}>
          Say it in your tongue.
          <span className={styles.heroTitleItalic}>Feel understood across the globe.</span>
        </h1>

        <div className={styles.heroGrid}>
          <div>
            <p className={styles.heroSubtitle}>
              BhashaBridge eliminates language barriers in real time. Speak Hindi, Bengali, Tamil, Spanish, French, or English — your peers listen and read in their preferred language with instant translation.
            </p>

            <div className={styles.heroActions}>
              <Link href="/register" className={styles.btnPrimary}>
                <span>Launch Meeting Free</span>
                <ArrowRight size={16} />
              </Link>
              <Link href="/login" className={styles.btnSecondary}>
                <span>Enter Dashboard</span>
              </Link>
            </div>
          </div>

          {/* Fast-Track Guest Access Card */}
          <div className={styles.guestBox}>
            <div className={styles.guestBoxHeader}>
              <Key size={18} color="var(--cobalt)" />
              <h3 className={styles.guestBoxTitle}>Fast-Track Guest Join</h3>
            </div>
            <p className={styles.guestBoxSub}>
              Have an invitation code or organization pass? Jump directly into your session without signing in first.
            </p>
            <form onSubmit={handleJoinByCode} className={styles.guestForm}>
              <input
                type="text"
                placeholder="e.g. BB-E01D16 or 9-digit code"
                value={meetingCode}
                onChange={(e) => setMeetingCode(e.target.value)}
                className={styles.guestInput}
                required
              />
              <button type="submit" className={styles.btnGuestJoin}>
                <span>Join Session</span>
                <ArrowRight size={15} />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ===== STATS STRIP ===== */}
      <section className={styles.statsStrip}>
        <div className={styles.statItem}>
          <div className={styles.statNumber}>10+</div>
          <div className={styles.statLabel}>Languages Supported</div>
          <div className={styles.statDesc}>Indian regional and international language matrix.</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statNumber}>&lt;350ms</div>
          <div className={styles.statLabel}>Translation Latency</div>
          <div className={styles.statDesc}>Near-instantaneous neural voice interpreting.</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statNumber}>0</div>
          <div className={styles.statLabel}>Client Installations</div>
          <div className={styles.statDesc}>Zero plugins or app downloads. Runs in any browser.</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statNumber}>DeepSeek</div>
          <div className={styles.statLabel}>AI Intelligence</div>
          <div className={styles.statDesc}>Automated summaries and attendance analytics.</div>
        </div>
      </section>

      {/* ===== LIVE DEMO SHOWCASE ===== */}
      <section id="demo" className={styles.showcaseSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionMonoTag}>[ LIVE DEMO ]</span>
          <h2 className={styles.sectionTitle}>Speech In. Native Audio Out.</h2>
          <p className={styles.sectionDesc}>
            How BhashaBridge bridges conversation between two speakers of different languages in real time.
          </p>
        </div>

        <div className={styles.demoCard}>
          <div className={styles.demoTopBar}>
            <div className={styles.liveBadge}>
              <span className={styles.liveDot} />
              <span>Live Interpretation Active</span>
            </div>
            <div className={styles.demoLangSwitcher}>
              <span className={styles.demoSwitchLabel}>Listener Output:</span>
              {DEMO_TARGET_SAMPLES.map((sample) => (
                <button
                  key={sample.code}
                  type="button"
                  onClick={() => setDemoTargetCode(sample.code)}
                  className={`${styles.demoLangBtn} ${demoTargetCode === sample.code ? styles.demoLangBtnActive : ''}`}
                >
                  {sample.code}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.demoGrid}>
            {/* Left Speaker */}
            <div className={styles.speakerBox}>
              <div className={styles.speakerHeader}>
                <div className={styles.speakerAvatar} style={{ background: '#FF3311' }}>
                  A
                </div>
                <div className={styles.speakerInfo}>
                  <h5>Aditya (New Delhi)</h5>
                  <span className={styles.speakerLangTag}>Speaks: हिन्दी (Hindi)</span>
                </div>
              </div>
              <div className={styles.quoteBox}>
                &ldquo;नमस्ते! आज की बैठक में हम नए उत्पाद रोडमैप पर विस्तार से चर्चा करेंगे।&rdquo;
              </div>
              <div className={styles.audioWaveSim}>
                <div className={styles.waveBar} style={{ animationDelay: '0s' }} />
                <div className={styles.waveBar} style={{ animationDelay: '0.2s' }} />
                <div className={styles.waveBar} style={{ animationDelay: '0.4s' }} />
                <div className={styles.waveBar} style={{ animationDelay: '0.1s' }} />
                <div className={styles.waveBar} style={{ animationDelay: '0.5s' }} />
                <div className={styles.waveBar} style={{ animationDelay: '0.3s' }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--bb-text-subtle)', fontFamily: 'var(--font-geist-mono)', marginLeft: '0.5rem' }}>
                  Web Audio VAD &bull; Faster-Whisper STT
                </span>
              </div>
            </div>

            {/* Pipeline Center */}
            <div className={styles.pipelineConnector}>
              <div className={styles.pipelineBadge}>
                INDICTRANS2 + TTS
              </div>
              <div className={styles.pipelineLatency}>
                ⚡ {activeDemoTarget.latency} latency
              </div>
              <ArrowRight size={24} color="var(--cobalt)" />
            </div>

            {/* Right Speaker */}
            <div className={styles.speakerBox}>
              <div className={styles.speakerHeader}>
                <div className={styles.speakerAvatar} style={{ background: activeDemoTarget.color }}>
                  {activeDemoTarget.initial}
                </div>
                <div className={styles.speakerInfo}>
                  <h5>{activeDemoTarget.speaker}</h5>
                  <span className={styles.speakerLangTag}>Listens: {activeDemoTarget.label}</span>
                </div>
              </div>
              <div className={styles.quoteBox}>
                &ldquo;{activeDemoTarget.text}&rdquo;
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: 8, height: 8, background: '#10b981', display: 'inline-block' }} />
                <span style={{ fontSize: '0.72rem', color: '#059669', fontFamily: 'var(--font-geist-mono)', fontWeight: 700 }}>
                  Synthesized Audio &amp; Synchronized Captions
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURES GRID ===== */}
      <section id="features" style={{ maxWidth: 1280, margin: '0 auto', padding: '0 3rem' }}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionMonoTag}>[ CORE CAPABILITIES ]</span>
          <h2 className={styles.sectionTitle}>Built for Serious Cross-Border Collaboration</h2>
          <p className={styles.sectionDesc}>
            Engineered from the ground up for high reliability, multilingual parity, and zero administrative friction.
          </p>
        </div>
      </section>

      <div className={styles.featuresGrid}>
        {FEATURES.map((feat, idx) => (
          <div key={idx} className={styles.featureCard}>
            <div className={styles.featureIcon}>
              {feat.icon}
            </div>
            <h3 className={styles.featureTitle}>{feat.title}</h3>
            <p className={styles.featureDesc}>{feat.desc}</p>
            <div className={styles.featureTag}>[ {feat.tag} ]</div>
          </div>
        ))}
      </div>

      {/* ===== LANGUAGE MATRIX ===== */}
      <section id="languages" className={styles.languagesSection}>
        <div className={styles.languagesInner}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionMonoTag}>[ LANGUAGE ROSTER ]</span>
            <h2 className={styles.sectionTitle}>Supported Languages</h2>
            <p className={styles.sectionDesc}>
              BhashaBridge supports continuous speech-to-speech, real-time transcription, and live translation across India and international business hubs.
            </p>
          </div>

          <div className={styles.langGrid}>
            {LANGUAGES.map((lang) => (
              <div key={lang.code} className={styles.langChip}>
                <div>
                  <div className={styles.langName}>{lang.name}</div>
                  <div className={styles.langScript}>{lang.script}</div>
                </div>
                <div className={styles.langCode}>{lang.code}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="workflow" className={styles.workflowSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionMonoTag}>[ SIMPLE 3-STEP FLOW ]</span>
          <h2 className={styles.sectionTitle}>How to Start a Multilingual Session</h2>
          <p className={styles.sectionDesc}>
            No software setups, no plugin troubleshooting, no translation configuration overhead.
          </p>
        </div>

        <div className={styles.workflowGrid}>
          <div className={styles.workflowCard}>
            <div className={styles.stepNumber}>01</div>
            <h4 className={styles.workflowTitle}>Create or Join</h4>
            <p className={styles.workflowDesc}>
              Launch an instant session, schedule an upcoming conference, or enter with a direct 9-character code.
            </p>
          </div>

          <div className={styles.workflowCard}>
            <div className={styles.stepNumber}>02</div>
            <h4 className={styles.workflowTitle}>Choose Your Language</h4>
            <p className={styles.workflowDesc}>
              Select your spoken language and your preferred listening language in your profile or in-meeting preferences.
            </p>
          </div>

          <div className={styles.workflowCard}>
            <div className={styles.stepNumber}>03</div>
            <h4 className={styles.workflowTitle}>Converse Naturally</h4>
            <p className={styles.workflowDesc}>
              Speak freely. BhashaBridge interprets in real time, streams synchronized subtitles, and generates meeting notes.
            </p>
          </div>
        </div>
      </section>

      {/* ===== CALL TO ACTION BANNER ===== */}
      <section className={styles.ctaBanner}>
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>Break the Language Barrier Today.</h2>
          <p className={styles.ctaDesc}>
            Ready to experience effortless, real-time video meetings in any language? Join thousands of cross-lingual teams on BhashaBridge.
          </p>
          <Link href="/register" className={styles.btnCtaLaunch}>
            <span>Create Free Account</span>
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className={styles.footer}>
        <div className={styles.footerGrid}>
          <div>
            <div className={styles.navBrand}>
              <span className={styles.brandSquare} />
              <span className={styles.brandText}>BhashaBridge</span>
            </div>
            <p className={styles.footerBrandDesc}>
              Real-time multilingual video conferencing platform. Breaking language barriers through instant voice translation and live subtitles.
            </p>
          </div>

          <div className={styles.footerCol}>
            <h6>Product</h6>
            <ul className={styles.footerList}>
              <li><Link href="/register">Sign Up Free</Link></li>
              <li><Link href="/login">User Login</Link></li>
              <li><a href="#demo">Live Interactive Demo</a></li>
              <li><a href="#features">Key Features</a></li>
            </ul>
          </div>

          <div className={styles.footerCol}>
            <h6>Ecosystem</h6>
            <ul className={styles.footerList}>
              <li><a href="#languages">Supported Languages</a></li>
              <li><a href="#workflow">Workflow Guide</a></li>
              <li><Link href="/dashboard">Host Dashboard</Link></li>
              <li><Link href="/admin">Admin Panel</Link></li>
            </ul>
          </div>

          <div className={styles.footerCol}>
            <h6>Core Features</h6>
            <ul className={styles.footerList}>
              <li><span style={{ color: 'var(--bb-text)', fontWeight: 600 }}>HD Video &amp; Audio</span></li>
              <li><span style={{ color: 'var(--bb-text)', fontWeight: 600 }}>DeepSeek V4.1 Flash</span></li>
              <li><span style={{ color: 'var(--bb-text)', fontWeight: 600 }}>Live Subtitles &amp; Audio</span></li>
              <li><span style={{ color: 'var(--bb-text)', fontWeight: 600 }}>Instant AI Summaries</span></li>
            </ul>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <div>
            &copy; {new Date().getFullYear()} BhashaBridge. All rights reserved.
          </div>
          <div>
            Neo-Brutalist Architecture &bull; Made for Multilingual Collaboration
          </div>
        </div>
      </footer>
    </div>
  );
}
