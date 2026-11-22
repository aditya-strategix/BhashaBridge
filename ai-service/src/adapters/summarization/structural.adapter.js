const ISummarizerProvider = require('./base.adapter');

/**
 * StructuralSummarizerAdapter
 * Deterministic local heuristic summarizer that extracts key discussion points,
 * speakers, and action items directly from the transcript text with 0ms network latency
 * and $0 cloud cost.
 */
class StructuralSummarizerAdapter extends ISummarizerProvider {
  constructor() {
    super('StructuralHeuristicSummarizer');
  }

  isAvailable() {
    return true;
  }

  async generateSummary(transcriptText, options = {}) {
    const t0 = Date.now();
    const lines = (transcriptText || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const speakers = new Set();
    const discussionPoints = [];
    const actionItems = [];
    const actionRegex = /\b(will|shall|going to|need to|needs to|must|should|action|task|fix|implement|handle|update|deploy|prepare)\b/i;

    lines.forEach(line => {
      const parts = line.split(':');
      if (parts.length > 1) {
        const speaker = parts[0].trim();
        const content = parts.slice(1).join(':').trim();
        if (speaker) speakers.add(speaker);
        if (content) {
          discussionPoints.push(`${speaker}: ${content}`);
          if (actionRegex.test(content)) {
            actionItems.push(`${speaker}: ${content}`);
          }
        }
      } else {
        discussionPoints.push(line);
      }
    });

    const speakerList = Array.from(speakers).join(', ') || 'Meeting Participants';
    const overview = `Collaborative discussion with ${speakerList} covering ${lines.length} conversational segment(s).`;

    const formattedPoints = discussionPoints.length > 0
      ? discussionPoints.slice(0, 10).map(p => `• ${p}`).join('\n')
      : '• General dialogue recorded.';

    const formattedActions = actionItems.length > 0
      ? actionItems.slice(0, 6).map(a => `• ${a}`).join('\n')
      : '• No explicit action items assigned during the recorded session.';

    const summary = `1. Primary Goal & Overview\n${overview}\n\n2. Key Discussion Points\n${formattedPoints}\n\n3. Action Items\n${formattedActions}`;
    const latencyMs = Date.now() - t0;

    return {
      summary,
      provider: 'StructuralSummarizer',
      model: 'heuristic-v1',
      latencyMs,
      nativeTargetLanguage: false
    };
  }
}

module.exports = StructuralSummarizerAdapter;

