//@include common
// Out-of-cycle triggers (6.8b): W22 alert, live guardrail trip, template/Flow rejection, regulator notice, changelog adopt/trial, build test failing twice, compliance control failing.
const KINDS = { w22_alert: 'amber', guardrail_trip: 'red', template_rejected: 'amber', flow_rejected: 'amber', regulator_notice: 'amber', changelog_adopt_trial: 'amber', build_test_failed_twice: 'amber', compliance_control_failed: 'red', waba_restriction: 'red', payment_failure: 'red', vps_down: 'red' };
const ALWAYS = ['guardrail_trip', 'waba_restriction', 'payment_failure', 'vps_down'];   // ignore 22:00-07:00 quiet hours (6.8b)
const b = $input.first().json.body || $input.first().json;
if (!b || !KINDS[b.trigger] || !b.ref) return [{ json: { valid: false, error: 'unknown trigger or missing ref' } }];
const now = new Date().toISOString();
return [{ json: { valid: true, trigger: b.trigger, ref: String(b.ref), severity: KINDS[b.trigger], always_send: ALWAYS.includes(b.trigger), facts: b.facts || {}, now, mode: 'event', dedupe_key: b.trigger + ':' + String(b.ref) + ':' + ymdSAST(now) } }];
