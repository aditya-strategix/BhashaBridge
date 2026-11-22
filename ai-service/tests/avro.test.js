const assert = require('assert');
const avro = require('../src/avro');

console.log('='.repeat(80));
console.log(' BHASHABRIDGE APACHE AVRO SPECIFICATION VERIFICATION SUITE');
console.log(' Testing Schema Contracts, Binary Framing, and Compression Metrics');
console.log('='.repeat(80));

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// 1. Schema Registry
it('Schema Registry loads all required production schemas from .avsc files', () => {
  const schemas = avro.registry.listSchemas();
  assert(schemas.length >= 7, `Expected at least 7 schemas, got ${schemas.length}`);
  const expectedNames = [
    'CaptionStreamEvent',
    'TranslatedCaptionEvent',
    'AudioTapEvent',
    'SummaryRequestEvent',
    'SummaryResponseEvent',
    'ChatMessageEvent',
    'RagContextEvent'
  ];
  for (const exp of expectedNames) {
    assert(avro.registry.hasSchema(exp), `Registry should have schema "${exp}"`);
    const fp = avro.registry.getFingerprint(exp);
    assert(Buffer.isBuffer(fp) && fp.length === 8, `Schema "${exp}" should have 8-byte fingerprint`);
  }
});

// 2. CaptionStreamEvent
it('Serializes and deserializes CaptionStreamEvent with zero data corruption', () => {
  const original = {
    eventId: 'evt_1001',
    meetingId: 'meet_delhi_telemed_123',
    speakerId: 'usr_doc_999',
    sourceLanguage: 'hi',
    transcriptText: 'रोगी को पिछले 3 दिनों से लगातार बुखार और खांसी है।',
    isFinal: true,
    confidenceScore: 0.985,
    timestamp: 1730364000123
  };

  const buffer = avro.serialize('CaptionStreamEvent', original);
  assert(Buffer.isBuffer(buffer), 'Serialization must produce a Buffer');

  const decoded = avro.deserialize('CaptionStreamEvent', buffer);
  assert.strictEqual(decoded.eventId, original.eventId);
  assert.strictEqual(decoded.meetingId, original.meetingId);
  assert.strictEqual(decoded.speakerId, original.speakerId);
  assert.strictEqual(decoded.sourceLanguage, original.sourceLanguage);
  assert.strictEqual(decoded.transcriptText, original.transcriptText);
  assert.strictEqual(decoded.isFinal, original.isFinal);
  assert(Math.abs(decoded.confidenceScore - original.confidenceScore) < 0.001);
  assert.strictEqual(decoded.timestamp, original.timestamp);
});

// 3. TranslatedCaptionEvent (Complex Map)
it('Serializes and deserializes TranslatedCaptionEvent containing dynamic translations map', () => {
  const original = {
    eventId: 'trans_2001',
    originalEventId: 'evt_1001',
    meetingId: 'meet_delhi_telemed_123',
    speakerId: 'usr_doc_999',
    translations: {
      en: 'The patient has had a continuous fever and cough for the last 3 days.',
      ta: 'நோயாளிக்கு கடந்த 3 நாட்களாக தொடர் காய்ச்சலும் இருமலும் உள்ளது.',
      te: 'రోగికి గత 3 రోజులుగా నిరంతర జ్వరం మరియు దగ్గు ఉంది.'
    },
    processingLatencyMs: 85,
    timestamp: 1730364000208
  };

  const buffer = avro.serialize('TranslatedCaptionEvent', original);
  const decoded = avro.deserialize('TranslatedCaptionEvent', buffer);

  assert.strictEqual(decoded.eventId, original.eventId);
  assert.strictEqual(decoded.translations.en, original.translations.en);
  assert.strictEqual(decoded.translations.ta, original.translations.ta);
  assert.strictEqual(decoded.translations.te, original.translations.te);
  assert.strictEqual(decoded.processingLatencyMs, original.processingLatencyMs);
});

// 4. AudioTapEvent (Raw Bytes)
it('Serializes and deserializes AudioTapEvent with raw Opus/PCM binary buffer', () => {
  const sampleAudio = Buffer.alloc(960); // 20ms of 48kHz 16-bit PCM audio
  for (let i = 0; i < sampleAudio.length; i++) sampleAudio[i] = i % 256;

  const original = {
    meetingId: 'meet_kiosk_bihar_001',
    participantId: 'usr_elderly_patient_77',
    sequenceNumber: 4209,
    audioData: sampleAudio,
    sampleRate: 48000,
    timestamp: 1730364000500
  };

  const buffer = avro.serialize('AudioTapEvent', original);
  const decoded = avro.deserialize('AudioTapEvent', buffer);

  assert.strictEqual(decoded.meetingId, original.meetingId);
  assert.strictEqual(decoded.sequenceNumber, original.sequenceNumber);
  assert.strictEqual(decoded.sampleRate, original.sampleRate);
  assert.strictEqual(decoded.audioData.length, original.audioData.length);
  assert(Buffer.compare(decoded.audioData, original.audioData) === 0, 'Audio byte buffer must match byte-for-byte');
});

// 5. Single Object Encoding
it('Correctly frames and unframes Single Object Encoding with RFC 0xC3 0x01 magic bytes', () => {
  const original = {
    requestId: 'req_sum_999',
    meetingId: 'meet_org_boardroom_1',
    transcriptText: 'Dr. Sharma: The patient is stabilizing after medication.',
    targetLanguage: 'en',
    preferredModel: 'gemini-3.7-flash',
    timestamp: 1730364000999
  };

  const singleObjBuf = avro.serializeSingleObject('SummaryRequestEvent', original);
  assert(singleObjBuf[0] === 0xC3 && singleObjBuf[1] === 0x01, 'Magic bytes must be 0xC3 0x01');

  const unframed = avro.deserializeSingleObject(singleObjBuf);
  assert.strictEqual(unframed.schemaName, 'SummaryRequestEvent');
  assert.strictEqual(unframed.data.requestId, original.requestId);
  assert.strictEqual(unframed.data.transcriptText, original.transcriptText);
});

// 6. Bandwidth Savings / Compression Benchmark
it('Demonstrates significant bandwidth compression against JSON equivalents', () => {
  // Test short conversational caption
  const shortCaption = {
    eventId: 'evt_1',
    meetingId: 'm_1',
    speakerId: 's_1',
    sourceLanguage: 'en',
    transcriptText: 'Can you hear me clearly?',
    isFinal: true,
    confidenceScore: 0.99,
    timestamp: 1730364000000
  };

  const avroBuf = avro.serialize('CaptionStreamEvent', shortCaption);
  const stats = avro.getCompressionMetrics(shortCaption, avroBuf);

  console.log(`\n  [Empirical Benchmark] CaptionStreamEvent Payload Comparison:`);
  console.log(`    - JSON UTF-8 Size:     ${stats.jsonBytes} bytes`);
  console.log(`    - Avro Binary Size:    ${stats.avroBytes} bytes`);
  console.log(`    - Bandwidth Reduction: ${stats.compressionRatio} (Ratio factor: ${stats.ratioFactor}x)`);

  assert(stats.avroBytes < stats.jsonBytes, 'Avro binary must be strictly smaller than JSON');
  assert(parseFloat(stats.compressionRatio) > 60.0, 'Short caption should achieve >60% compression ratio');
});

console.log('='.repeat(80));
console.log(` RESULTS: ${passed}/${total} test cases passed successfully!`);
console.log('='.repeat(80));

