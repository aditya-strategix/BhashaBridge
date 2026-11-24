const ISTTProvider = require('./base.adapter');

/**
 * BhashiniSTTAdapter
 * Implements National Language Translation Mission (Bhashini) ASR (Speech Recognition).
 * Developed by AI4Bharat / IIT Madras & MeitY (Government of India).
 * Transcribes audio for all 22 scheduled Indian languages.
 */
class BhashiniSTTAdapter extends ISTTProvider {
  constructor(options = {}) {
    super('BhashiniSTT');
    this.endpoint = options.endpoint || process.env.BHASHINI_ENDPOINT || 'https://dhruva-api.bhashini.gov.in/services/inference/pipeline';
    this.userId = options.userId || process.env.BHASHINI_USER_ID || '';
    this.apiKey = options.apiKey || process.env.BHASHINI_API_KEY || '';
    this.inferenceKey = options.inferenceKey || process.env.BHASHINI_INFERENCE_KEY || '';
  }

  isAvailable() {
    return Boolean(this.apiKey || this.inferenceKey);
  }

  async transcribe(audioBuffer, options = {}) {
    const lang = (options.language || 'hi').toLowerCase().slice(0, 2);
    const sampleRate = options.sampleRate || 48000;

    if (this.apiKey && this.inferenceKey && audioBuffer && audioBuffer.length > 0) {
      try {
        const base64Audio = audioBuffer.toString('base64');
        const payload = {
          pipelineTasks: [
            {
              taskType: 'asr',
              config: {
                language: { sourceLanguage: lang },
                audioFormat: 'wav',
                samplingRate: sampleRate
              }
            }
          ],
          inputData: {
            audio: [{ audioContent: base64Audio }]
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
          const transcript = data?.pipelineResponse?.[0]?.output?.[0]?.source;
          if (transcript) {
            return {
              text: transcript,
              confidence: 0.96,
              language: lang,
              provider: 'Bhashini-ASR'
            };
          }
        }
      } catch (err) {
        console.warn(`[BhashiniSTT] Remote inference error: ${err.message}`);
      }
    }

    // Return empty string for silence or unconfigured fallback
    return {
      text: '',
      confidence: 0.0,
      language: lang,
      provider: 'Bhashini-Sovereign-STT'
    };
  }
}

module.exports = BhashiniSTTAdapter;

