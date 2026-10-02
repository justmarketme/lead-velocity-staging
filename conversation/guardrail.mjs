// conversation/guardrail.mjs
// Deterministic layer of Thandi's guardrail (4.11, 2.1.1, 2.1.7). No dependencies, Node 18+.
// Imported by evals/run.mjs and pasted into the W07 n8n Code node (NODE_FUNCTION_ALLOW_BUILTIN not needed).
//
// Three jobs, all deterministic and all run on EVERY turn:
//   1. prefilter(text, ctx)  - on the LEAD's message, before any LLM call: STOP, person, complaint,
//                              advice-seeking topics, health / ID detail, prompt injection, impersonation.
//   2. redact(text)          - masks ID numbers and health detail before the text reaches an LLM or storage.
//   3. outputGate(draft,ctx) - on the DRAFT reply, after the reply LLM and before send. Any hit means the
//                              generated part is dropped and only fixed, pre-approved lines are sent.
//   4. toneCheck(text,ctx)   - persona rules: no emoji unless the lead used one, no "!", <= 2 generated
//                              sentences, <= 1 question, Grade 5-7 (Flesch-Kincaid <= 8 for heuristic slack).
//
// The LLM guardrail classifier (conversation/prompts/guardrail.md) runs AFTER outputGate passes. Regex first
// because it is free and cannot be talked out of its rules; the classifier catches paraphrases regex misses.

export const VERSION = 'guardrail-2026-10-02.1';

const I = 'iu';
const rx = (s) => new RegExp(s, I);

// ---------- shared vocab ----------
const INSURERS = [
  'old mutual', 'sanlam', 'discovery', 'momentum', 'liberty', 'hollard', 'bright ?rock', 'fmi', 'pps',
  'assupol', 'clientele', '1 ?life', 'one ?life', 'king price', 'outsurance', 'capitec', 'absa', 'fnb',
  'standard bank', 'nedbank', 'avbob', 'metropolitan', 'santam', 'miway', 'dial direct', 'budget insurance',
  'auto ?& ?general', 'stangen', 'bidvest life', 'professional provident', 'allan gray', 'coronation',
  'sygnia', 'fedgroup', 'prosperity', 'netcare', 'bestmed', 'medshield', 'bonitas', 'hollardlife'
];
const INSURER_RX = rx(`\\b(${INSURERS.join('|')})\\b`);

const PRODUCTS = [
  'funeral( cover| plan| policy)?', 'begrafnis\\w*', 'disability( cover| insurance| benefit)?', 'ongeskiktheid\\w*',
  'dread disease', 'critical illness', 'severe illness', 'ernstige siekte', 'income protection', 'inkomstebeskerming',
  'endowment', 'retirement annuit(y|ies)', 'uittree-?annuiteit', 'key ?(person|man)( cover)?', 'buy[- ]and[- ]sell',
  'term (life|cover|policy|insurance)', 'whole (of )?life', 'hospital (cash|plan)', 'gap cover', 'medical aid',
  'mediese fonds', 'credit life', 'mortgage protection', 'bond protection', 'education (policy|plan)',
  'investment( policy| plan)?', 'unit trusts?', 'tax[- ]free savings', 'living annuit(y|ies)', 'level premium',
  'accelerated (benefit|cover)', 'riders?'
];
const PRODUCT_RX = rx(`\\b(${PRODUCTS.join('|')})\\b`);

