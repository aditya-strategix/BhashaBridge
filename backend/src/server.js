// Environment must be loaded before any module that reads process.env at
// import time (auth controller, email/Resend, SFU/AI clients).
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const http = require('http');
const app = require('./app');
const setupSocket = require('./socket');
const prisma = require('./prisma');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Initialize Socket.IO
const io = setupSocket(server);

// Make prisma available globally if needed, or pass it
global.prisma = prisma;
global.io = io;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('error', (err) => {
  console.error('[Backend] HTTP server error:', err);
  if (err.code === 'EADDRINUSE') process.exit(1);
});

// Graceful shutdown: close Socket.IO upgrades, HTTP connections and Prisma.
function shutdown(signal) {
  console.log(`[Backend] ${signal} received, shutting down...`);
  const forceExit = setTimeout(() => process.exit(1), 10000);
  if (typeof forceExit.unref === 'function') forceExit.unref();

  let closed = false;
  const finish = async () => {
    if (closed) return;
    closed = true;
    clearTimeout(forceExit);
    try { await prisma.$disconnect(); } catch (_) {}
    process.exit(0);
  };

  try { io.close(); } catch (_) {}
  server.close(finish);
  if (typeof server.closeAllConnections === 'function') {
    const t = setTimeout(() => { try { server.closeAllConnections(); } catch (_) {} }, 5000);
    if (typeof t.unref === 'function') t.unref();
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
