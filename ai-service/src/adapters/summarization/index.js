const DeepSeekSummarizerAdapter = require('./deepseek.adapter');
const StructuralSummarizerAdapter = require('./structural.adapter');

class CompositeSummarizer {
  constructor() {
    this.deepseek = new DeepSeekSummarizerAdapter();
    this.structural = new StructuralSummarizerAdapter();
  }

  async generateSummary(transcriptText, options = {}) {
    if (!transcriptText || !transcriptText.trim()) {
      throw new Error('Transcript is empty');
    }

    // Use DeepSeek V4.1 Flash when configured
    if (this.deepseek.isAvailable()) {
      try {
        return await this.deepseek.generateSummary(transcriptText, options);
      } catch (err) {
        console.warn(`[CompositeSummarizer] DeepSeek attempt failed (${err.message}), falling back to Structural.`);
      }
    }

    // Fallback to Structural
    return await this.structural.generateSummary(transcriptText, options);
  }
}

module.exports = {
  DeepSeekSummarizerAdapter,
  StructuralSummarizerAdapter,
  CompositeSummarizer,
  defaultSummarizer: new CompositeSummarizer()
};

