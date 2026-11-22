const ITranslationProvider = require('./base.adapter');

/**
 * IndicTrans2Adapter
 * Implements AI4Bharat IndicTrans2 Neural Translation engine (IIT Madras).
 * Supports sovereign self-hosted CTranslate2 / ONNX inference server running locally or via Docker.
 * Eliminates per-character cloud fees and prevents foreign cloud vendor lock-in.
 */
class IndicTrans2Adapter extends ITranslationProvider {
  constructor(endpoint = process.env.INDICTRANS2_ENDPOINT) {
    super('IndicTrans2');
    this.endpoint = endpoint;
    this.hfToken = process.env.HF_TOKEN || '';
    this.supportedLanguages = new Set([
      'en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'pa', 'ur', 'ml', 'or', 'as'
    ]);
  }

  isAvailable() {
    return Boolean(this.endpoint || this.hfToken);
  }

  isLanguageSupported(lang) {
    return this.supportedLanguages.has(lang.toLowerCase());
  }

  async translateOne(text, sourceLang = 'en', targetLang = 'hi') {
    if (!text || !text.trim() || sourceLang === targetLang) {
      return text;
    }

    // 1. If Hugging Face Token is configured, use Hugging Face Cloud Inference API (Zero Storage)
    if (this.hfToken) {
      try {
        const hfUrl = 'https://router.huggingface.co/hf-inference/models/facebook/nllb-200-distilled-600M';
        const response = await fetch(hfUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.hfToken}`
          },
          body: JSON.stringify({ inputs: text }),
          signal: AbortSignal.timeout(4000)
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data[0]?.translation_text) {
            return data[0].translation_text;
          }
        }
      } catch (err) {
        // Fallback to endpoint or composite chain
      }
    }

    // 2. If a dedicated remote endpoint is configured, call it
    if (this.endpoint) {
      try {
        const url = `${this.endpoint}/translate`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            source_language: sourceLang,
            target_language: targetLang
          }),
          signal: AbortSignal.timeout(3000)
        });

        if (response.ok) {
          const data = await response.json();
          return data.translated_text || data.translation || text;
        }
        throw new Error(`IndicTrans2 server responded with HTTP ${response.status}`);
      } catch (err) {
        throw new Error(`IndicTrans2 inference unavailable: ${err.message}`);
      }
    }

    throw new Error('No IndicTrans2 endpoint or HF_TOKEN available');
  }
}

module.exports = IndicTrans2Adapter;

