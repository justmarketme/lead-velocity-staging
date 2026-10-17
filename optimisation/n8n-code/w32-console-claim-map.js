// I-34d: one claimed ops.notifications row (kind approval, source console, now 'sending') -> the item shape "Validate decision" reads.
// smc_console_decide_proposal already updated ops.proposals; W32 runs the follow-up (task append on approve). Invalid rows -> send_failed.
const out = [];
for (const it of $input.all()) {
  const r = it.json || {};
  let p = r.payload;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = null; } }
  p = p && typeof p === 'object' ? p : {};
  const decision = p.decision;
  const id = String(p.proposal_id || r.proposal_id || '');
  let error = null;
  if (!['approve', 'snooze', 'decline'].includes(decision)) error = 'console approval: decision must be approve, snooze or decline';
  else if (!/^[0-9a-f-]{36}$/i.test(id)) error = 'console approval: proposal_id missing or malformed';
  else if (r.proposal_id && p.proposal_id && String(r.proposal_id) !== String(p.proposal_id)) error = 'console approval: row proposal_id does not match payload';
  else if (decision === 'decline' && !(p.reason && String(p.reason).trim())) error = 'console approval: decline needs a reason';
  out.push({ json: error
    ? { valid: false, notification_id: r.id || null, error }
    : { valid: true, notification_id: r.id, _via_console: true,
        body: { decision, proposal_id: id, decided_by: 'console', reason: p.reason ? String(p.reason) : null, via: 'console' } } });
}
return out;
