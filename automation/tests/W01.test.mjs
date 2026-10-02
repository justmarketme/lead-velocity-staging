// DRAFT for GATE-TEST-W01 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W01 Lead intake (web)  [+ the intake halves of W02 instant form and W03 Click-to-WhatsApp, which 4.6 says
// work "same as W01"].
// Money rule protected: we only ever count, message and charge for a real, consented, SA mobile lead that is
// not a duplicate, and the broker it is routed to is written BEFORE the first WhatsApp (1.3, 3.3, 2.1.2).
//
// Run:  node --test automation/tests/W01.test.mjs           (offline, reference implementation below)
//       N8N_PUBLIC_URL=https://<tunnel> TEST_HOOKS_TOKEN=... node --test automation/tests/W01.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX, MODE, lead, broker, cycle, clone, ms, iso, D, H, MIN, sha256, online } from './_harness.mjs';

// ============================================================================================
// Reference implementation (offline). This IS the rule, written small. The n8n workflow must behave the same.
// ============================================================================================
const QUAL_AGE = new Set(FIX._meta.band_codes.qualifying_age);
const QUAL_BUDGET = new Set(FIX._meta.band_codes.qualifying_budget);
const DEDUPE_DAYS = 90;
const OUT_OF_BAND_RETENTION_H = 24; // 2.1.7: out-of-band submissions deleted within 24 h
const IP_LIMIT_PER_HOUR = 10; // 6B.5 rate limit on /lead (ASSUMPTION: value tuned in staging)

/** SA number as typed -> E.164 (+27XXXXXXXXX) or null. Accepts 0XX, +27, 0027, 27, spaces, dashes, brackets. */
export function toE164(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  else if (s.startsWith('0')) s = '27' + s.slice(1);
  return /^27[1-9]\d{8}$/.test(s) ? '+' + s : null;
}

function newDb() {
  return { leads: new Map(), capi: [], jobs: [], activities: [], suppression: [], messages: [], ipHits: [] };
}
const activeBroker = (brandId) =>
  FIX.brokers.find((b) => b.brand_id === brandId && b.status === 'active' && b.routing_on);

function capiSend(db, leadRow, eventName, eventId, actionSource) {
  if (!leadRow.consent_ads_at) return; // consent gate (event-spec "Consent gate")
  if (db.capi.some((e) => e.event_id === eventId && e.event_name === eventName)) return; // unique(event_id, event_name)
  db.capi.push({ lead_id: leadRow.id, event_name: eventName, event_id: eventId, action_source: actionSource });
}

/** Shared tail for every channel once a consented, valid number exists. */
function admit(db, row, now) {
  const supp = db.suppression.some((s) => s.mobile_hash === sha256(row.mobile));
  const bandsOk = QUAL_AGE.has(row.age_band) && QUAL_BUDGET.has(row.budget_band);
  if (!bandsOk) {
    Object.assign(row, {
      qualified: false,
      disqualified_reason: !QUAL_AGE.has(row.age_band) ? 'age_band' : 'budget_band',
      broker_id: null,
      stage: 'unbooked_closed',
      retention_delete_after: iso(now + OUT_OF_BAND_RETENTION_H * H),
    });
    db.leads.set(row.id, row);
    return { http_status: 200, body: { status: 'not_qualified', lead_id: row.id } };
  }
  const b = activeBroker(row.brand_id);
  // Named consent (0.1 default): the practice named in the consent text must be the broker we route to.
  if (b && row.consent_mode_at_capture === 'named' && !row.consent_text.includes(b.practice_name)) {
    Object.assign(row, { broker_id: null, stage: 'new', routing_reason: 'held_consent_names_other_practice' });
    db.leads.set(row.id, row);
    return { http_status: 200, body: { status: 'held', lead_id: row.id } };
  }
  if (!b) {
    Object.assign(row, { broker_id: null, stage: 'new', routing_reason: 'held_no_capacity' });
    db.leads.set(row.id, row);
    return { http_status: 200, body: { status: 'held', lead_id: row.id } };
  }
  Object.assign(row, {
    qualified: null, // set true only once verified (3.3); bands are met
    broker_id: b.broker_id,
    cycle_id: b.current_cycle_id,
    tier_code: b.tier_code,
    routed_at: iso(now),
    routing_reason: 'single_broker',
    stage: supp ? 'suppressed' : 'new',
  });
  db.leads.set(row.id, row);
  if (!supp) db.jobs.push({ workflow: 'W06', lead_id: row.id, not_before: row.routed_at });
  return { http_status: 200, body: { status: 'accepted', lead_id: row.id, broker_id: b.broker_id } };
}

