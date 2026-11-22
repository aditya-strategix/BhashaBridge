const EventEmitter = require('events');
const config = require('../config');
const AudioTap = require('./audio-tap');

/**
 * SFU Room Router Manager
 * Manages media topology for a single meeting room (meetingId).
 * Enforces O(1) ingress uplink and O(N-1) downstream egress routing.
 */
class SFURoomRouter extends EventEmitter {
  constructor(meetingId, router, worker) {
    super();
    this.meetingId = meetingId;
    this.router = router;
    this.worker = worker;
    this.closed = false;

    // Collections
    this.transports = new Map(); // transportId -> transport
    this.producers = new Map();  // producerId -> producer
    this.consumers = new Map();  // consumerId -> consumer
    this.peers = new Map();      // peerId -> { transports, producers, consumers }
    this.audioTaps = new Map();  // producerId -> AudioTap

    console.log(`[SFURoomRouter] Provisioned router for meeting: ${meetingId} on worker: ${worker.pid || worker.id}`);
  }

  /**
   * Get room router RTP capabilities for client device negotiation
   */
  getRtpCapabilities() {
    return this.router.rtpCapabilities;
  }

  /**
   * Create a WebRTC transport for a peer (either 'send' or 'recv')
   */
  async createWebRtcTransport(peerId, direction = 'send', options = {}) {
    if (this.closed) throw new Error(`Room ${this.meetingId} closed`);

    const transportOptions = {
      ...config.mediasoup.webRtcTransport,
      ...options,
      appData: { peerId, direction, meetingId: this.meetingId }
    };

    const transport = await this.router.createWebRtcTransport(transportOptions);

    this.transports.set(transport.id, transport);

    // Track peer associations
    if (!this.peers.has(peerId)) {
      this.peers.set(peerId, { transports: new Set(), producers: new Set(), consumers: new Set() });
    }
    this.peers.get(peerId).transports.add(transport.id);

    // Cleanup listeners
    transport.on('close', () => {
      this.transports.delete(transport.id);
      const peer = this.peers.get(peerId);
      if (peer) peer.transports.delete(transport.id);
    });

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'failed' || dtlsState === 'closed') {
        transport.close();
      }
    });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters
    };
  }

  /**
   * Connect transport with client's DTLS parameters
   */
  async connectTransport(transportId, dtlsParameters) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    await transport.connect({ dtlsParameters });
    return { connected: true };
  }

  /**
   * Produce audio or video track from participant
   */
  async produce(transportId, { kind, rtpParameters, appData = {} }) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    const peerId = transport.appData.peerId;
    const enrichedAppData = { ...appData, peerId, meetingId: this.meetingId };

    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData: enrichedAppData
    });

    this.producers.set(producer.id, producer);
    const peer = this.peers.get(peerId);
    if (peer) peer.producers.add(producer.id);

    producer.on('close', () => {
      this.producers.delete(producer.id);
      if (peer) peer.producers.delete(producer.id);
      
      // Stop and remove associated audio tap if any
      if (this.audioTaps.has(producer.id)) {
        this.audioTaps.get(producer.id).stop();
        this.audioTaps.delete(producer.id);
      }

      this.emit('producer-closed', { producerId: producer.id, peerId, kind });
    });

    // Auto-create Server-Side Audio Tap for audio tracks if enabled
    if (kind === 'audio' && config.audioTap.enabled) {
      this.createAudioTap(producer.id, peerId);
    }

    this.emit('new-producer', {
      producerId: producer.id,
      peerId,
      kind,
      appData: enrichedAppData
    });

    return { id: producer.id, kind: producer.kind };
  }

  /**
   * Consume an existing producer's track
   */
  async consume(transportId, { producerId, rtpCapabilities, appData = {} }) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    const producer = this.producers.get(producerId);
    if (!producer) throw new Error(`Producer ${producerId} not found`);

    // Verify if router can consume
    if (!this.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error(`Cannot consume producer ${producerId} with given RTP capabilities`);
    }

    const peerId = transport.appData.peerId;
    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
      appData: { ...appData, peerId, meetingId: this.meetingId, kind: producer.kind }
    });

    this.consumers.set(consumer.id, consumer);
    const peer = this.peers.get(peerId);
    if (peer) peer.consumers.add(consumer.id);

    consumer.on('close', () => {
      this.consumers.delete(consumer.id);
      if (peer) peer.consumers.delete(consumer.id);
    });

    consumer.on('producerclose', () => {
      consumer.close();
      this.consumers.delete(consumer.id);
    });

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: producer.paused
    };
  }

  /**
   * Attach Server-Side Audio Tap to an audio producer
   */
  createAudioTap(producerId, participantId, options = {}) {
    const producer = this.producers.get(producerId);
    if (!producer) throw new Error(`Producer ${producerId} not found`);
    if (producer.kind !== 'audio') throw new Error(`Cannot tap non-audio producer ${producerId}`);

    if (this.audioTaps.has(producerId)) {
      return this.audioTaps.get(producerId);
    }

    const audioTap = new AudioTap(producer, this.meetingId, participantId, options);
    this.audioTaps.set(producerId, audioTap);
    audioTap.start();

    audioTap.on('transcription', (captionEvent) => {
      this.emit('audio-tap-transcription', { meetingId: this.meetingId, captionEvent });
    });

    return audioTap;
  }

  /**
   * Pause/Resume consumer
   */
  async pauseConsumer(consumerId) {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) throw new Error(`Consumer ${consumerId} not found`);
    await consumer.pause();
    return { paused: true };
  }

  async resumeConsumer(consumerId) {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) throw new Error(`Consumer ${consumerId} not found`);
    await consumer.resume();
    return { resumed: true };
  }

  /**
   * Set consumer preferred spatial layer (Simulcast 360p/720p/1080p)
   */
  async setConsumerPreferredLayers(consumerId, spatialLayer, temporalLayer = 2) {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) throw new Error(`Consumer ${consumerId} not found`);
    if (typeof consumer.setPreferredLayers === 'function') {
      await consumer.setPreferredLayers({ spatialLayer, temporalLayer });
    }
    return { spatialLayer, temporalLayer };
  }

  /**
   * Remove a peer from the room and clean all associated resources
   */
  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    for (const producerId of peer.producers) {
      const producer = this.producers.get(producerId);
      if (producer) producer.close();
    }

    for (const consumerId of peer.consumers) {
      const consumer = this.consumers.get(consumerId);
      if (consumer) consumer.close();
    }

    for (const transportId of peer.transports) {
      const transport = this.transports.get(transportId);
      if (transport) transport.close();
    }

    this.peers.delete(peerId);
    console.log(`[SFURoomRouter] Removed peer: ${peerId} from meeting: ${this.meetingId}`);
  }

  /**
   * Router statistics
   */
  getStats() {
    return {
      meetingId: this.meetingId,
      routerId: this.router.id,
      workerPid: this.worker.pid || this.worker.id,
      totalPeers: this.peers.size,
      totalTransports: this.transports.size,
      totalProducers: this.producers.size,
      totalConsumers: this.consumers.size,
      activeAudioTaps: this.audioTaps.size,
      peers: Array.from(this.peers.keys()),
      producers: Array.from(this.producers.values()).map(p => ({
        id: p.id,
        kind: p.kind,
        peerId: p.appData.peerId,
        paused: p.paused
      }))
    };
  }

  /**
   * Close room router
   */
  close() {
    if (this.closed) return;
    this.closed = true;

    for (const audioTap of this.audioTaps.values()) {
      audioTap.stop();
    }
    this.audioTaps.clear();

    for (const transport of this.transports.values()) {
      transport.close();
    }
    this.transports.clear();
    this.producers.clear();
    this.consumers.clear();
    this.peers.clear();

    this.router.close();
    this.emit('close');
    console.log(`[SFURoomRouter] Closed room router: ${this.meetingId}`);
  }
}

module.exports = SFURoomRouter;
