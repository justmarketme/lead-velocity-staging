// ---- common helpers (inlined by build-workflows.cjs into every Code node that says //@include common) ----
const ZA = 'Africa/Johannesburg';
const ymdSAST = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: ZA });
const addDays = (ymd, n) => { const t = new Date(ymd + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const estZar = (cfg, model, inChars, outTok) => { const r = cfg.rates[model]; return (((inChars / 3.5) * r.in) + (outTok * r.out)) / 1e6 * cfg.usd_zar; };
const actZar = (cfg, model, usage) => { const r = cfg.rates[model]; return ((((usage && usage.input_tokens) || 0) * r.in) + (((usage && usage.output_tokens) || 0) * r.out)) / 1e6 * cfg.usd_zar; };
// Daily bucket: pulse/event may use the whole cap; others leave pulse_reserve. Weekly bucket: memo may use the whole cap; scan/retro leave memo_reserve.
const allow = (cfg, job, est) => {
  if (['scan', 'memo', 'retro'].includes(job)) {
    const reserve = job === 'memo' ? 0 : cfg.caps.memo_reserve;
    return cfg.spent.week + est <= cfg.caps.weekly - reserve;
  }
  const reserve = (job === 'pulse' || job === 'event') ? 0 : cfg.caps.pulse_reserve;
  if (['creative', 'page', 'grading'].includes(job) && cfg.spent.day + est > cfg.caps.daily * cfg.caps.soft) return false;
  return cfg.spent.day + est <= cfg.caps.daily - reserve;
};
const charge = (cfg, job, est) => { if (['scan', 'memo', 'retro'].includes(job)) cfg.spent.week += est; else cfg.spent.day += est; };
const anthropicBody = (model, system, user, maxTokens) => ({ model, max_tokens: maxTokens, temperature: 0, system, messages: [{ role: 'user', content: user }] });
const parseJson = (text) => {
  if (typeof text !== 'string') return null;
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { return null; }
};
// WhatsApp template parameters may not contain newlines, tabs or runs of 4+ spaces.
const clean = (s, max = 220) => String(s == null ? '' : s).replace(/[\n\r\t]+/g, ' · ').replace(/ {2,}/g, ' ').trim().slice(0, max);
const pct = (x) => (Math.round(x * 1000) / 10) + '%';
const fmt = (unit, v) => {
  if (v == null || Number.isNaN(Number(v))) return 'n/a';
  v = Number(v);
  if (unit === 'ratio') return pct(v);
  if (unit === 'ZAR') return 'R' + Math.round(v).toLocaleString('en-ZA').replace(/\s/g, ',');
  if (unit === 'seconds') return Math.round(v * 10) / 10 + ' s';
  if (unit === 'ms') return Math.round(v) + ' ms';
  return String(Math.round(v * 100) / 100);
};
const waTemplate = (to, name, header, body, buttons) => {
  const components = [];
  if (header) components.push({ type: 'header', parameters: [{ type: 'text', text: clean(header, 60) }] });
  components.push({ type: 'body', parameters: body.map((t) => ({ type: 'text', text: clean(t) })) });
  (buttons || []).forEach((b, i) => components.push(b.kind === 'url'
    ? { type: 'button', sub_type: 'url', index: String(i), parameters: [{ type: 'text', text: b.value }] }
    : { type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload: b.value }] }));
  return { messaging_product: 'whatsapp', to, type: 'template', template: { name, language: { code: 'en' }, components } };
};
const next0700 = (nowIso) => {            // next 07:00 SAST (UTC+2, no DST) at or after now
  const now = new Date(nowIso); const t = new Date(now); t.setUTCHours(5, 0, 0, 0);
  if (t <= now) t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString();
};
const inDnd = (nowIso) => { const h = (new Date(nowIso).getUTCHours() + 2) % 24; return h >= 22 || h < 7; };
const QUIET = 'All faculties within limits. Nothing to do today. Next weekly memo Monday.';
const QUIET_MONDAY = 'All faculties within limits. Nothing to do today. Weekly memo at 06:00 today.';
