//@include common
// Builds the outgoing messages for a pulse AFTER proposals have ids (so the Approve button carries approve:<id>).
const cfg = $('Plan').first().json.cfg;
const F = $('Finalise pulse').first().json.pulse;
const recips = $('Recipients').all().map((i) => i.json).filter((r) => r.wa);
const props = $('Insert proposals').all().map((i) => i.json).filter((r) => r.id);
const pnid = recips[0] && recips[0].pnid;
const date = F.date;
const dayLabel = new Date(date + 'T12:00:00Z').toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
const wait_until = next0700(cfg.now);
const out = [];
const base = { ver: cfg.ver, pnid };
for (const r of recips) {
  if (F.quiet) {
    out.push({ kind: 'pulse', to: r.wa, dedupe_key: 'pulse:' + date + ':' + r.wa, wait_until, payload: Object.assign({ channel: 'whatsapp', body: waTemplate(r.wa, cfg.quiet_template || 'ops_pulse', dayLabel, ['Green', F.whatsapp_text], [{ kind: 'url', value: 'today' }]) }, base) });
    continue;
  }
  const titles = F.actions.length ? F.actions.map((a, i) => (i + 1) + ') ' + a.title).join(' ') : 'nothing to approve today';
  out.push({ kind: 'pulse', to: r.wa, dedupe_key: 'pulse:' + date + ':' + r.wa, wait_until, payload: Object.assign({ channel: 'whatsapp', body: waTemplate(r.wa, 'ops_pulse', dayLabel, [F.status[0].toUpperCase() + F.status.slice(1), (F.whatsapp_text ? clean(F.whatsapp_text, 120) + ' Do today: ' : 'Do today: ') + titles], [{ kind: 'url', value: 'today' }]) }, base) });
}
// one ops_action per proposal, to Jonathan and KG (Approve / Later). Never re-sent; one reminder at 24 h is handled by the escalation branch.
for (const p of props) {
  const fc = typeof p.forecast === 'string' ? JSON.parse(p.forecast) : (p.forecast || {});
  const moves = (p.metric || '') + ' ' + (fc.delta || '') + (fc.range ? ' (' + fc.range + ')' : '');
  for (const r of recips) out.push({ kind: 'action', to: r.wa, dedupe_key: 'action:' + p.id + ':' + r.wa, wait_until, proposal_id: p.id, payload: Object.assign({ channel: 'whatsapp', body: waTemplate(r.wa, 'ops_action', null, [p.title, moves, 'R' + Math.round(Number(p.cost_zar) || 0), p.grade, p.owner_agent], [{ kind: 'qr', value: 'approve:' + p.id }, { kind: 'qr', value: 'later:' + p.id }]) }, base) });
}
// Amber or Red: email copy to howzit@ (Red always; amber not needed). Console banner row for Red.
if (F.status === 'red') {
  for (const r of recips.slice(0, 1).filter((x) => x.ops_email)) out.push({ kind: 'pulse_red_email', to: r.ops_email, dedupe_key: 'pulse_email:' + date, wait_until, payload: { channel: 'email', subject: 'SortMyCover pulse ' + date + ' - RED', html: '<pre>' + String(F.card_markdown).replace(/</g, '&lt;') + '</pre>' } });
  out.push({ kind: 'banner', to: 'console', dedupe_key: 'banner:' + date, wait_until: cfg.now, payload: { channel: 'console', text: F.compliance.green ? 'Pulse is Red: an SLO is burning' : 'Compliance control not green: ' + F.compliance.failing.join(', ') } });
}
return out.map((json) => ({ json }));
