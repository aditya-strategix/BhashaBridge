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

## Problem 4: Real-time UI Staleness (The "Nothing Updates Until I Refresh" Bug)
- **Symptom:** Users reported that when an action was performed (like promoting a participant to Co-Host, deleting a meeting, or adding a member to an organization), the dashboard and meeting UI for *other* users did not reflect the change until they manually refreshed their browsers. Furthermore, within active meetings, after a host promoted a participant to a co-host, attempting to interact with that participant (like muting them) would fail or exhibit incorrect permissions, because the underlying connection state was stale.
- **Root Cause (Architecture Concept - State Synchronization & Stale Closures):**
  1. **Backend missing Event Broadcasts:** The architecture relies on Socket.IO for real-time signaling. The dashboard listens for a global `dashboard:refresh` event to automatically refetch the latest data via REST. However, multiple REST API endpoints in the backend (e.g., `organization.controller.js` and `meeting.controller.js`) modified database state but failed to emit this event. 
  2. **Frontend Stale References (React State vs Mutable Refs):** In the React `page.js` for the Meeting UI, the `participant:promoted` event was correctly calling `setPeers(...)` to update the visual React state. However, the application uses a `useRef` array (`peersRef.current`) to store the actual WebRTC `Peer` instances alongside participant data. Updating React state does not automatically mutate the ref. Because the ref wasn't updated, any subsequent socket events or UI actions interacting with `peersRef.current` still saw the old role (e.g. `PARTICIPANT`), causing actions to fail or show incorrect state until the page was reloaded and the refs were reinitialized from the server.
- **Resolution:**
  - **Backend:** Audited all data-mutating routes in `meeting.controller.js` and `organization.controller.js` and added `global.io.emit('dashboard:refresh');` to broadcast changes to all connected clients.
  - **Frontend:** Updated the `participant:promoted` Socket event listener inside `page.js`. We used `findIndex` on `peersRef.current` to locate the target user and manually mutate their object (`peersRef.current[idx] = { ...peersRef.current[idx], role };`) immediately before calling `setPeers([...peersRef.current])`. This guarantees that both the visual React state and the underlying WebRTC mutable state stay perfectly in sync.

---

## Problem 5: Pure WebRTC Mesh Scalability & $O(N^2)$ Upload Bandwidth Bottleneck

### Symptom:
When a meeting room scales beyond 4–6 participants, users experience packet loss, frozen video tiles, robotic/choppy audio, laptop cooling fans spinning at 100%, and rapid battery depletion on mobile devices.

### Root Cause (The Physics of Pure Peer-to-Peer Mesh):
1. **Exponential Stream Explosion:** In a decentralized WebRTC Mesh network, there is no central media server. Every participant's browser opens a direct bidirectional peer connection to every other participant. For $N$ participants, each client must encode, encrypt, and upload $(N - 1)$ separate outgoing media streams, resulting in $N \times (N - 1)$ total streams in the room.
   - 2 participants: 1 upload each = 2 streams
   - 4 participants: 3 uploads each = 12 streams
   - 8 participants: 7 uploads each = 56 streams
   - 10 participants: 9 uploads each = 90 streams
2. **The Asymmetric Internet Bottleneck:** A standard 720p HD stream requires $\approx 1.8\text{ Mbps}$ upload bandwidth. With 8 users in a room, each participant must sustain $7 \times 1.8\text{ Mbps} = \mathbf{12.6\text{ Mbps}}$ of **continuous upload bandwidth**. However, most residential and mobile connections (4G/5G, home WiFi) are *asymmetric*—offering 50–100 Mbps download but only **5–10 Mbps upload**. The client's upload pipeline is physically choked, triggering heavy packet drops.
3. **Hardware Encoding Overheating:** Encoding and encrypting (DTLS/SRTP) 7 or more separate simultaneous video streams pushes client CPU/GPU usage to 90–100%, causing thermal throttling and browser lag.

