/**
 * ISTTProvider - Abstract Base Class for Speech-to-Text Engines
 * Part of Pillar 5: Sovereign & Decoupled AI Pipeline
 */
class ISTTProvider {
  constructor(name) {
    if (new.target === ISTTProvider) {
      throw new TypeError('Cannot construct ISTTProvider instances directly');
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
   * Transcribe raw audio buffer (Opus or PCM) into text
   * @param {Buffer} audioBuffer
   * @param {object} options { language, sampleRate }
   * @returns {Promise<{ text: string, confidence: number, language: string }>}
   */
  async transcribe(audioBuffer, options = {}) {
    throw new Error('transcribe() must be implemented by subclass');
  }
}

module.exports = ISTTProvider;

