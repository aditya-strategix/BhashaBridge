/**
 * ITTSProvider - Abstract Base Class for Text-to-Speech Engines
 * Part of Pillar 5: Sovereign & Decoupled AI Pipeline
 */
class ITTSProvider {
  constructor(name) {
    if (new.target === ITTSProvider) {
      throw new TypeError('Cannot construct ITTSProvider instances directly');
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
   * Synthesize speech audio from text
   * @param {string} text
   * @param {object} options { language, voice, speed }
   * @returns {Promise<{ audioBuffer: Buffer, format: string, durationMs: number }>}
   */
  async synthesize(text, options = {}) {
    throw new Error('synthesize() must be implemented by subclass');
  }
}

module.exports = ITTSProvider;

