'use strict';
/* Meta Marketing API client for SortMyCover. Node 18+, no dependencies (crypto + global fetch).
 * - System-user token only, sent as Authorization: Bearer (never in the URL, never logged).
 * - Back-off at 80% of X-Business-Use-Case-Usage / X-Ad-Account-Usage / X-App-Usage (0.3 #11).
 * - Batch endpoint, <= 50 calls per request (6.2).
 * - Every WRITE needs a confirmToken minted by requestConfirm() (confirm-to-apply, 6.2) and returns
 *   audit_log + ops.notifications ROWS. This module never touches the database: the DB write is n8n's.
 * - Insights are never fetched more often than hourly.
 * Nothing is sent unless a caller invokes a function with a real token. */
const crypto = require('crypto');

// ASSUMPTION: v23.0 is a current Graph API version; override with META_API_VERSION.
const DEFAULT_API_VERSION = 'v23.0';
function apiVersion() {
  const v = String(process.env.META_API_VERSION || DEFAULT_API_VERSION).trim();
  return v.startsWith('v') ? v : 'v' + v;
}

const BACKOFF_PCT = 80;                 // 0.3 #11
const MAX_BATCH = 50;                   // 6.2
const MIN_INSIGHTS_INTERVAL_MS = 55 * 60 * 1000; // hourly job with cron jitter; never faster
const CONFIRM_TTL_MS = 15 * 60 * 1000;
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80014]);
// ASSUMPTION: smallest Meta daily budget for a ZAR lead campaign. Confirm in Ads Manager (needs_human).
const MIN_DAILY_BUDGET_ZAR = () => Number(process.env.META_MIN_DAILY_BUDGET_ZAR || 20);

class MetaError extends Error {
  constructor(message, o = {}) { super(message); this.name = 'MetaError'; Object.assign(this, o); }
}

const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const isHash = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const zarToMinor = (zar) => Math.round(Number(zar) * 100); // ZAR is a 2-decimal currency; Meta budgets are in minor units
const stable = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.keys(v).sort().reduce((a, x) => { a[x] = v[x]; return a; }, {}) : v));

/* ------------------------------------------------------------------ usage headers + back-off */
function getHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const k = Object.keys(headers).find((x) => x.toLowerCase() === name.toLowerCase());
  return k ? headers[k] : null;
}
function safeJson(s) { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { return null; } }

/* Returns { pct, regainMs, sources[] }. pct = highest utilisation (0-100) across all headers. */
function parseUsage(headers) {
  const out = { pct: 0, regainMs: 0, sources: [] };
  const bump = (src, pct, regainMs) => {
    pct = Number(pct) || 0; regainMs = Number(regainMs) || 0;
    out.sources.push({ src, pct, regainMs });
    if (pct > out.pct) out.pct = pct;
    if (regainMs > out.regainMs) out.regainMs = regainMs;
  };
  const buc = safeJson(getHeader(headers, 'x-business-use-case-usage'));
  if (buc && typeof buc === 'object') {
    for (const id of Object.keys(buc)) {
      for (const e of [].concat(buc[id] || [])) {
        const pct = Math.max(Number(e.call_count) || 0, Number(e.total_cputime) || 0, Number(e.total_time) || 0);
        bump('buc:' + (e.type || id), pct, (Number(e.estimated_time_to_regain_access) || 0) * 60000);
      }
    }
  }
  const acc = safeJson(getHeader(headers, 'x-ad-account-usage'));
  if (acc) bump('ad_account', acc.acc_id_util_pct, (Number(acc.reset_time_duration) || 0) * 1000);
  const app = safeJson(getHeader(headers, 'x-app-usage'));
  if (app) bump('app', Math.max(Number(app.call_count) || 0, Number(app.total_cputime) || 0, Number(app.total_time) || 0), 0);
  return out;
}

/* Pure decision: back off at >= 80%. Cool-down = Meta's own regain time if given, else 60 s (>=95%: 5 min). */
function decideBackoff(usage, { threshold = BACKOFF_PCT, defaultCooldownMs = 60000 } = {}) {
  const pct = usage && usage.pct ? usage.pct : 0;
  if (pct < threshold) return { backoff: false, pct, waitMs: 0 };
  const base = pct >= 95 ? Math.max(defaultCooldownMs, 300000) : defaultCooldownMs;
  return { backoff: true, pct, waitMs: Math.max(usage.regainMs || 0, base) };
}

/* ------------------------------------------------------------------ naming (6.2, Smartly/AdEspresso) */
const fmtDate = (d) => {
  if (d instanceof Date) return d.toISOString().slice(0, 10).replace(/-/g, '');
  return String(d).replace(/-/g, '');
};
/* C{concept}_{angle}_{format}_{date}, e.g. C01_H1_sta-amb_20261015 */
function buildAdName({ concept, angle, format, date }) {
  const c = String(concept).padStart(2, '0'), a = String(angle), f = String(format), d = fmtDate(date);
  if (!/^\d{2,3}$/.test(c)) throw new MetaError('concept must be 2-3 digits', { code: 'BAD_NAME' });
  if (!/^[A-Za-z0-9]+$/.test(a)) throw new MetaError('angle must be alphanumeric, no underscores', { code: 'BAD_NAME' });
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f)) throw new MetaError('format must be lower-case tokens joined by "-" (e.g. sta-amb)', { code: 'BAD_NAME' });
  if (!/^\d{8}$/.test(d)) throw new MetaError('date must be YYYYMMDD', { code: 'BAD_NAME' });
  return `C${c}_${a}_${f}_${d}`;
}
function parseAdName(name) {
  const m = /^C(\d{2,3})_([A-Za-z0-9]+)_([a-z0-9]+(?:-[a-z0-9]+)*)_(\d{8})$/.exec(String(name || ''));
  return m ? { concept: m[1], angle: m[2], format: m[3], date: m[4] } : null;
}
const campaignName = ({ key, objective, cycle }) => `SMC_${key}_${objective}_ZA_c${cycle}`;
const adsetName = ({ key, audience = 'BROAD', ages = '35-50' }) => `SMC_${key}_${audience}_ZA_${ages}`;

/* ------------------------------------------------------------------ confirm-to-apply */
function b64u(buf) { return Buffer.from(buf).toString('base64url'); }
function confirmSecret(o) {
  const s = o && o.confirmSecret || process.env.META_CONFIRM_SECRET;
  if (!s || String(s).length < 16) throw new MetaError('META_CONFIRM_SECRET (>=16 chars) is required to mint/verify confirm tokens', { code: 'CONFIRM_SECRET_MISSING' });
  return String(s);
}

