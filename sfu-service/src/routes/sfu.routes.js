const express = require('express');
const router = express.Router();
const roomManager = require('../sfu/room-manager');

// 1. Get Room RTP Capabilities
router.get('/capabilities/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const room = await roomManager.getOrCreateRoom(meetingId);
    res.status(200).json(room.getRtpCapabilities());
  } catch (err) {
    console.error('[SFU Route] /capabilities error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Create / Ensure Room Router
router.post('/rooms', async (req, res) => {
  try {
    const { meetingId } = req.body || {};
    if (!meetingId) return res.status(400).json({ error: 'meetingId is required' });

    const room = await roomManager.getOrCreateRoom(meetingId);
    res.status(200).json({
      meetingId,
      rtpCapabilities: room.getRtpCapabilities(),
      stats: room.getStats()
    });
  } catch (err) {
    console.error('[SFU Route] /rooms error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Create WebRTC Transport
router.post('/transports', async (req, res) => {
  try {
    const { meetingId, peerId, direction = 'send', options = {} } = req.body || {};
    if (!meetingId || !peerId) {
      return res.status(400).json({ error: 'meetingId and peerId are required' });
    }

    const room = await roomManager.getOrCreateRoom(meetingId);
    const transportData = await room.createWebRtcTransport(peerId, direction, options);

    res.status(200).json(transportData);
  } catch (err) {
    console.error('[SFU Route] /transports error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Connect WebRTC Transport
router.post('/transports/:id/connect', async (req, res) => {
  try {
    const { id: transportId } = req.params;
    const { meetingId, dtlsParameters } = req.body || {};
    if (!meetingId || !dtlsParameters) {
      return res.status(400).json({ error: 'meetingId and dtlsParameters are required' });
    }

    const room = roomManager.getRoom(meetingId);
    if (!room) return res.status(404).json({ error: `Room ${meetingId} not found` });

    const result = await room.connectTransport(transportId, dtlsParameters);
    res.status(200).json(result);
  } catch (err) {
    console.error('[SFU Route] /transports/:id/connect error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Produce Track (Audio / Video / Screen)
router.post('/transports/:id/produce', async (req, res) => {
  try {
    const { id: transportId } = req.params;
    const { meetingId, kind, rtpParameters, appData } = req.body || {};
    if (!meetingId || !kind || !rtpParameters) {
      return res.status(400).json({ error: 'meetingId, kind, and rtpParameters are required' });
    }

    const room = roomManager.getRoom(meetingId);
    if (!room) return res.status(404).json({ error: `Room ${meetingId} not found` });

    const producerData = await room.produce(transportId, { kind, rtpParameters, appData });
    res.status(200).json(producerData);
  } catch (err) {
    console.error('[SFU Route] /transports/:id/produce error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Consume Track
router.post('/transports/:id/consume', async (req, res) => {
  try {
    const { id: transportId } = req.params;
    const { meetingId, producerId, rtpCapabilities, appData } = req.body || {};
    if (!meetingId || !producerId || !rtpCapabilities) {
      return res.status(400).json({ error: 'meetingId, producerId, and rtpCapabilities are required' });
    }

    const room = roomManager.getRoom(meetingId);
    if (!room) return res.status(404).json({ error: `Room ${meetingId} not found` });

    const consumerData = await room.consume(transportId, { producerId, rtpCapabilities, appData });
    res.status(200).json(consumerData);
  } catch (err) {
    console.error('[SFU Route] /transports/:id/consume error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Pause / Resume Consumer
router.post('/consumers/:id/pause', async (req, res) => {
  try {
    const { id: consumerId } = req.params;
    const { meetingId } = req.body || {};
    const room = roomManager.getRoom(meetingId);
    if (!room) return res.status(404).json({ error: `Room ${meetingId} not found` });

    const result = await room.pauseConsumer(consumerId);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/consumers/:id/resume', async (req, res) => {
  try {
    const { id: consumerId } = req.params;
    const { meetingId } = req.body || {};
    const room = roomManager.getRoom(meetingId);
    if (!room) return res.status(404).json({ error: `Room ${meetingId} not found` });

    const result = await room.resumeConsumer(consumerId);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Set Preferred Simulcast Layer (Adaptive Bitrate)
router.post('/consumers/:id/layers', async (req, res) => {
  try {
    const { id: consumerId } = req.params;
    const { meetingId, spatialLayer, temporalLayer } = req.body || {};
    const room = roomManager.getRoom(meetingId);
    if (!room) return res.status(404).json({ error: `Room ${meetingId} not found` });

    const result = await room.setConsumerPreferredLayers(consumerId, spatialLayer, temporalLayer);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Attach Server-Side Audio Tap (Pillar 5)
router.post('/audio-tap', async (req, res) => {
  try {
    const { meetingId, producerId, participantId, options } = req.body || {};
    if (!meetingId || !producerId || !participantId) {
      return res.status(400).json({ error: 'meetingId, producerId, and participantId are required' });
    }

    const room = roomManager.getRoom(meetingId);
    if (!room) return res.status(404).json({ error: `Room ${meetingId} not found` });

    const audioTap = room.createAudioTap(producerId, participantId, options);
    res.status(200).json(audioTap.getStats());
  } catch (err) {
    console.error('[SFU Route] /audio-tap error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 10. Close Room
router.delete('/rooms/:meetingId', (req, res) => {
  const { meetingId } = req.params;
  const closed = roomManager.closeRoom(meetingId);
  res.status(200).json({ meetingId, closed });
});

// 11. SFU Telemetry & Stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await roomManager.getGlobalStats();
    res.status(200).json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
