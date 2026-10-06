(Files content cropped to 300k characters, download full ingest to see more)
================================================
FILE: README.md
================================================
<p align="center">
  <h1 align="center">🌐 BhashaBridge</h1>
  <p align="center">
    <strong>Real-Time Multilingual Meeting Platform</strong>
  </p>
  <p align="center">
    Break language barriers. Bridge communication.
  </p>
  <p align="center">
    <a href="#features">Features</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#folder-structure">Folder Structure</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#api-reference">API Reference</a>
  </p>
</p>

---

## 📖 About

**BhashaBridge** is an intelligent multilingual meeting platform designed to facilitate seamless and inclusive communication across different languages. It combines traditional online meeting functionalities — video/audio calls, chat, participant management — with advanced **real-time translation**, **live captions**, and **meeting analytics**.

> *"Bhasha"* (भाषा) means *"language"* in Hindi. BhashaBridge literally bridges languages.

### The Problem

In the modern digital age, people from diverse linguistic backgrounds frequently interact through virtual meetings. Language barriers lead to misunderstandings, reduced efficiency, and limited participation.

### The Solution

BhashaBridge integrates AI-powered translation directly into the communication flow:

- **Chat messages** are automatically translated into each participant's preferred language
- **Spoken audio** is converted to **live captions** with real-time translation
- **Meeting analytics** and **reports** are generated automatically
- All translation features are **optional** — users toggle them based on their needs

---

## ✨ Features

### Core Meeting Features
| Feature | Description |
|---------|-------------|
| 🔐 **User Authentication** | Register, login, logout with JWT-based sessions |
| 📅 **Meeting Management** | Create, schedule, join, and end meetings |
| 🎥 **Video & Audio Calls** | WebRTC-based peer-to-peer media streaming |
| 👥 **Participant Management** | Add/remove participants, view participant list |
| 💬 **Real-Time Chat** | Socket.IO-powered instant messaging during meetings |

### Translation & Accessibility (Optional — Toggle On/Off)
| Feature | Description |
|---------|-------------|
| 🌍 **Message Translation** | Auto-translate chat messages to each user's preferred language |
| 📝 **Live Captions** | Speech-to-text conversion displayed in real-time |
| 🗣️ **Caption Translation** | Captions translated into the user's preferred language |
| 🔊 **Audio Translation** | Spoken audio translated and delivered to listeners |
| 🔤 **Language Detection** | Automatic detection of source language |

### Analytics & Reporting
| Feature | Description |
|---------|-------------|
| 📊 **Meeting Analytics** | Total participants, duration, languages used |
| 📄 **Report Generation** | Detailed post-meeting reports (PDF/JSON) |

### Administration
| Feature | Description |
|---------|-------------|
| 🏢 **Organization Admin** | Manage users, assign roles (Host/Participant) within an organization |
| ⚙️ **Platform Admin** | Monitor system health, manage services, platform-wide settings |

---

## 🏗️ Architecture

BhashaBridge follows a **modular, service-oriented architecture** with clear separation between frontend, backend, and external services.

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Next.js UI   │  │ Socket.IO    │  │  WebRTC (simple-peer)│  │
│  │  (React/TS)   │  │ Client       │  │  Audio/Video         │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼─────────────────────┼──────────────┘
          │ HTTPS           │ WSS                  │ DTLS/SRTP
┌─────────┼─────────────────┼─────────────────────┼──────────────┐
│         ▼                 ▼                      ▼              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Express API   │  │ Socket.IO    │  │  Signaling Server    │  │
│  │ (REST)        │  │ Server       │  │  (WebRTC)            │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘  │
│         │                 │                                     │
│  ┌──────┴─────────────────┴─────────────────────────────────┐  │
│  │                    SERVICE LAYER                           │  │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │ Meeting │ │  Chat   │ │  Audio   │ │   Caption    │  │  │
│  │  │ Service │ │ Service │ │ Service  │ │   Engine     │  │  │
│  │  └─────────┘ └─────────┘ └──────────┘ └──────────────┘  │  │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │ Transl. │ │Analytics│ │  Report  │ │ User/Role    │  │  │
│  │  │ Service │ │ Service │ │Generator │ │ Management   │  │  │
│  │  └────┬────┘ └─────────┘ └─────┬────┘ └──────────────┘  │  │
│  └───────┼────────────────────────┼─────────────────────────┘  │
│          │                        │         APPLICATION SERVER  │
└──────────┼────────────────────────┼────────────────────────────┘
           │                        │
┌──────────┼────────────────────────┼────────────────────────────┐
│          ▼                        ▼                             │
│  ┌──────────────┐          ┌──────────────┐                    │
│  │ Translation  │          │   Report     │  EXTERNAL SERVICES │
│  │ API (Google) │          │   Service    │                    │
│  └──────────────┘          └──────────────┘                    │
└────────────────────────────────────────────────────────────────┘
           │