function createClient(opts = {}) {
  const token = opts.token || process.env.META_SYSTEM_USER_TOKEN;
  const fetchImpl = opts.fetchImpl || fetch;
  const sleep = opts.sleep || defaultSleep;
  const now = opts.now || (() => Date.now());
  const version = opts.apiVersion ? (String(opts.apiVersion).startsWith('v') ? opts.apiVersion : 'v' + opts.apiVersion) : apiVersion();
  const base = opts.baseUrl || `https://graph.facebook.com/${version}`;
  const maxInlineWaitMs = opts.maxInlineWaitMs == null ? 30000 : opts.maxInlineWaitMs;
  const maxRetries = opts.maxRetries == null ? 3 : opts.maxRetries;
  const state = { blockedUntil: 0, lastUsage: null, usedNonces: new Set(), lastInsights: new Map() };

  const redact = (s) => (token ? String(s).split(token).join('[token]') : String(s));

  /* One HTTP call with usage tracking, back-off and retries. */
  async function request(method, path, { query, body, tokenOverride } = {}) {
    const tok = tokenOverride || token;
    if (!tok) throw new MetaError('system-user token missing (META_SYSTEM_USER_TOKEN)', { code: 'NO_TOKEN' });
    let url = /^https?:/.test(path) ? path : `${base}/${String(path).replace(/^\//, '')}`;
    if (query && Object.keys(query).length) url += (url.includes('?') ? '&' : '?') + toForm(query);
    let last;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const wait = state.blockedUntil - now();
      if (wait > 0) {
        if (wait > maxInlineWaitMs) throw new MetaError(`rate-limit back-off active for ${Math.ceil(wait / 1000)}s`, { code: 'RATE_LIMIT_BACKOFF', retryAfterMs: wait, usage: state.lastUsage });
        await sleep(wait);
      }
      let res;
      try {
        const init = { method, headers: { authorization: `Bearer ${tok}` } };
        if (body !== undefined) { init.headers['content-type'] = 'application/x-www-form-urlencoded'; init.body = typeof body === 'string' ? body : toForm(body); }
        res = await fetchImpl(url, init);
      } catch (e) {
        last = new MetaError('network error: ' + redact(e.message), { code: 'NETWORK' });
        if (attempt < maxRetries) { await sleep(500 * 2 ** attempt); continue; }
        throw last;
      }
      const usage = parseUsage(res.headers);
      state.lastUsage = usage;
      const dec = decideBackoff(usage);
      if (dec.backoff) state.blockedUntil = Math.max(state.blockedUntil, now() + dec.waitMs);
      let j = null;
      try { j = await res.json(); } catch (e) { j = null; }
      if (res.ok && !(j && j.error)) return { data: j, usage, status: res.status, headers: res.headers };
      const err = (j && j.error) || {};
      const rl = RATE_LIMIT_CODES.has(Number(err.code)) || res.status === 429;
      last = new MetaError(redact(`meta ${res.status} code=${err.code || 'n/a'}: ${err.message || 'error'} (fbtrace_id=${err.fbtrace_id || 'n/a'})`),
        { code: rl ? 'RATE_LIMIT' : 'API_ERROR', status: res.status, metaCode: err.code, subcode: err.error_subcode, fbtrace_id: err.fbtrace_id });
      if (rl) { state.blockedUntil = Math.max(state.blockedUntil, now() + Math.max(60000, usage.regainMs)); }
      const retryable = rl || res.status >= 500;
      if (!retryable || attempt === maxRetries) throw last;
      if (!rl) await sleep(500 * 2 ** attempt); // rate-limit waits are handled at the top of the loop
    }
    throw last;
  }

  /* Batch up to 50 sub-calls per HTTP request. calls: [{method, relative_url, body?}]. Returns [{code, body}] in input order. */
  async function batch(calls) {
    if (!Array.isArray(calls)) throw new MetaError('calls must be an array', { code: 'BAD_INPUT' });
    const out = [];
    for (let i = 0; i < calls.length; i += MAX_BATCH) {
      const chunk = calls.slice(i, i + MAX_BATCH).map((c) => {
        const o = { method: c.method || 'GET', relative_url: c.relative_url };
        if (c.body !== undefined) o.body = typeof c.body === 'string' ? c.body : toForm(c.body);
        return o;
      });
      const r = await request('POST', `${base}/`, { body: { batch: chunk, include_headers: false } });
      const arr = Array.isArray(r.data) ? r.data : [];
      if (arr.length !== chunk.length) throw new MetaError(`batch returned ${arr.length} results for ${chunk.length} calls`, { code: 'BATCH_MISMATCH' });
      for (const item of arr) {
        const body = item ? safeJson(item.body) : null;
        out.push({ code: item ? item.code : 0, ok: !!item && item.code >= 200 && item.code < 300 && !(body && body.error), body });
      }
    }
    return out;
  }

  /* ---------- confirm-to-apply ---------- */
  /* Mint a single-use, 15-minute, parameter-bound token. The console calls this only on a human's tap. */
  function requestConfirm({ action, target, params = {}, requestedBy, reason, ttlMs = CONFIRM_TTL_MS }) {
    if (!action || !target) throw new MetaError('action and target required', { code: 'BAD_INPUT' });
    if (!requestedBy) throw new MetaError('requestedBy (who) is required', { code: 'AUDIT_WHO' });
    if (!reason || String(reason).trim().length < 3) throw new MetaError('reason (why) is required', { code: 'AUDIT_WHY' });
    const at = now();
    const payload = { a: action, t: String(target), h: sha256(stable(params)), exp: at + ttlMs, n: crypto.randomBytes(8).toString('hex'), by: requestedBy, why: reason, at };
    const p = b64u(JSON.stringify(payload));
    const sig = crypto.createHmac('sha256', confirmSecret(opts)).update(p).digest('hex');
    return { confirmToken: `${p}.${sig}`, expiresAt: new Date(payload.exp).toISOString(), preview: { action, target, params, reason, requestedBy } };
  }
  function verifyConfirm(confirmToken, { action, target, params = {}, confirmedBy }) {
    if (!confirmToken || typeof confirmToken !== 'string' || !confirmToken.includes('.')) throw new MetaError('confirmToken required (confirm-to-apply)', { code: 'CONFIRM_REQUIRED' });
    if (!confirmedBy) throw new MetaError('confirmedBy (the human who tapped confirm) is required', { code: 'CONFIRM_REQUIRED' });
    const [p, sig] = confirmToken.split('.');
    const want = crypto.createHmac('sha256', confirmSecret(opts)).update(p).digest('hex');
    const a = Buffer.from(sig || '', 'hex'), b = Buffer.from(want, 'hex');
    if (!isHash(sig) || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new MetaError('confirmToken signature invalid', { code: 'CONFIRM_INVALID' });
    const d = safeJson(Buffer.from(p, 'base64url').toString('utf8'));
    if (!d) throw new MetaError('confirmToken unreadable', { code: 'CONFIRM_INVALID' });
    if (d.exp < now()) throw new MetaError('confirmToken expired', { code: 'CONFIRM_EXPIRED' });
    if (d.a !== action || d.t !== String(target) || d.h !== sha256(stable(params))) throw new MetaError('confirmToken does not match this action/target/parameters', { code: 'CONFIRM_MISMATCH' });
    if (state.usedNonces.has(d.n)) throw new MetaError('confirmToken already used', { code: 'CONFIRM_REUSED' });
    state.usedNonces.add(d.n);
    return d;
  }
  /* audit_log + ops.notifications rows (who/when/why). The DB write is n8n's. */
  function auditRows({ d, confirmedBy, action, target, before, after, source = 'ads-api' }) {
    const at = new Date(now()).toISOString();
    return {
      audit: [{ at, actor_uid: confirmedBy, actor_role: 'admin', source, table_name: 'meta_ads', row_id: String(target), action,
        diff: { before: before === undefined ? null : before, after }, reason: d.why, requested_by: d.by, requested_at: new Date(d.at).toISOString() }],
      notifications: [{ kind: 'ads_write', to: 'jonathan', sent_at: null, acked_at: null, escalated_at: null,
        dedupe_key: `ads_write:${action}:${target}:${at}`,
        body: { action, target, by: confirmedBy, why: d.why, after } }],
    };
  }
  async function guardedWrite({ action, target, params, confirmToken, confirmedBy, before, run }) {
    const d = verifyConfirm(confirmToken, { action, target, params, confirmedBy });
    const result = await run();
    const rows = auditRows({ d, confirmedBy, action, target, before, after: params });
    return { ok: true, result, ...rows };
  }

  /* ---------- reads ---------- */
  const DEFAULT_INSIGHT_FIELDS = ['campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name', 'spend', 'impressions', 'clicks', 'reach', 'frequency',
    'actions', 'cost_per_action_type', 'video_play_actions', 'video_thruplay_watched_actions', 'video_p75_watched_actions', 'date_start', 'date_stop'];

  /* Hourly-safe: refuses to run for the same account/level/range sooner than 55 min after the last run. */
  async function getInsights({ adAccountId, level = 'ad', datePreset, timeRange, fields = DEFAULT_INSIGHT_FIELDS, timeIncrement = 1, breakdowns, limit = 500, lastFetchedAt, maxPages = 20 }) {
    if (!adAccountId) throw new MetaError('adAccountId required', { code: 'BAD_INPUT' });
    if (!datePreset && !timeRange) throw new MetaError('datePreset or timeRange required', { code: 'BAD_INPUT' });
    const acct = String(adAccountId).startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const key = stable({ acct, level, datePreset, timeRange, breakdowns });
    const last = Math.max(lastFetchedAt ? new Date(lastFetchedAt).getTime() : 0, state.lastInsights.get(key) || 0);
    if (last && now() - last < MIN_INSIGHTS_INTERVAL_MS) {
      throw new MetaError('insights are fetched at most hourly', { code: 'TOO_SOON', retryAfterMs: MIN_INSIGHTS_INTERVAL_MS - (now() - last) });
    }
    const query = { level, fields: fields.join(','), time_increment: timeIncrement, limit };
    if (datePreset) query.date_preset = datePreset; else query.time_range = JSON.stringify(timeRange);
    if (breakdowns) query.breakdowns = [].concat(breakdowns).join(',');
    const rows = [];
    let next = null, pages = 0;
    do {
      const r = next ? await request('GET', next) : await request('GET', `${acct}/insights`, { query });
      rows.push(...((r.data && r.data.data) || []));
      next = r.data && r.data.paging && r.data.paging.next;
      pages++;
    } while (next && pages < maxPages);
    state.lastInsights.set(key, now());
    return { rows, usage: state.lastUsage, fetched_at: new Date(now()).toISOString(), truncated: !!next };
  }

  /* ---------- guarded writes ---------- */
  function checkBudget({ dailyBudgetZar, currentDailyBudgetZar, caps = {}, monthSpendToDateZar = 0, daysRemaining, lastChangeAt, goLive = false }) {
    const v = Number(dailyBudgetZar);
    if (!Number.isFinite(v) || v <= 0) throw new MetaError('dailyBudgetZar must be > 0 (to stop spend, pause the campaign)', { code: 'BUDGET_INVALID' });
    if (v < MIN_DAILY_BUDGET_ZAR()) throw new MetaError(`dailyBudgetZar below Meta minimum R${MIN_DAILY_BUDGET_ZAR()}`, { code: 'BUDGET_BELOW_MIN' });
    if (caps.dailyCapZar == null) throw new MetaError('caps.dailyCapZar is required (daily cap per campaign)', { code: 'CAP_MISSING' });
    if (caps.monthlyCapZar == null) throw new MetaError('caps.monthlyCapZar is required (sum of active brokers media_share_zar)', { code: 'CAP_MISSING' });
    if (v > caps.dailyCapZar) throw new MetaError(`R${v}/day exceeds the daily cap R${caps.dailyCapZar}`, { code: 'DAILY_CAP' });
    const days = daysRemaining == null ? 30 : daysRemaining;
    const projected = Number(monthSpendToDateZar) + v * days;
    if (projected > caps.monthlyCapZar) throw new MetaError(`projected month spend R${projected.toFixed(0)} exceeds the monthly cap R${caps.monthlyCapZar}`, { code: 'MONTHLY_CAP', projected });
    // campaign-spec 12: <= 20% steps, once per 48 h. Not applied to the go-live raise from R0 (6.1 step 5) or a decrease.
    const maxStep = caps.maxStepPct == null ? 20 : caps.maxStepPct;
    if (!goLive && currentDailyBudgetZar > 0 && v > currentDailyBudgetZar) {
      if ((v - currentDailyBudgetZar) / currentDailyBudgetZar * 100 > maxStep + 1e-9) throw new MetaError(`increase above ${maxStep}% step`, { code: 'STEP_LIMIT' });
      if (lastChangeAt && now() - new Date(lastChangeAt).getTime() < 48 * 3600 * 1000) throw new MetaError('budget changed less than 48 h ago', { code: 'STEP_COOLDOWN' });
    }
    return { projected };
  }

  async function setCampaignBudget({ campaignId, dailyBudgetZar, confirmToken, confirmedBy, caps, currentDailyBudgetZar, monthSpendToDateZar, daysRemaining, lastChangeAt, goLive = false, setSpendCap = false }) {
    if (!campaignId) throw new MetaError('campaignId required', { code: 'BAD_INPUT' });
    const params = { dailyBudgetZar: Number(dailyBudgetZar), setSpendCap: !!setSpendCap, monthlyCapZar: caps && caps.monthlyCapZar };
    // token first: no token, no further work.
    verifyShape(confirmToken);
    checkBudget({ dailyBudgetZar, currentDailyBudgetZar, caps, monthSpendToDateZar, daysRemaining, lastChangeAt, goLive });
    return guardedWrite({ action: 'set_campaign_budget', target: campaignId, params, confirmToken, confirmedBy, before: { dailyBudgetZar: currentDailyBudgetZar },
      run: async () => {
        const body = { daily_budget: zarToMinor(dailyBudgetZar) };
        if (setSpendCap) body.spend_cap = zarToMinor(caps.monthlyCapZar); // campaign spending limit (lifetime of the campaign: reset each cycle)
        return (await request('POST', String(campaignId), { body })).data;
      } });
  }
  const verifyShape = (t) => { if (!t) throw new MetaError('confirmToken required (confirm-to-apply)', { code: 'CONFIRM_REQUIRED' }); };

  async function setAdStatus(adId, status, { confirmToken, confirmedBy }) {
    verifyShape(confirmToken);
    if (!adId) throw new MetaError('adId required', { code: 'BAD_INPUT' });
    const action = status === 'PAUSED' ? 'pause_ad' : 'resume_ad';
    return guardedWrite({ action, target: adId, params: { status }, confirmToken, confirmedBy,
      run: async () => (await request('POST', String(adId), { body: { status } })).data });
  }
  const pauseAd = ({ adId, confirmToken, confirmedBy }) => setAdStatus(adId, 'PAUSED', { confirmToken, confirmedBy });
  const resumeAd = ({ adId, confirmToken, confirmedBy }) => setAdStatus(adId, 'ACTIVE', { confirmToken, confirmedBy });

  /* ---------- campaign tree from a spec ---------- */
  async function createCampaignTree(spec, { confirmToken, confirmedBy } = {}) {
    verifyShape(confirmToken);
    const plan = planCampaignTree(spec);
    return guardedWrite({ action: 'create_campaign_tree', target: plan.accountId, params: { specHash: sha256(stable(spec)) }, confirmToken, confirmedBy,
      run: async () => {
        const acct = plan.accountId;
        const created = { campaigns: [], adsets: [], creatives: [], ads: [] };
        const run = async (calls) => {
          const rs = await batch(calls.map((c) => ({ method: 'POST', relative_url: c.url, body: c.body })));
          rs.forEach((r, i) => { if (!r.ok) throw new MetaError(`create failed for ${calls[i].label}: ${JSON.stringify(r.body && r.body.error || r.body)}`, { code: 'TREE_STEP_FAILED', created }); });
          return rs.map((r) => r.body.id);
        };
        const cIds = await run(plan.campaigns.map((c) => ({ url: `${acct}/campaigns`, body: c.body, label: c.body.name })));
        plan.campaigns.forEach((c, i) => created.campaigns.push({ key: c.key, id: cIds[i], name: c.body.name }));
        const idOf = Object.fromEntries(created.campaigns.map((c) => [c.key, c.id]));
        const aIds = await run(plan.adsets.map((a) => ({ url: `${acct}/adsets`, body: { ...a.body, campaign_id: idOf[a.campaignKey] }, label: a.body.name })));
        plan.adsets.forEach((a, i) => created.adsets.push({ key: a.key, campaignKey: a.campaignKey, id: aIds[i], name: a.body.name }));
        const asOf = Object.fromEntries(created.adsets.map((a) => [a.key, a.id]));
        const needCreative = plan.ads.filter((a) => a.creativeBody);
        const crIds = needCreative.length ? await run(needCreative.map((a) => ({ url: `${acct}/adcreatives`, body: a.creativeBody, label: 'creative ' + a.body.name }))) : [];
        needCreative.forEach((a, i) => { a.creative_id = crIds[i]; created.creatives.push({ name: a.body.name, id: crIds[i] }); });
        const adIds = await run(plan.ads.map((a) => ({ url: `${acct}/ads`, body: { ...a.body, adset_id: asOf[a.adsetKey], creative: { creative_id: a.creative_id || a.body.creative_id } }, label: a.body.name })));
        plan.ads.forEach((a, i) => created.ads.push({ id: adIds[i], name: a.body.name, adsetKey: a.adsetKey }));
        return created;
      } });
  }

  /* ---------- lead ads ---------- */
  async function createLeadgenForm(spec, { confirmToken, confirmedBy } = {}) {
    verifyShape(confirmToken);
    const { pageId, body } = planLeadgenForm(spec);
    return guardedWrite({ action: 'create_leadgen_form', target: pageId, params: { name: body.name }, confirmToken, confirmedBy,
      run: async () => (await request('POST', `${pageId}/leadgen_forms`, { body })).data });
  }

  /* Page-level: POST /{page}/subscribed_apps (needs a Page token, fetched with the system-user token).
   * App-level (callback URL): only if callbackUrl + verifyToken + appToken ("app_id|app_secret") are given. */
  async function subscribeLeadAdsWebhook(pageId, appId, { confirmToken, confirmedBy, callbackUrl, verifyToken, appToken } = {}) {
    verifyShape(confirmToken);
    if (!pageId || !appId) throw new MetaError('pageId and appId required', { code: 'BAD_INPUT' });
    return guardedWrite({ action: 'subscribe_leadgen_webhook', target: pageId, params: { appId, callbackUrl: callbackUrl || null }, confirmToken, confirmedBy,
      run: async () => {
        const out = {};
        if (callbackUrl) {
          if (!verifyToken || !appToken) throw new MetaError('callbackUrl needs verifyToken and appToken', { code: 'BAD_INPUT' });
          out.app = (await request('POST', `${appId}/subscriptions`, { tokenOverride: appToken, body: { object: 'page', callback_url: callbackUrl, verify_token: verifyToken, fields: 'leadgen', include_values: 'true' } })).data;
        }
        const pt = (await request('GET', String(pageId), { query: { fields: 'access_token' } })).data.access_token;
        out.page = (await request('POST', `${pageId}/subscribed_apps`, { tokenOverride: pt, body: { subscribed_fields: 'leadgen' } })).data;
        return out;
      } });
  }

  async function fetchLead(leadgenId) {
    if (!leadgenId) throw new MetaError('leadgenId required', { code: 'BAD_INPUT' });
    const fields = 'id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data,is_organic,platform,custom_disclosure_responses,partner_name';
    const r = await request('GET', String(leadgenId), { query: { fields } });
    return normalizeLead(r.data);
  }

  /* ---------- asset health (W27) ---------- */
  async function getAssetHealth({ businessId, pageId, igUserId, wabaId, phoneNumberId, adAccountId, pixelId }) {
    const acct = adAccountId && (String(adAccountId).startsWith('act_') ? adAccountId : `act_${adAccountId}`);
    const calls = [];
    const add = (key, rel) => { if (rel) calls.push({ key, method: 'GET', relative_url: rel }); };
    add('business', businessId && `${businessId}?fields=name,verification_status`);
    add('page', pageId && `${pageId}?fields=name,is_published,is_webhooks_subscribed,verification_status`);
    add('ig', igUserId && `${igUserId}?fields=id,username`);
    add('adAccount', acct && `${acct}?fields=name,account_status,disable_reason,currency,amount_spent,spend_cap`);
    add('waba', wabaId && `${wabaId}?fields=name,account_review_status,business_verification_status,health_status`);
    add('templates', wabaId && `${wabaId}/message_templates?fields=name,status,category,quality_score,rejected_reason&limit=200`);
    add('phone', phoneNumberId && `${phoneNumberId}?fields=display_phone_number,verified_name,name_status,quality_rating,messaging_limit_tier,status`);
    add('pixel', pixelId && `${pixelId}?fields=name,last_fired_time,is_unavailable`);
    // ASSUMPTION (UNVERIFIED): dataset quality edge for EMQ. Failure is non-fatal: emq stays null.
    add('emq', pixelId && `${pixelId}/dataset_quality?fields=event_name,event_match_quality`);
    const rs = await batch(calls.map(({ method, relative_url }) => ({ method, relative_url })));
    const by = {};
    calls.forEach((c, i) => { by[c.key] = rs[i]; });
    return normalizeAssetHealth(by, new Date(now()));
  }

  /* ---------- audiences ---------- */
  async function createEngagementAudiences({ adAccountId, pageId, igUserId, formIds = [], videoIds = [], confirmToken, confirmedBy }) {
    verifyShape(confirmToken);
    const plan = planEngagementAudiences({ pageId, igUserId, formIds, videoIds });
    const acct = normAcct(adAccountId);
    return guardedWrite({ action: 'create_engagement_audiences', target: acct, params: { names: plan.map((p) => p.name) }, confirmToken, confirmedBy,
      run: async () => {
        const rs = await batch(plan.map((p) => ({ method: 'POST', relative_url: `${acct}/customaudiences`, body: p })));
        return rs.map((r, i) => ({ name: plan[i].name, ok: r.ok, id: r.body && r.body.id, error: r.ok ? undefined : (r.body && r.body.error && r.body.error.message) }));
      } });
  }

  /* Hashed rows only (accept pre-hashed output of capi.hashAudienceRow). Raw PII is rejected. */
  async function createCustomerListAudience({ adAccountId, name, description = '', schema = ['PHONE', 'EMAIL', 'FN', 'LN', 'COUNTRY', 'EXTID'], hashedRows = [], confirmToken, confirmedBy }) {
    verifyShape(confirmToken);
    assertHashedRows(schema, hashedRows);
    const acct = normAcct(adAccountId);
    return guardedWrite({ action: 'create_customer_list_audience', target: acct, params: { name, rows: hashedRows.length }, confirmToken, confirmedBy,
      run: async () => {
        const a = (await request('POST', `${acct}/customaudiences`, { body: { name, description, subtype: 'CUSTOM', customer_file_source: 'USER_PROVIDED_ONLY' } })).data;
        const uploads = hashedRows.length ? await addAudienceUsers(a.id, schema, hashedRows) : [];
        return { audience: a, uploads };
      } });
  }
  /* Nightly refresh of an existing exclusion audience: data sync, no ad-delivery change, so no confirm token. Hashed only. */
  async function addAudienceUsers(audienceId, schema, hashedRows) {
    assertHashedRows(schema, hashedRows);
    const out = [];
    for (let i = 0; i < hashedRows.length; i += 10000) {
      const r = await request('POST', `${audienceId}/users`, { body: { payload: { schema, data: hashedRows.slice(i, i + 10000) } } });
      out.push(r.data);
    }
    return out;
  }

  /* Seed gate (4.4a): >= 1,000 in the Attended/GoodFit seed, else fail. */
  async function createLookalike(seedId, ratio, { adAccountId, seedSize, country = 'ZA', name, confirmToken, confirmedBy, minSeed = 1000 } = {}) {
    verifyShape(confirmToken);
    if (!(ratio >= 0.01 && ratio <= 0.2)) throw new MetaError('ratio must be 0.01-0.20', { code: 'BAD_INPUT' });
    if (!(seedSize >= minSeed)) throw new MetaError(`seed audience needs >= ${minSeed} people (got ${seedSize}); not created until the seed gate is met`, { code: 'SEED_TOO_SMALL' });
    const acct = normAcct(adAccountId);
    const nm = name || `SMC_LAL-${Math.round(ratio * 100)}_seed${seedId}_${Math.round(ratio * 100)}pct`;
    return guardedWrite({ action: 'create_lookalike', target: acct, params: { seedId, ratio, country }, confirmToken, confirmedBy,
      run: async () => (await request('POST', `${acct}/customaudiences`, { body: { name: nm, subtype: 'LOOKALIKE', origin_audience_id: seedId, lookalike_spec: { type: 'similarity', country, ratio } } })).data });
  }

  /* Offline stage events: delegate to the CAPI helper (hashing, event_id dedupe, retries live there). */
  async function uploadOfflineEvents(events, { pixelId, testEventCode } = {}) {
    const capi = require('../capi/capi.js');
    const out = [];
    for (const e of events) out.push(await capi.sendOffline({ ...e, pixelId: e.pixelId || pixelId, token: e.token || token, testEventCode: e.testEventCode || testEventCode, fetchImpl: opts.fetchImpl, sleep }));
    return out;
  }

  return { request, batch, requestConfirm, verifyConfirm, getInsights, setCampaignBudget, pauseAd, resumeAd, createCampaignTree, createLeadgenForm,
    subscribeLeadAdsWebhook, fetchLead, getAssetHealth, createEngagementAudiences, createCustomerListAudience, addAudienceUsers, createLookalike,
    uploadOfflineEvents, checkBudget, state, version };
}

