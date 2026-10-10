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

---

## 👥 The Team — Lazy Legends

Developed with ❤️ as part of an academic initiative at **IIIT Kottayam**:

* **Aditya Kumar**
* **Divyansh Nagar**
* **Shlok Deshmukh**
* **Ashutosh Shukla**

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).