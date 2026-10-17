'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const spc = require('./spc.js');

// Deterministic Gaussian noise so the suite never flakes.
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r()); }
function series(len, mu, sd, seed) { const r = rng(seed); return Array.from({ length: len }, () => mu + sd * gauss(r)); }

test('limits: centre and sigma close to truth for noise', () => {
  const l = spc.limits(series(28, 100, 5, 1));
  assert.ok(Math.abs(l.centre - 100) < 4);
  assert.ok(l.sigma > 3 && l.sigma < 8);
  assert.ok(l.ucl > l.centre && l.lcl < l.centre);
});

test('flags a single point far outside the limits (spike)', () => {
  const s = series(28, 100, 5, 2).concat([140]);
  const d = spc.detect(s, { direction: 'lower' });
  assert.equal(d.signals.some((x) => x.rule === 'out_of_limit' && x.side === 'adverse'), true);
});

test('flags a sustained 1.5-sigma shift as a 7-point run (but not as out-of-limit)', () => {
  const s = series(28, 100, 5, 3).concat(series(7, 108.5, 5, 4).map((x, i) => 108 + (x - 108.5) * 0.4 + 0 * i));
  const d = spc.detect(s, { direction: 'lower' });
  assert.equal(d.signals.some((x) => x.rule === 'run' && x.side === 'adverse'), true);
});

test('a favourable shift is reported but marked favourable (goes to Working, not Not working)', () => {
  const s = series(28, 100, 5, 5).concat(Array(7).fill(0).map((_, i) => 94 + i * 0.1));
  const d = spc.detect(s, { direction: 'lower' });
  const run = d.signals.find((x) => x.rule === 'run');
  assert.ok(run);
  assert.equal(run.side, 'favourable');
  assert.equal(spc.facultyStatus([{ signals: d.signals }]), 'green');
});

test('does NOT flag pure noise: false-positive rate on the latest day stays low', () => {
  let flagged = 0; const N = 400;
  for (let i = 0; i < N; i++) {
    const d = spc.detect(series(60, 100, 5, 1000 + i), { direction: 'band' });
    if (d.signals.length) flagged++;
  }
  // theory: ~0.3% (limit) + ~1.6% (run) per day; allow 5% headroom
  assert.ok(flagged / N < 0.05, `false positive rate ${flagged / N}`);
});

test('does NOT flag ordinary day-to-day wobble inside the limits', () => {
  const s = series(28, 100, 5, 7).concat([104]);
  const d = spc.detect(s, { direction: 'lower' });
  assert.equal(d.signals.filter((x) => x.rule === 'out_of_limit').length, 0);
});

test('warming up: fewer than 14 baseline points gives no control-limit signals', () => {
  const d = spc.detect([100, 101, 99, 140], { direction: 'lower' });
  assert.equal(d.status, 'warming_up');
  assert.deepEqual(d.signals, []);
});

test('a baseline that contains the shift cannot hide it (run baseline excludes the last 7 points)', () => {
  const s = series(21, 100, 3, 8).concat(series(14, 112, 3, 9));
  const d = spc.detect(s, { direction: 'lower' });
  assert.equal(d.signals.some((x) => x.rule === 'run'), true);
});

test('p-chart: tiny daily n gives wide limits so 1 of 3 is not a signal', () => {
  const ns = Array(28).fill(3), succ = Array(28).fill(2);
  const p = spc.pLimits(succ, ns);
  assert.ok(Math.abs(p.centre - 2 / 3) < 1e-9);
  assert.ok(p.per[0].lcl < 1 / 3, 'lower limit should sit below 33%');
  const big = spc.pLimits(Array(28).fill(60), Array(28).fill(90));
  assert.ok(big.per[0].ucl - big.per[0].lcl < p.per[0].ucl - p.per[0].lcl);
});

test('SLO burn: one bad day in 7 is not burning, two are; zero-tolerance burns at once', () => {
  const opt = { target: 0.95, direction: 'higher', allowedBreachFraction: 0.1, window: 7 };
  assert.equal(spc.sloBurn([.97, .96, .98, .97, .96, .88, .97], opt).burning, false);
  assert.equal(spc.sloBurn([.97, .96, .98, .9, .96, .88, .97], opt).burning, true);
  const zero = spc.sloBurn([1, 1, 1, 1, 1, 1, 0.99], { target: 1, direction: 'higher', allowedBreachFraction: 0 });
  assert.equal(zero.burn, Infinity);
  assert.equal(zero.burning, true);
});

