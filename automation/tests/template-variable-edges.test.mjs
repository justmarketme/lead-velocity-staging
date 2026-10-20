// Meta rejects a template whose body starts or ends on a variable ("Variables can't be at the start or end of the template",
// code 100 / subCode 2388299; missed_you_v3 + intro_media_voice_v2 were rejected for it on 20 Oct 2026). Every content file that
// asks for approval must start and end on fixed text (trailing whitespace and punctuation such as "*" or "." are ignored).
// Run: node --test automation/tests/template-variable-edges.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'twilio', 'content');
const EDGE = /[\s*_~.,:;!?()"'-]/g;
/** The body text Meta reviews, for any of the Content types the repo generates. */
const bodyOf = (types = {}) => {
  for (const t of Object.values(types)) for (const k of ['body', 'title']) if (typeof t?.[k] === 'string') return t[k];
  return null;
};
/**
 * The W28 booking / reschedule Flow launches (whatsapp/flows, body '{{1}}' + flow_token {{2}}): not on the v4 path, the Meta Flow is
 * unpublished and they are never submitted while it is. KNOWN: their body is the whole variable; fix before any submission.
 */
const FLOW_LAUNCH = new Set(['smc_flow_booking.json', 'smc_flow_reschedule.json']);
export const edgeVariable = (text) => {
  const s = String(text).replace(/^[\s*_~.,:;!?()"'-]+|[\s*_~.,:;!?()"'-]+$/g, '');
  return /^\{\{\d+\}\}/.test(s) ? 'start' : /\{\{\d+\}\}$/.test(s) ? 'end' : null;
};

test('the edge rule itself', () => {
  assert.equal(edgeVariable('Hi {{1}}, call at *{{3}} at {{4}}*.'), 'end');
  assert.equal(edgeVariable('{{1}} booked'), 'start');
  assert.equal(edgeVariable('Hi {{1}}, tap below.'), null);
  assert.equal(edgeVariable('Hi {{1}}, times:\n3. {{5}}\nTap a time below, or Other times.'), null);
  assert.ok(EDGE);
});

test('no approval-bound content body starts or ends on a {{n}} variable', () => {
  const bad = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
    const d = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
    if (!d._meta || !d._meta.approval || d._meta.approval.category === undefined) continue; // session-only: no Meta review
    if (d._meta.superseded_by) continue; // kept on disk, replaced by a newer key, never submitted again
    if (FLOW_LAUNCH.has(f)) continue;
    const body = bodyOf(d.content && d.content.types);
    if (body === null) continue;
    const e = edgeVariable(body);
    if (e) bad.push(`${f}: body ${e}s on a variable`);
  }
  assert.deepEqual(bad, []);
});
