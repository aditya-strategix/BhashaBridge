const IndicTrans2Adapter = require('./indictrans2.adapter');
const MyMemoryAdapter = require('./mymemory.adapter');

/**
 * Sovereign Composite Translation Adapter
 * Enforces IndicTrans2 (AI4Bharat / IIT Madras) as primary engine.
 * Zero Google Translate API dependencies.
 */
class CompositeTranslationAdapter {
  constructor() {
    this.indicTrans2 = new IndicTrans2Adapter();
    this.myMemory = new MyMemoryAdapter();
    this.cache = new Map(); // In-memory LRU phrase cache
    this.maxCacheSize = 5000;
  }

  _getCacheKey(text, sourceLang, targetLang) {
    return `${sourceLang}:${targetLang}:${text.trim().toLowerCase()}`;
  }

  async translateOne(text, sourceLang = 'en', targetLang = 'hi') {
    if (!text || !text.trim()) {
      return text;
    }

    const src = (sourceLang || 'en').toLowerCase().split(/[-_]/)[0];
    const tgt = (targetLang || '').toLowerCase().split(/[-_]/)[0];
    if (src === tgt) {
      return text;
    }

    const cleanText = text.trim();
    const cacheKey = this._getCacheKey(cleanText, src, tgt);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 1. Primary: IndicTrans2 for English → Indic (the checkpoint this
    //    deployment hosts). Non-English sources are routed to the fallback,
    //    because an en→indic model silently mangled them before.
    if (src === 'en' && this.indicTrans2.isAvailable() && this.indicTrans2.isLanguageSupported(tgt)) {
      try {
        const translated = await this.indicTrans2.translateOne(cleanText, src, tgt);
        if (translated && translated.trim()) {
          this._setCache(cacheKey, translated);
          return translated;
        }
      } catch (err) {
        console.warn(`[IndicTrans2] Inference failed: ${err.message}. Routing to fallback.`);
      }
    }

    // 2. Open Web / MyMemory Fallback (Non-Google)
    try {
      const translated = await this.myMemory.translateOne(cleanText, src, tgt);
      if (translated && translated.trim() && translated.trim() !== cleanText) {
        this._setCache(cacheKey, translated);
        return translated;
      }
    } catch (err) {
      console.warn(`[Translation] Fallback failed for "${cleanText.slice(0, 30)}..." -> ${tgt}: ${err.message}`);
    }

    // Never cache an identity fallback: a transient outage would otherwise
    // poison the phrase for the lifetime of the process.
    console.warn(`[Translation] No engine produced a translation for "${cleanText.slice(0, 30)}..." -> ${tgt}`);
    return cleanText;
  }

  async translateBatch(text, sourceLang, targetLangs) {
    if (!text || !text.trim()) return {};

    const src = (sourceLang || 'en').toLowerCase().split(/[-_]/)[0];
    const targets = (Array.isArray(targetLangs) ? targetLangs : String(targetLangs || '').split(','))
      .map(lang => String(lang || '').trim().toLowerCase().split(/[-_]/)[0])
      .filter(Boolean);

    const results = {};
    const langsToTranslate = [];

    for (const lang of targets) {
      if (lang === src) {
        results[lang] = text;
      } else if (!langsToTranslate.includes(lang)) {
        langsToTranslate.push(lang);
      }
    }

    if (langsToTranslate.length === 0) {
      return results;
    }

    await Promise.all(
      langsToTranslate.map(async (target) => {
        results[target] = await this.translateOne(text, src, target);
      })
    );

    return results;
  }

  _setCache(key, value) {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

module.exports = {
  IndicTrans2Adapter,
  MyMemoryAdapter,
  CompositeTranslationAdapter,
  defaultTranslator: new CompositeTranslationAdapter()
};
