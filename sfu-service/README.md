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
npm install
npm test
npm start
```

### Docker Deployment
```bash
docker build -t bhashabridge-sfu-service .
docker run -p 5002:5002 -p 40000-40100:40000-40100/udp bhashabridge-sfu-service
```

---

## 4. REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | `GET` | Health check, active worker count, room count |
| `/api/v1/sfu/capabilities/:meetingId` | `GET` | Fetch router RTP capabilities |
| `/api/v1/sfu/rooms` | `POST` | Create or ensure room router |
| `/api/v1/sfu/transports` | `POST` | Allocate WebRTC transport (`send` or `recv`) |
| `/api/v1/sfu/transports/:id/connect` | `POST` | Connect transport with client DTLS parameters |
| `/api/v1/sfu/transports/:id/produce` | `POST` | Publish track (Audio / Video / Screen) |
| `/api/v1/sfu/transports/:id/consume` | `POST` | Downstream track delivery to peer |
| `/api/v1/sfu/consumers/:id/pause` | `POST` | Pause consumer delivery |
| `/api/v1/sfu/consumers/:id/resume` | `POST` | Resume consumer delivery |
| `/api/v1/sfu/consumers/:id/layers` | `POST` | Set preferred simulcast layer (360p/720p/1080p) |
| `/api/v1/sfu/audio-tap` | `POST` | Attach digital audio tap to audio producer |
| `/api/v1/sfu/rooms/:meetingId` | `DELETE` | Clean up room router resources |
| `/api/v1/sfu/stats` | `GET` | Global SFU telemetry |
