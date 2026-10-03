//@include common
// Every 15 min. Rows come from ops.notifications_due(): unacknowledged Red (>= 2 h: re-send to the other partner; >= 4 h: Twilio voice call, the only voice use in the system)
// and un-actioned approval requests (>= 24 h: one reminder, never more).
const cfg = $('Plan').first().json.cfg;
const rows = $('Due notifications').all().map((i) => i.json).filter((r) => r.id);
const recips = $('Recipients').all().map((i) => i.json).filter((r) => r.wa);
const pnid = recips[0] && recips[0].pnid;
const msgs = [], calls = [], marks = [];
for (const r of rows) {
  const other = recips.find((x) => x.wa !== r.to) || recips[0];
  if (r.stage === 'resend_other_partner' && other) {
    msgs.push({ json: { kind: 'red_resend', to: other.wa, dedupe_key: 'resend:' + r.id, wait_until: cfg.now, payload: { channel: 'whatsapp', ver: cfg.ver, pnid, body: waTemplate(other.wa, 'ops_alert', null, [r.what || 'Unacknowledged Red alert', 'over 2 hours ago', r.impact || 'see console', r.first_action || 'open the console'], [{ kind: 'url', value: 'today' }]) } } });
    marks.push({ id: r.id, field: 'escalated_at' });
  } else if (r.stage === 'call' && cfg.twilio.sid && recips.length) {
    for (const x of recips) calls.push({ json: { to: x.wa.startsWith('+') ? x.wa : '+' + x.wa, from: cfg.twilio.from, sid: cfg.twilio.sid, twiml: '<Response><Say>Lead Velocity alert. A red alert has not been acknowledged for four hours. Please open the console.</Say></Response>', notification_id: r.id } });
    marks.push({ id: r.id, field: 'called_at' });
  } else if (r.stage === 'reminder') {
    msgs.push({ json: { kind: 'action_reminder', to: r.to, dedupe_key: 'reminder:' + r.id, wait_until: cfg.now, payload: { channel: 'whatsapp', ver: cfg.ver, pnid, body: waTemplate(r.to, 'ops_action', null, [r.title, r.moves || '', 'R' + (r.cost_zar || 0), r.grade || 'C', r.owner_agent || ''], [{ kind: 'qr', value: 'approve:' + r.proposal_id }, { kind: 'qr', value: 'later:' + r.proposal_id }]) } } });
    marks.push({ id: r.id, field: 'reminded_at' });
  }
}
return [{ json: { msgs, calls, marks_json: JSON.stringify(marks), n: marks.length } }];
