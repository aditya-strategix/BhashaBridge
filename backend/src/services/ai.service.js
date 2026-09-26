const TranslationService = require('./translation.service');
const fetch = global.fetch || require('node-fetch');

class AIService {
  static async summarizeTranscript(transcriptText, targetLanguage = 'en') {
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) {
      throw new Error('Gemini API Key is not configured');
    }

    if (!transcriptText || transcriptText.trim().length === 0) {
      throw new Error('Transcript is empty');
    }

    const systemPrompt = "You are an expert executive assistant. Analyze the following meeting transcript and provide a highly structured, professional summary.\\nYour summary must include:\\n1. A brief overview of the meeting's primary goal.\\n2. A bulleted list of key discussion points.\\n3. Action items (who is doing what) if any are mentioned.\\nDo not invent information. Keep the tone professional and concise. IMPORTANT: DO NOT use any markdown formatting (no asterisks, no bolding, no hashes). Output pure plain text only.";

    const models = [
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-omni-1.1-flash',
      'gemini-flash-latest'
    ];

    let lastError = null;

    for (const model of models) {
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + GEMINI_KEY;
      
      try {
        console.log("Attempting intelligent summarization with model: " + model + "...");
        
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: transcriptText }] }]
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.warn("Model " + model + " failed: " + response.status + " " + errorText);
          lastError = new Error("Gemini API Error: " + response.status + " " + errorText);
          
          if (response.status === 503 || response.status === 404 || response.status === 429) {
            continue;
          } else {
            throw lastError;
          }
        }

        const result = await response.json();
        let finalSummary = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        if (!finalSummary) {
          throw new Error('Failed to parse Gemini response.');
        }
        
        console.log("Successfully generated summary using " + model + "!");

        if (targetLanguage && targetLanguage !== 'en' && finalSummary) {
          const translations = await TranslationService.translate(finalSummary, 'en', [targetLanguage]);
          return translations[targetLanguage] || finalSummary;
        }

        return finalSummary;
        
      } catch (error) {
        lastError = error;
        console.warn("Network/Execution error on " + model + ":", error.message);
      }
    }

    console.error('All Gemini fallback models exhausted!');
    throw lastError || new Error('All Gemini models are currently unavailable.');
  }
}

module.exports = AIService;
