# 🌐 BhashaBridge

<p align="center">
  <strong>Edge-Accelerated Multilingual Video Conferencing Platform</strong><br>
  <em>Break language barriers. Communicate without borders. Zero cloud GPU costs.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/Node.js-18-339933?style=for-the-badge&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/WebRTC-P2P%20Mesh-333333?style=for-the-badge&logo=webrtc" alt="WebRTC" />
  <img src="https://img.shields.io/badge/Socket.IO-Realtime-010101?style=for-the-badge&logo=socketdotio" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/PostgreSQL-Supabase-336791?style=for-the-badge&logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Google%20Gemini-3.7%20Flash-4285F4?style=for-the-badge&logo=google" alt="Gemini" />
</p>

---

## ⚡ Why BhashaBridge?

Traditional video platforms gate real-time speech interpretation behind expensive enterprise tiers (\$20–\$30/user/month) because centralized server-side speech generation for millions of users is economically unsustainable.

**BhashaBridge** solves this with a novel **Hybrid Edge Architecture**:
* **Audio Capture & Speech-to-Text (STT):** Executed locally on the speaker's browser via native Web Speech APIs.
* **Translation Relay:** Lightweight text translations pass through our resilient Node.js / Socket.IO bridge.
* **Text-to-Speech (TTS):** Synthesized directly on the listener's device with synchronized subtitles.
* **Result:** Real-time multilingual voice translation across 10+ languages with **\$0.00 cloud GPU expense**.

---

## ✨ Key Features

* 🗣️ **Real-Time Speech-to-Speech Translation:** Converse in your native tongue (Hindi, Spanish, French, etc.); peers instantly hear speech and read subtitles in their preferred language.
* 🎙️ **Acoustic Echo & Feedback Suppression:** Built-in 600ms dissipation buffer, utterance deduplication, and TTS mic ducking prevent synthetic audio ping-pong loops.
* 🎥 **Peer-to-Peer WebRTC Mesh:** Low-latency encrypted media streams with automated STUN hole punching and TURN over TLS (Port 443) fallback for strict firewalls.
* 🛡️ **Deterministic Lobby & Role Governance:** Single-Host authority with temporary & organization-level Co-Host delegation, lobby rehydration upon refresh, and zero duplicate ghost tiles.
* 🧠 **Post-Meeting AI Intelligence:** Instant meeting summaries in each participant's preferred language powered by Gemini 3.7 Flash with two-tier caching (Valkey in-memory TTL + PostgreSQL permanent storage).
* 📊 **Audit-Ready Analytics:** Comprehensive post-meeting metrics, participation logs, language diversity tracking, and one-click CSV export.

---

## 🎯 Target Real-World Use Cases (The Grassroots Mission)

