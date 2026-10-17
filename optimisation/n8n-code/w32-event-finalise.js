//@include common
const cfg = $('Plan').first().json.cfg;
const R = $('Event request').first().json;
const e = R.e;
const resp = $input.first().json;
const j = R.ok ? parseJson(resp.content && resp.content[0] && resp.content[0].text) : null;
const f = e.facts || {};
// deterministic fallback: facts only, no cause guess
const what = (j && j.what) || (f.what || e.trigger.replace(/_/g, ' '));
const since = (j && j.since) || (f.since || new Date(e.now).toLocaleTimeString('en-ZA', { timeZone: ZA, hour: '2-digit', minute: '2-digit' }));
const impact = (j && j.impact) || (f.impact || 'not yet assessed');
const first = (j && j.first_action) || (f.first_action || 'open the console and review the signal');
const owner = (j && j.owner_agent) || f.owner_agent || 'orchestrator';
const always = !!(j ? j.always_send : false) || e.always_send;
const recips = $('Recipients').all().map((i) => i.json).filter((r) => r.wa);
const pnid = recips[0] && recips[0].pnid;
const wait_until = (always || !inDnd(e.now)) ? e.now : next0700(e.now);
const out = [];
for (const r of recips) out.push({ kind: 'red', to: r.wa, dedupe_key: e.dedupe_key + ':' + r.wa, wait_until, payload: { channel: 'whatsapp', ver: cfg.ver, pnid, event_dedupe: e.dedupe_key, body: waTemplate(r.wa, 'ops_alert', null, [what, since, impact, first], [{ kind: 'url', value: 'today' }]) } });
if (recips[0] && recips[0].ops_email) out.push({ kind: 'red_email', to: recips[0].ops_email, dedupe_key: e.dedupe_key + ':email', wait_until, payload: { channel: 'email', subject: (e.severity === 'red' ? 'RED: ' : 'ALERT: ') + what, html: '<p><b>' + what + '</b> since ' + since + '.</p><p>Impact: ' + impact + '</p><p>First action: ' + first + ' (owner ' + owner + ')</p>' } });
out.push({ kind: 'banner', to: 'console', dedupe_key: e.dedupe_key + ':banner', wait_until: e.now, payload: { channel: 'console', text: what + ' since ' + since + '. ' + first } });
const signal = [{ signal_key: 'event.' + e.dedupe_key, faculty: f.faculty || 'infra_cost', metric: e.trigger, value: null, limit: null, run: 1, rule: 'event', side: 'adverse', burning: e.severity === 'red', cause: j && j.what ? null : 'cause not established', owner }];
const costs = R.ok ? [{ date: ymdSAST(e.now), kind: 'llm', amount_zar: actZar(cfg, cfg.models.fast, resp.usage), source_ref: 'optimisation-advisor:event' }] : [];
return [{ json: { signals_json: JSON.stringify(signal), costs_json: JSON.stringify(costs), msgs: out, pulse_json: JSON.stringify({ date: ymdSAST(e.now), status: e.severity, quiet: false, kind: 'event', card_markdown: what + ' since ' + since + '. Impact: ' + impact + '. First action: ' + first + '.', whatsapp_text: what, working: [], not_working: [], actions: [], compliance: {}, build: {} }) } }];