/* ------------------------------------------------------------------ pure helpers */
function toForm(o) {
  const p = new URLSearchParams();
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v === undefined || v === null) continue;
    p.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  return p.toString();
}
const normAcct = (id) => { if (!id) throw new MetaError('adAccountId required', { code: 'BAD_INPUT' }); return String(id).startsWith('act_') ? id : `act_${id}`; };

function assertHashedRows(schema, rows) {
  if (!Array.isArray(schema) || !schema.length) throw new MetaError('schema required', { code: 'BAD_INPUT' });
  rows.forEach((r, i) => {
    if (!Array.isArray(r) || r.length !== schema.length) throw new MetaError(`row ${i}: expected ${schema.length} cells`, { code: 'BAD_ROW' });
    r.forEach((c) => { if (c !== '' && !isHash(c)) throw new MetaError(`row ${i}: cell is not a SHA-256 hex digest: raw PII is never accepted`, { code: 'RAW_PII_REJECTED' }); });
  });
}

const FORBIDDEN_CTAS = new Set(['GET_QUOTE', 'GET_OFFER', 'APPLY_NOW', 'GET_STARTED_QUOTE']); // campaign-spec 4.3: "Learn more" only
function buildCreativePayload(spec, ad, name) {
  const c = ad.creative;
  const cta = (c && c.cta && c.cta.type) || 'LEARN_MORE';
  if (FORBIDDEN_CTAS.has(cta)) throw new MetaError(`CTA ${cta} is not allowed (Learn more only)`, { code: 'BAD_CTA' });
  const ctaObj = c.cta && c.cta.value ? { type: cta, value: c.cta.value } : { type: cta, value: ad.form_id ? { lead_gen_form_id: ad.form_id } : { link: c.link } };
  const story = { page_id: spec.brand.page_id };
  if (spec.brand.ig_user_id) story.instagram_user_id = spec.brand.ig_user_id;
  if (c.video_id) story.video_data = { video_id: c.video_id, message: c.primary_text, title: c.headline, link_description: c.description, image_hash: c.thumbnail_hash, call_to_action: ctaObj };
  else story.link_data = { message: c.primary_text, name: c.headline, description: c.description, image_hash: c.image_hash, link: c.link || 'https://sortmycover.co.za/', call_to_action: ctaObj };
  return { name, object_story_spec: story };
}

