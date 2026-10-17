// W34 B2 breach-report detector (POPIA s22 / compliance register Part 3 step 2), shared by every inbound lane:
//   - howzit@ mail (W34 "Detect breach report (EN + AF keywords)")
//   - broker WhatsApp (W07 broker path, breach drill P14 gap G10: brokers report problems by WhatsApp, not by email)
// Deterministic on purpose (no LLM): whole phrases, English + Afrikaans, documented in deliverables/compliance-qa/W34-popia-ops.md.
// A match opens an incident DRAFT and alerts both phones (W22); a person decides whether it is a breach, so a false
// positive costs one read. A DSR ("what data do you hold", "delete my details") never matches. No message text is kept:
// only a hash of the message id and, for mail, the sender's domain.
// Code node form: const B = require('lv-automation').breachDetect;
import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const DATA = '(?:personal (?:information|details|data)|(?:my|our|their) (?:information|details|data|number|numbers|name)|leads?|client data|customer data|database|export|spreadsheet|list)';
const BAD = '(?:leaked|leaking|exposed|compromised|breached|hacked|stolen|disclosed|published|made public|publicly (?:visible|accessible|available))';
const AF_DATA = '(?:persoonlike inligting|(?:my|ons|hul) (?:inligting|besonderhede|data|nommer|nommers)|leads?|kliënt ?data|databasis)';
const AF_BAD = '(?:uitgelek|blootgestel|gekompromitteer|gehack|gesteel|openbaar gemaak|openbaar beskikbaar|vir almal sigbaar)';
// G9 (breach drill P14, 2026-10-05): wrong-recipient reports. "Personal information sent to the wrong person" is an
// unauthorised disclosure even when nobody says "breach".
const MIS_WHAT = "(?:lead|leads|client|clients|customer|customers|details|information|info|contact|number|person|this|it|them|her|his|their)";
const MIS_WRONG = "(?:person|people|broker|brokers|adviser|advisers|advisor|advisors|recipient|client|practice|number)";
const AF_MIS_WHAT = '(?:lead|leads|kliënt|kliente|kliënte|besonderhede|inligting|nommer|persoon)';

export const PATTERNS = [
  ['en.breach_phrase', /\b(?:data|security|privacy|popia) (?:breach|leak|compromise)\b|\bsecurity incident\b|\bsecurity compromise\b/],
  ['en.unauthorised', /\bunauthori[sz]ed (?:disclosure|access|release|sharing)\b|\bwithout (?:my|our|their) (?:consent|permission|knowledge)\b[^.?!]{0,40}\b(?:shared|disclosed|published|passed)\b/],
  ['en.data_then_bad', new RegExp('\\b' + DATA + '\\b[^.?!]{0,60}\\b(?:has|have|had|was|were|is|are|been)\\b[^.?!]{0,20}\\b' + BAD + '\\b')],
  ['en.bad_then_data', new RegExp('\\b' + BAD + '\\b[^.?!]{0,40}\\b' + DATA + '\\b')],
  ['en.found_online', /\b(?:found|saw|spotted)\b[^.?!]{0,60}\b(?:your|lead velocity|sortmycover)\b[^.?!]{0,60}\b(?:online|public|gist|pastebin|github|website|internet)\b/],
  ['af.breach_phrase', /\b(?:databreuk|datalek|data-lek|data lek|sekuriteitsbreuk|sekuriteitsinbreuk|inbreuk op (?:die )?(?:sekuriteit|data|privaatheid)|sekuriteitsvoorval)\b/],
  ['af.unauthorised', /\bonbevoegde (?:openbaarmaking|toegang|blootstelling)\b|\bsonder (?:my|ons|hul) (?:toestemming|medewete)\b[^.?!]{0,40}\b(?:gedeel|openbaar|bekend)/],
  ['af.data_then_bad', new RegExp('\\b' + AF_DATA + '\\b[^.?!]{0,60}\\b' + AF_BAD + '\\b')],
  ['af.bad_then_data', new RegExp('\\b' + AF_BAD + '\\b[^.?!]{0,40}\\b' + AF_DATA + '\\b')],
  // ---- G9 misdirected (wrong-recipient) reports
  ['en.misdirected', new RegExp([
    "\\b(?:sent|came|forwarded|delivered|given|passed|routed|shared)\\b[^.?!]{0,30}\\b(?:to|with) (?:me|us)\\b[^.?!]{0,20}\\b(?:by mistake|in error|by accident|accidentally|mistakenly)\\b",
    "\\b(?:by mistake|in error|by accident|accidentally|mistakenly)\\b[^.?!]{0,30}\\b(?:sent|forwarded|given|passed|routed|shared)\\b[^.?!]{0,20}\\b(?:to|with) (?:me|us)\\b",
    "\\bnot (?:my|our) (?:lead|client|customer|person)s?\\b",
    "\\b" + MIS_WHAT + "\\b[^.?!]{0,30}\\b(?:is|was|are|were|isn't|wasn't|aren't|weren't)\\b(?: not)? (?:mine|ours)\\b",
    "\\bsomeone else'?s (?:lead|client|customer|details|information|info|number|data)\\b|\\bsomebody else'?s (?:lead|client|customer|details|information|number|data)\\b",
    "\\bwrong " + MIS_WRONG + "'?s? (?:details|information|info|data|number|lead)\\b",
    "\\b(?:sent|went|gone|came|delivered|routed|passed|given|forwarded)\\b[^.?!]{0,20}\\bto the wrong " + MIS_WRONG + "\\b",
  ].join('|'))],
  ['en.passed_without_consent', /\b(?:gave|given|passed|shared|sold|sent|handed)\b[^.?!]{0,40}\b(?:my|our) (?:number|numbers|details|information|data|contact)\b[\s\S]{0,80}\bnever (?:agreed|consented|gave (?:permission|consent)|said yes)\b/],
  ['af.misdirected', new RegExp([
    '\\bper (?:ongeluk|abuis|fout)\\b[^.?!]{0,40}\\b(?:aan|na|vir) (?:my|ons)\\b',
    '\\b(?:aan|na|vir) (?:my|ons)\\b[^.?!]{0,40}\\bper (?:ongeluk|abuis|fout)\\b',
    '\\bnie (?:my|ons) ' + AF_MIS_WHAT + ' nie\\b',
    '\\b' + AF_MIS_WHAT + '\\b[^.?!]{0,30}\\bnie (?:myne|ons s\'n) (?:is )?nie\\b|\\bnie myne nie\\b',
    "\\biemand anders (?:s'n|se (?:lead|leads|kliënt|kliente|kliënte|besonderhede|inligting|nommer|data))\\b",
    '\\bverkeerde (?:persoon|mense|makelaar|adviseur|ontvanger|kliënt)\\b',
  ].join('|'))],
  ['af.passed_without_consent', /\b(?:gegee|gedeel|gestuur|verkoop|deurgegee)\b[^.?!]{0,40}\b(?:my|ons) (?:nommer|besonderhede|inligting|data)\b[\s\S]{0,80}\bnooit (?:ingestem|toestemming)\b|\bnooit (?:ingestem|toestemming gegee)\b[\s\S]{0,80}\b(?:my|ons) (?:nommer|besonderhede|inligting)\b[^.?!]{0,40}\b(?:gegee|gedeel|gestuur|verkoop)\b/],
];

