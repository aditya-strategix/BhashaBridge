/**
 * ITranslationProvider - Abstract Base Class for Machine Translation Engines
 * Part of Pillar 5: Sovereign & Decoupled AI Pipeline
 */
class ITranslationProvider {
  constructor(name) {
    if (new.target === ITranslationProvider) {
      throw new TypeError('Cannot construct ITranslationProvider instances directly');
    }
    this.name = name;
  }

  getName() {
    return this.name;
  }

  isAvailable() {
    return true;
  }

  /**
   * Translates a single text string to a target language
   * @param {string} text
   * @param {string} sourceLang
   * @param {string} targetLang
   * @returns {Promise<string>}
   */
  async translateOne(text, sourceLang, targetLang) {
    throw new Error('translateOne() must be implemented by subclass');
  }

  /**
   * Translates text to multiple target languages in parallel
   * @param {string} text
   * @param {string} sourceLang
   * @param {string[]} targetLangs
   * @returns {Promise<Record<string, string>>}
   */
  async translateBatch(text, sourceLang, targetLangs) {
    const results = {};
    const promises = targetLangs.map(async (target) => {
      if (target === sourceLang) {
        results[target] = text;
      } else {
        results[target] = await this.translateOne(text, sourceLang, target);
      }
    });
    await Promise.all(promises);
    return results;
  }
}

module.exports = ITranslationProvider;

