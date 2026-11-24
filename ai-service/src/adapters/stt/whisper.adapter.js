const ISTTProvider = require('./base.adapter');

/**
 * WhisperAudioTapAdapter
 * Handles server-side audio tap transcription from Mediasoup SFU (Pillar 4 / Pillar 5).
 * Connects directly to the dedicated sovereign inference domain (https://ai.aditya-kumar.in).
 */
class WhisperAudioTapAdapter extends ISTTProvider {
  constructor(endpoint = process.env.WHISPER_ENDPOINT || process.env.AI_ENGINE_DOMAIN || 'https://ai.aditya-kumar.in') {
    super('FasterWhisperSTT');
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.fallbackEndpoint = (process.env.LOCAL_AI_ENGINE_ENDPOINT || 'http://localhost:8000').replace(/\/+$/, '');
  }

  isAvailable() {
    return Boolean(this.endpoint || this.fallbackEndpoint);
  }

  async transcribe(audioBuffer, options = {}) {
    const lang = options.language || 'auto';
    const sampleRate = options.sampleRate || 48000;

    if (!audioBuffer || audioBuffer.length === 0) {
      return { text: '', confidence: 0, language: lang === 'auto' ? 'hi' : lang };
    }

    // Prefer the local GPU engine; the public tunnel is only a backup.
    const endpointsToTry = [this.fallbackEndpoint, this.endpoint]
      .filter(Boolean)
      .filter((ep, i, arr) => arr.indexOf(ep) === i);

    for (const ep of endpointsToTry) {
      try {
        const formData = new FormData();
        const blob = new Blob([audioBuffer], { type: 'audio/wav' });
        formData.append('file', blob, 'audio.wav');
        if (lang && lang !== 'auto') {
          formData.append('language', lang.split('-')[0]);
        }

        const response = await fetch(`${ep}/v1/audio/transcriptions`, {
          method: 'POST',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BhashaBridge-AI/2.0'
          },
          body: formData,
          signal: AbortSignal.timeout(25000)
        });

        if (!response.ok) {
          console.warn(`[WhisperSTT] ${ep} returned HTTP ${response.status}`);
          continue;
        }

        const data = await response.json();
        const recognizedText = (data.text && data.text.trim()) ? data.text.trim() : '';
        return {
          text: recognizedText,
          confidence: typeof data.confidence === 'number' ? data.confidence : 0,
          language: data.language || (lang === 'auto' ? data.detected_language || 'hi' : lang),
          detected_language: data.detected_language || data.language || 'hi',
          latencyMs: typeof data.latency_ms === 'number' ? data.latency_ms : 0
        };
      } catch (err) {
        console.warn(`[WhisperSTT] Request to ${ep} failed: ${err.message}`);
      }
    }

    // No engine produced a transcript: report silence rather than fake data.
    return {
      text: '',
      confidence: 0,
      language: lang === 'auto' ? 'hi' : lang
    };
  }
}

module.exports = WhisperAudioTapAdapter;
