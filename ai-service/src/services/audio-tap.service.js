const { defaultSTT } = require('../adapters/stt');
const { registry } = require('../avro');

/**
 * AudioTapService
 * Ingests AudioTapEvent (.avsc) Opus/PCM frames tapped from Mediasoup SFU (Pillar 4 / Tier 1 Direct Smartphone Access).
 * Eliminates mobile OS microphone lockouts by transcribing audio in the cloud.
 */
class AudioTapService {
  /**
   * Process raw AudioTapEvent and generate a CaptionStreamEvent
   */
  static async processAudioTap(audioTapEvent) {
    if (!audioTapEvent || typeof audioTapEvent !== 'object') {
      throw new Error('audioTapEvent is required');
    }

    const t0 = Date.now();

    // JSON ingress carries base64, Avro ingress carries bytes. Normalise once.
    let audioData = audioTapEvent.audioData;
    if (typeof audioData === 'string') {
      audioData = Buffer.from(audioData, 'base64');
    }
    if (!audioData || audioData.length === 0) {
      throw new Error('audioTapEvent.audioData is empty');
    }

    const sttResult = await defaultSTT.transcribe(audioData, {
      sampleRate: audioTapEvent.sampleRate,
      language: audioTapEvent.language || 'auto'
    });

    const recognizedText = (sttResult.text || '').trim();

    const captionEvent = {
      eventId: `cap_tap_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      meetingId: audioTapEvent.meetingId,
      speakerId: audioTapEvent.participantId,
      sourceLanguage: sttResult.language || 'hi',
      transcriptText: recognizedText,
      isFinal: true,
      confidenceScore: typeof sttResult.confidence === 'number' ? sttResult.confidence : 0,
      timestamp: Date.now()
    };

    const avroBuffer = registry.serialize('CaptionStreamEvent', captionEvent);

    return {
      captionEvent,
      avroBuffer,
      latencyMs: Date.now() - t0
    };
  }

  static async processAvroAudioTap(audioTapBuffer) {
    const audioTapEvent = registry.deserialize('AudioTapEvent', audioTapBuffer);
    return await this.processAudioTap(audioTapEvent);
  }
}

module.exports = AudioTapService;