/** Matched pattern ids for one piece of text (subject + body, or a WhatsApp message). [] = no match. */
export function detectText(text) {
  const t = String(text || '').toLowerCase().normalize('NFC').replace(/[‘’]/g, "'");
  return PATTERNS.filter(([, re]) => re.test(t)).map(([id]) => id);
}

/** howzit@ mail items (Graph message json) -> incident-draft items. Our own mailbox never re-triggers. */
export function detectMail(items, { own = 'howzit@leadvelocity.co.za', nowIso = new Date().toISOString() } = {}) {
  const OWN = String(own || 'howzit@leadvelocity.co.za').toLowerCase();
  const out = [];
  for (const j of items || []) {
    if (!j || (j.subject === undefined && j.bodyPreview === undefined)) continue;
    const from = (j.from && j.from.emailAddress) || {};
    const addr = String(from.address || '').toLowerCase();
    if (addr === OWN) continue; // our own W22 e-mail copies and invites must never re-trigger this lane
    const hits = detectText((j.subject || '') + ' \n ' + (j.bodyPreview || ''));
    if (!hits.length) continue;
    const received = j.receivedDateTime && !Number.isNaN(Date.parse(j.receivedDateTime)) ? new Date(Date.parse(j.receivedDateTime)).toISOString() : nowIso;
    const ref = sha('breach-mail:' + (j.id || received)).slice(0, 12);
    out.push({ ref, received_at: received, matched: hits, source: 'howzit_mail', sender_domain: addr.includes('@') ? addr.split('@')[1] : null,
      summary: 'DRAFT: possible breach / unauthorised-disclosure report received at howzit@ (ref ' + ref + '). Not yet assessed. Open the mail, then run the breach runbook (register Part 3).' });
  }
  return out;
}

/**
 * G10: a broker's inbound WhatsApp (W07 broker path, normalised msg) -> one incident-draft item, or null.
 * Same patterns, same draft shape, so W07 opens the incident with the W34 SQL and raises the same W22 popia_breach alert.
 * ref = hash of the wamid: a webhook re-delivery opens nothing new (the incident SQL is idempotent on the ref).
 */
export function detectBrokerWhatsApp(msg, { broker_id = null, nowIso = new Date().toISOString() } = {}) {
  if (!msg || !msg.text) return null;
  const hits = detectText(msg.text);
  if (!hits.length) return null;
  const received = Number.isFinite(msg.at_ms) ? new Date(msg.at_ms).toISOString() : nowIso;
  const ref = sha('breach-wa:' + (msg.wamid || received)).slice(0, 12);
  return { ref, received_at: received, matched: hits, source: 'broker_whatsapp', broker_id,
    summary: 'DRAFT: possible breach / unauthorised-disclosure report from a broker on WhatsApp (ref ' + ref + '). Not yet assessed. Read the chat, then run the breach runbook (register Part 3).' };
}

/** The W22 alert for a NEW incident draft (duplicates are silent): red, both phones, no message text, name or contact. */
export function breachAlert(row, { console_url = '', source = 'howzit_mail', workflow = 'W34' } = {}) {
  if (!row || !row.incident_id || row.duplicate) return null;
  const where = source === 'broker_whatsapp' ? 'by a broker on WhatsApp' : 'to howzit@';
  const read = source === 'broker_whatsapp' ? 'Read the chat' : 'Read the mail';
  return { kind: 'popia_breach', workflow, to: ['jonathan', 'kg'], severity: 'red', incident_id: row.incident_id,
    deep_link: (console_url || '') + '/compliance/incidents/' + row.incident_id,
    message: 'Possible POPIA breach reported ' + where + ' (ref ' + row.ref + '). Incident draft opened. ' + read + ', contain first, then follow the breach runbook.' };
}
