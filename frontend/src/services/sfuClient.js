'use client';

import { io } from 'socket.io-client';
import { getSfuBaseUrlWithPortFallback } from './urls';

/**
 * BhashaBridge SFU Client
 *
 * Browser-side wrapper around mediasoup-client and the sfu-service Socket.IO
 * namespace (/sfu). It negotiates a send + receive WebRTC transport, publishes
 * the local microphone/camera (with 3-layer simulcast), and consumes every
 * remote producer into per-participant MediaStreams.
 *
 * The client is intentionally self-contained and fails closed: if the SFU is
 * unreachable or running the Virtual engine (no native mediasoup), init()
 * rejects and the meeting room keeps using its P2P mesh fallback.
 */

const SIMULCAST_ENCODINGS = [
  { rid: 'r0', maxBitrate: 150000, scaleResolutionDownBy: 4.0 }, // 360p
  { rid: 'r1', maxBitrate: 500000, scaleResolutionDownBy: 2.0 }, // 720p
  { rid: 'r2', maxBitrate: 1500000, scaleResolutionDownBy: 1.0 } // 1080p
];

export function getSfuBaseUrl() {
  return getSfuBaseUrlWithPortFallback();
}

function normalizeMetadata(input = {}) {
  return {
    userId: input.userId ? String(input.userId) : null,
    name: input.name || null,
    role: input.role || null,
    avatar: input.avatar || null,
    language: input.language || null
  };
}

export default class SFUClient {
  constructor(options = {}) {
    this.meetingId = options.meetingId;
    this.peerId = options.peerId || null;
    this.user = normalizeMetadata(options.user || {});
    this.role = options.role || null;
    this.baseUrl = (options.baseUrl || getSfuBaseUrl()).replace(/\/+$/, '');
    this.onPeer = options.onPeer || (() => {});
    this.onPeerLeft = options.onPeerLeft || (() => {});
    this.onCaption = options.onCaption || (() => {});
    this.onError = options.onError || (() => {});
    this.logger = options.logger || console;

    this.socket = null;
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.audioProducer = null;
    this.videoProducer = null;
    this.iceServers = undefined;
    this.initialized = false;
    this.closed = false;

    this.consumers = new Map();          // consumerId -> consumer
    this.consumedProducers = new Set();  // producerId
    this.pendingProducers = new Set();   // producerId currently being consumed
    this.producerToConsumer = new Map(); // producerId -> consumerId
    this.removingProducers = new Set();  // guard against close-event recursion
    this.peerStreams = new Map();        // peerKey -> { peerId, meta, tracks: Map, stream }
  }

