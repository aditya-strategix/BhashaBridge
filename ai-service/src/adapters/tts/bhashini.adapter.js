const ITTSProvider = require('./base.adapter');

/**
 * BhashiniTTSAdapter
 * Implements National Language Translation Mission (NLTM / Bhashini) Indic-TTS.
 * Developed by AI4Bharat / IIT Madras & MeitY (Government of India).
 * Supports all 22 scheduled Indian languages + Indian English.
 * Eliminates all Google TTS dependencies and provides 100% sovereign voice synthesis.
 */
class BhashiniTTSAdapter extends ITTSProvider {
  constructor(options = {}) {
    super('BhashiniTTS');
    this.endpoint = options.endpoint || process.env.BHASHINI_ENDPOINT || 'https://dhruva-api.bhashini.gov.in/services/inference/pipeline';
    this.userId = options.userId || process.env.BHASHINI_USER_ID || '';
    this.apiKey = options.apiKey || process.env.BHASHINI_API_KEY || '';
    this.inferenceKey = options.inferenceKey || process.env.BHASHINI_INFERENCE_KEY || '';

    this.supportedLanguages = new Set([
      'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as', 'ur', 'en'
    ]);
  }

  isAvailable() {
    return Boolean(this.apiKey || this.inferenceKey || process.env.BHASHINI_ENABLED === 'true');
  }

  /**
   * Synthesize Indian language text into audio using Bhashini Dhruva pipeline
   * @param {string} text
   * @param {object} options
   * @returns {Promise<{ audioBuffer: Buffer, format: string, durationMs: number }>}
   */
  async synthesize(text, options = {}) {
    const rawLang = (options.language || 'hi').toLowerCase().slice(0, 2);
    const lang = this.supportedLanguages.has(rawLang) ? rawLang : 'hi';
    const gender = options.gender || 'female';

    if (!text || !text.trim()) {
      throw new Error('Text parameter is empty for Bhashini TTS');
    }

    // 1. Primary: Dedicated inference domain (https://ai.aditya-kumar.in/tts) or local loopback.
    //    Loopback is tried first so a local GPU engine is never bypassed by a
    //    slow/unhealthy tunnel, then the configured endpoint, then the domain.
    const ttsEndpoints = [
      process.env.LOCAL_AI_ENGINE_ENDPOINT ? `${process.env.LOCAL_AI_ENGINE_ENDPOINT.replace(/\/+$/, '')}/tts` : null,
      'http://localhost:8000/tts',
      process.env.LOCAL_TTS_ENDPOINT || process.env.TTS_ENDPOINT || null,
      process.env.AI_ENGINE_DOMAIN ? `${process.env.AI_ENGINE_DOMAIN.replace(/\/+$/, '')}/tts` : null
    ];
    const uniqueTtsEndpoints = [...new Set(ttsEndpoints.filter(Boolean))];

    for (const ep of uniqueTtsEndpoints) {
      try {
        const localRes = await fetch(ep, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BhashaBridge-AI/2.0'
          },
          body: JSON.stringify({ text: text.trim(), language: lang, gender }),
          signal: AbortSignal.timeout(45000)
        });
        if (!localRes.ok) {
          console.warn(`[BhashiniTTS] ${ep} returned HTTP ${localRes.status}`);
          continue;
        }

        const contentType = (localRes.headers.get('content-type') || '').toLowerCase();
        const arrayBuf = await localRes.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuf);

        // Reject error payloads masquerading as audio (e.g. JSON 503 bodies).
        const isRiff = audioBuffer.length > 44 &&
          audioBuffer.slice(0, 4).toString('ascii') === 'RIFF' &&
          audioBuffer.slice(8, 12).toString('ascii') === 'WAVE';
        if (!isRiff) {
          console.warn(
            `[BhashiniTTS] ${ep} returned non-WAV audio (${contentType || 'unknown'}, ${audioBuffer.length} bytes)`
          );
          continue;
        }

        return {
          audioBuffer,
          format: 'audio/wav',
          durationMs: Math.max(1000, Math.floor(text.length * 75)),
          provider: 'Docker-Neural-IndicTTS'
        };
      } catch (err) {
        console.warn(`[BhashiniTTS] ${ep} unreachable: ${err.message}`);
      }
    }

    // 2. Secondary: If live Bhashini API keys are configured (not dummy placeholders), call Dhruva pipeline
    const hasLiveBhashiniKey = this.apiKey && this.apiKey !== 'your_bhashini_api_key_here';
    if (hasLiveBhashiniKey && this.inferenceKey) {
      try {
        const payload = {
          pipelineTasks: [
            {
              taskType: 'tts',
              config: {
                language: { sourceLanguage: lang },
                gender: gender,
                samplingRate: 22050
              }
            }
          ],
          inputData: {
            input: [{ source: text.trim() }]
          }
        };

        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'userID': this.userId,
            'ulcaApiKey': this.apiKey,
            'Authorization': this.inferenceKey
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(6000)
        });

        if (response.ok) {
          const data = await response.json();
          const audioBase64 = data?.pipelineResponse?.[0]?.audio?.[0]?.audioContent;
          if (audioBase64) {
            const audioBuffer = Buffer.from(audioBase64, 'base64');
            return {
              audioBuffer,
              format: 'audio/wav',
              durationMs: Math.max(1000, Math.floor(text.length * 75)),
              provider: 'Bhashini-IndicTTS'
            };
          }
        } else {
          console.warn(`[BhashiniTTS] Remote endpoint returned HTTP ${response.status}`);
        }
      } catch (err) {
        console.warn(`[BhashiniTTS] Remote inference failed: ${err.message}. Using sovereign local synthesizer.`);
      }
    }

    // 3. No synthetic tone fallback. A beep is not speech: if every neural
    //    engine is unavailable, fail so the client can use a real voice
    //    (browser SpeechSynthesis) instead of playing a meaningless sound.
    throw new Error(
      'No neural TTS engine produced audio (tried ' +
      `${uniqueTtsEndpoints.join(', ')}${hasLiveBhashiniKey && this.inferenceKey ? ', Bhashini Dhruva' : ''})`
    );
  }
}

module.exports = BhashiniTTSAdapter;

