const ISummarizerProvider = require('./base.adapter');

const LANG_MAP = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  bn: 'Bengali',
  mr: 'Marathi',
  gu: 'Gujarati',
  kn: 'Kannada',
  pa: 'Punjabi',
  ur: 'Urdu',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Chinese',
  ja: 'Japanese',
  ru: 'Russian',
  ar: 'Arabic',
  pt: 'Portuguese'
};

class GeminiSummarizerAdapter extends ISummarizerProvider {
  constructor(apiKey = process.env.GEMINI_API_KEY) {
    super('GeminiSummarizer');
    this.apiKey = apiKey;
    this.models = [
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.7-flash',
      'gemini-3.8-flash'
    ];
  }

  isAvailable() {
    return Boolean(this.apiKey || process.env.GEMINI_API_KEY);
  }

  async generateSummary(transcriptText, options = {}) {
    const key = this.apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const targetLanguage = options.targetLanguage || 'en';
    const langCode = targetLanguage.toLowerCase().split('-')[0];
    const langName = LANG_MAP[langCode] || langCode;
    const isTargetNonEnglish = langCode !== 'en';

    const systemPrompt = `You are an expert executive assistant. Analyze the following meeting transcript and provide a highly structured, professional executive summary.
Your summary must include:
1. A brief overview of the meeting's primary goal.
2. A bulleted list of key discussion points.
3. Action items (who is doing what) if any are mentioned.
Do not invent information. Keep the tone professional, clear, and concise.
IMPORTANT: DO NOT use any markdown formatting (no asterisks, no bolding, no hashes). Output pure plain text only.${
  isTargetNonEnglish
    ? `\nCRITICAL REQUIREMENT: Output the ENTIRE summary natively in ${langName}. Do NOT output in English.`
    : ''
}`;

    const modelsToTry = options.preferredModel
      ? [options.preferredModel, ...this.models.filter(m => m !== options.preferredModel)]
      : this.models;

    const t0 = Date.now();
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: transcriptText }] }]
          }),
          signal: AbortSignal.timeout(4500)
        });

        if (response.ok) {
          const result = await response.json();
          let text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            text = text
              .replace(/\*\*(.*?)\*\*/g, '$1')
              .replace(/\*(.*?)\*/g, '$1')
              .replace(/^#{1,6}\s+/gm, '');

            const latencyMs = Date.now() - t0;
            return {
              summary: text,
              provider: `Gemini (${model})`,
              model,
              latencyMs,
              nativeTargetLanguage: isTargetNonEnglish
            };
          }
        } else {
          const errText = await response.text();
          lastError = new Error(`Gemini ${model} HTTP ${response.status}: ${errText.slice(0, 100)}`);
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('All Gemini model invocations failed');
  }
}

module.exports = GeminiSummarizerAdapter;

