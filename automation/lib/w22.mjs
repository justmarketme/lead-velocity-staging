// automation/lib/w22.mjs  -  W22 Alerts, lean (18 Oct 2026, Jono's scope).
// Imported by the Code node of automation/W22.json (require('lv-automation').w22) and by automation/tests/W22.test.mjs.
//
// What reaches W22: the n8n Error Trigger (every SMC workflow names smc-w22 as its error workflow) and signals handed in
// by other workflows (Execute Workflow, the producer contract in W22.md). Each one becomes at most ONE alert per 24 h
// (key signal_key|scope|severity, kept in the workflow's static data; no ops schema). Delivery:
//   - email to OPS_ALERT_EMAIL through the smc-email-send relay (Resend, SortMyCover <hello@sortmycover.co.za>), every alert;
//   - WhatsApp to OPS_WHATSAPP_JONATHAN / OPS_WHATSAPP_KG through smc-whatsapp-send, red alerts (and notify_now) only, with
//     the utility template ops_alert once TWILIO_CONTENT_SIDS has its SID (until then: email only).
// Alerts never carry a lead's name, phone, email or ID number (redact()).
export const DEDUPE_MS = 24 * 3600_000;
// A failure here touches a lead or a booking now: red (WhatsApp + email). Any other workflow failing: amber (email).
export const CRITICAL_WORKFLOWS = /^(W01|W02|W03|W04|W05|W06|W07|W09|W10|W15|W28|WhatsApp Send|Email Verify)\b/;
export const PARTNERS = ['jonathan', 'kg'];
const NAME = { jonathan: 'Jono', kg: 'KG' };

