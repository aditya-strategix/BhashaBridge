const http = require('http');
const dotenv = require('dotenv');
const path = require('path');

// Load environment configuration
dotenv.config({ path: path.join(__dirname, '../.env') });
if (!process.env.SFU_PORT) {
  dotenv.config({ path: path.join(__dirname, '../../backend/.env') });
}

const app = require('./app');
const config = require('./config');
const workerPool = require('./sfu/worker-pool');
const roomManager = require('./sfu/room-manager');
const setupSfuSocket = require('./signaling/socket.handler');

const server = http.createServer(app);

// Socket.IO for real-time WebRTC signaling
let io = null;
try {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: {
      origin: config.service.corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });
  setupSfuSocket(io);
  console.log('[SFU Server] Socket.IO WebRTC signaling namespace initialized on /sfu');
} catch (e) {
  console.warn('[SFU Server] Socket.IO initialization skipped:', e.message);
}

const PORT = config.service.port || 5002;
const HOST = config.service.host || '0.0.0.0';

async function startServer() {
  try {
    // 1. Initialize Mediasoup Worker Pool
    await workerPool.init();

    // 2. Start HTTP & Signaling Server
    server.listen(PORT, HOST, () => {
      console.log('='.repeat(72));
      console.log(' BHASHABRIDGE MEDIASOUP SFU MEDIA ROUTER (DECOUPLED CARRIER-GRADE)');
      console.log(` Running on: http://${HOST}:${PORT}`);
      console.log(` Signaling Namespace: /sfu`);
      console.log(` RTC Port Range: ${config.mediasoup.workerSettings.rtcMinPort}-${config.mediasoup.workerSettings.rtcMaxPort}/udp`);
      console.log(` Pillar 1: O(1) Ingress Uplink, Simulcast (1080p, 720p, 360p)`);
      console.log(` Pillar 5: Server-Side Audio Tap -> Apache Avro (AudioTapEvent.avsc)`);
      console.log(` AI Service Ingress Target: ${config.audioTap.aiServiceUrl}`);
      console.log('='.repeat(72));
    });
  } catch (err) {
    console.error('[SFU Server] Fatal error during startup:', err);
    process.exit(1);
  }
}

// Graceful Shutdown
function gracefulShutdown(signal) {
  console.log(`\n[SFU Server] Received ${signal}. Gracefully stopping SFU media routers...`);
  roomManager.closeAll();
  workerPool.close();
  server.close(() => {
    console.log('[SFU Server] HTTP server terminated. Exit complete.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (require.main === module) {
  startServer();
}

module.exports = { app, server, io };