const AD_STATUS = 'PAUSED';
/* spec -> ordered Graph payloads. Everything is forced PAUSED at the minimum daily budget (R0 spend before first payment, 0.1). */
function planCampaignTree(spec) {
  if (!spec || !spec.brand || !spec.brand.ad_account_id || !spec.brand.page_id) throw new MetaError('spec.brand.ad_account_id and page_id required', { code: 'BAD_SPEC' });
  if (!Array.isArray(spec.campaigns) || !spec.campaigns.length) throw new MetaError('spec.campaigns required', { code: 'BAD_SPEC' });
  const date = fmtDate(spec.date || new Date());
  const minMinor = zarToMinor(MIN_DAILY_BUDGET_ZAR());
  const plan = { accountId: normAcct(spec.brand.ad_account_id), campaigns: [], adsets: [], ads: [] };
  for (const c of spec.campaigns) {
    if (!c.key) throw new MetaError('campaign.key (A/B/C) required', { code: 'BAD_SPEC' });
    if (!Array.isArray(c.special_ad_categories)) throw new MetaError('campaign.special_ad_categories must be set explicitly ([] only after the section-10 decision is recorded)', { code: 'SPECIAL_AD_CATEGORY_UNDECIDED' });
    const name = c.name || campaignName({ key: c.key, objective: c.objective_tag || 'LEADS', cycle: spec.cycle || 1 });
    plan.campaigns.push({ key: c.key, body: { name, objective: c.objective || 'OUTCOME_LEADS', status: AD_STATUS, special_ad_categories: c.special_ad_categories,
      buying_type: 'AUCTION', bid_strategy: c.bid_strategy || 'LOWEST_COST_WITHOUT_CAP', daily_budget: minMinor } });
    for (const a of c.adsets || []) {
      const t = a.targeting || {};
      if (t.flexible_spec || t.interests) throw new MetaError('detailed/interest targeting is not allowed (broad + creative diversity only)', { code: 'INTEREST_TARGETING' });
      const akey = `${c.key}:${a.key || a.name}`;
      plan.adsets.push({ key: akey, campaignKey: c.key, body: { name: a.name || adsetName({ key: c.key }), status: AD_STATUS, billing_event: a.billing_event || 'IMPRESSIONS',
        optimization_goal: a.optimization_goal || 'LEAD_GENERATION', destination_type: a.destination_type, promoted_object: a.promoted_object || { page_id: spec.brand.page_id },
        targeting: t, attribution_spec: a.attribution_spec } });
      for (const ad of a.ads || []) {
        const name = ad.name ? (parseAdName(ad.name) ? ad.name : (() => { throw new MetaError(`ad name "${ad.name}" violates C{concept}_{angle}_{format}_{date}`, { code: 'BAD_NAME' }); })())
          : buildAdName({ concept: ad.concept, angle: ad.angle, format: ad.format, date });
        if (!ad.creative && !ad.creative_id) throw new MetaError(`ad ${name}: creative or creative_id required`, { code: 'BAD_SPEC' });
        const item = { adsetKey: akey, body: { name, status: AD_STATUS, creative_id: ad.creative_id, tracking_specs: ad.tracking_specs } };
        if (ad.creative) item.creativeBody = buildCreativePayload(spec, ad, name);
        plan.ads.push(item);
      }
    }
  }
  return plan;
}