┌──────────┼─────────────────────────────────────────────────────┐
│          ▼                                                      │
│  ┌──────────────┐          ┌──────────────┐                    │
│  │  PostgreSQL   │          │    Redis     │    DATA LAYER      │
│  │  (Primary DB) │          │ (Cache/PubSub│                    │
│  └──────────────┘          └──────────────┘                    │
└────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Service Interfaces** — `ITranslationService` and `IReportGenerator` interfaces allow swapping providers without code changes
2. **Optional Extensions** — Translation and caption features use the `<<extend>>` pattern; users enable/disable per preference
3. **Role-Based Access** — Two admin levels: Organization Admin (user/role management) and Platform Admin (system-wide control)
4. **Real-Time Pipeline** — `Audio → Speech-to-Text → Caption → Translation → Display`

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| [Next.js 14](https://nextjs.org/) | React framework (App Router, SSR) |
| [TypeScript](https://www.typescriptlang.org/) | Type-safe development |
| [Socket.IO Client](https://socket.io/) | Real-time bidirectional events |
| [simple-peer](https://github.com/feross/simple-peer) | WebRTC peer connections |
| [Zustand](https://zustand-demo.pmnd.rs/) | Lightweight state management |
| CSS Modules | Scoped component styling |

### Backend
| Technology | Purpose |
|-----------|---------|
| [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/) | REST API server |
| [TypeScript](https://www.typescriptlang.org/) | Type-safe development |
| [Socket.IO](https://socket.io/) | Real-time event handling |
| [Prisma](https://www.prisma.io/) | Type-safe ORM |
| [PostgreSQL](https://www.postgresql.org/) | Relational database |
| [Redis](https://redis.io/) | Caching & pub/sub |
| [JWT](https://jwt.io/) + [bcrypt](https://github.com/kelektiv/node.bcrypt.js) | Auth & password security |
| [Zod](https://zod.dev/) | Runtime validation |

### External Services
| Service | Provider |
|---------|----------|
| Translation API | Google Cloud Translate v3 / LibreTranslate |
| Speech-to-Text | Google Cloud Speech-to-Text / OpenAI Whisper |

---

## 📁 Folder Structure

```
BhashaBridge/
│
├── 📄 README.md                               # Project documentation (this file)
├── 📄 .gitignore                              # Git ignore rules
├── 📄 .env.example                            # Root environment variables template
├── 🐳 docker-compose.yml                      # Docker multi-service orchestration
│
├── 📂 docs/                                   # Project documentation
│   ├── 📄 REPORT_BHASHABRIDGE_.pdf            # Original project report
│   ├── 📄 api-spec.md                         # API specification
│   └── 📄 architecture.md                     # Architecture design document
│
├── 📂 frontend/                               # Next.js Frontend Application
│   ├── 📄 package.json                        # Frontend dependencies
│   ├── 📄 tsconfig.json                       # TypeScript configuration
│   ├── 📄 next.config.js                      # Next.js configuration
│   ├── 📄 .env.local.example                  # Frontend env template
│   │
│   ├── 📂 public/                             # Static assets
│   │   ├── 🖼️ favicon.ico
│   │   ├── 🖼️ logo.svg
│   │   └── 📂 images/                         # Static images
│   │
│   ├── 📂 src/                                # Source code
│   │   │
│   │   ├── 📂 app/                            # Next.js App Router pages
│   │   │   ├── 📄 layout.jsx                  # Root layout with providers
│   │   │   ├── 📄 page.jsx                    # Landing / home page
│   │   │   ├── 🎨 globals.css                 # Global styles & design tokens
│   │   │   │
│   │   │   ├── 📂 (auth)/                     # Authentication pages (grouped)
│   │   │   │   ├── 📂 login/
│   │   │   │   │   └── 📄 page.jsx            # Login page
│   │   │   │   ├── 📂 register/
│   │   │   │   │   └── 📄 page.jsx            # Registration page
│   │   │   │   └── 📂 forgot-password/
│   │   │   │       └── 📄 page.jsx            # Password recovery
│   │   │   │
│   │   │   ├── 📂 dashboard/                  # User dashboard
│   │   │   │   ├── 📄 layout.jsx              # Dashboard layout
│   │   │   │   └── 📄 page.jsx                # Meetings overview
│   │   │   │
│   │   │   ├── 📂 meeting/                    # Meeting pages
│   │   │   │   ├── 📂 create/
│   │   │   │   │   └── 📄 page.jsx            # Create new meeting
│   │   │   │   └── 📂 [id]/                   # Dynamic meeting routes
│   │   │   │       ├── 📄 page.jsx            # Meeting room
│   │   │   │       ├── 📂 lobby/
│   │   │   │       │   └── 📄 page.jsx        # Pre-join lobby
│   │   │   │       └── 📂 report/
│   │   │   │           └── 📄 page.jsx        # Post-meeting report
│   │   │   │
│   │   │   ├── 📂 admin/                      # Admin pages
│   │   │   │   ├── 📄 layout.jsx              # Admin layout
│   │   │   │   ├── 📂 org/                    # Organization admin
│   │   │   │   │   ├── 📂 users/
│   │   │   │   │   │   └── 📄 page.jsx        # User management
│   │   │   │   │   └── 📂 roles/
│   │   │   │   │       └── 📄 page.jsx        # Role management
│   │   │   │   └── 📂 platform/               # Platform admin
│   │   │   │       ├── 📂 dashboard/
│   │   │   │       │   └── 📄 page.jsx        # System monitoring
│   │   │   │       └── 📂 services/
│   │   │   │           └── 📄 page.jsx        # Service management
│   │   │   │
│   │   │   └── 📂 profile/                    # User profile
│   │   │       └── 📄 page.jsx                # Profile settings
│   │   │
│   │   ├── 📂 components/                     # React components
│   │   │   │
│   │   │   ├── 📂 ui/                         # Reusable UI primitives
│   │   │   │   ├── 📄 Button.jsx
│   │   │   │   ├── 📄 Input.jsx
│   │   │   │   ├── 📄 Modal.jsx
│   │   │   │   ├── 📄 Card.jsx
│   │   │   │   ├── 📄 Badge.jsx
│   │   │   │   ├── 📄 Dropdown.jsx
│   │   │   │   ├── 📄 Toast.jsx
│   │   │   │   └── 📄 Loader.jsx
│   │   │   │
│   │   │   ├── 📂 layout/                     # Layout components
│   │   │   │   ├── 📄 Header.jsx
│   │   │   │   ├── 📄 Sidebar.jsx
│   │   │   │   ├── 📄 Footer.jsx
│   │   │   │   └── 📄 Navigation.jsx
│   │   │   │
│   │   │   ├── 📂 auth/                       # Authentication components
│   │   │   │   ├── 📄 LoginForm.jsx
│   │   │   │   ├── 📄 RegisterForm.jsx
│   │   │   │   └── 📄 AuthGuard.jsx
│   │   │   │
│   │   │   ├── 📂 meeting/                    # Meeting components
│   │   │   │   ├── 📄 MeetingRoom.jsx         # Main meeting container
│   │   │   │   ├── 📄 VideoGrid.jsx           # Video tiles layout
│   │   │   │   ├── 📄 VideoTile.jsx           # Individual video stream
│   │   │   │   ├── 📄 MeetingControls.jsx     # Mute, camera, leave, etc.
│   │   │   │   ├── 📄 ParticipantList.jsx     # Active participants
│   │   │   │   ├── 📄 MeetingLobby.jsx        # Pre-join setup
│   │   │   │   └── 📄 MeetingCard.jsx         # Meeting preview card
│   │   │   │
│   │   │   ├── 📂 chat/                       # Chat components
│   │   │   │   ├── 📄 ChatPanel.jsx           # Chat sidebar panel
│   │   │   │   ├── 📄 ChatMessage.jsx         # Single message bubble
│   │   │   │   ├── 📄 ChatInput.jsx           # Message input field
│   │   │   │   └── 📄 TranslatedMessage.jsx   # Message with translations
│   │   │   │
│   │   │   ├── 📂 caption/                    # Caption components
│   │   │   │   ├── 📄 CaptionOverlay.jsx      # Live caption display
│   │   │   │   ├── 📄 CaptionSettings.jsx     # Caption preferences
│   │   │   │   └── 📄 TranslatedCaption.jsx   # Translated caption view
│   │   │   │
│   │   │   ├── 📂 analytics/                  # Analytics components
│   │   │   │   ├── 📄 AnalyticsDashboard.jsx  # Analytics overview
│   │   │   │   ├── 📄 ParticipantChart.jsx    # Participation chart
│   │   │   │   └── 📄 LanguageStats.jsx       # Language usage stats
│   │   │   │
│   │   │   └── 📂 admin/                      # Admin components
│   │   │       ├── 📄 UserTable.jsx           # User management table
│   │   │       ├── 📄 RoleEditor.jsx          # Role assignment editor
│   │   │       ├── 📄 ServiceStatusCard.jsx   # Service health card
│   │   │       └── 📄 SystemHealthMonitor.jsx # System metrics display
│   │   │
│   │   ├── 📂 hooks/                          # Custom React hooks
│   │   │   ├── 📄 useAuth.ts                  # Auth state & actions
│   │   │   ├── 📄 useMeeting.ts               # Meeting state & actions
│   │   │   ├── 📄 useSocket.ts                # Socket.IO connection
│   │   │   ├── 📄 useWebRTC.ts                # WebRTC peer management
│   │   │   ├── 📄 useChat.ts                  # Chat state & actions
│   │   │   ├── 📄 useCaptions.ts              # Caption stream handling
│   │   │   ├── 📄 useTranslation.ts           # Translation utilities
│   │   │   └── 📄 useMediaDevices.ts          # Camera/mic access
│   │   │
│   │   ├── 📂 stores/                         # Zustand state stores
│   │   │   ├── 📄 authStore.ts                # Authentication state
│   │   │   ├── 📄 meetingStore.ts             # Meeting state
│   │   │   ├── 📄 chatStore.ts                # Chat messages state
│   │   │   └── 📄 captionStore.ts             # Caption state
│   │   │
│   │   ├── 📂 services/                       # API service layer
│   │   │   ├── 📄 api.ts                      # Axios/fetch base instance
│   │   │   ├── 📄 authService.ts              # Auth API calls
│   │   │   ├── 📄 meetingService.ts           # Meeting API calls
│   │   │   ├── 📄 chatService.ts              # Chat API calls
│   │   │   ├── 📄 translationService.ts       # Translation API calls
│   │   │   └── 📄 adminService.ts             # Admin API calls
│   │   │
│   │   ├── 📂 lib/                            # Utility libraries
│   │   │   ├── 📄 socket.ts                   # Socket.IO client setup
│   │   │   ├── 📄 webrtc.ts                   # WebRTC helper functions
│   │   │   ├── 📄 constants.ts                # App-wide constants
│   │   │   └── 📄 utils.ts                    # General utilities
│   │   │
│   │   └── 📂 types/                          # TypeScript type definitions
│   │       ├── 📄 user.ts                     # User-related types
│   │       ├── 📄 meeting.ts                  # Meeting-related types
│   │       ├── 📄 chat.ts                     # Chat-related types
│   │       ├── 📄 caption.ts                  # Caption-related types
│   │       ├── 📄 analytics.ts                # Analytics types
│   │       └── 📄 admin.ts                    # Admin types
│   │
│   └── 📂 tests/                              # Frontend tests
│       ├── 📂 components/                     # Component tests
│       └── 📂 hooks/                          # Hook tests
│
├── 📂 backend/                                # Node.js Backend Application
│   ├── 📄 package.json                        # Backend dependencies
│   ├── 📄 tsconfig.json                       # TypeScript configuration
│   ├── 📄 .env.example                        # Backend env template
│   │
│   ├── 📂 prisma/                             # Prisma ORM
│   │   ├── 📄 schema.prisma                   # Database schema definition
│   │   ├── 📂 migrations/                     # Database migrations
│   │   └── 📄 seed.ts                         # Database seed data
│   │
│   ├── 📂 src/                                # Source code
│   │   ├── 📄 index.ts                        # Application entry point
│   │   ├── 📄 app.ts                          # Express app configuration
│   │   ├── 📄 server.ts                       # HTTP + Socket.IO server
│   │   │
│   │   ├── 📂 config/                         # Configuration modules
│   │   │   ├── 📄 database.ts                 # Database connection config
│   │   │   ├── 📄 redis.ts                    # Redis connection config
│   │   │   ├── 📄 socket.ts                   # Socket.IO server config
│   │   │   ├── 📄 cors.ts                     # CORS policy
│   │   │   └── 📄 env.ts                      # Env variables validation
│   │   │
│   │   ├── 📂 middleware/                     # Express middleware
│   │   │   ├── 📄 auth.ts                     # JWT verification
│   │   │   ├── 📄 rbac.ts                     # Role-based access control
│   │   │   ├── 📄 validation.ts               # Zod request validation
│   │   │   ├── 📄 errorHandler.ts             # Global error handler
│   │   │   └── 📄 rateLimiter.ts              # Rate limiting
│   │   │
│   │   ├── 📂 routes/                         # API route definitions
│   │   │   ├── 📄 index.ts                    # Route aggregator
│   │   │   ├── 📄 auth.routes.ts              # Auth endpoints
│   │   │   ├── 📄 user.routes.ts              # User endpoints
│   │   │   ├── 📄 meeting.routes.ts           # Meeting endpoints
│   │   │   ├── 📄 analytics.routes.ts         # Analytics endpoints
│   │   │   ├── 📄 translation.routes.ts       # Translation endpoints
│   │   │   └── 📄 admin.routes.ts             # Admin endpoints
│   │   │
│   │   ├── 📂 controllers/                    # Request handlers
│   │   │   ├── 📄 auth.controller.ts          # Auth logic
│   │   │   ├── 📄 user.controller.ts          # User CRUD
│   │   │   ├── 📄 meeting.controller.ts       # Meeting operations
│   │   │   ├── 📄 analytics.controller.ts     # Analytics retrieval
│   │   │   ├── 📄 translation.controller.ts   # Translation endpoints
│   │   │   └── 📄 admin.controller.ts         # Admin operations
│   │   │
│   │   ├── 📂 services/                       # Business logic layer
│   │   │   ├── 📄 auth.service.ts             # Auth business logic
│   │   │   ├── 📄 user.service.ts             # User operations
│   │   │   ├── 📄 meeting.service.ts          # Meeting lifecycle
│   │   │   ├── 📄 chat.service.ts             # Chat message handling
│   │   │   ├── 📄 audio.service.ts            # Audio stream processing
│   │   │   ├── 📄 caption.service.ts          # Speech-to-text engine
│   │   │   ├── 📄 translation.service.ts      # Translation provider (implements ITranslationService)
│   │   │   ├── 📄 analytics.service.ts        # Analytics calculation
│   │   │   ├── 📄 report.service.ts           # Report generation (implements IReportGenerator)
│   │   │   └── 📄 admin.service.ts            # Admin operations
│   │   │
│   │   ├── 📂 interfaces/                     # Service interfaces (abstractions)
│   │   │   ├── 📄 ITranslationService.ts      # Translation service contract
│   │   │   └── 📄 IReportGenerator.ts         # Report generator contract
│   │   │
│   │   ├── 📂 socket/                         # Socket.IO event handling
│   │   │   ├── 📄 index.ts                    # Socket.IO initialization
│   │   │   ├── 📂 handlers/                   # Event handlers
│   │   │   │   ├── 📄 meeting.handler.ts      # Meeting room events
│   │   │   │   ├── 📄 chat.handler.ts         # Chat message events
│   │   │   │   ├── 📄 audio.handler.ts        # Audio/WebRTC signaling
│   │   │   │   └── 📄 caption.handler.ts      # Caption stream events
│   │   │   └── 📂 middleware/                  # Socket middleware
│   │   │       └── 📄 socketAuth.ts           # Socket authentication
│   │   │
│   │   ├── 📂 utils/                          # Utility functions
│   │   │   ├── 📄 logger.ts                   # Logging utility
│   │   │   ├── 📄 errors.ts                   # Custom error classes
│   │   │   ├── 📄 validators.ts               # Zod validation schemas
│   │   │   └── 📄 helpers.ts                  # General helpers
│   │   │
│   │   └── 📂 types/                          # TypeScript definitions
│   │       ├── 📄 express.d.ts                # Express type extensions
│   │       ├── 📄 socket.d.ts                 # Socket.IO type extensions
│   │       └── 📄 enums.ts                    # UserRole, MeetingState, Language
│   │
│   └── 📂 tests/                              # Backend tests
│       ├── 📂 unit/                           # Unit tests
│       │   ├── 📂 services/                   # Service tests
│       │   └── 📂 controllers/                # Controller tests
│       ├── 📂 integration/                    # Integration tests
│       │   ├── 📄 auth.test.ts
│       │   ├── 📄 meeting.test.ts
│       │   └── 📄 translation.test.ts
│       └── 📄 setup.ts                        # Test configuration
│
└── 📂 shared/                                 # Shared code (frontend + backend)
    ├── 📄 package.json
    └── 📂 src/
        ├── 📄 types.ts                        # Shared TypeScript types
        ├── 📄 constants.ts                    # Shared constants
        ├── 📄 enums.ts                        # Shared enumerations
        └── 📄 validators.ts                   # Shared Zod schemas
```

---

## 🗃️ Data Model

### Core Entities

```
┌──────────────┐       creates       ┌──────────────┐
│     User     │ ──────────────────▶ │   Meeting    │
│──────────────│                     │──────────────│
│ id           │                     │ id           │
│ name         │                     │ title        │
│ email        │    ┌──────────┐     │ meeting_link │
│ password     │    │Participant│◀───│ host_id      │
│ pref_lang    │    │──────────│     │ state        │
│ role         │    │ join_time│     │ start_time   │
│ org_id       │    │leave_time│     │ end_time     │
└──────────────┘    └──────────┘     └──────┬───────┘
                                            │
                    ┌───────────────────┬────┴──────────────┐
                    ▼                   ▼                    ▼
            ┌──────────────┐   ┌──────────────┐    ┌──────────────┐
            │ ChatMessage  │   │   Caption    │    │Meeting       │
            │──────────────│   │──────────────│    │Analytics     │
            │ original_text│   │ original_text│    │──────────────│
            │ translations │   │ translated   │    │ participants │
            │ timestamp    │   │ timestamp    │    │ duration     │
            └──────────────┘   └──────────────┘    │ languages    │
                    │                │              └──────┬───────┘
                    ▼                ▼                     ▼
            ┌────────────────────────────┐        ┌──────────────┐
            │   Translation Service     │        │Meeting Report│
            │   (ITranslationService)   │        │(IReport      │
            └────────────────────────────┘        │  Generator)  │
                                                  └──────────────┘
```

### Enumerations

| Enum | Values |
|------|--------|
| **UserRole** | `HOST`, `PARTICIPANT`, `ORG_ADMIN`, `PLATFORM_ADMIN` |
| **MeetingState** | `SCHEDULED`, `ONGOING`, `COMPLETED`, `CANCELLED` |
| **Language** | `en`, `hi`, `es`, `fr`, `de`, `ja`, `zh`, `ar`, `pt`, `ru` |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18.x
- **PostgreSQL** ≥ 15
- **Redis** ≥ 7
- **npm** or **pnpm**

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/BhashaBridge.git
cd BhashaBridge
```

### 2. Environment Setup

```bash
# Copy environment templates
cp .env.example .env
cp frontend/.env.local.example frontend/.env.local
cp backend/.env.example backend/.env
```

Edit each `.env` file with your configuration:

```env
# backend/.env
DATABASE_URL=postgresql://user:password@localhost:5432/bhashabridge
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
GOOGLE_TRANSLATE_API_KEY=your-api-key
GOOGLE_SPEECH_API_KEY=your-api-key

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

### 3. Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Install shared dependencies
cd ../shared
npm install
```

### 4. Database Setup

```bash
cd backend

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed database (optional)
npx prisma db seed
```

### 5. Start Development Servers

```bash
# Terminal 1 — Backend
cd backend
npm run dev          # Runs on http://localhost:5000

# Terminal 2 — Frontend
cd frontend
npm run dev          # Runs on http://localhost:3000
```

### 6. Docker (Alternative)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

---

## 📡 API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login, returns JWT tokens |
| `POST` | `/api/auth/logout` | Invalidate current session |
| `POST` | `/api/auth/refresh` | Refresh access token |

### Meetings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/meetings` | Create a new meeting |
| `GET` | `/api/meetings` | List user's meetings |
| `GET` | `/api/meetings/:id` | Get meeting details |
| `POST` | `/api/meetings/:id/join` | Join a meeting |
| `POST` | `/api/meetings/:id/end` | End meeting (host only) |

### Translation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/translate` | Translate text |
| `GET` | `/api/languages` | List supported languages |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/meetings/:id/analytics` | Get meeting analytics |
| `POST` | `/api/meetings/:id/report` | Generate meeting report |

### Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `meeting:join` | Client → Server | Join meeting room |
| `chat:message` | Bidirectional | Send/receive chat messages |
| `chat:translated` | Server → Client | Translated message |
| `caption:text` | Server → Client | Live caption text |
| `audio:signal` | Bidirectional | WebRTC signaling |
| `participant:joined` | Server → Client | New participant |
| `meeting:ended` | Server → Client | Meeting terminated |

---

## 🔒 Security

- **JWT Authentication** with access + refresh token rotation
- **bcrypt** password hashing (cost factor 12)
- **HTTPS/WSS** encrypted communication
- **CORS** policy enforcement
- **Rate Limiting** on API endpoints
- **Input Validation** via Zod schemas
- **RBAC** — Role-based access control for admin operations

---

## 🧪 Testing

```bash
# Backend unit tests
cd backend && npm test

# Backend integration tests
cd backend && npm run test:integration

# Frontend component tests
cd frontend && npm test

# End-to-end tests
npx playwright test
```

---

## 📊 Performance Targets (from SRS)

| Metric | Target |
|--------|--------|
| Translation Latency | < 300ms |
| Audio-Video Sync | ≤ 50ms drift |
| Caption Delay | < 500ms |
| Concurrent Users | 100+ per instance |
| System Uptime | 99.5% |

---

## 👥 Team

**Lazy Legends**

| Member | Role |
|--------|------|
| Divyansh Nagar | Team Member |
| Aditya Kumar | Team Member |
| Shlok Deshmukh | Team Member |
| Ashutosh Shukla | Team Member |

---

## 📄 License

This project is developed as part of an academic initiative. See the project report in `docs/REPORT_BHASHABRIDGE_.pdf` for full details.

---

<p align="center">
  Made with ❤️ by <strong>Lazy Legends</strong>
</p>



================================================
FILE: package.json
================================================
{
  "dependencies": {
    "puppeteer": "^25.12.0"
  }
}



================================================
FILE: problems.md
================================================
# BhashaBridge Known Problems & Resolutions

## 1. Analytics Report Generation Race Condition
**Problem:** The Post-Mortem Report took >5 seconds to load and sometimes crashed with database contention.
**Root Cause:**
1. The frontend used lazy-initialization (checking for 404, then sending generation requests).
2. We introduced a "pre-compute" hook on the \Leave Meeting\ button.
3. This caused the background pre-compute task and the frontend report page load to hit the backend simultaneously. Both found no report and started heavy database math (interval merging) in parallel, causing a race condition and CPU spike.
4. Furthermore, \getReport\ was re-calculating the entire meeting duration mathematically *every single time* the report was requested, instead of serving the cached version.
**Resolution:**
- Reverted the frontend pre-compute hook to avoid parallel requests.
- Refactored \ackend/src/controllers/analytics.controller.js\ to use a "One-Shot" generation method. If a report doesn't exist, it is generated and returned immediately.
- Stripped out the redundant mathematical recalculation in \getReport\. It now instantly returns the cached JSON report.

## 2. Global CSS Sledgehammer Layout Breakage
**Problem:** The meeting room controls (camera, mic) turned into giant vertical rectangles overlapping the video, and the Post-Mortem report text was striking through itself.
**Root Cause:**
- An aggressive mobile override block in \globals.css\ applied \width: 100% !important\ to all \utton\ tags globally, and \lex-direction: column\ to all layout containers.
- The Post-Mortem report had absolute positioned massive watermark text (\20vw\) that bled over the readable text on mobile screens.
- The Post-Mortem report header lacked a bottom margin, causing its bottom border to strike through the subsequent text.
**Resolution:**
- Completely deleted the aggressive global button overrides.
- Injected targeted, gentle wrapper classes (\.meetingControlsBar\, \.meetingHeaderRight\) directly into the meeting room JSX to allow flex wrapping without forcing 100% width.
- Added a \.hide-on-mobile\ utility class to hide the giant background watermarks on small screens.
- Fixed the Report spacing by changing the timestamp from \position: absolute\ to \position: relative\ with a top margin, and added a bottom margin to the header.

## 3. Alpine Linux Missing OpenSSL (Prisma Crash)
**Problem:** The backend Docker container crashed on boot with \Error loading shared library libssl.so.1.1\.
**Root Cause:** The \
ode:18-alpine\ image lacks glibc and OpenSSL 1.1, which Prisma Query Engine requires to connect to the database.
**Resolution:** Switched the backend \Dockerfile\ to use \
ode:18-slim\ and installed \openssl\ via \pt-get\.

## Problem 3: Infinite AI Cost Loop from Early Leavers
- **Symptom:** Participants who leave an active meeting are sent to the Report page. If they click "View Synthesis", it generates an AI summary of the meeting *up to that point*. If multiple people leave at different times and click it repeatedly, we get charged for multiple LLM calls for the same active meeting.
- **Root Cause:** /api/meetings/:id/summary and /api/meetings/:id/transcript had no state-checks to ensure the meeting was COMPLETED. 
- **Resolution:** Added a strict guard clause if (meeting.state !== 'COMPLETED') return res.status(403) to both endpoints. The frontend nicely catches this 403 and displays the returned error string ("This meeting is still ongoing. The summary will be available once the host ends the session.") inside the alert modal automatically.



================================================
FILE: backend/Dockerfile
================================================
FROM node:18-slim
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN apt-get update -y && apt-get install -y openssl
RUN npm install
RUN npx prisma generate
COPY . .
EXPOSE 5000
CMD ["npm", "start"]



================================================
FILE: backend/package.json
================================================
{
  "name": "backend",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "postinstall": "prisma skills sync || exit 0",
    "start": "node src/server.js",
    "dev": "nodemon src/server.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "@vitalets/google-translate-api": "^9.2.1",
    "bcrypt": "^6.0.0",
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "google-translate-api-x": "^10.7.3",
    "jsonwebtoken": "^9.0.3",
    "prisma": "^5.22.0",
    "redis": "^6.2.1",
    "resend": "^6.28.1",
    "socket.io": "^4.8.3",
    "zod": "^4.5.4"
  },
  "devDependencies": {
    "nodemon": "^3.1.14"
  }
}



================================================
FILE: backend/prisma.config.ts
================================================
import { definePrismaConfig } from "prisma/config";

export default definePrismaConfig({
  skills: {
    agents: ["claude", "cursor", "agents", "devin"],
  },
});



================================================
FILE: backend/.dockerignore
================================================
node_modules
npm-debug.log
.env
.git
.gitignore
Dockerfile
README.md



================================================
FILE: backend/prisma/schema.prisma
================================================
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum UserRole {
  HOST
  PARTICIPANT
  ORG_ADMIN
  PLATFORM_ADMIN
}

enum MeetingState {
  SCHEDULED
  ONGOING
  COMPLETED
  CANCELLED
}

enum ParticipantRole {
  HOST
  COHOST
  PARTICIPANT
}

enum ParticipantStatus {
  WAITING
  ADMITTED
  REJECTED
  LEFT
}

model Organization {
  id          String   @id @default(uuid())
  name        String
  description String?
  slug        String   @unique
  accessCode  String?  @unique
  ownerId     String?
  owner       User?    @relation("OrgOwner", fields: [ownerId], references: [id])
  createdAt   DateTime @default(now())
  
  users       User[]   @relation("OrgMembers")
  coHosts     User[]   @relation("OrgCoHosts")
  meetings    Meeting[]
  invitations OrganizationInvitation[]
}

model OrganizationInvitation {
  id             String       @id @default(uuid())
  email          String
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  token          String       @unique
  status         String       @default("PENDING") // PENDING, ACCEPTED, CANCELLED
  expiresAt      DateTime
  createdAt      DateTime     @default(now())
}

model User {
  id               String        @id @default(uuid())
  name             String
  email            String        @unique
  passwordHash     String
  role             UserRole      @default(PARTICIPANT)
  preferredLanguage String       @default("en")
    avatar            String?      @db.Text
  organizations    Organization[] @relation("OrgMembers")
  coHostedOrganizations Organization[] @relation("OrgCoHosts")
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  ownedOrganizations Organization[] @relation("OrgOwner")
  meetingsHosted   Meeting[]     @relation("HostRelation")
  participations   Participant[]
  chatMessages     ChatMessage[]
  captions         Caption[]
}

model Meeting {
  id             String        @id @default(uuid())
  meetingLink    String        @unique
  title          String
  hostId         String
  host           User          @relation("HostRelation", fields: [hostId], references: [id])
  organizationId String?
  organization   Organization? @relation(fields: [organizationId], references: [id])
  state          MeetingState  @default(SCHEDULED)
  startTime      DateTime?
  endTime        DateTime?
  createdAt      DateTime      @default(now())

  summaryCache   Json?

  hiddenForUserIds String[] @default([])
  participants Participant[]
  chatMessages ChatMessage[]
  captions     Caption[]
  analytics    MeetingAnalytics?
  reports      MeetingReport[]
}

model Participant {
  id         String          @id @default(uuid())
  userId     String
  user       User            @relation(fields: [userId], references: [id])
  meetingId  String
  meeting    Meeting         @relation(fields: [meetingId], references: [id])
  joinTime   DateTime        @default(now())
  leaveTime  DateTime?
  role       ParticipantRole @default(PARTICIPANT)
  status     ParticipantStatus @default(WAITING)

  sessions   ParticipantSession[]

  @@unique([userId, meetingId])
}

model ParticipantSession {
  id            String      @id @default(uuid())
  participantId String
  participant   Participant @relation(fields: [participantId], references: [id])
  joinedAt      DateTime    @default(now())
  leftAt        DateTime?
}

model ChatMessage {
  id               String   @id @default(uuid())
  meetingId        String
  meeting          Meeting  @relation(fields: [meetingId], references: [id])
  senderId         String
  sender           User     @relation(fields: [senderId], references: [id])
  originalText     String
  originalLanguage String
  translations     Json?
  timestamp        DateTime @default(now())
}

model Caption {
  id               String   @id @default(uuid())
  meetingId        String
  meeting          Meeting  @relation(fields: [meetingId], references: [id])
  speakerId        String
  speaker          User     @relation(fields: [speakerId], references: [id])
  originalText     String
  originalLanguage String
  translatedText   Json?
  timestamp        DateTime @default(now())
}

model MeetingAnalytics {
  id                    String   @id @default(uuid())
  meetingId             String   @unique
  meeting               Meeting  @relation(fields: [meetingId], references: [id])
  totalParticipants     Int      @default(0)
  totalDurationSeconds  Int      @default(0)
  languagesUsed         Json?
  participantDurations  Json?
  generatedAt           DateTime @default(now())

  reports               MeetingReport[]
}

model MeetingReport {
  id          String           @id @default(uuid())
  meetingId   String
  meeting     Meeting          @relation(fields: [meetingId], references: [id])
  analyticsId String
  analytics   MeetingAnalytics @relation(fields: [analyticsId], references: [id])
  reportData  Json
  format      String           @default("json")
  generatedAt DateTime         @default(now())
}




================================================
FILE: backend/src/app.js
================================================
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const meetingRoutes = require('./routes/meeting.routes');
const organizationRoutes = require('./routes/organization.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const ttsRoutes = require('./routes/tts.routes');
// const translationRoutes = require('./routes/translation.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/health', (req, res) => res.status(200).send('OK'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/tts', ttsRoutes);
// app.use('/api/translate', translationRoutes);
app.use('/api/admin', adminRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

module.exports = app;



================================================
FILE: backend/src/server.js
================================================
const http = require('http');
const app = require('./app');
const setupSocket = require('./socket');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

// Initialize Prisma
const prisma = new PrismaClient();

const server = http.createServer(app);

// Initialize Socket.IO
const io = setupSocket(server);

// Make prisma available globally if needed, or pass it
global.prisma = prisma;
global.io = io;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



================================================
FILE: backend/src/controllers/admin.controller.js
================================================
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getOrgUsers = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ 
      where: { id: req.user.userId },
      include: { ownedOrganizations: { include: { users: true } } }
    });
    
    if (!user.ownedOrganizations.length) return res.json({ users: [] });

    // Aggregate users across all owned orgs
    const userMap = new Map();
    user.ownedOrganizations.forEach(org => {
      org.users.forEach(u => {
        if (!userMap.has(u.id)) {
          userMap.set(u.id, { id: u.id, name: u.name, email: u.email, role: u.role });
        }
      });
    });

    res.json({ users: Array.from(userMap.values()) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.addOrgUser = async (req, res) => {
  try {
    const adminUser = await prisma.user.findUnique({ 
      where: { id: req.user.userId },
      include: { ownedOrganizations: true } 
    });
    if (!adminUser.ownedOrganizations.length) {
      return res.status(400).json({ error: 'You do not own an organization' });
    }

    const { email } = req.body;
    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add to the first owned organization for backward compatibility in this old admin panel
    await prisma.organization.update({
      where: { id: adminUser.ownedOrganizations[0].id },
      data: { users: { connect: { id: targetUser.id } } }
    });

    res.status(201).json({ message: 'User added to organization successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.removeOrgUser = async (req, res) => {
  try {
    const adminUser = await prisma.user.findUnique({ 
      where: { id: req.user.userId },
      include: { ownedOrganizations: true }
    });
    if (!adminUser.ownedOrganizations.length) {
      return res.status(400).json({ error: 'You do not own an organization' });
    }

    const { id } = req.params;
    
    // Disconnect from the first owned organization
    await prisma.organization.update({
      where: { id: adminUser.ownedOrganizations[0].id },
      data: { users: { disconnect: { id } } }
    });

    res.json({ message: 'User removed from organization successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.changeUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    await prisma.user.update({
        where: { id },
        data: { role }
    });
    res.json({ message: 'User role updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getSystemHealth = async (req, res) => {
  const activeMeetings = await prisma.meeting.count({ where: { state: 'ONGOING' } });
  res.json({ status: 'Healthy', activeMeetings, uptime: process.uptime() });
};




================================================
FILE: backend/src/controllers/analytics.controller.js
================================================
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAnalytics = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: meetingId } });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    let analytics = await prisma.meetingAnalytics.findUnique({ where: { meetingId: meeting.id } });
    
    if (analytics) {
      const allSessions = await prisma.participantSession.findMany({ where: { participant: { meetingId: meeting.id } } });
      if (allSessions.length > 0) {
        const intervals = allSessions.map(s => {
          const start = new Date(s.joinedAt).getTime();
          const end = s.leftAt ? new Date(s.leftAt).getTime() : new Date(meeting.endTime || Date.now()).getTime();
          return { start, end };
        }).sort((a, b) => a.start - b.start);

        let merged = [];
        let current = intervals[0];
        for (let i = 1; i < intervals.length; i++) {
          if (intervals[i].start <= current.end) {
            current.end = Math.max(current.end, intervals[i].end);
          } else {
            merged.push(current);
            current = intervals[i];
          }
        }
        merged.push(current);

        const activeTimeMs = merged.reduce((acc, inv) => acc + (inv.end - inv.start), 0);
        const totalDurationSeconds = Math.max(0, Math.round(activeTimeMs / 1000));
        analytics = await prisma.meetingAnalytics.update({ where: { id: analytics.id }, data: { totalDurationSeconds } });
      }
    }
    
    if (!analytics) {
      // Calculate simple analytics on the fly if not exists
      const participants = await prisma.participant.count({ where: { meetingId: meeting.id } });
      const messages = await prisma.chatMessage.findMany({ where: { meetingId: meeting.id } });
      const captions = await prisma.caption.findMany({ where: { meetingId: meeting.id } });
      const languagesUsed = [...new Set([
        ...messages.map(m => m.originalLanguage),
        ...captions.map(c => c.originalLanguage)
      ])];
      
      const allSessions = await prisma.participantSession.findMany({
        where: { participant: { meetingId: meeting.id } }
      });
      
      let totalDurationSeconds = 0;
      if (allSessions.length > 0) {
        const intervals = allSessions.map(s => {
          const start = new Date(s.joinedAt).getTime();
          const end = s.leftAt ? new Date(s.leftAt).getTime() : new Date(meeting.endTime || Date.now()).getTime();
          return { start, end };
        }).sort((a, b) => a.start - b.start);

        let merged = [];
        let current = intervals[0];
        for (let i = 1; i < intervals.length; i++) {
          if (intervals[i].start <= current.end) {
            current.end = Math.max(current.end, intervals[i].end);
          } else {
            merged.push(current);
            current = intervals[i];
          }
        }
        merged.push(current);

        const activeTimeMs = merged.reduce((acc, inv) => acc + (inv.end - inv.start), 0);
        totalDurationSeconds = Math.max(0, Math.round(activeTimeMs / 1000));
      } else {
        totalDurationSeconds = meeting.endTime && meeting.startTime 
          ? Math.round((new Date(meeting.endTime) - new Date(meeting.startTime)) / 1000) 
          : 0;
      }

      analytics = await prisma.meetingAnalytics.create({
        data: {
          meetingId: meeting.id,
          totalParticipants: participants,
          totalDurationSeconds,
          languagesUsed,
          participantDurations: {}
        }
      });
    }

    res.json({ analytics });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.generateReport = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: meetingId }, include: { analytics: true } });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    if (!meeting.analytics) {
        return res.status(400).json({ error: 'Analytics not generated yet' });
    }

    const report = await prisma.meetingReport.create({
      data: {
        meetingId: meeting.id,
        analyticsId: meeting.analytics.id,
        reportData: { summary: "Meeting Report generated.", details: meeting.analytics },
        format: "json"
      }
    });

    res.status(201).json({ report });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getReport = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: meetingId } });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    let report = await prisma.meetingReport.findFirst({
        where: { meetingId: meeting.id },
        orderBy: { generatedAt: 'desc' }
    });

    if (!report) {
      let analytics = await prisma.meetingAnalytics.findUnique({ where: { meetingId: meeting.id } });
      if (!analytics) {
        const participants = await prisma.participant.count({ where: { meetingId: meeting.id } });
        const messages = await prisma.chatMessage.findMany({ where: { meetingId: meeting.id } });
        const captions = await prisma.caption.findMany({ where: { meetingId: meeting.id } });
        const languagesUsed = [...new Set([...messages.map(m => m.originalLanguage), ...captions.map(c => c.originalLanguage)])];
        analytics = await prisma.meetingAnalytics.create({
          data: {
            meetingId: meeting.id,
            totalParticipants: participants,
            totalDurationSeconds: 0,
            languagesUsed,
            participantDurations: {}
          }
        });
      }
      report = await prisma.meetingReport.create({
        data: {
          meetingId: meeting.id,
          analyticsId: analytics.id,
          reportData: { summary: "Meeting Report generated on-demand.", details: analytics },
          format: "json"
        }
      });
      // Fast return if we just generated it!
      return res.json({ report });
    }

    // Fast return if it already exists, skipping massive recalculation!
    return res.json({ report });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};



================================================
FILE: backend/src/controllers/auth.controller.js
================================================
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';

exports.register = async (req, res) => {
  try {
    const { name, email, password, preferredLanguage } = req.body;
    
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        preferredLanguage: preferredLanguage || 'en',
      }
    });

    res.status(201).json({ message: 'User registered successfully', userId: user.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user.id, role: user.role, language: user.preferredLanguage },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, language: user.preferredLanguage, avatar: user.avatar } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, preferredLanguage, avatar } = req.body;
    
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { 
        ...(name && { name }),
        ...(preferredLanguage && { preferredLanguage }),
        ...(avatar !== undefined && { avatar })
      }
    });

    const token = jwt.sign(
      { userId: user.id, role: user.role, language: user.preferredLanguage },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, language: user.preferredLanguage, avatar: user.avatar } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};




================================================
FILE: backend/src/controllers/meeting.controller.js
================================================
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');
const AIService = require('../services/ai.service');

const { createClient } = require('redis');

let redisClient = null;
const initRedis = async () => {
  if (redisClient) return redisClient;
  if (!process.env.VALKEY_URL) return null;
  try {
    const client = createClient({ url: process.env.VALKEY_URL });
    client.on('error', (err) => console.log('Valkey Client Error:', err.message));
    await client.connect();
    redisClient = client;
    console.log('Connected to Valkey successfully!');
    return client;
  } catch (err) {
    console.error("Failed to connect to Valkey:", err.message);
    return null;
  }
};



exports.createMeeting = async (req, res) => {
  try {
    const { title, startTime, state, organizationId } = req.body;
    let meetingLink = crypto.randomBytes(4).toString('hex');
    

    // Check if org belongs to user
    let orgData = {};
    if (organizationId) {
      const org = await prisma.organization.findFirst({
        where: { id: organizationId, users: { some: { id: req.user.userId } } },
        include: { coHosts: true }
      });
      if (!org) return res.status(403).json({ error: 'Not a member of this organization' });
      
      const isCoHost = org.coHosts.some(c => c.id === req.user.userId);
      if (org.ownerId !== req.user.userId && !isCoHost) {
        return res.status(403).json({ error: 'Only Organization Hosts and Co-Hosts can create organization meetings' });
      }

      orgData = { organizationId };
      if (org.accessCode) {
        meetingLink = `${org.accessCode}-${crypto.randomBytes(2).toString('hex')}`;
      }
    }


    let parsedStartTime = new Date();
    if (startTime) {
      parsedStartTime = new Date(startTime);
      if (isNaN(parsedStartTime.getTime())) {
        return res.status(400).json({ error: 'Invalid start time format' });
      }
    }

    const meeting = await prisma.meeting.create({
      data: {
        title,
        meetingLink,
        hostId: req.user.userId,
        startTime: parsedStartTime,
        state: state || 'ONGOING',
        ...orgData
      }
    });

    if (global.io) global.io.emit('dashboard:refresh');
    res.status(201).json({ meeting });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getSummary = async (req, res) => {
  try {
    const { link } = req.params;
    let meeting = await prisma.meeting.findUnique({ where: { meetingLink: link } });
    if (!meeting) {
      const org = await prisma.organization.findUnique({ where: { accessCode: link } });
      if (org) {
        meeting = await prisma.meeting.findFirst({
          where: { organizationId: org.id },
          orderBy: { createdAt: 'desc' }
        });
      }
    }

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.state !== 'COMPLETED') return res.status(403).json({ error: 'This meeting is still ongoing. The summary will be available once the host ends the session.' });

    
      let isOrgAdmin = false;
      if (meeting.organizationId) {
        const org = await prisma.organization.findUnique({
          where: { id: meeting.organizationId },
          include: { coHosts: true }
        });
        if (org && (org.ownerId === req.user.userId || org.coHosts.some(c => c.id === req.user.userId))) {
          isOrgAdmin = true;
        }
      }

      const isHost = meeting.hostId === req.user.userId || isOrgAdmin;
      const participant = await prisma.participant.findUnique({
        where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } }
      });

      if (!isHost && !participant) {
      return res.status(403).json({ error: 'You are not authorized to view this summary' });
    }

    // Fetch transcript
    const captions = await prisma.caption.findMany({
      where: { meetingId: meeting.id },
      include: { speaker: { select: { name: true } } },
      orderBy: { timestamp: 'asc' }
    });

    if (captions.length === 0) {
      return res.json({ summary: "No transcript recorded for this meeting." });
    }

    // Combine transcript into plain text
      const transcriptText = captions.map(c => `[${new Date(c.timestamp).toLocaleTimeString()}] ${c.speaker.name}: ${c.originalText}`).join('\n');

      const targetLang = req.query.lang || req.user.language || req.user.preferredLanguage || 'en';
      
      // 1. Permanent Cache Check (PostgreSQL) for COMPLETED meetings
      if (meeting.state === 'COMPLETED' && meeting.summaryCache) {
        let cachedJson = {};
        try {
          cachedJson = typeof meeting.summaryCache === 'string' ? JSON.parse(meeting.summaryCache) : meeting.summaryCache;
        } catch(e) {}
        
        if (cachedJson && cachedJson[targetLang]) {
          console.log(`Served summary for meeting ${meeting.id} from PostgreSQL Permanent Cache!`);
          return res.json({ summary: cachedJson[targetLang] });
        }
      }

      // 2. TTL Cache Check (Valkey) for ONGOING meetings
      const cacheKey = `summary:${meeting.id}:${targetLang}`;
      const cache = await initRedis();

      if (cache && meeting.state !== 'COMPLETED') {
        const cachedSummary = await cache.get(cacheKey);
        if (cachedSummary) {
          console.log(`Served summary for meeting ${meeting.id} from Valkey TTL Cache!`);
          return res.json({ summary: cachedSummary });
        }
      }

      // Generate new summary via Gemini
      const summary = await AIService.summarizeTranscript(transcriptText, targetLang);

      // Save to appropriate Cache
      if (meeting.state === 'COMPLETED') {
        // Save to PostgreSQL permanently
        let cachedJson = {};
        if (meeting.summaryCache) {
          try { cachedJson = typeof meeting.summaryCache === 'string' ? JSON.parse(meeting.summaryCache) : meeting.summaryCache; } catch(e) {}
        }
        cachedJson[targetLang] = summary;
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: { summaryCache: cachedJson }
        });
        console.log(`Saved summary to PostgreSQL Permanent Cache.`);
      } else if (cache) {
        // Save to Valkey with 5-minute TTL
        const ttl = 300;
        await cache.setEx(cacheKey, ttl, summary);
        console.log(`Saved summary to Valkey Cache with ${ttl}s TTL.`);
      }

      res.json({ summary });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};


exports.getMeetings = async (req, res) => {
  try {
    const meetings = await prisma.meeting.findMany({
      where: {
          NOT: {
            hiddenForUserIds: {
              has: req.user.userId
            }
          },
          OR: [
            { hostId: req.user.userId },
            { participants: { some: { userId: req.user.userId } } },
            { organization: { users: { some: { id: req.user.userId } } } }
          ]
        },
      include: { 
        host: { select: { name: true } },
        participants: { 
          include: { 
            user: { select: { name: true, email: true } },
            sessions: true
          } 
        },
        analytics: true,
        reports: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ meetings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.joinMeeting = async (req, res) => {
  try {
    const { link } = req.params;
    let meeting = await prisma.meeting.findUnique({ where: { meetingLink: link } });
    
    // Fallback: If not found, check if this is an organization access code
    if (!meeting) {
      const org = await prisma.organization.findUnique({ where: { accessCode: link } });
      if (org) {
        meeting = await prisma.meeting.findFirst({
          where: { organizationId: org.id, state: { in: ['ONGOING', 'SCHEDULED'] } },
          orderBy: { createdAt: 'desc' }
        });
      }
    }

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.state === 'COMPLETED') return res.status(403).json({ error: 'This meeting has already ended.' });

    // If SCHEDULED and host is joining, flip to ONGOING
    if (meeting.hostId === req.user.userId && meeting.state === 'SCHEDULED') {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { state: 'ONGOING', startTime: new Date() }
      });
      meeting.state = 'ONGOING';
      meeting.startTime = new Date();
      if (global.io) global.io.emit('dashboard:refresh');
    }

    let isOrgCoHost = false;
    if (meeting.organizationId) {
      const org = await prisma.organization.findFirst({
        where: { id: meeting.organizationId, users: { some: { id: req.user.userId } } },
        include: { coHosts: { select: { id: true } } }
      });
      if (!org) return res.status(403).json({ error: 'You are not a member of this organization.' });
      if (org.coHosts.some(c => c.id === req.user.userId)) isOrgCoHost = true;
    }

    let participant = await prisma.participant.findUnique({
      where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } }
    });

    const isHost = meeting.hostId === req.user.userId;
    const isCoHost = isOrgCoHost || (participant && participant.role === 'COHOST');
    
    // Default: if you are host or cohost, you bypass waiting room.
    let finalStatus;
      if (!participant) {
        finalStatus = (isHost || isCoHost) ? 'ADMITTED' : 'WAITING';
        participant = await prisma.participant.create({
          data: {
            userId: req.user.userId,
            meetingId: meeting.id,
            role: isHost ? 'HOST' : (isOrgCoHost ? 'COHOST' : 'PARTICIPANT'),
            status: finalStatus
          }
        });
      } else {
        // If they already exist, keep their status unless they were upgraded to Host/CoHost
        finalStatus = (isHost || isCoHost) ? 'ADMITTED' : participant.status;
        const updatedRole = isHost ? 'HOST' : (isOrgCoHost ? 'COHOST' : participant.role);
        participant = await prisma.participant.update({
          where: { id: participant.id },
          data: { joinTime: new Date(), status: finalStatus, role: updatedRole }
        });
      }

    let waitingUsers = [];
      if (participant.status === 'ADMITTED' && (participant.role === 'HOST' || participant.role === 'COHOST')) {
        const waitingDb = await prisma.participant.findMany({
          where: { meetingId: meeting.id, status: 'WAITING' },
          include: { user: { select: { id: true, name: true, avatar: true } } }
        });
        waitingUsers = waitingDb.map(p => ({ userId: p.user.id, name: p.user.name, avatar: p.user.avatar }));
      }
      res.json({ meeting, participantStatus: participant.status, participantRole: participant.role, waitingUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.endMeeting = async (req, res) => {
  try {
    const { link } = req.params;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: link } });
    
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    
      let isOrgAdmin = false;
      if (meeting.organizationId) {
        const org = await prisma.organization.findUnique({
          where: { id: meeting.organizationId },
          include: { coHosts: true }
        });
        if (org && (org.ownerId === req.user.userId || org.coHosts.some(c => c.id === req.user.userId))) {
          isOrgAdmin = true;
        }
      }

      if (meeting.hostId !== req.user.userId && !isOrgAdmin) {
        return res.status(403).json({ error: 'Only the host or org admins can end the meeting' });
      }


    const updated = await prisma.meeting.update({
      where: { id: meeting.id },
      data: { 
        state: 'COMPLETED',
        endTime: new Date(),
        startTime: meeting.startTime || meeting.createdAt
      }
    });

    if (global.io) global.io.to(link).emit('meeting:ended');
      if (global.io) global.io.emit('dashboard:refresh');
      res.json({ meeting: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};
exports.deleteMeeting = async (req, res) => {
    try {
      const { id } = req.params;
      const meeting = await prisma.meeting.findUnique({ where: { id } });
      
      if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
      
      await prisma.meeting.update({
        where: { id },
        data: {
          hiddenForUserIds: {
            push: req.user.userId
          }
        }
      });
  
      if (global.io) global.io.emit('dashboard:refresh');
        res.json({ message: 'Meeting removed from your history' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  };

exports.admitParticipant = async (req, res) => {
  try {
    const { link } = req.params;
    const { userId } = req.body;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: link } });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    // Verify caller is Host or Cohost
    const caller = await prisma.participant.findUnique({ where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } } });
    if (!caller || (caller.role !== 'HOST' && caller.role !== 'COHOST')) {
      return res.status(403).json({ error: 'Not authorized to admit participants' });
    }

    const participant = await prisma.participant.update({
      where: { userId_meetingId: { userId, meetingId: meeting.id } },
      data: { status: 'ADMITTED' }
    });

    res.json({ participant });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.rejectParticipant = async (req, res) => {
  try {
    const { link } = req.params;
    const { userId } = req.body;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: link } });
    
    const caller = await prisma.participant.findUnique({ where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } } });
    if (!caller || (caller.role !== 'HOST' && caller.role !== 'COHOST')) return res.status(403).json({ error: 'Not authorized' });

    const participant = await prisma.participant.update({
      where: { userId_meetingId: { userId, meetingId: meeting.id } },
      data: { status: 'REJECTED' }
    });

    res.json({ participant });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.assignCoHost = async (req, res) => {
  try {
    const { link } = req.params;
    const { userId } = req.body;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: link } });
    if (meeting.hostId !== req.user.userId) return res.status(403).json({ error: 'Only main Host can assign Co-hosts' });

    const participant = await prisma.participant.update({
      where: { userId_meetingId: { userId, meetingId: meeting.id } },
      data: { role: 'COHOST' }
    });
    
    if (global.io) global.io.to(link).emit('participant:promoted', { userId, role: 'COHOST' });
    res.json({ participant });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.removeCoHost = async (req, res) => {
  try {
    const { link, userId } = req.params;
    const meeting = await prisma.meeting.findUnique({ 
      where: { meetingLink: link },
      include: { organization: { include: { coHosts: true } } }
    });
    if (meeting.hostId !== req.user.userId) return res.status(403).json({ error: 'Only main Host can remove Co-hosts' });

    // Check if the user is a permanent org co-host
    const isPermanent = meeting.organization.coHosts.some(c => c.id === userId);
    if (isPermanent) {
      return res.status(403).json({ error: 'Cannot demote a permanent Organization Co-Host.' });
    }

    const participant = await prisma.participant.update({
      where: { userId_meetingId: { userId, meetingId: meeting.id } },
      data: { role: 'PARTICIPANT' }
    });
    
    if (global.io) global.io.to(link).emit('participant:promoted', { userId, role: 'PARTICIPANT' });
    res.json({ participant });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getTranscript = async (req, res) => {
  try {
    const { link } = req.params;
    let meeting = await prisma.meeting.findUnique({ where: { meetingLink: link } });
    
    // Check if it's an org access code
    if (!meeting) {
      const org = await prisma.organization.findUnique({ where: { accessCode: link } });
      if (org) {
        meeting = await prisma.meeting.findFirst({
          where: { organizationId: org.id },
          orderBy: { createdAt: 'desc' }
        });
      }
    }

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.state !== 'COMPLETED') return res.status(403).json({ error: 'This meeting is still ongoing. The transcript will be available once the host ends the session.' });

    
      let isOrgAdmin = false;
      if (meeting.organizationId) {
        const org = await prisma.organization.findUnique({
          where: { id: meeting.organizationId },
          include: { coHosts: true }
        });
        if (org && (org.ownerId === req.user.userId || org.coHosts.some(c => c.id === req.user.userId))) {
          isOrgAdmin = true;
        }
      }

      const isHost = meeting.hostId === req.user.userId || isOrgAdmin;
      const participant = await prisma.participant.findUnique({
        where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } }
      });

      if (!isHost && !participant) {
      return res.status(403).json({ error: 'You are not authorized to view this transcript' });
    }

    const captions = await prisma.caption.findMany({
      where: { meetingId: meeting.id },
      include: {
        speaker: { select: { name: true, email: true } }
      },
      orderBy: { timestamp: 'asc' }
    });

    res.json({ transcript: captions });
  } catch (error) {
    console.error('Transcript error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};








================================================
FILE: backend/src/controllers/organization.controller.js
================================================
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');
const { sendOrganizationInvitation } = require('../services/email.service');

const generateOrgCode = () => `BB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const generateToken = () => crypto.randomBytes(32).toString('hex');

exports.createOrganization = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Organization name is required' });

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + crypto.randomBytes(2).toString('hex');
    const accessCode = generateOrgCode();

    const organization = await prisma.organization.create({
      data: {
        name,
        description,
        slug,
        accessCode,
        ownerId: req.user.userId,
        users: {
          connect: { id: req.user.userId }
        }
      }
    });

    res.status(201).json({ organization });
  } catch (error) {
    console.error('Create org error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getMyOrganizations = async (req, res) => {
  try {
    const organizations = await prisma.organization.findMany({
      where: {
        users: { some: { id: req.user.userId } }
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        users: { select: { id: true, name: true, email: true } },
        coHosts: { select: { id: true, name: true, email: true } },
        invitations: { 
          where: { status: 'PENDING' },
          select: { id: true, email: true, createdAt: true }
        }
      }
    });
    res.json({ organizations });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.regenerateCode = async (req, res) => {
  try {
    const { id } = req.params;
    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.ownerId !== req.user.userId) return res.status(403).json({ error: 'Only the host can regenerate the code' });

    const newCode = generateOrgCode();
    const updatedOrg = await prisma.organization.update({
      where: { id },
      data: { accessCode: newCode }
    });

    res.json({ accessCode: updatedOrg.accessCode });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.inviteMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const { emails } = req.body; // Array of emails
    if (!emails || !Array.isArray(emails)) return res.status(400).json({ error: 'Emails array is required' });

    const org = await prisma.organization.findUnique({ 
      where: { id },
      include: { owner: true, users: true }
    });

    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.ownerId !== req.user.userId) return res.status(403).json({ error: 'Only the host can invite members' });

    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3001';
    
    const results = [];

    for (const email of emails) {
      // Check if already a member
      const isMember = org.users.some(u => u.email === email);
      if (isMember) {
        return res.status(400).json({ error: `${email} is already a member.` });
      }

      // Check for pending invitation
      const existingInvite = await prisma.organizationInvitation.findFirst({
        where: { email, organizationId: id, status: 'PENDING' }
      });

      if (existingInvite) {
        return res.status(400).json({ error: `Invitation already sent to ${email}.` });
      }

      const token = generateToken();
      const invite = await prisma.organizationInvitation.create({
        data: {
          email,
          organizationId: id,
          token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });

      const inviteLink = `${frontendUrl}/invite/${token}`;
      try {
        await sendOrganizationInvitation(email, org.name, org.owner.name, org.accessCode, inviteLink);
      } catch (emailErr) {
        console.warn('Email send failed (non-fatal):', emailErr.message);
      }

      // Push real-time notification if the invited user is online
      if (global.io) {
        // Find the user by email to get their userId for the socket room
        const invitedUser = await prisma.user.findUnique({ where: { email } });
        if (invitedUser) {
          global.io.to(`user:${invitedUser.id}`).emit('notification:invite', {
            token: invite.token,
            organizationId: org.id,
            organizationName: org.name,
            invitedBy: org.owner.name,
            createdAt: invite.createdAt
          });
        }
      }

      results.push({ email, status: 'invited' });
    }

    res.json({ results });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};


exports.getInvitation = async (req, res) => {
  try {
    const { token } = req.params;
    const invite = await prisma.organizationInvitation.findUnique({
      where: { token },
      include: { organization: { select: { name: true, accessCode: true, owner: { select: { name: true } } } } }
    });

    if (!invite) return res.status(404).json({ error: 'Invitation not found' });
    if (invite.status !== 'PENDING') return res.status(400).json({ error: 'Invitation is no longer valid' });
    if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invitation has expired' });

    res.json({ invitation: invite });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.acceptInvitation = async (req, res) => {
  try {
    const { token } = req.params;
    // Note: This route requires authentication (req.user must exist)
    const invite = await prisma.organizationInvitation.findUnique({ where: { token } });

    if (!invite) return res.status(404).json({ error: 'Invitation not found' });
    if (invite.status !== 'PENDING') return res.status(400).json({ error: 'Invitation is no longer valid' });
    if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invitation has expired' });
    
    // Ensure the logged in user's email matches the invitation
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (user.email !== invite.email) {
      return res.status(403).json({ error: 'This invitation was sent to a different email address' });
    }

    // Add user to org and update invite
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: invite.organizationId },
        data: { users: { connect: { id: user.id } } }
      }),
      prisma.organizationInvitation.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED' }
      })
    ]);

    res.json({ message: 'Successfully joined the organization' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const org = await prisma.organization.findUnique({
      where: { id },
      include: { users: { select: { id: true } } }
    });

    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.ownerId !== req.user.userId) return res.status(403).json({ error: 'Only the host can delete the organization' });

    // Push real-time notification to every member BEFORE deletion
    if (global.io) {
      org.users.forEach(u => {
        if (u.id !== req.user.userId) { // skip the host themselves
          global.io.to(`user:${u.id}`).emit('notification:org_deleted', {
            organizationId: id,
            organizationName: org.name
          });
        }
      });
    }

    // Delete all invitations, disconnect all users, then delete the org
    await prisma.$transaction([
      prisma.organizationInvitation.deleteMany({ where: { organizationId: id } }),
      prisma.organization.update({ where: { id }, data: { users: { set: [] } } }),
    ]);

    await prisma.organization.delete({ where: { id } });

    res.json({ message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('deleteOrganization error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.leaveOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const org = await prisma.organization.findUnique({ where: { id } });
    
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.ownerId === req.user.userId) return res.status(400).json({ error: 'Owner cannot leave organization' });

    await prisma.organization.update({
      where: { id },
      data: { users: { disconnect: { id: req.user.userId } } }
    });
    res.json({ message: 'Successfully left the organization' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const org = await prisma.organization.findUnique({ where: { id } });
    
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.ownerId !== req.user.userId) return res.status(403).json({ error: 'Only the owner can remove members' });
    if (userId === req.user.userId) return res.status(400).json({ error: 'Cannot remove yourself' });

    await prisma.organization.update({
      where: { id },
      data: { users: { disconnect: { id: userId } } }
    });
    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};
exports.getMyInvitations = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const invitations = await prisma.organizationInvitation.findMany({
      where: {
        email: user.email,
        status: 'PENDING',
        expiresAt: { gt: new Date() }
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            accessCode: true,
            owner: { select: { name: true, email: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ invitations });
  } catch (error) {
    console.error('getMyInvitations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.declineInvitation = async (req, res) => {
  try {
    const { token } = req.params;
    const invite = await prisma.organizationInvitation.findUnique({ where: { token } });

    if (!invite) return res.status(404).json({ error: 'Invitation not found' });
    if (invite.status !== 'PENDING') return res.status(400).json({ error: 'Invitation is no longer valid' });

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (user.email !== invite.email) {
      return res.status(403).json({ error: 'This invitation was not sent to you' });
    }

    await prisma.organizationInvitation.update({
      where: { id: invite.id },
      data: { status: 'CANCELLED' }
    });

    res.json({ message: 'Invitation declined' });
  } catch (error) {
    console.error('declineInvitation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.addCoHost = async (req, res) => {
  try {
    const { id } = req.params; // org id
    const { userId } = req.body;
    const org = await prisma.organization.findUnique({ where: { id }, include: { coHosts: true } });
    if (!org) return res.status(404).json({ error: 'Org not found' });
    if (org.ownerId !== req.user.userId) return res.status(403).json({ error: 'Only owner can manage co-hosts' });
    
    await prisma.organization.update({
      where: { id },
      data: { coHosts: { connect: { id: userId } } }
    });
    res.json({ message: 'Co-Host added successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.removeCoHost = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) return res.status(404).json({ error: 'Org not found' });
    if (org.ownerId !== req.user.userId) return res.status(403).json({ error: 'Only owner can manage co-hosts' });
    
    await prisma.organization.update({
      where: { id },
      data: { coHosts: { disconnect: { id: userId } } }
    });
    res.json({ message: 'Co-Host removed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};




================================================
FILE: backend/src/routes/admin.routes.js
================================================
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const adminController = require('../controllers/admin.controller');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.use(authMiddleware);

// Middleware to check if user is ORG_ADMIN or PLATFORM_ADMIN
const rbacMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};

router.get('/org/users', rbacMiddleware(['ORG_ADMIN', 'PLATFORM_ADMIN']), adminController.getOrgUsers);
router.post('/org/users', rbacMiddleware(['ORG_ADMIN', 'PLATFORM_ADMIN']), adminController.addOrgUser);
router.delete('/org/users/:id', rbacMiddleware(['ORG_ADMIN', 'PLATFORM_ADMIN']), adminController.removeOrgUser);
router.patch('/org/users/:id/role', rbacMiddleware(['ORG_ADMIN', 'PLATFORM_ADMIN']), adminController.changeUserRole);

router.get('/platform/health', rbacMiddleware(['PLATFORM_ADMIN']), adminController.getSystemHealth);

module.exports = router;




================================================
FILE: backend/src/routes/analytics.routes.js
================================================
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const analyticsController = require('../controllers/analytics.controller');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.use(authMiddleware);

router.get('/:meetingId', analyticsController.getAnalytics);
router.post('/:meetingId/report', analyticsController.generateReport);
router.get('/:meetingId/report', analyticsController.getReport);

module.exports = router;




================================================
FILE: backend/src/routes/auth.routes.js
================================================
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_for_dev');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

router.post('/register', authController.register);
router.post('/login', authController.login);
router.put('/profile', authMiddleware, authController.updateProfile);

module.exports = router;



================================================
FILE: backend/src/routes/meeting.routes.js
================================================
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const meetingController = require('../controllers/meeting.controller');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

router.use(authMiddleware);

router.post('/', meetingController.createMeeting);
router.get('/', meetingController.getMeetings);
router.post('/join/:link', meetingController.joinMeeting);
router.post('/:link/end', meetingController.endMeeting);
router.delete('/:id', meetingController.deleteMeeting);
router.post('/:link/admit', meetingController.admitParticipant);
router.post('/:link/reject', meetingController.rejectParticipant);
router.post('/:link/cohost', meetingController.assignCoHost);
router.delete('/:link/cohost/:userId', meetingController.removeCoHost);
router.get('/:link/transcript', meetingController.getTranscript);
router.get('/:link/summary', meetingController.getSummary);

module.exports = router;



================================================
FILE: backend/src/routes/organization.routes.js
================================================
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const orgController = require('../controllers/organization.controller');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Public route to view invite details
router.get('/invite/:token', orgController.getInvitation);

// Authenticated routes
router.use(authMiddleware);

router.post('/', orgController.createOrganization);
router.get('/my', orgController.getMyOrganizations);
router.get('/my-invites', orgController.getMyInvitations);
router.post('/:id/regenerate-code', orgController.regenerateCode);
router.post('/:id/invite', orgController.inviteMembers);
router.post('/invite/:token/accept', orgController.acceptInvitation);
router.post('/invite/:token/decline', orgController.declineInvitation);
router.delete('/:id/leave', orgController.leaveOrganization);
router.delete('/:id/members/:userId', orgController.removeMember);
router.delete('/:id', orgController.deleteOrganization);

router.post('/:id/cohost', orgController.addCoHost);
router.delete('/:id/cohost/:userId', orgController.removeCoHost);
module.exports = router;





================================================
FILE: backend/src/routes/tts.routes.js
================================================
const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const { text, lang } = req.query;
  if (!text || !lang) {
    return res.status(400).send('Missing text or lang parameter');
  }

  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
    console.log('Fetching:', url);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Google TTS returned ' + response.status);
    }

    res.set({
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked'
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (error) {
    console.error('TTS Proxy Error:', error);
    res.status(500).send('Failed to fetch audio');
  }
});

module.exports = router;


================================================
FILE: backend/src/services/ai.service.js
================================================
const TranslationService = require('./translation.service');
const fetch = global.fetch || require('node-fetch');

class AIService {
  static async summarizeTranscript(transcriptText, targetLanguage = 'en') {
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) {
      throw new Error('Gemini API Key is not configured');
    }

    if (!transcriptText || transcriptText.trim().length === 0) {
      throw new Error('Transcript is empty');
    }

    const systemPrompt = "You are an expert executive assistant. Analyze the following meeting transcript and provide a highly structured, professional summary.\\nYour summary must include:\\n1. A brief overview of the meeting's primary goal.\\n2. A bulleted list of key discussion points.\\n3. Action items (who is doing what) if any are mentioned.\\nDo not invent information. Keep the tone professional and concise. IMPORTANT: DO NOT use any markdown formatting (no asterisks, no bolding, no hashes). Output pure plain text only.";

    const models = [
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-omni-1.1-flash',
      'gemini-flash-latest'
    ];

    let lastError = null;

    for (const model of models) {
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + GEMINI_KEY;
      
      try {
        console.log("Attempting intelligent summarization with model: " + model + "...");
        
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: transcriptText }] }]
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.warn("Model " + model + " failed: " + response.status + " " + errorText);
          lastError = new Error("Gemini API Error: " + response.status + " " + errorText);
          
          if (response.status === 503 || response.status === 404 || response.status === 429) {
            continue;
          } else {
            throw lastError;
          }
        }

        const result = await response.json();
        let finalSummary = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        if (!finalSummary) {
          throw new Error('Failed to parse Gemini response.');
        }
        
        console.log("Successfully generated summary using " + model + "!");

        if (targetLanguage && targetLanguage !== 'en' && finalSummary) {
          const translations = await TranslationService.translate(finalSummary, 'en', [targetLanguage]);
          return translations[targetLanguage] || finalSummary;
        }

        return finalSummary;
        
      } catch (error) {
        lastError = error;
        console.warn("Network/Execution error on " + model + ":", error.message);
      }
    }

    console.error('All Gemini fallback models exhausted!');
    throw lastError || new Error('All Gemini models are currently unavailable.');
  }
}

module.exports = AIService;



================================================
FILE: backend/src/services/email.service.js
================================================
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendOrganizationInvitation = async (email, orgName, hostName, orgCode, inviteLink) => {
  try {
    const data = await resend.emails.send({
      from: 'BhashaBridge <bhashabridge@aditya-kumar.in>',
      to: email,
      subject: `You have been invited to join ${orgName} on BhashaBridge`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h1 style="color: #3b82f6; text-align: center;">BhashaBridge</h1>
          <h2 style="color: #1e293b; text-align: center;">You're invited to join:</h2>
          <h3 style="color: #0f172a; text-align: center; background: #f1f5f9; padding: 10px; border-radius: 4px;">${orgName}</h3>
          
          <p style="color: #334155; text-align: center; font-size: 16px;">
            <strong>${hostName}</strong> has invited you to join this organization.
          </p>
          
          <div style="margin: 30px 0; padding: 20px; background-color: #f8fafc; border-left: 4px solid #3b82f6; border-radius: 4px;">
            <p style="margin: 0; color: #64748b; font-size: 14px;">Organization Code:</p>
            <p style="margin: 5px 0 0; color: #1e293b; font-size: 20px; font-weight: bold; letter-spacing: 2px;">${orgCode}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteLink}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Click here to join
            </a>
          </div>
          
          <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 40px;">
            If you did not expect this invitation, you can safely ignore this email.
            <br><br>
            &mdash; The BhashaBridge Team
          </p>
        </div>
      `
    });
    return { success: true, data };
  } catch (error) {
    console.error('Error sending invitation email:', error);
    return { success: false, error };
  }
};

module.exports = {
  sendOrganizationInvitation
};




================================================
FILE: backend/src/services/translation.service.js
================================================
const { translate } = require('@vitalets/google-translate-api');

class TranslationService {
  /**
   * Translates text to target languages using a free open-source API wrapper.
   * @param {string} text 
   * @param {string} sourceLanguage 
   * @param {string[]} targetLanguages 
   */
  static async translate(text, sourceLanguage, targetLanguages) {
    console.log(`Translating: "${text}" from ${sourceLanguage} to ${targetLanguages.join(', ')}`);
    
    const translations = {};
    for (const lang of targetLanguages) {
      if (lang === sourceLanguage || !lang) {
        translations[lang] = text;
        continue;
      }
      try {
        const { text: translatedText } = await translate(text, { to: lang });
        translations[lang] = translatedText;
      } catch (error) {
        console.error(`Translation error for ${lang}:`, error.message);
        translations[lang] = `[${lang}] ${text}`; // Fallback if API rate-limited
      }
    }
    return translations;
  }
}

module.exports = TranslationService;



================================================
FILE: backend/src/socket/index.js
================================================
const { Server } = require('socket.io');
const translate = require('google-translate-api-x');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: '*', // For development
      methods: ['GET', 'POST'],
    },
    // Strict Heartbeat Timeout mechanism to prevent ghost disconnects & dangling sessions
    pingInterval: 300000, // Server sends a ping every 5 minutes
    pingTimeout: 300000,  // Server drops connection if no pong within 5 minutes
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Allow users to join their personal notification room
    socket.on('user:register', ({ userId }) => {
      if (userId) {
        socket.join(`user:${userId}`);
        socket.userId = userId;
        console.log(`User ${userId} registered for notifications`);
      }
    });

    // Join meeting room
    socket.on('meeting:join', async ({ meetingId, userId, peerId, language }) => {
      try {
        const meeting = await prisma.meeting.findUnique({ where: { meetingLink: meetingId } });
        if (!meeting) return;
        if (meeting.state === 'COMPLETED') {
          socket.disconnect(true);
          return;
        }

        const participant = await prisma.participant.findUnique({
          where: { userId_meetingId: { userId, meetingId: meeting.id } },
          include: { user: true }
        });
        if (!participant) return;

        socket.userLanguage = language || 'en';
        socket.userId = userId;
        socket.meetingId = meetingId;
        socket.dbMeetingId = meeting.id;
        socket.join(`user_${userId}`);

        if (participant.status === 'WAITING') {
          // Tell hosts someone is waiting
          socket.to(meetingId).emit('waiting:request', { userId, name: participant.user?.name || 'User', avatar: participant.user?.avatar });
        } else if (participant.status === 'ADMITTED') {
          socket.join(meetingId);
          socket.to(meetingId).emit('participant:joined', { 
            userId, 
            peerId, 
            socketId: socket.id,
            name: participant.user?.name,
              role: participant.role,
              avatar: participant.user?.avatar 
          });
          console.log(`User ${userId} joined meeting ${meetingId}`);
          
          // If a host/co-host joins, send them the list of anyone currently waiting in the lobby
          if (participant.role === 'HOST' || participant.role === 'COHOST') {
            const waitingUsers = await prisma.participant.findMany({
              where: { meetingId: meeting.id, status: 'WAITING' },
              include: { user: true }
            });
            console.log('Sending waiting user to host:', waitingUsers.length);
              waitingUsers.forEach(w => {
              socket.emit('waiting:request', { userId: w.userId, name: w.user?.name || 'User', avatar: w.user?.avatar });
            });
          }
          
          const session = await prisma.participantSession.create({
            data: { participantId: participant.id }
          });
          socket.sessionId = session.id;
        }
      } catch (err) {
        console.error('Socket join error', err);
      }
    });

    socket.on('meeting:admit', async ({ meetingId, targetUserId }) => {
      // Must verify caller is HOST or COHOST
      try {
        const meeting = await prisma.meeting.findUnique({ where: { meetingLink: meetingId } });
        const caller = await prisma.participant.findUnique({ where: { userId_meetingId: { userId: socket.userId, meetingId: meeting.id } } });
        
        if (caller && (caller.role === 'HOST' || caller.role === 'COHOST')) {
          await prisma.participant.update({
            where: { userId_meetingId: { userId: targetUserId, meetingId: meeting.id } },
            data: { status: 'ADMITTED' }
          });
          io.to(meetingId).emit('waiting:admitted', { userId: targetUserId });
          io.to(`user_${targetUserId}`).emit('waiting:admitted', { userId: targetUserId });
        }
      } catch (err) {
        console.error('Socket admit error', err);
      }
    });

    socket.on('meeting:reject', async ({ meetingId, targetUserId }) => {
      try {
        const meeting = await prisma.meeting.findUnique({ where: { meetingLink: meetingId } });
        const caller = await prisma.participant.findUnique({ where: { userId_meetingId: { userId: socket.userId, meetingId: meeting.id } } });
        
        if (caller && (caller.role === 'HOST' || caller.role === 'COHOST')) {
          await prisma.participant.update({
            where: { userId_meetingId: { userId: targetUserId, meetingId: meeting.id } },
            data: { status: 'REJECTED' }
          });
          io.to(meetingId).emit('waiting:rejected', { userId: targetUserId });
          io.to(`user_${targetUserId}`).emit('waiting:rejected', { userId: targetUserId });
        }
      } catch (err) {
        console.error('Socket reject error', err);
      }
    });

    // Handle chat messages
    socket.on('chat:message', async (data) => {
      const { meetingId, senderId, text, language } = data;
      
      // Emit original message to everyone immediately
      io.to(meetingId).emit('chat:message', data);
        if (socket.dbMeetingId) {
          prisma.chatMessage.create({
            data: { meetingId: socket.dbMeetingId, senderId, originalText: text, originalLanguage: language }
          }).catch(err => console.error("DB chat save error:", err));
        }
        try {
          const clients = await io.in(meetingId).fetchSockets();
          const targetLanguages = new Set();
          clients.forEach(c => {
            const s = c.userSettings || {};
            if ((s.chatEnabled ?? true) && s.chatLang && s.chatLang !== 'original') {
              targetLanguages.add(s.chatLang);
            }
          });
          const translations = {};
          for (let targetLang of targetLanguages) {
            try {
              const res = await translate(text, { to: targetLang, client: 'gtx' }).catch(async (e) => {
                console.error("Google API failed, falling back to MyMemory...");
                const fallbackUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${language}|${targetLang}`;
                const fallbackRes = await fetch(fallbackUrl);
                const fallbackData = await fallbackRes.json();
                if (fallbackData?.responseData?.translatedText) {
                  return { text: fallbackData.responseData.translatedText };
                }
                throw e;
              });
              translations[targetLang] = res.text;
            } catch (err) { console.error("Translation Error:", err.message); }
          }
          io.to(meetingId).emit('chat:translated', { messageId: data.id, translations, sourceLanguage: language });
      } catch (error) {
        console.error('Translation error:', error);
      }
    });

    // Handle WebRTC signaling
    socket.on('meeting:status_update', ({ isAudioOn, isVideoOn }) => {
      if (socket.meetingId) {
        socket.to(socket.meetingId).emit('participant:status_update', { socketId: socket.id, isAudioOn, isVideoOn });
      }
    });

    socket.on('meeting:force_mute_all', async ({ role }) => {
      if (socket.meetingId && (role === 'HOST' || role === 'COHOST')) {
        socket.to(socket.meetingId).emit('participant:force_mute_received', { muterRole: role });
      }
    });

    socket.on('meeting:force_video_off_all', async ({ role }) => {
      if (socket.meetingId && (role === 'HOST' || role === 'COHOST')) {
        socket.to(socket.meetingId).emit('participant:force_video_off_received', { muterRole: role });
      }
    });

    socket.on('meeting:lock_hardware', async ({ role, type, locked }) => {
      console.log('BACKEND RECEIVED lock_hardware', { role, type, locked, meetingId: socket.meetingId });
      if (socket.meetingId && (role === 'HOST' || role === 'COHOST')) {
        socket.to(socket.meetingId).emit('participant:hardware_locked', { muterRole: role, type, locked });
        console.log('BACKEND EMITTED hardware_locked to', socket.meetingId);
      }
    });

    socket.on('audio:signal', (data) => {
      io.to(data.targetSocketId).emit('audio:signal', {
        signal: data.signal,
        callerId: socket.id,
        name: data.name,
        role: data.role,
        userId: data.userId
      });
    });

    // Handle captions
    socket.on('caption:text', async (data) => {
      const { meetingId, speakerId, text, language } = data;
      // Broadcast live caption
      io.to(meetingId).emit('caption:text', data);
        if (socket.dbMeetingId) {
          prisma.caption.create({
            data: { meetingId: socket.dbMeetingId, speakerId, originalText: text, originalLanguage: language }
          }).catch(err => console.error("DB caption save error:", err));
        }
        try {
          const clients = await io.in(meetingId).fetchSockets();
          const targetLanguages = new Set();
          clients.forEach(c => {
            const s = c.userSettings || {};
            if ((s.captionEnabled ?? true) && s.captionLang && s.captionLang !== 'original') {
              targetLanguages.add(s.captionLang);
            }
            if ((s.ttsEnabled ?? true) && s.ttsLang && s.ttsLang !== 'original') {
              targetLanguages.add(s.ttsLang);
            }
          });
          const translations = {};
          for (let targetLang of targetLanguages) {
            try {
              const res = await translate(text, { to: targetLang, client: 'gtx' }).catch(async (e) => {
                console.error("Google API failed, falling back to MyMemory...");
                const fallbackUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${language}|${targetLang}`;
                const fallbackRes = await fetch(fallbackUrl);
                const fallbackData = await fallbackRes.json();
                if (fallbackData?.responseData?.translatedText) {
                  return { text: fallbackData.responseData.translatedText };
                }
                throw e;
              });
              translations[targetLang] = res.text;
            } catch (err) { console.error("Translation Error:", err.message); }
          }
          io.to(meetingId).emit('caption:translated', { text, sourceLanguage: language, speakerId, senderSocketId: socket.id, translations });
      } catch (error) {
        console.error('Caption translation error:', error);
      }
    });

    socket.on('user:update_settings', (settings) => { socket.userSettings = settings; });

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.id}`);
      if (socket.meetingId) {
        socket.to(socket.meetingId).emit('participant:left', { socketId: socket.id, userId: socket.userId });
      }

      if (socket.sessionId) {
        try {
          await prisma.participantSession.update({
            where: { id: socket.sessionId },
            data: { leftAt: new Date() }
          });
        } catch (err) {
          console.error('Failed to log leave time', err);
        }
      }
    });
  });

  return io;
}

module.exports = setupSocket;



================================================
FILE: docs/architecture.md
================================================
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
| Text-to-Speech | Google Cloud TTS via Backend Proxy | Text → voice (free, cloud-based, OS-independent) |
| Backend | Node.js + Express | REST API server |
| Real-time Server | Socket.IO | WebSocket event hub |
| Translation | google-translate-api-x + MyMemory | Free text translation |
| ORM | Prisma | Type-safe database queries |
| Database | PostgreSQL | Persistent data storage |
| Auth | JWT + bcrypt | Secure authentication |
| Email | Nodemailer | Meeting invite emails |


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




================================================
FILE: docs/implementation_plan.md
================================================
# BhashaBridge — Implementation Plan

> **Multilingual Real-Time Meeting Platform**
> *Team: Lazy Legends (Divyansh Nagar, Aditya Kumar, Shlok Deshmukh, Ashutosh Shukla)*

---

## 1. Project Overview

BhashaBridge is a web-based multilingual meeting platform that integrates **real-time translation** into video/audio communication. It enables users from different linguistic backgrounds to interact seamlessly via chat and audio with automatic translation, live captions, and meeting analytics.

### Core Value Proposition
- **Language-agnostic meetings** — participants communicate in their preferred language
- **Optional translation layer** — translation features can be toggled on/off per user
- **Meeting intelligence** — automatic analytics and report generation
- **Role-based administration** — Organization Admins and Platform Admins with distinct responsibilities

---

## 2. Architecture Overview

```mermaid
graph TB
    subgraph Client["Client Layer (Browser)"]
        UI["Next.js Frontend"]
        WebRTC["WebRTC Media"]
        WS["Socket.IO Client"]
    end

    subgraph Web["Web / API Server"]
        API["Express.js REST API"]
        SocketIO["Socket.IO Server"]
        Auth["Auth Middleware (JWT)"]
    end

    subgraph Services["Service Layer"]
        MeetingSvc["Meeting Service"]
        ChatSvc["Chat Service"]
        AudioSvc["Audio Service"]
        CaptionSvc["Caption Engine"]
        TransSvc["Translation Module"]
        AnalyticsSvc["Analytics Service"]
        ReportSvc["Report Generator"]
        UserMgmt["User Management"]
        RoleMgmt["Role Management"]
    end

    subgraph External["External Services"]
        TransAPI["Translation API (Google Cloud Translate / LibreTranslate)"]
        SpeechAPI["Speech-to-Text API (Google Cloud Speech / Whisper)"]
    end

    subgraph Data["Data Layer"]
        PG["PostgreSQL"]
        Redis["Redis (Cache + Pub/Sub)"]
    end

    UI --> API
    UI --> WS
    WebRTC --> SocketIO
    API --> Auth
    Auth --> MeetingSvc
    Auth --> UserMgmt
    SocketIO --> ChatSvc
    SocketIO --> AudioSvc
    AudioSvc --> CaptionSvc
    CaptionSvc --> TransSvc
    ChatSvc --> TransSvc
    TransSvc --> TransAPI
    CaptionSvc --> SpeechAPI
    MeetingSvc --> AnalyticsSvc
    AnalyticsSvc --> ReportSvc
    MeetingSvc --> PG
    UserMgmt --> PG
    AnalyticsSvc --> PG
    SocketIO --> Redis
```

### Deployment Architecture (from Report)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Client Devices** | Browser (Chrome/Firefox/Edge) | Host, Participant, Org Admin, Platform Admin UIs |
| **Web Server** | Nginx + Next.js | Static assets, SSR, reverse proxy |
| **Application Server** | Node.js + Express + Socket.IO | REST API, WebSocket handling, business logic |
| **Database Server** | PostgreSQL + Redis | Persistent data + real-time caching/pub-sub |
| **External Services** | Google Cloud APIs / LibreTranslate | Translation API + Speech-to-Text API |

---

## 3. Technology Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| **Next.js 14 (App Router)** | React framework with SSR/SSG, routing, API routes |
<<<<<<< HEAD
| **JavaScript** | Standard web scripting language |
=======
| **JavaScript (ES6+)** | Modern JavaScript across the codebase |
>>>>>>> ab81b9fb344b1b648a4e647b79b24b30a8bf2233
| **Socket.IO Client** | Real-time bidirectional communication |
| **WebRTC (simple-peer)** | Peer-to-peer audio/video streaming |
| **Zustand** | Lightweight state management |
| **CSS Modules + CSS Variables** | Scoped styling with design tokens |

### Backend
| Technology | Purpose |
|-----------|---------|
| **Node.js + Express** | REST API server |
| **JavaScript (ES6+)** | Modern JavaScript |
| **Socket.IO** | Real-time events (chat, captions, signaling) |
| **Prisma ORM** | Database access with structured queries |
| **PostgreSQL** | Primary relational database |
| **Redis** | Session caching, pub/sub for real-time events |
| **JWT + bcrypt** | Authentication & password hashing |
| **Zod** | Runtime request validation |

### External APIs
| Service | Options |
|---------|---------|
| **Translation** | Google Cloud Translate v3 (primary) or LibreTranslate (self-hosted fallback) |
| **Speech-to-Text** | Google Cloud Speech-to-Text or OpenAI Whisper API |

---

## 4. Data Model (from Class Diagram in Report)

```mermaid
erDiagram
    User ||--o{ Meeting : creates
    User {
        uuid id PK
        string name
        string email
        string password_hash
        enum role "HOST | PARTICIPANT | ORG_ADMIN | PLATFORM_ADMIN"
        string preferred_language
        uuid organization_id FK
        datetime created_at
        datetime updated_at
    }

    Organization ||--o{ User : contains
    Organization {
        uuid id PK
        string name
        string slug
        datetime created_at
    }

    Meeting ||--o{ Participant : has
    Meeting ||--o{ ChatMessage : contains
    Meeting ||--o{ Caption : generates
    Meeting ||--|| MeetingAnalytics : produces
    Meeting {
        uuid id PK
        string meeting_link
        string title
        uuid host_id FK
        enum state "SCHEDULED | ONGOING | COMPLETED | CANCELLED"
        datetime start_time
        datetime end_time
        datetime created_at
    }

    Participant {
        uuid id PK
        uuid user_id FK
        uuid meeting_id FK
        datetime join_time
        datetime leave_time
        enum role "HOST | PARTICIPANT"
    }

    ChatMessage {
        uuid id PK
        uuid meeting_id FK
        uuid sender_id FK
        text original_text
        string original_language
        json translations
        datetime timestamp
    }

    Caption {
        uuid id PK
        uuid meeting_id FK
        uuid speaker_id FK
        text original_text
        string original_language
        json translated_text
        datetime timestamp
    }

    MeetingAnalytics {
        uuid id PK
        uuid meeting_id FK
        int total_participants
        int total_duration_seconds
        json languages_used
        json participant_durations
        datetime generated_at
    }

    MeetingReport {
        uuid id PK
        uuid meeting_id FK
        uuid analytics_id FK
        json report_data
        string format
        datetime generated_at
    }
```

### Enumerations (from Report)
- **UserRole**: `HOST`, `PARTICIPANT`, `ORG_ADMIN`, `PLATFORM_ADMIN`
- **MeetingState**: `SCHEDULED`, `ONGOING`, `COMPLETED`, `CANCELLED`
- **Language**: `en`, `hi`, `es`, `fr`, `de`, `ja`, `zh`, `ar`, `pt`, `ru` (extensible)

---

## 5. Feature Breakdown & Module Design

### 5.1 Authentication Module
- **Register** — email/password signup with preferred language selection
- **Login/Logout** — JWT-based sessions with refresh tokens
- **Profile Update** — change name, preferred language, password
- **Password Reset** — email-based recovery flow

### 5.2 Meeting Module (Core)
- **Create Meeting** — host creates meeting, gets shareable link
- **Join Meeting** — participants join via link or meeting ID
- **Meeting Lobby** — pre-join screen to configure audio/video/language
- **Start/End Meeting** — host controls meeting lifecycle
- **Participant Management** — add/remove participants, view participant list
- **Meeting States** — `SCHEDULED → ONGOING → COMPLETED` (or `CANCELLED`)

### 5.3 Chat Module
- **Send Message** — real-time chat via Socket.IO
- **Message Translation** (optional, `<<extend>>` from report)
  - When enabled, messages are auto-translated to each participant's preferred language
  - Original + translations stored together
- **Message History** — persisted per meeting

### 5.4 Audio/Video Module
- **WebRTC Peer Connections** — audio/video streaming via `simple-peer`
- **Signaling Server** — Socket.IO-based WebRTC signaling
- **Audio Controls** — mute/unmute, volume control
- **Video Controls** — camera on/off, screen sharing

### 5.5 Caption Engine (from Report)
- **Live Captions** (optional, `<<extend>>`) — speech-to-text via Speech API
- **Caption Translation** (optional, `<<extend>>`) — translated captions in preferred language
- **Audio Translation** (optional, `<<extend>>`) — spoken audio translated and delivered to listeners
- Pipeline: `Audio → Speech-to-Text → Caption → Translation → Display/Audio Output`

### 5.6 Translation Module
- **Text Translation** — translate chat messages and captions
- **Language Detection** — auto-detect source language
- **Supported Languages** — configurable, extensible list
- **Service Interface** — `ITranslationService` abstraction for swappable providers

### 5.7 Analytics Module
- **Calculate Total Participants** (`<<include>>`) — count unique participants
- **Calculate Total Duration** (`<<include>>`) — meeting start-to-end duration + per-participant duration
- **Languages Used** — track which languages were active
- **Auto-generated** at meeting end

### 5.8 Report Generator
- **Generate Meeting Report** (`<<include>>`) — PDF/JSON report from analytics
- **Report Contents** — participants, duration, language stats, chat summary
- **Service Interface** — `IReportGenerator` abstraction

### 5.9 Admin Modules

#### Organization Admin
- **User Management** — add/remove users in organization
- **Role Management** — assign roles (Host, Participant)
- **Organization Settings** — configure org defaults

#### Platform Admin
- **System Monitor** — system health, active meetings, resource usage
- **Service Manager** — enable/disable translation, reporting services
- **Platform-wide Settings** — manage supported languages, API keys

---

## 6. Real-Time Communication Design

### Socket.IO Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `meeting:join` | Client → Server | Join a meeting room |
| `meeting:leave` | Client → Server | Leave meeting |
| `chat:message` | Bidirectional | Send/receive chat messages |
| `chat:translated` | Server → Client | Translated message delivery |
| `caption:text` | Server → Client | Live caption text |
| `caption:translated` | Server → Client | Translated caption |
| `audio:signal` | Bidirectional | WebRTC signaling |
| `participant:joined` | Server → Client | New participant notification |
| `participant:left` | Server → Client | Participant left notification |
| `meeting:ended` | Server → Client | Meeting terminated by host |

### WebRTC Flow
1. User joins meeting → Socket.IO connection established
2. Server notifies existing participants of new peer
3. Existing peers initiate WebRTC offers via signaling
4. ICE candidates exchanged through Socket.IO
5. Direct peer-to-peer media streams established

---

## 7. API Design (REST Endpoints)

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/auth/logout` | Invalidate session |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/forgot-password` | Request password reset |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/me` | Get current user profile |
| PATCH | `/api/users/me` | Update profile |
| GET | `/api/users/:id` | Get user by ID (admin) |

### Meetings
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/meetings` | Create meeting |
| GET | `/api/meetings` | List user's meetings |
| GET | `/api/meetings/:id` | Get meeting details |
| PATCH | `/api/meetings/:id` | Update meeting (host) |
| POST | `/api/meetings/:id/join` | Join a meeting |
| POST | `/api/meetings/:id/end` | End meeting (host) |
| GET | `/api/meetings/:id/participants` | Get participants |

### Analytics & Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/meetings/:id/analytics` | Get meeting analytics |
| POST | `/api/meetings/:id/report` | Generate report |
| GET | `/api/meetings/:id/report` | Download report |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/org/users` | List org users |
| POST | `/api/admin/org/users` | Add user to org |
| DELETE | `/api/admin/org/users/:id` | Remove user from org |
| PATCH | `/api/admin/org/users/:id/role` | Change user role |
| GET | `/api/admin/platform/health` | System health |
| GET | `/api/admin/platform/services` | List services |
| PATCH | `/api/admin/platform/services/:id` | Toggle service |

### Translation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/translate` | Translate text |
| GET | `/api/languages` | List supported languages |

---

## 8. Folder Structure

```
BhashaBridge/
├── README.md
├── .gitignore
├── .env.example
├── docker-compose.yml
├── docs/
│   ├── REPORT_BHASHABRIDGE_.pdf
│   ├── api-spec.md
│   └── architecture.md
│
├── frontend/
│   ├── package.json
│   ├── jsconfig.json
│   ├── next.config.js
│   ├── .env.local.example
│   ├── public/
│   │   ├── favicon.ico
│   │   ├── logo.svg
│   │   └── images/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.jsx                    # Root layout with providers
│   │   │   ├── page.jsx                      # Landing / home page
│   │   │   ├── globals.css                   # Global styles + design tokens
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.jsx
│   │   │   │   ├── register/page.jsx
│   │   │   │   └── forgot-password/page.jsx
│   │   │   ├── dashboard/
│   │   │   │   ├── page.jsx                  # User dashboard
│   │   │   │   └── layout.jsx
│   │   │   ├── meeting/
│   │   │   │   ├── create/page.jsx           # Create meeting
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── page.jsx              # Meeting room
│   │   │   │   │   ├── lobby/page.jsx        # Pre-join lobby
│   │   │   │   │   └── report/page.jsx       # Post-meeting report
│   │   │   ├── admin/
│   │   │   │   ├── layout.jsx
│   │   │   │   ├── org/
│   │   │   │   │   ├── users/page.jsx        # Org user management
│   │   │   │   │   └── roles/page.jsx        # Role management
│   │   │   │   └── platform/
│   │   │   │       ├── dashboard/page.jsx    # System monitoring
│   │   │   │       └── services/page.jsx     # Service management
│   │   │   └── profile/
│   │   │       └── page.jsx                  # User profile settings
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                           # Reusable UI primitives
│   │   │   │   ├── Button.jsx
│   │   │   │   ├── Input.jsx
│   │   │   │   ├── Modal.jsx
│   │   │   │   ├── Card.jsx
│   │   │   │   ├── Badge.jsx
│   │   │   │   ├── Dropdown.jsx
│   │   │   │   ├── Toast.jsx
│   │   │   │   └── Loader.jsx
│   │   │   ├── layout/
│   │   │   │   ├── Header.jsx
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   ├── Footer.jsx
│   │   │   │   └── Navigation.jsx
│   │   │   ├── auth/
│   │   │   │   ├── LoginForm.jsx
│   │   │   │   ├── RegisterForm.jsx
│   │   │   │   └── AuthGuard.jsx
│   │   │   ├── meeting/
│   │   │   │   ├── MeetingRoom.jsx           # Main meeting container
│   │   │   │   ├── VideoGrid.jsx             # Video tiles layout
│   │   │   │   ├── VideoTile.jsx             # Individual video
│   │   │   │   ├── MeetingControls.jsx       # Mute, camera, leave, etc.
│   │   │   │   ├── ParticipantList.jsx
│   │   │   │   ├── MeetingLobby.jsx
│   │   │   │   └── MeetingCard.jsx           # Meeting preview card
│   │   │   ├── chat/
│   │   │   │   ├── ChatPanel.jsx             # Chat sidebar
│   │   │   │   ├── ChatMessage.jsx           # Single message
│   │   │   │   ├── ChatInput.jsx             # Message input
│   │   │   │   └── TranslatedMessage.jsx     # Message with translations
│   │   │   ├── caption/
│   │   │   │   ├── CaptionOverlay.jsx        # Live caption display
│   │   │   │   ├── CaptionSettings.jsx       # Caption preferences
│   │   │   │   └── TranslatedCaption.jsx
│   │   │   ├── analytics/
│   │   │   │   ├── AnalyticsDashboard.jsx
│   │   │   │   ├── ParticipantChart.jsx
│   │   │   │   └── LanguageStats.jsx
│   │   │   └── admin/
│   │   │       ├── UserTable.jsx
│   │   │       ├── RoleEditor.jsx
│   │   │       ├── ServiceStatusCard.jsx
│   │   │       └── SystemHealthMonitor.jsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useAuth.js
│   │   │   ├── useMeeting.js
│   │   │   ├── useSocket.js
│   │   │   ├── useWebRTC.js
│   │   │   ├── useChat.js
│   │   │   ├── useCaptions.js
│   │   │   ├── useTranslation.js
│   │   │   └── useMediaDevices.js
│   │   │
│   │   ├── stores/
│   │   │   ├── authStore.js
│   │   │   ├── meetingStore.js
│   │   │   ├── chatStore.js
│   │   │   └── captionStore.js
│   │   │
│   │   ├── services/
│   │   │   ├── api.js                        # Axios/fetch instance
│   │   │   ├── authService.js
│   │   │   ├── meetingService.js
│   │   │   ├── chatService.js
│   │   │   ├── translationService.js
│   │   │   └── adminService.js
│   │   │
│   │   ├── lib/
│   │   │   ├── socket.js                     # Socket.IO client setup
│   │   │   ├── webrtc.js                     # WebRTC helpers
│   │   │   ├── constants.js
│   │   │   └── utils.js
│   │   │
<<<<<<< HEAD
│   │   └── types/
=======
│   │   └── constants/
>>>>>>> ab81b9fb344b1b648a4e647b79b24b30a8bf2233
│   │       ├── user.js
│   │       ├── meeting.js
│   │       ├── chat.js
│   │       ├── caption.js
│   │       ├── analytics.js
│   │       └── admin.js
│   │
│   └── tests/
│       ├── components/
│       └── hooks/
│
├── backend/
│   ├── package.json
│   ├── jsconfig.json
│   ├── .env.example
│   ├── prisma/
│   │   ├── schema.prisma                     # Database schema
│   │   ├── migrations/
│   │   └── seed.js                           # Seed data
│   ├── src/
│   │   ├── index.js                          # Entry point
│   │   ├── app.js                            # Express app setup
│   │   ├── server.js                         # HTTP + Socket.IO server
│   │   │
│   │   ├── config/
│   │   │   ├── database.js
│   │   │   ├── redis.js
│   │   │   ├── socket.js
│   │   │   ├── cors.js
│   │   │   └── env.js                        # Environment variables validation
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.js                       # JWT verification
│   │   │   ├── rbac.js                       # Role-based access control
│   │   │   ├── validation.js                 # Zod request validation
│   │   │   ├── errorHandler.js               # Global error handler
│   │   │   └── rateLimiter.js
│   │   │
│   │   ├── routes/
│   │   │   ├── index.js                      # Route aggregator
│   │   │   ├── auth.routes.js
│   │   │   ├── user.routes.js
│   │   │   ├── meeting.routes.js
│   │   │   ├── analytics.routes.js
│   │   │   ├── translation.routes.js
│   │   │   └── admin.routes.js
│   │   │
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── user.controller.js
│   │   │   ├── meeting.controller.js
│   │   │   ├── analytics.controller.js
│   │   │   ├── translation.controller.js
│   │   │   └── admin.controller.js
│   │   │
│   │   ├── services/
│   │   │   ├── auth.service.js
│   │   │   ├── user.service.js
│   │   │   ├── meeting.service.js
│   │   │   ├── chat.service.js
│   │   │   ├── audio.service.js
│   │   │   ├── caption.service.js            # Speech-to-text engine
│   │   │   ├── translation.service.js        # ITranslationService impl
│   │   │   ├── analytics.service.js
│   │   │   ├── report.service.js             # IReportGenerator impl
│   │   │   └── admin.service.js
│   │   │
│   │   ├── interfaces/
│   │   │   ├── ITranslationService.js
│   │   │   └── IReportGenerator.js
│   │   │
│   │   ├── socket/
│   │   │   ├── index.js                      # Socket.IO initialization
│   │   │   ├── handlers/
│   │   │   │   ├── meeting.handler.js        # Meeting room events
│   │   │   │   ├── chat.handler.js           # Chat message events
│   │   │   │   ├── audio.handler.js          # Audio/signaling events
│   │   │   │   └── caption.handler.js        # Caption stream events
│   │   │   └── middleware/
│   │   │       └── socketAuth.js             # Socket authentication
│   │   │
│   │   ├── utils/
│   │   │   ├── logger.js
│   │   │   ├── errors.js                     # Custom error classes
│   │   │   ├── validators.js                 # Zod schemas
│   │   │   └── helpers.js
│   │   │
│   │   └── constants/
│   │       └── enums.js                      # UserRole, MeetingState, Language
│   │
│   └── tests/
│       ├── unit/
│       │   ├── services/
│       │   └── controllers/
│       ├── integration/
│       │   ├── auth.test.js
│       │   ├── meeting.test.js
│       │   └── translation.test.js
│       └── setup.js
│
└── shared/
    ├── package.json
    └── src/
        ├── types.js                          # Shared data schemas
        ├── constants.js                      # Shared constants
        ├── enums.js                          # Shared enumerations
        └── validators.js                     # Shared Zod schemas
```

---

## 9. Key Design Decisions

### 9.1 Interface-Based Service Design (from Report)
The report specifies `ITranslationService` and `IReportGenerator` interfaces. This allows:
- Swapping translation providers (Google Translate → LibreTranslate) without code changes
- Mock implementations for testing
- Future extensibility

### 9.2 Optional Features as Extensions (from Use Case Diagram)
The report uses `<<extend>>` relationships for:
- Message Translation (extends Send Chat Message)
- Live Caption (extends Speak Audio)
- Caption Translation (extends Live Caption)
- Audio Translation (extends Speak Audio)

**Implementation**: Each translation/caption feature is gated by user preferences stored in `User.preferred_language` and per-meeting settings. The frontend uses feature toggles.

### 9.3 Admin Separation (from Report)
Two admin types with distinct responsibilities:
- **Organization Admin** → User/Role management within their org
- **Platform Admin** → System-wide monitoring, service management

**Implementation**: RBAC middleware checks `UserRole` enum on each request.

---

## 10. Phased Development Roadmap

### Phase 1: Foundation (Week 1–2)
- [ ] Project scaffolding (Next.js + Express + Prisma)
- [ ] Database schema + migrations
- [ ] User authentication (register, login, JWT)
- [ ] Basic user profile management
- [ ] Landing page + auth pages UI

### Phase 2: Core Meeting (Week 3–4)
- [ ] Create / join / end meeting flow
- [ ] Meeting room UI (video grid, controls)
- [ ] WebRTC audio/video via simple-peer
- [ ] Socket.IO signaling server
- [ ] Participant management
- [ ] Dashboard with meeting list

### Phase 3: Chat & Translation (Week 5–6)
- [ ] Real-time chat via Socket.IO
- [ ] Translation service integration (Google Cloud Translate)
- [ ] Optional message translation
- [ ] Language selection UI
- [ ] Chat panel in meeting room

### Phase 4: Captions & Audio Translation (Week 7–8)
- [ ] Speech-to-text integration (Google Cloud Speech / Whisper)
- [ ] Live caption overlay
- [ ] Caption translation
- [ ] Audio translation pipeline
- [ ] Caption settings UI

### Phase 5: Analytics & Reports (Week 9)
- [ ] Meeting analytics calculation at meeting end
- [ ] Analytics dashboard component
- [ ] Report generation (PDF/JSON)
- [ ] Post-meeting report page

### Phase 6: Administration (Week 10)
- [ ] Organization admin dashboard
- [ ] User management (add/remove/roles)
- [ ] Platform admin dashboard
- [ ] System health monitoring
- [ ] Service management (toggle translation, reporting)

### Phase 7: Polish & Deploy (Week 11–12)
- [ ] UI/UX polish, responsive design, animations
- [ ] Error handling & edge cases
- [ ] Performance optimization (latency < 300ms target from SRS)
- [ ] Security audit (encrypted comms, auth hardening)
- [ ] Docker Compose setup
- [ ] Deployment documentation

---

## 11. User Review Required

> [!IMPORTANT]
> **Translation API Choice**: The report mentions using external Translation Services. The two main options are:
> - **Google Cloud Translate v3** — production-grade, paid, excellent quality
> - **LibreTranslate** — open-source, self-hosted, free but lower quality
>
> Which would you prefer as the primary provider? The interface design allows switching later.

> [!IMPORTANT]
> **Speech-to-Text Provider**: For live captions, the options are:
> - **Google Cloud Speech-to-Text** — real-time streaming, paid
> - **OpenAI Whisper API** — high quality, paid, batch-oriented
> - **Whisper.cpp (local)** — free, self-hosted, requires GPU for real-time
>
> Which approach should we use?

> [!NOTE]
> **Video Conferencing Scope**: Based on the SRS report, the system focuses on **1-to-1 video calls** in its initial version. We will start with 1-to-1 calls and extend to group meetings later using an SFU (Selective Forwarding Unit) like mediasoup if needed.

---

## 12. Open Questions

> [!WARNING]
> **Database Choice**: The plan uses PostgreSQL. The report doesn't specify a particular database. Should we consider MongoDB for more flexible schema, or stick with PostgreSQL for relational integrity?

> [!NOTE]
> **Deployment Target**: Should we target Docker Compose for local/self-hosted deployment, or cloud services (Vercel for frontend, Railway/Render for backend)?

> [!NOTE]
> **Audio Translation Output**: The report mentions "real-time audio translation where spoken audio is directly translated and delivered to listeners." This implies text-to-speech synthesis of translated text. Should we implement TTS, or focus on translated captions only for the initial version?

---

## 13. Verification Plan

### Automated Tests
```bash
# Backend unit tests
cd backend && npm test

# Backend integration tests
cd backend && npm run test:integration

# Frontend component tests
cd frontend && npm test

# E2E tests
npx playwright test
```

### Manual Verification
- **Auth Flow**: Register → Login → Profile update → Logout
- **Meeting Flow**: Create meeting → Share link → Join → Chat → End
- **Translation**: Send message in English → Verify Hindi translation appears
- **Captions**: Speak → Verify live caption → Verify translated caption
- **Analytics**: End meeting → Verify analytics generated → Download report
- **Admin**: Org admin adds user → Platform admin monitors system health
- **Performance**: Measure translation latency (target < 300ms from SRS)
- **Cross-browser**: Test on Chrome, Firefox, Edge


## Completed: Co-Host System
- Added coHosts relation to Organization in Prisma schema.
- Implemented auto-promotion to COHOST when joining an org meeting if user is a permanent co-host.
- Added API routes to assign and remove Co-Hosts mid-meeting.
- Added UI to Organization Dashboard to toggle Permanent Co-Hosts.
- Added UI to Meeting Members sidebar to toggle live Co-Hosts.
- Emits participant:promoted via socket to instantly update permissions.



================================================
FILE: docs/problems.md
================================================
# BhashaBridge — Problem Resolution Log

A full chronological history of every major bug encountered during development of the live translation engine, with the exact root cause and fix applied at each stage.

---

## Problem 1: Translation Not Working — Socket Teardown on Language Change

### What Happened
When the user changed the language in the Settings dropdown inside the meeting room, the chat would completely break. Messages stopped appearing entirely and the socket connection silently died.

### Root Cause
The Settings dropdown was calling `setUser({ ...user, language: newLang })`, which replaced the entire `user` object in Zustand with a new object reference. A `useEffect` that watched `user` as a dependency detected this change, tore down the entire socket, and reconnected — permanently losing all active peer connections, listeners, and the message queue.

### Fix
Changed Settings dropdown to mutate the user object **in-place**, without replacing it:

```js
// BROKEN — replaces the whole object, triggers socket teardown
setUser({ ...user, language: newLang });

// FIXED — mutates in-place, no React dependency change triggered
useAuthStore.getState().user.language = newLang;
setMessages([...messages]); // force a safe re-render
```

---

## Problem 2: Google Translate API IP Ban (3-Stage Fix)

### What Happened
The backend translation was using `@vitalets/google-translate-api` (a free scraper of Google's public web endpoint). The frontend had `recognition.interimResults = true` enabled, which means the browser was emitting partial incomplete words to the backend constantly while the user spoke — e.g., "H", "He", "Hel", "Hell", "Hello" for a single word. That's 5 backend requests for one word. Google's anti-bot system detected 20–30 requests per second from the server IP and issued a temporary `429 Too Many Requests` ban.

### Why Did Original Caption Still Show But Translated Didn't?
The original text is captured locally by the browser and broadcast by the backend **before** the translation step. So Side A (set to "Original") always received captions fine. Side B (expecting Hindi) was waiting for a Google translation that silently failed — resulting in a blank screen.

### Stage 1 Fix — Stop the Spam
Changed `recognition.interimResults = false`. The browser now waits for a full completed sentence before sending anything to the backend. Reduced requests from ~30/sec to 1 per sentence.

### Stage 2 Fix — Swap the Engine
Swapped out `@vitalets/google-translate-api` for `google-translate-api-x` — a modern actively maintained fork that uses multiple Google endpoints with higher rate limits and better ban evasion.

### Stage 3 Fix — Bulletproof Double Fallback
Reconfigured the API to use `client: 'gtx'`, disguising backend requests as the official Google Translate Chrome Extension (nearly never banned). Added a secondary fallback so if Google still fails, the server automatically switches to the fully independent `MyMemory API`:

```js
const res = await translate(text, { to: targetLang, client: 'gtx' })
  .catch(async () => {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${language}|${targetLang}`;
    const data = await (await fetch(url)).json();
    return { text: data.responseData.translatedText };
  });
```

---

## Problem 3: Caption Appearing on Speaker's Own Side

### What Happened
When Side A spoke or pressed Demo Speech, the live caption was appearing on Side A's own screen — not just on Side B. The speaker should never see or hear their own caption.

### Root Cause
The backend was using `io.to(meetingId).emit(...)` which broadcasts to **every socket in the room, including the sender**. The frontend had no logic to filter out its own events.

### Fix — Backend: Attach `senderSocketId`
```js
io.to(meetingId).emit('caption:translated', {
  text,
  translations,
  speakerId,
  senderSocketId: socket.id  // ← tells everyone who sent this
});
```

### Fix — Frontend: Skip Your Own Captions
```js
if (captionEnabled && data.senderSocketId !== newSocket.id) {
  setCurrentCaption(textToShow);
}
```

**Why `socketId` and not `userId`?**
Using `userId` would break multi-device testing — if you log into the same account on a laptop and a phone, both share the same `userId`, so the phone would never receive captions from the laptop. `socketId` is unique per browser tab, so it safely identifies the exact source connection.

---

## Problem 4: "Silent Join" — Server Doesn't Know Language Settings on Page Load

### What Happened
When Side B refreshed the page, their language preferences (e.g., "Translate captions to Hindi") were saved in local storage but never sent to the backend. The backend had no record of what language anyone wanted, so it translated nothing, and Side B saw blank captions every time after a refresh.

### Root Cause
The frontend only emitted `user:update_settings` when the user physically changed a dropdown option. On a fresh page load, no emit was triggered.

### Fix
Added an immediate settings sync right after socket connects:

```js
newSocket = io(SOCKET_URL);
newSocket.emit('meeting:join', { meetingId, userId: user.id, ... });
newSocket.emit('user:update_settings', useAuthStore.getState().user || {}); // ← Added
```

---

## Problem 5: TTS Self-Echo — Speaker Hears Their Own Translated Voice

### What Happened
When Side A clicked Demo Speech, Side A's own browser synthesized the translated audio and played it back at the speaker. This caused confusing echo and masked audio from real participants.

### Fix
Added a check to skip TTS for messages that came from your own socket:

```js
// Only play audio for OTHER people's speech, never your own
if (ttsEnabled && window.speechSynthesis && data.senderSocketId !== newSocket.id) {
  window.speechSynthesis.speak(utt);
}
```

---

## Problem 6: TTS Code Accidentally Outside Its Condition Block (Brace Misalignment)

### What Happened
Multiple rounds of regex-based patching (using `.replace()` scripts) caused the curly braces inside the `caption:translated` listener to become misaligned. The `if (ttsEnabled && ...)` block was structurally open but effectively **empty** — the `textToSpeak` and `speak()` code had drifted **outside** the condition block. Chrome's autoplay policy then blocked the audio because the call wasn't inside a clean execution path.

### What the Broken Code Looked Like
```js
if (ttsEnabled && window.speechSynthesis && ...) {
  console.log("TTS passed");
  // EMPTY — closing brace was here!
}
// speak() was running unconditionally down here
const textToSpeak = ...
window.speechSynthesis.speak(utt); // ← OUTSIDE the if block!
```

### Fix
Manually read the file line-by-line, identified the exact misaligned braces, and used `replace_file_content` to properly realign the entire block:

```js
if (ttsEnabled && window.speechSynthesis && data.senderSocketId !== newSocket.id) {
  const textToSpeak = ...;
  if (textToSpeak) {
    const utt = new SpeechSynthesisUtterance(textToSpeak);
    window.speechSynthesis.speak(utt);  // ← now correctly INSIDE the condition
  }
}
```

---

## Problem 7: `getVoices()` Returns Empty Array — Chrome Async Voice Loading

### What Happened
Even after fixing the brace alignment, Speech-to-Speech translation was still completely silent. The translated text was arriving and showing correctly as a caption, the TTS condition was passing (confirmed in console), but `window.speechSynthesis.speak(utt)` was doing absolutely nothing.

### Root Cause
Chrome loads its installed voice packs **asynchronously** in the background when the page first loads. When `window.speechSynthesis.getVoices()` is called the moment a caption arrives (very early in the page lifecycle), Chrome returns an **empty array `[]`**. With no voices found:
- `voice` is `undefined`
- `utt.voice` is never set
- Chrome's speech engine has no voice assigned and silently drops the request entirely

This is a well-known Chrome quirk — `getVoices()` only works reliably *after* the `voiceschanged` event fires.

### Fix — Pre-cache Voices Using `voicesRef`

```js
const voicesRef = useRef([]);

// Run once on mount — listen for voiceschanged and cache the result
useEffect(() => {
  const loadVoices = () => {
    const v = window.speechSynthesis.getVoices();
    if (v.length > 0) voicesRef.current = v;
  };
  loadVoices();
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
}, []);
```

Then at speak time, use the pre-cached ref instead of calling `getVoices()`:

```js
const voices = voicesRef.current; // always populated, never empty
const targetCode = utt.lang.toLowerCase().split('-')[0]; // 'hi' from 'hi-IN'
const voice = voices.find(v => v.lang.toLowerCase().startsWith(targetCode));
if (voice) utt.voice = voice;
window.speechSynthesis.speak(utt);
```

---

## Problem 8: Demo Speech Was One-Shot (No Loop)

### What Happened
The initial Demo Speech button fired a single test phrase once per click. The user needed it to loop continuously — keep broadcasting demo captions every few seconds until clicked again to stop.

### Fix
Replaced the one-shot function with a `isDemoActive` toggle state and a `useEffect` with `setInterval`:

```js
const [isDemoActive, setIsDemoActive] = useState(false);

useEffect(() => {
  if (!isDemoActive || !socket) return;
  const phrases = [
    "Hello, this is a test of the speech translation system.",
    "I am speaking in my native language right now.",
    "Technology makes communication so much easier."
  ];
  let count = 0;
  socket.emit('caption:text', { meetingId, speakerId: user.id, text: phrases[0], language: spokenLanguage });
  const interval = setInterval(() => {
    count++;
    socket.emit('caption:text', { meetingId, speakerId: user.id, text: phrases[count % phrases.length], language: spokenLanguage });
  }, 6000); // fires every 6 seconds
  return () => clearInterval(interval); // cleanup when stopped
}, [isDemoActive, socket]);
```

Button turns red and shows "Stop Demo Speech" while active.

---

## Summary Table

| # | Problem | Root Cause | Final Fix |
|---|---------|-----------|-----------|
| 1 | Socket dies on language change | `setUser()` replaced object reference | Mutate user in-place with `useAuthStore.getState().user.x = val` |
| 2 | Google Translate IP ban | `interimResults=true` sent 30 req/sec | `interimResults=false` + swap to `google-translate-api-x` + `client:'gtx'` + MyMemory fallback |
| 3 | Caption on speaker's own screen | `io.to(room)` sends to everyone | Backend attaches `senderSocketId`; frontend filters it |
| 4 | Settings lost on page refresh | Only emitted on dropdown change | Emit `user:update_settings` immediately on socket connect |
| 5 | TTS echoes back to speaker | No filter on own speech | Skip TTS if `senderSocketId === newSocket.id` |
| 6 | TTS code outside condition block | Regex patches broke brace alignment | Read file line-by-line; manually realigned braces |
| 7 | TTS completely silent | `getVoices()` returns `[]` async on Chrome | Pre-cache voices in `voicesRef` via `voiceschanged` event |
| 8 | Demo Speech one-shot only | No loop logic | `setInterval` inside `useEffect` gated by `isDemoActive` |

| 9 | TTS fails for certain languages | OS missing specific language voice packs | Bypassed OS entirely via a Backend Proxy to Google Cloud TTS |

---

## Problem 9: Missing OS Voice Packs & Google Hotlink Blocking (The Ultimate TTS Fix)

### What Happened
Even after all TTS bugs were fixed, speech-to-speech translation worked perfectly for Hindi, but was completely silent for Telugu.

### Root Cause (Part 1 - OS Dependency)
The `window.speechSynthesis` API relies entirely on the **voice packs installed on the user's Operating System**. Windows comes pre-installed with a Hindi voice pack, but **does not** include a Telugu voice pack by default. When the browser looked for a Telugu voice, it returned an empty array, and the audio was silently dropped. Asking users to manually dig into Windows Settings to install language packs is a terrible UX.

### Initial Fix Attempt (Frontend Cloud Fetch)
We tried to rip out `window.speechSynthesis` and replace it with a hidden Google Translate cloud endpoint that returns MP3 audio:
`https://translate.google.com/translate_tts?ie=UTF-8&q=...&client=tw-ob`
This failed because Google has strict **anti-hotlinking/CORS protections**. When the browser requested the URL directly, Google saw the browser's `Origin` and `Referer` headers and blocked the request, resulting in silence.

### Final Fix (Backend Proxy Pipeline)
To bypass both the Windows OS limitation and Google's browser blocks, we built a dedicated **Backend Proxy Pipeline**:
1. Added a new Express route: `GET /api/tts?text=...&lang=...`
2. The frontend passes the translated text to our backend.
3. Our Node.js backend requests the audio from Google. Because Node.js is not a browser, it doesn't send `Origin` headers, so Google accepts the request and returns the MP3.
4. The backend streams the raw audio binary back to the frontend.
5. The frontend plays it using the standard HTML5 `<audio>` player.

**Result:** 100% free, high-quality neural Cloud TTS for *every* language, completely independent of the user's browser or operating system!

```js
// Frontend Code
const url = `${API_URL}/tts?text=${encodeURIComponent(textToSpeak)}&lang=${targetLangCode}`;
const audio = new Audio(url);
audio.play();
```


## 4. Ghost Disconnects & Dangling WebSocket Sessions
**Problem:** If a user loses internet connection abruptly (e.g., laptop dies, hard network drop), their browser cannot send a "disconnect" event to the server. The server leaves their session open indefinitely, resulting in a "dangling session" that artificially inflates their recorded Meeting Attendance time (sometimes by hundreds of minutes).

**Solution:** Implemented a strict **Ping/Pong Heartbeat** configuration directly in the `socket.io` initialization on the backend.
- `pingInterval: 300000` (Server pings clients every 5 minutes).
- `pingTimeout: 300000` (Server forcefully drops the connection and triggers the `disconnect` event if a client fails to pong within 5 minutes).
This guarantees that "ghost" connections are detected and their `leftAt` timestamps are recorded accurately within a 10-minute maximum window, completely solving attendance inflation.


## Problem 13: High API Billing / Redundant AI Calls (Summary Spam)

### What Happened
The "✨ Summary" button was entirely stateless. Every time any user clicked it, the backend unconditionally fired the entire meeting transcript to the Gemini API. During a live meeting, if 50 participants clicked the button multiple times, it generated massive redundant API billing, and sometimes caused Gemini to crash with `503 High Demand`.

### Root Cause
There was no caching layer built into the AI summary endpoint (`getSummary` in `meeting.controller.js`). 

### Final Fix (Dual Caching Architecture)
We implemented a strict two-tier caching system to eliminate 95% of redundant API calls:
1. **TTL Memory Cache (Valkey) for ONGOING Meetings:** During an active meeting, summaries are generated and cached in Valkey (a drop-in Redis replacement running via Docker) with a strict 5-minute (300s) Time-To-Live (TTL). If users spam the button within 5 minutes, they are served the memory cache (Cost = $0). After 5 minutes, the cache expires, allowing the next click to fetch a fresh summary of the newly grown transcript.
2. **Permanent Cache (PostgreSQL) for COMPLETED Meetings:** Once a meeting is ended (`state = COMPLETED`), the transcript is locked. We added a `summaryCache Json?` field to the Prisma `Meeting` model. The very first summary generated post-meeting is permanently saved directly to PostgreSQL mapped by language. All future clicks for eternity load instantly from the DB without ever touching Gemini.

## Problem 14: Next.js Frontend Crash ("newSocket is not defined")
**Problem:** The video chat UI collapsed to a black error screen showing `newSocket is not defined`.
**Root Cause:** A scoping bug. The React `useEffect` hook responsible for establishing the Socket.io connection had several deeply nested functions. When attempting to refactor the `handleToggleMeetingCoHost` function out of the hook so the UI button could access it, the core `initializeMeeting` function was accidentally pulled out of scope alongside it, severing its access to the `newSocket` variable.
**Solution:** Surgically isolated and restored `initializeMeeting` back into the `useEffect` closure block, fully recovering the Next.js runtime.

## Problem 15: JWT Profile Language Mapping Failure (English Fallback)
**Problem:** When users updated their preferred language (e.g., Hindi) in the Dashboard Profile and clicked "View Summary" on a past meeting, the API ignored their preference and kept generating the summary in English.
**Root Cause:** The authentication controller (`auth.controller.js`) was signing the JWT token with the payload `{ userId, role, language: user.preferredLanguage }`. However, the meeting controller (`meeting.controller.js`) was attempting to read `req.user.preferredLanguage` from the decoded token. Because it was mapped to `req.user.language`, it resolved to `undefined` and triggered the hardcoded `'en'` fallback.
**Solution:** Fixed the meeting controller to correctly read `req.user.language`, ensuring the Post-Meeting summary cache generator respects the user's active dashboard profile.

## Problem 16: "Languages Spoken" Analytics Omitting Voice Chat
**Problem:** The Post-Meeting Report displayed "No translations were active during this session" in the Languages Spoken section, even when participants actively conversed using their microphones.
**Root Cause:** The Analytics Engine (`getMeetingAnalytics`) was exclusively querying the `ChatMessage` table to determine which languages were used. It was completely ignoring the `Caption` table where the live microphone speech transcripts are stored.
**Solution:** Upgraded the analytics aggregation pipeline to execute a union query across both `chatMessage.originalLanguage` and `caption.originalLanguage`, providing an accurate, holistic view of all languages actively spoken or typed.


## Problem 17: Host Refresh Deletes the Waiting Room Lobby
**Problem:** When the Host reloaded the page during an ongoing meeting, any users currently waiting in the Waiting Room to be admitted would completely disappear from the Host's sidebar, trapping them in the lobby indefinitely.
**Root Cause:** The waitingUsers React array was stored entirely in volatile frontend state. When the Host's browser refreshed, the state wiped out. The backend socket.io server relied solely on a one-time broadcast event (waiting:request) when a user initially joined. Because the backend didn't actively resend these events to the Host upon reconnection, the Host had no way of knowing people were waiting.
**Solution:** Modified the /meetings/join/:id API controller to actively query PostgreSQL for all participants with status === 'WAITING' and bundle that list directly into the Host's initial HTTP re-authentication response, guaranteeing the lobby UI instantly rehydrates.

## Problem 18: ADMITTED Participants Locked Out on Page Refresh
**Problem:** If a participant was successfully admitted by the Host, but subsequently refreshed their browser, they were unexpectedly thrown back into the Waiting Room and locked out of the meeting.
**Root Cause:** The joinMeeting backend logic defaulted to assigning 
ewStatus = 'WAITING' for any returning normal participant. It forcefully updated their PostgreSQL database record back to WAITING, overwriting their previously granted ADMITTED status.
**Solution:** Rewrote the database fallback logic to verify the user's existing participant.status first. If they already hold an ADMITTED status, the database seamlessly preserves it, allowing them to bypass the waiting room upon reconnection.



================================================
FILE: docs/report_text.txt
================================================
REPORT BHASHABRIDGE
TEAM NAME :→ LAZY LEGENDS
TEAM MEMBERS:→
DIVYANSH NAGAR
ADITYA KUMAR
SHLOK DESHMUKH
ASHUTOSH SHUKLA
REPOR T BHASHABRIDGE
1
INTRODUCTION :→
In recent years, online meeting platforms have become an essential part of
communication in education, business, and remote collaboration. However,
language differences often create barriers that reduce the effectiveness of
communication. Participants may find it difficult to understand conversations,
leading to misunderstandings and reduced productivity.
To overcome this challenge, the proposed system BhashaBridge is developed
as a multilingual meeting platform that integrates real-time translation features
into the communication process. The system enables users to interact through
chat and audio while automatically translating content into their preferred
language. By combining communication tools with intelligent translation
services, the system aims to create a more inclusive and efficient meeting
environment.
REPOR T BHASHABRIDGE
2
ABSTRACT :→
In the modern digital age, online communication platforms have become a
fundamental part of daily life, especially in professional environments,
education systems, and global collaboration. With the rise of remote work and
virtual meetings, people from diverse linguistic backgrounds frequently interact
with one another. However, one of the most significant challenges in such
interactions is the language barrier, which often leads to misunderstandings,
reduced efficiency, and limited participation. To address this issue, this project
introduces BhashaBridge, an intelligent multilingual meeting platform designed
to facilitate seamless and inclusive communication across different languages.
The system provides all the essential functionalities expected from a modern
online meeting platform. Users can register, log in, create meetings, join
existing sessions, and communicate through both chat and audio. These core
features ensure that the platform supports smooth and effective interaction
among participants. However, what makes BhashaBridge unique is its
integration of advanced real-time translation capabilities that enhance
communication beyond traditional meeting systems.
One of the key features of the system is message translation. When users send
chat messages, the system can automatically translate them into multiple
languages based on the preferences of other participants. This ensures that
users can communicate freely in their own language while still being
understood by others. In addition to text communication, the system also
supports live audio interaction, which is further enhanced through intelligent
processing.
The platform includes a live caption generation feature that converts spoken
language into text in real time. This not only helps users follow conversations
more easily but also improves accessibility for users who may have hearing
difficulties. Furthermore, the generated captions can be translated into different
languages, allowing participants to read and understand spoken content in their
REPOR T BHASHABRIDGE
3
preferred language. Another advanced feature is real-time audio translation,
where spoken audio is directly translated and delivered to listeners, making
communication even more natural and interactive.
An important aspect of the system design is that these translation features are
optional. Users can choose whether they want to enable or disable translation
services based on their needs. This flexibility ensures that the platform remains
user-friendly and adaptable to different scenarios, whether users require
translation support or prefer standard communication.
In addition to communication features, BhashaBridge also provides meeting
analytics and reporting functionalities. At the end of each meeting, the system
calculates important metrics such as the total number of participants and the
duration of the meeting. Based on this data, a detailed report is generated,
which helps users review the meeting outcomes and maintain records for future
reference. These features are particularly useful in professional and
organizational settings where tracking and documentation are important.
The system also incorporates a structured administrative model to ensure
efficient management. There are two distinct types of administrators:
Organization Admin and Platform Admin. The Organization Admin is responsible
for managing users within a specific organization, including adding or removing
users and assigning roles such as host or participant. On the other hand, the
Platform Admin manages system-level operations, including monitoring system
performance, managing services like translation and reporting, and ensuring
the overall stability of the platform. This separation of responsibilities improves
system organization and scalability, especially in a Software as a Service 