const { defaultTranslator } = require('../adapters/translation');
const { registry } = require('../avro');

/**
 * CaptionProcessorService
 * High-throughput microservice pipeline implementing Pillar 3 of newArchitecture.md:
 * Ingests binary CaptionStreamEvent (.avsc), translates in parallel across room participant languages,
 * and emits binary TranslatedCaptionEvent (.avsc).
 */
class CaptionProcessorService {
  /**
   * Processes a live caption event and translates for required target languages
   * @param {object} captionEvent Matches CaptionStreamEvent.avsc
   * @param {string[]} targetLanguages
   * @returns {Promise<{ event: object, avroBuffer: Buffer }>}
   */
  static async processCaption(captionEvent, targetLanguages = []) {
    const t0 = Date.now();
    const sourceLang = captionEvent.sourceLanguage || 'en';
    const text = (captionEvent.transcriptText || '').trim();

    if (!text || text.startsWith('[') || text.toLowerCase().includes('audio stream') || text.toLowerCase().includes('stream chunk')) {
      const dummyEvent = {
        eventId: `trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        originalEventId: captionEvent.eventId || '',
        meetingId: captionEvent.meetingId || '',
        speakerId: captionEvent.speakerId || '',
        translations: {},
        processingLatencyMs: 0,
        timestamp: Date.now()
      };
      return {
        event: dummyEvent,
        avroBuffer: registry.serialize('TranslatedCaptionEvent', dummyEvent),
        latencyMs: 0
      };
    }

    // Parallel translation across all target languages
    const translations = await defaultTranslator.translateBatch(text, sourceLang, targetLanguages);

    const latencyMs = Date.now() - t0;
    const translatedEvent = {
      eventId: `trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      originalEventId: captionEvent.eventId || '',
      meetingId: captionEvent.meetingId || '',
      speakerId: captionEvent.speakerId || '',
      translations: translations,
      processingLatencyMs: latencyMs,
      timestamp: Date.now()
    };

    const avroBuffer = registry.serialize('TranslatedCaptionEvent', translatedEvent);

    return {
      event: translatedEvent,
      avroBuffer,
      latencyMs
    };
  }

  /**
   * Processes raw binary CaptionStreamEvent buffer from network
   */
  static async processAvroStream(captionBuffer, targetLanguages = []) {
    const captionEvent = registry.deserialize('CaptionStreamEvent', captionBuffer);
    return await this.processCaption(captionEvent, targetLanguages);
  }
}

module.exports = CaptionProcessorService;

