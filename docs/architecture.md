# BhashaBridge — Architecture Document

This document describes the complete system architecture of BhashaBridge — a real-time multilingual video meeting platform. It covers how each layer is structured, how data flows through the system, and how the live translation pipeline works end to end.

---

## 1. High-Level Overview

BhashaBridge is a **full-stack real-time application** split into two independent services:

```
┌─────────────────────────────────────┐      ┌──────────────────────────────────────┐
│           FRONTEND                  │      │              BACKEND                 │
│        Next.js 14 (App Router)      │◄────►│        Node.js + Express             │
│        React + Zustand              │      │        Socket.IO + Prisma            │
│        Port: 3001                   │      │        Port: 5000                    │
└─────────────────────────────────────┘      └──────────────────────────────────────┘
                                                          │
                                                          ▼
                                                ┌─────────────────┐
                                                │   PostgreSQL DB  │
                                                │   (via Prisma)   │
                                                └─────────────────┘
```

---

## 2. Frontend Architecture

**Framework:** Next.js 14 with App Router  
**State Management:** Zustand (`useAuthStore`)  
**Styling:** CSS Modules  

### Page Structure

```
frontend/src/app/
├── layout.js                    # Root layout, global fonts
├── page.js                      # Landing page (/)
├── (auth)/
│   ├── login/page.js            # Login page (includes Forgot Password link)
│   ├── register/page.js         # Register page
│   └── forgot-password/page.js  # Multi-step OTP password reset
├── dashboard/page.js            # Meeting list, join with code, org code join, copy links
├── admin/page.js                # Admin panel (org & join request management)
├── invite/[token]/page.js       # Invite link handler
└── meeting/
    └── [id]/
        ├── page.js              # Main meeting room (WebRTC, live speech translation, lobby)
        └── report/page.js       # Post-meeting analytics report
```

### State Management (`useAuthStore` — Zustand)

The auth store holds:
- `user` — logged-in user object (id, name, email, language, chatLang, captionLang, ttsLang, chatEnabled, captionEnabled, ttsEnabled)
- `token` — JWT token stored in localStorage
- `setUser`, `logout` — store actions

**Important pattern:** Settings are mutated **in-place** on the user object (`useAuthStore.getState().user.ttsLang = 'hi'`) rather than replacing the whole object. This prevents React `useEffect` hooks from seeing a new object reference and triggering unnecessary socket reconnections.

### Pre-Authentication Landing Page Architecture (`/`)

The public entry page (`frontend/src/app/page.js` and `page.module.css`) delivers a high-impact editorial Neo-Brutalist experience before users log in or register:
- **Sticky Brutalist Navigation Bar**: Brand emblem, live version badge (`v2.4 Live`), in-page anchor links (`Live Demo`, `Features`, `Languages`, `How It Works`), and quick-action links to `/login` and `/register`.
- **Hero & Fast-Track Guest Join**:
  - Editorial headline: *"Say it in your tongue. Feel understood across the globe."*
  - Dual CTAs: *"Launch Meeting Free"* and *"Enter Dashboard"*.
  - Direct Guest Meeting Join Card: Allows external guests with an invite code or organization access pass (e.g. `BB-E01D16`) to bypass registration and join directly into the meeting room.
- **Metric Verification Strip**: 4-column counter displaying 10+ supported languages, sub-350ms translation latency, 0 client installations (100% in-browser), and Gemini AI intelligence.
- **Interactive Translation Pipeline Demo**: Visual simulated conversation between a Hindi speaker (New Delhi) and an English listener (New York), highlighting real-time STT, neural interpretation, dynamic captions, and audio synthesis.
- **Core Capabilities Grid**: 6 dossier cards explaining Speech-to-Speech, WebRTC P2P Mesh, Gemini 3.7 Flash AI, Dynamic Subtitles, Host Lobbies, and Transactional Email Invitations.
- **Supported Language Matrix**: Interactive roster displaying native scripts and language codes for Hindi, English, Bengali, Tamil, Telugu, Marathi, Gujarati, Spanish, French, and German.
- **Workflow Guide & Brutalist Footer**: 3-step timeline (Create/Join -> Choose Dialect -> Converse Naturally) paired with an architectural technical footer.

---

## 3. Backend Architecture

**Runtime:** Node.js  
**Framework:** Express.js  
**Real-time:** Socket.IO  
**ORM:** Prisma  
**Database:** PostgreSQL  
**Cache/In-Memory:** Valkey (Redis fork) + Memory Store fallback  

### Folder Structure

```
backend/src/
├── server.js                        # Entry point — creates HTTP server, attaches Socket.IO
├── app.js                           # Express app — registers middleware and routes
├── routes/
│   ├── auth.routes.js               # POST /auth/login, /register, /forgot-password/*
│   ├── meeting.routes.js            # POST /meetings, /meetings/:id/join, /admit, /reject, /end
│   ├── organization.routes.js       # Org CRUD, join codes, request approval/rejection
│   ├── analytics.routes.js          # Meeting analytics endpoints
│   ├── admin.routes.js              # Admin-only routes
│   └── tts.routes.js                # GET /tts (Google Cloud TTS proxy)
├── controllers/
│   ├── auth.controller.js           # JWT generation, bcrypt, OTP password recovery
│   ├── meeting.controller.js        # Meeting create/join/end logic, Google Meet codes
│   ├── organization.controller.js   # Org management & code-based join requests
│   ├── analytics.controller.js      # Participation time, message stats
│   └── admin.controller.js          # Admin user/org management
├── services/
│   ├── otp.service.js               # Dual-layer OTP store (Valkey + memory, rate limiting)
│   ├── email.service.js             # Resend API + Nodemailer (invites & branded OTP emails)
│   ├── ai.service.js                # Gemini 3.7 Flash AI Meeting Summarization
│   └── translation.service.js       # Translation utility wrapper
└── socket/
    └── index.js                     # All real-time logic (see Section 5)
```

### REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/auth/forgot-password/send-otp` | Dispatch 6-digit OTP code to registered email via Resend |
| POST | `/api/auth/forgot-password/verify-otp` | Verify 6-digit OTP, issue 10-minute JWT reset token |
| POST | `/api/auth/forgot-password/reset` | Reset password using verified token or active OTP |
| POST | `/api/meetings` | Create a new meeting (generates `bha-xxxx-yyy` code) |
| POST | `/api/meetings/join/:id` | Join meeting by ID or code, returns participant status |
| POST | `/api/meetings/:id/admit` | Host admits a waiting user |
| POST | `/api/meetings/:id/reject` | Host rejects a waiting user |
| POST | `/api/meetings/:id/end` | End meeting, log leave time |
| POST | `/api/organizations/join-code` | Request to join organization via code (e.g. `BB-E01D16`) |
| GET | `/api/organizations/requests` | List pending join requests for host/admin |
| POST | `/api/organizations/requests/:id/approve` | Approve join request and assign user to organization |
| POST | `/api/organizations/requests/:id/reject` | Reject join request |
| GET | `/api/tts` | Audio streaming proxy for Google Cloud TTS |
| GET | `/api/analytics/:id` | Get meeting analytics |
| GET | `/api/admin/users` | Admin: list all users |

---

## 4. Database Schema (Prisma)

```
User
├── id, name, email, password (bcrypt), role
├── organizationId → Organization
└── Meetings (many-to-many via Participant)

Meeting
├── id, meetingCode (e.g. bha-e82a-91f, Google Meet format), status
├── createdBy → User
├── Participants → Participant[]
├── ChatMessages → ChatMessage[]
└── Captions → Caption[]

Participant
├── userId, meetingId, role (HOST/COHOST/PARTICIPANT)
├── status (WAITING/ADMITTED/REJECTED)
└── joinedAt, leftAt (for analytics)

ChatMessage
├── meetingId, senderId
├── originalText, originalLanguage

Caption
├── meetingId, speakerId
├── originalText, originalLanguage

Organization
├── id, name, code (e.g. BB-E01D16), Users[]
└── JoinRequests → OrganizationJoinRequest[] (PENDING/APPROVED/REJECTED)
```

---

## 5. Real-Time Architecture (Socket.IO)

All real-time communication happens through `backend/src/socket/index.js`. Every meeting participant connects via a persistent WebSocket connection.

### Socket Events Map

#### Connection & Room Management
| Event | Direction | Description |
|-------|-----------|-------------|
| `user:register` | Client → Server | Join personal notification room |
| `meeting:join` | Client → Server | Join meeting room (or waiting room) |
| `user:update_settings` | Client → Server | Sync language/feature preferences to server |
| `participant:joined` | Server → Room | Notify others a new participant arrived |

#### WebRTC Peer Connections (Video/Audio)
| Event | Direction | Description |
|-------|-----------|-------------|
| `audio:signal` | Client ↔ Server ↔ Client | WebRTC ICE/SDP signal relay |

#### Chat
| Event | Direction | Description |
|-------|-----------|-------------|
| `chat:message` | Client → Server → Room | Broadcast raw chat message |
| `chat:translated` | Server → Room | Broadcast translated versions of chat message |

#### Live Captions & Speech Translation
| Event | Direction | Description |
|-------|-----------|-------------|
| `caption:text` | Client → Server | Raw transcribed speech from browser STT |
| `caption:text` | Server → Room | Broadcast raw caption |
| `caption:translated` | Server → Room | Broadcast translated captions + audio text |

#### Lobby (Waiting Room)
| Event | Direction | Description |
|-------|-----------|-------------|
| `waiting:request` | Server → Hosts | Alert host someone is waiting |
| `meeting:admit` | Client → Server → Waiting User | Admit a waiting participant |
| `meeting:reject` | Client → Server → Waiting User | Reject a waiting participant |

---

## 6. The Live Translation Pipeline (100% Free Architecture)

The translation system is designed to be highly scalable, completely free, and OS-independent.

### 6.1 Speech-to-Text (STT)
- **Engine:** `window.SpeechRecognition` (Web Speech API).
- **How it works:** In Chrome/Edge, this automatically streams the user's microphone audio to Google's Cloud STT servers. It returns highly accurate text transcription in 100+ languages natively.
- **Why it's free:** Google subsidizes this cost to improve Chrome. 
- **Privacy Handling:** Blocked by default on Brave. The app gracefully detects Brave and prompts the user to enable Google Services or use Chrome.

### 6.2 Text Translation
- **Engine:** `google-translate-api-x` (Backend) + `MyMemory API` (Fallback).
- **How it works:** 
  1. The backend receives raw text via Socket.IO.
  2. It spoofs a Chrome Extension request (`client: 'gtx'`) to bypass Google Translate's standard rate limits.
  3. If Google temporarily IP bans the server, the `catch()` block automatically falls back to the free `MyMemory` REST API to guarantee zero downtime.
  4. The backend broadcasts a JSON map of all translated languages to the meeting room.

### 6.3 Text-to-Speech (TTS)
- **Engine:** Google Cloud TTS endpoint (`translate_tts`) via Backend Proxy.
- **How it works (The Proxy Pipeline):**
  1. The browser receives the translated text string.
  2. The browser requests an audio file from our backend: `GET /api/tts?text=...&lang=...`.
  3. Our Node.js backend makes a server-to-server request to Google's hidden TTS endpoint. By using a backend proxy, we bypass Google's strict browser anti-hotlinking (CORS) protections.
  4. The backend pipes the raw MP3 binary data back to the frontend.
  5. The frontend plays the audio using a standard HTML5 `new Audio()` object.
