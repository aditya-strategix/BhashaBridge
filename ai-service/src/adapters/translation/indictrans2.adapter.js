const ITranslationProvider = require('./base.adapter');

/**
 * IndicTrans2Adapter
 * Implements AI4Bharat IndicTrans2 Neural Translation engine (IIT Madras).
 * Sends requests directly to the dedicated sovereign inference domain (https://ai.aditya-kumar.in).
 * Zero Hugging Face cloud dependencies.
 */
class IndicTrans2Adapter extends ITranslationProvider {
  constructor(endpoint = process.env.INDICTRANS2_ENDPOINT || process.env.AI_ENGINE_DOMAIN || 'https://ai.aditya-kumar.in') {
    super('IndicTrans2');
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.fallbackEndpoint = (process.env.LOCAL_AI_ENGINE_ENDPOINT || 'http://localhost:8000').replace(/\/+$/, '');
    this.supportedLanguages = new Set([
      'en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'pa', 'ur', 'ml', 'or', 'as'
    ]);
  }

  isAvailable() {
    return Boolean(this.endpoint || this.fallbackEndpoint);
  }

  isLanguageSupported(lang) {
    return this.supportedLanguages.has(lang.toLowerCase());
  }

  async translateOne(text, sourceLang = 'en', targetLang = 'hi') {
    if (!text || !text.trim() || sourceLang === targetLang) {
      return text;
    }

    const src = (sourceLang || '').toLowerCase().split(/[-_]/)[0];
    const tgt = (targetLang || '').toLowerCase().split(/[-_]/)[0];

    // This deployment hosts the English→Indic checkpoint only. Sending a
    // non-English source produces transliterated garbage, so let the composite
    // adapter use its real fallback instead.
    if (src !== 'en') {
      throw new Error(`IndicTrans2 en→indic engine cannot translate source "${sourceLang}"`);
    }

    // Prefer the local GPU engine; the public tunnel is only a backup.
    const endpointsToTry = [this.fallbackEndpoint, this.endpoint]
      .filter(Boolean)
      .filter((ep, i, arr) => arr.indexOf(ep) === i);

    for (const ep of endpointsToTry) {
      try {
        const url = `${ep}/translate`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BhashaBridge-AI/2.0'
          },
          body: JSON.stringify({
            text,
            source_language: src,
            target_language: tgt
          }),
          signal: AbortSignal.timeout(12000)
        });

        if (!response.ok) {
          console.warn(`[IndicTrans2] Endpoint ${ep} responded with HTTP ${response.status}`);
          continue;
        }

        const data = await response.json();
        if (data && data.error) {
          console.warn(`[IndicTrans2] Endpoint ${ep} returned an error: ${String(data.error).slice(0, 120)}`);
          continue;
        }

        const translated = data?.translated_text ?? data?.translation;
        if (typeof translated === 'string' && translated.trim()) {
          return translated;
        }
        console.warn(`[IndicTrans2] Endpoint ${ep} returned an empty translation`);
      } catch (err) {
        console.warn(`[IndicTrans2] Request to ${ep} failed: ${err.message}`);
      }
    }

    throw new Error(`IndicTrans2 inference failed across all configured endpoints (${endpointsToTry.join(', ')})`);
  }
}

module.exports = IndicTrans2Adapter;
