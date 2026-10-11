const dotenv = require('dotenv');
dotenv.config();

const { performance } = require('perf_hooks');
const { createClient } = require('redis');
const { io } = require('socket.io-client');
const prisma = require('../src/prisma');
const AIService = require('../src/services/ai.service');
const TranslationService = require('../src/services/translation.service');

// Utility to calculate percentile
function calculatePercentile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

// Compute comprehensive statistics
function computeStats(samples) {
  if (!samples.length) return { min: 0, max: 0, mean: 0, p50: 0, p90: 0, p95: 0 };
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const sum = samples.reduce((acc, v) => acc + v, 0);
  const mean = sum / samples.length;
  const p50 = calculatePercentile(samples, 50);
  const p90 = calculatePercentile(samples, 90);
  const p95 = calculatePercentile(samples, 95);
  return {
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    mean: Number(mean.toFixed(2)),
    p50: Number(p50.toFixed(2)),
    p90: Number(p90.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    samplesCount: samples.length
  };
}

async function runBenchmark() {
  console.log('='.repeat(80));
  console.log(' BHASHABRIDGE EMPIRICAL LATENCY BENCHMARK SUITE');
  console.log(' Measuring Actual Performance Metrics Across Comparable States');
  console.log('='.repeat(80));

  // Initialize Redis
  console.log('\n[Setup] Connecting to Valkey/Redis instance...');
  const redisClient = createClient({ url: process.env.VALKEY_URL });
  await redisClient.connect();
  console.log('[Setup] Redis connected successfully.');

  // Verify PostgreSQL
  console.log('[Setup] Verifying PostgreSQL connection...');
  const testMeeting = await prisma.meeting.findFirst({
    select: { id: true, meetingLink: true, title: true }
  });
  console.log(`[Setup] PostgreSQL active. Target meeting ID: ${testMeeting?.id || 'N/A'}`);

  const results = {};

  // =========================================================================
  // BENCHMARK 1: AI Summary Generation - Cold Gemini LLM vs Warm Redis Cache
  // =========================================================================
  console.log('\n' + '-'.repeat(80));
  console.log('BENCHMARK 1: Meeting Synthesis Plane');
  console.log('Comparable States: Cold Gemini 3.8 Flash API vs. Warm Valkey/Redis Cache');
  console.log('-'.repeat(80));

  const sampleTranscript = `
Speaker 1 (Host): Good morning team. Today we need to finalize the WebRTC video routing architecture and multi-language translation pipeline.
Speaker 2 (Engineer): I have already integrated the Google Translate API for live captions, but we should verify the Redis caching layer to avoid redundant API hits.
Speaker 1 (Host): Agreed. Let's make sure meeting summaries are saved to Valkey with a 24-hour TTL, so repeat views load in milliseconds.
Speaker 3 (DevOps): The PostgreSQL connection pooling is stable on Supabase with PgBouncer. We are ready for load testing.
Speaker 1 (Host): Action item for Speaker 2: benchmark the latency between cold LLM calls and warm Redis hits. Meeting adjourned.
`.trim();

  // 1A. Cold Gemini LLM (3 iterations to stay within rate limits while getting true averages)
  const geminiLatencies = [];
  let generatedSummary = '';
  console.log('[1A] Measuring Cold AI Summaries via Google Gemini (3 iterations)...');
  for (let i = 1; i <= 3; i++) {
    const t0 = performance.now();
    try {
      const summary = await AIService.summarizeTranscript(sampleTranscript, 'en');
      const t1 = performance.now();
      const elapsed = t1 - t0;
      geminiLatencies.push(elapsed);
      generatedSummary = summary;
      console.log(`  -> Iteration ${i}: ${elapsed.toFixed(2)} ms`);
    } catch (err) {
      console.error(`  -> Iteration ${i} failed:`, err.message);
    }
  }

  // Pre-populate Redis Cache with the generated summary
  const benchmarkCacheKey = `benchmark:meeting:summary:${Date.now()}`;
  await redisClient.setEx(benchmarkCacheKey, 3600, generatedSummary || 'Fallback Summary');

  // 1B. Warm Redis Cache Hits (10 iterations)
  console.log('\n[1B] Measuring Warm Valkey/Redis Cache Retrieval (10 iterations)...');
  const redisSummaryLatencies = [];
  for (let i = 1; i <= 10; i++) {
    const t0 = performance.now();
    const cached = await redisClient.get(benchmarkCacheKey);
    const t1 = performance.now();
    const elapsed = t1 - t0;
    redisSummaryLatencies.push(elapsed);
    console.log(`  -> Iteration ${i}: ${elapsed.toFixed(2)} ms (Bytes retrieved: ${cached?.length || 0})`);
  }

  const geminiStats = computeStats(geminiLatencies);
  const redisSummaryStats = computeStats(redisSummaryLatencies);
  const summarySpeedup = (geminiStats.mean / redisSummaryStats.mean).toFixed(1);
  const summaryReduction = (((geminiStats.mean - redisSummaryStats.mean) / geminiStats.mean) * 100).toFixed(1);

  results.summary = {
    coldGemini: geminiStats,
    warmRedis: redisSummaryStats,
    speedup: `${summarySpeedup}x`,
    reductionPercent: `${summaryReduction}%`
  };

  // =========================================================================
  // BENCHMARK 2: Persistence Layer - PostgreSQL Query vs. Redis Key-Value Store
  // =========================================================================
  console.log('\n' + '-'.repeat(80));
  console.log('BENCHMARK 2: Data Retrieval Layer');
  console.log('Comparable States: PostgreSQL Query (Prisma ORM) vs. Redis Key-Value Lookup');
  console.log('-'.repeat(80));

  // 2A. PostgreSQL Query (10 iterations)
  console.log('[2A] Measuring PostgreSQL Prisma Queries (10 iterations)...');
  const postgresLatencies = [];
  for (let i = 1; i <= 10; i++) {
    const t0 = performance.now();
    await prisma.meeting.findFirst({
      where: { id: testMeeting.id },
      include: { organization: true, participants: true }
    });
    const t1 = performance.now();
    const elapsed = t1 - t0;
    postgresLatencies.push(elapsed);
    console.log(`  -> Iteration ${i}: ${elapsed.toFixed(2)} ms`);
  }

  // 2B. Redis Cached Meeting Payload Lookup (10 iterations)
  const meetingCacheKey = `benchmark:meeting:meta:${testMeeting.id}`;
  await redisClient.setEx(meetingCacheKey, 3600, JSON.stringify(testMeeting));

  console.log('\n[2B] Measuring Redis Key-Value Lookups (10 iterations)...');
  const redisMetaLatencies = [];
  for (let i = 1; i <= 10; i++) {
    const t0 = performance.now();
    await redisClient.get(meetingCacheKey);
    const t1 = performance.now();
    const elapsed = t1 - t0;
    redisMetaLatencies.push(elapsed);
    console.log(`  -> Iteration ${i}: ${elapsed.toFixed(2)} ms`);
  }

  const postgresStats = computeStats(postgresLatencies);
  const redisMetaStats = computeStats(redisMetaLatencies);
  const dbSpeedup = (postgresStats.mean / redisMetaStats.mean).toFixed(1);
  const dbReduction = (((postgresStats.mean - redisMetaStats.mean) / postgresStats.mean) * 100).toFixed(1);

  results.database = {
    postgresPrisma: postgresStats,
    redisKv: redisMetaStats,
    speedup: `${dbSpeedup}x`,
    reductionPercent: `${dbReduction}%`
  };

  // =========================================================================
  // BENCHMARK 3: Multilingual Translation Pipeline
  // Comparable States: Active Translation (EN -> HI & ES) vs Identity Pass-through (EN -> EN)
  // =========================================================================
  console.log('\n' + '-'.repeat(80));
  console.log('BENCHMARK 3: Live Multilingual Speech Caption Pipeline');
  console.log('Comparable States: Active Multi-language Translation vs. Identity Pass-Through');
  console.log('-'.repeat(80));

  const captionText = 'Welcome everyone to the BhashaBridge real-time synchronized conference.';

  // 3A. Active Translation (EN -> HI and ES) (5 iterations)
  console.log('[3A] Measuring Active Speech Translation (EN -> HI & ES) (5 iterations)...');
  const activeTranslationLatencies = [];
  for (let i = 1; i <= 5; i++) {
    const t0 = performance.now();
    await TranslationService.translate(captionText, 'en', ['hi', 'es']);
    const t1 = performance.now();
    const elapsed = t1 - t0;
    activeTranslationLatencies.push(elapsed);
    console.log(`  -> Iteration ${i}: ${elapsed.toFixed(2)} ms`);
  }

  // 3B. Identity Pass-Through (EN -> EN) (10 iterations)
  console.log('\n[3B] Measuring Identity Pass-Through / Zero-Overhead Routing (10 iterations)...');
  const identityLatencies = [];
  for (let i = 1; i <= 10; i++) {
    const t0 = performance.now();
    await TranslationService.translate(captionText, 'en', ['en']);
    const t1 = performance.now();
    const elapsed = t1 - t0;
    identityLatencies.push(elapsed);
    console.log(`  -> Iteration ${i}: ${elapsed.toFixed(2)} ms`);
  }

  const activeTransStats = computeStats(activeTranslationLatencies);
  const identityStats = computeStats(identityLatencies);
  const transSpeedup = (activeTransStats.mean / (identityStats.mean || 0.01)).toFixed(1);

  results.translation = {
    activeTranslation: activeTransStats,
    identityPassThrough: identityStats,
    speedup: `${transSpeedup}x`
  };

  // =========================================================================
  // BENCHMARK 4: Real-Time Signaling Plane (Socket.IO over WebSocket)
  // Comparable States: WebRTC Audio/Video Signaling Round-Trip Time (RTT)
  // =========================================================================
  console.log('\n' + '-'.repeat(80));
  console.log('BENCHMARK 4: Real-Time Signaling Plane');
  console.log('Event Loop & WebSocket Relay: Audio/Video Signaling Packet Round-Trip Time');
  console.log('-'.repeat(80));

  const socketLatencies = await new Promise((resolve) => {
    const clientSocket = io('http://localhost:5000', {
      transports: ['websocket'],
      forceNew: true
    });

    const lats = [];
    let currentIteration = 0;
    const maxIterations = 15;

    clientSocket.on('connect', () => {
      console.log(`[4] Socket connected with ID: ${clientSocket.id}. Beginning 15 signaling RTT cycles...`);
      sendPing();
    });

    let pingStartTime = 0;
    function sendPing() {
      currentIteration++;
      if (currentIteration > maxIterations) {
        clientSocket.disconnect();
        resolve(lats);
        return;
      }
      pingStartTime = performance.now();
      clientSocket.emit('audio:signal', {
        targetSocketId: clientSocket.id,
        signal: { type: 'offer', sdp: 'v=0\r\no=- 461173 2 IN IP4 127.0.0.1' },
        name: 'Benchmark-Tester',
        role: 'HOST'
      });
    }

    clientSocket.on('audio:signal', () => {
      const elapsed = performance.now() - pingStartTime;
      lats.push(elapsed);
      console.log(`  -> Signal RTT Iteration ${currentIteration}: ${elapsed.toFixed(2)} ms`);
      setTimeout(sendPing, 20); // Small interval between pings
    });

    clientSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      clientSocket.disconnect();
      resolve(lats);
    });
  });

  const signalingStats = computeStats(socketLatencies);
  results.signaling = {
    socketRtt: signalingStats
  };

  // Clean up Redis & Prisma
  await redisClient.del(benchmarkCacheKey);
  await redisClient.del(meetingCacheKey);
  await redisClient.quit();
  await prisma.$disconnect();

  // =========================================================================
  // SUMMARY REPORT GENERATION
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('                     FINAL EMPIRICAL LATENCY BENCHMARK RESULTS');
  console.log('='.repeat(80));

  console.log(`
+-----------------------------------------------------------------------------------------------------+
| Domain / Pipeline                | State A (Baseline/Cold) | State B (Optimized/Warm)| Speedup / Ratio|
+-----------------------------------------------------------------------------------------------------+
| 1. AI Meeting Synthesis (Summary)| Cold Gemini: ${results.summary.coldGemini.mean.toFixed(1)} ms | Warm Redis: ${results.summary.warmRedis.mean.toFixed(1)} ms  | ${results.summary.speedup} (${results.summary.reductionPercent} faster) |
|    - P50 (Median)                | Cold: ${results.summary.coldGemini.p50.toFixed(1)} ms        | Warm: ${results.summary.warmRedis.p50.toFixed(1)} ms        | -              |
|    - P90                         | Cold: ${results.summary.coldGemini.p90.toFixed(1)} ms        | Warm: ${results.summary.warmRedis.p90.toFixed(1)} ms        | -              |
+-----------------------------------------------------------------------------------------------------+
| 2. Persistence / Read Path       | PostgreSQL: ${results.database.postgresPrisma.mean.toFixed(1)} ms  | Redis Cache: ${results.database.redisKv.mean.toFixed(1)} ms  | ${results.database.speedup} (${results.database.reductionPercent} faster)|
|    - P50 (Median)                | Postgres: ${results.database.postgresPrisma.p50.toFixed(1)} ms    | Redis: ${results.database.redisKv.p50.toFixed(1)} ms        | -              |
|    - P90                         | Postgres: ${results.database.postgresPrisma.p90.toFixed(1)} ms    | Redis: ${results.database.redisKv.p90.toFixed(1)} ms        | -              |
+-----------------------------------------------------------------------------------------------------+
| 3. Speech Translation Pipeline   | Dynamic (HI+ES): ${results.translation.activeTranslation.mean.toFixed(1)}ms| Identity Pass: ${results.translation.identityPassThrough.mean.toFixed(1)}ms | ${results.translation.speedup} bypass gain  |
|    - P50 (Median)                | Active: ${results.translation.activeTranslation.p50.toFixed(1)} ms   | Identity: ${results.translation.identityPassThrough.p50.toFixed(1)} ms    | -              |
+-----------------------------------------------------------------------------------------------------+
| 4. WebSocket Signaling Plane     | Relay RTT: Mean ${results.signaling.socketRtt.mean.toFixed(2)} ms (P50: ${results.signaling.socketRtt.p50.toFixed(2)} ms, P95: ${results.signaling.socketRtt.p95.toFixed(2)} ms, Min: ${results.signaling.socketRtt.min.toFixed(2)} ms)|
+-----------------------------------------------------------------------------------------------------+
`);

  // Write JSON to disk
  const fs = require('fs');
  const path = require('path');
  const jsonPath = path.join(__dirname, 'benchmark-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`[Results] Raw benchmark metrics saved to: ${jsonPath}`);
  console.log('='.repeat(80));

  return results;
}

runBenchmark().catch((err) => {
  console.error('Benchmark execution error:', err);
  process.exit(1);
});

