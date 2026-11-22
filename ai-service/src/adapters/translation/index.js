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
    if (!text || !text.trim() || sourceLang === targetLang) {
      return text;
    }

    const cleanText = text.trim();
    const cacheKey = this._getCacheKey(cleanText, sourceLang, targetLang);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 1. Primary: IndicTrans2 (Sovereign AI4Bharat / IIT Madras Neural Translation)
    if (this.indicTrans2.isAvailable() && this.indicTrans2.isLanguageSupported(targetLang)) {
      try {
        const translated = await this.indicTrans2.translateOne(cleanText, sourceLang, targetLang);
        this._setCache(cacheKey, translated);
        return translated;
      } catch (err) {
        console.warn(`[IndicTrans2] Inference offline: ${err.message}. Routing to sovereign fallback.`);
      }
    }

    // 2. Open Web / MyMemory Fallback (Non-Google)
    try {
      const translated = await this.myMemory.translateOne(cleanText, sourceLang, targetLang);
      this._setCache(cacheKey, translated);
      return translated;
    } catch (err) {
      console.warn(`[Translation] Translation fallback for "${cleanText.slice(0, 30)}..." -> ${targetLang}`);
      return cleanText; // Safe identity fallback
    }
  }

  async translateBatch(text, sourceLang, targetLangs) {
    if (!text || !text.trim()) return {};
    const results = {};
    const langsToTranslate = [];

    for (const lang of targetLangs) {
      if (!lang || lang === sourceLang) {
        results[lang] = text;
      } else {
        langsToTranslate.push(lang);
      }
    }

    if (langsToTranslate.length === 0) {
      return results;
    }

    await Promise.all(
      langsToTranslate.map(async (target) => {
        results[target] = await this.translateOne(text, sourceLang, target);
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