function planLeadgenForm(spec) {
  if (!spec || !spec.page_id && !spec._page_id) { /* page id is passed beside the body */ }
  const pageId = spec.page_id || spec._page_id;
  if (!pageId) throw new MetaError('spec.page_id (or _page_id) required', { code: 'BAD_SPEC' });
  const body = {};
  for (const k of Object.keys(spec)) if (!k.startsWith('_') && k !== 'page_id') body[k] = spec[k];
  if (!body.name || !body.questions || !body.privacy_policy) throw new MetaError('form needs name, questions, privacy_policy', { code: 'BAD_SPEC' });
  const leftovers = JSON.stringify(body).match(/\{[A-Za-z_]+\}/g);
  if (leftovers) throw new MetaError(`unfilled placeholders ${[...new Set(leftovers)].join(', ')}: fail closed (practice name / FSP / privacy URL)`, { code: 'PLACEHOLDER_LEFT' });
  return { pageId, body };
}

function planEngagementAudiences({ pageId, igUserId, formIds, videoIds }) {
  const day = 86400;
  const rule = (sources, days, event) => ({ inclusions: { operator: 'or', rules: [{ event_sources: sources, retention_seconds: days * day, filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: event }] } }] } });
  const mk = (name, r) => ({ name, subtype: 'ENGAGEMENT', description: 'on-Meta engagement, no PII', prefill: true, rule: r });
  const out = [];
  // ASSUMPTION: rule syntax/event names per Meta engagement-audience rules; verify on the first call (needs_human).
  if (pageId) out.push(mk('SMC_ENG_igpage_90d_page', rule([{ id: pageId, type: 'page' }], 90, 'page_engaged')));
  if (igUserId) out.push(mk('SMC_ENG_igpage_90d_ig', rule([{ id: igUserId, type: 'ig_business' }], 90, 'ig_business_profile_all')));
  if (formIds.length) {
    out.push(mk('SMC_ENG_formopen_90d', rule(formIds.map((id) => ({ id, type: 'lead' })), 90, 'lead_generation_opened')));
    out.push(mk('SMC_ENG_formdrop_90d', rule(formIds.map((id) => ({ id, type: 'lead' })), 90, 'lead_generation_dropoff')));
  }
  if (videoIds.length) out.push(mk('SMC_ENG_video75_30d', rule(videoIds.map((id) => ({ id, type: 'video' })), 30, 'video_watched_75_percent')));
  return out;
}