While enterprise platforms like Google Meet and Microsoft Teams cater to Fortune 500 boardrooms and high-literacy knowledge workers who prefer silent text subtitles, **BhashaBridge is purpose-built for the Next Billion Users in the Global South**—where spoken language is the **sole gateway to digital inclusion** and functional illiteracy makes text subtitles ineffective.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ TARGET PERSONA COMPARISON: GOOGLE MEET vs. BHASHABRIDGE                                     │
├───────────────────────────────┬────────────────────────────┬────────────────────────────────┤
│ Dimension                     │ Google Meet                │ BhashaBridge                   │
├───────────────────────────────┼────────────────────────────┼────────────────────────────────┤
│ Primary Target User           │ Enterprise Knowledge Worker│ The "Next Billion Users"       │
│ Geography                     │ Global North & Tech Hubs   │ Global South (Bharat / Rural)  │
│ Literacy Profile              │ High Literacy (Fast Reader)│ Low-Literacy / Non-Literate    │
│ Meeting Cadence               │ Rapid agile debates        │ Structured 1-on-1 consultations│
│ Conversational Tolerance      │ < 300 ms (Zero lag allowed)│ 1.5 – 2.5 s (Natural buffer)   │
│ Primary Output Medium         │ Silent visual subtitles    │ Spoken regional audio out loud │
│ Cloud Infrastructure Cost     │ Multi-million dollar SFUs  │ $0.00 Cloud GPU (Hybrid Edge)  │
└───────────────────────────────┴────────────────────────────┴────────────────────────────────┘
```

### 1. 🏥 Rural Telemedicine & Primary Healthcare (The Lifesaver)
* **Context:** An AIIMS specialist in New Delhi or a cardiologist in Bengaluru consulting remotely with a patient in a village primary health center in Bihar or Tamil Nadu.
* **The Problem:** An elderly or sick villager speaking Bhojpuri, Marathi, or Tamil cannot read rapid English or Devanagari subtitles scrolling across a 5-inch phone screen. Functional illiteracy makes text captions 100% useless.
* **Why BhashaBridge Wins:** 
  * The patient explains symptoms in their native tongue $\rightarrow$ BhashaBridge plays natural translated speech to the doctor in English/Hindi $\rightarrow$ The doctor responds $\rightarrow$ The patient hears spoken advice in their own dialect.
  * Medical consultations are inherently turn-based and consultative. There is no rapid-fire interruption; a 1.8-second translation buffer is respected as a deliberate, thoughtful interval that saves lives.

### 2. 🌾 Agricultural Mandi & Grassroots Interstate Trade
* **Context:** A farmer in Punjab or Haryana negotiating grain, vegetable, or livestock prices directly with a wholesale procurement trader in Maharashtra or Andhra Pradesh (Punjabi $\longleftrightarrow$ Marathi / Telugu).
* **The Problem:** Farmers in crowded mandis cannot type or read text chats on a smartphone while handling produce. Intermediaries exploit language barriers to take excessive commissions.
* **Why BhashaBridge Wins:** Direct voice-to-voice negotiation establishes mutual trust, eliminates exploitative middlemen, and allows farmers to communicate hands-free via earphones or speakerphone using BhashaBridge's intelligent acoustic ducking.

### 3. 🏗️ Blue-Collar & Migrant Field Workforce Coordination
* **Context:** Large-scale infrastructure projects (metro construction, highways, solar plants) where site managers speak Hindi or English, but migrant laborers speak Bengali, Odia, Assamese, or Kannada.
* **The Problem:** Construction workers operating heavy machinery or scaffolding cannot look at subtitle banners on a screen. Safety protocols and hazard alerts must be heard.
* **Why BhashaBridge Wins:** Morning safety briefings, daily hazard updates, and work orders are broadcast directly into workers' earphones in their mother tongue, ensuring zero language-related safety accidents.

### 4. 🏛️ Civic Governance & Public Grievance Redressal (Jan Sunwai)
* **Context:** District collectors and public officers reviewing welfare eligibility (PM-Kisan, pension disputes, ration card allocation, land deed verifications) with rural citizens speaking localized district dialects.
* **The Problem:** Millions of citizens are disenfranchised from government welfare because administrative hearings and portals are conducted exclusively in English or formal state languages.
* **Why BhashaBridge Wins:** Provides an equal voice to every citizen in public grievance hearings, allowing them to speak freely in their dialect and hear administrative resolutions spoken back clearly.

### 5. 🌍 Cross-Border Grassroots Freelancing & Micro-Enterprise
* **Context:** Traditional artisans (e.g. Jaipur textile weavers, brassware makers in Moradabad) pitching products or negotiating wholesale contracts with boutique buyers in Germany, France, or Japan.
* **The Problem:** Talented artisans lose export opportunities because they lack English fluency, forcing them to rely on expensive export agents.
* **Why BhashaBridge Wins:** Enables micro-entrepreneurs to conduct direct cross-border video pitches where both parties speak their native tongue effortlessly.

### 6. 🆘 Disaster Relief & Humanitarian Aid Operations (NGOs)
* **Context:** International relief volunteers, UN/Red Cross coordinators, and medical missions responding to flood, earthquake, or refugee crises in linguistically diverse regions.
* **Why BhashaBridge Wins:** Zero-setup browser access on commodity smartphones with $0.00 infrastructure cost allows immediate cross-lingual triage without procuring specialized translation hardware.

---

## 🏛️ Village Kiosk & Assisted Tele-Centre Deployment Model (Jan Seva Kendra / CSC)

A common question in grassroots tech deployment is:
> *"Poor villagers in remote areas do not own high-end laptops or computers. If this platform is optimized for desktop/laptop web browsers rather than low-end mobile phones, how do villagers actually access BhashaBridge?"*

BhashaBridge is designed around the **Village Kiosk / Common Service Centre (CSC) Model** (analogous to *Jan Seva Kendra* or *Gram Panchayat Telemedicine Booths*):

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ THE VILLAGE TELE-CENTRE ARCHITECTURE                                                        │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│  [ Villager ] ──────────► Walks into Village Kiosk / Gram Panchayat Center                  │
│       │                                                                                     │
│       ▼                                                                                     │
│  [ Kiosk Operator ] ────► Assisted Access: Opens Desktop Chrome, plugs in USB Headset,      │
│   (Local Youth / VLE)     selects villager's dialect (e.g. Bhojpuri, Maithili, Tamil)       │
│       │                                                                                     │
│       ▼ (BhashaBridge on Desktop Web Browser: 100% Free Edge STT/TTS)                       │
│  [ High-Speed Video Call ] ◄════════════════════════════════════════════════════════════►   │
│  with Remote Specialist Doctor (AIIMS) / Agronomist / Civil Officer                         │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Why the Desktop Kiosk Model Outperforms Personal Mobile Phones:
1. **Microphone Hardware Lockout on Mobile OS:**
   * On mobile phones, WebRTC acquires an exclusive hardware lock on the single microphone chip (Android `AudioRecord` / iOS `AVAudioSession`). When the browser's Web Speech engine attempts to capture voice for translation simultaneously, the mobile OS denies microphone access (`audio-capture-failed`) or violently disconnects the WebRTC call.
   * Desktop computers (Windows/macOS/Linux) feature OS-level multi-client audio mixers (WASAPI / CoreAudio) that effortlessly split and share one microphone stream across WebRTC and speech recognition simultaneously with zero hardware collision.
2. **Mobile Audio Focus Collisions (Telephony vs. Media):**
   * Mobile operating systems treat WebRTC two-way calls as telephony (earpiece voice call) and translated MP3 speech as media playback (loudspeaker). Playing translated audio automatically pauses or silences the incoming video call.
3. **Uninterrupted Speech Recognition vs. Dictation Timeouts:**
   * Mobile phone browsers treat Web Speech as single-shot keyboard voice typing, forcefully terminating the microphone after 1.5–2 seconds of silence, while aggressive mobile battery-saver modes throttle background JavaScript threads.
   * Desktop/Laptop Chrome provides permanent, continuous Web Speech API listening (`continuous: true`) with zero dictation timeouts.
4. **Superior Hardware Acoustics & Echo Elimination:**
   * Budget smartphones feature weak, noisy single microphones that pick up environmental village noise (wind, cattle, tractors).
   * A village center uses a dedicated **noise-cancelling USB headset with directional mic**, eliminating 100% of acoustic feedback and ambient noise.
5. **Assisted Digital Inclusion:**
   * Non-literate or elderly citizens are not expected to configure WebRTC permissions, manage camera settings, or navigate complex UI menus.
   * A trained Village Level Entrepreneur (VLE) acts as an assisted facilitator, operating the controls while the villager simply sits and speaks naturally.
6. **Sustainable Micro-Economy:**
   * The villager pays a nominal community fee (**₹20 to ₹50 / $0.25 – $0.60**) for the consultation.
   * The local kiosk operator earns a sustainable rural livelihood.
   * The remote doctor or expert delivers life-saving counsel without traveling.

---

## 🏗️ System Architecture

```
       [ Microphones ]                         [ WebRTC P2P Mesh ]
              │                                    Audio & Video
              ▼                                ┌───────────────────┐
     [ Client Edge STT ] ────────────────►     │ Peer A  ◄──►  Peer B│
     (Local Web Speech)                        └───────────────────┘
              │                                          ▲
              ▼                                          │
    [ Signaling Server ] ──► [ Neural NMT Bridge ] ──────┴──► [ Client Edge TTS ]
    (Socket.IO / Auth)                                       (Audio Ducking Guard)