const HEALTH = [
  'diabe\\w*', 'sugar diabetes', 'suikersiekte', 'suiker', 'hiv', 'miv', 'aids', 'arvs?', 'antiretroviral\\w*',
  'cancer', 'kanker', 'tumou?rs?', 'chemo\\w*', 'smok(e|er|ers|ing)', 'rook', 'rooker', 'cigarettes?', 'vap(e|ing)',
  'blood ?pressure', 'bloeddruk', 'hypertension', 'high bp', 'heart (attack|condition|disease|problem|problems|surgery)',
  'hartaanval', 'hartprobleme?', 'stroke', 'beroerte', 'asthma', 'asma', 'epilep\\w*', 'pregnan\\w*', 'swanger',
  'medication', 'medikasie', 'chronic\\w*', 'kronies\\w*', 'surgery', 'operasie', 'depress\\w*', 'bipolar',
  'anxiety', 'mental health', 'cholesterol', 'kidney\\w*', 'nier\\w*', 'liver', 'tb', 'tuberculosis', 'hepatitis',
  'blood test', 'bloedtoets', 'hospitali[sz]ed', 'in hospital', 'on meds', 'meds', 'pre-?existing',
  'underwrit\\w*', 'medical (history|condition|conditions|test|tests|exam|issue|issues|report)',
  '(health|heart|chronic|existing|medical) condition', 'have a condition',
  "(i'm|im|i am|was|been|got|getting) (sick|ill)", 'my (illness|diagnosis)', 'diagnos\\w*', 'siekte',
  "(had|have|having|need) (an |a )?(operation|op)\\b", 'disease', 'overweight', 'obes\\w*', 'bmi'
];
const HEALTH_RX = rx(`\\b(${HEALTH.join('|')})\\b`);

// SA ID: 13 digits, possibly grouped YYMMDD SSSS C A Z. Also passport / ID-number mentions.
const ID_DIGITS_RX = /\b\d{6}[ -]?\d{4}[ -]?\d{2}[ -]?\d\b/u;
const ID_WORDS_RX = rx(`\\b(id|identity|identiteits?|passport|paspoort)[ -]?(number|no\\.?|nr\\.?|nommer|book|boek)\\b`);

const TIME_WORDS = '(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day)?|today|tomorrow|morning|afternoon|evening|lunch|time|slot|day|date|week|maandag|dinsdag|woensdag|donderdag|vrydag|môre|oggend|middag|aand|tyd|dag|\\d{1,2}(:\\d{2})?\\s*(am|pm|h)?';