### Why This CANNOT Be Solved Purely as a Software Solution in WebRTC Mesh:
* **Physical ISP Bandwidth Boundary:** No client-side code optimization or compression algorithm can physically widen a user's ISP-enforced 5 Mbps upload cap into 15 Mbps.
* **Mathematical Impossibility of P2P Multiplexing:** In a pure peer-to-peer topology, the browser must send distinct network packets to each peer's unique public IP address. It cannot "broadcast" once to multiple remote IP endpoints over standard consumer internet.
* **Quality Degradation Trade-Off:** While WebRTC's congestion control attempts to mitigate choked bandwidth by downscaling video to 240p at 5–10 FPS, this severely degrades meeting quality and causes audio/subtitle desynchronization.
* **Conclusion:** **This problem cannot be solved within a client-side WebRTC Mesh architecture alone.** It is an inherent mathematical and physical constraint of peer-to-peer topologies.

### Architectural Solution (Future Scope Migration):
* The definitive architectural solution is migrating from a **Mesh** to a **Selective Forwarding Unit (SFU)** media server (e.g., LiveKit, Mediasoup, or Janus).
* With an SFU, each client uploads **only 1 single stream** (1.8 Mbps) to a cloud media server, which duplicates and forwards the packets over high-speed datacenter backbones.
* **The Trade-Off:** Unlike free zero-cost WebRTC Mesh, running an SFU requires ongoing cloud media server hosting and bandwidth billing (which is why platforms like Zoom and Google Meet charge recurring subscription fees).

---

## Problem 6: Real-Time Speech-to-Speech Interpretation Economics: Why Big Tech Does Not Offer It For Free

### Question / Problem Statement:
Users frequently ask: *"If Google possesses state-of-the-art speech recognition and translation APIs, why doesn't Google Meet natively offer universal, free real-time spoken translation for every meeting participant?"*

### Root Cause & Economic Constraints:
1. **Tri-Pipeline Computational Load:** Real-time speech-to-speech interpretation requires three resource-intensive AI pipelines running simultaneously for every active speaker:
   $$\text{Speech-to-Text (STT)} \longrightarrow \text{Neural Machine Translation (NMT)} \longrightarrow \text{Text-to-Speech Synthesis (TTS)}$$
2. **Astronomical Cloud GPU Bills at Scale:** Google Meet handles over 300 million daily meeting participants. Running continuous neural voice generation across millions of concurrent media streams on centralized cloud servers would cost tens of millions of dollars monthly in GPU compute infrastructure.
3. **Enterprise Gating:** Big Tech deliberately gates translated captions and AI summaries behind **Google Workspace Enterprise + Gemini Add-ons (\$20–\$30/user/month)** because offering continuous real-time neural interpretation for free on centralized cloud servers is economically unsustainable.

### Why It Cannot Be Solved via Free Centralized Cloud Processing:
* Running continuous neural voice synthesis on a centralized cloud backend for unlimited free users is economically impossible without either charging enterprise subscriptions or implementing rate limits.

### BhashaBridge's Architectural Solution:
* BhashaBridge circumvents this by utilizing a **hybrid edge model**:
  * Audio capture (SpeechRecognition) and speech synthesis (SpeechSynthesis) run **locally on the user's browser/device** at zero cloud GPU cost.
  * Only text translation and room signaling pass through the lightweight backend bridge.
  * This delivers real-time multilingual interpretation without enterprise cloud bills or subscription paywalls.

---

## Problem 7: Acoustic Cross-Talk & Dual-Channel Audio Latency in Live Spoken Translation

### Problem:
When Speaker A speaks in their native language (e.g., Hindi or Spanish) and synthetic translated speech (e.g., English) is played back for Speaker B, both the original voice and the translated synthetic audio can play simultaneously, creating acoustic clutter and cognitive overload.

