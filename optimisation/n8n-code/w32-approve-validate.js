// Approve / Snooze 7 d / Decline(reason) from the WhatsApp quick reply (payload "approve:<id>" | "later:<id>") via the smc-w32-decision webhook,
// or from a console approval row claimed by the 1-minute poll (I-34d), which arrives through the sub-call trigger with _via_console = true.
// The webhook item is {headers, params, query, body}, so a webhook caller cannot set the top-level _via_console flag.
const via = $input.first().json._via_console === true ? 'console' : 'webhook';
const b = $input.first().json.body || $input.first().json;
let decision = b.decision, id = b.proposal_id, by = b.decided_by || null;
if (b.payload && typeof b.payload === 'string') { const [d, i] = b.payload.split(':'); decision = d; id = i; by = by || b.from || null; }
const ok = ['approve', 'snooze', 'decline', 'later'].includes(decision) && /^[0-9a-f-]{36}$/i.test(String(id));
if (!ok) return [{ json: { valid: false, error: 'bad decision payload' } }];
if (decision === 'decline' && !(b.reason && String(b.reason).trim())) return [{ json: { valid: false, error: 'decline needs a reason' } }];
return [{ json: { valid: true, decision, proposal_id: String(id), decided_by: by || 'unknown', reason: b.reason ? String(b.reason).slice(0, 300) : null, via } }];
