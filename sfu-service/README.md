# BhashaBridge Mediasoup SFU Media Router (`sfu-service`)

> **Carrier-Grade, Multi-Core WebRTC Selective Forwarding Unit (SFU) with Apache Avro Audio Tap Ingress**  
> *Part of the BhashaBridge Next-Generation Carrier-Grade Architecture (Pillar 1 & Pillar 5).*

---

## 1. Overview & Capabilities

The `sfu-service` extracts media routing from the application backend into an autonomous, high-throughput microservice running on port **5002**.

### Key Architectural Features:
* **$O(1)$ Ingress Uplink:** Clients upload camera/microphone streams exactly once to the SFU, eliminating rural $O(N^2)$ mesh uplink bottlenecks.
* **Multi-Core Worker Pool:** Spawns Mediasoup C++ worker processes distributed across CPU cores, dynamically load-balancing meeting routers.
* **Simulcast (3 Spatial Layers):** Supports 1080p High (1.5 Mbps), 720p Mid (500 kbps), and 360p Low (150 kbps) for rural adaptive bandwidth degradation.
* **Server-Side Audio Tap (Pillar 5):** Cloud memory audio tap captures raw Opus frames, serializes them via **Apache Avro binary (`AudioTapEvent.avsc`)**, and pipes them directly to `ai-service` (Port 5001) for Whisper STT. Eliminates mobile browser microphone lockouts.
* **Dual Signaling Surface:** Provides both sub-millisecond **Socket.IO** (`/sfu`) and standard **REST HTTP** endpoints.
* **Dual-Engine Architecture:** Runs natively with C++ Mediasoup or boots seamlessly with the built-in Virtual Mediasoup SFU Engine in environments lacking native compiler toolchains.

---

## 2. Ports & Network Topology

| Port / Protocol | Type | Purpose |
|---|---|---|
| `5002 / TCP` | HTTP / WebSocket | SFU REST APIs & Socket.IO Signaling (`/sfu`) |
| `40000-40100 / UDP` | WebRTC RTP/RTCP | Media transmission (Audio/Video streams) |

---

## 3. Quick Start

### Local Development
```bash
cd sfu-service
npm install          # installs optional native mediasoup when a prebuilt binary is available
npm test
npm start
```

Set `SFU_FORCE_VIRTUAL=1` to run the specification-compliant Virtual engine even when
the native C++ core is installed. Set `SFU_ICE_SERVERS` (comma-separated STUN/TURN
URLs) and `MEDIASOUP_ANNOUNCED_IP` when deploying outside localhost.

### Docker Deployment
```bash
docker build -t bhashabridge-sfu-service .
docker run -p 5002:5002 -p 40000-40100:40000-40100/udp bhashabridge-sfu-service
```

### Frontend Integration
The Next.js meeting room uses `frontend/src/services/sfuClient.js` (mediasoup-client)
as its primary media plane. It connects to the `/sfu` Socket.IO namespace, publishes
microphone/camera tracks with 3-layer simulcast, and consumes every remote producer.
If the SFU is unreachable or running the Virtual engine, the room automatically keeps
the legacy P2P mesh transport.

Configure the browser endpoint with `NEXT_PUBLIC_SFU_URL` (for example
`https://sfu.example.com`). When unset it defaults to `http://localhost:5002` in
development, or the current host on port `5002` in a deployed browser.

---

## 4. REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | `GET` | Health check, active worker count, room count, native engine status |
| `/api/v1/sfu/capabilities/:meetingId` | `GET` | Fetch router RTP capabilities |
| `/api/v1/sfu/rooms` | `POST` | Create or ensure room router |
| `/api/v1/sfu/transports` | `POST` | Allocate WebRTC transport (`send` or `recv`) |
| `/api/v1/sfu/transports/:id/connect` | `POST` | Connect transport with client DTLS parameters |
| `/api/v1/sfu/transports/:id/produce` | `POST` | Publish track (Audio / Video / Screen) |
| `/api/v1/sfu/transports/:id/consume` | `POST` | Downstream track delivery to peer |
| `/api/v1/sfu/consumers/:id/pause` | `POST` | Pause consumer delivery |
| `/api/v1/sfu/consumers/:id/resume` | `POST` | Resume consumer delivery |
| `/api/v1/sfu/consumers/:id/layers` | `POST` | Set preferred simulcast layer (360p/720p/1080p) |
| `/api/v1/sfu/producers/:id/pause` | `POST` | Pause a producer |
| `/api/v1/sfu/producers/:id/resume` | `POST` | Resume a producer |
| `/api/v1/sfu/producers/:id` | `DELETE` | Close a producer |
| `/api/v1/sfu/rooms/:meetingId/producers` | `GET` | List room producers and peers |
| `/api/v1/sfu/rooms/:meetingId/peers` | `GET` | List room peers and their resources |
| `/api/v1/sfu/rooms/:meetingId/peers/:peerId` | `DELETE` | Remove a peer and all its resources |
| `/api/v1/sfu/audio-tap` | `POST` | Attach digital audio tap to audio producer |
| `/api/v1/sfu/audio-taps` | `GET` | List all active audio taps |
| `/api/v1/sfu/audio-taps/:meetingId` | `GET` | List audio taps for one room |
| `/api/v1/sfu/ice-servers` | `GET` | ICE server configuration for browser negotiation |
| `/api/v1/sfu/rooms/:meetingId` | `DELETE` | Clean up room router resources |
| `/api/v1/sfu/stats` | `GET` | Global SFU telemetry |

### Socket.IO Signaling (`/sfu`)

| Event | Direction | Description |
|---|---|---|
| `sfu:join-room` | client → server | Join room, receive RTP capabilities and existing producers |
| `sfu:leave-room` | client → server | Gracefully leave and release peer resources |
| `sfu:create-transport` | client → server | Allocate a send/recv WebRTC transport |
| `sfu:connect-transport` | client → server | Connect transport with DTLS parameters |
| `sfu:produce` | client → server | Publish an audio/video producer |
| `sfu:consume` | client → server | Consume a remote producer |
| `sfu:pause-consumer` / `sfu:resume-consumer` | client → server | Pause/resume downstream delivery |
| `sfu:set-layers` | client → server | Switch preferred simulcast layer |
| `sfu:pause-producer` / `sfu:resume-producer` | client → server | Mute/unmute without renegotiation |
| `sfu:close-producer` | client → server | Close a producer |
| `sfu:get-producers` / `sfu:get-stats` | client → server | Room snapshot and telemetry |
| `sfu:new-producer` | server → room | A peer published a new track |
| `sfu:producer-closed` | server → room | A peer's track was closed |
| `sfu:peer-joined` / `sfu:peer-left` | server → room | Participant presence changes |
| `sfu:audio-tap-transcription` | server → room | Caption returned by the AI audio-tap pipeline |