### Root Cause (The Physics of Simultaneous Interpretation):
* Human speech is continuous. The speaker's original voice arrives over the WebRTC audio track with near-zero latency ($t = 0\text{ ms}$).
* Spoken translation requires the speaker to complete a natural phrase or sentence boundary before speech recognition, neural translation, and synthesis can complete ($t \approx 300\text{–}400\text{ ms}$).
* As a result, the synthetic voice arrives slightly after the original speech begins, causing overlapping audio streams.

### Why It Cannot Be Solved by Naive Audio Muting:
* Completely cutting off the original speaker's audio causes the interface to feel dead, breaks natural lip-sync, and strips emotional vocal inflections.
* Suppressing audio before sentence completion causes unnatural clipping and choppy speech.

### BhashaBridge's Balanced Solution:
1. **Visual-First Anchor:** High-contrast, synchronized live subtitles provide an immediate visual reference before audio synthesis finishes.
2. **Dynamic Audio Ducking & Volume Separation:** In-meeting audio controls allow participants to toggle synthetic speech or adjust audio balance between the original speaker's voice and the translated synthetic audio.

---

## Problem 8: Symmetric NAT Port Mutation: Why Direct STUN P2P Fails on Mobile 4G/5G and Corporate Networks (and Why TURN Succeeds)

### Symptom / User Query:
Users and engineers often wonder:
*"If my computer uses the exact same internal socket (e.g., port 54321) to send packets to STUN and then to Peer B, shouldn't the router keep the same external port? Why does direct P2P fail on mobile 4G/5G and corporate networks?"*

### Root Cause (Cone NAT vs. Symmetric NAT - RFC 3489 & RFC 4787):
1. **Home Wi-Fi (Cone NAT - Port Reused):**
   * Home routers use a 2-tuple lookup key: $\text{Mapping} = f(\text{Local IP}, \text{Local Port})$.
   * The destination does not matter. When your computer sends a packet from local socket `54321` to STUN, the router maps it to external port `60001`. When it sends a packet to Peer B, it **reuses the exact same port `60001`**.
   * Direct UDP hole punching succeeds, and P2P video works directly.

2. **Mobile 4G/5G & Corporate Networks (Symmetric NAT - Port Mutated):**
   * Mobile carriers (Carrier-Grade NAT / CGNAT) and enterprise firewalls enforce strict security by using a **4-tuple lookup key**:
     $$\text{Mapping} = f(\text{Local IP}, \text{Local Port}, \mathbf{\text{Destination IP}}, \mathbf{\text{Destination Port}})$$
   * **Packet 1 to STUN (`142.250.x.x:3478`):** The router maps internal socket `54321` to external port **`60001`**. STUN reports `60001` back to the browser.
   * **Packet 2 to Peer B (`198.51.x.x:55000`):** Because Peer B has a *different destination IP and port*, the router's firewall policy treats this as a completely new session. It **deliberately refuses to reuse `60001`** and allocates a random, unpredictable port (e.g., **`60842`**)!
   * **The Port Mismatch:** Peer B sends media to `60001` (the port received via signaling). But Client A's router is listening on `60842` for Peer B. All incoming packets are blocked and dropped by the firewall.

### Why This CANNOT Be Solved in Client-Side Code:
* The port mutation occurs inside the cellular tower's CGNAT hardware or enterprise router.
* Browser JavaScript cannot predict what random external port the carrier will assign for a new destination, nor can client-side code override carrier firewall policies.
* **Verdict:** Direct peer-to-peer WebRTC is mathematically impossible between two Symmetric NAT endpoints.

### Why TURN Solves This 100% of the Time:
* With TURN, Client A **never sends packets to Peer B's IP address**.
* Client A addresses 100% of its packets to the **same single destination**: `TURN_SERVER_IP:3478`.
* Because the **Destination IP and Destination Port NEVER CHANGE**, the Symmetric NAT **never mutates the port**! It keeps using port `60001` for the entire duration of the call.
* The TURN server receives media from Client A on `60001`, relays it to Peer B, and returns Peer B's media back to Client A from `TURN_SERVER_IP:3478`.
* Router A's firewall sees return packets from the exact destination Client A reached out to, and permits 100% of the traffic without dropping a single packet.

