const GeminiSummarizerAdapter = require('./gemini.adapter');
const StructuralSummarizerAdapter = require('./structural.adapter');

class CompositeSummarizer {
  constructor() {
    this.gemini = new GeminiSummarizerAdapter();
    this.structural = new StructuralSummarizerAdapter();
  }

  async generateSummary(transcriptText, options = {}) {
    if (!transcriptText || !transcriptText.trim()) {
      throw new Error('Transcript is empty');
    }

    // Try Gemini if available
    if (this.gemini.isAvailable()) {
      try {
        return await this.gemini.generateSummary(transcriptText, options);
      } catch (err) {
        console.warn(`[CompositeSummarizer] Gemini attempt failed (${err.message}), falling back to Structural.`);
      }
    }

    // Fallback to Structural
    return await this.structural.generateSummary(transcriptText, options);
  }
}

module.exports = {
  GeminiSummarizerAdapter,
  StructuralSummarizerAdapter,
  CompositeSummarizer,
  defaultSummarizer: new CompositeSummarizer()
};