function findDuplicate(db, brandId, mobile, now) {
  return [...db.leads.values()].find(
    (l) => l.brand_id === brandId && l.mobile === mobile && now - ms(l.created_at) <= DEDUPE_DAYS * D && !l.duplicate_of,
  );
}

export function intakePage(db, sub, { now, lineType, leadId }) {
  if (sub.honeypot) return { http_status: 200, body: { status: 'accepted' } }; // bot: pretend, store nothing
  const ip = sub.context?.client_ip;
  db.ipHits = db.ipHits.filter((h) => now - h.t < H);
  if (ip && db.ipHits.filter((h) => h.ip === ip).length >= IP_LIMIT_PER_HOUR)
    return { http_status: 429, body: { status: 'rejected', error_code: 'rate_limited' } };
  if (ip) db.ipHits.push({ ip, t: now });

  const mobile = toE164(sub.mobile);
  if (!mobile) return { http_status: 422, body: { status: 'rejected', error_code: 'invalid_number', page_message: 'Please enter a valid SA mobile number.' } };
  if (!sub.consent?.checked || !sub.consent?.text)
    return { http_status: 422, body: { status: 'rejected', error_code: 'consent_required', page_message: 'Please tick the box so we can share your details.' } };

  let lt;
  try { lt = lineType(mobile); } catch { lt = 'unknown'; } // Lookup outage: fail open, WhatsApp delivery is the real test
  if (lt !== 'mobile' && lt !== 'unknown')
    return { http_status: 422, body: { status: 'rejected', error_code: 'not_mobile', page_message: 'Please use a mobile number.' } };

  const dup = findDuplicate(db, sub.brand_id, mobile, now);
  if (dup) {
    db.activities.push({ lead_id: dup.id, workflow: 'W01', kind: 'duplicate_submission', payload: { ad_id: sub.context?.ad_id, at: iso(now) } });
    return { http_status: 200, body: { status: 'duplicate', duplicate_of: dup.id } };
  }
  const c = sub.context || {};
  const row = {
    id: leadId, brand_id: sub.brand_id, origin: 'page', is_synthetic: !!sub.is_synthetic, created_at: iso(now),
    first_name: sub.first_name, mobile, line_type: lt, line_type_unverified: lt === 'unknown', language: sub.language,
    age_band: sub.quiz?.age_band, budget_band: sub.quiz?.budget_band, has_bond: sub.quiz?.has_bond, has_dependants: sub.quiz?.has_dependants,
    consent_text: sub.consent.text, consent_text_version: sub.consent.version, consent_at: sub.consent.at,
    consent_page_url: sub.consent.page_url, consent_source: sub.consent.source,
    consent_mode_at_capture: FIX.brand.consent_mode,
    consent_ads_at: sub.consent.includes_ads_sentence ? sub.consent.at : null,
    lead_event_id: c.event_id ?? null, fbclid: c.fbclid ?? null, fbp: c.fbp ?? null, fbc: c.fbc ?? null, ad_id: c.ad_id ?? null,
    utm_source: c.utm_source ?? null, utm_medium: c.utm_medium ?? null, utm_campaign: c.utm_campaign ?? null,
    utm_content: c.utm_content ?? null, utm_term: c.utm_term ?? null, page_url: c.page_url ?? null,
    client_ip: c.client_ip ?? null, client_user_agent: c.client_user_agent ?? null,
  };
  const res = admit(db, row, now);
  if (res.body.status === 'accepted' || res.body.status === 'held')
    capiSend(db, row, 'Lead', c.event_id || `evt_${row.id}_lead`, 'website');
  return res;
}