// ---------- 1. PREFILTER (lead's message) ----------
const STOP_RX = [
  /^\s*(please\s+|pls\s+|plz\s+|asseblief\s+)?(stop|stopp|stp|unsubscribe|opt[ -]?out|end|quit|cancel all|stop all|remove me|uitteken|hou op|staak)(\s+(stop|please|pls|now|asseblief|nou))*\s*[.!]*\s*$/iu,
  /(?<!(don'?t|do not|never|dont)\s)\bstop\s+(messag\w*|send\w*|text\w*|contact\w*|whats\s?app\w*|spamm\w*|the (messages|reminders|texts)|bothering|it)\b/iu,
  /\b(unsubscribe|opt me out|opt-out|remove me|take me off|delete my (number|details))\b/iu,
  /\b(don'?t|do not|never)\s+(message|contact|text|whatsapp|call)\s+me\s+(again|anymore|any more)\b/iu,
  /\bleave me alone\b/iu,
  /\b(moenie my (weer )?(kontak|boodskap|bel|whatsapp)|hou op (om )?(my )?(te )?(boodskap|stuur|kontak)|haal my af|verwyder my)\b/iu
];

const PERSON_RX = [
  /\b(speak|talk|chat|connect|transfer|put)\b.{0,25}\b(person|human|someone|somebody|agent|consultant|manager|real one|staff)\b/iu,
  /\b(want|need|can i (get|have)|give me|get me)\b.{0,15}\b(a |an )?(real |actual )?(person|human|agent|consultant|manager)\b/iu,
  /^\s*(person|human|agent|operator|mens|persoon)\s*[.!?]*\s*$/iu,
  /\b(praat|gesels)\b.{0,15}\b(mens|persoon|iemand|regte mens)\b/iu,
  /\b(mens|persoon|iemand)\b.{0,15}\b(praat|gesels)\b/iu,
  /\bnot (a |another )?(bot|robot|machine|ai)\b.{0,20}\b(please|pls|plz)\b/iu,
  /\bno more (bots?|robots?|ai)\b/iu,
  /\b(someone|somebody|a person|a human|anyone)\b.{0,12}\b(i can|to|who can)\s+(talk|speak|chat)\b/iu
];

const COMPLAINT_RX = [/^\s*(complaint|klagte)\b/iu, /\b(lay|make|lodge|file|log|submit) a complaint\b/iu, /\bwil 'n klagte\b/iu];

const ADVICE = {
  amount: [/\bR?\s?\d[\d ,.]*(k)?\s+(a|per|each|elke)\s+(month|maand)\b/iu, /\bR\s?\d[\d ,.]*\s*(pm|p\/m)\b/iu],
  premium: [
    /\bpremiums?\b/iu, /\bpremies?\b/iu, /\bquotes?\b/iu, /\bkwotasies?\b/iu,
    /\b(cost|price|pay|kos|betaal)\b.{0,25}\b(per|a|each|elke|per)\s+(month|maand)\b/iu,
    /\bmonthly\s+(cost|payment|amount|price)\b/iu,
    /\bwhat\s+(does|would|will|might)\s+(it|cover|life cover|a policy|the policy|insurance|that)\s+cost\b/iu,
    /\b(cost|price)s?\s+(of|for)\s+(the\s+)?(cover|policy|insurance|life cover)\b/iu,
    /\b(roughly|ballpark|estimate|rough idea|more or less|ongeveer)\b.{0,40}\b(cost|pay|price|amount|kos|betaal)\b/iu,
    /\bhow much\b(?!.{0,40}\b(time|tym|tyme|long|minutes|notice|call|cal|meeting|appointment|chat|data)\b)/iu,
    /\bhoeveel\b(?!.{0,40}\b(tyd|lank|minute|oproep|gesprek|afspraak|data)\b)/iu,
    /\bwhat (will|would) i (pay|be paying)\b/iu,
    /\b(pay|paying|betaal)\s+(more|less|meer|minder)\b/iu,
    /\b(koste|prys)\b.{0,20}\b(polis|dekking|versekering)\b/iu,
    /\b(too )?expensive\b/iu, /\b(te|baie) duur\b/iu, /\baffordable\b/iu
  ],
  cover_amount: [
    /\bhow much (cover|insurance|life cover|payout)\b/iu,
    /\b(how many|hoeveel)\s+(times|keer)\b/iu,
    /(?<!\d)\d[\d ,.]*\s*(million|mil|miljoen)\b/iu, /\bR\s?\d[\d ,.]*\s*m\b/iu,
    /\b(sum assured|cover amount|amount of cover|payout|uitbetaling|dekkingsbedrag)\b/iu,
    /\b(\d+|two|three|four|five|six|seven|eight|ten|twee|drie|vier|vyf|tien)\s*(x|times|keer)\s*(my |your |jou |my )?(salary|income|salaris|inkomste|annual)\b/iu,
    /\b\d+\s*(k|m|mil|million|miljoen)\b.{0,25}\b(cover|policy|payout|dekking|polis)\b/iu,
    /\b(r\s?\d[\d ,.]*\s*(k|m|mil|million|miljoen)?)\b.{0,15}\b(cover|policy|payout|dekking|polis)\b/iu,
    /\b(cover|dekking)\b.{0,15}\b(of|for|van)\s+r\s?\d/iu
  ],
  product: [PRODUCT_RX, /\bwhat (policy|policies|product|products|cover|plan) (does|do|will|would|should|is)\b/iu, /\b(which|watter) (policy|polis|product|plan)\b/iu],
  insurer: [INSURER_RX, /\b(which|what) (insurer|company|provider|versekeraar|maatskappy)\b/iu, /\bversekeraars?\b/iu],
  comparison: [
    /\bbetter than\b/iu, /\bbeter as\b/iu, /\bworse (than|off|value)\b/iu, /\bslegter as\b/iu, /\bis it better\b/iu, /\bwhich (one )?is better\b/iu, /\bwat is beter\b/iu,
    /\bbetter (cover|policy|deal|option|insurer|company|plan|product)\b/iu,
    /\b(cheaper|cheapest|goedkoper|goedkoopste)\b/iu,
    /\bbest (cover|policy|insurer|company|option|deal|price|plan|product|one|life cover|insurance)\b/iu,
    /\bbeste (polis|dekking|versekeraar|opsie|plan)\b/iu,
    /\b(compare|comparison|vergelyk\w*|versus)\b/iu, /\bvs\.?\s/iu,
    /\bis that (a good deal|normal|fair|reasonable|too much|too little|too expensive|expensive|cheap|a lot)\b/iu,
    /\b(good deal|rip[- ]?off|overpaying|paying too much)\b/iu,
    /\bor (should i|must i|do i)\b/iu
  ],
  suitability: [
    /\b(is|am|are)\s+(my|i|we|ons|my)\b.{0,35}\b(enough|covered|under-?insured|over-?insured|genoeg|gedek)\b/iu,
    /\benough (cover|insurance|life cover|dekking)\b/iu, /\b(should|must|would) (my|our) (cover|policy|insurance|payout)\b/iu, /\b(cover|insurance|dekking)\b.{0,15}\b(enough|genoeg)\b/iu,
    /\bunder-?insured\b|\bover-?insured\b|\bonderverseker\w*\b/iu,
    new RegExp(`\\b(should|must|do|would|shall)\\s+(i|we)\\s+(get|take|buy|have|cancel|switch|change|increase|reduce|keep|go with|choose|pick|sign|need|add|drop|top up|upgrade|downgrade)\\b(?!.{0,30}\\b(${TIME_WORDS}|teams|app|link|laptop|computer|email|anything|payslip|documents?|to (bring|prepare|download|install|join|sign up|be there))\\b)`, I),
    /\b(moet|behoort)\s+ek\b(?!.{0,30}\b(tyd|dag|skakel|teams|enigiets|dokumente|bring|voorberei)\b)/iu,
    /\b(would|do|can) you (recommend|suggest|advise)\b/iu, /\brecommend\w*\b|\baanbeveel\b|\bbeveel\b/iu,
    /\badvi[cs]e\b|\badvies\b|\braad\b(?!s)/iu,
    /\b(right|suitable|good|best) (for me|for us|for my family|vir my|vir ons)\b(?!.{0,20}\b(time|day|tyd|dag)\b)/iu,
    /\b(make|makes) sense for (me|us)\b/iu,
    /\bworth (getting|taking|buying|switching|it to (get|switch|buy))\b/iu,
    /\b(will|would|can|could) (i|we) (get|be) (accepted|approved|declined|covered|loaded)\b/iu,
    /\bqualify for (cover|insurance|a policy|life cover)\b/iu,
    /\bwhat (type|kind|sort) of (cover|policy|insurance|product)\b/iu,
    /\b(do|would) i need (life )?(cover|insurance|a policy|more|less)\b/iu
  ],
  switching: [
    /\b(cancel|switch|replace|move|change|stop paying|lapse|cash in|cash out|kanselleer|verander|skuif)\b.{0,30}\b(policy|policies|cover|insurer|insurance|provider|polis|dekking|versekeraar)\b/iu
  ],
  tax: [/\b(tax|taxes|taxed|taxable|sars|deductible|estate duty|boedelbelasting|belasting)\b/iu]
};

const INJECTION_RX = [
  /\b(ignore|disregard|forget|override)\b.{0,30}\b(previous|prior|above|earlier|all|your|the)\b.{0,20}\b(instructions?|rules?|prompts?|guidelines?|guardrails?)\b/iu,
  /\bsystem\s*prompt\b|\bdeveloper mode\b|\bjail ?break\b|\bDAN\b|\bdo anything now\b|\badmin mode\b|\bgod mode\b/u,
  /\b(you are|you're) now\b|\bfrom now on (you|act)\b|\bnew (instructions|rules|persona)\b/iu,
  /\b(pretend|imagine|role-?play|act as|let'?s play|play a game|hypothetically|in theory|just between us|off the record)\b/iu,
  /<\/?\s*(system|assistant|user|instructions?)\s*>|\[\/?INST\]|###\s*(instruction|system)|\{\{.*\}\}/iu,
  /\b(repeat|print|show|reveal|output|tell me)\b.{0,25}\b(your )?(instructions|prompt|rules|system message|configuration|config)\b/iu,
  /\b(repeat|print|show|output|copy)\b.{0,20}\b(text|words|message|everything|lines?)\s+(above|before|earlier)\b/iu,
  /\bstarting with ["'“]?you are\b/iu,
  /\b(translate|encode|base64|rot13)\b.{0,30}\b(instructions|prompt|rules)\b/iu,
  /\b(no|without) (rules|restrictions|filters|guardrails)\b/iu,
  /\bnot an ai\b.{0,30}\b(so|then)\b|\bforget you('re| are) an ai\b/iu
];

function impersonationRx(ctx = {}) {
  const names = ['jonathan', 'kg', 'the (adviser|advisor|broker)', 'your (adviser|advisor|broker|boss|developer|admin|owner|creator|manager)',
    'from lead velocity', 'lead velocity (staff|admin|support|team|management)', 'from sortmycover', 'sortmycover (staff|admin|support|team)',
    'the developer', 'an? (anthropic|meta|whatsapp) (engineer|employee|admin)'];
  if (ctx.adviser_first) names.push(escapeRx(ctx.adviser_first.toLowerCase()));
  if (ctx.adviser) names.push(escapeRx(ctx.adviser.toLowerCase()));
  return [
    new RegExp(`\\b(this is|i am|i'm|im|it's|its|hier is|ek is)\\s+(${names.join('|')})\\b`, I),
    /\bas (the|your) (adviser|advisor|broker|admin|developer|owner)\b/iu,
    /\b(admin|staff|broker|adviser|advisor|developer) (override|access|here|instruction|command)\b/iu,
    /\b(on behalf of|instructed by|authori[sz]ed by)\b.{0,20}\b(the )?(adviser|advisor|broker|lead velocity|management)\b/iu,
    /\b(send|give|share|forward) me\b.{0,30}\b(other|all|another)\b.{0,15}\b(leads?|clients?|customers?|bookings?|numbers?)\b/iu
  ];
}

function escapeRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const any = (list, text) => list.some((r) => r.test(text));

/**
 * prefilter: deterministic read of the lead's message. Never replaces the intent LLM; it OR-merges with it
 * (a flag here can only make the system MORE careful, never less).
 */
export function prefilter(text, ctx = {}) {
  const t = String(text || '').normalize('NFKC');
  const advice_topics = [];
  for (const [topic, list] of Object.entries(ADVICE)) if (any(list, t)) advice_topics.push(topic);
  const health = HEALTH_RX.test(t);
  const id_number = ID_DIGITS_RX.test(t) || ID_WORDS_RX.test(t);
  const injection = any(INJECTION_RX, t);
  const impersonation = any(impersonationRx(ctx), t);
  const stop = any(STOP_RX, t);
  const complaint = any(COMPLAINT_RX, t);
  const person = any(PERSON_RX, t);
  const lead_used_emoji = /\p{Extended_Pictographic}/u.test(t);
  const sensitive = health || id_number;
  return {
    stop, person, complaint, injection, impersonation, health, id_number, sensitive,
    advice_topics, advice: advice_topics.length > 0,
    // must the system answer with the fixed deferral line? (an ID number alone gets ID_WARNING, not DEFER)
    defer: advice_topics.length > 0 || health,
    lead_used_emoji
  };
}

// ---------- 2. REDACTION (POPIA special personal information, 2.1.7) ----------
export const REDACTED_ID = '[ID number removed]';
export const REDACTED_HEALTH = '[health detail removed]';
export const BRIEF_HEALTH_LINE = 'has a health question for you';

/** Mask before any LLM call (ID digits always; health words -> placeholder so intent can still be read). */
export function redactForLLM(text) {
  let t = String(text || '');
  t = t.replace(new RegExp(ID_DIGITS_RX.source, 'gu'), REDACTED_ID);
  t = t.replace(new RegExp(HEALTH_RX.source, 'giu'), '[health]');
  return t;
}

/** What is stored in `conversations`: the whole message is replaced if it carried health or ID detail. */
export function redactForStorage(text) {
  const p = prefilter(text);
  if (p.health || ID_DIGITS_RX.test(String(text))) return p.health ? REDACTED_HEALTH : String(text).replace(new RegExp(ID_DIGITS_RX.source, 'gu'), REDACTED_ID);
  return String(text);
}

// ---------- 3. OUTPUT GATE (draft reply, before send) ----------
const OUT = {
  premium: [/\bpremiums?\b/iu, /\bpremies?\b/iu, /\bquot(e|es|ed|ing)\b/iu, /\bkwotasie\w*\b/iu,
    /\bR\s?\d[\d\s,.]*\b/u, /\b\d[\d\s,.]*\s?rand\b/iu, /\bper (month|maand)\b.{0,20}\b(for|vir)\b/iu,
    /\b(cost|costs|pay|paying|kos|betaal)\b.{0,30}\b(a|per|each)\s+(month|maand)\b/iu, /\b\d+\s?%/u, /\bpercent\b/iu],
  cover_amount: [/\b(sum assured|cover amount|amount of cover|dekkingsbedrag|payout|uitbetaling)\b/iu,
    /\b(\d+|two|three|four|five|six|eight|ten|twee|drie|vier|vyf|tien)\s*(x|times|keer)\s*(your |jou )?(salary|income|salaris|inkomste|annual)\b/iu,
    /\b\d+\s*(million|miljoen|mil)\b/iu, /\bhow much cover\b|\bhoeveel dekking\b/iu],
  product: [PRODUCT_RX],
  insurer: [INSURER_RX],
  comparison: [/\bbetter than\b|\bbeter as\b/iu, /\b(cheaper|cheapest|goedkoper|goedkoopste|more affordable)\b/iu,
    /\bcompared? (to|with)\b|\bin comparison\b|\bversus\b|\bvs\.?\s/iu,
    /\bbest\b(?!\s+(time|times|day|days|number|way to reach|to reach))/iu, /\bbeste\b(?!\s+(tyd|dag|nommer))/iu,
    /\b(is|are) (a )?(good|great|fair|bad|poor) (deal|value|price)\b/iu, /\bworse (than|off|value)\b|\b(good|bad|better|poor) value\b|\bslegter as\b/iu],
  suitability: [/\byou should\b|\byou'?d better\b|\byou ought\b|\bjy behoort\b/iu,
    /\byou (need|must|have to)\b.{0,15}\b(get|take|buy|cancel|switch|increase|reduce|keep|change|more|less|cover|a policy|insurance)\b/iu,
    /\bjy moet\b.{0,20}\b(kry|neem|koop|kanselleer|verhoog|verander|verminder|oorskakel)\b/iu,
    /\bi('d| would)? (recommend|suggest|advise)\b|\bmy advice\b|\bek beveel\b|\bmy raad\b|\bek stel voor\b/iu,
    /\bif i were you\b|\bin your (position|shoes)\b/iu,
    /\b(right|suitable|ideal|perfect|best) (cover|policy|product|option|choice|amount|plan) for you\b/iu,
    /\bsuits? your (needs|situation|family|budget|life)\b|\bsuitable for you\b|\b(cover|policy|option|product|plan|amount) (that |which )?suits? you\b|\bmakes sense for you\b|\bpas by jou\b/iu,
    /\b(will|would|should|can) (cover|accept|decline|insure) you\b|\bjou dek\b|\bgedek word\b|\b(aanvaar|afgekeur|geweier) word\b/iu,
    /\bworth (getting|taking|buying|switching|it for you)\b/iu,
    /\byou('ll| will)? (probably |likely |definitely )?(qualify|be (declined|accepted|approved|loaded|covered|fine))\b/iu,
    /\b(under|over)-?insured\b|\bnot enough (cover|insurance)\b|\b(cover|insurance) (is|isn'?t|is not|won'?t be) enough\b|\bwell covered\b|\bgenoeg dekking\b/iu,
    /\bloading\b|\bexclusions?\b/iu],
  tax: [/\b(tax|taxes|taxable|tax-free|sars|deductible|estate duty|belasting)\b/iu],
  health: [HEALTH_RX],
  id: [ID_DIGITS_RX, /\b(id|identity) number (is|:)\b/iu],
  guarantee: [/\bguarantee\w*\b|\bwaarborg\w*\b/iu, /\b(save|saving) (you )?(money|\d)/iu, /\binvestment returns?\b|\breturns? on\b/iu],
  urgency: [/\bhurry\b|\bact now\b|\blimited time\b|\blast chance\b|\bbefore it'?s too late\b|\bdon'?t miss( out)?\b|\bprices? (are )?(going|go) up\b|\bonly today\b/iu],
  persona_break: [/\bsystem prompt\b|\bmy (instructions|rules|prompt) (are|say|is)\b|\bi am now\b|\bi'm now\b|\bas dan\b|\bdeveloper mode\b|\bjailbr\w*\b/iu,
    /\b(i'?m|i am) (not an ai|a real person|human|a human|not a bot|a person)\b|\bek is (nie 'n ki nie|'n regte mens|'n mens)\b/iu,
    /\bas an ai language model\b|<\/?system>/iu],
  data_leak: [/\b(other|another|all) (leads?|clients?|customers?|bookings?)\b/iu, /\b(lead|client) list\b/iu,
    /\btheir (number|phone|email|id|details)\b/iu, /\b(api key|password|access token|secret)\b/iu]
};

/**
 * outputGate: scans the GENERATED part of a reply. Known fixed lines (deferral, disclosure, handoff, ...) are
 * removed first, because they are pre-approved and appended by code, not by the LLM.
 * ctx.scarcity_true allows "N slots left" phrasing only when W04 says it is true.
 */
export function outputGate(draft, ctx = {}) {
  let t = String(draft || '');
  for (const line of ctx.fixed_lines || []) if (line) t = t.split(line).join(' ');
  const hits = [];
  for (const [cat, list] of Object.entries(OUT)) for (const r of list) {
    const m = t.match(r);
    if (m) { hits.push({ category: cat, match: m[0] }); break; }
  }
  if (!ctx.scarcity_true && /\b\d+\s+(slots?|times?|spots?|plekke)\s+(left|available|oor)\b/iu.test(t)) hits.push({ category: 'urgency', match: 'unverified scarcity' });
  return { pass: hits.length === 0, hits, categories: [...new Set(hits.map((h) => h.category))] };
}

// ---------- 4. TONE ----------
const SALESY = /\b(amazing|awesome|fantastic|exciting|incredible|special offer|discount|free gift|deal of|act fast|dear (sir|madam|customer)|valued customer|kindly|herewith|revert)\b/iu;

export function countSentences(t) {
  const s = String(t || '').replace(/\b(e\.g|i\.e|etc|Mr|Mrs|Ms|Dr|vs)\./giu, '$1').replace(/\d\.\d/gu, '0').trim();
  if (!s) return 0;
  return s.split(/(?<=[.?!])\s+|\n+/u).map((x) => x.trim()).filter((x) => /[\p{L}\p{N}]/u.test(x)).length;
}

function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

/** Flesch-Kincaid grade (heuristic syllables). Placeholders like {adviser} count as one short word. */
export function fkGrade(text) {
  const t = String(text || '').replace(/\{[a-z_]+\}/giu, 'Mark').replace(/https?:\/\/\S+|\S+@\S+|\S+\.co\.za\S*/giu, 'link');
  const words = t.match(/[\p{L}'’]+/gu) || [];
  if (!words.length) return 0;
  const sents = Math.max(1, countSentences(t));
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  return 0.39 * (words.length / sents) + 11.8 * (syl / words.length) - 15.59;
}

/**
 * toneCheck on the text the LEAD will see.
 * opts.fixed_lines: removed before the sentence/question count (they are fixed, pre-approved lines).
 * opts.lead_used_emoji, opts.lang ('en'|'af'), opts.max_sentences (default 2), opts.max_grade (default 8).
 */
export function toneCheck(text, opts = {}) {
  const issues = [];
  const full = String(text || '');
  let gen = full;
  for (const line of opts.fixed_lines || []) if (line) gen = gen.split(line).join(' ');
  if (!opts.lead_used_emoji && /\p{Extended_Pictographic}/u.test(full)) issues.push('emoji without the lead using one');
  if (/!/u.test(gen)) issues.push('exclamation mark');
  const maxS = opts.max_sentences ?? 2;
  const ns = countSentences(gen);
  if (ns > maxS) issues.push(`${ns} generated sentences (max ${maxS})`);
  const q = (full.match(/\?/gu) || []).length;
  if (q > 1) issues.push(`${q} questions in one message (max 1)`);
  if (SALESY.test(full)) issues.push('salesy or stiff wording');
  if ((opts.lang || 'en') === 'en' && gen.trim()) {
    const g = fkGrade(gen);
    if (g > (opts.max_grade ?? 8)) issues.push(`reading grade ${g.toFixed(1)} (max ${opts.max_grade ?? 8})`);
  }
  if (gen.replace(/\s+/gu, ' ').trim().length > (opts.max_chars ?? 320)) issues.push('generated part over 320 characters');
  return { pass: issues.length === 0, issues };
}

// ---------- 5. PRE-CALL BRIEF CHECK (W11, broker-facing) ----------
/**
 * briefCheck: the brief may quote the lead, but never special personal information (2.1.7) or full identity.
 * brief = { template_vars: {1..9}, portal: {...} }  facts = { last_name, email, age_exact }
 */
export function briefCheck(brief, facts = {}) {
  const issues = [];
  const vars = brief?.template_vars || {};
  for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
    const v = vars[k];
    if (v === undefined || v === null || String(v).trim() === '') issues.push(`template var ${k} missing`);
    else {
      if (/[\n\t]| {5,}/u.test(String(v))) issues.push(`template var ${k} has a newline/tab/5+ spaces (Meta rejects it)`);
      if (String(v).length > 200) issues.push(`template var ${k} over 200 chars`);
    }
  }
  const all = JSON.stringify(brief || {});
  const scrubbed = all.split(BRIEF_HEALTH_LINE).join(' ');
  const h = scrubbed.match(HEALTH_RX);
  if (h) issues.push(`health detail in brief: "${h[0]}"`);
  if (ID_DIGITS_RX.test(all)) issues.push('ID number in brief');
  if (facts.last_name && new RegExp(`\\b${escapeRx(facts.last_name)}\\b`, 'iu').test(all)) issues.push('surname in brief');
  if (/[\w.+-]+@[\w-]+\.[\w.]+/u.test(all)) issues.push('email address in brief');
  if (facts.age_exact && new RegExp(`\\b${facts.age_exact}\\b`, 'u').test(all.replace(/\d{1,2}-\d{1,2}/gu, ''))) issues.push('exact age in brief');
  return { pass: issues.length === 0, issues };
}

// ---------- 6. INTRO SCRIPT GATE (4.10b step 3) ----------
/**
 * scriptCheck: deterministic half of prompts/script-gate.md. Runs on the AI drafts AND on the broker's edit
 * before recording unlocks. facts = { practice, fsp }
 */
export function scriptCheck(script, facts = {}) {
  const issues = [];
  const s = String(script || '');
  const words = (s.match(/[\p{L}\p{N}'’-]+/gu) || []).length;
  if (words < 60 || words > 90) issues.push(`${words} words (must be 60-90)`);
  const fspCount = (s.match(/\bFSP\s*(no\.?|number)?\s*\d{3,6}\b/giu) || []).length;
  if (fspCount !== 1) issues.push(`FSP number appears ${fspCount} times (must be exactly once)`);
  if (facts.fsp && !s.includes(String(facts.fsp))) issues.push('wrong or missing FSP number');
  if (facts.practice) {
    const n = s.split(facts.practice).length - 1;
    if (n !== 1) issues.push(`practice name appears ${n} times (must be exactly once)`);
  }
  if (!/\b(I|I'm|I’m|I'll|I’ll|my)\b/u.test(s)) issues.push('not in the first person');
  if (!/\b(nothing to buy|no pressure|not a sales|no selling|no hard sell|nothing to sign)\b/iu.test(s)) issues.push('does not say what the call is not (nothing to buy / no pressure)');
  if (!/\b(30|thirty)[ -]?(minutes?|min)\b|\bhalf an hour\b/iu.test(s)) issues.push('does not say why 30 minutes');
  const last = s.trim().split(/(?<=[.?!])\s+/u).pop() || '';
  if (!/\{day\}|\b(mon|tues|wednes|thurs|fri|satur|sun)day\b|\bsee you\b|\btalk soon\b|\blooking forward\b|\bspeak (soon|then)\b/iu.test(last)) issues.push('last sentence is not a "see you on {day}" close');
  const gate = outputGate(s.replace(/\bFSP\s*\d+/giu, 'FSP'), {});
  for (const h of gate.hits) issues.push(`FAIS: ${h.category} ("${h.match}")`);
  if (/!/u.test(s)) issues.push('exclamation mark');
  if (/\p{Extended_Pictographic}/u.test(s)) issues.push('emoji');
  return { pass: issues.length === 0, issues, words };
}
