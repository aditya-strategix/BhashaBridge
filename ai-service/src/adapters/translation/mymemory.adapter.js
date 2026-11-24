const ITranslationProvider = require('./base.adapter');

class MyMemoryAdapter extends ITranslationProvider {
  constructor() {
    super('MyMemory');
  }

  async translateOne(text, sourceLang = 'en', targetLang = 'hi') {
    if (!text || !text.trim() || sourceLang === targetLang) {
      return text;
    }

    const src = (sourceLang || '').toLowerCase().split(/[-_]/)[0];
    const tgt = (targetLang || '').toLowerCase().split(/[-_]/)[0];
    const fallbackUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(src)}|${encodeURIComponent(tgt)}`;
    const fallbackRes = await fetch(fallbackUrl, { signal: AbortSignal.timeout(3500) });
    if (!fallbackRes.ok) {
      throw new Error(`MyMemory HTTP ${fallbackRes.status}`);
    }

    const fallbackData = await fallbackRes.json();
    const status = Number(fallbackData?.responseStatus);
    const translated = fallbackData?.responseData?.translatedText;

    if (status && status !== 200) {
      throw new Error(`MyMemory response status ${status}: ${fallbackData?.responseDetails || 'unknown'}`);
    }
    if (typeof translated !== 'string' || !translated.trim()) {
      throw new Error('MyMemory returned empty translation');
    }
    // MyMemory returns HTTP 200 with these strings when the free quota is hit.
    if (/MYMEMORY WARNING|PLEASE SELECT TWO DISTINCT|YOU USED ALL AVAILABLE FREE TRANSLATIONS|QUERY LENGTH LIMIT/i.test(translated)) {
      throw new Error(`MyMemory quota/validation error: ${translated.slice(0, 120)}`);
    }

    return translated;
  }
}

module.exports = MyMemoryAdapter;

