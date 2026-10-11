const translate = require('google-translate-api-x');

class TranslationService {
  /**
   * Translates text to target languages using Google Translate with fallback.
   * Runs target languages in parallel via Promise.all for lowest possible latency.
   * @param {string} text 
   * @param {string} sourceLanguage 
   * @param {string[]} targetLanguages 
   */
  static async translate(text, sourceLanguage, targetLanguages) {
    if (!text || !text.trim()) return {};
    const translations = {};
    const langsToTranslate = [];

    for (const lang of targetLanguages) {
      if (!lang || lang === sourceLanguage) {
        translations[lang] = text; // Instant zero-cost identity pass-through
      } else {
        langsToTranslate.push(lang);
      }
    }

    if (langsToTranslate.length === 0) {
      return translations;
    }

    // Translate all required target languages concurrently
    await Promise.all(
      langsToTranslate.map(async (targetLang) => {
        try {
          const res = await translate(text, { to: targetLang, client: 'gtx' }).catch(async (e) => {
            // Secondary fallback to MyMemory API
            const fallbackUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLanguage || 'en'}|${targetLang}`;
            const fallbackRes = await fetch(fallbackUrl);
            const fallbackData = await fallbackRes.json();
            if (fallbackData?.responseData?.translatedText) {
              return { text: fallbackData.responseData.translatedText };
            }
            throw e;
          });
          translations[targetLang] = res.text;
        } catch (error) {
          console.error(`Translation error for ${targetLang}:`, error.message);
          translations[targetLang] = text; // Safe fallback
        }
      })
    );

    return translations;
  }
}

module.exports = TranslationService;
