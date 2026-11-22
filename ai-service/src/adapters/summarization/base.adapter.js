/**
 * ISummarizerProvider - Abstract Base Class for Meeting Summarization Engines
 * Part of Pillar 5: Sovereign & Decoupled AI Pipeline
 */
class ISummarizerProvider {
  constructor(name) {
    if (new.target === ISummarizerProvider) {
      throw new TypeError('Cannot construct ISummarizerProvider instances directly');
    }
    this.name = name;
  }

  getName() {
    return this.name;
  }

  /**
   * Check if the provider is configured and available
   * @returns {boolean}
   */
  isAvailable() {
    return true;
  }

  /**
   * Generate executive summary from transcript
   * @param {string} transcriptText
   * @param {object} options { targetLanguage, preferredModel }
   * @returns {Promise<{ summary: string, provider: string, latencyMs: number }>}
   */
  async generateSummary(transcriptText, options = {}) {
    throw new Error('generateSummary() must be implemented by subclass');
  }
}

module.exports = ISummarizerProvider;

