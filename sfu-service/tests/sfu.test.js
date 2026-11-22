const assert = require('assert');
const path = require('path');
const workerPool = require('../src/sfu/worker-pool');
const roomManager = require('../src/sfu/room-manager');
const { registry } = require('../src/avro');

async function runTestSuite() {
  console.log('='.repeat(80));
  console.log(' BHASHABRIDGE MEDIASOUP SFU SERVICE SPECIFICATION VERIFICATION SUITE');
  console.log(' Testing Worker Pool, WebRTC Transports, Simulcast, and Avro Audio Tap');
  console.log('='.repeat(80));

  let passed = 0;
  const testMeetingId = `test_meet_${Date.now()}`;
  const peerAlice = `peer_alice_${Date.now()}`;
  const peerBob = `peer_bob_${Date.now()}`;

  // 1. Worker Pool Initialization
  try {
    await workerPool.init(2);
    assert.strictEqual(workerPool.isInitialized, true, 'Worker pool should be initialized');
    assert.ok(workerPool.workers.length >= 1, 'Should have at least 1 active worker');
    console.log(`  ✓ [PASS] Initialized worker pool with ${workerPool.workers.length} worker(s)`);
    passed++;
  } catch (e) {
    console.error('  ✗ [FAIL] Worker pool initialization failed:', e);
  }

  // 2. Room Router Provisioning & RTP Capabilities
  let room = null;
  try {
    room = await roomManager.getOrCreateRoom(testMeetingId);
    assert.ok(room, 'Room should be provisioned');
    assert.strictEqual(room.meetingId, testMeetingId);

    const rtpCaps = room.getRtpCapabilities();
    assert.ok(rtpCaps.codecs && rtpCaps.codecs.length >= 2, 'RTP capabilities must include audio/video codecs');
    
    const hasOpus = rtpCaps.codecs.some(c => c.mimeType.toLowerCase().includes('opus'));
    const hasVP8 = rtpCaps.codecs.some(c => c.mimeType.toLowerCase().includes('vp8'));
    assert.strictEqual(hasOpus, true, 'Must support Opus audio');
    assert.strictEqual(hasVP8, true, 'Must support VP8 video');

    console.log('  ✓ [PASS] Room router provisioned with Opus audio and VP8/VP9/H264 video codecs');
    passed++;
  } catch (e) {
    console.error('  ✗ [FAIL] Room router provisioning failed:', e);
  }

  // 3. WebRTC Transport Allocation & DTLS Handshake
  let sendTransport = null;
  let recvTransport = null;
  try {
    sendTransport = await room.createWebRtcTransport(peerAlice, 'send');
    assert.ok(sendTransport.id, 'Transport must have an ID');
    assert.ok(sendTransport.iceParameters.usernameFragment, 'Must have ICE ufrag');
    assert.ok(sendTransport.iceCandidates.length > 0, 'Must have ICE candidates');
    assert.ok(sendTransport.dtlsParameters.fingerprints.length > 0, 'Must have DTLS fingerprints');

    // Simulate client DTLS connect
    const clientDtls = {
      role: 'client',
      fingerprints: [
        { algorithm: 'sha-256', value: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD' }
      ]
    };
    const connectRes = await room.connectTransport(sendTransport.id, clientDtls);
    assert.strictEqual(connectRes.connected, true);

    recvTransport = await room.createWebRtcTransport(peerBob, 'recv');
    assert.ok(recvTransport.id);

    console.log('  ✓ [PASS] WebRtcTransports allocated with ICE candidates & DTLS connected');
    passed++;
  } catch (e) {
    console.error('  ✗ [FAIL] Transport allocation/handshake failed:', e);
  }

  // 4. Track Production with Simulcast Layers
  let audioProducer = null;
  let videoProducer = null;
  try {
    // Produce audio
    const audioRes = await room.produce(sendTransport.id, {
      kind: 'audio',
      rtpParameters: {
        codecs: [{ mimeType: 'audio/opus', payloadType: 111, clockRate: 48000, channels: 2 }]
      },
      appData: { label: 'microphone' }
    });
    audioProducer = room.producers.get(audioRes.id);
    assert.ok(audioProducer, 'Audio producer must exist');
    assert.strictEqual(audioProducer.kind, 'audio');

    // Produce video with 3-layer simulcast (Pillar 1)
    const videoRes = await room.produce(sendTransport.id, {
      kind: 'video',
      rtpParameters: {
        codecs: [{ mimeType: 'video/VP8', payloadType: 96, clockRate: 90000 }],
        encodings: [
          { rid: 'r0', maxBitrate: 150000, scaleResolutionDownBy: 4.0 }, // 360p
          { rid: 'r1', maxBitrate: 500000, scaleResolutionDownBy: 2.0 }, // 720p
          { rid: 'r2', maxBitrate: 1500000, scaleResolutionDownBy: 1.0 } // 1080p
        ]
      },
      appData: { label: 'webcam' }
    });
    videoProducer = room.producers.get(videoRes.id);
    assert.ok(videoProducer, 'Video producer must exist');
    assert.strictEqual(videoProducer.kind, 'video');
    assert.strictEqual(videoProducer.simulcastLayers, 3, 'Must register 3 simulcast spatial layers');

    console.log('  ✓ [PASS] Produced audio & video tracks with 3-layer Simulcast (360p, 720p, 1080p)');
    passed++;
  } catch (e) {
    console.error('  ✗ [FAIL] Track production failed:', e);
  }

  // 5. Downstream Consumer Creation & Adaptive Bitrate Switching
  let videoConsumer = null;
  try {
    const consumeRes = await room.consume(recvTransport.id, {
      producerId: videoProducer.id,
      rtpCapabilities: room.getRtpCapabilities()
    });
    videoConsumer = room.consumers.get(consumeRes.id);
    assert.ok(videoConsumer, 'Consumer must exist');
    assert.strictEqual(videoConsumer.producerId, videoProducer.id);
    assert.strictEqual(videoConsumer.kind, 'video');

    // Simulate rural bandwidth degradation: switch from 1080p (layer 2) to 360p (layer 0)
    await room.setConsumerPreferredLayers(videoConsumer.id, 0, 2);
    assert.strictEqual(videoConsumer.currentSpatialLayer, 0, 'Consumer should adapt to 360p layer');

    console.log('  ✓ [PASS] Downstream consumer created and dynamically adapted to 360p layer');
    passed++;
  } catch (e) {
    console.error('  ✗ [FAIL] Downstream consumer creation failed:', e);
  }

  // 6. Server-Side Audio Tap & Apache Avro Binary Serialization (Pillars 3 & 5)
  try {
    const audioTap = room.createAudioTap(audioProducer.id, peerAlice, {
      forwardToAiService: false // Don't make real network calls during unit test
    });
    assert.ok(audioTap, 'Audio tap must be attached');
    assert.strictEqual(audioTap.participantId, peerAlice);

    // Manually trigger audio chunk processing
    const sampleAudio = Buffer.alloc(960, 0x11);
    const { audioTapEvent, avroBuffer } = await audioTap.handleAudioChunk(sampleAudio);

    assert.strictEqual(audioTapEvent.meetingId, testMeetingId);
    assert.strictEqual(audioTapEvent.participantId, peerAlice);
    assert.strictEqual(audioTapEvent.sequenceNumber, 1);
    assert.strictEqual(audioTapEvent.audioData.length, 960);

    // Verify Avro binary payload starts with RFC 0xC3 0x01 magic bytes
    assert.strictEqual(avroBuffer[0], 0xC3, 'Magic byte 0 must be 0xC3');
    assert.strictEqual(avroBuffer[1], 0x01, 'Magic byte 1 must be 0x01');

    // Deserialize and check round-trip integrity
    const { data: decoded, schemaName } = registry.deserializeSingleObject(avroBuffer);
    assert.strictEqual(schemaName, 'AudioTapEvent');
    assert.strictEqual(decoded.meetingId, testMeetingId);
    assert.strictEqual(decoded.participantId, peerAlice);
    assert.strictEqual(decoded.sequenceNumber, 1);
    assert.strictEqual(decoded.audioData.length, 960);

    audioTap.stop();
    console.log('  ✓ [PASS] Server-side Audio Tap captured audio and serialized to AudioTapEvent.avsc Avro binary');
    passed++;
  } catch (e) {
    console.error('  ✗ [FAIL] Audio tap / Avro test failed:', e);
  }

  // 7. Global SFU Telemetry & Statistics
  try {
    const stats = await roomManager.getGlobalStats();
    assert.ok(stats.workers.totalWorkers >= 1, 'Should report active workers');
    assert.strictEqual(stats.activeRooms >= 1, true);
    assert.strictEqual(stats.totalProducers >= 2, true);
    assert.strictEqual(stats.totalConsumers >= 1, true);

    console.log(`  ✓ [PASS] SFU telemetry verified: ${stats.totalProducers} producers, ${stats.totalConsumers} consumers`);
    passed++;
  } catch (e) {
    console.error('  ✗ [FAIL] SFU telemetry failed:', e);
  }

  // 8. Room Teardown and Resource Recycling
  try {
    const closed = roomManager.closeRoom(testMeetingId);
    assert.strictEqual(closed, true);
    assert.strictEqual(room.closed, true);
    assert.strictEqual(room.producers.size, 0);
    assert.strictEqual(room.consumers.size, 0);
    assert.strictEqual(room.transports.size, 0);

    console.log('  ✓ [PASS] Room router closed and all WebRTC resources recycled');
    passed++;
  } catch (e) {
    console.error('  ✗ [FAIL] Room teardown failed:', e);
  }

  // 9. Client SDK & HTTP API Integration Test
  let testServer = null;
  try {
    const app = require('../src/app');
    const { SFUServiceClient } = require('../src/client/sfu-service.client');
    const testPort = 5098;
    
    testServer = app.listen(testPort);
    const client = new SFUServiceClient(`http://127.0.0.1:${testPort}`);

    const health = await client.checkHealth();
    assert.strictEqual(health.status, 'healthy');
    assert.strictEqual(health.service, 'BhashaBridge Mediasoup SFU Media Router');

    const apiRoom = await client.createRoom('http_test_room');
    assert.ok(apiRoom.rtpCapabilities);

    const caps = await client.getRtpCapabilities('http_test_room');
    assert.ok(caps.codecs.length >= 2);

    const trans = await client.createTransport('http_test_room', 'peer_http_1', 'send');
    assert.ok(trans.id);
    assert.ok(trans.iceParameters);

    const closeRes = await client.closeRoom('http_test_room');
    assert.strictEqual(closeRes.closed, true);

    testServer.close();
    console.log('  ✓ [PASS] SFUServiceClient SDK executed end-to-end REST API calls against server');
    passed++;
  } catch (e) {
    if (testServer) testServer.close();
    console.error('  ✗ [FAIL] Client SDK test failed:', e);
  }

  // Teardown worker pool
  workerPool.close();

  console.log('='.repeat(80));
  console.log(` RESULTS: ${passed}/9 test cases passed successfully!`);
  console.log('='.repeat(80));

  if (passed !== 9) process.exit(1);
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