```

### Layer Breakdown
| Layer | Technologies | Responsibilities |
| :--- | :--- | :--- |
| **Client Edge** | Next.js 14, Zustand, WebRTC, Web Speech API | Video rendering, edge STT/TTS synthesis, acoustic ducking |
| **Signaling** | Node.js, Express, Socket.IO | SDP offer/answer exchange, ICE relay, room lifecycle |
| **Persistence** | PostgreSQL (Supabase), Prisma, PgBouncer | ACID state, participants, transcripts, and permanent summary cache |
| **Cache & AI** | Valkey (Redis fork), Google Gemini 3.7 Flash | In-memory active session caching & post-meeting LLM synthesis |
| **Traversal** | STUN (RFC 5389) & TURN over TLS (RFC 8656) | NAT traversal across home Wi-Fi, 4G/5G mobile, and firewalls |

---

## 🚀 Quick Start

### 1. Prerequisites
* **Node.js** ≥ 18.x
* **PostgreSQL** (Local or Supabase)
* **Valkey / Redis** (Optional for ongoing meeting cache)

### 2. Clone & Install

```bash
# Clone the repository
git clone https://github.com/your-org/BhashaBridge.git
cd BhashaBridge/BhashaBridge

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 3. Environment Setup

Create `.env` inside `backend/`:
```env
PORT=5000
DATABASE_URL="postgresql://user:password@localhost:5432/bhashabridge"
JWT_SECRET="your-super-secret-jwt-key"
GEMINI_API_KEY="your-gemini-api-key"
RESEND_API_KEY="your-resend-api-key"
EMAIL_USER="bhashabridge@yourdomain.com"
FRONTEND_URL="http://localhost:3000"
```