/* ---- leads ---- */
function normalizeLead(raw) {
  const answers = {};
  for (const f of raw.field_data || []) answers[f.name] = Array.isArray(f.values) ? (f.values.length > 1 ? f.values : f.values[0]) : f.values;
  // ASSUMPTION: the custom consent tick is returned in custom_disclosure_responses or as a field_data entry whose name contains "consent".
  const cdr = raw.custom_disclosure_responses || [];
  const consentKey = Object.keys(answers).find((k) => /consent|agree/i.test(k));
  const consentFromCdr = cdr.length ? cdr.some((x) => x && (x.checkbox_key || x.is_checked !== undefined) && x.is_checked !== false) : null;
  return {
    leadgen_id: raw.id, created_time: raw.created_time, form_id: raw.form_id, campaign_id: raw.campaign_id, campaign_name: raw.campaign_name,
    adset_id: raw.adset_id, adset_name: raw.adset_name, ad_id: raw.ad_id, ad_name: raw.ad_name, is_organic: !!raw.is_organic, platform: raw.platform || null,
    full_name: answers.full_name || answers.name || null, phone: answers.phone_number || answers.phone || null, email: answers.email || null,
    answers, consent_raw: consentKey ? answers[consentKey] : (consentFromCdr === null ? null : consentFromCdr), custom_disclosure_responses: cdr,
    ad_parts: parseAdName(raw.ad_name),
  };
}
/* Backstop for the form's conditional logic (campaign-spec 3.4): re-check every answer and the consent tick.
 * Accepts the option key (35_44) or its label (35-44). Bands: age 35-44 / 45-50; budget R750-R1,250 and R1,250+ both qualify (0.1). */
