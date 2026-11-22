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
    const t0 = Date.now();
    const sttResult = await defaultSTT.transcribe(audioTapEvent.audioData, {
      sampleRate: audioTapEvent.sampleRate,
      language: 'auto'
    });

    const captionEvent = {
      eventId: `cap_tap_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      meetingId: audioTapEvent.meetingId,
      speakerId: audioTapEvent.participantId,
      sourceLanguage: sttResult.language || 'hi',
      transcriptText: sttResult.text,
      isFinal: true,
      confidenceScore: sttResult.confidence || 0.95,
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

