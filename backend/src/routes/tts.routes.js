const express = require('express');
const router = express.Router();

function splitTextIntoChunks(text, maxLength = 140) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  const sentences = text.match(/[^.!?,\n।]+[.!?,\n।]+|[^.!?,\n।]+$/g) || [text];
  let currentChunk = '';
  for (const part of sentences) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.length > maxLength) {
      const words = trimmed.split(/\s+/);
      for (const word of words) {
        if ((currentChunk + ' ' + word).trim().length > maxLength) {
          if (currentChunk.trim()) chunks.push(currentChunk.trim());
          currentChunk = word;
        } else {
          currentChunk = currentChunk ? `${currentChunk} ${word}` : word;
        }
      }
    } else {
      if ((currentChunk + ' ' + trimmed).trim().length > maxLength) {
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        currentChunk = trimmed;
      } else {
        currentChunk = currentChunk ? `${currentChunk} ${trimmed}` : trimmed;
      }
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks.length > 0 ? chunks : [text.slice(0, maxLength)];
}

router.get('/', async (req, res) => {
  const { text, lang } = req.query;
  console.log('[TTS PROXY] Incoming request for lang:', lang, 'text:', text);
  if (!text || !lang) {
    return res.status(400).send('Missing text or lang parameter');
  }

  try {
    const cleanText = text.trim();
    const chunks = splitTextIntoChunks(cleanText, 140);

    const buffers = await Promise.all(chunks.map(async (chunk) => {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${lang}&client=tw-ob`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/'
        }
      });
      if (!response.ok) {
        throw new Error(`Google TTS returned ${response.status} for chunk: ${chunk.slice(0, 20)}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }));

    const combinedBuffer = Buffer.concat(buffers);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': combinedBuffer.length,
      'Cache-Control': 'public, max-age=3600'
    });

    res.send(combinedBuffer);
  } catch (error) {
    console.error('TTS Proxy Error:', error);
    res.status(500).send('Failed to fetch audio');
  }
});

module.exports = router;