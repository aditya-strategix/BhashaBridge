const roomManager = require('../sfu/room-manager');
const config = require('../config');

// One broadcaster per room. Room events used to be subscribed once per socket,
// which multiplied every media event by the number of connected peers and let
// each listener broadcast to everyone except itself.
const roomBroadcasters = new Map();

function detachRoomBroadcaster(meetingId) {
  const entry = roomBroadcasters.get(meetingId);
  if (!entry) return;
  entry.detach();
  roomBroadcasters.delete(meetingId);
}

function attachRoomBroadcaster(namespace, meetingId, room) {
  const existing = roomBroadcasters.get(meetingId);
  if (existing && existing.room === room) return;
  if (existing) detachRoomBroadcaster(meetingId);

  const emit = (event, payload) => namespace.to(meetingId).emit(event, payload);
  const onNewProducer = ({ producerId, peerId, kind, appData }) => {
    emit('sfu:new-producer', { producerId, peerId, kind, appData });
  };
  const onProducerClosed = ({ producerId, peerId, kind }) => {
    emit('sfu:producer-closed', { producerId, peerId, kind });
  };
  const onTranscription = ({ meetingId: tapMeetingId, captionEvent }) => {
    emit('sfu:audio-tap-transcription', { meetingId: tapMeetingId, captionEvent });
  };

  const detach = () => {
    try { room.off('new-producer', onNewProducer); } catch (_) {}
    try { room.off('producer-closed', onProducerClosed); } catch (_) {}
    try { room.off('audio-tap-transcription', onTranscription); } catch (_) {}
    try { room.off('close', detach); } catch (_) {}
  };

  room.on('new-producer', onNewProducer);
  room.on('producer-closed', onProducerClosed);
  room.on('audio-tap-transcription', onTranscription);
  room.once('close', detach);

  roomBroadcasters.set(meetingId, { room, detach });
}

/**
 * Socket.IO Real-Time WebRTC Signaling Gateway
 * Handles sub-millisecond bidirectional signaling for transport creation,
 * ICE/DTLS negotiation, and multi-party track distribution.
 */

function sanitizeMetadata(input = {}) {
  return {
    userId: input.userId !== undefined && input.userId !== null ? String(input.userId) : null,
    name: input.name ? String(input.name) : null,
    role: input.role ? String(input.role) : null,
    avatar: input.avatar ? String(input.avatar) : null,
    language: input.language ? String(input.language) : null
  };
}

