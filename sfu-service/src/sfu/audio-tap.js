const EventEmitter = require('events');
const dgram = require('dgram');
const OpusScript = require('opusscript');
const { registry } = require('../avro');
const config = require('../config');
const { isNative } = require('./mediasoup-core');

/**
 * Wrap 16-bit little-endian PCM samples in a RIFF/WAVE container so the AI
 * service's faster-whisper (PyAV/ffmpeg) can decode them. Raw Opus RTP
 * payloads are not a valid audio file and were silently producing empty
 * transcripts before.
 */
function pcmToWav(pcmBuffer, sampleRate, channels) {
  const bitsPerSample = 16;
  const blockAlign = channels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);            // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Server-Side Audio Tap Engine (Pillar 5 / Tier 1 Smartphone Access)
 *
 * Taps directly into WebRTC audio streams in the SFU and forwards them to the
 * AI service for server-side STT.
 *
 * Two engines are supported:
 *  - Native Mediasoup: a PlainTransport + UDP socket receives the real RTP
 *    stream of the producer. Opus payloads are extracted from RTP packets and
 *    buffered into 500ms chunks.
 *  - Virtual Mediasoup fallback: synthetic frames keep the Avro/AI pipeline
 *    testable when the native C++ core is unavailable.
 */
class AudioTap extends EventEmitter {
  constructor(producer, meetingId, participantId, options = {}, router = null) {
    super();
    this.producer = producer;
    this.meetingId = meetingId;
    this.participantId = participantId;
    this.router = router;
    this.options = { ...config.audioTap, ...options };

    this.id = `tap_${producer.id}_${Date.now()}`;
    this.sequenceNumber = 0;
    this.isActive = false;
    this.intervalTimer = null;
    this.bytesStreamed = 0;
    this.framesCaptured = 0;
    this.engine = 'virtual';

    // Native RTP tap state
    this.udpSocket = null;
    this.plainTransport = null;
    this.tapConsumer = null;
    this.rtpBuffer = [];
    this.rtpBufferBytes = 0;
    this.lastRtpAt = 0;
    this.rtpFlushTimer = null;

    // Native RTP packets carry raw Opus payloads; decode them to PCM (WAV)
    // before forwarding, otherwise STT receives headerless bytes.
    this.opusDecoder = null;
    this.opusChannels = 1;
    this.opusSampleRate = 48000;

    console.log(`[AudioTap] Created audio tap for meeting: ${meetingId}, participant: ${participantId}`);
  }

  /**
   * Start digital audio tap streaming.
   */
  start() {
    if (this.isActive) return;
    this.isActive = true;

    const canUseNative =
      isNative &&
      this.router &&
      typeof this.router.createPlainTransport === 'function' &&
      !this.options.forceSimulated;

    if (canUseNative) {
      this.engine = 'native-rtp';
      this.startNativeRtpTap().catch((err) => {
        console.warn(`[AudioTap] Native RTP tap failed (${err.message}); using virtual frames.`);
        this.cleanupNativeTap();
        this.engine = 'virtual';
        this.startVirtualTap();
      });
    } else {
      this.startVirtualTap();
    }

    this.emit('started', { tapId: this.id, engine: this.engine });
  }

