const { defaultSummarizer } = require('../adapters/summarization');
const { defaultTranslator } = require('../adapters/translation');
const { registry } = require('../avro');

class SummarizationService {
  /**
   * Summarizes meeting transcript and outputs in requested target language
   * @param {string} transcriptText
   * @param {string} targetLanguage
   * @param {object} options
   * @returns {Promise<{ summary: string, provider: string, latencyMs: number, targetLanguage: string }>}
   */
  static async summarize(transcriptText, targetLanguage = 'en', options = {}) {
    if (!transcriptText || !transcriptText.trim()) {
      throw new Error('Transcript is empty');
    }

    const t0 = Date.now();
    const result = await defaultSummarizer.generateSummary(transcriptText, {
      targetLanguage,
      preferredModel: options.preferredModel
    });

    let finalSummary = result.summary;
    const targetLangCode = (targetLanguage || 'en').toLowerCase().split('-')[0];

    // If summarizer didn't natively output in target language and target is non-English, translate
    if (!result.nativeTargetLanguage && targetLangCode !== 'en' && finalSummary) {
      try {
        console.log(`[AIService] Translating summary to ${targetLangCode}...`);
        const translations = await defaultTranslator.translateBatch(finalSummary, 'en', [targetLangCode]);
        finalSummary = translations[targetLangCode] || finalSummary;
      } catch (err) {
        console.warn('[AIService] Summary translation fallback warning:', err.message);
      }
    }

    const totalLatencyMs = Date.now() - t0;

    return {
      summary: finalSummary,
      provider: result.provider,
      model: result.model,
      latencyMs: totalLatencyMs,
      targetLanguage
    };
  }

  /**
   * Processes a SummaryRequestEvent Avro buffer, returning a SummaryResponseEvent Avro buffer
   */
  static async processAvroRequest(requestBuffer) {
    const request = registry.deserialize('SummaryRequestEvent', requestBuffer);
    const result = await this.summarize(
      request.transcriptText,
      request.targetLanguage || 'en',
      { preferredModel: request.preferredModel }
    );

    const responsePayload = {
      requestId: request.requestId || `req_${Date.now()}`,
      meetingId: request.meetingId || '',
      summaryText: result.summary,
      targetLanguage: result.targetLanguage,
      providerUsed: result.provider,
      processingLatencyMs: result.latencyMs,
      timestamp: Date.now()
    };

    const responseBuffer = registry.serialize('SummaryResponseEvent', responsePayload);
    return { payload: responsePayload, buffer: responseBuffer };
  }
}

module.exports = SummarizationService;

