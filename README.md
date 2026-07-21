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
