// W36 Capital Legacy watch: runs the real Code nodes of automation/W36.json offline (no network, no n8n).
// Logic: sites/sortmycover/scripts/capital-legacy-watch.mjs (its own unit tests: sites/sortmycover/tests/watch.test.ts).
// Run: node --test automation/tests/W36.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCode, ifBranch, many } from './_n8ncode.mjs';

const A = join(dirname(fileURLToPath(import.meta.url)), '..');
const wf = JSON.parse(readFileSync(join(A, 'W36.json'), 'utf8'));
const watch = JSON.parse(readFileSync(join(A, '..', 'sites', 'sortmycover', 'config', 'capital-legacy-watch.json'), 'utf8'));
const node = (n) => wf.nodes.find((x) => x.name === n);

test('weekly schedule, inactive on import, W22 as error workflow, every node wired', () => {
  assert.equal(node('Weekly Mon 07:00 - Capital Legacy check').parameters.rule.interval[0].expression, '0 7 * * 1');
  assert.equal(wf.active, false);
  assert.equal(wf.settings.errorWorkflow, 'smc-w22');
  assert.equal(wf.settings.timezone, 'Africa/Johannesburg');
  const targets = new Set(Object.values(wf.connections).flatMap((c) => c.main.flat().map((l) => l.node)));
  for (const n of wf.nodes) if (!/scheduleTrigger|stickyNote/.test(n.type)) assert.ok(targets.has(n.name), `${n.name} is not connected`);
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) if (/lv-automation/.test(n.parameters.jsCode)) assert.match(n.parameters.jsCode, /require\('lv-automation'\)\.clWatch/);
});

test('the email goes out only on a live run, by the W22 Graph path, to CL_WATCH_TO or OPS_EMAIL', async () => {
  assert.equal(ifBranch(wf, 'Live send? (Email to Jonathan)', { env: { DRY_RUN_SENDS: 'true' } }), false);
  assert.equal(ifBranch(wf, 'Live send? (Email to Jonathan)', { env: { DRY_RUN_SENDS: 'false' } }), true);
  const live = wf.connections['Live send? (Email to Jonathan)'].main;
  assert.equal(live[0][0].node, 'Email Jonathan (Graph sendMail)');
  assert.equal(live[1][0].node, 'Dry-run stub (email)');
  const m = node('Email Jonathan (Graph sendMail)');
  assert.match(m.parameters.url, /graph\.microsoft\.com\/v1\.0\/users\/\{\{ \$env\.HOWZIT_MAILBOX \}\}\/sendMail/);
  assert.equal(m.credentials.oAuth2Api.name, 'MS Graph app-only - howzit@ Mail.Send');
  const stub = await runCode(wf, 'Dry-run stub (email)', { items: [{ subject: 's', text: 't', to: 'x@y' }] });
  assert.equal(stub[0].json.dry_run, true);
});

test('plans one request per watched source; FAQ entries by uid with the content API ref', async () => {
  const out = await runCode(wf, 'Plan requests', { items: [{ statusCode: 200, body: JSON.stringify({ refs: [{ ref: 'R9', isMasterRef: true }] }) }] });
  assert.equal(out.length, watch.sources.length);
  const faq = out.find((i) => i.json.id === 'faq-no-assets').json;
  assert.match(faq.url, /ref=R9/);
  assert.equal(out.find((i) => i.json.id === 'home').json.url, 'https://capitallegacy.co.za/');
});

test('compare: text unchanged since the last run needs no email; a changed page is reported once, with the pages it affects', async () => {
  const planned = (await runCode(wf, 'Plan requests', { items: [{ statusCode: 200, body: JSON.stringify({ refs: [{ ref: 'R', isMasterRef: true }] }) }] })).map((i) => i.json);
  const L = (await import('../../sites/sortmycover/scripts/capital-legacy-watch.mjs'));
  // fixture texts whose hashes we control: seed state as if last week's run stored them
  const state = { clWatch: { sources: Object.fromEntries(watch.sources.map((s) => [s.id, { hash: L.sha256(`text ${s.id}`), text: `text ${s.id}` }])) } };
  const page = (t) => `<main>${t.split('\n').map((l) => `<p>${l}</p>`).join('')}</main>`;
  const faq = (t) => JSON.stringify({ results: [{ data: { title: [{ text: t }] } }] });
  const responses = (changeId) => planned.map((p) => {
    const t = p.id === changeId ? `text ${p.id}\nA new sentence.` : `text ${p.id}`;
    return { statusCode: 200, body: p.kind === 'faq' ? faq(t) : page(t) };
  });
  const refs = { 'Plan requests': many(planned) };
  const quiet = await runCode(wf, 'Normalise, hash, compare (static data)', { items: responses(null), refs, staticData: state, env: { OPS_EMAIL: 'ops@x' } });
  assert.equal(quiet[0].json.notify, false);
  assert.equal(quiet[0].json.changed, 0);
  const changed = await runCode(wf, 'Normalise, hash, compare (static data)', { items: responses('existing-clients'), refs, staticData: state, env: { CL_WATCH_TO: 'jono@x', OPS_EMAIL: 'ops@x' } });
  const j = changed[0].json;
  assert.equal(j.notify, true);
  assert.equal(j.to, 'jono@x');
  assert.match(j.subject, /changed 1 page/);
  assert.match(j.text, /CHANGED: existing-clients/);
  assert.match(j.text, /\+ A new sentence\./);
  for (const slug of ['children-guardian', 'where-is-the-will', 'will-and-cover', 'will-myth']) assert.match(j.text, new RegExp(slug)); // cl-no-charge-will backs the provider lines on every wills page
  assert.equal(ifBranch(wf, 'Anything to report?', { json: j }), true);
  // the state moved on: the same text next week is quiet
  const again = await runCode(wf, 'Normalise, hash, compare (static data)', { items: responses('existing-clients'), refs, staticData: state, env: {} });
  assert.equal(again[0].json.notify, false);
});

test('a page that cannot be read is reported, and keeps its last good state', async () => {
  const planned = (await runCode(wf, 'Plan requests', { items: [{ statusCode: 500, body: '' }] })).map((i) => i.json);
  const state = {};
  const items = planned.map((p) => (p.id === 'trusts' ? { statusCode: 404, body: 'gone' } : p.kind === 'faq' ? { statusCode: 400, body: '' } : { statusCode: 200, body: '<main><p>x</p></main>' }));
  const out = await runCode(wf, 'Normalise, hash, compare (static data)', { items, refs: { 'Plan requests': many(planned) }, staticData: state, env: { OPS_EMAIL: 'ops@x' } });
  const j = out[0].json;
  assert.equal(j.notify, true);
  assert.ok(j.failed >= 5); // trusts + the four FAQ entries (no content API ref)
  assert.match(j.text, /trusts .*http_404/);
  assert.equal(j.to, 'ops@x');
});
