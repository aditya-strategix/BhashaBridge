/**
 * SFU Microservice Client SDK
 * Enables backend services and edge nodes to negotiate WebRTC media routers,
 * manage transports, orchestrate simulcast, and attach digital audio taps.
 */
class SFUServiceClient {
  constructor(baseUrl = process.env.SFU_SERVICE_URL || 'http://localhost:5002') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Health and telemetry check
   */
  async checkHealth() {
    const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`SFU health check failed with HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Provision or fetch room router
   */
  async createRoom(meetingId) {
    const res = await fetch(`${this.baseUrl}/api/v1/sfu/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`SFU createRoom error HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Get router RTP capabilities
   */
  async getRtpCapabilities(meetingId) {
    const res = await fetch(`${this.baseUrl}/api/v1/sfu/capabilities/${encodeURIComponent(meetingId)}`, {
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) throw new Error(`SFU getRtpCapabilities error HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Create WebRTC Transport
   */
  async createTransport(meetingId, peerId, direction = 'send', options = {}) {
    const res = await fetch(`${this.baseUrl}/api/v1/sfu/transports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId, peerId, direction, options }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`SFU createTransport error HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Connect transport with client DTLS parameters
   */
  async connectTransport(meetingId, transportId, dtlsParameters) {
    const res = await fetch(`${this.baseUrl}/api/v1/sfu/transports/${transportId}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId, dtlsParameters }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`SFU connectTransport error HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Produce audio or video track
   */
  async produce(meetingId, transportId, { kind, rtpParameters, appData = {} }) {
    const res = await fetch(`${this.baseUrl}/api/v1/sfu/transports/${transportId}/produce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId, kind, rtpParameters, appData }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`SFU produce error HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Consume a remote peer's track
   */
  async consume(meetingId, transportId, { producerId, rtpCapabilities, appData = {} }) {
    const res = await fetch(`${this.baseUrl}/api/v1/sfu/transports/${transportId}/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId, producerId, rtpCapabilities, appData }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`SFU consume error HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Attach Server-Side Audio Tap (Pillar 5)
   */
  async createAudioTap(meetingId, producerId, participantId, options = {}) {
    const res = await fetch(`${this.baseUrl}/api/v1/sfu/audio-tap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId, producerId, participantId, options }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`SFU createAudioTap error HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Close a room
   */
  async closeRoom(meetingId) {
    const res = await fetch(`${this.baseUrl}/api/v1/sfu/rooms/${encodeURIComponent(meetingId)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) throw new Error(`SFU closeRoom error HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Global metrics
   */
  async getStats() {
    const res = await fetch(`${this.baseUrl}/api/v1/sfu/stats`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`SFU getStats error HTTP ${res.status}`);
    return await res.json();
  }
}

module.exports = new SFUServiceClient();
module.exports.SFUServiceClient = SFUServiceClient;
