'use strict';
/* FNB statement import (6.5 bank reconciliation 1b; W18). CSV or OFX exported from FNB Online
 * Banking for Business, nightly, by Jonathan or the browser agent (HUMAN GATE). This is the
 * reconciliation of record: it confirms inContact credits and catches anything the parser missed.
 * ASSUMPTION: exact FNB CSV column names are not researched; the header row is detected by
 * looking for date + amount (or debit/credit) + description columns, so a column move is harmless. */
const crypto = require('crypto');
const { parseRandAmount } = require('./money');
const { parseReference } = require('./reference');

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function splitCsvLine(line, delim) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^'+|'+$/g, ''));
}

function parseDate(s) {
  const t = String(s || '').trim();
  let m;
  if ((m = /^(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})/.exec(t))) return iso(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})/.exec(t))) return iso(+m[3], +m[2], +m[1]);
  if ((m = /^(\d{1,2})\s?([A-Za-z]{3})[a-z]*\s?(20\d{2})/.exec(t)) && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  if ((m = /^(20\d{2})(\d{2})(\d{2})/.exec(t))) return iso(+m[1], +m[2], +m[3]); // OFX 20261003120000
  return null;
}
const iso = (y, mo, d) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function lineId(posted, cents, desc, n) {
  return 'stmt:' + crypto.createHash('sha1').update(`${posted}|${cents}|${desc}|${n}`).digest('hex').slice(0, 16);
}

function finish(rows, pricingRows) {
  // Same date + amount + description twice is two real transactions: the occurrence number keeps ids stable.
  const seen = {};
  return rows.map((r) => {
    const k = `${r.posted_on}|${r.amount_cents}|${r.description}`;
    seen[k] = (seen[k] || 0) + 1;
    const p = parseReference(r.description, pricingRows);
    return {
      ...r,
      external_id: r.fitid ? 'fitid:' + r.fitid : lineId(r.posted_on, r.amount_cents, r.description, seen[k]),
      direction: r.amount_cents > 0 ? 'credit' : 'debit',
      parsed_reference: p ? p.canonical : null,
      reference_raw: r.description,
    };
  });
}

function parseCsv(text, { pricingRows } = {}) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  let hdrIdx = -1;
  let delim = ',';
  let cols = null;
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    for (const d of [',', ';', '\t']) {
      const c = splitCsvLine(lines[i], d).map((x) => x.toLowerCase());
      const date = c.findIndex((x) => /^(transaction\s+)?date$/.test(x));
      const amount = c.findIndex((x) => /^amount$/.test(x));
      const debit = c.findIndex((x) => /^debit/.test(x));
      const credit = c.findIndex((x) => /^credit/.test(x));
      const desc = c.findIndex((x) => /description|reference|narrative|details/.test(x));
      if (date >= 0 && desc >= 0 && (amount >= 0 || credit >= 0)) { hdrIdx = i; delim = d; cols = { date, amount, debit, credit, desc }; break; }
    }
    if (cols) break;
  }
  if (!cols) return { ok: false, reason: 'csv_header_not_found', lines: [] };
  const out = [];
  const errors = [];
  for (let i = hdrIdx + 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i], delim);
    const posted = parseDate(c[cols.date]);
    let cents = null;
    if (cols.amount >= 0) cents = parseRandAmount(c[cols.amount]);
    else {
      const cr = parseRandAmount(c[cols.credit]);
      const dr = cols.debit >= 0 ? parseRandAmount(c[cols.debit]) : null;
      cents = cr ? Math.abs(cr) : dr ? -Math.abs(dr) : null;
    }
    if (!posted || cents === null) { errors.push({ line: i + 1, reason: 'unparsed' }); continue; }
    out.push({ posted_on: posted, amount_cents: cents, description: (c[cols.desc] || '').trim(), fitid: null });
  }
  return { ok: true, format: 'csv', lines: finish(out, pricingRows), errors };
}

function ofxTag(block, tag) {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block);
  return m ? m[1].trim() : null;
}

function parseOfx(text, { pricingRows } = {}) {
  const blocks = String(text).split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  if (!blocks.length) return { ok: false, reason: 'ofx_no_transactions', lines: [] };
  const out = [];
  const errors = [];
  blocks.forEach((b, i) => {
    const posted = parseDate(ofxTag(b, 'DTPOSTED'));
    const amt = ofxTag(b, 'TRNAMT');
    const cents = amt === null ? null : Math.round(Number(amt) * 100);
    const desc = [ofxTag(b, 'NAME'), ofxTag(b, 'MEMO')].filter(Boolean).join(' ');
    if (!posted || cents === null || Number.isNaN(cents)) { errors.push({ txn: i + 1, reason: 'unparsed' }); return; }
    out.push({ posted_on: posted, amount_cents: cents, description: desc, fitid: ofxTag(b, 'FITID') });
  });
  return { ok: true, format: 'ofx', lines: finish(out, pricingRows), errors };
}

function parseStatement(text, opts = {}) {
  return /<OFX>|<STMTTRN>/i.test(text) ? parseOfx(text, opts) : parseCsv(text, opts);
}

module.exports = { parseStatement, parseCsv, parseOfx, parseDate };
