// optimisation/spc.js — Shewhart/Deming control limits + SRE-style burn rate for the daily pulse (W32).
// Dependency-free, pure functions, no I/O. Used by the W32 "Signals" Code node and by the console sparklines.
// Maths and decisions are explained in control-limits.md.
'use strict';

const D2 = 1.128;            // bias constant for moving ranges of size 2 (individuals chart)
const WINDOW = 28;           // baseline length in days
const MIN_BASELINE = 14;     // fewer baseline points than this = "warming up": SLO only, no control limits
const RUN_LENGTH = 7;        // consecutive points on one side of the centre line
const BURN_THRESHOLD = 2;    // SLO burn rate > 2x = Red

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const clean = (a) => a.filter(finite);

function mean(a) {
  const v = clean(a);
  if (!v.length) return NaN;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

// Sigma from the average moving range (robust to a slow drift inside the baseline).
function mrSigma(a) {
  const v = clean(a);
  if (v.length < 2) return NaN;
  let t = 0;
  for (let i = 1; i < v.length; i++) t += Math.abs(v[i] - v[i - 1]);
  return t / (v.length - 1) / D2;
}

// Individuals (I-MR) chart limits from a baseline window.
function limits(baseline, { k = 3 } = {}) {
  const v = clean(baseline);
  const centre = mean(v);
  const sigma = mrSigma(v);
  return { n: v.length, centre, sigma, ucl: centre + k * sigma, lcl: centre - k * sigma, k, type: 'imr' };
}

// p-chart limits for a proportion with a varying daily denominator (tiny n per day = wide limits).
// `successes[i]` / `ns[i]` is the daily rate; the limits are returned per point.
function pLimits(successes, ns, { k = 3 } = {}) {
  let s = 0, n = 0;
  for (let i = 0; i < ns.length; i++) { if (finite(successes[i]) && finite(ns[i])) { s += successes[i]; n += ns[i]; } }
  const pbar = n ? s / n : NaN;
  const per = ns.map((ni) => {
    const w = ni > 0 ? k * Math.sqrt((pbar * (1 - pbar)) / ni) : Infinity;
    return { ucl: Math.min(1, pbar + w), lcl: Math.max(0, pbar - w) };
  });
  return { centre: pbar, per, k, type: 'p' };
}

// direction: 'higher' (higher is better), 'lower' (lower is better), 'band' (inside [lo, hi] is fine; both sides adverse).
function side(dir, delta) {
  if (dir === 'band') return 'adverse';
  if (delta === 0) return 'neutral';
  return (dir === 'higher') === (delta > 0) ? 'favourable' : 'adverse';
}

/**
 * Detect signals in the latest point of a daily series (oldest -> newest).
 * Rule 1: latest point outside the 28-day limits (baseline = the 28 points before it).
 * Rule 2: the last 7 points all on one side of the centre line
 *         (baseline = the 28 points before those 7, so a real shift cannot contaminate its own yardstick).
 * Returns { status, limits, signals[] }. status = 'warming_up' when fewer than 14 baseline points exist.
 */
function detect(series, { direction = 'higher', k = 3, window = WINDOW, runLength = RUN_LENGTH } = {}) {
  const s = series.slice();
  const out = { status: 'ok', limits: null, signals: [] };
  const n = s.length;
  if (n < MIN_BASELINE + 1) { out.status = 'warming_up'; return out; }

  const latest = s[n - 1];
  const base1 = clean(s.slice(Math.max(0, n - 1 - window), n - 1));
  const lim = limits(base1, { k });
  out.limits = lim;
  if (base1.length < MIN_BASELINE || !(lim.sigma > 0)) {
    // flat or too-short baseline: cannot judge noise; a flat baseline with any change is flagged by rule 1 below only if sigma is exactly 0
    if (base1.length < MIN_BASELINE) { out.status = 'warming_up'; return out; }
  }
  if (finite(latest)) {
    if (latest > lim.ucl || latest < lim.lcl) {
      out.signals.push({ rule: 'out_of_limit', value: latest, limit: latest > lim.ucl ? lim.ucl : lim.lcl,
        centre: lim.centre, side: side(direction, latest - lim.centre), run: 1 });
    }
  }

  if (n >= runLength + MIN_BASELINE) {
    const recent = s.slice(n - runLength);
    const base2 = clean(s.slice(Math.max(0, n - runLength - window), n - runLength));
    const lim2 = limits(base2, { k });
    if (base2.length >= MIN_BASELINE && recent.every(finite)) {
      const above = recent.every((x) => x > lim2.centre);
      const below = recent.every((x) => x < lim2.centre);
      if (above || below) {
        out.signals.push({ rule: 'run', value: mean(recent), limit: lim2.centre, centre: lim2.centre,
          side: side(direction, above ? 1 : -1), run: runLength });
      }
    }
  }
  return out;
}


/**
 * Proportion version of detect(): num[i]/den[i] per day (den 0 = no data that day).
 * Out-of-limit uses p-chart limits from the baseline p-bar and TODAY's n, so a day with 3 leads gets wide limits.
 * The run rule compares the last 7 daily rates with the p-bar of the 28 days before them.
 */
function detectP(num, den, { direction = 'higher', k = 3, window = WINDOW, runLength = RUN_LENGTH } = {}) {
  const out = { status: 'ok', limits: null, signals: [] };
  const n = num.length;
  const rate = (i) => (finite(den[i]) && den[i] > 0 && finite(num[i]) ? num[i] / den[i] : NaN);
  const pbarOf = (from, to) => {
    let s = 0, d = 0, pts = 0;
    for (let i = Math.max(0, from); i < to; i++) if (finite(rate(i))) { s += num[i]; d += den[i]; pts++; }
    return { p: d ? s / d : NaN, pts };
  };
  if (n < MIN_BASELINE + 1) { out.status = 'warming_up'; return out; }
  const b1 = pbarOf(n - 1 - window, n - 1);
  if (b1.pts < MIN_BASELINE) { out.status = 'warming_up'; return out; }
  const r = rate(n - 1);
  if (finite(r)) {
    const w = k * Math.sqrt((b1.p * (1 - b1.p)) / den[n - 1]);
    const ucl = Math.min(1, b1.p + w), lcl = Math.max(0, b1.p - w);
    out.limits = { n: b1.pts, centre: b1.p, ucl, lcl, k, type: 'p' };
    if (r > ucl + 1e-12 || r < lcl - 1e-12) {
      out.signals.push({ rule: 'out_of_limit', value: r, limit: r > ucl ? ucl : lcl, centre: b1.p, side: side(direction, r - b1.p), run: 1 });
    }
  }
  if (n >= runLength + MIN_BASELINE) {
    const b2 = pbarOf(n - runLength - window, n - runLength);
    const recent = [];
    for (let i = n - runLength; i < n; i++) recent.push(rate(i));
    if (b2.pts >= MIN_BASELINE && recent.every(finite)) {
      const above = recent.every((x) => x > b2.p), below = recent.every((x) => x < b2.p);
      if (above || below) {
        out.signals.push({ rule: 'run', value: mean(recent), limit: b2.p, centre: b2.p, side: side(direction, above ? 1 : -1), run: runLength });
      }
    }
  }
  return out;
}

/** Two-day confirmation for p-chart input metrics (same idea as detectConfirmed). */
function detectPConfirmed(num, den, opts = {}) {
  const today = detectP(num, den, opts);
  if (today.status !== 'ok') return today;
  const yest = detectP(num.slice(0, -1), den.slice(0, -1), opts);
  const sgn = (s) => (s.value > s.centre ? 1 : -1);
  const keep = today.signals.filter((x) => x.rule !== 'out_of_limit' ||
    yest.signals.some((y) => y.rule === 'out_of_limit' && sgn(y) === sgn(x)));
  return { ...today, signals: keep, confirmed: true };
}

/**
 * Two-day confirmation for non-headline input metrics (keeps a quiet day quiet).
 * An out_of_limit signal is kept only if yesterday's point was also outside the limits on the same side.
 * Run signals are already 7 days of evidence, so they pass through unchanged.
 */
function detectConfirmed(series, opts = {}) {
  const today = detect(series, opts);
  if (today.status !== 'ok') return today;
  const yest = detect(series.slice(0, -1), opts);
  const keep = today.signals.filter((x) => x.rule !== 'out_of_limit' ||
    yest.signals.some((y) => y.rule === 'out_of_limit' && y.value > yest.limits.centre === x.value > today.limits.centre));
  return { ...today, signals: keep, confirmed: true };
}

/**
 * SLO burn rate (Google SRE, adapted to daily data).
 * allowedBreachFraction = share of days allowed to miss the SLO (0 = zero tolerance).
 * burn = observed breach fraction over the last `window` days / allowed fraction.
 * Zero-tolerance SLOs burn at Infinity on the first breach (Red immediately).
 * `target` for direction 'band' is [lo, hi].
 */
function sloBurn(series, { target, direction = 'higher', allowedBreachFraction = 0.1, window = 7 } = {}) {
  const v = series.slice(-window).filter(finite);
  if (!v.length) return { burn: 0, breachDays: 0, days: 0, burning: false };
  const miss = (x) => direction === 'higher' ? x < target : direction === 'lower' ? x > target : (x < target[0] || x > target[1]);
  const breachDays = v.filter(miss).length;
  const frac = breachDays / v.length;
  const burn = breachDays === 0 ? 0 : allowedBreachFraction === 0 ? Infinity : frac / allowedBreachFraction;
  return { burn, breachDays, days: v.length, burning: burn > BURN_THRESHOLD };
}

/**
 * Minimum-evidence gate (4.15: no proposal on < 14 days / R3,000 / 300 conversions unless an SLO is burning).
 * policy = { days: 14, spend_zar?: 3000, conversions?: 300 } — only the keys a metric lists apply.
 * evidence = { days, spend_zar, conversions }.
 */
function evidenceOk(evidence, policy, { sloBurning = false } = {}) {
  if (sloBurning) return { ok: true, reason: 'slo_burning' };
  const missing = [];
  for (const key of Object.keys(policy || {})) {
    if (!(evidence && finite(evidence[key]) && evidence[key] >= policy[key])) missing.push(key);
  }
  return missing.length ? { ok: false, reason: 'insufficient_evidence', missing } : { ok: true, reason: 'enough_evidence' };
}

/**
 * One faculty status for the tile + pulse pill.
 * red   = an SLO is burning > 2x (or a zero-tolerance control failed)
 * amber = an adverse signal (out-of-limit or run) but no SLO burning
 * green = nothing adverse. Favourable signals never colour a tile; they go to "Working".
 */
function facultyStatus(metrics) {
  let status = 'green';
  for (const m of metrics) {
    if (m.burn && m.burn.burning) return 'red';
    if (m.signals && m.signals.some((x) => x.side === 'adverse')) status = 'amber';
  }
  return status;
}

module.exports = { WINDOW, MIN_BASELINE, RUN_LENGTH, BURN_THRESHOLD, mean, mrSigma, limits, pLimits, detect, detectConfirmed, detectP, detectPConfirmed, sloBurn, evidenceOk, facultyStatus };