test('SLO burn for a band (calendar fill 60-80%)', () => {
  const b = spc.sloBurn([70, 72, 85, 90, 71, 70, 69], { target: [60, 80], direction: 'band', allowedBreachFraction: 0.1 });
  assert.equal(b.breachDays, 2);
  assert.equal(b.burning, true);
});

test('evidence gate: blocks small samples, passes them when an SLO burns', () => {
  const policy = { days: 14, spend_zar: 3000 };
  assert.equal(spc.evidenceOk({ days: 9, spend_zar: 2100 }, policy).ok, false);
  assert.deepEqual(spc.evidenceOk({ days: 9, spend_zar: 2100 }, policy).missing, ['days', 'spend_zar']);
  assert.equal(spc.evidenceOk({ days: 15, spend_zar: 3400 }, policy).ok, true);
  assert.equal(spc.evidenceOk({ days: 3, spend_zar: 100 }, policy, { sloBurning: true }).ok, true);
});

test('facultyStatus: burning = red, adverse signal = amber, none = green', () => {
  assert.equal(spc.facultyStatus([{ burn: { burning: true } }]), 'red');
  assert.equal(spc.facultyStatus([{ signals: [{ side: 'adverse' }] }]), 'amber');
  assert.equal(spc.facultyStatus([{ signals: [] }, {}]), 'green');
});

test('detectConfirmed: a one-day spike is held back, a second consecutive day is confirmed', () => {
  const base = series(28, 100, 5, 11);
  const one = spc.detectConfirmed(base.concat([145]), { direction: 'lower' });
  assert.equal(one.signals.filter((x) => x.rule === 'out_of_limit').length, 0);
  const two = spc.detectConfirmed(base.concat([145, 146]), { direction: 'lower' });
  assert.equal(two.signals.filter((x) => x.rule === 'out_of_limit').length, 1);
});

test('detectP: 1 of 3 on a tiny-n day is not a signal; a real drop at n=60 is', () => {
  const num = Array(28).fill(2), den = Array(28).fill(3);
  assert.deepEqual(spc.detectP(num.concat([1]), den.concat([3]), { direction: 'higher' }).signals, []);
  const bnum = Array(28).fill(42), bden = Array(28).fill(60); // 70%
  const d = spc.detectP(bnum.concat([24]), bden.concat([60]), { direction: 'higher' }); // 40%
  assert.equal(d.signals.some((x) => x.rule === 'out_of_limit' && x.side === 'adverse'), true);
});

test('detectP: a sustained 7-day slip from 70% to 62% at n=40/day is a run', () => {
  const r = rng(21);
  const mk = (p) => { let s = 0; for (let i = 0; i < 40; i++) if (r() < p) s++; return s; };
  const num = [], den = [];
  for (let i = 0; i < 28; i++) { num.push(mk(0.7)); den.push(40); }
  for (let i = 0; i < 7; i++) { num.push(mk(0.6)); den.push(40); }
  const d = spc.detectP(num, den, { direction: 'higher' });
  assert.equal(d.signals.some((x) => x.rule === 'run' && x.side === 'adverse'), true);
});

test('detectP: noise at n=30/day does not flag (false-positive rate under 6%)', () => {
  let flagged = 0; const N = 300;
  for (let i = 0; i < N; i++) {
    const r = rng(9000 + i); const num = [], den = [];
    for (let j = 0; j < 60; j++) { let s = 0; for (let q = 0; q < 30; q++) if (r() < 0.65) s++; num.push(s); den.push(30); }
    if (spc.detectP(num, den, { direction: 'band' }).signals.length) flagged++;
  }
  assert.ok(flagged / N < 0.06, 'false positive rate ' + flagged / N);
});

test('detectP: a 100% SLO metric flags any miss at n=50 (limits collapse to 1.0)', () => {
  const num = Array(28).fill(50), den = Array(28).fill(50);
  const d = spc.detectP(num.concat([49]), den.concat([50]), { direction: 'higher' });
  assert.equal(d.signals.some((x) => x.rule === 'out_of_limit' && x.side === 'adverse'), true);
});