/** W02: Meta instant form -> same pipeline. */
export function intakeLeadAd(db, p, { now, lineType, leadId }) {
  const f = Object.fromEntries(p.field_data.map((x) => [x.name, x.values[0]]));
  const mobile = toE164(f.phone_number);
  const consented = p.custom_disclaimer_responses?.some((r) => r.checkbox_key === 'consent' && String(r.is_checked) === '1');
  if (!mobile || !consented) return { http_status: 200, body: { status: 'rejected', error_code: !mobile ? 'invalid_number' : 'consent_required' } };
  let lt;
  try { lt = lineType(mobile); } catch { lt = 'unknown'; }
  if (lt !== 'mobile' && lt !== 'unknown') return { http_status: 200, body: { status: 'rejected', error_code: 'not_mobile' } };
  const dup = findDuplicate(db, 'smc', mobile, now);
  if (dup) return { http_status: 200, body: { status: 'duplicate', duplicate_of: dup.id } };
  const text = FIX.consent_texts[p.consent_text_version];
  const row = {
    id: leadId, brand_id: 'smc', origin: 'lead_ad', is_synthetic: !!p.is_synthetic, created_at: iso(now),
    first_name: f.first_name, mobile, line_type: lt, age_band: f.age_band, budget_band: f.budget_band,
    has_bond: f.has_bond === 'yes', has_dependants: f.has_dependants === 'yes', preferred_method: f.preferred_method,
    consent_text: text, consent_text_version: p.consent_text_version, consent_at: p.created_time, consent_source: 'lead_ad',
    consent_mode_at_capture: FIX.brand.consent_mode, consent_ads_at: text.includes('advertising') ? p.created_time : null,
    leadgen_id: p.leadgen_id, ad_id: p.ad_id, adset_id: p.adset_id, campaign_id: p.campaign_id,
  };
  const res = admit(db, row, now);
  if (res.body.status === 'accepted') capiSend(db, row, 'Lead', `evt_${row.id}_lead`, 'system_generated');
  return res;
}

/** W03: CTWA conversation -> consent first, tap-only qualifying, then route. */
export function intakeCtwa(db, convo, { lineType, leadId }) {
  const mobile = toE164('+' + convo.wa_id);
  const out = []; // messages we send
  let row = null;
  for (const m of convo.inbound) {
    const t = ms(m.at);
    if (m.referral) { out.push({ at: iso(t), kind: 'consent_buttons', text: FIX.consent_texts[convo.consent_text_version] }); continue; }
    if (m.payload === 'consent_no') {
      db.suppression.push({ mobile_hash: sha256(mobile), source: 'no_consent_ctwa', brand_id: 'smc', lead_id: null, added_at: iso(t) });
      out.push({ at: iso(t), kind: 'polite_close' });
      db.messages.push(...out.map((o) => ({ ...o, to: mobile })));
      return { lead: null, messages: out };
    }
    if (m.payload === 'consent_yes') {
      const first = convo.inbound[0];
      let lt;
      try { lt = lineType(mobile); } catch { lt = 'unknown'; }
      row = {
        id: leadId, brand_id: 'smc', origin: 'ctwa', is_synthetic: true, created_at: iso(t), first_name: convo.profile_name,
        mobile, line_type: lt, verified_at: iso(t), wa_delivered_at: first.at,
        consent_text: FIX.consent_texts[convo.consent_text_version], consent_text_version: convo.consent_text_version,
        consent_at: iso(t), consent_source: 'ctwa', consent_mode_at_capture: 'generic', consent_ads_at: null,
        ctwa_clid: first.referral.ctwa_clid, ad_id: first.referral.source_id, stage: 'new',
      };
      db.leads.set(row.id, row);
      // business-messaging Lead (event-spec): not gated on consent_ads (CTWA has no ads sentence) -> logged separately
      db.capi.push({ lead_id: row.id, event_name: 'Lead', event_id: `evt_${row.id}_ctwa_lead`, action_source: 'business_messaging' });
      continue;
    }
    if (!row) continue;
    if (m.payload.startsWith('age_')) row.age_band = m.payload.slice(4);
    if (m.payload.startsWith('budget_')) row.budget_band = m.payload.slice(7);
    if (m.payload.startsWith('bond_')) { row.has_bond = m.payload.includes('bond_yes'); row.has_dependants = m.payload.includes('dependants_yes'); }
    if (m.payload.startsWith('method_')) row.preferred_method = m.payload.slice(7);
    const ageOut = row.age_band && !QUAL_AGE.has(row.age_band);
    const budOut = row.budget_band && !QUAL_BUDGET.has(row.budget_band);
    if (ageOut || budOut) {
      Object.assign(row, { qualified: false, disqualified_reason: ageOut ? 'age_band' : 'budget_band', broker_id: null, stage: 'unbooked_closed', retention_delete_after: iso(t + OUT_OF_BAND_RETENTION_H * H) });
      out.push({ at: iso(t), kind: 'polite_close' });
      break;
    }
    if (row.preferred_method) {
      const b = activeBroker('smc');
      Object.assign(row, { broker_id: b.broker_id, cycle_id: b.current_cycle_id, routed_at: iso(t), routing_reason: 'single_broker' });
      db.jobs.push({ workflow: 'W06', lead_id: row.id, not_before: row.routed_at });
    }
  }
  db.messages.push(...out.map((o) => ({ ...o, to: mobile })));
  return { lead: row, messages: out };
}

