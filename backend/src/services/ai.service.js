const TranslationService = require('./translation.service');
const fetch = global.fetch || require('node-fetch');

class AIService {
  static async summarizeTranscript(transcriptText, targetLanguage = 'en') {
    if (!transcriptText || transcriptText.trim().length === 0) {
      throw new Error('Transcript is empty');
    }

    const systemPrompt = "You are an expert executive assistant. Analyze the following meeting transcript and provide a highly structured, professional summary.\nYour summary must include:\n1. A brief overview of the meeting's primary goal.\n2. A bulleted list of key discussion points.\n3. Action items (who is doing what) if any are mentioned.\nDo not invent information. Keep the tone professional and concise. IMPORTANT: DO NOT use any markdown formatting (no asterisks, no bolding, no hashes). Output pure plain text only.";

    let finalSummary = null;

    // --- Exclusively Google Gemini Models (Active & Supported) ---
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) {
      throw new Error('GEMINI_API_KEY is not configured in backend environment');
    }

    const geminiModels = [
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.5-flash-lite',
      'gemini-2.5-pro'
    ];

    let lastError = null;

    for (const model of geminiModels) {
      try {
        console.log(`[AIService] Trying Gemini model: ${model}...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: transcriptText }] }]
          })
        });

        if (response.ok) {
          const result = await response.json();
          const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            console.log(`[AIService] Successfully generated summary using Gemini ${model}!`);
            finalSummary = text;
            break;
          }
        } else {
          const errText = await response.text();
          console.warn(`[AIService] Gemini model ${model} returned ${response.status}:`, errText);
          lastError = new Error(`Gemini API Error: ${response.status} ${errText}`);
        }
      } catch (err) {
        console.warn(`[AIService] Gemini model ${model} network error:`, err.message);
        lastError = err;
      }
    }

    // Safety fallback only if all Gemini models encounter network failure
    if (!finalSummary) {
      console.warn('[AIService] All Gemini models were unavailable. Falling back to native structural summarizer.');
      finalSummary = this.generateStructuralSummary(transcriptText);
    }

    // Clean up any remaining asterisks or markdown formatting
    finalSummary = finalSummary
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^#{1,6}\s+/gm, '');

    // Translate if targetLanguage is not English
    if (targetLanguage && targetLanguage !== 'en' && finalSummary) {
      try {
        const translations = await TranslationService.translate(finalSummary, 'en', [targetLanguage]);
        return translations[targetLanguage] || finalSummary;
      } catch (transErr) {
        console.warn('[AIService] Summary translation error:', transErr.message);
      }
    }

    return finalSummary;
  }

  static generateStructuralSummary(transcriptText) {
    const lines = transcriptText
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

    return `1. Primary Goal & Overview\n${overview}\n\n2. Key Discussion Points\n${formattedPoints}\n\n3. Action Items\n${formattedActions}`;
  }
}

module.exports = AIService;
