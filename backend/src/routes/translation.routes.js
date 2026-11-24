const express = require('express');
const router = express.Router();
const aiClient = require('../clients/ai.client');

/**
 * Sovereign AI Translation Route
 * Routes batch or single-string translations to decoupled ai-service / IndicTrans2
 */
router.post('/', async (req, res) => {
  try {
    const { text, sourceLanguage = 'en', targetLanguages = ['hi'] } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }

    const translations = await aiClient.translate(text, sourceLanguage, targetLanguages);
    return res.status(200).json({
      originalText: text,
      sourceLanguage,
      translations
    });
  } catch (err) {
    console.error('[Translation Route] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Translation service failed' });
  }
});

module.exports = router;
