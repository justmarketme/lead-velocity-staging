#!/usr/bin/env node
'use strict';
// Server-side check for an intro recording. Rules are pure functions (tested offline);
// the CLI measures with ffprobe / ffmpeg (ebur128 + astats) and applies them.
// Exit 0 = usable (warnings allowed). Exit 1 = rejected, plain-English reason on stderr. Exit 2 = tool/usage error.
// Browser-side heuristics in portal/intro-media/app.js mirror these limits; this is the authoritative gate.

const MAX_BYTES = 16 * 1024 * 1024;       // WhatsApp media limit
const LIMITS = {
  minSeconds: 15, maxSeconds: 40,
  tooQuietLufs: -30, quietLufs: -26, loudLufs: -12,
  noiseWarnDb: -50, peakWarnDb: -1,
};

function evaluate(m, opts = {}) {
  const L = { ...LIMITS, ...opts };
  const maxBytes = opts.maxBytes || MAX_BYTES;
  const issues = [];
  const add = (severity, code, message) => issues.push({ severity, code, message });
  if (typeof m.duration === 'number') {
    if (m.duration < L.minSeconds) add('error', 'too_short', `This is ${m.duration.toFixed(0)} seconds. Aim for 20 to 30 seconds (at least ${L.minSeconds}). Read the whole script and record again.`);
    else if (m.duration > L.maxSeconds) add('error', 'too_long', `This is ${m.duration.toFixed(0)} seconds. Short gets watched to the end. Keep it under ${L.maxSeconds}, ideally 20 to 30.`);
  } else add('error', 'no_duration', 'We could not read the length of this file. Try recording again.');
  if (typeof m.sizeBytes === 'number' && m.sizeBytes > maxBytes) add('error', 'too_big', `The file is ${(m.sizeBytes / 1048576).toFixed(1)} MB, over the 16 MB WhatsApp limit.`);
  if (typeof m.integratedLufs === 'number') {
    if (m.integratedLufs <= -70) add('error', 'silent', 'We could not hear any speech. Check that the microphone is not covered and record again.');
    else if (m.integratedLufs < L.tooQuietLufs) add('error', 'too_quiet', 'Your voice is very quiet. Move closer to the phone (60 to 80 cm) and speak up a little.');
    else if (m.integratedLufs < L.quietLufs) add('warn', 'quiet', 'A bit quiet. A little closer to the phone will help.');
    else if (m.integratedLufs > L.loudLufs) add('warn', 'loud', 'A bit loud. Step back a little from the phone.');
  } else add('warn', 'no_loudness', 'Loudness could not be measured.');
  if (typeof m.noiseFloorDb === 'number' && m.noiseFloorDb > L.noiseWarnDb) add('warn', 'noisy', 'Background noise detected. Fan, aircon or traffic? Close the door and switch it off if you can. Your voice matters more than the picture.');
  if (typeof m.peakDb === 'number' && m.peakDb > L.peakWarnDb) add('warn', 'clipping', 'Your voice is distorting at the loud parts. Step back a little.');
  const errors = issues.filter((i) => i.severity === 'error');
  return { ok: errors.length === 0, issues, reason: errors.map((e) => e.message).join(' ') };
}

function parseEbur128(log) {
  const i = log.lastIndexOf('Summary:');
  const s = i >= 0 ? log.slice(i) : log;
  const num = (re) => { const m = s.match(re); return m ? parseFloat(m[1]) : undefined; };
  return { integratedLufs: num(/I:\s+(-?[\d.]+)\s+LUFS/), lraLow: num(/LRA low:\s+(-?[\d.]+)\s+LUFS/) };
}

function parseAstats(log) {
  const i = log.lastIndexOf('Overall');
  const s = i >= 0 ? log.slice(i) : log;
  const num = (re) => { const m = s.match(re); return m && /^-?[\d.]+$/.test(m[1]) ? parseFloat(m[1]) : undefined; };
  return { noiseFloorDb: num(/RMS trough dB:\s+(-?[\d.]+|-inf)/), peakDb: num(/Peak level dB:\s+(-?[\d.]+|-inf)/) };
}

// Where speech starts and ends, from `ffmpeg -af silencedetect` stderr. Keeps a short breathing margin.
function silenceTrimPoints(log, duration, { margin = 0.25 } = {}) {
  const starts = [...log.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => parseFloat(m[1]));
  const ends = [...log.matchAll(/silence_end:\s*(-?[\d.]+)/g)].map((m) => parseFloat(m[1]));
  let start = 0, end = duration;
  if (starts.length && starts[0] <= 0.05 && ends.length) start = Math.max(0, ends[0] - margin);
  if (starts.length) {
    const last = starts[starts.length - 1];
    const closed = ends.length >= starts.length;           // last silence ended before file end -> not trailing
    if (!closed || Math.abs((ends[ends.length - 1] || 0) - duration) < 0.1) { if (last > start) end = Math.min(duration, last + margin); }
  }
  if (end - start < 1) return { start: 0, end: duration };  // all silence or nonsense: leave alone, the check will say why
  return { start, end };
}

module.exports = { evaluate, parseEbur128, parseAstats, silenceTrimPoints, LIMITS, MAX_BYTES };

if (require.main === module) {
  const { spawnSync } = require('child_process');
  const fs = require('fs');
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  if (!file || !fs.existsSync(file)) { console.error('usage: check.js <file> [--min s] [--max s] [--json]  (file not found)'); process.exit(2); }
  const run = (cmd, a) => spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const probe = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  if (probe.error) { console.error('ffprobe is not installed on this server.'); process.exit(2); }
  const duration = parseFloat(probe.stdout);
  const af = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true,astats=measure_perchannel=none', '-f', 'null', '-']);
  const log = af.stderr || '';
  const m = { duration: Number.isFinite(duration) ? duration : undefined, sizeBytes: fs.statSync(file).size, ...parseEbur128(log), ...parseAstats(log) };
  const opts = {};
  if (flag('--min')) opts.minSeconds = parseFloat(flag('--min'));
  if (flag('--max')) opts.maxSeconds = parseFloat(flag('--max'));
  const r = evaluate(m, opts);
  if (args.includes('--json')) console.log(JSON.stringify({ ...r, metrics: m }));
  if (!r.ok) { console.error(r.reason); process.exit(1); }
  if (!args.includes('--json')) console.log('ok' + (r.issues.length ? ': ' + r.issues.map((i) => i.message).join(' ') : ''));
}