// Registered producer signals: defaults under the producer's own fields (W20, W27, W34, W40). Unregistered keys pass through.
export const PRODUCER_SIGNALS = {
  meta_asset_health: { severity: 'red', scope: 'brand:unknown', source: 'W27', what: 'Meta asset health alert', impact: 'Ads, WhatsApp or lead capture may be affected', first_action: 'Open Ads Manager and Business Settings for the failing asset' },
  ms_client_secret_invalid: { severity: 'red', scope: 'ms_app:broker_connect', source: 'W20', what: 'Microsoft rejected the broker-connect app credentials', impact: 'No broker can connect or reconnect Outlook', first_action: 'Rotate the client secret in Entra ID and update the W20 credential' },
  // W40 Social replies (Lindi on Facebook and Instagram, 21 Oct 2026; W30/W31 retired): a link and a case type only, never text or a name.
  community_escalation: { severity: 'amber', to: 'both', scope: 'escalation:unknown', source: 'W40', what: 'Social: a person needs to follow up', impact: 'A commenter or DM sender is waiting for a person; Lindi has paused on that thread', first_action: 'Reply from the Business Suite inbox (link in the alert)' },
  social_distress: { severity: 'red', to: 'both', scope: 'social:distress', source: 'W40', what: 'Social: someone may be in distress', impact: 'Lindi sent nothing; a person must reply personally', first_action: 'Reply personally from the Business Suite inbox; care note and SADAG line in conversation/handoff.md' },
  social_breaker: { severity: 'red', scope: 'social:breaker', source: 'W40', what: 'Social replies: circuit breaker tripped, Lindi is drafting only', impact: 'A spam wave or a loop on the Page or Instagram', first_action: 'Check the Page and Instagram; set SOCIAL_MODE=off if needed' },
  comment_sentiment: { severity: 'amber', scope: 'ad:unknown', source: 'W30', what: 'Ad comment sentiment note', impact: 'Creative or FAQ may need a change', first_action: 'Review the ad comments' },
  hostile_thread: { severity: 'amber', scope: 'ad:unknown', source: 'W30', what: 'Hostile comment thread under a live ad', impact: 'A hostile thread under a live ad', first_action: 'Review the ad for pause' },
  webhook_signature_invalid: { severity: 'red', scope: 'webhook:unknown', source: 'W40', what: 'A Meta webhook failed signature verification', impact: 'Real events may be refused', first_action: 'Check META_APP_SECRET and the webhook subscription' },
  dsar_received: { severity: 'amber', notify_now: true, to: 'io', scope: 'dsr:unknown', source: 'W34', what: 'New data-subject request', impact: 'POPIA 30-day clock started', first_action: 'Verify identity and answer by hand from howzit@ (escalation kind dsr)' },
  popia_breach: { severity: 'red', to: 'both', scope: 'incident:unknown', source: 'W34', what: 'Possible POPIA breach reported', impact: 'POPIA s22 duties may apply; containment comes first', first_action: 'Read the mail at howzit@, contain, then follow the breach runbook' },
  dsar_due: { severity: 'amber', to: 'io', scope: 'dsr:clock', source: 'W34', what: 'Data-subject request due within 7 days or unverified', impact: 'POPIA 30-day deadline approaching', first_action: 'Open the console Compliance screen' },
  dsar_overdue: { severity: 'red', to: 'both', scope: 'dsr:clock', source: 'W34', what: 'Data-subject request overdue', impact: 'POPIA 30-day deadline missed', first_action: 'Answer the request today' },
  dsar_erased: { severity: 'amber', to: 'io', scope: 'dsr:unknown', source: 'W34', what: 'Data-subject erasure completed', impact: 'Lead data erased and number suppressed', first_action: 'None; evidence kept in retention_log' },
  broker_dsr_erase: { severity: 'amber', to: 'io', scope: 'broker:unknown', source: 'W34', what: 'Broker must delete an erased client', impact: 'The broker holds a copy of the erased lead', first_action: 'Tell the broker to delete the client' },
  w34_retention_failure: { severity: 'red', to: 'both', scope: 'w34:nightly', source: 'W34', what: 'W34 retention job failed', impact: 'Personal information may be kept past its retention period', first_action: 'Open the W34 execution' },
  w34_monthly_report: { severity: 'amber', to: 'jonathan', scope: 'w34:monthly', source: 'W34', what: 'W34 monthly POPIA report ready', impact: 'Monthly POPIA evidence', first_action: 'Read the monthly report' },
};

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9])[A-Za-z0-9.-]*\.([A-Za-z]{2,})/g;
const SA_ID = /(?<!\d)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{7}(?!\d)/g;
const PHONE = /(?<![\w./-])(\+?(?:27|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4})(?![\w])/g;
/** Mask emails, SA phone numbers and SA ID numbers (an alert never carries a lead's contact details). */
export const redact = (s) => String(s == null ? '' : s).replace(EMAIL, '$1***@$2***.$3').replace(SA_ID, '[id]').replace(PHONE, '[phone]');
const clip = (s, n) => { const t = redact(s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/**
 * One inbound item -> a signal { signal_key, scope, severity: red|amber, what, impact, first_action, source, since, recipients,
 * notify_now?, detail?, link? }, or null (acknowledgement or a benign known event: nothing to send).
 */
export function normalise(j = {}, nowIso = new Date().toISOString()) {
  if (j.type === 'ack') return null;
  let s = null;
  // 1. n8n Error Trigger payload { execution: { id, url, error, lastNodeExecuted, mode }, workflow: { id, name } }
  if (j.execution && j.workflow) {
    const wf = String(j.workflow.name || j.workflow.id || 'unknown');
    const node = String(j.execution.lastNodeExecuted || (j.execution.error && j.execution.error.node && j.execution.error.node.name) || '?');
    const crit = CRITICAL_WORKFLOWS.test(wf);
    s = { signal_key: 'workflow_failed', scope: `workflow:${j.workflow.id || wf}:${node}`, severity: crit ? 'red' : 'amber',
      what: `${wf.replace(/\s*\(DRAFT[^)]*\)/, '')} failed at "${node}"`,
      impact: crit ? 'A lead or booking step did not finish' : 'A support workflow did not finish',
      first_action: 'Open the failed execution in n8n', source: 'n8n',
      detail: j.execution.error && j.execution.error.message, link: j.execution.url || null };
  } else if (j.field === 'message_template_status_update' && j.value) {
    const ev = String(j.value.event || '').toUpperCase();
    if (!['REJECTED', 'PAUSED', 'DISABLED', 'FLAGGED'].includes(ev)) return null;
    s = { signal_key: 'template_rejected', scope: `template:${j.value.message_template_name || j.value.message_template_id}`, severity: 'red',
      what: `WhatsApp template ${j.value.message_template_name || ''} ${ev.toLowerCase()}`, impact: 'Messages using this template cannot be sent', first_action: 'Fix the wording and resubmit', source: 'meta' };
  } else if (j.field === 'phone_number_quality_update' && j.value) {
    const ev = String(j.value.event || '').toUpperCase();
    if (!ev || ['UNFLAGGED', 'UPGRADE', 'ONBOARDING'].includes(ev)) return null;
    s = { signal_key: 'waba_quality', scope: 'phone:primary', severity: 'red', what: `WhatsApp number quality ${ev.toLowerCase()}`, impact: 'Sending limits may drop', first_action: 'Check quality in WhatsApp Manager', source: 'meta' };
  } else if (j.field === 'account_update' && j.value) {
    s = { signal_key: 'waba_restriction', scope: 'waba', severity: 'red', what: `WhatsApp account update: ${String(j.value.event || 'unknown').toLowerCase()}`, impact: 'WhatsApp sending may be restricted', first_action: 'Open WhatsApp Manager', source: 'meta' };
  } else if (j.event && /^(invoice\.payment_failed|charge\.failed|subscription\.not_renew)$/.test(j.event)) {
    s = { signal_key: 'failed_debit', scope: `paystack:${(j.data && (j.data.subscription_code || j.data.reference)) || 'unknown'}`, severity: 'red',
      what: `Payment failed (${j.event})`, impact: 'Cycle renewal at risk', first_action: 'Check the invoice in the console', source: 'paystack' };
  } else if (!j.signal_key && j.kind && PRODUCER_SIGNALS[j.kind]) {
    // W34 shape { kind, workflow, to, severity: red|amber|info, message, deep_link, dsr_id?, incident_id?, to_broker_id? }
    const def = PRODUCER_SIGNALS[j.kind];
    s = { ...def, signal_key: j.kind, severity: j.severity === 'red' ? 'red' : j.severity ? 'amber' : def.severity,
      scope: j.to_broker_id ? `broker:${j.to_broker_id}` : j.incident_id ? `incident:${j.incident_id}` : j.dsr_id ? `dsr:${j.dsr_id}` : def.scope,
      what: j.message || def.what, link: j.deep_link || null };
  } else if (j.signal_key) {
    const def = PRODUCER_SIGNALS[j.signal_key] || {};
    s = { ...def, ...Object.fromEntries(Object.entries(j).filter(([, v]) => v !== undefined && v !== null && v !== '')) };
    if (j.signal_key === 'community_escalation') s.severity = 'amber';
  } else {
    s = { signal_key: 'unknown_signal', scope: 'w22', severity: 'amber', what: 'W22 received a signal it could not read', impact: 'A producer is sending the wrong shape', first_action: 'Check the producer against W22.md', source: 'W22',
      detail: JSON.stringify(j).slice(0, 300) };
  }
  const severity = s.severity === 'amber' || s.severity === 'info' ? 'amber' : 'red';
  // 'both' -> both partners; 'kg' -> KG; anything else (jonathan, io, unset) -> Jono.
  const to = s.recipients || (s.to === 'both' ? PARTNERS : s.to === 'kg' ? ['kg'] : ['jonathan']);
  return { signal_key: String(s.signal_key), scope: String(s.scope || 'global'), severity, notify_now: s.notify_now === true,
    what: s.what || s.signal_key, impact: s.impact || '', first_action: s.first_action || '', source: s.source || 'unknown',
    since: s.since || nowIso, recipients: [].concat(to).filter((r) => PARTNERS.includes(r)), detail: s.detail || null, link: s.link || null };
}

export const dedupeKey = (s) => `${s.signal_key}|${s.scope}|${s.severity}`;

/** 24-h dedupe over the workflow's static data { key: sent_ms }. Returns { send, sent } (sent = the pruned, updated map). */
export function dedupe(sent = {}, key, now = Date.now()) {
  const fresh = {};
  for (const [k, t] of Object.entries(sent || {})) if (Number.isFinite(t) && now - t < DEDUPE_MS) fresh[k] = t;
  if (fresh[key]) return { send: false, sent: fresh };
  fresh[key] = now;
  return { send: true, sent: fresh };
}

const contentSids = (env) => { try { const o = JSON.parse(env.TWILIO_CONTENT_SIDS || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };
const sentence = (s, n) => clip(s, n).replace(/[.\s]+$/, '');
const sast = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t + 2 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') + ' SAST' : String(iso); };

/**
 * A signal that passed the dedupe -> the items W22 sends:
 *   { channel: 'email', key, relay: { body, idempotency_key } }       (always, when OPS_ALERT_EMAIL is set)
 *   { channel: 'whatsapp', key, who, send: <smc-whatsapp-send input> } (red / notify_now, per recipient with a number,
 *                                                                        only once TWILIO_CONTENT_SIDS has ops_alert)
 */
export function plan(s, env = {}, now = Date.now()) {
  const key = dedupeKey(s);
  const day = new Date(now).toISOString().slice(0, 10);
  const out = [];
  const label = s.severity === 'red' ? 'Red alert' : 'Alert';
  if (env.OPS_ALERT_EMAIL) {
    const lines = [
      `${label}: ${sentence(s.what, 200)}`, '',
      `What happened: ${sentence(s.what, 300)}`,
      s.impact ? `Impact: ${sentence(s.impact, 300)}` : null,
      s.first_action ? `First action: ${sentence(s.first_action, 300)}` : null,
      s.detail ? `Error: ${clip(s.detail, 600)}` : null,
      s.link ? `Execution: ${s.link}` : null,
      `Source: ${s.source} · ${s.scope} · ${sast(s.since)}`, '',
      'The same alert is sent at most once in 24 hours.', '', 'SortMyCover alerts',
    ].filter((l) => l !== null);
    out.push({ channel: 'email', key, relay: {
      body: { from: 'SortMyCover <hello@sortmycover.co.za>', to: [String(env.OPS_ALERT_EMAIL)], subject: `SortMyCover ${label.toLowerCase()}: ${sentence(s.what, 120)}`,
        text: lines.join('\n'), tags: [{ name: 'kind', value: 'ops_alert' }] },
      idempotency_key: `w22:${key}:${day}`.slice(0, 256) } });
  }
  if ((s.severity === 'red' || s.notify_now) && contentSids(env).ops_alert) {
    const phones = { jonathan: env.OPS_WHATSAPP_JONATHAN, kg: env.OPS_WHATSAPP_KG };
    for (const who of s.recipients.length ? s.recipients : ['jonathan']) {
      const to = phones[who];
      if (!to) continue;
      const vars = [NAME[who] || 'there', sentence(s.what, 300), sentence(s.impact || s.first_action || 'See the email for details', 300)];
      out.push({ channel: 'whatsapp', key, who, send: {
        kind: 'prebuilt', to, record: false, caller: 'W22', bypass_suppression: true, correlation: `w22:${key}:${who}:${day}`,
        wa: { messaging_product: 'whatsapp', to, type: 'template', template: { name: 'ops_alert', language: { code: 'en' },
          components: [{ type: 'body', parameters: vars.map((t) => ({ type: 'text', text: t })) }] } } } });
    }
  }
  return out;
}