// ============================================================================================
// Adapters: the same assertions run offline (reference) or online (n8n webhooks).
// ============================================================================================
function offlineSystem() {
  const db = newDb();
  const lt = (fx) => () => fx.lookup?.line_type ?? 'mobile';
  return {
    db,
    page: async (fx, opts = {}) => intakePage(db, opts.sub ?? fx.submission, { now: opts.now ?? ms(fx.submission.submitted_at), lineType: opts.lineType ?? lt(fx), leadId: opts.leadId ?? fx.lead_id ?? `lead_test_${fx.fixture_id}` }),
    leadAd: async (fx) => intakeLeadAd(db, fx.submission, { now: ms(fx.submission.created_time), lineType: lt(fx), leadId: fx.lead_id }),
    ctwa: async (fx) => intakeCtwa(db, fx.submission, { lineType: lt(fx), leadId: fx.lead_id ?? `lead_test_${fx.fixture_id}` }),
    state: async (leadId) => ({
      lead: db.leads.get(leadId) ?? null,
      capi: db.capi.filter((e) => e.lead_id === leadId),
      jobs: db.jobs.filter((j) => j.lead_id === leadId),
      activities: db.activities.filter((a) => a.lead_id === leadId),
    }),
    leadsByMobile: async (m) => [...db.leads.values()].filter((l) => l.mobile === m),
    suppression: async () => db.suppression,
    messagesTo: async (m) => db.messages.filter((x) => x.to === m),
    suppress: async (m) => db.suppression.push({ mobile_hash: sha256(m), source: 'stop', brand_id: null }),
  };
}

function onlineSystem() {
  const hdr = (fx, o = {}) => ({ 'x-test-lookup-line-type': o.lineTypeName ?? fx.lookup?.line_type ?? 'mobile' });
  return {
    page: async (fx, opts = {}) => online.post('/lead', opts.sub ?? fx.submission, { now: opts.now ?? fx.submission.submitted_at, headers: hdr(fx, opts) }),
    leadAd: async (fx) => online.post('/test/leadgen', fx.submission, { now: fx.submission.created_time, headers: hdr(fx) }),
    ctwa: async (fx) => {
      for (const m of fx.submission.inbound)
        await online.waInbound({ from: fx.submission.wa_id, now: ms(m.at), text: m.text, buttonPayload: m.type === 'button' ? m.payload : undefined, listId: m.type === 'list' ? m.payload : undefined });
      const s = await online.get(`/test/state?mobile=%2B${fx.submission.wa_id}`);
      return { lead: s.body?.lead ?? null, messages: s.body?.messages ?? [] };
    },
    state: (leadId) => online.state(leadId),
    leadsByMobile: async (m) => (await online.get(`/test/state?mobile=${encodeURIComponent(m)}`)).body?.leads ?? [],
    suppression: async () => (await online.get('/test/suppression')).body ?? [],
    messagesTo: async (m) => (await online.get(`/test/state?mobile=${encodeURIComponent(m)}`)).body?.messages ?? [],
    suppress: async (m) => online.post('/test/suppress', { mobile: m, source: 'stop' }),
  };
}
const fresh = () => (MODE === 'online' ? onlineSystem() : offlineSystem());

// ============================================================================================
// Tests
// ============================================================================================
test(`W01 [${MODE}] SA numbers normalise to E.164; anything else is refused`, () => {
  const ok = { '060 000 0001': '+27600000001', '+27 60 000 0001': '+27600000001', '0027600000001': '+27600000001', '27600000001': '+27600000001', '060-000-0010': '+27600000010', '(060) 000 0002': '+27600000002' };
  for (const [raw, want] of Object.entries(ok)) assert.equal(toE164(raw), want, raw);
  for (const bad of ['12345', '060 000 001', '+44 20 7946 0000', '0000000000', '', null, '+27 0600000001'])
    assert.equal(toE164(bad), null, String(bad));
});

