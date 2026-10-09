'use client';

import { useState } from 'react';
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
    title: 'Sub-Second Voice Translation',
    desc: 'Real-time speech-to-text neural interpretation pipeline. Speak naturally in your native language while others hear and read in theirs.',
    tag: 'Speech-to-Speech Engine'
  },
  {
    icon: <Video size={24} />,
    title: 'Zero-Install WebRTC Mesh',
    desc: 'High-definition encrypted video and audio streams run natively inside modern browsers. No downloads, native apps, or plugins required.',
    tag: '100% In-Browser P2P'
  },
  {
    icon: <Sparkles size={24} />,
    title: 'Gemini AI Intelligence',
    desc: 'Instant post-session executive summaries, key talking points, action items, and full multilingual transcripts delivered upon meeting conclusion.',
    tag: 'Gemini 3.7 Flash'
  },
  {
    icon: <MessageSquare size={24} />,
    title: 'Live Multilingual Captions',
    desc: 'Simultaneous sub-350ms synchronized subtitles translated independently into each participant\'s configured dialect.',
    tag: 'Dynamic Subtitles'
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

export default function Home() {
  const [meetingCode, setMeetingCode] = useState('');
  const router = useRouter();

  const handleJoinByCode = (e) => {
    e.preventDefault();
    const clean = meetingCode.trim();
    if (!clean) return;
    router.push(`/meeting/${clean.toUpperCase()}`);
  };

  return (
    <div className={styles.pageContainer}>

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
              BhashaBridge eliminates language barriers in real-time. Speak Hindi, Bengali, Tamil, Spanish, French, or English — your peers listen and read in their native dialect with zero translation latency.
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
          <div className={styles.statNumber}>Gemini</div>
          <div className={styles.statLabel}>AI Intelligence</div>
          <div className={styles.statDesc}>Automated summaries and attendance analytics.</div>
        </div>
      </section>

      {/* ===== LIVE DEMO SHOWCASE ===== */}
      <section id="demo" className={styles.showcaseSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionMonoTag}>[ PIPELINE VISUALIZATION ]</span>
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
            <div style={{ fontFamily: 'var(--font-geist-mono)', fontSize: '0.8rem', color: '#666' }}>
              WebRTC Room ID: <strong>BB-DEMO-01</strong>
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
                <span style={{ fontSize: '0.72rem', color: '#666', fontFamily: 'var(--font-geist-mono)', marginLeft: '0.5rem' }}>
                  Microphone Stream Active
                </span>
              </div>
            </div>

            {/* Pipeline Center */}
            <div className={styles.pipelineConnector}>
              <div className={styles.pipelineBadge}>
                NEURAL ENGINE
              </div>
              <div className={styles.pipelineLatency}>
                ⚡ 312ms latency
              </div>
              <ArrowRight size={24} color="var(--cobalt)" />
            </div>

            {/* Right Speaker */}
            <div className={styles.speakerBox}>
              <div className={styles.speakerHeader}>
                <div className={styles.speakerAvatar} style={{ background: '#0022FF' }}>
                  E
                </div>
                <div className={styles.speakerInfo}>
                  <h5>Elena (New York)</h5>
                  <span className={styles.speakerLangTag}>Listens: English (US)</span>
                </div>
              </div>
              <div className={styles.quoteBox}>
                &ldquo;Hello! In today&rsquo;s meeting, we will discuss the new product roadmap in detail.&rdquo;
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
            <h2 className={styles.sectionTitle}>Supported Dialects &amp; Scripts</h2>
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
            <h4 className={styles.workflowTitle}>Choose Your Dialect</h4>
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
              Real-time multilingual video conferencing platform. Breaking language barriers through ultra-low latency WebRTC mesh and neural speech translation.
            </p>
          </div>

          <div className={styles.footerCol}>
            <h6>Product</h6>
            <ul className={styles.footerList}>
              <li><Link href="/register">Sign Up Free</Link></li>
              <li><Link href="/login">User Login</Link></li>
              <li><a href="#demo">Live Pipeline Demo</a></li>
              <li><a href="#features">Feature Matrix</a></li>
            </ul>
          </div>

          <div className={styles.footerCol}>
            <h6>Ecosystem</h6>
            <ul className={styles.footerList}>
              <li><a href="#languages">Supported Dialects</a></li>
              <li><a href="#workflow">Workflow Guide</a></li>
              <li><Link href="/dashboard">Host Dashboard</Link></li>
              <li><Link href="/login">Admin Panel</Link></li>
            </ul>
          </div>

          <div className={styles.footerCol}>
            <h6>Engine Stack</h6>
            <ul className={styles.footerList}>
              <li><span style={{ color: '#0A0A0A', fontWeight: 600 }}>WebRTC Mesh</span></li>
              <li><span style={{ color: '#0A0A0A', fontWeight: 600 }}>Gemini 3.7 Flash</span></li>
              <li><span style={{ color: '#0A0A0A', fontWeight: 600 }}>Socket.IO + Node.js</span></li>
              <li><span style={{ color: '#0A0A0A', fontWeight: 600 }}>Next.js 14 App Router</span></li>
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