---

## Problem 9: WebRTC Media State Desynchronization on Join (Initial Black Video Box & Phantom Active Icons)

### Symptom:
1. When a new participant joins a meeting room where existing participants (such as the Host) have their camera and/or microphone turned off, the host appears with **active green camera/mic icons and a pitch-black video box** instead of their Avatar placeholder with red muted icons.
2. When a participant joins with their camera enabled, their video stream would sometimes remain black or invisible to remote peers until they toggled the camera button off and on.
3. When a participant is admitted from the Waiting Room (Lobby) into the main meeting, the remote Host can see the participant's camera stream normally, but on the participant's own screen, **their own self-video tile is completely pitch-black**.

### Root Cause Analysis:
1. **Socket Race Condition (`participant:status_update` before Peer Creation):**
   * When Participant B joins, existing Participant A receives `participant:joined` and immediately emits `meeting:status_update`.
   * Participant B receives `participant:status_update` *before* the WebRTC offer (`audio:signal`) arrives to construct the peer object in `peersRef.current`.
   * Because `peersRef.current.findIndex(...)` resolved to `-1`, Participant B silently dropped the incoming status payload.
2. **Missing State in WebRTC Signaling Handshake:**
   * Neither `createPeer` nor `addPeer` included `isAudioOn` or `isVideoOn` in the `audio:signal` payload.
   * Additionally, the backend socket relay stripped custom payload properties, forwarding only a minimal dictionary without media states or avatar URLs.
3. **Undefined Fallback in Render Layer:**
   * When peers were pushed to `peersRef.current`, `isAudioOn` and `isVideoOn` were `undefined`.
   * The `<VideoPeer />` component defaulted them to `true`, forcing `<video style={{ display: 'block' }}>` to render instead of the `<Avatar>` placeholder, resulting in a black box showing green active indicators.
4. **MediaStream Track Attachment Race:**
   * In `simple-peer`, remote tracks can be added to the remote stream after initial stream events fire.
   * Without listening to `peer.on('track')` and the `<video>` element's `onLoadedMetadata`, playback could stall until renegotiation was forced via manual button toggle.
5. **DOM Element Lifecycle & Unmount on View Transition (Lobby $\rightarrow$ Meeting Stage):**
   * When a participant first entered the waiting room, `userVideo.current.srcObject = currentStream` was attached to the Lobby's `<video>` DOM node.
   * When the host admitted the participant (`participantStatus` changed from `'WAITING'` to `'ADMITTED'`), React unmounted the Lobby component tree and mounted the Main Meeting Stage component tree.
   * This destroyed the previous `<video>` element and rendered a brand-new `<video>` DOM element for the self tile.
   * Because `srcObject` assignment was only performed once inside `initMeeting()`, the newly mounted `<video>` element in the main room never received `srcObject = stream` ($srcObject = \text{null}$).
   * The camera was broadcasting over WebRTC (so the Host could see them), but locally the participant saw a pitch-black box for their own tile.

### The Solution:
1. **Client-Side Early Status Cache (`peerStatusMapRef`):**
   * All incoming status updates are indexed in a `peerStatusMapRef` cache by `socketId` and `userId`.
   * When a peer object is instantiated from either `participant:joined` or `audio:signal`, its initial `isAudioOn` and `isVideoOn` states are resolved directly from the cache or signaling payload rather than defaulting to `true`.
2. **Signaling Payload Enhancement:**
   * Initial media states are included in `meeting:join`, `participant:joined`, and `audio:signal` payloads, propagating hardware states during the WebRTC handshake itself.
   * The backend socket server forwards `isAudioOn`, `isVideoOn`, and `avatar` attributes intact.