  async init() {
    if (this.initialized) return true;
    if (this.closed) throw new Error('SFU client is closed');
    if (!this.meetingId) throw new Error('meetingId is required');

    // 1. Verify the SFU is reachable and running the native media core.
    let health;
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`SFU health HTTP ${res.status}`);
      health = await res.json();
    } catch (err) {
      throw new Error(`SFU unavailable: ${err.message}`);
    }

    if (!health?.mediasoup?.isNative) {
      throw new Error('SFU is running the Virtual engine (native mediasoup not installed)');
    }

    // 2. Load mediasoup-client lazily (browser-only package).
    const { Device } = await import('mediasoup-client');
    this.device = new Device();

    // 3. Connect the signaling namespace.
    this.socket = io(`${this.baseUrl}/sfu`, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 8000
    });

    await this.waitForSocketConnect();

    const join = await this.emitWithAck('sfu:join-room', {
      meetingId: this.meetingId,
      peerId: this.peerId || this.socket.id,
      user: { ...this.user, role: this.role }
    });

    if (join?.error) throw new Error(join.error);
    this.peerId = join.peerId || this.peerId || this.socket.id;
    this.iceServers = Array.isArray(join.iceServers) && join.iceServers.length > 0
      ? join.iceServers
      : undefined;

    await this.device.load({ routerRtpCapabilities: join.rtpCapabilities });

    this.sendTransport = await this.createTransport('send');
    this.recvTransport = await this.createTransport('recv');

    this.attachSocketEvents();

    // Seed participants who are already in the room but have not published a
    // track yet (camera/mic off), otherwise their tile never appears.
    for (const peer of join.peers || []) {
      const meta = normalizeMetadata({
        ...(peer.metadata || {}),
        userId: peer.metadata?.userId || peer.peerId
      });
      const peerKey = meta.userId || peer.peerId;
      if (!peerKey || this.peerStreams.has(peerKey)) continue;
      this.peerStreams.set(peerKey, {
        peerId: peer.peerId,
        meta,
        tracks: new Map(),
        stream: null
      });
      this.emitPeer(peerKey, this.peerStreams.get(peerKey));
    }

    // 4. Consume producers that were already in the room.
    for (const producer of join.existingProducers || []) {
      this.consumeProducer(producer).catch((err) => {
        this.logger.warn('[SFU] Failed to consume existing producer:', err.message);
      });
    }

    this.initialized = true;
    this.logger.log('[SFU] Connected', {
      meetingId: this.meetingId,
      peerId: this.peerId,
      existingProducers: (join.existingProducers || []).length
    });
    return true;
  }

  waitForSocketConnect(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Socket not created'));
      if (this.socket.connected) return resolve();

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('SFU signaling connection timed out'));
      }, timeoutMs);

      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(new Error(err?.message || 'SFU signaling connection failed'));
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.socket.off('connect', onConnect);
        this.socket.off('connect_error', onError);
      };

      this.socket.once('connect', onConnect);
      this.socket.once('connect_error', onError);
    });
  }

  emitWithAck(event, payload, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('SFU socket not connected'));

      const timer = setTimeout(() => {
        reject(new Error(`${event} timed out`));
      }, timeoutMs);

      try {
        this.socket.emit(event, payload, (response) => {
          clearTimeout(timer);
          resolve(response || {});
        });
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  async createTransport(direction) {
    const data = await this.emitWithAck('sfu:create-transport', { direction });
    if (data?.error) throw new Error(data.error);

    const transportOptions = {
      id: data.id,
      iceParameters: data.iceParameters,
      iceCandidates: data.iceCandidates,
      dtlsParameters: data.dtlsParameters,
      sctpParameters: data.sctpParameters,
      iceServers: this.iceServers,
      appData: { direction }
    };

    const transport = direction === 'send'
      ? this.device.createSendTransport(transportOptions)
      : this.device.createRecvTransport(transportOptions);

    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      this.emitWithAck('sfu:connect-transport', {
        transportId: transport.id,
        dtlsParameters
      }).then((res) => {
        if (res?.error) return errback(new Error(res.error));
        callback();
      }).catch(errback);
    });

    if (direction === 'send') {
      transport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        this.emitWithAck('sfu:produce', {
          transportId: transport.id,
          kind,
          rtpParameters,
          appData
        }).then((res) => {
          if (res?.error) return errback(new Error(res.error));
          callback({ id: res.id });
        }).catch(errback);
      });
    }

    transport.on('connectionstatechange', (state) => {
      this.logger.log(`[SFU] ${direction} transport state:`, state);
      if (state === 'failed') {
        this.onError(new Error(`SFU ${direction} transport failed`));
      }
    });

    return transport;
  }

  /**
   * Publish the local microphone and camera tracks.
   */
  async produce(stream) {
    if (!this.sendTransport) throw new Error('Send transport is not ready');

    const audioTrack = stream?.getAudioTracks?.()[0];
    const videoTrack = stream?.getVideoTracks?.()[0];
    const appData = {
      ...this.user,
      role: this.role,
      source: 'mic'
    };

    if (audioTrack && audioTrack.readyState === 'live') {
      this.audioProducer = await this.sendTransport.produce({
        track: audioTrack,
        // The same tracks are reused by the P2P fallback; closing the SFU
        // producer must not stop the user's actual microphone.
        stopTracks: false,
        appData: { ...appData, source: 'mic' }
      });
    }

    if (videoTrack && videoTrack.readyState === 'live') {
      this.videoProducer = await this.sendTransport.produce({
        track: videoTrack,
        stopTracks: false,
        encodings: SIMULCAST_ENCODINGS,
        codecOptions: { videoGoogleStartBitrate: 1000 },
        appData: { ...appData, source: 'camera' }
      });
    }

    return {
      audioProducer: this.audioProducer,
      videoProducer: this.videoProducer
    };
  }

  /**
   * Swap the outgoing camera track for a screen-share track (and back).
   * If the participant has no camera producer yet, a new one is published so
   * screen sharing still works for camera-less joins.
   */
  async replaceVideoTrack(track) {
    if (this.videoProducer) {
      await this.videoProducer.replaceTrack({ track: track || null });
      return true;
    }

    if (track && this.sendTransport) {
      this.videoProducer = await this.sendTransport.produce({
        track,
        stopTracks: false,
        encodings: SIMULCAST_ENCODINGS,
        codecOptions: { videoGoogleStartBitrate: 1000 },
        appData: {
          ...this.user,
          role: this.role,
          source: 'camera'
        }
      });
      return true;
    }

    return false;
  }

  async setProducerPaused(kind, paused) {
    const producer = kind === 'audio' ? this.audioProducer : this.videoProducer;
    if (!producer) return false;

    try {
      if (paused && typeof producer.pause === 'function') producer.pause();
      if (!paused && typeof producer.resume === 'function') producer.resume();
    } catch (err) {
      this.logger.warn('[SFU] Producer pause/resume failed:', err.message);
    }
    return true;
  }

  /**
   * Consume a remote producer and merge its track into the peer's MediaStream.
   */
  async consumeProducer(producer) {
    if (!producer || !producer.producerId || !this.recvTransport) return null;
    if (producer.peerId === this.peerId) return null;
    if (this.consumedProducers.has(producer.producerId)) return null;
    if (this.pendingProducers.has(producer.producerId)) return null;
    this.pendingProducers.add(producer.producerId);

    try {
      const response = await this.emitWithAck('sfu:consume', {
      transportId: this.recvTransport.id,
      producerId: producer.producerId,
      rtpCapabilities: this.device.rtpCapabilities,
      appData: { source: producer.appData?.source || 'camera' }
    });

    if (response?.error) throw new Error(response.error);

    const consumer = await this.recvTransport.consume({
      id: response.id,
      producerId: response.producerId,
      kind: response.kind,
      rtpParameters: response.rtpParameters,
      appData: response.appData || producer.appData || {}
    });

    this.consumers.set(consumer.id, consumer);
    this.consumedProducers.add(producer.producerId);
    this.producerToConsumer.set(producer.producerId, consumer.id);

    const meta = normalizeMetadata({
      ...(response.appData || {}),
      ...(producer.appData || {}),
      userId: producer.appData?.userId || response.appData?.userId,
      name: producer.appData?.name || response.appData?.name,
      role: producer.appData?.role || response.appData?.role,
      avatar: producer.appData?.avatar || response.appData?.avatar
    });

    this.addPeerTrack(
      meta,
      producer.peerId || response.appData?.peerId,
      consumer.track,
      consumer.kind,
      producer.producerId,
      producer.appData?.source || response.appData?.source
    );

    consumer.on('transportclose', () => this.removeProducer(producer.producerId));
    consumer.on('trackended', () => this.removeProducer(producer.producerId));
    consumer.on('close', () => this.removeProducer(producer.producerId));

    // Video consumers start paused so the browser can render the first frame;
    // resume immediately after the track has been attached.
    if (consumer.kind === 'video' && typeof consumer.resume === 'function') {
      try { await consumer.resume(); } catch (_) {}
    }

    return consumer;
    } finally {
      this.pendingProducers.delete(producer.producerId);
    }
  }

  addPeerTrack(meta, sfuPeerId, track, kind, producerId, source) {
    const peerKey = meta.userId || sfuPeerId || producerId;

    if (!this.peerStreams.has(peerKey)) {
      this.peerStreams.set(peerKey, {
        peerId: sfuPeerId,
        meta: { ...meta },
        tracks: new Map(),
        stream: null
      });
    }

    const entry = this.peerStreams.get(peerKey);
    entry.peerId = sfuPeerId || entry.peerId;
    entry.meta = { ...entry.meta, ...meta };
    entry.tracks.set(producerId, { track, kind, source });

    this.emitPeer(peerKey, entry);
  }

  emitPeer(peerKey, entry) {
    const tracks = Array.from(entry.tracks.values())
      .map((item) => item.track)
      .filter((track) => track && track.readyState !== 'ended');

    const stream = new MediaStream(tracks);
    entry.stream = stream;

    const hasAudio = tracks.some((track) => track.kind === 'audio');
    const hasVideo = tracks.some((track) => track.kind === 'video');
    const isScreenSharing = Array.from(entry.tracks.values())
      .some((item) => item.source === 'screen');

    this.onPeer({
      peerId: entry.peerId,
      userId: entry.meta.userId,
      name: entry.meta.name,
      role: entry.meta.role,
      avatar: entry.meta.avatar,
      stream,
      // Media presence is reported separately from mute state: a paused
      // producer still has a live consumer track. Mute/camera/screen flags are
      // authoritative on the meeting signaling channel, so leave them
      // undefined here to avoid clobbering them.
      hasAudio,
      hasVideo,
      isScreenSharing: isScreenSharing ? true : undefined,
      tracks: entry.tracks.size
    });
  }

  removeProducer(producerId) {
    if (this.removingProducers.has(producerId)) return;
    this.removingProducers.add(producerId);

    const consumerId = this.producerToConsumer.get(producerId);
    if (consumerId) {
      const consumer = this.consumers.get(consumerId);
      if (consumer) {
        try { consumer.close(); } catch (_) {}
      }
      this.consumers.delete(consumerId);
      this.producerToConsumer.delete(producerId);
    }
    this.consumedProducers.delete(producerId);

    for (const [peerKey, entry] of this.peerStreams.entries()) {
      if (!entry.tracks.has(producerId)) continue;

      entry.tracks.delete(producerId);
      if (entry.tracks.size === 0) {
        this.peerStreams.delete(peerKey);
        this.onPeerLeft({
          peerId: entry.peerId,
          userId: entry.meta.userId
        });
      } else {
        this.emitPeer(peerKey, entry);
      }
      break;
    }

    this.removingProducers.delete(producerId);
  }

  removePeer({ peerId, userId } = {}) {
    for (const [peerKey, entry] of this.peerStreams.entries()) {
      const matches =
        (userId && entry.meta.userId === userId) ||
        (peerId && entry.peerId === peerId) ||
        (peerId && peerKey === peerId);

      if (!matches) continue;

      for (const producerId of entry.tracks.keys()) {
        const consumerId = this.producerToConsumer.get(producerId);
        if (consumerId) {
          const consumer = this.consumers.get(consumerId);
          if (consumer) {
            try { consumer.close(); } catch (_) {}
          }
          this.consumers.delete(consumerId);
          this.producerToConsumer.delete(producerId);
        }
        this.consumedProducers.delete(producerId);
      }

      this.peerStreams.delete(peerKey);
      this.onPeerLeft({ peerId: entry.peerId, userId: entry.meta.userId });
    }
  }

  attachSocketEvents() {
    if (!this.socket) return;

    this.socket.on('sfu:new-producer', (producer) => {
      if (!producer || producer.peerId === this.peerId) return;
      this.consumeProducer(producer).catch((err) => {
        this.logger.warn('[SFU] Failed to consume new producer:', err.message);
      });
    });

    this.socket.on('sfu:producer-closed', ({ producerId }) => {
      if (producerId) this.removeProducer(producerId);
    });

    this.socket.on('sfu:peer-left', (peer) => {
      this.removePeer(peer);
    });

    this.socket.on('sfu:audio-tap-transcription', (payload) => {
      this.onCaption(payload);
    });

    this.socket.on('disconnect', (reason) => {
      if (this.closed) return;
      this.logger.warn('[SFU] Signaling disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      if (this.closed) return;
      this.logger.warn('[SFU] Signaling connection error:', err.message);
    });
  }

  /**
   * Ask the SFU to switch a peer's video consumer to a specific simulcast layer.
   */
  async setPreferredLayers(userId, spatialLayer, temporalLayer = 2) {
    for (const [producerId, consumerId] of this.producerToConsumer.entries()) {
      const consumer = this.consumers.get(consumerId);
      if (!consumer || consumer.kind !== 'video') continue;

      for (const entry of this.peerStreams.values()) {
        if (entry.meta.userId !== userId) continue;
        if (!entry.tracks.has(producerId)) continue;
        try {
          await consumer.setPreferredLayers({ spatialLayer, temporalLayer });
          return true;
        } catch (_) {
          return false;
        }
      }
    }
    return false;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;

    try {
      if (this.socket?.connected) {
        await this.emitWithAck('sfu:leave-room', {}, 2000).catch(() => {});
      }
    } catch (_) {}

    for (const consumer of this.consumers.values()) {
      try { consumer.close(); } catch (_) {}
    }
    this.consumers.clear();
    this.consumedProducers.clear();
    this.producerToConsumer.clear();
    this.removingProducers.clear();
    this.peerStreams.clear();

    for (const producer of [this.audioProducer, this.videoProducer]) {
      try { producer?.close(); } catch (_) {}
    }
    this.audioProducer = null;
    this.videoProducer = null;

    try { this.sendTransport?.close(); } catch (_) {}
    try { this.recvTransport?.close(); } catch (_) {}
    this.sendTransport = null;
    this.recvTransport = null;

    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      } catch (_) {}
      this.socket = null;
    }

    this.initialized = false;
  }
}