- **Why it's better:** We completely removed the `window.speechSynthesis` API, which was strictly limited to the user's Windows OS voice packs (e.g. failing on Telugu because Windows doesn't install it by default). This new cloud architecture guarantees perfect neural voices for every language, on every device, without the user installing anything.

## 7. Per-User Settings Architecture

Each user in the meeting can independently configure three translation features. Settings are stored in the Zustand store on the frontend and synced to the backend socket's memory on every change.

### The Three Features

| Feature | Toggle State | Language Setting | How It Works |
|---------|-------------|-----------------|--------------|
| Speech-to-Speech | `user.ttsEnabled` | `user.ttsLang` | When a caption arrives, synthesize audio in this language |
| Message Chat Translation | `user.chatEnabled` | `user.chatLang` | Show translated text below chat messages |
| Speech to Caption | `user.captionEnabled` | `user.captionLang` | Show translated subtitle overlay on video |

### How Settings Flow

```
User changes dropdown in Settings modal
        │
        ▼
useAuthStore.getState().user.ttsLang = 'hi'   ← mutate in-place (no socket reset)
        │
        ▼
socket.emit('user:update_settings', user)      ← tell server instantly
        │
        ▼
socket.userSettings = settings                 ← server stores in socket memory
        │
        ▼
Next time caption:text arrives, server reads
socket.userSettings.ttsLang for this client
and adds 'hi' to the translation target set
```

---

## 8. WebRTC Video/Audio Architecture

Video and audio peer connections are managed using the `simple-peer` library (a WebRTC wrapper). The Socket.IO server acts purely as a **signaling relay** — it never processes the actual audio/video data.

```
Side A ──── WebRTC Offer ────► Server ────► Side B
Side A ◄─── WebRTC Answer ─── Server ◄──── Side B
Side A ◄═══════════════ Direct P2P Audio/Video ══════════════► Side B
```

Once the handshake is complete, audio and video flow **directly between browsers** (peer-to-peer), bypassing the server entirely. This means the server has **zero load** from video streams regardless of how many people are talking.

---

## 9. Authentication & Password Recovery Architecture

### 9.1 Authentication & Session Management
- Passwords are encrypted using **bcrypt** (10 salt rounds).
- Upon successful authentication, the server generates a signed **JWT** containing the user's `id`, `email`, and `role`.
- The JWT is stored in `localStorage` on the frontend and injected via an HTTP interceptor as `Authorization: Bearer <token>` for all protected API calls.
- Admin endpoints strictly enforce `role === 'ADMIN'`.

### 9.2 Password Recovery & OTP Architecture
The password recovery pipeline implements a robust, time-bound, multi-step verification mechanism designed for high availability and protection against abuse:

```
[User submits email]
        │
        ▼
POST /api/auth/forgot-password/send-otp
        │
        ├── Checks 60s cooldown limit
        ├── Generates secure 6-digit cryptographic OTP
        ├── Stores in Valkey / Redis (10m TTL) + in-memory Map fallback
        └── Dispatches branded HTML email via Resend (bhashabridge@aditya-kumar.in)
        │
[User enters 6-digit OTP]
        │
        ▼
POST /api/auth/forgot-password/verify-otp
        │
        ├── Checks attempt count (< 5 attempts allowed)
        ├── Validates OTP match and TTL expiration
        ├── Destroys OTP immediately upon verification (single-use)
        └── Signs short-lived JWT resetToken (10m expiry, purpose: "password_reset")
        │
[User submits new password]
        │
        ▼
POST /api/auth/forgot-password/reset
        │
        ├── Validates JWT resetToken (or active OTP payload)
        ├── Enforces password minimum length (>= 6 characters)
        ├── Hashes new password with bcrypt
        └── Persists updated credentials in PostgreSQL
```

#### Key Security & Performance Guarantees:
1. **Dual-Layer Store (`otp.service.js`):** Integrates with Valkey (Redis fork) running on Docker (`localhost:6379`) with seamless, automatic fallback to an in-memory `Map`. This bypasses schema lock contentions and delivers sub-millisecond retrieval and automatic key expiration.
2. **60-Second Cooldown:** Prevents email flooding and spamming the verification endpoints.
3. **Brute-Force Safeguard:** Limits incorrect attempts to 5 per OTP. If exceeded, the OTP is instantly evicted from memory/cache.
4. **Single-Use Invalidation:** OTPs are deleted the instant they are consumed to prevent replay attacks.
5. **Purpose-Bound Reset Token:** The verification endpoint returns a short-lived (10m) JWT signed with `purpose: 'password_reset'`. The reset endpoint validates this payload before modifying credentials.
6. **Domain-Authenticated Email Delivery (`email.service.js`):** Transactional emails are dispatched through the **Resend API** from the verified domain `BhashaBridge <bhashabridge@aditya-kumar.in>` with styled editorial monospace templates.

---

## 10. Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend Framework | Next.js 14 (App Router) | SSR + client-side routing |
| UI | React + CSS Modules | Component rendering (Editorial/Brutalist design language) |
| State | Zustand | Global auth + user settings |
| Real-time Client | Socket.IO Client | WebSocket communication |
| Video/Audio | simple-peer (WebRTC) | P2P video/audio streams |
| Speech-to-Text | Browser Web Speech API | Voice → text (free, local) |
| Text-to-Speech | Google Cloud TTS via Backend Proxy | Text → voice (free, cloud-based, OS-independent) |
| Backend | Node.js + Express | REST API server |
| Real-time Server | Socket.IO | WebSocket event hub |
| Cache & In-Memory | Valkey (Redis fork) + RAM store | AI summary cache & OTP verification store |
| AI Summarization | Google Gemini 3.7 Flash | Automated post-meeting summaries with 503 fallback |
| Translation | google-translate-api-x + MyMemory | Free text translation |
| ORM | Prisma | Type-safe database queries |
| Database | PostgreSQL | Persistent data storage |
| Auth | JWT + bcrypt | Secure authentication & password recovery |
| Email Service | Resend API + Nodemailer | Transactional OTP emails (`bhashabridge@aditya-kumar.in`) & meeting invites |


## Roles and Hierarchy
- **HOST**: Full control. Can assign/remove COHOSTs. Only one true HOST (the creator).
- **COHOST**: Sub-admin. Can admit/reject from lobby, but cannot mute/kick the HOST, nor can they promote others.
- **Permanent Co-Hosts (Organization Level)**: Stored in Organization.coHosts. Any member of this list automatically receives the COHOST role when joining a meeting tied to this organization.
- **Temporary Co-Hosts (Meeting Level)**: Promoted mid-meeting via socket/REST API. Their permissions expire when the meeting ends.


## Real-Time Presence & Attendance Architecture
- **WebSockets (Socket.io):** Real-time signaling and connection state tracking.
- **Strict Heartbeat mechanism:** Configured with `pingInterval: 300000` (5 minutes) and `pingTimeout: 300000` (5 minutes). This balanced heartbeat ensures that hardware crashes, hard network drops, and power outages are detected within a maximum of 10 minutes, preventing massive attendance inflation without overloading the server with constant pings.
- **Attendance Logging:** When the `disconnect` event fires (either gracefully or via the Heartbeat timeout), the server writes the exact `leftAt` timestamp to `ParticipantSession` in PostgreSQL, ensuring pixel-perfect attendance logging.
- **Dangling Session Fallbacks:** The CSV export algorithm is smart enough to detect any anomalies. If a session somehow still drops without a `leftAt`, but the user rejoins later, the dropped session's duration is capped at 0m (marked as 'Dropped') to prevent inflation. If it is their absolute final session, they are credited until the `meeting.endTime`.


### 5. AI Summarization & Dual Caching Architecture
The AI Summarization pipeline utilizes Google Gemini (gemini-3.7-flash) with a multi-model 503 fallback cascade, governed by a two-tier caching architecture to protect API billing:

#### Tier 1: Valkey TTL Cache (Ongoing Meetings)
- **Engine:** Valkey (Redis fork) running on Docker (`localhost:6379`).
- **Condition:** `meeting.state !== 'COMPLETED'`
- **Behavior:** Summaries are temporarily cached in RAM with a strict **5-minute (300s) TTL**. Protects the API from concurrent "spam" clicks while ensuring the summary stays relatively fresh as the live transcript grows.

#### Tier 2: PostgreSQL Permanent Cache (Completed Meetings)
- **Engine:** PostgreSQL (`summaryCache Json?` field on the `Meeting` model).
- **Condition:** `meeting.state === 'COMPLETED'`
- **Behavior:** Because the transcript is permanently locked, the first generated summary is saved to the DB as a dictionary of target languages (e.g., `{"en": "...", "hi": "..."}`). Future requests load instantly from the DB, dropping the API cost for historical lookups to $0.

### 6. Meeting Analytics Aggregation
The Post-Meeting Analytics Engine calculates metrics asynchronously on-demand. To determine the `languagesUsed` array, it queries both the `ChatMessage` (Text) and `Caption` (Voice) database tables, executing a union array to produce a unique, deduped list of all source languages participants utilized during the session.

### 7. Global Profile State & JWT Synchronization
User preferences are synchronized across the system via a Dual-State pattern:
1. **Frontend (Zustand):** `useAuthStore` manages immediate reactivity (e.g., updating the language dropdown).
2. **Backend (PostgreSQL + JWT):** `PUT /api/auth/profile` permanently saves settings to the DB and issues a fresh JWT. The JWT payload explicitly maps the database's `preferredLanguage` to the token's `language` property, which all API endpoints subsequently read to dictate AI Summary caching and generation targets.


### 8. WebRTC Mesh State Recovery & Self-Healing
The WebRTC mesh network operates entirely on the client side, meaning a browser refresh instantly wipes out local React state (peers, waitingUsers, WebRTC connections). The application heals itself via an outside-in signaling pattern:

1. **Re-Authentication:** The joining user's socket emits meeting:join.
2. **Network Broadcast:** The backend server explicitly does *not* send the connecting user a list of existing peers. Instead, it broadcasts a participant:joined event to all *existing* users in the room.
3. **Reverse-Signaling:** Every existing participant in the room reacts to participant:joined by immediately generating a new WebRTC offer (udio:signal) and firing it directly at the new user's socket ID.
4. **Mesh Reconstruction:** The newly refreshed user receives this barrage of incoming signals, automatically reconstructs their peers array, and replies with answers, successfully rebuilding the P2P mesh from the outside in.

### 9. Persistent Connection State & Lobby Preservation
To prevent state-loss in critical database roles (like Host lockouts or lost Waiting Room lobbies):
- The /meetings/join/:id API route forcefully rehydrates missing states by actively querying PostgreSQL for any users trapped in status === 'WAITING' and bundles them into the initial HTTP response payload so the Host's lobby UI is instantly restored.
- The database engine actively checks the user's existing participant.status (e.g. ADMITTED) during reconnection to prevent the default fallback (which would force returning ADMITTED participants back into the WAITING state upon refresh).

### 10. Appendix: WebRTC Networking Flow (NAT, STUN, TURN)

#### 1. Public IP vs private IP
Your internet provider gives your home one public address.
* **Your home router:** 203.0.113.50 (The public internet can potentially find that address)

But inside your house, you may have many devices:
* **Laptop:** 192.168.1.5
* **Phone:** 192.168.1.6
* **TV:** 192.168.1.7

These are private IP addresses. They are like room numbers inside a building. Someone outside the building cannot send a letter to �Room 5� without knowing which building it belongs to. Likewise, 192.168.1.5 exists in millions of homes, so it cannot identify your laptop on the public internet.

#### 2. What your router does
Your router sits between your private home network ? the public internet. It lets all your devices share the one public IP given by your ISP. This is called **NAT: Network Address Translation**.

For example, when your laptop opens YouTube, the router remembers:
*Internet reply sent to 203.0.113.50 : 50123 should actually go to 192.168.1.5 : laptop*

The port is like a temporary apartment-door number. So the router keeps a temporary table:
* 203.0.113.50:50123 ? 192.168.1.5
* 203.0.113.50:50124 ? 192.168.1.6

That is how YouTube replies reach the correct device.

#### 3. Why incoming connections are blocked
Imagine a stranger on the internet sends a packet to 203.0.113.50:9999. Your router asks: Which device inside my home asked for this?

If it has no matching entry in its table, it drops the packet. This is good for security, otherwise anyone on the internet could attempt to connect directly to your laptop or camera. This behavior is often called **NAT firewall behavior**.

#### 4. Why a direct WebRTC call is difficult (The NAT Problem)
Suppose you are on one home network and your friend is on another.
* **You:** Laptop private IP 192.168.1.5, Router public IP 203.0.113.50
* **Friend:** Laptop private IP 192.168.1.9, Router public IP 198.51.100.70

If you tell your friend: *"Connect to 192.168.1.5"*, their laptop looks for that address inside their own home network not yours. So it fails.

Even if they know your public IP (*"Connect to 203.0.113.50"*), your router may still reject the request because it does not know which internal device should receive it.

#### 5. What WebRTC actually does
WebRTC tries to create a direct connection between browsers. It uses a process called **ICE** (Interactive Connectivity Establishment). ICE means: *"Try every sensible way to connect these two people."*

It tries three main approaches:

**A. Local connection**
If both people are on the same Wi-Fi, private addresses can work (192.168.1.5 ? 192.168.1.9). No internet routing is needed.

**B. STUN: discover the public-facing address**
A STUN server is a public server on the internet. Your browser sends it a message: *"Hi, what address do you see me coming from?"*
The STUN server replies: *"I see you as 203.0.113.50:50123"*

Now your browser knows the temporary public address and port created by the router. This is called a **server-reflexive candidate**. Your browser sends this information to your friend through the signaling server (Your browser ? signaling server ? friend�s browser).

**C. NAT hole punching**
Both browsers send outgoing packets toward each other at nearly the same time. Because each router sees an outgoing request, it creates a temporary mapping and may allow the matching incoming reply through.
* You send outward ? your router opens a temporary path
* Friend sends outward ? their router opens a temporary path

If compatible, the browsers establish a direct peer-to-peer connection. Then the audio/video travels directly between them.

#### 6. Why STUN is sometimes not enough
Some networks are stricter (corporate networks, university Wi-Fi, symmetric NAT, UDP blocking). In those cases, the direct path fails even with STUN.

#### 7. TURN: the reliable fallback
TURN is a public relay server. Instead of connecting directly, both connect outward to the TURN server (You ? TURN server ? Friend). Both connections are outbound, which routers usually permit. The TURN server forwards the data. It costs bandwidth and efficiency, but guarantees the call works.

#### 8. The complete WebRTC flow
1. User A opens a meeting.
2. User B opens the same meeting.
3. Both browsers connect to your signaling server using WebSocket / Socket.IO.
4. They exchange offers, answers, and ICE candidates.
5. Each browser asks STUN: "What public address and port do you see?"
6. WebRTC tries direct connections: local IP ? public STUN address ? other candidates.
7. If direct connection works: Browser A ? Browser B
8. If direct connection fails: Browser A ? TURN relay ? Browser B

#### 9. In simple terms
* **Router:** The security guard for your home network.
* **Private IP:** Your room number inside the home.
* **Public IP:** Your homes street address.
* **NAT:** The routers record of which room requested which internet response.
* **STUN:** A service that tells your browser how the internet sees it.
* **ICE:** WebRTCs process for trying possible connection routes.
* **TURN:** A relay service that carries the call when direct connection fails.
* **Signaling server:** The messenger that helps browsers exchange connection details.


---

### 10. Meeting Lifecycle, Waiting Room & History Architecture

#### 10.1 Meeting State Machine
Every meeting follows a deterministic state progression:
1. **`SCHEDULED`**: Created in advance (standalone or attached to an Organization).
   - Visible under **"Upcoming"** tab for the Host and all members of the Organization so they can join when the time comes.
2. **`ONGOING`**: When the Host (or Co-host / Org Admin) joins, the state automatically transitions from `SCHEDULED` to `ONGOING`.
   - Real-time events (`dashboard:refresh`) broadcast across WebSocket and SSE to keep all participants informed.
3. **`COMPLETED`**: Triggered when the Host clicks *"End Meeting for All"*.
   - Meeting is immediately terminated across all peers via `meeting:ended` broadcast.
   - Meeting state becomes `COMPLETED` and recorded with `endTime`.
4. **`CANCELLED`**: If the Host deletes a scheduled meeting before it begins.

#### 10.2 Strict History vs. Upcoming Visibility Filtering
To prevent non-attending members from seeing meetings they never joined in their History:
- **Database Query (`GET /api/meetings`)**:
  ```sql
  WHERE (
    hostId = :userId
    OR participants.some(userId = :userId AND status = 'ADMITTED')
    OR (
      organization.users.some(id = :userId)
      AND state IN ('SCHEDULED', 'ONGOING')
    )
  )
  ```
  - **Upcoming Tab**: Displays meetings with `state = 'SCHEDULED'` or `state = 'ONGOING'`.
  - **History Tab**: Displays meetings with `state = 'COMPLETED'` or `state = 'CANCELLED'`.
  - **Rule**: If an organization member was NOT the host and NEVER attended (never admitted into the meeting), the meeting disappears from Upcoming once ended and does **NOT** appear in their History.
  - **Host & Admitted Participants**: Always retain the ended meeting in their History with full access to transcripts, AI summaries, and reports.

#### 10.3 Database Resilience & Connection Pooler Architecture
- **Supabase PgBouncer Singleton**: Replaced fragmented `new PrismaClient()` instantiations across controllers with a centralized singleton (`backend/src/prisma.js`).
- **Automatic Reconnection (`withDbRetry`)**: Transparently catches transient connection terminations (`P1017`, `P1001`, `ECONNRESET`), safely disconnects stale pool sockets, backs off exponentially, and retries the query without bubbling 500 errors to the client.
- **Dual Real-time Dashboard Synchronization**:
  - **Socket.IO**: Immediate push notification on `dashboard:refresh` and `meeting:ended`.
  - **Server-Sent Events (SSE)**: Secondary push pipeline on `/api/events`.
  - **Background Heartbeat**: 12-second periodic fallback refresh with client-side retry for maximum fault tolerance.

#### 10.4 Waiting Room (Lobby) Lifecycle, Multi-Rejoin State Machine & WebRTC Peer Deduplication

##### 10.4.1 The Challenge
In real-world meeting usage, users frequently enter the waiting room, leave (or disconnect), and re-enter multiple times before or after the host starts the session. Naive implementations suffer from two critical failure modes:
1. **Lobby Bypass / Accidental Direct Entry**: When a participant leaves the waiting room, their status becomes `LEFT`. When they attempt to rejoin after the host starts the meeting, retaining `status = participant.status` (`'LEFT'`) would bypass the waiting room check because `'LEFT'` is not `'WAITING'`.
2. **Duplicate Peer Explosion (Grid of 16+ identical tiles)**: If `waiting:admitted` or `participant:joined` is broadcast across overlapping room identifiers (`cleanLink`, `meetingLink`, `id`, `user_${id}`), or if multiple admissions fire, each event invokes `peersRef.current.push(createPeer(...))`. This creates duplicate WebRTC connections and cascades duplicate video tiles for the same participant.

##### 10.4.2 Architectural Solution

###### A. Deterministic Participant State Machine
When a participant requests to join (`POST /api/meetings/join/:link`):
```javascript
// Host and Co-Hosts always bypass the lobby
finalStatus = (isHost || isCoHost)
  ? 'ADMITTED'
  // Already admitted participants preserve their admission across transient reconnections:
  : (participant?.status === 'ADMITTED' ? 'ADMITTED' : 'WAITING');
```
* **Lobby Enforcement**: Any non-host user whose status was `LEFT`, `WAITING`, or `REJECTED` is deterministically returned to `WAITING` status.
* **Frontend Screen Guard**: The frontend strictly gates the meeting room:
  ```javascript
  if (participantStatus === 'WAITING' || (participantStatus !== 'ADMITTED' && !isHostOrCoHost)) {
    return <WaitingRoom />;
  }
  ```

###### B. Targeted Single-Channel Signal Emission
* **Admit/Reject Targeting**: `waiting:admitted` and `waiting:rejected` are emitted **strictly to the user's private notification channel** (`user_${targetUserId}`), never broadcast to shared meeting rooms.
* **Single Joined Broadcast**: When an admitted participant connects, `participant:joined` is emitted once to `socket.to(meeting.id)` (since all participants join `meeting.id`), avoiding duplicate event receipt.

###### C. WebRTC Peer Deduplication (One User = One Tile)
* **Peer Registry Deduplication**: In `participant:joined` and `audio:signal`, the registry checks for existing peers by `userId` or `socketId`:
  ```javascript
  const existingIdx = peersRef.current.findIndex(p => p.userId === userId || p.peerID === socketId);
  if (existingIdx !== -1) {
    peersRef.current[existingIdx].peer?.destroy();
    peersRef.current.splice(existingIdx, 1);
  }
  ```
* **Render-Time Idempotency**: The video grid filters peers so each `userId` can only render once:
  ```javascript
  {peers
    .filter((peer, index, self) => index === self.findIndex(p => (p.userId && p.userId === peer.userId) || p.peerID === peer.peerID))
    .map(peer => <VideoPeer key={peer.userId || peer.peerID} ... />)}
  ```
* **Lifecycle Teardown**: SPA page unmount resets `socketInitialized.current = false` and destroys active peer instances, guaranteeing that repeated lobby entries and exits start from a pristine connection state.
* **In-Flight Signal Invalidation & Exception Safety**: In `simple-peer`, calling `.signal()` on a peer instance whose connection is closing or destroyed throws `cannot signal after peer is destroyed`. All signaling handlers check `!peer.destroyed`, purge dead peer records from the registry, and wrap `.signal()` dispatches in exception-safe blocks to gracefully handle asynchronous network packet arrival races.

#### 10.5 Meeting Lifecycle Resilience, STT Loop Suppression & Multi-Format Resolution

##### 10.5.1 Universal Meeting-Ended Interceptor
* **Lobby & Room Termination**: Previously, the `meetingEnded` modal was nested only inside the main room JSX. If the host ended the meeting while a user was waiting in the lobby (`participantStatus === 'WAITING'`), the user remained trapped on the lobby screen indefinitely.
* **Architecture Fix**: `meetingEnded` is now intercepted as a top-level early return preceding the waiting room guard. When a meeting ends, all local media stream tracks are immediately stopped (`streamRef.current.getTracks().forEach(t => t.stop())`), and a clear dialog directs the user to either the meeting summary/report or their dashboard.

##### 10.5.2 Speech Recognition (STT) Flood Suppression & State Guarding
* **Silence Loop Prevention**: In Chromium-based browsers, continuous Web Speech API instances fire `no-speech` errors during silence. Unconditional immediate restarts generated dozens of rapid restarts per minute, flooding the console and dev server logs.
* **Admission Guarding**: STT execution is strictly gated by `participantStatus === 'ADMITTED' || isHostOrCoHost` and `!meetingEnded`. Users in the lobby or terminated meetings never have active speech recognition running.
* **Debounced Restarts & Error Filtering**: Informational `no-speech` events are ignored without error logging, and engine restarts are debounced by 400ms to eliminate CPU spin.

##### 10.5.3 Unified Entity Resolution & Database Fault Tolerance
* **Multi-Format Identifier Resolution**: Endpoints (`/participants`, `/cohost`, `/transcript`, `/participant/:userId`) previously performed rigid `meetingLink` lookups that failed with 404 when clients passed internal UUIDs or lowercase alias codes. The centralized `resolveMeetingEntity` resolves meetings flexibly by link, case-insensitive link, UUID, or organization access code.
* **PgBouncer Resilience across Endpoints**: Organization invitation acceptance and participant management queries are wrapped with `withDbRetry` to transparently recover from transient Supabase pool drops.

##### 10.5.4 Dual-Convention Socket Notification Rooms
* Both `user:${userId}` (colon notation) and `user_${userId}` (underscore notation) are joined upon `user:register` and `meeting:join`, ensuring instant delivery of notifications, promotions, and admissions regardless of emitter convention.

#### 10.6 Email Invitation System (Standalone & Scheduled Meetings)

##### 10.6.1 Motivation & Overview
While organization-scoped meetings automatically notify or list for enrolled organization members, ad-hoc and standalone scheduled meetings require an effortless mechanism to invite external collaborators. The Email Invitation System empowers hosts and co-hosts to dispatch branded, styled invitation emails to any recipient email address directly from their dashboard.

##### 10.6.2 Architecture & Flow
```
Host/Co-host Dashboard (Upcoming Tab / Post-Schedule Modal)
         │
         │ [Click "Send Invite"] -> Enter comma-separated emails
         ▼
POST /api/meetings/:link/invite { emails: "alice@org.com, bob@org.com" }
         │
         ├── 1. Identifier & State Resolution (resolveMeetingEntity)
         │      - Rejects COMPLETED / CANCELLED meetings (400)
         │
         ├── 2. Authorization Check
         │      - Caller must be host (hostId / org owner) or COHOST participant (403)
         │
         ├── 3. Input Sanitization & Multi-Email Regex Validation
         │      - Splits strings / arrays, checks RFC 5322 regex (400 if invalid)
         │
         ├── 4. Resend API Dispatch (sendMeetingInvitation)
         │      - High-deliverability transactional email via `bhashabridge@aditya-kumar.in`
         │      - Brutalist template (Georgia italics, Cobalt button, meeting dossier)
         │
         ▼
Response: { success: true, count: 2, message: "Invitation email sent to 2 recipient(s)" }
```

##### 10.6.3 Security & Authorization Constraints
- **Role Scoping**: Only verified meeting hosts or designated co-hosts can trigger invite emails for a given meeting ID.
- **State Enforcement**: Invitations are strictly disallowed for ended (`COMPLETED`) or cancelled (`CANCELLED`) meetings to prevent outdated join links.
- **Rate-Safety & Batching**: Recipient arrays are resolved asynchronously via `Promise.all` with individual error catching, reporting the exact number of successfully delivered invitations back to the client.

##### 10.6.4 Brutalist Visual Language & Email Design
Emails sent through `sendMeetingInvitation` adhere to BhashaBridge's signature Neo-Brutalist design language:
- Georgia serif italics for headings and branding.
- Monospace tags and high-contrast `#0A0A0A` borders with bold shadows.
- Distinct dossier card highlighting Meeting Topic, Scheduled Date/Time, and alphanumeric Meeting ID.
- Prominent Cobalt CTA button (`#0022FF`) with a direct one-click deep link to `/meeting/:meetingLink`.
- Zero-install browser callout reassuring recipients that no desktop client or plugin installation is required.

#### 10.7 Team Organizations UI & Membership Management Architecture

##### 10.7.1 Overview & Design Unification
The Organizations module provides persistent collaborative spaces that tie meetings, rosters, and administrative delegations together. In previous builds, the tab suffered from disparate styles (dark-mode leftovers, washed-out blue rounded pills, raw unstyled inputs). The updated architecture unifies the module with BhashaBridge’s Neo-Brutalist visual design:
- **Paper Cream Canvas (`#FDFBF7`)**: High-contrast `#0A0A0A` borders with bold offset drop shadows (`5px 5px 0 #0A0A0A`).
- **Editorial Typography**: Georgia serif italic typography for organization identities paired with high-legibility monospace badges for roles and metadata.
- **Dedicated Access Pass Tickets**: Formatted access codes with instant copy visual state, lifecycle regeneration, and deletion safety guards.

##### 10.7.2 Membership Lifecycle & Role Delegation
- **Access Passes**: Each organization features an alphanumeric pass code (e.g. `BB-E01D16`). Users requesting to join enter the code, which creates a `PENDING` join request.
- **Action Required Review Alerts**: Hosts and co-hosts receive prominent, high-priority alert cards highlighting pending join requests with one-click **Approve** (Emerald) and **Reject** (Crimson) actions.
- **Roster & Co-Host Privileges**: Organization owners can directly promote members to `COHOST` (or revoke back to `PARTICIPANT`) via the interactive star toggle (★), enabling decentralized meeting management.
- **Brutalist Roster Modals**: Expanded roster inspection with full user avatars, verified email records, and removal controls.

#### 10.8 Race-Condition Resilient Participant Upsert & Acoustic Echo Suppression Architecture

##### 10.8.1 The Race-Condition Challenge (`P2002` Server Error)
When users enter a meeting or lobby (especially during React 18/19 StrictMode double-mounts, network reconnect bursts, or rapid clicks on "Join Meeting"), concurrent HTTP `POST /api/meetings/join/:link` requests frequently hit the backend within milliseconds of each other.
* **Naive Pattern**: An initial `findUnique` returned `null` for both requests simultaneously. Both threads subsequently attempted `participant.create(...)`.
* **The Failure**: The second request crashed with Prisma unique constraint violation `P2002` on composite key `['userId', 'meetingId']`. Because `joinMeeting` caught this as an unhandled error, it returned a `500 Server error`, rendering a fatal red modal *"Unable to Join Meeting — Server error"* that blocked users from entering the lobby or meeting.
* **The Solution**: 
  1. **Atomic Exception Interception**: The `participant.create` invocation is encapsulated in a dedicated `P2002` error boundary. If a race condition occurs, the handler catches `err.code === 'P2002'`, falls back to fetching the concurrently created participant row, and executes an update with latest role and admission status.
  2. **Supabase Pool Concurrency**: The Prisma connection limit was increased from 5 to 15 connections with an extended pool timeout of 30 seconds (`connection_limit=15&pool_timeout=30`), eliminating transaction pool saturation on Supabase PgBouncer.
  3. **Client-Side Exponential Backoff & In-Flight Lock**: The frontend uses `isJoiningInProgressRef` to serialize join requests and automatically retries transient 500/network errors up to 3 times before presenting any error screen.
  4. **Self-Healing "Try Joining Again" Action**: If a session sync issue ever occurs, the error screen provides a prominent Cobalt *"Try Joining Again"* action that resets the connection lock and seamlessly retries without requiring the user to navigate back to the dashboard.

##### 10.8.2 Acoustic Echo Suppression & TTS Feedback Loop Elimination
In multilingual speech translation meetings, participants rely on Text-to-Speech (TTS) to hear translations spoken aloud in their native tongue. However, naive speech recognition and TTS architectures suffer from a critical acoustic feedback loop:
```
Participant A Speaks: "Hello"
       │
       ▼
Participant B's Browser receives translation -> Plays TTS via speaker: "नमस्ते"
       │
       ▼
Participant B's Microphone captures the sound coming out of B's speakers!
       │
       ▼
Participant B's SpeechRecognition recognizes: "नमस्ते" -> Emits caption:text!
       │
       ▼
Participant A's Browser receives translation -> Plays TTS via speaker: "Hello"
       │
       ▼
Participant A's Microphone captures the speaker sound -> Emits caption:text!
       │
       ▼
[Repeats 5 to 6 times until acoustic distortion kills the ping-pong feedback loop]
```

To eliminate this echo loop, BhashaBridge implements a four-stage **Acoustic Echo Suppression & Deduplication Pipeline**:
1. **TTS Ducking / Mic Suppression (`isTtsPlayingRef`)**:
   - Whenever TTS audio plays (via `window.speechSynthesis` or backend proxy audio), `isTtsPlayingRef.current = true`.
   - Any microphone transcripts delivered by Web Speech API's `rec.onresult` during TTS playback are immediately discarded.
   - A trailing acoustic dissipation buffer (600ms) preserves the suppression flag after audio ends, allowing room reverb and speaker echo to decay completely before speech recognition resumes.
2. **Audio Queue Clearance & Single Utterance Guarantee**:
   - Before dispatching any new speech utterance, `window.speechSynthesis.cancel()` purges any pending audio chunks, preventing the browser audio engine from queuing up cascading speech backlogs.
3. **Multi-Stage Transcript & TTS Deduplication**:
   - **Frontend TTS Cache (`recentTtsMapRef`)**: Prevents playing the exact same translated sentence more than once within 5 seconds.
   - **Outgoing Speech Cache (`lastSpeechEmitRef`)**: Prevents Web Speech API from firing duplicate final transcripts for the same sentence within 3.5 seconds.
   - **Self-Echo Guard (`myLastSpokenTextRef`)**: If an incoming caption received from another peer matches what the current user spoke within the previous 6 seconds, TTS playback is suppressed on the local client.
   - **Socket-Level Deduplication (`socket.lastCaption`)**: The backend socket server drops duplicate `caption:text` payloads arriving from the same client socket within 3 seconds.
4. **Immediate Stream Abort on Mic Mute**:
   - When the user mutes their microphone or the component unmounts, `rec.abort()` immediately dumps Chromium's internal audio buffers and terminates recognition instantly, rather than waiting for graceful buffer drain via `rec.stop()`.

##### 10.8.3 Single-Pulse Audio Demo Architecture
Previously, the meeting room "Demo" button launched an infinite `setInterval(..., 6000)` loop that broadcasted test sentences continuously, confusing users and flooding room audio.
* **Architectural Refactor**: Clicking *"⚡ Test Audio"* sends a single test phrase (*"Hello, this is a live test of the BhashaBridge translation system."*), presents a clear confirmation toast to the user, and automatically resets `isDemoActive = false` after 2.5 seconds. It never runs an uncontrolled background loop.

##### 10.8.4 Multi-Lobby Rejoin Lifecycle, Zombie Socket Eviction & Client Caption Idempotency
A critical compounding failure previously occurred when users navigated back and forth between the lobby and dashboard (e.g. entering and leaving the lobby 4+ times before finally being admitted to the meeting):
1. **The Compounding Failure Mechanism**:
   - Every time a user entered the lobby (`/meeting/:id`), Next.js mounted the component, instantiated a new Socket.IO client, and joined `meeting:join`.
   - When the user clicked *"Leave Waiting Room"*, the backend updated the participant database status to `LEFT` but never called `socket.leave(meeting.id)` or `socket.disconnect(true)`.
   - On subsequent rejoins, the backend did not evict existing sockets for the same user ID. Consequently, entering and leaving the lobby 4 times left **4 zombie sockets** still joined to `meeting.id`.
   - When any participant spoke or triggered the audio demo, `io.to(meeting.id).emit('caption:translated')` dispatched the broadcast to all 4 zombie sockets. In the browser, each socket received the event and called `window.speechSynthesis.speak()`, queueing the exact same translated sentence 4–6 times in series.
   - Each socket connection also triggered duplicate WebRTC peer connections and audio tracks.
   - Finally, while 4–6 TTS utterances played sequentially through the laptop speakers, the unmuted microphone picked up the speaker sound, generating a secondary acoustic echo loop that ping-ponged between participants.

2. **The Multi-Layer Resolution**:
   - **Backend Stale Socket Eviction on `meeting:join`**: On every join request, the server queries `io.in(meeting.id).fetchSockets()`. Any pre-existing socket belonging to the same user ID (`s.userId === userId && s.id !== socket.id`) is actively forced out of all rooms (`s.leave(...)`), notifies peers with `participant:left`, and is forcibly terminated (`s.disconnect(true)`). Only a single authoritative socket per user exists at any time.
   - **Complete Teardown on `waiting:leave`**: When a participant leaves the lobby, the socket server cleans up room memberships across `meeting.id`, `meetingLink`, and `cleanLink`, notifies the host, and immediately calls `socket.disconnect(true)`.
   - **Unique Message ID Client Deduplication (`processedCaptionIdsRef`)**: Every `caption:translated` broadcast includes a unique `id: cap_${speakerId}_${Date.now()}_${nonce}`. The frontend tracks received IDs in a bounded `Set` (`processedCaptionIdsRef.current`). Even in adverse network duplicate delivery conditions, duplicate packets are dropped instantaneously before touching state or `speechSynthesis`.
   - **Client Lifecycle Guard & Singleton Socket**: The frontend meeting component uses cancellation guards during `getUserMedia` and `fetch`. Before creating any new socket, any existing `socketRef.current` has all listeners stripped via `removeAllListeners()` and is disconnected.
   - **Resilient Translation Pipeline with Timeout Boundary**: Translation requests against external neural APIs are bounded with a 4-second timeout race and fallback to MyMemory (`AbortSignal.timeout(3000)`), preventing stalled external HTTP requests from freezing real-time caption dispatch.

