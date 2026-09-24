const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const { text, lang } = req.query;
  if (!text || !lang) {
    return res.status(400).send('Missing text or lang parameter');
  }

  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
    console.log('Fetching:', url);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Google TTS returned ' + response.status);
    }

    res.set({
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked'
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (error) {
    console.error('TTS Proxy Error:', error);
    res.status(500).send('Failed to fetch audio');
  }
});

module.exports = router;