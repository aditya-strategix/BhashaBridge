const ITranslationProvider = require('./base.adapter');

class MyMemoryAdapter extends ITranslationProvider {
  constructor() {
    super('MyMemory');
  }

  async translateOne(text, sourceLang = 'en', targetLang = 'hi') {
    if (!text || !text.trim() || sourceLang === targetLang) {
      return text;
    }

    const fallbackUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(sourceLang)}|${encodeURIComponent(targetLang)}`;
    const fallbackRes = await fetch(fallbackUrl, { signal: AbortSignal.timeout(3500) });
    const fallbackData = await fallbackRes.json();
    if (fallbackData?.responseData?.translatedText) {
      return fallbackData.responseData.translatedText;
    }
    throw new Error('MyMemory returned empty translation');
  }
}

module.exports = MyMemoryAdapter;

