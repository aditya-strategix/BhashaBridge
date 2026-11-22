const express = require('express');
const cors = require('cors');
const aiRoutes = require('./routes/ai.routes');
const { registry } = require('./avro');

const app = express();

app.use(cors());

// Support both pure binary Avro octet-streams and standard JSON
app.use(express.raw({
  type: ['application/avro', 'application/octet-stream'],
  limit: '50mb'
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health and Telemetry Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'BhashaBridge AI Microservice',
    timestamp: new Date().toISOString(),
    avroRegistry: {
      activeSchemas: registry.listSchemas().length,
      schemas: registry.listSchemas().map(s => s.name)
    },
    adapters: {
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      indicTrans2Configured: Boolean(process.env.INDICTRANS2_ENDPOINT || process.env.HF_TOKEN),
      whisperConfigured: Boolean(process.env.WHISPER_ENDPOINT || process.env.OPENAI_WHISPER_API_KEY),
      bhashiniConfigured: Boolean(process.env.BHASHINI_ENDPOINT || process.env.BHASHINI_API_KEY || true)
    }
  });
});

// AI Routes
app.use('/api/v1/ai', aiRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[AIService Error]', err.stack);
  res.status(500).json({ error: err.message || 'Internal AI Service Error' });
});

module.exports = app;