Create `.env.local` inside `frontend/`:
```env
NEXT_PUBLIC_API_URL="http://localhost:5000"
NEXT_PUBLIC_SOCKET_URL="http://localhost:5000"
```

### 4. Database Setup & Launch

```bash
# Initialize database (from backend/)
cd backend
npx prisma generate
npx prisma db push

# Start Backend (Terminal 1)
npm run dev

# Start Frontend (Terminal 2)
cd ../frontend
npm run dev
```

Visit **`http://localhost:3000`** in your browser.

---

## 👥 Meeting State Progression

```
 [ SCHEDULED ] ──► Host joins ──► [ ONGOING ] ──► Host ends meeting ──► [ COMPLETED ]
       │                                                                       │
       └── Cancelled ──► [ CANCELLED ]                                          └── AI Summary Generated
```

* **Upcoming Tab:** Displays active `SCHEDULED` and `ONGOING` sessions for invited organization members.
* **History Tab:** Displays completed sessions with permanent AI summaries, transcripts, and attendance metrics exclusively for actual attendees.

---

## 🎨 Design System

BhashaBridge features an **Editorial Neo-Brutalist** aesthetic:
* **Canvas:** Warm Ivory (`#FDFBF7`)
* **Surfaces:** Paper Tint (`#F7F5F0`)
* **Typography & Borders:** Noir Black (`#0A0A0A`) with sharp 2px borders
* **Primary CTA:** Electric Cobalt (`#0022FF`)
* **Accent & Live Marks:** Vivid Vermilion (`#FF3311`) & Emerald (`#10B981`)