const slug = (v) => String(v == null ? '' : v).trim().toLowerCase();
const AGE_OK = new Set(['35_44', '35-44', '45_50', '45-50']);
const BUDGET_OK = new Set(['750_1250', 'r750-r1,250', '1250plus', 'r1,250 or more']);
function qualifyLead(lead) {
  const a = lead.answers || {}, reasons = [];
  if (!AGE_OK.has(slug(a.age_band))) reasons.push('age_band');
  if (!BUDGET_OK.has(slug(a.budget_band))) reasons.push('budget_band');
  if (!['yes'].includes(slug(a.call_ok))) reasons.push('call_ok');
  const c = lead.consent_raw;
  const consent = c === true || (typeof c === 'string' && !['', '0', 'false', 'no', 'unchecked'].includes(slug(c)));
  if (!consent) reasons.push('no_consent');
  return { qualified: reasons.length === 0, consent, reasons, bond_children: a.bond_children || null };
}
/* Hash a campaign-tree spec for requestConfirm params (same stable hash the client verifies). */
const specHash = (spec) => sha256(stable(spec));

/* X-Hub-Signature-256 over the RAW body with the app secret. */
function verifyWebhookSignature(rawBody, header, appSecret) {
  if (!header || !appSecret) return false;
  const m = /^sha256=([a-f0-9]{64})$/.exec(String(header).trim());
  if (!m) return false;
  const want = crypto.createHmac('sha256', appSecret).update(rawBody).digest();
  const got = Buffer.from(m[1], 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
function parseLeadgenWebhook(payload) {
  const out = [];
  for (const e of (payload && payload.entry) || []) for (const ch of e.changes || []) {
    if (ch.field === 'leadgen' && ch.value) out.push({ leadgen_id: ch.value.leadgen_id, page_id: ch.value.page_id || e.id, form_id: ch.value.form_id, ad_id: ch.value.ad_id, adgroup_id: ch.value.adgroup_id, created_time: ch.value.created_time });
  }
  return out;
}

/* ---- asset health ---- */
const ACCOUNT_STATUS = { 1: 'ACTIVE', 2: 'DISABLED', 3: 'UNSETTLED', 7: 'PENDING_RISK_REVIEW', 8: 'PENDING_SETTLEMENT', 9: 'IN_GRACE_PERIOD', 100: 'PENDING_CLOSURE', 101: 'CLOSED', 201: 'ANY_ACTIVE', 202: 'ANY_CLOSED' };
function normalizeAssetHealth(by, at) {
  const alerts = [];
  const A = (severity, code, message) => alerts.push({ severity, code, message });
  const ok = (k) => by[k] && by[k].ok;
  const b = (k) => (by[k] && by[k].body) || {};
  const err = (k) => (by[k] && by[k].body && by[k].body.error && by[k].body.error.message) || 'unavailable';
  const h = { health_checked_at: at.toISOString(), alerts };
  if (by.business) { h.bv_status = ok('business') ? String(b('business').verification_status || 'unknown') : 'error'; if (!ok('business')) A('urgent', 'BUSINESS_ERROR', err('business')); }
  if (by.page) {
    if (ok('page')) { h.page_status = b('page').is_published === false ? 'unpublished' : 'ok'; if (b('page').is_published === false) A('urgent', 'PAGE_UNPUBLISHED', 'Page is not published');
      if (b('page').is_webhooks_subscribed === false) A('urgent', 'PAGE_WEBHOOK_OFF', 'Lead Ads webhook not subscribed on the Page'); }
    else { h.page_status = 'error'; A('urgent', 'PAGE_ERROR', err('page')); }
  }
  if (by.ig) { h.ig_status = ok('ig') ? 'ok' : 'error'; if (!ok('ig')) A('urgent', 'IG_ERROR', err('ig')); }
  if (by.adAccount) {
    if (ok('adAccount')) { const s = ACCOUNT_STATUS[b('adAccount').account_status] || String(b('adAccount').account_status); h.ad_account_status = s;
      if (s !== 'ACTIVE') A('urgent', 'AD_ACCOUNT_' + s, `Ad account status ${s} (disable_reason ${b('adAccount').disable_reason || 0})`); }
    else { h.ad_account_status = 'error'; A('urgent', 'AD_ACCOUNT_ERROR', err('adAccount')); }
  }
  if (by.waba && ok('waba')) { h.waba_review_status = b('waba').account_review_status || null; if (/REJECT|RESTRICT|BANNED/i.test(String(h.waba_review_status))) A('urgent', 'WABA_RESTRICTED', 'WABA review status ' + h.waba_review_status); }
  else if (by.waba) A('urgent', 'WABA_ERROR', err('waba'));
  if (by.phone) {
    if (ok('phone')) { h.waba_quality = b('phone').quality_rating || null; h.messaging_limit_tier = b('phone').messaging_limit_tier || null; h.phone_name_status = b('phone').name_status || null;
      if (h.waba_quality === 'RED') A('urgent', 'WABA_QUALITY_RED', 'WhatsApp quality rating RED'); else if (h.waba_quality === 'YELLOW') A('warning', 'WABA_QUALITY_YELLOW', 'WhatsApp quality rating YELLOW');
      if (/DECLINED|NON_EXISTS|EXPIRED/.test(String(h.phone_name_status))) A('urgent', 'DISPLAY_NAME_' + h.phone_name_status, 'Display name ' + h.phone_name_status); }
    else A('urgent', 'PHONE_ERROR', err('phone'));
  }
  if (by.templates) {
    if (ok('templates')) {
      const items = (b('templates').data || []).map((t) => ({ name: t.name, status: t.status, category: t.category, quality: t.quality_score && t.quality_score.score || null, rejected_reason: t.rejected_reason || null }));
      const count = {}; items.forEach((t) => { count[t.status] = (count[t.status] || 0) + 1; });
      h.template_status = { counts: count, items };
      items.filter((t) => ['REJECTED', 'PAUSED', 'DISABLED'].includes(t.status)).forEach((t) => A('urgent', 'TEMPLATE_' + t.status, `Template ${t.name} ${t.status}${t.rejected_reason && t.rejected_reason !== 'NONE' ? ' (' + t.rejected_reason + ')' : ''}`));
    } else A('warning', 'TEMPLATES_ERROR', err('templates'));
  }
  if (by.pixel) {
    if (ok('pixel')) { h.pixel_last_fired_at = b('pixel').last_fired_time || null;
      if (h.pixel_last_fired_at && at.getTime() - new Date(h.pixel_last_fired_at).getTime() > 24 * 3600 * 1000) A('warning', 'PIXEL_STALE', 'Pixel has not fired for > 24 h'); }
    else A('warning', 'PIXEL_ERROR', err('pixel'));
  }
  h.emq = null;
  if (by.emq && ok('emq')) {
    const scores = ((b('emq').data) || []).map((x) => Number(x.event_match_quality && (x.event_match_quality.composite_score != null ? x.event_match_quality.composite_score : x.event_match_quality))).filter((n) => Number.isFinite(n));
    if (scores.length) { h.emq = Math.min(...scores); if (h.emq < 6) A('warning', 'EMQ_LOW', `Event match quality ${h.emq}/10 (target >= 6)`); }
  }
  h.severity = alerts.some((a) => a.severity === 'urgent') ? 'urgent' : alerts.length ? 'warning' : 'ok';
  return h;
}
/* W27: previous vs new health -> only NEW urgent items and quality drops (so alerts do not repeat hourly). */
function diffHealth(prev, next) {
  const prevCodes = new Set(((prev && prev.alerts) || []).map((a) => a.code));
  const fresh = (next.alerts || []).filter((a) => !prevCodes.has(a.code));
  const rank = { GREEN: 3, YELLOW: 2, RED: 1 };
  const drop = prev && prev.waba_quality && next.waba_quality && rank[next.waba_quality] < rank[prev.waba_quality];
  return { new_alerts: fresh, urgent: fresh.filter((a) => a.severity === 'urgent').length > 0 || !!drop, quality_drop: !!drop };
}

/* ---- insights -> ad_metrics rows (joined later to leads/bookings/outcomes by ad_id/day) ---- */
const actionVal = (arr, type) => { const a = (arr || []).find((x) => x.action_type === type); return a ? Number(a.value) : 0; };
function insightsToAdMetrics(rows, { brandId } = {}) {
  return rows.map((r) => {
    const spend = Number(r.spend) || 0, imps = Number(r.impressions) || 0;
    // 'lead' = pixel+instant-form leads; 'onsite_conversion.lead_grouped' is the on-Meta aggregate. Take the larger, never the sum (they overlap).
    const leads = Math.max(actionVal(r.actions, 'lead'), actionVal(r.actions, 'onsite_conversion.lead_grouped'));
    const p = parseAdName(r.ad_name) || {};
    const v3 = actionVal(r.actions, 'video_view'); // ASSUMPTION: 3-second plays = action_type video_view
    const play = (r.video_play_actions || [])[0] ? Number(r.video_play_actions[0].value) : v3;
    const thru = (r.video_thruplay_watched_actions || [])[0] ? Number(r.video_thruplay_watched_actions[0].value) : 0;
    return { date: r.date_start, brand_id: brandId || null, campaign_id: r.campaign_id, campaign_name: r.campaign_name, adset_id: r.adset_id, adset_name: r.adset_name,
      ad_id: r.ad_id, ad_name: r.ad_name, concept: p.concept || null, angle: p.angle || null, format: p.format || null, placement: r.publisher_platform || null,
      spend_zar: spend, impressions: imps, clicks: Number(r.clicks) || 0, leads_raw: leads, cpl: leads ? +(spend / leads).toFixed(2) : null,
      frequency: r.frequency != null ? Number(r.frequency) : null, hook_rate: imps && (v3 || play) ? +((v3 || play) / imps).toFixed(4) : null, hold_rate: (v3 || play) ? +(thru / (v3 || play)).toFixed(4) : null,
      source_fetched_at: new Date().toISOString() };
  });
}

module.exports = { createClient, parseUsage, decideBackoff, buildAdName, parseAdName, campaignName, adsetName, planCampaignTree, planLeadgenForm, planEngagementAudiences,
  normalizeLead, qualifyLead, specHash, verifyWebhookSignature, parseLeadgenWebhook, normalizeAssetHealth, diffHealth, insightsToAdMetrics, assertHashedRows, toForm, zarToMinor,
  apiVersion, MetaError, BACKOFF_PCT, MAX_BATCH, MIN_INSIGHTS_INTERVAL_MS };
