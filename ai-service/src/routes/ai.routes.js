const express = require('express');
const router = express.Router();
const SummarizationService = require('../services/summarization.service');
const TranslationService = require('../services/translation.service');
const CaptionProcessorService = require('../services/caption-processor.service');
const AudioTapService = require('../services/audio-tap.service');
const { defaultTTS } = require('../adapters/tts');
const { registry } = require('../avro');

// Content-Type may carry parameters (e.g. "application/avro; charset=utf-8")
const isAvroRequest = (req) => {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  return contentType.startsWith('application/avro')
    || contentType.startsWith('application/octet-stream');
};

// 1. Meeting Summarization (Dual-Protocol: JSON or Apache Avro Binary)
router.post('/summary', async (req, res) => {
  try {
    const isAvro = isAvroRequest(req);

    if (isAvro && Buffer.isBuffer(req.body)) {
      const { payload, buffer } = await SummarizationService.processAvroRequest(req.body);
      res.setHeader('Content-Type', 'application/avro');
      res.setHeader('X-Avro-Schema', 'SummaryResponseEvent');
      return res.status(200).send(buffer);
    }

    // Standard JSON Payload
    const { transcriptText, targetLanguage, meetingId, preferredModel } = req.body || {};
    if (!transcriptText || !transcriptText.trim()) {
      return res.status(400).json({ error: 'transcriptText is required and cannot be empty' });
    }

    const result = await SummarizationService.summarize(transcriptText, targetLanguage || 'en', {
      preferredModel
    });

    return res.status(200).json({
      meetingId: meetingId || null,
      summary: result.summary,
      provider: result.provider,
      model: result.model,
      targetLanguage: result.targetLanguage,
      processingLatencyMs: result.latencyMs,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error('[AIService] /summary error:', err);
    res.status(500).json({ error: err.message || 'Internal AI summarization error' });
  }
});

// 2. Multilingual Batch Translation
router.post('/translate', async (req, res) => {
  try {
    const { text, sourceLanguage = 'en', targetLanguages = ['en'] } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }

    const t0 = Date.now();
    const translations = await TranslationService.translate(text, sourceLanguage, targetLanguages);
    const latencyMs = Date.now() - t0;

    res.status(200).json({
      originalText: text,
      sourceLanguage,
      translations,
      processingLatencyMs: latencyMs
    });
  } catch (err) {
    console.error('[AIService] /translate error:', err);
    res.status(500).json({ error: err.message || 'Internal AI translation error' });
  }
});

// 3. High-Throughput Live Caption Stream (Avro Binary Pipeline)
router.post('/caption/stream', async (req, res) => {
  try {
    const isAvro = isAvroRequest(req);
    const targetLangsHeader = req.headers['x-target-languages'] || '';
    const targetLangs = targetLangsHeader.split(',').map(s => s.trim()).filter(Boolean);

    if (isAvro && Buffer.isBuffer(req.body)) {
      const { event, avroBuffer } = await CaptionProcessorService.processAvroStream(req.body, targetLangs);
      res.setHeader('Content-Type', 'application/avro');
      res.setHeader('X-Avro-Schema', 'TranslatedCaptionEvent');
      return res.status(200).send(avroBuffer);
    }

    // JSON fallback
    const { captionEvent, targetLanguages = [] } = req.body || {};
    const effectiveLangs = targetLanguages.length > 0 ? targetLanguages : targetLangs;
    const { event, avroBuffer } = await CaptionProcessorService.processCaption(captionEvent, effectiveLangs);

    res.status(200).json({
      translatedEvent: event,
      avroBase64: avroBuffer.toString('base64')
    });
  } catch (err) {
    console.error('[AIService] /caption/stream error:', err);
    res.status(500).json({ error: err.message || 'Caption stream processing error' });
  }
});

// 4. Mediasoup SFU Audio Tap Ingress (Opus/PCM -> STT)
router.post('/audio/tap', async (req, res) => {
  try {
    const isAvro = isAvroRequest(req);

    if (isAvro && Buffer.isBuffer(req.body)) {
      const { captionEvent, avroBuffer } = await AudioTapService.processAvroAudioTap(req.body);
      res.setHeader('Content-Type', 'application/avro');
      res.setHeader('X-Avro-Schema', 'CaptionStreamEvent');
      return res.status(200).send(avroBuffer);
    }

    const { audioTapEvent } = req.body || {};
    const { captionEvent, avroBuffer } = await AudioTapService.processAudioTap(audioTapEvent);
    res.status(200).json({
      captionEvent,
      avroBase64: avroBuffer.toString('base64')
    });
  } catch (err) {
    console.error('[AIService] /audio/tap error:', err);
    res.status(500).json({ error: err.message || 'Audio tap processing error' });
  }
});

// 5. Sovereign Bhashini Text-to-Speech (TTS)
router.post('/tts', async (req, res) => {
  try {
    const { text, language = 'hi', gender = 'female' } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required and cannot be empty' });
    }

    const { audioBuffer, format, durationMs, provider } = await defaultTTS.synthesize(text, {
      language,
      gender
    });

    res.set({
      'Content-Type': format || 'audio/wav',
      'Content-Length': audioBuffer.length,
      'X-TTS-Provider': provider || 'BhashiniTTS',
      'X-Audio-Duration-Ms': String(durationMs || 1000)
    });
    return res.status(200).send(audioBuffer);
  } catch (err) {
    console.error('[AIService] /tts error:', err);
    res.status(500).json({ error: err.message || 'Bhashini TTS synthesis error' });
  }
});

router.get('/tts', async (req, res) => {
  try {
    const { text, lang = 'hi', gender = 'female' } = req.query || {};
    if (!text || !text.trim()) {
      return res.status(400).send('text query parameter is required');
    }

    const { audioBuffer, format, provider } = await defaultTTS.synthesize(text, {
      language: lang,
      gender
    });

    res.set({
      'Content-Type': format || 'audio/wav',
      'Content-Length': audioBuffer.length,
      'X-TTS-Provider': provider || 'BhashiniTTS',
      'Cache-Control': 'public, max-age=3600'
    });
    return res.status(200).send(audioBuffer);
  } catch (err) {
    console.error('[AIService] GET /tts error:', err);
    res.status(500).send('Bhashini TTS synthesis error');
  }
});

// 6. Schema Registry Endpoints (Inspect registered .avsc contracts)
router.get('/schemas', (req, res) => {
  res.status(200).json({
    registry: 'BhashaBridge Apache Avro Schema Registry',
    version: '1.0.0',
    totalSchemas: registry.listSchemas().length,
    schemas: registry.listSchemas()
  });
});

router.get('/schemas/:name', (req, res) => {
  const schema = registry.getSchema(req.params.name);
  if (!schema) {
    return res.status(404).json({ error: `Schema "${req.params.name}" not found in registry` });
  }
  res.status(200).json(schema);
});

module.exports = router;