  /**
   * Native Mediasoup tap: consume the producer on a PlainTransport and read
   * raw RTP packets from a local UDP socket.
   */
  async startNativeRtpTap() {
    this.udpSocket = dgram.createSocket('udp4');
    await new Promise((resolve, reject) => {
      const onError = (err) => {
        this.udpSocket.off('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        this.udpSocket.off('error', onError);
        resolve();
      };
      this.udpSocket.once('error', onError);
      this.udpSocket.once('listening', onListening);
      this.udpSocket.bind(0, '127.0.0.1');
    });

    const port = this.udpSocket.address().port;

    this.plainTransport = await this.router.createPlainTransport({
      listenInfo: {
        protocol: 'udp',
        ip: '127.0.0.1',
        announcedAddress: '127.0.0.1'
      },
      rtcpMux: true,
      comedia: false,
      enableSrtp: false,
      appData: {
        tapId: this.id,
        meetingId: this.meetingId,
        participantId: this.participantId
      }
    });

    await this.plainTransport.connect({ ip: '127.0.0.1', port });

    this.tapConsumer = await this.plainTransport.consume({
      producerId: this.producer.id,
      rtpCapabilities: this.router.rtpCapabilities,
      paused: false,
      appData: { tapId: this.id }
    });

    // WebRTC Opus is normally mono; honour the negotiated codec if present.
    const opusCodec = (this.producer?.rtpParameters?.codecs || []).find(
      (codec) => (codec.mimeType || '').toLowerCase() === 'audio/opus'
    );
    this.opusChannels = opusCodec && opusCodec.channels === 2 ? 2 : 1;
    try {
      this.opusDecoder = new OpusScript(48000, this.opusChannels, OpusScript.Application.AUDIO);
    } catch (err) {
      console.warn(`[AudioTap] Opus decoder init failed: ${err.message}`);
      this.opusDecoder = null;
    }

    this.udpSocket.on('message', (packet) => this.handleRtpPacket(packet));

    // Flush buffered Opus payloads on a fixed cadence so the AI service gets
    // bounded chunks rather than one HTTP request per 20ms RTP packet.
    const chunkMs = this.options.chunkDurationMs || 500;
    this.rtpFlushTimer = setInterval(() => this.flushRtpBuffer(), chunkMs);

    console.log(`[AudioTap] Native RTP tap attached on UDP 127.0.0.1:${port} for producer ${this.producer.id}`);
  }

  /**
   * Virtual engine fallback: emit deterministic frames so Avro/AI integration
   * can be exercised without a native SFU binary.
   */
  startVirtualTap() {
    const chunkMs = this.options.chunkDurationMs || 500;
    const sampleRate = this.options.sampleRate || 48000;
    const channels = 1;
    const numSamples = Math.floor(sampleRate * (chunkMs / 1000));
    // A valid, silent WAV keeps the Avro/STT pipeline exercised without
    // feeding 0xAA garbage that Whisper cannot decode.
    const silentWav = () => pcmToWav(Buffer.alloc(numSamples * channels * 2), sampleRate, channels);

    this.intervalTimer = setInterval(async () => {
      if (!this.isActive || this.producer.closed || this.producer.paused) return;
      try {
        await this.handleAudioChunk(silentWav());
      } catch (err) {
        console.error('[AudioTap] Error processing virtual chunk:', err.message);
      }
    }, chunkMs);

    console.log(`[AudioTap] Virtual frame tap active for producer ${this.producer.id}`);
  }

  /**
   * Parse an RTP packet and buffer its Opus payload.
   * RFC 3550 header: 12 bytes + CSRC list + optional extension + optional padding.
   */
  handleRtpPacket(packet) {
    if (!this.isActive || packet.length < 12) return;

    const version = packet[0] >> 6;
    if (version !== 2) return;

    // RTCP packets share the UDP port when rtcpMux is enabled. Their packet
    // type lives in the second byte (192-223) and must not be fed to STT.
    if (packet[1] >= 192 && packet[1] <= 223) return;

    const hasPadding = (packet[0] & 0x20) !== 0;
    const hasExtension = (packet[0] & 0x10) !== 0;
    const csrcCount = packet[0] & 0x0f;

    let offset = 12 + csrcCount * 4;
    if (hasExtension) {
      if (packet.length < offset + 4) return;
      const extensionWords = packet.readUInt16BE(offset + 2);
      offset += 4 + extensionWords * 4;
    }

    let end = packet.length;
    if (hasPadding && end > offset) {
      end -= packet[end - 1];
    }
    if (end <= offset) return;

    const payload = packet.subarray(offset, end);
    this.rtpBuffer.push(payload);
    this.rtpBufferBytes += payload.length;
    this.lastRtpAt = Date.now();
  }

  /**
   * Flush buffered RTP payloads into a single Avro AudioTapEvent.
   */
  async flushRtpBuffer() {
    if (!this.isActive || this.rtpBuffer.length === 0) return;

    const packets = this.rtpBuffer;
    this.rtpBuffer = [];
    this.rtpBufferBytes = 0;

    if (!this.opusDecoder) {
      // Without a decoder the payload is headerless Opus, which is useless to
      // STT. Drop it instead of forwarding bytes that can never be decoded.
      return;
    }

    try {
      const pcmChunks = [];
      for (const packet of packets) {
        try {
          const decoded = this.opusDecoder.decode(packet);
          pcmChunks.push(Buffer.from(decoded.buffer, decoded.byteOffset, decoded.byteLength));
        } catch (_) {
          // DTX/FEC/malformed packet: skip it and keep the rest of the chunk.
        }
      }
      if (pcmChunks.length === 0) return;

      const wav = pcmToWav(Buffer.concat(pcmChunks), this.opusSampleRate, this.opusChannels);
      await this.handleAudioChunk(wav);
    } catch (err) {
      console.error('[AudioTap] Error processing RTP chunk:', err.message);
    }
  }

  /**
   * Process a raw audio chunk into the Avro contract.
   */
  async handleAudioChunk(audioBuffer) {
    this.sequenceNumber++;
    this.framesCaptured++;
    this.bytesStreamed += audioBuffer.length;

    const audioTapEvent = {
      meetingId: String(this.meetingId),
      participantId: String(this.participantId),
      sequenceNumber: this.sequenceNumber,
      audioData: audioBuffer,
      sampleRate: this.options.sampleRate || 48000,
      timestamp: Date.now()
    };

    // Raw Avro payload (matches ai-service /audio/tap contract).
    const avroBuffer = registry.serialize('AudioTapEvent', audioTapEvent);

    // Single Object Encoding is kept for internal bus / diagnostics consumers.
    let singleObjectBuffer = null;
    try {
      singleObjectBuffer = registry.serializeSingleObject('AudioTapEvent', audioTapEvent);
    } catch (_) {}

    this.emit('audio-chunk', {
      event: audioTapEvent,
      avroBuffer,
      singleObjectBuffer
    });

    if (this.options.forwardToAiService && this.options.aiServiceUrl) {
      this.forwardToAiService(avroBuffer).catch(() => {
        // AI service may be offline; never break the media pipeline.
      });
    }

    return { audioTapEvent, avroBuffer, singleObjectBuffer };
  }

  /**
   * Dispatch Avro binary payload over HTTP to ai-service /api/v1/ai/audio/tap.
   */
  async forwardToAiService(avroBuffer) {
    try {
      const url = `${this.options.aiServiceUrl.replace(/\/+$/, '')}/api/v1/ai/audio/tap`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/avro',
          'X-Avro-Schema': 'AudioTapEvent'
        },
        body: avroBuffer,
        signal: AbortSignal.timeout(this.options.aiRequestTimeoutMs || 3000)
      });

