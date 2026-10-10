//@include common
// "Confirm to approvers": one WhatsApp message per approver (Jonathan, KG: Recipients = ops.alert_recipients, which is filled from env)
// after an approved proposal got its build task. Goes through Reserve notification (kind approval_confirmed, 24 h dedupe, so a re-run
// or an "already" task never double-sends) and the shared WhatsApp send, whose failure is logged on the row (Mark sent) and never thrown.
// Template: cfg.confirm_template, default ops_action_confirmed (NOT YET in automation/templates: needs_human, see I-36a).
//   body {{1}} title · {{2}} task id · {{3}} owner agent · {{4}} check date · {{5}} approved by; URL button value "today".
// Never throws: any problem is logged and the node returns no items, so the console poll still acks the row (never send_failed).
try {
  const d = $('Decide').first().json;
  const cfg = $('Plan (decision)').first().json.cfg || {};
  const recips = $('Recipients (decision)').all().map((i) => i.json).filter((r) => r && r.wa);
  let taskId = null;
  try { taskId = $('Append task node').first().json.task_id; } catch (e) { taskId = null; }
  if (!d || !d.id || !taskId) { console.log('confirm skipped: no approved proposal or task id'); return []; }
  if (!recips.length) { console.log('confirm skipped: no approver recipients'); return []; }
  const pnid = recips[0].pnid;
  const tpl = cfg.confirm_template || 'ops_action_confirmed';
  const check = d.check_date ? String(d.check_date).slice(0, 10) : 'not set';
  return recips.map((r) => ({ json: {
    kind: 'approval_confirmed', to: r.wa, dedupe_key: 'approval_confirmed:' + d.id + ':' + r.wa, proposal_id: d.id,
    payload: { channel: 'whatsapp', ver: cfg.ver, pnid, task_id: taskId, body: waTemplate(r.wa, tpl, null, [d.title, taskId, d.owner_agent, check, d.decided_by || 'console'], [{ kind: 'url', value: 'today' }]) }
  } }));
} catch (e) {
  console.log('confirm failed (ignored): ' + String((e && e.message) || e).slice(0, 200));
  return [];
}
