const express = require('express');
const cors = require('cors');
const sfuRoutes = require('./routes/sfu.routes');
const roomManager = require('./sfu/room-manager');
const workerPool = require('./sfu/worker-pool');
const { isNative } = require('./sfu/mediasoup-core');
const config = require('./config');

const app = express();

const corsOrigin = config.service.corsOrigins.includes('*')
  ? true
  : config.service.corsOrigins;

app.use(cors({
  origin: corsOrigin,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Health and Telemetry Check
app.get('/health', async (req, res) => {
  const workerStats = await workerPool.getStats().catch(() => ({ totalWorkers: 0, workers: [] }));
  
  res.status(200).json({
    status: 'healthy',
    service: 'BhashaBridge Mediasoup SFU Media Router',
    version: config.service.version,
    timestamp: new Date().toISOString(),
    mediasoup: {
      isNative,
      activeWorkers: workerStats.totalWorkers,
      workerPoolInitialized: workerPool.isInitialized,
      rtcPortRange: `${config.mediasoup.workerSettings.rtcMinPort}-${config.mediasoup.workerSettings.rtcMaxPort}`
    },
    rooms: {
      activeRooms: roomManager.rooms.size,
      roomList: roomManager.listRooms()
    },
    audioTap: {
      enabled: config.audioTap.enabled,
      aiServiceUrl: config.audioTap.aiServiceUrl,
      avroContract: 'AudioTapEvent.avsc'
    }
  });
});

// SFU REST API Routes
app.use('/api/v1/sfu', sfuRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[SFU Service Error]', err.stack);
  res.status(500).json({ error: err.message || 'Internal SFU Service Error' });
});

module.exports = app;
