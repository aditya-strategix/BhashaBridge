const { PrismaClient } = require('@prisma/client');

let prisma;

if (!global.__prisma) {
  global.__prisma = new PrismaClient({
    log: ['error', 'warn'],
  });
}
prisma = global.__prisma;

/**
 * Executes a database operation with automatic retry on transient PgBouncer / Supabase
 * connection drops (P1017: Server has closed the connection, P1001: Can't reach database server,
 * P2024: Connection pool timeout).
 */
async function withDbRetry(fn, maxRetries = 3) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      return await fn(prisma);
    } catch (err) {
      attempts++;
      const isConnectionDrop =
        err.code === 'P1017' ||
        err.code === 'P1001' ||
        err.code === 'P2024' ||
        err.name === 'PrismaClientInitializationError' ||
        (err.message && (
          err.message.includes('Server has closed the connection') ||
          err.message.includes("Can't reach database server") ||
          err.message.includes('Timed out fetching a new connection') ||
          err.message.includes('ECONNRESET') ||
          err.message.includes('ConnectionReset') ||
          err.message.includes('Connection terminated') ||
          err.message.includes('forcibly closed')
        ));

      if (isConnectionDrop && attempts < maxRetries) {
        console.warn(`[Prisma] Transient connection error (${err.code || err.message}). Reconnecting and retrying (${attempts}/${maxRetries})...`);
        try {
          await prisma.$disconnect();
        } catch (_) {}
        await new Promise(r => setTimeout(r, 400 * attempts));
        continue;
      }
      throw err;
    }
  }
}

module.exports = prisma;
module.exports.withDbRetry = withDbRetry;
module.exports.prisma = prisma;
