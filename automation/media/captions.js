#!/usr/bin/env node
'use strict';
// SRT from a Whisper-class transcript JSON. No dependencies.
// Transcript shape (whisper / faster-whisper / OpenAI verbose_json compatible):
//   { language: "en", segments: [ { start, end, text, words?: [ { word, start, end } ] } ] }
// Burn-in is done by pipeline.sh (ffmpeg subtitles filter); this file only makes the SRT.

const MAX_CHARS_PER_LINE = 26;   // 9:16 at 1080 wide: short lines stay inside the safe zone
const MAX_LINES = 2;
const MAX_CUE_SECONDS = 3.5;
const MIN_CUE_SECONDS = 0.6;

function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

function wrapLines(text, maxChars = MAX_CHARS_PER_LINE) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Split a segment's words into cues that fit MAX_LINES lines and MAX_CUE_SECONDS.
function cuesFromWords(words) {
  const cues = [];
  let cur = [];
  const fits = (arr) => {
    if (!arr.length) return true;
    const text = arr.map((w) => w.word.trim()).join(' ');
    return wrapLines(text).length <= MAX_LINES && (arr[arr.length - 1].end - arr[0].start) <= MAX_CUE_SECONDS;
  };
  for (const w of words) {
    if (cur.length && !fits([...cur, w])) { cues.push(cur); cur = []; }
    cur.push(w);
    if (/[.!?]$/.test(w.word.trim()) && cur.length) { cues.push(cur); cur = []; }
  }
  if (cur.length) cues.push(cur);
  return cues.map((c) => ({ start: c[0].start, end: c[c.length - 1].end, text: c.map((w) => w.word.trim()).join(' ') }));
}

// Without word timings: split text by sentence/length and share the segment time by character count.
function cuesFromSegmentText(seg) {
  const text = seg.text.replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const pieces = [];
  let buf = '';
  for (const word of text.split(' ')) {
    const next = buf ? buf + ' ' + word : word;
    if (buf && wrapLines(next).length > MAX_LINES) { pieces.push(buf); buf = word; }
    else buf = next;
    if (/[.!?]$/.test(word)) { pieces.push(buf); buf = ''; }
  }
  if (buf) pieces.push(buf);
  const total = pieces.reduce((n, p) => n + p.length, 0) || 1;
  const dur = Math.max(0, seg.end - seg.start);
  let t = seg.start;
  return pieces.map((p) => {
    const d = dur * (p.length / total);
    const cue = { start: t, end: t + d, text: p };
    t += d;
    return cue;
  });
}

function buildCues(transcript, { offset = 0, maxEnd = Infinity } = {}) {
  if (!transcript || !Array.isArray(transcript.segments)) throw new Error('transcript.segments missing');
  let cues = [];
  for (const seg of transcript.segments) {
    const hasWords = Array.isArray(seg.words) && seg.words.length && seg.words.every((w) => typeof w.start === 'number' && typeof w.end === 'number' && typeof w.word === 'string');
    cues.push(...(hasWords ? cuesFromWords(seg.words) : cuesFromSegmentText(seg)));
  }
  cues = cues
    .map((c) => ({ ...c, start: c.start - offset, end: c.end - offset }))
    .filter((c) => c.end > 0 && c.start < maxEnd && c.text);
  cues.forEach((c) => { c.start = Math.max(0, c.start); c.end = Math.min(maxEnd, Math.max(c.end, c.start + MIN_CUE_SECONDS)); });
  // never overlap
  for (let i = 1; i < cues.length; i++) if (cues[i].start < cues[i - 1].end) cues[i - 1].end = Math.max(cues[i - 1].start + 0.1, cues[i].start - 0.02);
  return cues;
}

function toSrt(transcript, opts = {}) {
  return buildCues(transcript, opts)
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${wrapLines(c.text).join('\n')}\n`)
    .join('\n');
}

module.exports = { srtTime, wrapLines, buildCues, toSrt, MAX_CHARS_PER_LINE };

if (require.main === module) {
  const fs = require('fs');
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const [inp, out] = args.filter((a, i) => !a.startsWith('--') && !String(args[i - 1] || '').startsWith('--'));
  if (!inp || !out) { console.error('usage: captions.js transcript.json out.srt [--offset seconds] [--max-end seconds]'); process.exit(2); }
  try {
    const tr = JSON.parse(fs.readFileSync(inp, 'utf8'));
    const srt = toSrt(tr, { offset: parseFloat(flag('--offset', '0')), maxEnd: parseFloat(flag('--max-end', 'Infinity')) });
    if (!srt.trim()) { console.error('Transcript has no usable speech, so there are no captions to burn in.'); process.exit(1); }
    fs.writeFileSync(out, srt);
  } catch (e) { console.error('Could not make captions: ' + e.message); process.exit(1); }
}
