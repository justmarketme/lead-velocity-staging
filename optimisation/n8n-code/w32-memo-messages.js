//@include common
const cfg = $('Plan').first().json.cfg;
const F = $('Finalise memo').first().json;
const recips = $('Recipients').all().map((i) => i.json).filter((r) => r.wa);
const pnid = recips[0] && recips[0].pnid;
const wait_until = next0700(cfg.now);
const m = F.memo; const out = [];
for (const r of recips) out.push({ kind: 'weekly', to: r.wa, dedupe_key: 'weekly:' + m.week_start + ':' + r.wa, wait_until, payload: { channel: 'whatsapp', ver: cfg.ver, pnid, body: waTemplate(r.wa, 'ops_weekly', null, [m.week_start, F.one_thing_title, clean(F.whatsapp_summary, 160), (m.actual_vs_forecast || []).length ? (m.actual_vs_forecast.length + ' change(s) graded') : 'nothing graded yet'], [{ kind: 'url', value: 'history' }]) } });
if (recips[0] && recips[0].ops_email) out.push({ kind: 'weekly_email', to: recips[0].ops_email, dedupe_key: 'weekly_email:' + m.week_start, wait_until, payload: { channel: 'email', subject: 'SortMyCover weekly memo ' + m.week_start, html: F.html } });
return out.map((json) => ({ json }));
