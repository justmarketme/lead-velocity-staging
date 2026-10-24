// automation/lib/routing-split.mjs  -  test leads route only to test practices, real leads only to real advisers.
// Jono, 23 Oct 2026: "all the test information must still go to the test email. But any new and real clients coming through
// must go through to Mark's calendar." Pure, no I/O. Used by every broker-selection point: lib/w01.mjs pickBroker (W01 decide,
// W01 Lead core routeExisting, W39 pickAdviser through routingFor), W01's consent-mode broker and W03 "Load context" (the
// hand-off node passes is_test + the test ids to the SQL); also W38's owner alert labels and SUB-capi-send's test-lead skip.
// Code node form: const TR = require('lv-automation').routingSplit; (w01 re-exports routingPool / inPool, so a node that
// already holds L = w01 uses those). See automation/CONTRACTS.md "Test leads and real leads".
//
// No DDL (schema changes on this project are owner-gated): env lists, as SYNTHETIC_TEST_NUMBERS (lib/wa.mjs).
//   SMC_TEST_BROKER_IDS  the test practices (broker uuids, comma / space separated; quotes are ignored). Unset or empty = the
//                        rule is OFF and routing is exactly as before.
//   SMC_TEST_PHONES      the internal testers' real phones (Jono, KG). Matched on E.164 digits like SYNTHETIC_TEST_NUMBERS
//                        (lib/wa.mjs e164Digits: '+27 82 ...', '082 ...', '0027 82 ...' are one number), but these numbers are
//                        never dry-run: their messages really send.
// A lead is TEST when leads.is_synthetic, or its phone is on SYNTHETIC_TEST_NUMBERS or SMC_TEST_PHONES. With the rule on a
// test lead may go only to a test practice and a real lead only to a broker that is not one; an empty pool is the normal
// "no routable broker" hold, never a fall-through across the line.
//
// Env changes reach n8n only on a container RECREATE (`/opt/leadvelocity-n8n/dc up -d --force-recreate n8n`); a plain
// `dc restart` (and the restart at the end of import_wf.sh) keeps the old env.
// ORDER (review 23 Oct): with the rule OFF every pick ignores the split, and the pickers order differently (W01 / W39 by fill
// ratio, W03 by next free slot), so with BOTH the test practice and a real adviser live, leads cross the line both ways.
// Rollout: rule ON (env + recreate + W01 / W03 / W39 imported) BEFORE the real adviser goes live. Rollback: the real adviser
// OFF (CRM Pause) FIRST, then clear the env or re-publish the old workflow versions. Never clear the env while he is live.
import { e164Digits, isSyntheticNumber, phoneSet, syntheticNumbers } from './wa.mjs';

const unquote = (s) => String(s).replace(/^["'`]+|["'`]+$/g, '');
const listOf = (v) => String(v == null ? '' : v).split(/[\s,;]+/).map(unquote).filter(Boolean);
const idOf = (b) => String((b && typeof b === 'object' ? (b.broker_id ?? b.id) : b) ?? '').trim().toLowerCase();

/** env SMC_TEST_BROKER_IDS -> Set of lower-case broker ids. */
export const testBrokerIds = (env = {}) => new Set(listOf(env && env.SMC_TEST_BROKER_IDS).map((s) => s.toLowerCase()));
/** env SMC_TEST_PHONES -> Set of E.164 digit strings (9+ digits, matched exactly like lib/wa.mjs isSyntheticNumber). */
export const testPhones = (env = {}) => phoneSet(env && env.SMC_TEST_PHONES);
/** Every test number (SYNTHETIC_TEST_NUMBERS + SMC_TEST_PHONES) as sorted E.164 digits: for SQL that labels test leads (W38). */
export const testPhoneDigits = (env = {}) => [...new Set([...syntheticNumbers(env), ...testPhones(env)])].sort();

/** lead = { phone, is_synthetic } (a leads row, or what intake knows before the row exists). */
export function isTestLead(lead = {}, env = {}) {
  const l = lead || {};
  if (l.is_synthetic === true || l.is_synthetic === 't' || l.is_synthetic === 'true') return true;
  const d = e164Digits(l.phone);
  return isSyntheticNumber(l.phone, env) || (d.length >= 9 && testPhones(env).has(d));
}
/** broker row ({ broker_id } or { id }) or a bare id. */
export const isTestBroker = (b, env = {}) => { const id = idOf(b); return !!id && testBrokerIds(env).has(id); };

/**
 * The pool a lead may be routed in: null while SMC_TEST_BROKER_IDS is empty (no filter), else
 * { test: is this a test lead, test_broker_ids: [...] }. Plain data, so a Code node can hand it to SQL as parameters.
 */
export function routingPool(lead, env = {}) {
  const ids = testBrokerIds(env);
  return ids.size ? { test: isTestLead(lead, env), test_broker_ids: [...ids] } : null;
}
/** May this broker take a lead from this pool? A test lead: test practices only. A real lead: never a test practice. */
export const inPool = (b, pool) => !pool || (pool.test_broker_ids || []).map((x) => String(x).toLowerCase()).includes(idOf(b)) === (pool.test === true);
/** The brokers a lead in this pool may be routed to (null pool = all of them, unchanged). */
export const poolBrokers = (brokers = [], pool = null) => (pool ? (brokers || []).filter((b) => inPool(b, pool)) : brokers || []);
