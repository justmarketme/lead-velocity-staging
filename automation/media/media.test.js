'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { srtTime, wrapLines, buildCues, toSrt } = require('./captions.js');
const { evaluate, parseEbur128, parseAstats, silenceTrimPoints, MAX_BYTES } = require('./check.js');

test('srtTime formats and rounds', () => {
  assert.equal(srtTime(0), '00:00:00,000');
  assert.equal(srtTime(3.6504), '00:00:03,650');
  assert.equal(srtTime(3725.5), '01:02:05,500');
  assert.equal(srtTime(-1), '00:00:00,000');
});

test('wrapLines keeps lines short', () => {
  const lines = wrapLines('On our call I will ask a few questions and tell you plainly where you stand', 26);
  assert.ok(lines.every((l) => l.length <= 26));
  assert.equal(lines.join(' '), 'On our call I will ask a few questions and tell you plainly where you stand');
});

const words = (s, t0, step) => s.split(' ').map((w, i) => ({ word: w, start: t0 + i * step, end: t0 + (i + 1) * step - 0.05 }));

test('toSrt from word timings: numbered, ordered, no overlap, max 2 lines', () => {
  const tr = { language: 'en', segments: [{ start: 0, end: 8, text: '', words: words("Hi I'm Mark from Mark Williams Financial Planning. There is nothing to buy and no pressure.", 0, 0.45) }] };
  const srt = toSrt(tr);
  const blocks = srt.trim().split('\n\n');
  assert.ok(blocks.length >= 2);
  let prevEnd = -1;
  blocks.forEach((b, i) => {
    const [n, t, ...txt] = b.split('\n');
    assert.equal(n, String(i + 1));
    assert.match(t, /^\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}$/);
    assert.ok(txt.length >= 1 && txt.length <= 2);
    const [s, e] = t.split(' --> ');
    assert.ok(s >= '00:00:00,000' && e > s);
    assert.ok(s >= prevEnd || prevEnd === -1);
    prevEnd = e;
  });
});

test('toSrt from segment text only (no word timings) shares time', () => {
  const cues = buildCues({ segments: [{ start: 1, end: 7, text: 'Hello there. I work with families. See you Thursday.' }] });
  assert.equal(cues.length, 3);
  assert.ok(Math.abs(cues[0].start - 1) < 1e-9);
  assert.ok(cues[2].end <= 7.0001);
});

test('offset shifts and drops cues before the trim point; maxEnd clamps', () => {
  const tr = { segments: [{ start: 0, end: 1, text: 'Gone.' }, { start: 2, end: 4, text: 'Kept.' }, { start: 9, end: 11, text: 'Late.' }] };
  const cues = buildCues(tr, { offset: 1.5, maxEnd: 5 });
  assert.deepEqual(cues.map((c) => c.text), ['Kept.']);
  assert.ok(cues[0].start >= 0.49 && cues[0].start <= 0.51);
  assert.throws(() => buildCues({}), /segments/);
});

test('duration rule: 15 to 40 seconds', () => {
  const ok = { sizeBytes: 5e6, integratedLufs: -20 };
  assert.equal(evaluate({ ...ok, duration: 25 }).ok, true);
  assert.equal(evaluate({ ...ok, duration: 15 }).ok, true);
  assert.equal(evaluate({ ...ok, duration: 40 }).ok, true);
  const short = evaluate({ ...ok, duration: 9 });
  assert.equal(short.ok, false);
  assert.match(short.reason, /9 seconds/);
  assert.equal(evaluate({ ...ok, duration: 52 }).issues[0].code, 'too_long');
  assert.equal(evaluate({ ...ok, duration: 41 }, { maxSeconds: 41.5 }).ok, true);
});

test('size rule: 16 MB WhatsApp limit', () => {
  const base = { duration: 25, integratedLufs: -20 };
  assert.equal(evaluate({ ...base, sizeBytes: MAX_BYTES }).ok, true);
  const big = evaluate({ ...base, sizeBytes: MAX_BYTES + 1 });
  assert.equal(big.ok, false);
  assert.match(big.reason, /16 MB/);
});