function setupSfuSocket(io) {
  const sfuNamespace = io.of('/sfu');

  sfuNamespace.on('connection', (socket) => {
    const state = {
      meetingId: null,
      peerId: null,
      metadata: {},
      room: null
    };

    const respond = (callback, payload) => {
      if (typeof callback === 'function') callback(payload);
    };

    const fail = (callback, err) => {
      respond(callback, { error: err?.message || String(err) });
    };

    const leaveCurrentRoom = () => {
      if (state.room && state.meetingId && state.peerId) {
        state.room.removePeer(state.peerId);
        socket.to(state.meetingId).emit('sfu:peer-left', {
          peerId: state.peerId,
          ...state.metadata
        });
        roomManager.scheduleEmptyCleanup(state.meetingId);
      }
      if (state.meetingId) {
        try { socket.leave(state.meetingId); } catch (_) {}
      }
      state.meetingId = null;
      state.peerId = null;
      state.metadata = {};
      state.room = null;
    };

    const requireJoined = () => {
      if (!state.room || !state.meetingId || !state.peerId) {
        throw new Error('Peer has not joined an SFU room');
      }
      return state.room;
    };

    console.log(`[SFU Signaling] Peer socket connected: ${socket.id}`);

    // 1. Join Room & Exchange Capabilities
    socket.on('sfu:join-room', async (payload = {}, callback) => {
      try {
        const { meetingId, peerId } = payload;
        if (!meetingId) throw new Error('meetingId is required');

        // Idempotent re-join: clean up any previous room association first.
        if (state.meetingId) leaveCurrentRoom();

        const effectivePeerId = String(peerId || socket.id);
        const metadata = sanitizeMetadata(payload.user || payload);

        state.meetingId = String(meetingId);
        state.peerId = effectivePeerId;
        state.metadata = metadata;

        socket.join(state.meetingId);
        const room = await roomManager.getOrCreateRoom(state.meetingId);
        state.room = room;
        room.ensurePeer(effectivePeerId, metadata);

        // Register exactly one room-scoped broadcaster for this meeting.
        attachRoomBroadcaster(sfuNamespace, state.meetingId, room);

        const existingProducers = room.getProducers().filter(
          (producer) => producer.peerId !== state.peerId
        );
        const peers = room.listPeers().filter((peer) => peer.peerId !== state.peerId);

        socket.to(state.meetingId).emit('sfu:peer-joined', {
          peerId: state.peerId,
          ...metadata
        });

        respond(callback, {
          meetingId: state.meetingId,
          peerId: state.peerId,
          rtpCapabilities: room.getRtpCapabilities(),
          existingProducers,
          peers,
          iceServers: config.iceServers || []
        });
      } catch (err) {
        console.error('[SFU Signaling] sfu:join-room error:', err.message);
        fail(callback, err);
      }
    });

    // 2. Leave Room explicitly (graceful teardown)
    socket.on('sfu:leave-room', (payload = {}, callback) => {
      try {
        leaveCurrentRoom();
        respond(callback, { left: true });
      } catch (err) {
        fail(callback, err);
      }
    });

    // 3. Create WebRTC Transport
    socket.on('sfu:create-transport', async (payload = {}, callback) => {
      try {
        const { direction = 'send', options = {} } = payload;
        const room = requireJoined();
        const transportData = await room.createWebRtcTransport(
          state.peerId,
          direction,
          { ...options, metadata: state.metadata }
        );
        respond(callback, transportData);
      } catch (err) {
        console.error('[SFU Signaling] sfu:create-transport error:', err.message);
        fail(callback, err);
      }
    });

    // 4. Connect WebRTC Transport
    socket.on('sfu:connect-transport', async (payload = {}, callback) => {
      try {
        const { transportId, dtlsParameters } = payload;
        if (!transportId || !dtlsParameters) {
          throw new Error('transportId and dtlsParameters are required');
        }
        const room = requireJoined();
        const result = await room.connectTransport(transportId, dtlsParameters);
        respond(callback, result);
      } catch (err) {
        console.error('[SFU Signaling] sfu:connect-transport error:', err.message);
        fail(callback, err);
      }
    });

    // 5. Produce Track
    socket.on('sfu:produce', async (payload = {}, callback) => {
      try {
        const { transportId, kind, rtpParameters, appData = {} } = payload;
        if (!transportId || !kind || !rtpParameters) {
          throw new Error('transportId, kind, and rtpParameters are required');
        }
        const room = requireJoined();
        const producerData = await room.produce(transportId, {
          kind,
          rtpParameters,
          appData: { ...appData, ...state.metadata }
        });
        respond(callback, producerData);
      } catch (err) {
        console.error('[SFU Signaling] sfu:produce error:', err.message);
        fail(callback, err);
      }
    });

    // 6. Consume Track
    socket.on('sfu:consume', async (payload = {}, callback) => {
      try {
        const { transportId, producerId, rtpCapabilities, appData = {} } = payload;
        if (!transportId || !producerId || !rtpCapabilities) {
          throw new Error('transportId, producerId, and rtpCapabilities are required');
        }
        const room = requireJoined();
        const consumerData = await room.consume(transportId, {
          producerId,
          rtpCapabilities,
          appData: { ...appData, ...state.metadata }
        });
        respond(callback, consumerData);
      } catch (err) {
        console.error('[SFU Signaling] sfu:consume error:', err.message);
        fail(callback, err);
      }
    });

    // 7. Resume / Pause Consumer
    socket.on('sfu:resume-consumer', async (payload = {}, callback) => {
      try {
        const { consumerId } = payload;
        if (!consumerId) throw new Error('consumerId is required');
        const room = requireJoined();
        respond(callback, await room.resumeConsumer(consumerId));
      } catch (err) {
        fail(callback, err);
      }
    });

    socket.on('sfu:pause-consumer', async (payload = {}, callback) => {
      try {
        const { consumerId } = payload;
        if (!consumerId) throw new Error('consumerId is required');
        const room = requireJoined();
        respond(callback, await room.pauseConsumer(consumerId));
      } catch (err) {
        fail(callback, err);
      }
    });

    // 8. Set Preferred Layers (Simulcast 360p / 720p / 1080p)
    socket.on('sfu:set-layers', async (payload = {}, callback) => {
      try {
        const { consumerId, spatialLayer, temporalLayer = 2 } = payload;
        if (!consumerId || spatialLayer === undefined) {
          throw new Error('consumerId and spatialLayer are required');
        }
        const room = requireJoined();
        respond(callback, await room.setConsumerPreferredLayers(consumerId, spatialLayer, temporalLayer));
      } catch (err) {
        fail(callback, err);
      }
    });

    // 9. Pause / Resume Producer (mute without renegotiation)
    socket.on('sfu:pause-producer', async (payload = {}, callback) => {
      try {
        const { producerId } = payload;
        if (!producerId) throw new Error('producerId is required');
        const room = requireJoined();
        respond(callback, await room.pauseProducer(producerId));
      } catch (err) {
        fail(callback, err);
      }
    });

    socket.on('sfu:resume-producer', async (payload = {}, callback) => {
      try {
        const { producerId } = payload;
        if (!producerId) throw new Error('producerId is required');
        const room = requireJoined();
        respond(callback, await room.resumeProducer(producerId));
      } catch (err) {
        fail(callback, err);
      }
    });

    // 10. Close Producer
    socket.on('sfu:close-producer', (payload = {}, callback) => {
      try {
        const { producerId } = payload;
        if (!producerId) throw new Error('producerId is required');
        const room = requireJoined();
        respond(callback, { closed: room.closeProducer(producerId) });
      } catch (err) {
        fail(callback, err);
      }
    });

    // 11. Room snapshot / telemetry
    socket.on('sfu:get-producers', (payload = {}, callback) => {
      try {
        const room = requireJoined();
        respond(callback, {
          producers: room.getProducers(),
          peers: room.listPeers()
        });
      } catch (err) {
        fail(callback, err);
      }
    });

    socket.on('sfu:get-stats', async (payload = {}, callback) => {
      try {
        const room = requireJoined();
        respond(callback, room.getStats());
      } catch (err) {
        fail(callback, err);
      }
    });

    socket.on('sfu:ping', (payload = {}, callback) => {
      respond(callback, { pong: true, timestamp: Date.now() });
    });

    // 12. Peer Disconnection
    socket.on('disconnect', () => {
      try {
        if (state.meetingId && state.peerId) {
          leaveCurrentRoom();
        }
      } catch (err) {
        console.warn('[SFU Signaling] disconnect cleanup warning:', err.message);
      }
      console.log(`[SFU Signaling] Peer socket disconnected: ${socket.id}`);
    });
  });
}

module.exports = setupSfuSocket;
