const roomManager = require('../sfu/room-manager');

/**
 * Socket.IO Real-Time WebRTC Signaling Gateway
 * Handles sub-millisecond bidirectional signaling for transport creation,
 * ICE/DTLS negotiation, and multi-party track distribution.
 */
function setupSfuSocket(io) {
  const sfuNamespace = io.of('/sfu');

  sfuNamespace.on('connection', (socket) => {
    let currentMeetingId = null;
    let currentPeerId = null;

    console.log(`[SFU Signaling] Peer socket connected: ${socket.id}`);

    // 1. Join Room & Exchange Capabilities
    socket.on('sfu:join-room', async ({ meetingId, peerId }, callback) => {
      try {
        currentMeetingId = meetingId;
        currentPeerId = peerId || socket.id;

        socket.join(meetingId);
        const room = await roomManager.getOrCreateRoom(meetingId);

        // Notify other peers when new producer arrives
        const onNewProducer = ({ producerId, peerId, kind, appData }) => {
          socket.to(meetingId).emit('sfu:new-producer', { producerId, peerId, kind, appData });
        };
        const onProducerClosed = ({ producerId, peerId, kind }) => {
          socket.to(meetingId).emit('sfu:producer-closed', { producerId, peerId, kind });
        };

        room.on('new-producer', onNewProducer);
        room.on('producer-closed', onProducerClosed);

        socket.on('disconnect', () => {
          room.off('new-producer', onNewProducer);
          room.off('producer-closed', onProducerClosed);
        });

        const rtpCapabilities = room.getRtpCapabilities();
        const existingProducers = Array.from(room.producers.values())
          .filter(p => p.appData.peerId !== currentPeerId)
          .map(p => ({
            producerId: p.id,
            peerId: p.appData.peerId,
            kind: p.kind,
            appData: p.appData
          }));

        if (typeof callback === 'function') {
          callback({
            rtpCapabilities,
            existingProducers
          });
        }
      } catch (err) {
        console.error('[SFU Signaling] sfu:join-room error:', err.message);
        if (typeof callback === 'function') callback({ error: err.message });
      }
    });

    // 2. Create WebRTC Transport
    socket.on('sfu:create-transport', async ({ meetingId, direction = 'send', options = {} }, callback) => {
      try {
        const room = await roomManager.getOrCreateRoom(meetingId);
        const transportData = await room.createWebRtcTransport(currentPeerId, direction, options);
        if (typeof callback === 'function') callback(transportData);
      } catch (err) {
        console.error('[SFU Signaling] sfu:create-transport error:', err.message);
        if (typeof callback === 'function') callback({ error: err.message });
      }
    });

    // 3. Connect WebRTC Transport
    socket.on('sfu:connect-transport', async ({ meetingId, transportId, dtlsParameters }, callback) => {
      try {
        const room = roomManager.getRoom(meetingId);
        if (!room) throw new Error(`Room ${meetingId} not found`);

        const result = await room.connectTransport(transportId, dtlsParameters);
        if (typeof callback === 'function') callback(result);
      } catch (err) {
        console.error('[SFU Signaling] sfu:connect-transport error:', err.message);
        if (typeof callback === 'function') callback({ error: err.message });
      }
    });

    // 4. Produce Track
    socket.on('sfu:produce', async ({ meetingId, transportId, kind, rtpParameters, appData = {} }, callback) => {
      try {
        const room = roomManager.getRoom(meetingId);
        if (!room) throw new Error(`Room ${meetingId} not found`);

        const producerData = await room.produce(transportId, { kind, rtpParameters, appData });
        if (typeof callback === 'function') callback(producerData);
      } catch (err) {
        console.error('[SFU Signaling] sfu:produce error:', err.message);
        if (typeof callback === 'function') callback({ error: err.message });
      }
    });

    // 5. Consume Track
    socket.on('sfu:consume', async ({ meetingId, transportId, producerId, rtpCapabilities, appData = {} }, callback) => {
      try {
        const room = roomManager.getRoom(meetingId);
        if (!room) throw new Error(`Room ${meetingId} not found`);

        const consumerData = await room.consume(transportId, { producerId, rtpCapabilities, appData });
        if (typeof callback === 'function') callback(consumerData);
      } catch (err) {
        console.error('[SFU Signaling] sfu:consume error:', err.message);
        if (typeof callback === 'function') callback({ error: err.message });
      }
    });

    // 6. Resume Consumer
    socket.on('sfu:resume-consumer', async ({ meetingId, consumerId }, callback) => {
      try {
        const room = roomManager.getRoom(meetingId);
        if (!room) throw new Error(`Room ${meetingId} not found`);

        const result = await room.resumeConsumer(consumerId);
        if (typeof callback === 'function') callback(result);
      } catch (err) {
        if (typeof callback === 'function') callback({ error: err.message });
      }
    });

    // 7. Pause Consumer
    socket.on('sfu:pause-consumer', async ({ meetingId, consumerId }, callback) => {
      try {
        const room = roomManager.getRoom(meetingId);
        if (!room) throw new Error(`Room ${meetingId} not found`);

        const result = await room.pauseConsumer(consumerId);
        if (typeof callback === 'function') callback(result);
      } catch (err) {
        if (typeof callback === 'function') callback({ error: err.message });
      }
    });

    // 8. Set Preferred Layers (Simulcast 360p / 720p / 1080p)
    socket.on('sfu:set-layers', async ({ meetingId, consumerId, spatialLayer, temporalLayer }, callback) => {
      try {
        const room = roomManager.getRoom(meetingId);
        if (!room) throw new Error(`Room ${meetingId} not found`);

        const result = await room.setConsumerPreferredLayers(consumerId, spatialLayer, temporalLayer);
        if (typeof callback === 'function') callback(result);
      } catch (err) {
        if (typeof callback === 'function') callback({ error: err.message });
      }
    });

    // 9. Peer Disconnection
    socket.on('disconnect', () => {
      if (currentMeetingId && currentPeerId) {
        const room = roomManager.getRoom(currentMeetingId);
        if (room) {
          room.removePeer(currentPeerId);
          socket.to(currentMeetingId).emit('sfu:peer-left', { peerId: currentPeerId });
        }
      }
      console.log(`[SFU Signaling] Peer socket disconnected: ${socket.id}`);
    });
  });
}

module.exports = setupSfuSocket;
