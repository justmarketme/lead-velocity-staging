// conversation/logic.mjs
// The deterministic "logic" step of W07 (4.11): intent/slot JSON + prefilter flags + lead state -> actions.
// The LLM never decides eligibility, routing or slots. This function does, and it is the only place it happens.
// Documented in conversation/state-machine.md (section "Free-text decision table"). Tested by evals/run.mjs.

export const INTENTS = ['book', 'reschedule', 'cancel', 'question', 'consent', 'stop', 'person', 'other'];

export const SLOT_ENUMS = {
  age_band: ['<35', '35-44', '45-50', '51+'],
  budget_band: ['<750', '750-1250', '1250+', 'unsure'],
  dependants: ['yes', 'no'],
  bond: ['yes', 'no'],
  method: ['teams', 'zoom', 'meet', 'whatsapp_call', 'phone'],
  preferred_time: ['morning', 'lunchtime', 'afternoon', 'evening', 'any'], // or "HH:MM"
  language: ['en', 'af', 'zu', 'xh', 'st', 'tn', 'other']
};
export const SLOT_KEYS = ['age_band', 'budget_band', 'dependants', 'bond', 'method', 'preferred_day', 'preferred_time', 'email', 'call_number', 'language'];

// Topic vocabulary shared with prompts/intent-slot.md and knowledge/faq.md
export const FAQ_TOPICS = {
  call_length: 'FAQ-01', call_cost: 'FAQ-02', adviser_who: 'FAQ-03', bot_identity: 'FAQ-04', privacy: 'FAQ-05',
  cancel_move: 'FAQ-06', documents: 'FAQ-07', scam: 'FAQ-08', business_model: 'FAQ-09', sales_pressure: 'FAQ-10',
  existing_cover: 'FAQ-11', age_over: 'FAQ-12', age_under: 'FAQ-13', number_source: 'FAQ-14', lead_velocity: 'FAQ-15',
  call_content: 'FAQ-16', methods: 'FAQ-17', teams_install: 'FAQ-18', partner_join: 'FAQ-19', language_call: 'FAQ-20',
  missed_call: 'FAQ-21', stop_how: 'FAQ-22', data_sharing: 'FAQ-23', email_why: 'FAQ-24', after_call: 'FAQ-25'
};
export const DEFER_TOPICS = ['premium', 'cover_amount', 'product', 'insurer', 'comparison', 'suitability', 'switching', 'tax', 'health',
  'claims', 'investments', 'estate', 'commission'];
// distress = self-harm or bereavement (person immediately, nothing automated); claim_problem = an existing claim
// is being refused or not paid (deferral + a person); bank_details = account / card numbers volunteered.
export const OTHER_TOPICS = ['id_number', 'bank_details', 'complaint', 'distress', 'claim_problem', 'language_chat', 'my_booking', 'off_topic', 'thanks', 'greeting', 'unknown'];
export const ALL_TOPICS = [...Object.keys(FAQ_TOPICS), ...DEFER_TOPICS, ...OTHER_TOPICS];

export const STATES = [
  'consent_pending', 'q_age', 'q_bond', 'q_dependants', 'q_budget', 'q_budget_clarify',
  'unbooked', 'booking', 'booked_await_commit', 'contact_confirm', 'booked', 'confirmed', 'rescheduling',
  'meeting_due', 'outcome_pending', 'attended', 'no_show', 'broker_no_show',
  'closed_unbooked', 'closed_oob', 'closed_no_consent', 'closed_attended', 'opted_out', 'handoff'
];
const BOOKED = new Set(['booked_await_commit', 'contact_confirm', 'booked', 'confirmed', 'rescheduling', 'meeting_due']);
const PRE_BOOKING = new Set(['consent_pending', 'q_age', 'q_bond', 'q_dependants', 'q_budget', 'q_budget_clarify', 'unbooked', 'booking', 'closed_unbooked', 'no_show', 'broker_no_show']);
const QUAL = { q_age: ['age_band', 'q_bond'], q_bond: ['bond', 'q_dependants'], q_dependants: ['dependants', 'q_budget'], q_budget: ['budget_band', 'unbooked'], q_budget_clarify: ['budget_band', 'unbooked'] };

