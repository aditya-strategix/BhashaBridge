# BhashaBridge — Cognitive AI Microservice & Apache Avro Event Engine

> **Carrier-Grade, Decoupled Cognitive AI Processing Pool with Apache Avro (`.avsc`) Binary Framing**  
> *Engineered for High-Throughput Real-Time Multilingual Communication, Low-Bandwidth Telemedicine, and Zero Vendor Lock-in.*

---

## 1. Overview & Paradigm Shift

In accordance with the **Next-Generation System Architecture Specification** ([`newArchitecture.md`](../docs/newArchitecture.md)), this microservice separates all AI-related computing tasks out of the monolithic backend into an independent, containerized, provider-agnostic service.

### Core Architectural Dimensions:
1. **Pillar 3: Apache Avro (`.avsc`) Binary Framing**
   - Eliminates standard JSON string bloat and UTF-8 key overhead.
   - Enforces strict binary schema contracts across all microservice events.
   - Reduces network payload size by **65% to 75%** on rural cellular networks (2G/3G/4G).
   - Features built-in **Schema Registry** with 64-bit deterministic fingerprinting (Single Object Encoding RFC).
2. **Pillar 5: Sovereign & Decoupled AI Pipeline (Adapter Pattern)**
   - **Summarization:** Google Gemini 3.5/3.7/3.8 Flash with multi-model fallback and local Structural heuristic fallback.
   - **Translation:** Sovereign IndicTrans2 (AI4Bharat / IIT Madras) + MyMemory fallback chain (Zero Google scrapers).
   - **STT (Speech-to-Text):** Bhashini ASR / Faster-Whisper audio tap worker for mobile hardware lockout bypass.
   - **TTS (Speech Synthesis):** Bhashini Indic-TTS (AI4Bharat / MeitY) sovereign voice synthesis across Indian languages.

---

## 2. Directory Structure

```
ai-service/
├── Dockerfile                      # Production Alpine container definition
├── package.json                    # Microservice manifest and scripts
├── README.md                       # Comprehensive service documentation
├── src/
│   ├── app.js                      # Express application with binary Avro & JSON parsers
│   ├── server.js                   # Standalone HTTP & Avro server (port 5001)
│   ├── schemas/                    # Production Apache Avro (.avsc) schemas
│   │   ├── AudioTapEvent.avsc
│   │   ├── CaptionStreamEvent.avsc
│   │   ├── ChatMessageEvent.avsc
│   │   ├── RagContextEvent.avsc
│   │   ├── SummaryRequestEvent.avsc
│   │   ├── SummaryResponseEvent.avsc
│   │   └── TranslatedCaptionEvent.avsc
│   ├── avro/                       # Apache Avro Serializer & Schema Registry
│   │   ├── index.js                # High-level Avro API
│   │   ├── registry.js             # Schema Registry & 64-bit fingerprinting
│   │   └── serializer.js           # Zigzag varint, IEEE 754 float, binary encoder/decoder
│   ├── adapters/                   # Provider-Agnostic Abstraction Layer
│   │   ├── summarization/          # Gemini + Structural Heuristic Summarizer
│   │   ├── translation/            # IndicTrans2 + MyMemory
│   │   ├── stt/                    # Bhashini STT + Whisper Audio Tap
│   │   └── tts/                    # Bhashini Indic-TTS (AI4Bharat / MeitY)
│   ├── services/                   # Business Logic & Stream Processing
│   │   ├── summarization.service.js
│   │   ├── translation.service.js
│   │   ├── caption-processor.service.js
│   │   └── audio-tap.service.js
│   ├── routes/
│   │   └── ai.routes.js            # REST & Avro binary HTTP routes
│   └── client/
│       └── ai-service.client.js    # Client SDK for backend & external consumers
└── tests/
    ├── avro.test.js                # Avro encoding, decoding, fingerprint & compression tests
    └── ai-service.test.js          # Service integration & fallback tests
```

---

## 3. Production Avro Schemas (`.avsc`)

| Schema File | Event Namespace | Primary Role |
|---|---|---|
| `CaptionStreamEvent.avsc` | `in.bhashabridge.events` | Raw transcription frame emitted by client or audio tap |
| `TranslatedCaptionEvent.avsc` | `in.bhashabridge.events` | Multilingual translated subtitle frame broadcast to participants |
| `AudioTapEvent.avsc` | `in.bhashabridge.events` | Raw Opus/PCM audio frame tapped from Mediasoup SFU router |
| `SummaryRequestEvent.avsc` | `in.bhashabridge.events` | Binary meeting summarization request contract |
| `SummaryResponseEvent.avsc` | `in.bhashabridge.events` | Structured executive summary response contract |
| `ChatMessageEvent.avsc` | `in.bhashabridge.events` | Chat message event before translation |
| `RagContextEvent.avsc` | `in.bhashabridge.events` | 30-second conversational chunk for semantic embedding |

---

## 4. API Endpoints

### `POST /api/v1/ai/summary`
- **Headers:** `Content-Type: application/avro` (Binary) OR `application/json`
- **Avro Contract:** Input: `SummaryRequestEvent.avsc`, Output: `SummaryResponseEvent.avsc`
- **JSON Body:**
  ```json
  {
    "transcriptText": "Speaker: We need to finalize the roadmap...",
    "targetLanguage": "hi",
    "meetingId": "meet_123"
  }
  ```

### `POST /api/v1/ai/translate`
- **Headers:** `Content-Type: application/json`
- **JSON Body:**
  ```json
  {
    "text": "Hello, how are you?",
    "sourceLanguage": "en",
    "targetLanguages": ["hi", "ta", "es"]
  }
  ```

### `POST /api/v1/ai/caption/stream`
- **Headers:** `Content-Type: application/avro`, `X-Target-Languages: hi,ta,es`
- **Avro Contract:** Ingests `CaptionStreamEvent.avsc` binary buffer, returns `TranslatedCaptionEvent.avsc` binary buffer.

### `POST /api/v1/ai/audio/tap`
- **Headers:** `Content-Type: application/avro`
- **Avro Contract:** Ingests `AudioTapEvent.avsc` binary buffer, returns `CaptionStreamEvent.avsc` binary buffer.

### `GET /api/v1/ai/schemas`
- Returns all registered schemas with 64-bit fingerprints and schema definitions.

### `GET /health`
- Health status and active adapter availability.

---

## 5. Verification & Testing

Run the test suites using Node.js:
```bash
npm run test:avro   # Tests Avro binary serialization, registry, and compression
npm test            # Runs all tests
```

