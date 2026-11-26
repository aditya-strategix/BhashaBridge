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

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash'; // DeepSeek-V4.1-Flash

class DeepSeekSummarizerAdapter extends ISummarizerProvider {
  constructor(apiKey = process.env.DEEPSEEK_API_KEY) {
    super('DeepSeekSummarizer');
    this.apiKey = apiKey;
    this.model = DEFAULT_DEEPSEEK_MODEL;
  }

  isAvailable() {
    return Boolean(this.apiKey || process.env.DEEPSEEK_API_KEY);
  }

  async generateSummary(transcriptText, options = {}) {
    const key = this.apiKey || process.env.DEEPSEEK_API_KEY;
    if (!key) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

    const targetLanguage = options.targetLanguage || 'en';
    const langCode = targetLanguage.toLowerCase().split('-')[0];
    const langName = LANG_MAP[langCode] || langCode;
    const isTargetNonEnglish = langCode !== 'en';

    const requestedModel =
      options.preferredModel && String(options.preferredModel).startsWith('deepseek')
        ? options.preferredModel
        : this.model;

    const systemPrompt = `You are an elite executive meeting intelligence analyst for BhashaBridge, a real-time multilingual video conferencing platform.
Carefully read EVERY line of the full meeting transcript provided (note that speakers may converse in multiple languages or dialects across timestamps) and synthesize a sharp, thorough, executive-grade summary.

Required Plain-Text Structure (keep the section headings concise and translate section headings too if outputting in a non-English target language):
1. MEETING OVERVIEW
   - State the core objective, context, participants' general focus, and overall outcome in 2-4 clear sentences.

2. KEY DISCUSSION POINTS
   - Group related remarks logically using crisp bullet points (- ).
   - Preserve concrete names, metrics, dates, technical terms, decisions, and speaker attribution whenever stated in the transcript.

3. DECISIONS REACHED
   - List explicit agreements or approvals concluded during the session (or write "No formal decisions recorded." if none were made).

4. ACTION ITEMS & OWNERSHIP
   - Format as: "- [Owner]: [Specific task / next step] [Timeline if mentioned]".
   - If no explicit tasks were assigned, write "No explicit action items assigned."

5. OPEN QUESTIONS & FOLLOW-UPS
   - Note unresolved blockers, risks, or topics deferred to a future session (omit this section if none exist).

Strict Quality & Formatting Rules:
- Rely ONLY on facts present in the transcript; never fabricate speakers, commitments, numbers, or timelines.
- Resolve fragmented live-caption phrases smoothly into coherent prose without altering their factual meaning.
- Output PURE PLAIN TEXT ONLY: NO markdown bold (**), italics (*), headings (#), code fences, or HTML tags.${
      isTargetNonEnglish
        ? `\n- CRITICAL LANGUAGE REQUIREMENT: Write the ENTIRE summary—including every heading, bullet, and explanation—natively and fluently in ${langName}. Do NOT answer in English.`
        : '\n- Write the entire summary in crisp, natural Executive English.'
    }`;

    const userPrompt = `Here is the complete chronological meeting transcript. Please analyze all entries from start to finish and generate the executive summary:\n\n${transcriptText}`;

    const t0 = Date.now();
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: requestedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.25,
        max_tokens: 4096
      }),
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepSeek ${requestedModel} HTTP ${response.status}: ${errText.slice(0, 150)}`);
    }

    const result = await response.json();
    let text = result.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('DeepSeek returned an empty summary response');
    }

    // Strip any accidental markdown emphasis/headings so plain-text modal stays clean
    text = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?|```/g, ''));

    return {
      summary: text.trim(),
      provider: `DeepSeek (${requestedModel})`,
      model: requestedModel,
      latencyMs: Date.now() - t0,
      nativeTargetLanguage: isTargetNonEnglish
    };
  }
}

module.exports = DeepSeekSummarizerAdapter;
