const { translate } = require('@vitalets/google-translate-api');

class TranslationService {
  /**
   * Translates text to target languages using a free open-source API wrapper.
   * @param {string} text 
   * @param {string} sourceLanguage 
   * @param {string[]} targetLanguages 
   */
  static async translate(text, sourceLanguage, targetLanguages) {
    console.log(`Translating: "${text}" from ${sourceLanguage} to ${targetLanguages.join(', ')}`);
    
    const translations = {};
    for (const lang of targetLanguages) {
      if (lang === sourceLanguage || !lang) {
        translations[lang] = text;
        continue;
      }
      try {
        const { text: translatedText } = await translate(text, { to: lang });
        translations[lang] = translatedText;
      } catch (error) {
        console.error(`Translation error for ${lang}:`, error.message);
        translations[lang] = `[${lang}] ${text}`; // Fallback if API rate-limited
      }
    }
    return translations;
  }
}

module.exports = TranslationService;
