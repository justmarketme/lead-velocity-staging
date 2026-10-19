#!/usr/bin/env node
// 2026-10-11: routes every direct WhatsApp send of the workflow JSON that has no generator (W07, W08, W10, W11, W23, W29)
// through smc-whatsapp-send (lib/wa-route.cjs), so WHATSAPP_PROVIDER = meta | twilio switches them too. Generated
// workflows (W03, W05, W06, W09, W12, W13, W15, W28) do the same inside their generators. Idempotent.
// usage: node automation/route-wa-sends.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { routeWaSends, directWaSends } = createRequire(import.meta.url)('./lib/wa-route.cjs');

// record:true = the sub writes the communications row (the workflow has no log node for that send).
const CONFIG = {
  W07: { caller: 'W07', nodes: {
    'Send WhatsApp (session, in 24-h window)': { record: false }, // "Store outbound" logs it
    'Send ops alert': { record: false },                           // ops (Jonathan / KG): not a lead or broker timeline
  } },
  W08: { caller: 'W08', nodes: { 'Send WhatsApp': { record: false }, 'Send close line': { record: true } } },
  W10: { caller: 'W10', nodes: { 'Send WhatsApp': { record: true } } },
  W11: { caller: 'W11', nodes: { 'Send digest': { record: true }, 'Send pre-call brief': { record: true } } },
  // W29 (19 Oct 2026, v4b16): quality ask, thanks and the +7 d fit_followup template to the broker; no log node of its own
  W29: { caller: 'W29', nodes: { 'Send WhatsApp (broker)': { record: true } } },
  W23: { caller: 'W23', nodes: {
    'WhatsApp: got it': { record: true },
    'WhatsApp: ready to approve': { record: true },
    'Reply on WhatsApp with the reason': { record: true },
  } },
};

const check = process.argv.includes('--check');
let bad = 0;
for (const [f, cfg] of Object.entries(CONFIG)) {
  const p = path.join(here, f + '.json');
  const raw = fs.readFileSync(p, 'utf8');
  const wf = JSON.parse(raw);
  const todo = directWaSends(wf);
  if (!todo.length) { console.log(`${f}: routed`); continue; }
  if (check) { console.error(`${f}: direct WhatsApp sends ${todo.join(', ')}`); bad++; continue; }
  const unknown = todo.filter((n) => !(n in cfg.nodes));
  if (unknown.length) { console.error(`${f}: no route config for ${unknown.join(', ')}`); bad++; continue; }
  const indent = /^\{\n( +)"/.exec(raw)?.[1].length || 2;
  fs.writeFileSync(p, JSON.stringify(routeWaSends(wf, cfg), null, indent) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`${f}: routed ${todo.join(', ')}`);
}
process.exit(bad ? 1 : 0);
