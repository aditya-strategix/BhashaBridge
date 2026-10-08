const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const meetingRoutes = require('./routes/meeting.routes');
const organizationRoutes = require('./routes/organization.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const ttsRoutes = require('./routes/tts.routes');
// const translationRoutes = require('./routes/translation.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/health', (req, res) => res.status(200).send('OK'));

const sseClients = new Set();
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  
  const client = { res };
  sseClients.add(client);
  console.log(`[SSE] Client connected. Total clients: ${sseClients.size}`);

  // Send initial connected comment
  res.write(': connected\n\n');
  
  req.on('close', () => {
    sseClients.delete(client);
    console.log(`[SSE] Client disconnected. Total clients: ${sseClients.size}`);
  });
});

// Periodic ping to keep SSE connections alive
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.res.write(': ping\n\n');
    } catch (e) {
      sseClients.delete(client);
    }
  }
}, 25000);

global.sseEmit = (event, data = {}) => {
  console.log(`[SSE] Broadcasting "${event}" to ${sseClients.size} client(s)`);
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
};

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/tts', ttsRoutes);
// app.use('/api/translate', translationRoutes);
app.use('/api/admin', adminRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

module.exports = app;
