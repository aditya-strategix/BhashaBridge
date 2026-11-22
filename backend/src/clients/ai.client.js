const { registry } = require('../avro');

/**
 * AI Service Microservice Client (Backend HTTP + Avro Driver)
 * Communicates with the independently deployed bhashabridge-ai-service over network.
 * Configured via process.env.AI_SERVICE_URL (e.g. http://ai-service:5001 or https://ai.domain.com).
 * Zero local filesystem dependencies on the ai-service directory.
 */
class AIServiceClient {
  constructor(baseUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001') {
    this.baseUrl = (baseUrl || 'http://127.0.0.1:5001').replace(/\/+$/, '');
  }

  getBaseUrl() {
    return process.env.AI_SERVICE_URL || this.baseUrl || 'http://127.0.0.1:5001';
  }

  /**
   * Request meeting summary from decoupled AI microservice using Apache Avro binary contracts
   * @param {string} transcriptText
   * @param {string} targetLanguage
   * @param {object} options
   */
  async summarizeTranscript(transcriptText, targetLanguage = 'en', options = {}) {
    if (!transcriptText || !transcriptText.trim()) {
      throw new Error('Transcript is empty');
    }

    const useAvro = options.useAvro !== false && registry.hasSchema('SummaryRequestEvent');

    if (useAvro) {
      const requestPayload = {
        requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        meetingId: options.meetingId || '',
        transcriptText,
        targetLanguage: targetLanguage || 'en',
        preferredModel: options.preferredModel || 'gemini-3.7-flash',
        timestamp: Date.now()
      };

      const avroBuffer = registry.serialize('SummaryRequestEvent', requestPayload);

      const response = await fetch(`${this.getBaseUrl()}/api/v1/ai/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/avro',
          'Accept': 'application/avro, application/json'
        },
        body: avroBuffer,
        signal: AbortSignal.timeout(12000)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI Microservice HTTP ${response.status}: ${errText.slice(0, 100)}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/avro') || contentType.includes('application/octet-stream')) {
        const arrayBuf = await response.arrayBuffer();
        const resBuffer = Buffer.from(arrayBuf);
        const decoded = registry.deserialize('SummaryResponseEvent', resBuffer);
        return decoded.summaryText;
      } else {
        const json = await response.json();
        return json.summary;
      }
    } else {
      // Standard JSON fallback over HTTP
      const response = await fetch(`${this.baseUrl}/api/v1/ai/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcriptText,
          targetLanguage,
          meetingId: options.meetingId,
          preferredModel: options.preferredModel
        }),
        signal: AbortSignal.timeout(12000)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI Microservice HTTP ${response.status}: ${errText.slice(0, 100)}`);
      }

      const json = await response.json();
      return json.summary;
    }
  }

  /**
   * Request multi-language batch translation from decoupled AI microservice
   */
  async translate(text, sourceLanguage = 'en', targetLanguages = ['en']) {
    const response = await fetch(`${this.getBaseUrl()}/api/v1/ai/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sourceLanguage, targetLanguages }),
      signal: AbortSignal.timeout(6000)
    });

    if (!response.ok) {
      throw new Error(`AI Microservice translation error HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.translations || {};
  }

  /**
   * Synthesize Indian language speech via sovereign Bhashini TTS (AI Microservice)
   */
  async synthesizeTTS(text, lang = 'hi', options = {}) {
    const url = `${this.getBaseUrl()}/api/v1/ai/tts`;
    console.log('[aiClient] synthesizeTTS URL:', url);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language: lang,
          gender: options.gender || 'female'
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (!response.ok) {
        throw new Error(`AI Microservice Bhashini TTS error HTTP ${response.status}`);
      }

      const arrayBuf = await response.arrayBuffer();
      return Buffer.from(arrayBuf);
    } catch (err) {
      console.error('[aiClient] synthesizeTTS exception details:', err.cause || err);
      throw err;
    }
  }

  /**
   * Stream live caption event to AI microservice via Avro binary
   */
  async processCaptionEvent(captionEvent, targetLanguages = []) {
    const avroPayload = registry.serialize('CaptionStreamEvent', captionEvent);

    const response = await fetch(`${this.getBaseUrl()}/api/v1/ai/caption/stream`, {
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
      return registry.deserialize('TranslatedCaptionEvent', Buffer.from(arrayBuf));
    }

    throw new Error(`AI Microservice caption stream failed HTTP ${response.status}`);
  }
}

module.exports = new AIServiceClient();
module.exports.AIServiceClient = AIServiceClient;

