// automation/lib/routing-split.mjs  -  test leads route only to test practices, real leads only to real advisers.
// Jono, 23 Oct 2026: "all the test information must still go to the test email. But any new and real clients coming through
// must go through to Mark's calendar." Pure, no I/O. Used by every broker-selection point: lib/w01.mjs pickBroker (W01 decide,
// W01 Lead core routeExisting, W39 pickAdviser through routingFor), W01's consent-mode broker and W03 "Load context" (the
// hand-off node passes is_test + the test ids to the SQL). Code node form: const TR = require('lv-automation').routingSplit;
// (w01 re-exports routingPool / inPool, so a node that already holds L = w01 uses those). See automation/CONTRACTS.md
// "Test leads and real leads".
//
// No DDL (schema changes on this project are owner-gated): env lists, as SYNTHETIC_TEST_NUMBERS (lib/wa.mjs).
//   SMC_TEST_BROKER_IDS  the test practices (broker uuids, comma / space separated). Unset or empty = the rule is OFF and
//                        routing is exactly as before (rollout / rollback = set / clear this one value).
//   SMC_TEST_PHONES      the internal testers' real phones (E.164; Jono, KG). Matched on digits like SYNTHETIC_TEST_NUMBERS,
//                        but these numbers are never dry-run: their messages really send.
// A lead is TEST when leads.is_synthetic, or its phone is on SYNTHETIC_TEST_NUMBERS or SMC_TEST_PHONES. With the rule on a
// test lead may go only to a test practice and a real lead only to a broker that is not one; an empty pool is the normal
// "no routable broker" hold, never a fall-through across the line.
import { digitsOf, isSyntheticNumber } from './wa.mjs';

const listOf = (v) => String(v == null ? '' : v).split(/[\s,;]+/).filter(Boolean);
const idOf = (b) => String((b && typeof b === 'object' ? (b.broker_id ?? b.id) : b) ?? '').trim().toLowerCase();

/** env SMC_TEST_BROKER_IDS -> Set of lower-case broker ids. */
export const testBrokerIds = (env = {}) => new Set(listOf(env && env.SMC_TEST_BROKER_IDS).map((s) => s.toLowerCase()));
// One number per comma / semicolon / line. Inside an entry spaces separate numbers only when every part is a whole number
// ("+27825550199 +27830000000"); otherwise they are formatting ("+27 82 555 0199").
const phoneList = (v) => String(v == null ? '' : v).split(/[,;\n]+/).flatMap((e) => {
  const parts = e.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 && parts.every((p) => digitsOf(p).length >= 9) ? parts : [e];
});
/** env SMC_TEST_PHONES -> Set of digit strings (9+ digits, matched exactly like lib/wa.mjs isSyntheticNumber). */
export const testPhones = (env = {}) => new Set(phoneList(env && env.SMC_TEST_PHONES).map(digitsOf).filter((d) => d.length >= 9));

/** lead = { phone, is_synthetic } (a leads row, or what intake knows before the row exists). */
export function isTestLead(lead = {}, env = {}) {
  const l = lead || {};
  if (l.is_synthetic === true || l.is_synthetic === 't' || l.is_synthetic === 'true') return true;
  const d = digitsOf(l.phone);
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
