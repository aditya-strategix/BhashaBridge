const { registry } = require('../avro');
const { defaultSummarizer } = require('../adapters/summarization');
const { defaultTranslator } = require('../adapters/translation');

/**
 * AIServiceClient
 * High-performance client SDK for communicating with the decoupled AI Microservice.
 * Enforces Apache Avro binary serialization (Pillar 3) over HTTP/WebTransport,
 * with automatic fallback to local adapters if the microservice is offline.
 */
class AIServiceClient {
  constructor(baseUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Summarizes meeting transcript via decoupled AI Service using Avro binary framing
   * @param {string} transcriptText
   * @param {string} targetLanguage
   * @param {object} options { meetingId, preferredModel, useAvro }
   */
  async summarizeTranscript(transcriptText, targetLanguage = 'en', options = {}) {
    if (!transcriptText || !transcriptText.trim()) {
      throw new Error('Transcript is empty');
    }

    const useAvro = options.useAvro !== false; // Default to true (Avro binary)
    const t0 = Date.now();

    // 1. Try Decoupled AI Microservice via Network
    try {
      if (useAvro && registry.hasSchema('SummaryRequestEvent')) {
        const reqData = {
          requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          meetingId: options.meetingId || '',
          transcriptText,
          targetLanguage: targetLanguage || 'en',
          preferredModel: options.preferredModel || 'gemini-3.7-flash',
          timestamp: Date.now()
        };

        const avroPayload = registry.serialize('SummaryRequestEvent', reqData);

        const response = await fetch(`${this.baseUrl}/api/v1/ai/summary`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/avro',
            'Accept': 'application/avro, application/json'
          },
          body: avroPayload,
          signal: AbortSignal.timeout(10000)
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/avro') || contentType.includes('application/octet-stream')) {
            const arrayBuf = await response.arrayBuffer();
            const resBuffer = Buffer.from(arrayBuf);
            const decoded = registry.deserialize('SummaryResponseEvent', resBuffer);
            console.log(`[AIServiceClient] Summary received via Avro binary (${resBuffer.length} bytes, latency: ${Date.now() - t0}ms)`);
            return decoded.summaryText;
          } else {
            const json = await response.json();
            return json.summary;
          }
        }
      } else {
        // JSON HTTP Request
        const response = await fetch(`${this.baseUrl}/api/v1/ai/summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcriptText,
            targetLanguage,
            meetingId: options.meetingId,
            preferredModel: options.preferredModel
          }),
          signal: AbortSignal.timeout(10000)
        });

        if (response.ok) {
          const json = await response.json();
          return json.summary;
        }
      }
    } catch (networkErr) {
      console.warn(`[AIServiceClient] Decoupled AI service unreachable (${networkErr.message}). Initiating local adapter fallback...`);
    }

    // 2. Resilient In-Process Local Fallback
    console.log('[AIServiceClient] Running in-process composite summarizer fallback...');
    const result = await defaultSummarizer.generateSummary(transcriptText, {
      targetLanguage,
      preferredModel: options.preferredModel
    });

    let finalSummary = result.summary;
    const targetLangCode = (targetLanguage || 'en').toLowerCase().split('-')[0];

    if (!result.nativeTargetLanguage && targetLangCode !== 'en' && finalSummary) {
      try {
        const translations = await defaultTranslator.translateBatch(finalSummary, 'en', [targetLangCode]);
        finalSummary = translations[targetLangCode] || finalSummary;
      } catch (transErr) {
        console.warn('[AIServiceClient] Fallback translation error:', transErr.message);
      }
    }

    return finalSummary;
  }

  /**
   * Batch translation across multiple target languages
   */
  async translate(text, sourceLanguage = 'en', targetLanguages = ['en']) {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/ai/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sourceLanguage, targetLanguages }),
        signal: AbortSignal.timeout(6000)
      });

      if (response.ok) {
        const json = await response.json();
        return json.translations;
      }
    } catch (e) {
      // Local fallback
    }

    return await defaultTranslator.translateBatch(text, sourceLanguage, targetLanguages);
  }

  /**
   * Process a live caption event via Avro binary framing
   */
  async processCaptionEvent(captionEvent, targetLanguages = []) {
    try {
      const avroPayload = registry.serialize('CaptionStreamEvent', captionEvent);
      const response = await fetch(`${this.baseUrl}/api/v1/ai/caption/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/avro',
          'X-Target-Languages': targetLanguages.join(',')
        },
        body: avroPayload,
        signal: AbortSignal.timeout(4000)
      });

      if (response.ok) {
        const arrayBuf = await response.arrayBuffer();
        const resBuffer = Buffer.from(arrayBuf);
        return registry.deserialize('TranslatedCaptionEvent', resBuffer);
      }
    } catch (e) {
      // Local fallback
    }

    const translations = await defaultTranslator.translateBatch(
      captionEvent.transcriptText,
      captionEvent.sourceLanguage || 'en',
      targetLanguages
    );

    return {
      eventId: `trans_fallback_${Date.now()}`,
      originalEventId: captionEvent.eventId || '',
      meetingId: captionEvent.meetingId || '',
      speakerId: captionEvent.speakerId || '',
      translations,
      processingLatencyMs: 0,
      timestamp: Date.now()
    };
  }
}

module.exports = new AIServiceClient();
module.exports.AIServiceClient = AIServiceClient;

