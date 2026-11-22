const { defaultTranslator } = require('../adapters/translation');

class TranslationService {
  static async translate(text, sourceLanguage = 'en', targetLanguages = ['en']) {
    return await defaultTranslator.translateBatch(text, sourceLanguage, targetLanguages);
  }

  static async translateOne(text, sourceLanguage = 'en', targetLanguage = 'hi') {
    return await defaultTranslator.translateOne(text, sourceLanguage, targetLanguage);
  }
}

module.exports = TranslationService;