const outOfBand = (s = {}) => s.age_band === '<35' || s.age_band === '51+' || s.budget_band === '<750';

function sameBooking(slots = {}, booking = {}) {
  if (!booking) return false;
  const dayOk = !slots.preferred_day || [booking.day, booking.date, booking.relative].filter(Boolean).includes(slots.preferred_day);
  const timeOk = !slots.preferred_time || slots.preferred_time === booking.time || slots.preferred_time === booking.time_band;
  return Boolean(slots.preferred_day || slots.preferred_time) && dayOk && timeOk;
}

/**
 * decide(state, nlu, pre, ctx) -> { actions: string[], next_state }
 * nlu = { intent, secondary_intents[], topics[], consent_answer, slots{}, sentiment, language, confidence }
 * pre = prefilter() output. ctx = { booking: {day,date,time,time_band,method}, unanswered: n }
 */
export function decide(state, nlu = {}, pre = {}, ctx = {}) {
  const intents = [nlu.intent, ...(nlu.secondary_intents || [])].filter(Boolean);
  const topics = nlu.topics || [];
  const slots = nlu.slots || {};
  const has = (i) => intents.includes(i);

  // 1. Global interrupts, in priority order.
  if (pre.stop || has('stop')) return { actions: ['stop'], next_state: 'opted_out' };
  // Self-harm or bereavement: a person, now, in every state. Nothing automated is sent (no deferral line, no
  // handoff line); handoff.md trigger 6 alerts Jonathan and KG together.
  if (pre.distress || topics.includes('distress')) return { actions: ['handoff_urgent'], next_state: 'handoff' };
  if (state === 'opted_out') return { actions: ['human_review'], next_state: 'opted_out' };
  if (state === 'handoff') return { actions: ['paused'], next_state: 'handoff' };
  if (has('person') || pre.person || pre.complaint || topics.includes('complaint')) return { actions: ['handoff'], next_state: 'handoff' };
  if (nlu.sentiment === 'frustrated') return { actions: ['handoff'], next_state: 'handoff' };
  // An existing claim being refused or not paid (DEF-09): the deferral line, then a person.
  if (pre.claim_problem || topics.includes('claim_problem')) return { actions: ['defer', 'handoff'], next_state: 'handoff' };

  // A typed monthly amount while answering the budget question is a qualifying answer, not a price question.
  const budgetAnswer = (state === 'q_budget' || state === 'q_budget_clarify') && slots.budget_band && !pre.health
    && (pre.advice_topics || []).every((t) => t === 'amount');
  const defer = (Boolean(pre.defer) && !budgetAnswer) || topics.some((t) => DEFER_TOPICS.includes(t));
  const tail = () => {
    const a = [];
    // After the meeting there is no "call" to defer to: the post-call variant points to the adviser's own follow-up (4.12).
    if (defer) a.push(state === 'attended' || state === 'closed_attended' ? 'defer_after_call' : 'defer');
    if (pre.id_number || topics.includes('id_number')) a.push('id_warning');
    if (pre.bank || topics.includes('bank_details')) a.push('bank_warning');
    if (pre.media) a.push('media_not_opened');
    return a;
  };

  if (pre.injection || pre.impersonation) return { actions: ['stay_in_lane', ...(defer ? ['defer'] : [])], next_state: state };

  const answers = [];
  for (const t of topics) if (FAQ_TOPICS[t] && !answers.includes(`answer:${FAQ_TOPICS[t]}`)) answers.push(`answer:${FAQ_TOPICS[t]}`);
  if (topics.includes('language_chat')) answers.push('set_language');
  if (topics.includes('my_booking') && BOOKED.has(state)) answers.push('booking_status');
  if (topics.includes('off_topic') && !answers.length && !defer) return { actions: ['stay_in_lane'], next_state: state };

  // 2. Consent step (CTWA, 4.6 step 2). Consent is never inferred from anything but a clear yes.
  if (state === 'consent_pending') {
    if (nlu.consent_answer === 'yes') return { actions: [...answers, ...tail(), 'consent_yes'], next_state: 'q_age' };
    if (nlu.consent_answer === 'no') return { actions: ['consent_no'], next_state: 'closed_no_consent' };
    return { actions: [...answers, ...tail(), 'consent_reask'], next_state: state };
  }

  // 3. Qualifying (tap-first; typed answers accepted and mapped to bands by the intent model).
  if (QUAL[state]) {
    if (outOfBand(slots)) return { actions: ['close_oob'], next_state: 'closed_oob' };
    const [key, next] = QUAL[state];
    if (slots[key] !== undefined && slots[key] !== null) {
      if (key === 'budget_band' && slots[key] === 'unsure') {
        return state === 'q_budget'
          ? { actions: [...answers, ...tail(), 'record_answer', 'budget_clarify'], next_state: 'q_budget_clarify' }
          : { actions: ['close_oob'], next_state: 'closed_oob' };
      }
      return { actions: [...answers, ...tail(), 'record_answer', 'next_question'], next_state: next };
    }
    return { actions: [...answers, ...tail(), 'repeat_question'], next_state: state };
  }

  // 4. Band conflicts typed later (memory: never ask twice, never silently overwrite).
  const ops = [];
  if (outOfBand(slots)) {
    if (PRE_BOOKING.has(state)) return { actions: ['close_oob'], next_state: 'closed_oob' };
    if (BOOKED.has(state)) ops.push('flag_band_conflict');
  }

  // 5. Operational intents.
  let next = state;
  const pref = Boolean(slots.preferred_day || slots.preferred_time);
  const prefDiffers = pref && !sameBooking(slots, ctx.booking);
  for (const i of intents) {
    if (i === 'book') {
      if (BOOKED.has(state)) {
        if (sameBooking(slots, ctx.booking)) {
          if (state === 'booked_await_commit') { ops.push('commitment_ok'); next = ['whatsapp_call', 'phone'].includes(ctx.booking?.method) ? 'contact_confirm' : 'booked'; }
          else if (!answers.includes('booking_status')) ops.push('booking_status');
        } else if (state === 'booked_await_commit' && !slots.method && pref) { ops.push('commitment_check'); }
        else if (prefDiffers) { ops.push('reschedule_slots'); next = 'rescheduling'; }
        else if (slots.method) ops.push('change_method');
        else if (!answers.includes('booking_status')) ops.push('booking_status');
      } else { ops.push(pref ? 'offer_slots' : 'send_slots'); next = 'booking'; }
    } else if (i === 'reschedule') {
      if (BOOKED.has(state)) {
        if (prefDiffers) { ops.push('reschedule_slots'); next = 'rescheduling'; }
        else if (slots.method) ops.push('change_method');
        else { ops.push('reschedule'); next = 'rescheduling'; }
      }
      else { ops.push(pref ? 'offer_slots' : 'send_slots'); next = 'booking'; }
    } else if (i === 'cancel') {
      if (BOOKED.has(state)) ops.push('cancel_confirm');
      else { ops.push('close_unbooked'); next = 'closed_unbooked'; }
    }
  }
  if (slots.method && BOOKED.has(state) && !has('book') && !has('reschedule')) ops.push('change_method');
  if (slots.email || slots.call_number) ops.push('capture_contact');

  let actions = [...answers, ...tail(), ...ops];
  actions = actions.filter((a, idx) => actions.indexOf(a) === idx);
  if (!actions.length) {
    if ((nlu.confidence ?? 1) < 0.6 || topics.includes('unknown')) {
      actions = (ctx.unanswered || 0) >= 1 ? ['handoff'] : ['clarify'];
      if (actions[0] === 'handoff') next = 'handoff';
    } else actions = [topics.includes('greeting') ? 'greet' : 'none'];
  }
  if (actions.length > 1) actions = actions.filter((a) => a !== 'none');
  return { actions, next_state: next };
}