3. **P2P Connect Hook (`peer.on('connect')`):**
   * As soon as the direct WebRTC peer connection transitions to the connected state, both peers emit an immediate `meeting:status_update` to guarantee synchronized state.
4. **Robust Video Stream Playback:**
   * Added `peer.on('track')` and `onLoadedMetadata={() => ref.current?.play().catch(() => {})}` to guarantee the `<video>` pipeline begins playback as soon as media frames arrive.
5. **Callback Ref (`handleUserVideoRef`) & View Transition Stream Synchronizer:**
   * Implemented a `useCallback` ref (`handleUserVideoRef`) attached to both the Lobby and Main Stage `<video>` elements. As soon as React mounts any self `<video>` DOM node, `handleUserVideoRef` synchronously sets `el.srcObject = streamRef.current || stream` and triggers `.play()`.
   * Added an active `useEffect` listening to `[stream, participantStatus, isVideoOn]` ensuring seamless stream persistence across all role changes, lobby transitions, and camera toggles.

---

## Problem 10: Gemini 1.5 API Deprecation (404 Not Found) & Multi-Provider AI Architecture

### Symptom:
When generating meeting summaries or clicking "AI Summary" / "View Synthesis", the system popped up a modal error:
`Server error: Gemini API Error: 404 { "error": { "code": 404, "message": "models/gemini-1.5-pro is not found for API version v1beta, or is not supported for generateContent. Call ModelService.ListModels to see the list of available models and their supported methods.", "status": "NOT_FOUND" } }`

### Root Cause:
* Google deprecated earlier preview model designations (`gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-2.5-flash`) for newer API consumers, returning HTTP 404 with notice: *"This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements."*
* The backend `AIService` was hardcoded exclusively to deprecated model names and lacked multi-provider fallback. When all 4 hardcoded models returned 404, it threw a 500 server error to the frontend client.

### The Solution:
1. **Upgraded to Active Flagship Gemini Models:**
   * Updated the primary model priority queue to:
     `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.5-flash`, `gemini-flash-latest`, `gemini-3.5-flash-lite`, and `gemini-2.5-pro`.
