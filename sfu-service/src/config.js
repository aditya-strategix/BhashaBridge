const os = require('os');

module.exports = {
  // Service configuration
  service: {
    name: 'bhashabridge-sfu-service',
    version: '2.0.0',
    port: parseInt(process.env.SFU_PORT || '5002', 10),
    host: process.env.SFU_HOST || '0.0.0.0',
    corsOrigins: (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim())
  },

  // Mediasoup SFU Core Configuration (Pillar 1)
  mediasoup: {
    // Number of worker processes (defaults to available CPU cores or 2)
    numWorkers: parseInt(process.env.SFU_NUM_WORKERS || `${Math.max(2, os.cpus().length)}`, 10),
    
    // Worker settings
    workerSettings: {
      logLevel: process.env.SFU_LOG_LEVEL || 'warn',
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
      rtcMinPort: parseInt(process.env.RTC_MIN_PORT || '40000', 10),
      rtcMaxPort: parseInt(process.env.RTC_MAX_PORT || '40100', 10)
    },

    // Router media codecs (Standard WebRTC negotiation)
    router: {
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
          parameters: {
            useinbandfec: 1,
            minptime: 10
          }
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: {
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/VP9',
          clockRate: 90000,
          parameters: {
            'profile-id': 2,
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/H264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
            'level-asymmetry-allowed': 1,
            'x-google-start-bitrate': 1000
          }
        }
      ]
    },

    // WebRTC Transport options
    webRtcTransport: {
      listenIps: [
        {
          ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
          announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1'
        }
      ],
      initialAvailableOutgoingBitrate: 1000000, // 1 Mbps
      minimumAvailableOutgoingBitrate: 300000,  // 300 kbps for rural edge
      maxSctpMessageSize: 262144,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true
    },

    // Simulcast settings (3 spatial resolution layers)
    simulcast: {
      encodings: [
        { rid: 'r0', maxBitrate: 150000, scaleResolutionDownBy: 4.0 }, // 360p Low
        { rid: 'r1', maxBitrate: 500000, scaleResolutionDownBy: 2.0 }, // 720p Mid
        { rid: 'r2', maxBitrate: 1500000, scaleResolutionDownBy: 1.0 } // 1080p High
      ]
    }
  },

  // Audio Tap & AI Ingress Configuration (Pillar 3 & Pillar 5)
  audioTap: {
    enabled: true,
    aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:5001',
    sampleRate: 48000,
    channels: 2,
    chunkDurationMs: 500, // 500ms audio chunks
    format: 'opus',       // 'opus' or 'pcm'
    forwardToAiService: true
  }
};
