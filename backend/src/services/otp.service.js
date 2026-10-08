const crypto = require('crypto');
const { createClient } = require('redis');

let redisClient = null;
const initRedis = async () => {
  if (redisClient) return redisClient;
  if (!process.env.VALKEY_URL) return null;
  try {
    const client = createClient({ url: process.env.VALKEY_URL });
    client.on('error', (err) => console.log('Valkey OTP Error:', err.message));
    await client.connect();
    redisClient = client;
    return client;
  } catch (err) {
    console.error('Failed to connect to Valkey in OTP service:', err.message);
    return null;
  }
};

// In-memory fallback map: email -> { otp, expiresAt, attempts, lastSentAt }
const memoryStore = new Map();

// Helper to clean expired memory entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of memoryStore.entries()) {
    if (data.expiresAt < now) {
      memoryStore.delete(email);
    }
  }
}, 5 * 60 * 1000);

const OTP_TTL_SECONDS = 600; // 10 minutes
const RATE_LIMIT_SECONDS = 60; // 60 seconds cooldown between send requests
const MAX_ATTEMPTS = 5;

const generateOtp = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const checkRateLimit = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();
  const redis = await initRedis();

  if (redis) {
    try {
      const lastSent = await redis.get(`otp_ratelimit:${normalizedEmail}`);
      if (lastSent) {
        const elapsed = Math.floor((now - parseInt(lastSent, 10)) / 1000);
        if (elapsed < RATE_LIMIT_SECONDS) {
          return { allowed: false, remainingSeconds: RATE_LIMIT_SECONDS - elapsed };
        }
      }
    } catch (err) {
      console.warn('Redis rate limit check error:', err.message);
    }
  }

  // Fallback to memoryStore
  const memData = memoryStore.get(normalizedEmail);
  if (memData && memData.lastSentAt) {
    const elapsed = Math.floor((now - memData.lastSentAt) / 1000);
    if (elapsed < RATE_LIMIT_SECONDS) {
      return { allowed: false, remainingSeconds: RATE_LIMIT_SECONDS - elapsed };
    }
  }

  return { allowed: true };
};

const saveOtp = async (email, otp) => {
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();
  const expiresAt = now + OTP_TTL_SECONDS * 1000;

  const data = {
    otp,
    expiresAt,
    attempts: 0,
    lastSentAt: now
  };

  const redis = await initRedis();
  if (redis) {
    try {
      await redis.setEx(`otp:${normalizedEmail}`, OTP_TTL_SECONDS, JSON.stringify(data));
      await redis.setEx(`otp_ratelimit:${normalizedEmail}`, RATE_LIMIT_SECONDS, now.toString());
    } catch (err) {
      console.warn('Redis saveOtp error:', err.message);
    }
  }

  // Always keep in memory store as fallback
  memoryStore.set(normalizedEmail, data);
};

const verifyOtp = async (email, inputOtp) => {
  const normalizedEmail = email.trim().toLowerCase();
  const cleanInputOtp = String(inputOtp || '').trim();
  const now = Date.now();

  const redis = await initRedis();
  let data = null;

  if (redis) {
    try {
      const raw = await redis.get(`otp:${normalizedEmail}`);
      if (raw) data = JSON.parse(raw);
    } catch (err) {
      console.warn('Redis verifyOtp get error:', err.message);
    }
  }

  if (!data) {
    data = memoryStore.get(normalizedEmail);
  }

  if (!data) {
    return { valid: false, error: 'Verification code not found or has expired. Please request a new code.' };
  }

  if (data.expiresAt < now) {
    await deleteOtp(normalizedEmail);
    return { valid: false, error: 'Verification code has expired. Please request a new code.' };
  }

  if (data.attempts >= MAX_ATTEMPTS) {
    await deleteOtp(normalizedEmail);
    return { valid: false, error: 'Too many incorrect attempts. Please request a new verification code.' };
  }

  if (data.otp !== cleanInputOtp) {
    data.attempts = (data.attempts || 0) + 1;
    // update attempt count in storage
    if (redis) {
      try {
        const ttl = Math.max(1, Math.floor((data.expiresAt - now) / 1000));
        await redis.setEx(`otp:${normalizedEmail}`, ttl, JSON.stringify(data));
      } catch (e) {}
    }
    memoryStore.set(normalizedEmail, data);
    const remaining = MAX_ATTEMPTS - data.attempts;
    return {
      valid: false,
      error: `Invalid verification code. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : 'Code locked.'}`
    };
  }

  // Valid! Delete OTP to prevent reuse
  await deleteOtp(normalizedEmail);
  return { valid: true };
};

const deleteOtp = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const redis = await initRedis();
  if (redis) {
    try {
      await redis.del(`otp:${normalizedEmail}`);
    } catch (err) {}
  }
  memoryStore.delete(normalizedEmail);
};

module.exports = {
  generateOtp,
  checkRateLimit,
  saveOtp,
  verifyOtp,
  deleteOtp
};

