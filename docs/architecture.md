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
│   ├── login/page.js            # Login page
│   └── register/page.js         # Register page
├── dashboard/page.js            # Meeting list, create/join meeting
├── admin/page.js                # Admin panel (org management)
├── invite/[token]/page.js       # Invite link handler
└── meeting/
    └── [id]/
        ├── page.js              # Main meeting room (all logic lives here)
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

### Folder Structure

```
backend/src/
├── server.js                        # Entry point — creates HTTP server, attaches Socket.IO
├── app.js                           # Express app — registers middleware and routes
├── routes/
│   ├── auth.routes.js               # POST /auth/login, /auth/register
│   ├── meeting.routes.js            # POST /meetings, /meetings/:id/join, /admit, /reject, /end
│   ├── organization.routes.js       # Organization CRUD
│   ├── analytics.routes.js          # Meeting analytics endpoints
│   └── admin.routes.js              # Admin-only routes
├── controllers/
│   ├── auth.controller.js           # JWT generation, bcrypt password hashing
│   ├── meeting.controller.js        # Meeting create/join/end logic
│   ├── organization.controller.js   # Org management
│   ├── analytics.controller.js      # Participation time, message stats
│   └── admin.controller.js          # Admin user/org management
├── services/
│   ├── email.service.js             # Nodemailer — invite emails
│   └── translation.service.js       # Translation utility wrapper
└── socket/
    └── index.js                     # All real-time logic (see Section 5)
```

### REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Login, returns JWT |
| POST | `/meetings` | Create a new meeting |
| POST | `/meetings/join/:id` | Join meeting, returns participant status |
| POST | `/meetings/:id/admit` | Host admits a waiting user |
| POST | `/meetings/:id/reject` | Host rejects a waiting user |
| POST | `/meetings/:id/end` | End meeting, log leave time |
| GET | `/analytics/:id` | Get meeting analytics |
| GET | `/admin/users` | Admin: list all users |

---

## 4. Database Schema (Prisma)

```
User
├── id, name, email, password (bcrypt), role
├── organizationId → Organization
└── Meetings (many-to-many via Participant)

Meeting
├── id, meetingCode (e.g. BB-4F0389-89ee), status
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
└── id, name, Users[]
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

## 6. The Live Translation Pipeline (Core Feature)

This is the heart of BhashaBridge. Here is the complete end-to-end flow for speech-to-translated-speech:

```
SIDE A (Speaker)                    SERVER                      SIDE B (Listener)
─────────────────                 ──────────                  ──────────────────
1. User speaks into mic
   │
   ▼
2. Browser Web Speech API
   converts voice → text
   (100% local, no API)
   │
   ▼
3. socket.emit('caption:text',
   { text, language: 'en' })
   ─────────────────────────────►
                                4. Server receives text
                                   Looks up all sockets in room
                                   Reads each socket's userSettings:
                                   - Who wants captionLang?
                                   - Who wants ttsLang?
                                   Builds a Set of unique target languages
                                   │
                                   ▼
                                5. For each unique target language:
                                   translate(text, { to: 'hi', client: 'gtx' })
                                   ↓ if fails → MyMemory API fallback
                                   Builds translations map:
                                   { hi: "नमस्ते, यह एक परीक्षण है" }
                                   │
                                   ▼
                                6. io.to(meetingId).emit('caption:translated', {
                                     text: "Hello, this is a test",
                                     sourceLanguage: 'en',
                                     speakerId: user.id,
                                     senderSocketId: socket.id,  ← key for echo prevention
                                     translations: { hi: "नमस्ते..." }
                                   })
                                   ─────────────────────────────────────────────►
                                                                 7. Frontend receives event
                                                                    Checks senderSocketId !== mySocket.id
                                                                    → Not my own speech, proceed
                                                                    │
                                                                    ▼
                                                                 8. CAPTION: if captionEnabled && captionLang='hi'
                                                                    → Show "नमस्ते..." on screen for 4 seconds
                                                                    │
                                                                    ▼
                                                                 9. TTS AUDIO: if ttsEnabled && ttsLang='hi'
                                                                    → Look up voicesRef.current (pre-cached)
                                                                    → Find voice matching 'hi'
                                                                    → new SpeechSynthesisUtterance("नमस्ते...")
                                                                    → window.speechSynthesis.speak(utt)
                                                                    → Browser speaks Hindi out loud 🔊
```

### Why All Three Steps Are Free

| Step | Technology | Cost |
|------|-----------|------|
| Speech → Text | Browser Web Speech API (Chrome/Edge/Safari) | Free, runs locally |
| Text → Translated Text | `google-translate-api-x` (scrapes Google Translate) | Free, no API key |
| Translated Text → Speech | Browser SpeechSynthesis API | Free, runs locally |

---

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

## 9. Authentication Architecture

- Passwords are hashed with **bcrypt** (10 rounds)
- On login, server signs a **JWT** with the user's id, email, and role
- JWT is stored in `localStorage` on the frontend
- All protected API routes check for `Authorization: Bearer <token>` header
- Admin routes additionally verify `role === 'ADMIN'`

---

## 10. Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend Framework | Next.js 14 (App Router) | SSR + client-side routing |
| UI | React + CSS Modules | Component rendering |
| State | Zustand | Global auth + user settings |
| Real-time Client | Socket.IO Client | WebSocket communication |
| Video/Audio | simple-peer (WebRTC) | P2P video/audio streams |
| Speech-to-Text | Browser Web Speech API | Voice → text (free, local) |
| Text-to-Speech | Browser SpeechSynthesis API | Text → voice (free, local) |
| Backend | Node.js + Express | REST API server |
| Real-time Server | Socket.IO | WebSocket event hub |
| Translation | google-translate-api-x + MyMemory | Free text translation |
| ORM | Prisma | Type-safe database queries |
| Database | PostgreSQL | Persistent data storage |
| Auth | JWT + bcrypt | Secure authentication |
| Email | Nodemailer | Meeting invite emails |