      if (response.ok) {
        const arrayBuf = await response.arrayBuffer();
        if (arrayBuf.byteLength > 0 && registry.hasSchema('CaptionStreamEvent')) {
          const captionEvent = registry.deserialize('CaptionStreamEvent', Buffer.from(arrayBuf));
          const text = (captionEvent?.transcriptText || '').trim();
          if (text && !text.startsWith('[') && !text.toLowerCase().includes('audio stream') && !text.toLowerCase().includes('stream chunk')) {
            this.emit('transcription', captionEvent);
          }
        }
      }
    } catch (err) {
      // AI service might be processing or offline; fail gracefully.
    }
  }

  /**
   * Tear down native RTP resources.
   */
  cleanupNativeTap() {
    if (this.rtpFlushTimer) {
      clearInterval(this.rtpFlushTimer);
      this.rtpFlushTimer = null;
    }
    if (this.tapConsumer) {
      try { this.tapConsumer.close(); } catch (_) {}
      this.tapConsumer = null;
    }
    if (this.plainTransport) {
      try { this.plainTransport.close(); } catch (_) {}
      this.plainTransport = null;
    }
    if (this.udpSocket) {
      try { this.udpSocket.close(); } catch (_) {}
      this.udpSocket = null;
    }
    if (this.opusDecoder) {
      try { this.opusDecoder.delete(); } catch (_) {}
      this.opusDecoder = null;
    }
    this.rtpBuffer = [];
    this.rtpBufferBytes = 0;
  }

  /**
   * Stop audio tap.
   */
  stop() {
    if (!this.isActive) return;
    this.isActive = false;

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.cleanupNativeTap();

    this.emit('stopped', { tapId: this.id });
  }

  getStats() {
    return {
      tapId: this.id,
      meetingId: this.meetingId,
      participantId: this.participantId,
      producerId: this.producer.id,
      engine: this.engine,
      isActive: this.isActive,
      framesCaptured: this.framesCaptured,
      bytesStreamed: this.bytesStreamed,
      sequenceNumber: this.sequenceNumber,
      lastRtpAt: this.lastRtpAt || null
    };
  }
}

module.exports = AudioTap;
