const express = require('express');
const router = express.Router();
const aiClient = require('../clients/ai.client');

/**
 * Sovereign Bhashini TTS Route
 * Replaces all legacy Google TTS scraping endpoints with National Language Translation Mission (Bhashini)
 * and Indic-TTS voice synthesis.
 */
router.get('/', async (req, res) => {
  const { text, lang } = req.query;
  console.log('[Bhashini TTS] Incoming synthesis request for lang:', lang, 'text:', text);

  if (!text || !lang) {
    return res.status(400).send('Missing text or lang parameter');
  }

  try {
    const cleanText = text.trim();
    const cleanLang = lang.trim().toLowerCase().slice(0, 2);

    const audioBuffer = await aiClient.synthesizeTTS(cleanText, cleanLang);

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': audioBuffer.length,
      'X-TTS-Engine': 'Bhashini-IndicTTS',
      'Cache-Control': 'public, max-age=3600'
    });

    res.send(audioBuffer);
  } catch (error) {
    console.error('[Bhashini TTS] Synthesis error:', error.message);
    res.status(500).send('Failed to synthesize Bhashini audio');
  }
});

module.exports = router;