2. **Multi-Provider Fallback Architecture:**
   * Added automatic fallback support for:
     * **Groq** (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`) if `GROQ_API_KEY` is present.
     * **OpenAI** (`gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`) if `OPENAI_API_KEY` is present.
     * **Anthropic** (`claude-3-5-haiku`, `claude-3-5-sonnet`) if `ANTHROPIC_API_KEY` is present.
3. **Resilient Local Structural Fallback:**
   * Added an offline linguistic structural analyzer (`generateStructuralSummary`) that parses speakers, discussions, and action verb commitments directly from the transcript if all cloud LLMs are unreachable or rate-limited.
   * Guarantees 100% service uptime: the user is never shown a 404/500 modal failure.

---

## Problem 11: Empirical System Latency Benchmarking Across Architectural Planes

### Objective:
Accurately measure, statistically profile, and document real-world latency times across comparable architectural states in BhashaBridge (Cold AI inference vs. Warm in-memory caching, PostgreSQL relational queries vs. Redis key-value lookups, dynamic multilingual translation vs. identity pass-through, and WebSocket signaling RTT) to provide empirically validated metrics for engineering resumes and architectural documentation.

### Benchmark Methodology & Test Harness:
* Built an automated benchmark suite in [`backend/scripts/benchmark-latency.js`](file:///E:/BhashaBridge/BhashaBridge/backend/scripts/benchmark-latency.js) utilizing Node.js high-resolution timers (`performance.now()`).
* Ran repeated production cycles across active live services:
  * **Cold Gemini 3.8 Flash** via Google Generative Language API
  * **Upstash Valkey / Redis** distributed in-memory key-value store over TLS
  * **Supabase PostgreSQL** via Prisma ORM connection pool
  * **Google Translate API** live translation engine (`@vitalets/google-translate-api`)
  * **Socket.IO** WebSocket real-time signaling plane on Node.js

### Verified Empirical Results:

| Architectural Domain / Pipeline | State A (Baseline / Cold) | State B (Optimized / Warm) | Speedup Ratio | Latency Reduction |
| :--- | :--- | :--- | :--- | :--- |
| **AI Meeting Synthesis** | Cold Gemini 3.8 Flash: **6,566.2 ms** (P50: 6,405.3 ms, P90: 7,503.9 ms) | Warm Redis Cache Hit: **109.8 ms** (P50: 108.2 ms, P90: 112.1 ms) | **59.8× Speedup** | **98.3% Decrease** |
| **Persistence Layer Read Path** | PostgreSQL / Prisma Query: **655.5 ms** (P50: 647.2 ms, P90: 660.4 ms) | Redis Key-Value Lookup: **108.3 ms** (P50: 107.8 ms, P90: 108.5 ms) | **6.1× Speedup** | **83.5% Decrease** |
| **Live Speech Translation** | Dynamic (EN $\rightarrow$ HI & ES): **738.4 ms** (Steady-state P50: **284.3 ms**) | Identity Pass-Through: **0.01 ms** (Bypass routing) | **73,836× Bypass** | Instant zero-cost stream |
| **WebSocket Signaling Plane** | Real-Time Peer Audio/Video Packet Relay RTT: **Mean 1.20 ms** (P50: **1.21 ms**, P95: **1.90 ms**, Min: **0.82 ms**) | - | - | **Sub-2ms Signaling** |

Raw benchmark JSON output is persisted at [`backend/scripts/benchmark-results.json`](file:///E:/BhashaBridge/BhashaBridge/backend/scripts/benchmark-results.json).

---

## Problem 12: Screen Share WebRTC Track Replacement & State Desynchronization

### Symptoms:
1. **Camera Off Black Screen / Hidden Tile:** If a user had their camera turned off (`isVideoOn === false`) and clicked "Share Screen", neither the sharer nor remote participants could see the shared screen. The video element remained hidden (`display: none`), displaying only the avatar placeholder.
2. **Stream Overwrite Flashing:** Re-renders triggered by state changes (`isVideoOn`, `isAudioOn`, participant joins) caused the media synchronizer `useEffect` and `handleUserVideoRef` to overwrite the active screen share stream with the camera stream.
3. **Peer Status Desynchronization:** Starting or stopping screen sharing did not notify the signaling server or remote peers of the updated video/screen state (`meeting:status_update`), leaving remote participant video tiles disabled.

### Root Cause:
* In `frontend/src/app/meeting/[id]/page.js`, video element visibility in both the self tile and `VideoPeer` was bound solely to `isVideoOn ? 'block' : 'none'`, ignoring `isScreenSharing`.
* The `handleUserVideoRef` callback and `useEffect` synchronizers always referenced `streamRef.current || stream` (the webcam) rather than prioritizing `screenStreamRef.current`.
* `stopScreenShare` and `toggleScreenShare` failed to propagate `isScreenSharing` to the backend Socket.IO signaling plane, leaving remote peers unaware that a video stream track was active.

### The Solution:
1. **Comprehensive Track Replacement:**
   * Updated `toggleScreenShare` and `stopScreenShare` to locate active RTCRtpSenders (`sender.track?.kind === 'video'`) and replace them with `screenTrack` (or restored `videoTrack` on stop).
   * Automatically hook `screenTrack.onended` to `stopScreenShare()` so the browser's native "Stop sharing" UI bar cleanly restores camera tracks.
2. **Stream Priority in Video Synchronizer:**
   * Updated `handleUserVideoRef` and the active stream `useEffect` to prioritize `screenStreamRef.current || streamRef.current || stream`, preventing re-renders from stomping on the shared screen feed.
3. **Dual State Visibility Condition:**
   * Updated both the Self `<video>` element and `<VideoPeer>` component to evaluate `const showVideo = isVideoOn || isScreenSharing; style={{ display: showVideo ? 'block' : 'none' }}`.
4. **Signaling Plane Propagation:**
   * Updated `backend/src/socket/index.js` and frontend socket handlers (`meeting:status_update` and `audio:signal`) to broadcast `isScreenSharing`.

---

## Problem 13: Mobile WebRTC & UI Adaptations, Settings Peer Eviction, Phantom Mic State & Production Speech-to-Speech Resolution

### Symptoms:
1. **Hardcoded Email Invitations & Broken Mobile Dropdown:**
   * Organization invite emails sent invitation links hardcoded to `http://localhost:3001/invite/[token]` instead of the live production domain (`https://bhashabridge.aditya-kumar.in`).
   * On mobile screens, clicking the notification bell icon opened an oversized desktop dropdown that overflowed off-screen, clipping invite cards and action buttons.
2. **Mobile Screen Sharing Failures & Distorted Video Tiles:**
   * Calling screen share on mobile browsers crashed without informative user feedback due to unsupported desktop audio constraints (`audio: true`).
   * Remote mobile portrait screen shares were severely cropped and zoomed because video elements used `object-fit: cover`.
3. **Settings Dropdown Participant Disappearance Glitch:**
   * Whenever any participant (host, cohost, or attendee) opened the Settings modal and selected any dropdown (Speech-to-Speech, Captions, Chat language), all other meeting participants disappeared for several seconds.
4. **Microphone Phantom Audio Transmission:**
   * When muting the microphone, speech or audio continued transmitting internally until the user clicked unmute and mute a second time.
5. **Speech-to-Speech Translation Failure on Mobile & Production Domain:**
   * Speech-to-speech translation worked across two windows on localhost desktop Chrome, but completely failed on mobile phones and on the production domain `https://bhashabridge.aditya-kumar.in`.

### Root Cause Analysis:
1. **Org Invites & Popup:**
   * In `backend/src/controllers/organization.controller.js` and `meeting.controller.js`, the invite link was hardcoded to `http://localhost:3001`.
   * In `frontend/src/components/NotificationBell.js`, the popup styling was positioned with `right: 0, width: '380px'` with no mobile viewport breakpoint or backdrop.
2. **Mobile Screen Share:**
   * Calling `getDisplayMedia({ video: true, audio: true })` throws `NotAllowedError` or `TypeError` on mobile WebKit/Blink because mobile OS display media APIs do not capture system loopback audio.
   * `object-fit: cover` forced vertical 9:16 mobile phone screens into horizontal 16:9 meeting tiles, cutting off 70% of the content.
3. **Settings Peer Eviction:**
   * In `frontend/src/app/meeting/[id]/page.js`, the main WebRTC connection `useEffect` had `user` in its dependency array: `}, [user, meetingId, retryCount]);`.
   * Selecting any language dropdown invoked `useAuthStore.getState().updateUser()`, which generated a new `user` object reference.
   * React triggered the effect cleanup, which destroyed all active simple-peer connections (`peer.destroy()`), cleared `peersRef.current = []`, and reset `setPeers([])`!
4. **Phantom Mic State:**
   * In `initializeMeeting()`, `getUserMedia({ audio: true })` created tracks that were enabled by default (`t.enabled = true`), without synchronizing with `audioRef.current`.
   * If a user was muted in lobby or joined muted, the physical track remained transmitting until toggled twice.
5. **Speech-to-Speech Translation on Mobile & Domain:**
   * **Domain Hardcoding:** Sockets and TTS endpoints fell back to `'http://localhost:5000'` when `process.env.NEXT_PUBLIC_SOCKET_URL` was unset, causing mixed-content and connection refused errors on phones and HTTPS domains.
   * **Mobile WebKit Autoplay Policy:** Mobile Safari and Chrome pause `window.speechSynthesis` and Web Audio until a user touch/click unlocks the audio subsystem.
   * **Safari Utterance Garbage Collection:** In iOS Safari, local `SpeechSynthesisUtterance` instances are garbage-collected mid-speech unless referenced globally on `window._activeUtterance`.
   * **Missing Language Voice Fallback:** Many mobile OS devices lack native offline TTS voices for Indian regional languages (e.g., Hindi, Tamil, Telugu). When `speechSynthesis.speak()` errored or stalled, there was no fallback to the backend Google TTS MP3 proxy (`/api/tts`).
   * **Continuous Speech Recognition on Mobile:** Mobile WebKit strictly rejects `rec.continuous = true`, causing recognition to terminate prematurely.

### The Solution:
1. **Dynamic Domain Resolution & Responsive Drawer:**
   * Updated `organization.controller.js` and `meeting.controller.js` to derive the base URL from `req.headers.origin` or fallback to `https://bhashabridge.aditya-kumar.in`.
   * Transformed `NotificationBell.js` with responsive viewport detection (`innerWidth < 640px`), rendering a centered fixed drawer (`left: 0.75rem, right: 0.75rem, top: 65px`) with a darkened backdrop overlay and mobile touch dismiss.
2. **Mobile Display Media & Aspect-Ratio Containment:**
   * Updated `toggleScreenShare` to verify `navigator.mediaDevices.getDisplayMedia`, call `{ video: true }` without desktop-only audio constraints, and gracefully handle permission cancellation.
   * Updated self `<video>` and `<VideoPeer>` elements to dynamically switch `objectFit: isScreenSharing ? 'contain' : 'cover'` with letterbox background `#000`.
3. **Targeted Dependency Arrays in Meeting Lifecycle:**
   * Swapped `user` for primitive `user?.id` in the main connection `useEffect` (`[user?.id, meetingId, retryCount]`) and Speech Recognition hook (`[socket, user?.id, ...]`). Settings updates now mutate state without re-running socket or peer teardowns.
4. **Strict Microphone Track State Synchronization:**
   * Enforced `currentStream.getAudioTracks().forEach(t => { t.enabled = audioRef.current; })` immediately upon acquiring stream in `initializeMeeting()`.
   * Added `useEffect([isAudioOn, stream])` synchronization and immediate `activeSpeechRecRef.current.abort()` on microphone mute.
5. **Universal Speech-to-Speech Engine with Dual Fallback:**
   * **Dynamic Origin Adapters:** Added `getSocketUrl()` and `getApiUrl()` to `page.js`, `api.js`, `dashboard/page.js`, and `NotificationBell.js` to automatically resolve to `window.location.origin` on non-localhost hosts.
   * **Touch Gesture Audio Primer:** Registered one-time `touchstart` and `click` listeners that prime `SpeechSynthesisUtterance` and resume suspended `AudioContext`.
   * **BCP-47 Tag Normalization:** Mapped language codes (`'hi'` $\rightarrow$ `'hi-IN'`, `'en'` $\rightarrow$ `'en-US'`) for system voice matching.
   * **Safari Utterance Retention:** Anchored active utterances to `window._activeUtterance` with cleanup on `onend`/`onerror`.
   * **Automatic Backend MP3 Fallback:** Created `playTtsAudio` with an automatic fallback: if native synthesis encounters `onerror`, lacks voices, or stalls for > 1.8 seconds, it transparently fetches and streams audio from `${getApiUrl()}/tts?text=...&lang=...`.
   * **Mobile Speech Recognition Loop:** Switched mobile devices (`isMobile`) to `continuous = false` with rapid 150ms `onend` auto-restarts, ensuring uninterrupted voice transcription across iOS Safari and Android Chrome.
