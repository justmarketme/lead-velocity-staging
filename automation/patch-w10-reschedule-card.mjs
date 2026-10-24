// automation/patch-w10-reschedule-card.mjs - W10 out-of-window reschedule offer -> the reschedule_card template for a
// start-page brand (Jono, 19 Oct 2026). lib/w10.mjs offerMessage decides (card = { start_page, token, env }); it falls back to
// reschedule_offer / reschedule_offer_v2 exactly as before unless rescheduleCardPlan (lib/wa-provider.mjs) can send the
// template: Twilio, the reschedule_card SID in TWILIO_CONTENT_SIDS, a lead token, a booked / confirmed booking.
//   1. "Load booking, lead, broker, brand" reads brands.start_page through to_jsonb (as W07's card: no column dependency).
//   2. "Merge context" carries it as brand.start_page (true only for 'on').
//   3. "Build offer" mints the lt1 lead token the way W07's card does (lv-automation leadToken, LEAD_TOKEN_SECRET; failure
//      -> no token -> reschedule_offer) and sends the prebuilt template as is.
// W10.json is maintained as JSON; this script is the reproducible record. Idempotent. Run: node automation/patch-w10-reschedule-card.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W10.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W10 has no node "${name}"`); return n; };
const swap = (n, key, from, to) => {
  const v = n.parameters[key];
  if (v.includes(to)) return false;
  if (!v.includes(from)) throw new Error(`W10 "${n.name}": anchor not found: ${from.slice(0, 60)}`);
  n.parameters[key] = v.replace(from, to);
  return true;
};

swap(node('Load booking, lead, broker, brand'), 'query', 'br.booking_ui, br.booking_flow_id, br.code AS brand_code,',
  "br.booking_ui, br.booking_flow_id, br.code AS brand_code, to_jsonb(br)->>'start_page' AS brand_start_page,");
swap(node('Merge context'), 'jsCode', "code: r.brand_code || null }", "code: r.brand_code || null, start_page: r.brand_start_page === 'on' }");
const bo = node('Build offer (Flow / list / template)');
swap(bo, 'jsCode', "const o = L.offerMessage({ booking: j.bk, lead: j.ld, broker: j.br, brand: j.brand, slots: $json.slots || [], now_ms: Date.now(), last_inbound_ms: j.last_inbound_ms, reason: j.op, delegate: j.delegate || null });",
  "// start-page brand, out of the 24-h window: the reschedule_card template needs the lead token (minted as W07's card does)\n" +
  "let token = null;\nif (j.brand && j.brand.start_page === true && j.ld && j.ld.id) { try { token = require('lv-automation').leadToken.mintLeadToken(j.ld.id, { secret: $env.LEAD_TOKEN_SECRET }).token; } catch (e) { token = null; } }\n" +
  "const card = { start_page: !!(j.brand && j.brand.start_page === true), token, env: { WHATSAPP_PROVIDER: $env.WHATSAPP_PROVIDER, TWILIO_CONTENT_SIDS: $env.TWILIO_CONTENT_SIDS } };\n" +
  "const o = L.offerMessage({ booking: j.bk, lead: j.ld, broker: j.br, brand: j.brand, slots: $json.slots || [], now_ms: Date.now(), last_inbound_ms: j.last_inbound_ms, reason: j.op, delegate: j.delegate || null, card });");
swap(bo, 'jsCode', "else if (o.kind === 'text_session') wa = { type: 'text', text: { body: o.body } };",
  "else if (o.kind === 'text_session') wa = { type: 'text', text: { body: o.body } };\nelse if (o.kind === 'prebuilt') wa = o.wa; // reschedule_card (lib/wa-provider.mjs rescheduleCardPlan), sent as built");

const out = JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : '');
if (out !== raw) { writeFileSync(FILE, out); console.log('patch-w10-reschedule-card: changed'); } else console.log('patch-w10-reschedule-card: already');