test('loudness rule: errors block, warnings do not', () => {
  const base = { duration: 25, sizeBytes: 1e6 };
  assert.equal(evaluate({ ...base, integratedLufs: -45 }).issues[0].code, 'too_quiet');
  assert.equal(evaluate({ ...base, integratedLufs: -70 }).issues[0].code, 'silent');
  const q = evaluate({ ...base, integratedLufs: -28 });
  assert.equal(q.ok, true);
  assert.equal(q.issues[0].severity, 'warn');
  const n = evaluate({ ...base, integratedLufs: -20, noiseFloorDb: -40 });
  assert.equal(n.ok, true);
  assert.equal(n.issues[0].code, 'noisy');
});

test('parse ffmpeg ebur128 and astats output', () => {
  const eb = '[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -19.3 LUFS\n    Threshold: -29.6 LUFS\n\n  Loudness range:\n    LRA:         3.1 LU\n    LRA low:   -22.0 LUFS\n';
  assert.deepEqual(parseEbur128(eb), { integratedLufs: -19.3, lraLow: -22 });
  const st = '[Parsed_astats_1 @ 0x2] Overall\n[Parsed_astats_1 @ 0x2] Peak level dB: -3.20\n[Parsed_astats_1 @ 0x2] RMS trough dB: -61.40\n';
  assert.deepEqual(parseAstats(st), { noiseFloorDb: -61.4, peakDb: -3.2 });
});

test('silence trim points find speech start and end', () => {
  const log = 'silence_start: 0\nsilence_end: 1.8 | silence_duration: 1.8\nsilence_start: 27.4\n';
  const p = silenceTrimPoints(log, 30);
  assert.ok(Math.abs(p.start - 1.55) < 1e-9);
  assert.ok(Math.abs(p.end - 27.65) < 1e-9);
  assert.deepEqual(silenceTrimPoints('', 12), { start: 0, end: 12 });
  assert.deepEqual(silenceTrimPoints('silence_start: 0\n', 12), { start: 0, end: 12 });
});

test('I-41h llmCostZar / llmCostRow: ASSUMPTION rates, tier by model name, rounding, missing usage', async () => {
  const { llmCostZar, llmCostRow, costRef, LLM_RATES } = await import('./intro-script.mjs');
  assert.equal(LLM_RATES.usd_zar, 18);
  // Sonnet: 1M in = $2, 1M out = $10 -> R36 / R180
  assert.equal(llmCostZar('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 0 }), 36);
  assert.equal(llmCostZar('claude-sonnet-5-5', { input_tokens: 0, output_tokens: 1e6 }), 180);
  assert.equal(llmCostZar('claude-haiku-4-5-20251001', { input_tokens: 1e6, output_tokens: 1e6 }), 108);
  assert.equal(llmCostZar('mystery', { input_tokens: 1e6 }), 36); // unknown -> dearer tier
  assert.equal(llmCostZar('claude-sonnet-5-5', { input_tokens: 1500, output_tokens: 300 }), 0.11);
  assert.equal(llmCostZar('x', null), 0);
  const row = llmCostRow([{ model: 'claude-sonnet-5-5', usage: { input_tokens: 1500, output_tokens: 300 } }, null, { model: 'claude-haiku-4-5-20251001', usage: { input_tokens: 900, output_tokens: 60 } }, { model: 'm' }]);
  assert.equal(row.amount_zar, 0.11 + 0.02);
  assert.equal(row.note, 'claude-sonnet-5-5 in=1500 out=300; claude-haiku-4-5-20251001 in=900 out=60');
  assert.equal(llmCostRow([]).note, 'no usage returned');
  assert.equal(costRef.generate('b', 'r', 'family', 2), 'w23:script-generate:b:r:family:2');
  assert.equal(costRef.recheck('b', 'r'), 'w23:script-recheck:b:r');
});
