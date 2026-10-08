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

