// smc-w26 (LOCAL-STAGING §7, automation/vps/W26.md, I-48h): the n8n side of the go-live runner. Pure functions;
// automation/SUB-w26-runner.json does the SQL. Code node form: const L = require('lv-automation').subW26;
// It NEVER provisions, buys, unpauses or calls Meta: it records signals and a to-do for Jonathan.
//   first payment (W16, Execute Workflow): { op: 'first_payment', broker_id, cycle_id } (broker need not be onboarded)
//   POST /webhook/w26/status (provision.sh notify()): { step, name, ok, vps } signed with INTERNAL_HMAC_SECRET:
//     X-LV-Timestamp: <unix s>, X-LV-Signature: sha256=<hex HMAC-SHA256("<ts>.<raw body>")>. No broker_id in it, so
//     'ready' matches every onboarded broker that has a pending go-live row and no go_live_ready row yet.
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
const require = createRequire(import.meta.url);
const VW = require('../security/verify-webhooks.js');

const hdr = (h = {}, k) => { const f = Object.keys(h).find((x) => x.toLowerCase() === k); return f ? String(h[f]) : ''; };

/** HMAC + 5-min replay window. Returns { ok, reason?, body? }. */
export function verifyStatus({ headers = {}, raw = '', body = null, secret = '', nowMs = Date.now() } = {}) {
  if (!secret) return { ok: false, reason: 'no_secret' };
  const ts = hdr(headers, 'x-lv-timestamp');
  const sig = hdr(headers, 'x-lv-signature').replace(/^sha256=/i, '').trim().toLowerCase();
  if (!ts || !sig) return { ok: false, reason: 'missing_signature' };
  const win = VW.checkReplayWindow(ts, { nowMs, toleranceSec: 300 });
  if (!win.ok) return { ok: false, reason: win.reason };
  const want = createHmac('sha256', secret).update(`${ts}.${raw}`, 'utf8').digest('hex');
  if (!VW.timingSafeEqualStr(sig, want)) return { ok: false, reason: 'bad_signature' };
  let b = body;
  if (b == null || typeof b !== 'object') { try { b = JSON.parse(raw); } catch (e) { return { ok: false, reason: 'bad_json' }; } }
  return { ok: true, body: b };
}

/** { step, name, ok, vps } -> 'failed' | 'ready' | 'progress' + the fields the next nodes need. */
export function routeStatus(b = {}) {
  const step = b.step == null ? null : b.step;
  const name = String(b.name || '');
  const vps = String(b.vps || '');
  const ok = b.ok === true || b.ok === 'true';
  const action = !ok ? 'failed' : name === 'ready' ? 'ready' : 'progress';
  return { action, step, name, vps, ok, evidence: JSON.stringify({ step, name, vps, at_step: 'provision.sh notify()' }) };
}

/** First-payment hook (W16). Accepts the W16 invoice item too (broker_id / cycle_id on it). */
export function normaliseFirstPayment(input = {}) {
  const i = input || {};
  const out = { op: i.op || 'first_payment', broker_id: i.broker_id ? String(i.broker_id) : null, cycle_id: i.cycle_id ? String(i.cycle_id) : null };
  return { ...out, valid: out.op === 'first_payment' && !!out.broker_id };
}

/**
 * What to record on first payment. A VPS already there (VPS_HOST set) -> skip to readiness (go_live_pending);
 * otherwise open GATE-VPS (go_live_vps_gate) with one to-do for Jonathan (W26.md step 1: buy link; default "leads keep
 * running on the laptop"). Either row is the "pending go-live row" that a later signed `ready` matches.
 */
export function firstPaymentPlan(n, env = {}) {
  const vpsExists = !!String(env.VPS_HOST || '').trim();
  const signal_key = vpsExists ? 'go_live_pending' : 'go_live_vps_gate';
  return {
    broker_id: n.broker_id,
    cycle_id: n.cycle_id,
    signal_key,
    dedupe_key: `go_live:${signal_key}:${n.broker_id}`,
    what: vpsExists ? 'First payment received; VPS already live, waiting for readiness checks' : 'First payment received: buy the VPS (W26 step 1)',
    proposal_title: vpsExists ? 'Go-live readiness: wait for the signed ready signal from provision.sh' : 'Buy the VPS for go-live (W26 step 1, Hostinger link in W26.md); default: leads keep running on the laptop',
    payload: JSON.stringify({ step: vpsExists ? 'readiness' : 1, broker_id: n.broker_id, cycle_id: n.cycle_id, buy_link_env: 'HOSTINGER_VPS_URL', default: 'leads keep running on the laptop', gate: vpsExists ? null : 'GATE-VPS' }),
  };
}

/** W22 producer item for a failed provision step (workflow_failed with the step name). */
export const failedSignal = (r) => ({ signal_key: 'workflow_failed', scope: 'w26:step:' + String(r.step), severity: 'red', what: `W26 provision step ${r.step} (${r.name || '?'}) failed on ${r.vps || 'the VPS'}`, impact: 'Go-live is halted; nothing was unpaused', first_action: `Fix, then run provision.sh --apply --from ${r.step}`, source: 'smc-w26' });