test(`W01 [${MODE}] every page fixture gets the expected intake result`, async () => {
  const sys = fresh();
  for (const id of ['L01', 'L02', 'L07', 'L08', 'L10']) {
    const fx = lead(id);
    const exp = fx.expected.W01;
    const r = await sys.page(fx);
    assert.equal(r.http_status ?? r.status, exp.http_status, `${id} http`);
    assert.equal(r.body.status, exp.status, `${id} status`);
    if (exp.error_code) assert.equal(r.body.error_code, exp.error_code);
    if (exp.page_message) assert.equal(r.body.page_message, exp.page_message);
    if (exp.lead_row === false) {
      assert.equal((await sys.leadsByMobile(toE164(fx.submission.mobile))).length, 0, `${id} must not be stored`);
      continue;
    }
    const s = await sys.state(r.body.lead_id);
    if (exp.mobile) assert.equal(s.lead.mobile, exp.mobile);
    if ('broker_id' in exp) assert.equal(s.lead.broker_id ?? null, exp.broker_id, `${id} broker`);
    if (exp.delete_after) assert.equal(s.lead.retention_delete_after, exp.delete_after, `${id} out-of-band deleted within 24 h`);
    if (exp.first_touch === false) assert.equal(s.jobs.filter((j) => j.workflow === 'W06').length, 0, `${id} no WhatsApp`);
    if (exp.capi_lead === false) assert.equal(s.capi.filter((e) => e.event_name === 'Lead').length, 0, `${id} no CAPI Lead`);
  }
});

test(`W01 [${MODE}] landline and VoIP are rejected at the page with a friendly message; nothing stored`, async () => {
  const sys = fresh();
  for (const t of ['landline', 'voip', 'fixedVoip', 'nonFixedVoip', 'tollFree']) {
    const fx = clone(lead('L08'));
    fx.lookup.line_type = t;
    const r = await sys.page(fx, { lineType: () => t, lineTypeName: t });
    assert.equal(r.http_status ?? r.status, 422, t);
    assert.equal(r.body.page_message, 'Please use a mobile number.');
  }
  assert.equal((await sys.leadsByMobile('+27600000008')).length, 0);
});

