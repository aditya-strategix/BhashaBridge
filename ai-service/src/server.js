const dotenv = require('dotenv');
const path = require('path');

// Try loading local .env, or fallback to backend .env
dotenv.config({ path: path.join(__dirname, '../.env') });
if (!process.env.GEMINI_API_KEY) {
  dotenv.config({ path: path.join(__dirname, '../../backend/.env') });
}

const app = require('./app');
const { registry } = require('./avro');

const PORT = process.env.AI_SERVICE_PORT || 5001;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(70));
  console.log(` BHASHABRIDGE AI MICROSERVICE (DECOUPLED COGNITIVE POOL)`);
  console.log(` Running on port: ${PORT}`);
  console.log(` Apache Avro Registry loaded: ${registry.listSchemas().length} active schemas`);
  console.log(` Pillar 3 Avro contracts: CaptionStreamEvent, TranslatedCaptionEvent, AudioTapEvent`);
  console.log(` Pillar 5 Adapters: Gemini, IndicTrans2, Whisper STT, Bhashini Indic-TTS`);
  console.log('='.repeat(70));
});

module.exports = server;

