'use strict';
// lv-automation: the ONLY repo module an n8n Code node may load (I-44a).
//
// Why one entry point: n8n 2.41's task runner checks NODE_FUNCTION_ALLOW_EXTERNAL with an exact string match on the
// require() request (allowList.has(request)), and its vm sandbox has no dynamic-import callback. So a Code node can
// neither import() an .mjs file nor require('lv-automation/lib/w07.mjs'). It can require('lv-automation') when that
// exact name is allowlisted, and Node 24's require(esm) loads the .mjs libs behind it (none uses top-level await;
// automation/tests/loader.test.mjs proves every name below loads that way).
//
// Code node form (the only one):   const L = require('lv-automation').w07;
//
// Resolution: n8n's runner resolves the name from its own install, so the folder is linked, never copied:
//   docker / VPS : ln -sfn /repo/automation /home/node/.node_modules/lv-automation   (compose entrypoint; $HOME/.node_modules
//                  is one of Node's global folders and HOME is passed to the runner)
//   local no-docker : ln -sfn <repo>/automation <n8n app>/node_modules/lv-automation
// The link keeps the realpath inside the repo, so '../conversation/*.mjs' below resolves to the repo's conversation/.
//
// Lazy getters: a module is loaded on first use, so one broken lib cannot stop the runner from starting
// (the runner require()s every allowlisted module once at start-up) or break unrelated workflows.
// The runner wraps what it returns in a read-only proxy: treat every export as immutable.

const MODULES = {
  // automation/lib (ESM)
  w01: './lib/w01.mjs',
  w04: './lib/w04.mjs',
  w05: './lib/w05.mjs',
  w06: './lib/w06.mjs',
  w07: './lib/w07.mjs',
  w08: './lib/w08.mjs',
  w09: './lib/w09.mjs',
  w10: './lib/w10.mjs',
  w11: './lib/w11.mjs',
  w12: './lib/w12.mjs',
  w13: './lib/w13.mjs',
  w15: './lib/w15.mjs',
  w20ms: './lib/w20-ms.mjs',
  w29: './lib/w29.mjs',
  wa: './lib/wa.mjs',
  // sub-workflows SUB-*.json (LOCAL-STAGING §7, I-48f)
  subWhatsappSend: './lib/sub-whatsapp-send.mjs',
  subCapiSend: './lib/sub-capi-send.mjs',
  subW26: './lib/sub-w26.mjs',
  subAdsBudget: './lib/sub-ads-budget.mjs',
  subVisitBeacon: './lib/sub-visit-beacon.mjs', // I-32b first-party visit beacon
  // conversation (ESM, repo root)
  logic: '../conversation/logic.mjs',
  lines: '../conversation/lines.mjs',
  pulse: '../conversation/pulse.mjs',
  guardrail: '../conversation/guardrail.mjs',
  // other automation modules
  introScript: './media/intro-script.mjs',
  verifyWebhooks: './security/verify-webhooks.js',
  leadToken: './security/lead-token.js',
  redact: './security/redact.js',
  metaAds: './ads/meta-ads.js',
  capi: './capi/capi.js',
  // data (JSON, repo root): SA public holidays for W04 slot generation (I-46c; was an fs read off $env.REPO_DIR)
  holidays: '../data/za-public-holidays.json',
};

for (const [name, path] of Object.entries(MODULES)) {
  let cached;
  Object.defineProperty(module.exports, name, {
    enumerable: true,
    get() { return cached || (cached = require(path)); },
  });
}
Object.defineProperty(module.exports, 'MODULES', { value: Object.freeze({ ...MODULES }), enumerable: false });