test(`W01 [${MODE}] consent text, version, time, page and source are stored verbatim; attribution kept`, async () => {
  const sys = fresh();
  const fx = lead('L01');
  const r = await sys.page(fx);
  const l = (await sys.state(r.body.lead_id)).lead;
  const c = fx.submission.consent;
  assert.equal(l.consent_text, c.text);
  assert.equal(l.consent_text_version, c.version);
  assert.equal(ms(l.consent_at), ms(c.at));
  assert.equal(l.consent_page_url, c.page_url);
  assert.equal(l.consent_source, 'page');
  assert.equal(l.consent_mode_at_capture, 'named');
  assert.ok(l.consent_ads_at, 'advertising sentence ticked -> consent_ads_at set');
  for (const k of ['fbclid', 'fbp', 'fbc', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ad_id'])
    assert.equal(l[k], fx.submission.context[k], k);
  assert.equal(l.lead_event_id, fx.submission.context.event_id);
});

test(`W01 [${MODE}] unticked or missing consent -> 422, nothing stored`, async () => {
  const sys = fresh();
  for (const mutate of [(s) => { s.consent.checked = false; }, (s) => { delete s.consent; }]) {
    const fx = clone(lead('L02'));
    mutate(fx.submission);
    const r = await sys.page(fx, { sub: fx.submission });
    assert.equal(r.http_status ?? r.status, 422);
    assert.equal(r.body.error_code, 'consent_required');
  }
  assert.equal((await sys.leadsByMobile('+27600000002')).length, 0);
});

test(`W01 [${MODE}] routing writes broker_id (and cycle) BEFORE the first-touch job exists`, async () => {
  const sys = fresh();
  const fx = lead('L01');
  const r = await sys.page(fx);
  const s = await sys.state(r.body.lead_id);
  assert.equal(s.lead.broker_id, broker().broker_id);
  assert.equal(s.lead.cycle_id, cycle().cycle_id);
  assert.ok(s.lead.routed_at, 'routed_at written');
  const ft = s.jobs.find((j) => j.workflow === 'W06');
  assert.ok(ft, 'first-touch job queued');
  assert.ok(ms(ft.not_before) >= ms(s.lead.routed_at), 'first touch can never precede routing');
});

test(`W01 [${MODE}] named consent must name the broker we route to, otherwise the lead is held (not messaged)`, async () => {
  const sys = fresh();
  const fx = clone(lead('L02'));
  fx.submission.consent.text = fx.submission.consent.text.replace('Mark Smith Financial Services (FSP 00000)', 'Other Practice (FSP 99999)');
  const r = await sys.page(fx, { sub: fx.submission });
  assert.equal(r.body.status, 'held');
  const s = await sys.state(r.body.lead_id);
  assert.equal(s.lead.broker_id ?? null, null);
  assert.equal(s.jobs.filter((j) => j.workflow === 'W06').length, 0);
});

test(`W01 [${MODE}] CAPI Lead reuses the browser event_id; fallback evt_<lead_id>_lead; no ads consent -> not sent`, async () => {
  const sys = fresh();
  const r1 = await sys.page(lead('L01'));
  const s1 = await sys.state(r1.body.lead_id);
  assert.deepEqual(s1.capi.filter((e) => e.event_name === 'Lead').map((e) => e.event_id), [lead('L01').expected.W01.capi_lead_event_id]);

  const fx2 = clone(lead('L02'));
  delete fx2.submission.context.event_id; // JS off
  const r2 = await sys.page(fx2, { sub: fx2.submission });
  const s2 = await sys.state(r2.body.lead_id);
  assert.deepEqual(s2.capi.map((e) => e.event_id), [`evt_${r2.body.lead_id}_lead`]);

  const fx3 = clone(lead('L10'));
  fx3.submission.consent.includes_ads_sentence = false;
  const r3 = await sys.page(fx3, { sub: fx3.submission });
  assert.equal((await sys.state(r3.body.lead_id)).capi.length, 0, 'consent gate');
});

test(`W01 [${MODE}] duplicate within 90 days merges: no new lead, no WhatsApp, no CAPI Lead; day 91 is a new lead`, async () => {
  const sys = fresh();
  const first = await sys.page(lead('L01'));
  const dupFx = lead('L09');
  const r = await sys.page(dupFx, { leadId: 'lead_test_L09' });
  assert.equal(r.body.status, 'duplicate');
  assert.equal(r.body.duplicate_of, first.body.lead_id);
  assert.equal((await sys.leadsByMobile('+27600000001')).length, 1, 'one lead row');
  const s = await sys.state(first.body.lead_id);
  assert.equal(s.jobs.filter((j) => j.workflow === 'W06').length, 1, 'no second first-touch');
  assert.equal(s.capi.filter((e) => e.event_name === 'Lead').length, 1, 'no second CAPI Lead');
  assert.ok(s.activities.some((a) => a.kind === 'duplicate_submission'), 'merge logged on the timeline');

  // Same person resubmits 91 days after the first lead -> a new lead.
  const late = clone(lead('L09'));
  const t91 = ms(lead('L01').submission.submitted_at) + 91 * D;
  late.submission.submitted_at = iso(t91);
  late.submission.context.event_id = '5b0f7a2e-0009-4c1a-9a51-000000000091';
  const r91 = await sys.page(late, { sub: late.submission, now: t91, leadId: 'lead_test_L09_day91' });
  assert.equal(r91.body.status, 'accepted');
});

test(`W01 [${MODE}] double-submit (same event_id, same number) is idempotent`, async () => {
  const sys = fresh();
  const fx = lead('L10');
  const a = await sys.page(fx);
  const b = await sys.page(fx, { now: ms(fx.submission.submitted_at) + 3000, leadId: 'lead_test_L10_again' });
  assert.equal(b.body.status, 'duplicate');
  assert.equal(b.body.duplicate_of, a.body.lead_id);
  assert.equal((await sys.state(a.body.lead_id)).capi.length, 1);
});

test(`W01 [${MODE}] honeypot filled -> looks accepted to the bot, nothing stored, nothing sent (6B.5)`, async () => {
  const sys = fresh();
  const fx = clone(lead('L02'));
  fx.submission.honeypot = 'http://spam.example';
  const r = await sys.page(fx, { sub: fx.submission });
  assert.equal(r.http_status ?? r.status, 200);
  assert.equal((await sys.leadsByMobile('+27600000002')).length, 0);
});

test(`W01 [${MODE}] more than ${IP_LIMIT_PER_HOUR} submissions per IP per hour -> 429`, async (t) => {
  if (MODE === 'online') return t.skip('rate limit is exercised by the devops-security load test, not here');
  const sys = fresh();
  let last;
  for (let i = 0; i <= IP_LIMIT_PER_HOUR; i++) {
    const fx = clone(lead('L02'));
    fx.submission.mobile = `0600000${String(20 + i).padStart(3, '0')}`;
    last = await sys.page(fx, { sub: fx.submission, now: ms(fx.submission.submitted_at) + i * MIN, leadId: `lead_rl_${i}` });
  }
  assert.equal(last.http_status, 429);
});

test(`W01 [${MODE}] Lookup outage fails open: lead accepted, line_type 'unknown' flagged (speed beats a dead API)`, async (t) => {
  if (MODE === 'online') return t.skip('needs a Lookup fault-injection hook; covered in the 6B.10 drill');
  const sys = fresh();
  const r = await sys.page(lead('L02'), { lineType: () => { throw new Error('twilio 503'); } });
  assert.equal(r.body.status, 'accepted');
  const l = (await sys.state(r.body.lead_id)).lead;
  assert.equal(l.line_type, 'unknown');
  assert.equal(l.line_type_unverified, true);
});

test(`W01 [${MODE}] a suppressed (STOPped) number is stored but never messaged`, async () => {
  const sys = fresh();
  await sys.suppress('+27600000002');
  const r = await sys.page(lead('L02'));
  const s = await sys.state(r.body.lead_id);
  assert.equal(s.jobs.filter((j) => j.workflow === 'W06').length, 0);
});

test(`W02 parity [${MODE}] instant-form lead (L03) gets the same treatment as a page lead`, async () => {
  const sys = fresh();
  const fx = lead('L03');
  const r = await sys.leadAd(fx);
  assert.equal(r.body.status, 'accepted');
  const s = await sys.state(r.body.lead_id);
  assert.equal(s.lead.mobile, fx.expected.W01.mobile);
  assert.equal(s.lead.leadgen_id, fx.expected.W01.leadgen_id);
  assert.equal(s.lead.broker_id, fx.expected.W01.broker_id);
  assert.equal(s.lead.consent_text, FIX.consent_texts['named-v1-DRAFT']);
  assert.deepEqual(s.capi.map((e) => e.event_id), [`evt_${r.body.lead_id}_lead`]);
});

test(`W03 parity [${MODE}] CTWA consent-yes (L04): row at consent, verified by the tap, routed after qualifying`, async () => {
  const sys = fresh();
  const fx = lead('L04');
  const { lead: l } = await sys.ctwa(fx);
  const e = fx.expected.W01;
  assert.equal(ms(l.created_at), ms(e.lead_row_at));
  assert.equal(ms(l.verified_at), ms(e.verified_at));
  assert.equal(ms(l.routed_at), ms(e.routed_at));
  assert.equal(l.broker_id, e.broker_id);
  assert.equal(l.consent_text_version, e.consent_text_version);
  assert.equal(l.ctwa_clid, e.ctwa_clid);
});

test(`W03 parity [${MODE}] CTWA consent-no (L05): no lead row, only a hashed number for suppression, broker never named`, async () => {
  const sys = fresh();
  const fx = lead('L05');
  const { lead: l } = await sys.ctwa(fx);
  assert.equal(l, null);
  assert.equal((await sys.leadsByMobile('+27600000005')).length, 0);
  const supp = (await sys.suppression()).filter((s) => s.mobile_hash === sha256('+27600000005'));
  assert.equal(supp.length, 1);
  assert.equal(supp[0].source, 'no_consent_ctwa');
  const msgs = await sys.messagesTo('+27600000005');
  assert.ok(!JSON.stringify(msgs).includes(broker().practice_name), 'broker not named to a non-consenting person');
});

test(`W03 parity [${MODE}] CTWA out-of-band age (L06): polite close, no hand-over, deleted within 24 h`, async () => {
  const sys = fresh();
  const fx = lead('L06');
  const { lead: l, messages } = await sys.ctwa(fx);
  const e = fx.expected.W01;
  assert.equal(l.qualified, false);
  assert.equal(l.disqualified_reason, e.disqualified_reason);
  assert.equal(l.broker_id ?? null, null);
  assert.equal(ms(l.retention_delete_after), ms(e.delete_after));
  assert.ok(messages.some((m) => m.kind === 'polite_close'));
});
