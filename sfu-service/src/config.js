const os = require('os');

// Pick a routable LAN address unless the deployment explicitly announces one.
// 127.0.0.1 ICE candidates make every remote browser fail to connect.
function detectAnnouncedIp() {
  if (process.env.MEDIASOUP_ANNOUNCED_IP) return process.env.MEDIASOUP_ANNOUNCED_IP;
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

module.exports = {
  // Service configuration
  service: {
    name: 'bhashabridge-sfu-service',
    version: '2.0.0',
    port: parseInt(process.env.SFU_PORT || process.env.PORT || '5002', 10),
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
          announcedIp: detectAnnouncedIp()
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

  // ICE servers handed to browsers for WebRTC negotiation.
  iceServers: (process.env.SFU_ICE_SERVERS || 'stun:stun.l.google.com:19302')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
    .map((urls) => ({ urls })),

  // Audio Tap & AI Ingress Configuration (Pillar 3 & Pillar 5)
  audioTap: {
    // Opt-in: the browser already provides live STT, and an always-on server
    // tap duplicates captions and can feed TTS audio back into itself.
    enabled: process.env.SFU_AUDIO_TAP_ENABLED === 'true',
    aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:5001',
    sampleRate: 48000,
    channels: 2,
    chunkDurationMs: parseInt(process.env.SFU_AUDIO_TAP_CHUNK_MS || '500', 10),
    format: 'wav',        // decoded PCM/WAV (Opus RTP is decoded by the tap)
    forwardToAiService: true,
    // Whisper inference can take several seconds; the old 3s budget always
    // aborted before a transcript came back.
    aiRequestTimeoutMs: parseInt(process.env.SFU_AUDIO_TAP_TIMEOUT_MS || '20000', 10)
  }
};
