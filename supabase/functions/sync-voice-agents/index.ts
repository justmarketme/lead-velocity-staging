// Config-as-code for Lead Velocity's ElevenLabs agents (Ayanda, Einstein, and the
// SortMyCover receptionist "Lindi"). Admin-only:
// requires the project's service-role JWT (verify_jwt on + role check).
//
//   GET  → current config of both agents + workspace tools (read-only)
//   POST → upsert Ayanda's webhook tools, then PATCH Ayanda (prompt, first
//          message, LLM, tools). Idempotent; run after any persona edit.
//          Einstein is configured by the einstein-agent function, not here.
//   POST ?agent=smc → only the SortMyCover receptionist: find-or-create the agent by
//          name, upsert its smc-voice tools + website knowledge base, PATCH prompt,
//          voice, LLM, data collection, evaluation and its post-call webhook.
//
//   curl -X POST -H "Authorization: Bearer $SERVICE_ROLE_JWT" \
//     https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/sync-voice-agents
import { AYANDA_FIRST_MESSAGE, AYANDA_PROMPT } from "../_shared/ayanda_persona.ts";
import { SMC_AGENT_NAME, SMC_FIRST_MESSAGE, SMC_PROMPT } from "../_shared/smc_receptionist_persona.ts";

const EL = "https://api.elevenlabs.io/v1/convai";
const EINSTEIN_AGENT_ID = "agent_2501m4s6nhfveywrvw9961va7sp3";
// Duplicate Einstein created by a second run of the old setup script — archived, never deleted.
const RETIRED_AGENT_IDS = ["agent_5801m4s6avaeemfr3j5k4fndext3"];
// ElevenLabs-hosted model (no Gemini/OpenAI dependency), per Jono 13 Oct 2026.
const AYANDA_LLM = "glm-52";
const TOOLS_URL = "https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/ayanda-tools-bridge";

const key = () => Deno.env.get("ELEVENLABS_API_KEY")!;
const ayandaId = () => Deno.env.get("ELEVENLABS_AGENT_ID")!;

// GET/PATCH are idempotent, so retry them on ElevenLabs 5xx. POST is not:
// a 5xx can still have created the resource, and the next sync run finds it.
async function el(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${EL}${path}`, {
      ...init,
      headers: { "xi-api-key": key(), "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    if (res.status >= 500 && method !== "POST" && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(body).slice(0, 500)}`);
  }
}

// Every tool gets the live conversation id (the bridge authenticates with it)
// and, on phone calls, the caller's number.
const conversationId = { type: "string", dynamic_variable: "system__conversation_id" };
// caller_number is passed by handle-inbound-call (placeholder "" otherwise).
const callerId = { type: "string", dynamic_variable: "caller_number" };

const TOOL_DEFS = [
  {
    name: "check_availability",
    description: "Get open 15-minute discovery-call slots in South African time. Call before offering any time.",
    properties: {
      preferred_date: { type: "string", description: "Optional day the caller asked for, as YYYY-MM-DD. Omit if none." },
      time_of_day: { type: "string", description: "Optional: 'morning' or 'afternoon' if the caller said so. Omit otherwise." },
      conversation_id: conversationId,
    },
    required: ["conversation_id"],
  },
  {
    name: "book_appointment",
    description: "Book the 15-minute Lead Velocity discovery call once the caller picked a slot and gave name, email and phone.",
    properties: {
      start: { type: "string", description: "The exact 'start' value of the chosen slot from check_availability." },
      name: { type: "string", description: "Caller's full name." },
      email: { type: "string", description: "Email in written form, lowercase, no spaces, e.g. jono@leadvelocity.co.za — never the words 'at' or 'dot'." },
      phone: { type: "string", description: "Number the team should call, digits only, e.g. 0825551234. Omit to use the number they're calling from." },
      company: { type: "string", description: "Company name, if given." },
      website: { type: "string", description: "Website in written form, e.g. www.example.co.za — never 'dot'. Omit if none." },
      notes: { type: "string", description: "One line on what they want (area, products, current lead source)." },
      conversation_id: conversationId,
      caller_id: callerId,
    },
    required: ["start", "name", "email", "conversation_id"],
  },
  {
    name: "send_whatsapp_link",
    description: "Text the caller a tap-to-chat link that opens WhatsApp with Lead Velocity (073 765 1664). Use when they prefer WhatsApp over booking now.",
    properties: {
      phone: { type: "string", description: "Mobile number to text, digits only. Omit to use the number they're calling from." },
      name: { type: "string", description: "Caller's first name, if known." },
      topic: { type: "string", description: "What they want info on, e.g. 'pricing', 'how it works'." },
      conversation_id: conversationId,
      caller_id: callerId,
    },
    required: ["conversation_id"],
  },
];

type ToolDef = { name: string; description: string; properties: Record<string, unknown>; required: string[] };

function toolConfig(t: ToolDef, baseUrl = TOOLS_URL) {
  return {
    tool_config: {
      type: "webhook",
      name: t.name,
      description: t.description,
      response_timeout_secs: 20,
      api_schema: {
        url: `${baseUrl}/${t.name}`,
        method: "POST",
        request_body_schema: { type: "object", description: t.description, properties: t.properties, required: t.required },
      },
    },
  };
}

async function upsertTools(defs: ToolDef[] = TOOL_DEFS, baseUrl = TOOLS_URL): Promise<Record<string, string>> {
  const { tools = [] } = await el("/tools");
  const ids: Record<string, string> = {};
  for (const def of defs) {
    const existing = tools.find((x: ElTool) => x.tool_config?.name === def.name && x.tool_config?.api_schema?.url?.startsWith(baseUrl));
    const saved = existing
      ? await el(`/tools/${existing.id}`, { method: "PATCH", body: JSON.stringify(toolConfig(def, baseUrl)) })
      : await el("/tools", { method: "POST", body: JSON.stringify(toolConfig(def, baseUrl)) });
    ids[def.name] = saved.id ?? existing.id;
  }
  return ids;
}

/** The slice of an ElevenLabs agent response that summary() reads. */
interface ElAgent {
  agent_id?: string;
  name?: string;
  conversation_config?: {
    agent?: {
      first_message?: string;
      prompt?: { llm?: string; tool_ids?: string[]; built_in_tools?: Record<string, unknown>; prompt?: string };
      dynamic_variables?: { dynamic_variable_placeholders?: unknown };
    };
    asr?: { user_input_audio_format?: string };
    tts?: {
      voice_id?: string;
      model_id?: string;
      agent_output_audio_format?: string;
      text_normalisation_type?: string;
      expressive_mode?: boolean;
      suggested_audio_tags?: { tag: string }[];
    };
  };
  platform_settings?: { overrides?: unknown };
}

interface ElTool {
  id: string;
  tool_config?: { name?: string; api_schema?: { url?: string } };
}

function summary(a: ElAgent) {
  const c = a.conversation_config ?? {};
  return {
    agent_id: a.agent_id, name: a.name,
    first_message: c.agent?.first_message,
    llm: c.agent?.prompt?.llm,
    tool_ids: c.agent?.prompt?.tool_ids,
    built_in_tools: Object.keys(c.agent?.prompt?.built_in_tools ?? {}).filter((k) => c.agent?.prompt?.built_in_tools?.[k]),
    voice_id: c.tts?.voice_id, tts_model: c.tts?.model_id,
    audio: [c.asr?.user_input_audio_format, c.tts?.agent_output_audio_format], text_normalisation: c.tts?.text_normalisation_type,
    expressive_mode: c.tts?.expressive_mode, audio_tags: (c.tts?.suggested_audio_tags ?? []).map((t) => t.tag),
    dynamic_variables: c.agent?.dynamic_variables?.dynamic_variable_placeholders,
    overrides: a.platform_settings?.overrides,
    prompt_head: String(c.agent?.prompt?.prompt ?? "").slice(0, 200),
  };
}

// ------------------------------------------------------------------ SortMyCover receptionist (Lindi)

const SMC_TOOLS_URL = "https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/smc-voice/tools";
const SMC_POST_CALL_URL = "https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/smc-voice/post-call";
// THE ONE PLACE Lindi's voice id lives (the persona file, smc-voice and docs never set it). Every
// POST ?agent=smc pushes it and then reads it back, failing loudly if ElevenLabs holds anything else.
// "Linet - African & Friendly": ElevenLabs library, accent "south african", locale en-ZA, conversational,
// mid-age female; chosen 14 Oct 2026 over Claire (gsm4lUH9bnZ3pjR1Pw7w, 13-14 Oct). Alternatives and the
// reasoning are in docs/SMC-VOICE-RECEPTIONIST.md. (Ayanda uses "Thandi"; Lindi deliberately sounds different.)
const SMC_VOICE_ID = "TMGDvkby8aZjBVCmFLOK"; // Voice Design "Cape Town" (was Linet 7Ojkrcr68EynjSd90VK0)
const SMC_LLM = "glm-52"; // ElevenLabs-hosted, same as Ayanda (no Gemini/OpenAI)
// Speech model and delivery. ElevenLabs-only, per Jono: Eleven v4 Turbo with Expressive Mode (audio tags).
const SMC_TTS_MODEL = "eleven_v4_turbo";
const SMC_TTS_SETTINGS = { stability: 0.5, similarity_boost: 0.75, speed: 1 };
// Turn-taking (conversation_config.turn). ElevenLabs has no "seconds of pause after the caller stops" field:
// the wait is decided by the turn-detection model, steered by turn_eagerness. patient = waits for the highest
// end-of-turn confidence; spelling_patience auto = waits longer while names/numbers/emails are read out;
// speculative_turn off = the LLM only starts after the turn is confirmed (so she never pre-empts a pause);
// turn_timeout = seconds of caller silence before she re-engages ("Are you still there?").
const SMC_TURN = {
  turn_eagerness: "patient", spelling_patience: "auto", speculative_turn: false, turn_model: "turn_v3", turn_timeout: 10,
};
// Call recordings and transcripts are kept at ElevenLabs this long, then deleted there (the CRM keeps its own
// transcript copy under the consent-record rules). 12 months matches the privacy page's lead-details period.
const SMC_RETENTION_DAYS = 365;
// The live website is the knowledge base. Add a page here and re-run POST ?agent=smc.
const SMC_KB_URLS = [
  "", "how-it-works/", "faq/", "how-we-make-money/", "about/", "contact/", "complaints/", "advisers/",
  "cover/", "cover/life-cover/", "cover/disability-cover/", "cover/severe-illness-cover/", "cover/income-protection/",
  "wills/", "wills/the-will-appointment/", "privacy/", "terms/",
  "learn/what-happens-on-a-30-minute-call/", "learn/what-happens-to-your-details/", "learn/how-to-check-an-adviser/",
].map((p) => `https://sortmycover.co.za/${p}`);

const smcConversationId = { type: "string", dynamic_variable: "system__conversation_id" };
const smcCallerId = { type: "string", dynamic_variable: "caller_number" };

const SMC_TOOL_DEFS: ToolDef[] = [
  {
    name: "save_caller_details",
    description: "Save the caller's details and consent to SortMyCover's records. Call once, right after they clearly say yes to the consent line. If they are under 35 or over 50, call it with only age_band.",
    properties: {
      first_name: { type: "string", description: "Caller's first name." },
      age_band: { type: "string", description: "Exactly one of: 'under 35', '35 to 44', '45 to 50', 'over 50'." },
      help_with: { type: "string", description: "What they want help with, e.g. 'life cover', 'disability cover', 'severe illness cover', 'income protection', 'a will', 'not sure'. Several allowed." },
      budget_band: { type: "string", description: "Exactly one of: 'under R750', 'R750 to R1,499', 'R1,500 or more', 'not sure'." },
      mobile: { type: "string", description: "Their mobile number, digits only, e.g. 0825551234. Omit to use the number they're calling from." },
      consent: { type: "string", description: "'yes' only if they clearly agreed to the consent line you read; otherwise 'no'." },
      conversation_id: smcConversationId,
      caller_id: smcCallerId,
    },
    required: ["age_band", "conversation_id"],
  },
];

// Live calendar booking is OFF in Lindi's spoken flow (WhatsApp-first, Jono 13 Oct 2026). The handlers
// stay in smc-voice; add these back to SMC_TOOL_DEFS (and the persona) to re-enable on-call booking.
export const SMC_BOOKING_TOOL_DEFS: ToolDef[] = [
  {
    name: "check_availability",
    description: "Get the adviser's open 30-minute call slots (South African time). Call after save_caller_details. If it returns fallback 'whatsapp', do the WhatsApp handoff.",
    properties: {
      preferred_date: { type: "string", description: "Optional day the caller asked for, as YYYY-MM-DD. Omit if none." },
      conversation_id: smcConversationId,
    },
    required: ["conversation_id"],
  },
  {
    name: "book_appointment",
    description: "Book the chosen 30-minute slot with the adviser, once they picked a slot, a method and gave their email.",
    properties: {
      start: { type: "string", description: "The exact 'start' value of the chosen slot from check_availability." },
      method: { type: "string", description: "'teams' (video) or 'phone'." },
      email: { type: "string", description: "Email in written form, lowercase, no spaces, e.g. thandi.mokoena@gmail.com — never the words 'at' or 'dot'." },
      conversation_id: smcConversationId,
    },
    required: ["start", "method", "email", "conversation_id"],
  },
];

const SMC_WHATSAPP_TOOL_DEFS: ToolDef[] = [
  {
    name: "send_whatsapp_followup",
    description: "Send the caller a WhatsApp from SortMyCover, where their appointment with the adviser is set up. Only after save_caller_details AND a clear yes to 'Do I have your permission to contact you on WhatsApp on this number?', with the number confirmed.",
    properties: {
      whatsapp_consent: { type: "string", description: "'yes' only if the caller clearly said yes to being contacted on WhatsApp on this number; otherwise do not call this tool." },
      first_name: { type: "string", description: "Caller's first name, if known." },
      mobile: { type: "string", description: "Mobile number, digits only. Omit to use the saved or calling number." },
      reason: { type: "string", description: "One line, e.g. 'cover appointment', 'will call'." },
      conversation_id: smcConversationId,
      caller_id: smcCallerId,
    },
    required: ["whatsapp_consent", "conversation_id"],
  },
  {
    name: "request_callback",
    description: "The caller declined WhatsApp but agreed that the adviser's office may call them back on this number to set up the appointment. Only after save_caller_details and a clear yes to the call-back.",
    properties: {
      callback_consent: { type: "string", description: "'yes' only if they clearly agreed to a call-back from the adviser's office." },
      preferred_time: { type: "string", description: "Optional best time of day they gave, e.g. 'weekday mornings'." },
      conversation_id: smcConversationId,
    },
    required: ["callback_consent", "conversation_id"],
  },
];

const SMC_DATA_COLLECTION: Record<string, { type: string; description: string }> = {
  outcome: { type: "string", description: "Exactly one of: whatsapp_handoff (send_whatsapp_followup returned ok), callback_requested (request_callback returned ok), out_of_criteria (under 35 or over 50), declined (did not want to proceed or refused consent), info_only (asked questions only), missed (caller said nothing / hung up immediately)." },
  first_name: { type: "string", description: "Caller's first name, if given." },
  age_band: { type: "string", description: "under 35, 35 to 44, 45 to 50, over 50, or empty." },
  help_with: { type: "string", description: "What the caller wanted help with (life, disability, severe illness, income protection, will, not sure)." },
  budget_band: { type: "string", description: "Monthly comfort band the caller gave: under R750, R750 to R1,499, R1,500 or more, not sure, or empty." },
  consent_given: { type: "boolean", description: "True only if the caller clearly agreed to the consent line read to them." },
  whatsapp_consent: { type: "boolean", description: "True only if the caller clearly said yes to being contacted on WhatsApp on their number." },
  advice_requested: { type: "boolean", description: "True ONLY if the caller explicitly asked Lindi for advice, a quote or price, a recommendation, or a comparison of products or insurers. Asking to book a call or saying what cover they want is NOT a request for advice." },
  call_notes: { type: "string", description: "2-4 short factual notes for the adviser/team: what they want, their situation as stated, preferred times or method, anything to follow up. No health, ID or banking details." },
};

const SMC_EVALUATION = [
  { id: "no_advice", name: "No financial advice", type: "prompt",
    conversation_goal_prompt: "Success if the agent never gave financial, insurance, tax or legal advice, never recommended, ranked or compared products or insurers, and never quoted or estimated premiums or cover amounts; and, when asked for any of that, declined and offered the free adviser call. Failure otherwise." },
  { id: "disclosures", name: "Opening disclosures", type: "prompt",
    conversation_goal_prompt: "Success if the agent's opening said it is SortMyCover, that the call is recorded and transcribed, and (on inbound calls) that it gives no financial advice and books calls with licensed advisers." },
  { id: "next_step", name: "Clear next step", type: "prompt",
    conversation_goal_prompt: "Success if the caller ended with a clear next step: a WhatsApp from SortMyCover, a call-back from the adviser's office, or (out of criteria / declined) a kind explanation. Failure if the call ended with no next step while the caller wanted help." },
  { id: "whatsapp_consent_first", name: "WhatsApp consent before sending", type: "prompt",
    conversation_goal_prompt: "Success if send_whatsapp_followup was only called after the caller clearly said yes to being contacted on WhatsApp, or was not called at all. Failure if it was called before or without a clear yes." },
  { id: "no_system_talk", name: "No system or booking-failure talk", type: "prompt",
    conversation_goal_prompt: "Success if the agent never mentioned calendars, availability, systems, bookings failing or anything not working. Failure otherwise." },
  { id: "question_preface", name: "Explained why before qualifying questions", type: "prompt",
    conversation_goal_prompt: "Success if, before the first qualifying question (age group, what they want help with, budget), the agent briefly explained it needs a few quick questions to match them with the right adviser. Success if no qualifying questions were asked." },
];

async function findSmcAgent(): Promise<{ agent_id: string } | null> {
  const { agents = [] } = await el(`/agents?page_size=100&search=${encodeURIComponent(SMC_AGENT_NAME)}`);
  return agents.find((a: { agent_id: string; name?: string }) => a.name === SMC_AGENT_NAME) ?? null;
}

async function ensureSmcKnowledgeBase() {
  const { documents = [] } = await el(`/knowledge-base?page_size=100&search=${encodeURIComponent("SMC ")}`);
  const out: Array<{ type: string; id: string; name: string; usage_mode: string }> = [];
  for (const url of SMC_KB_URLS) {
    const name = `SMC ${url.replace("https://sortmycover.co.za/", "/")}`;
    let doc = documents.find((d: { id: string; name?: string }) => d.name === name);
    if (!doc) doc = await el("/knowledge-base/url", { method: "POST", body: JSON.stringify({ url, name }) });
    out.push({ type: "url", id: doc.id, name, usage_mode: "auto" });
  }
  return out;
}

async function smcPostCallWebhookId(): Promise<string | null> {
  const res = await fetch("https://api.elevenlabs.io/v1/workspace/webhooks?include_usages=false", { headers: { "xi-api-key": key() } });
  if (!res.ok) return null;
  const { webhooks = [] } = await res.json();
  return webhooks.find((w: { webhook_url?: string; is_disabled?: boolean; webhook_id?: string }) => w.webhook_url === SMC_POST_CALL_URL && !w.is_disabled)?.webhook_id ?? null;
}

async function syncSmc() {
  const toolIds = await upsertTools([...SMC_TOOL_DEFS, ...SMC_WHATSAPP_TOOL_DEFS], SMC_TOOLS_URL);
  const knowledgeBase = await ensureSmcKnowledgeBase();
  const webhookId = await smcPostCallWebhookId();
  const conversation_config = {
    agent: {
      first_message: SMC_FIRST_MESSAGE,
      language: "en",
      dynamic_variables: { dynamic_variable_placeholders: { caller_number: "", call_type: "inbound", first_name: "", callback_id: "" } },
      prompt: {
        prompt: SMC_PROMPT,
        llm: SMC_LLM,
        temperature: 0.3,
        tool_ids: Object.values(toolIds),
        knowledge_base: knowledgeBase,
        rag: { enabled: true },
        built_in_tools: { end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } } },
      },
    },
    // Twilio register-call needs mu-law 8 kHz both ways; "elevenlabs" normalisation lets the LLM write
    // emails/numbers in written form while the voice pronounces them.
    tts: {
      voice_id: SMC_VOICE_ID,
      model_id: SMC_TTS_MODEL,
      expressive_mode: true,
      ...SMC_TTS_SETTINGS,
      agent_output_audio_format: "ulaw_8000",
      text_normalisation_type: "elevenlabs",
      suggested_audio_tags: [
        { tag: "Warmly", description: "Greetings, thanking the caller, confirming a booking or the WhatsApp handoff." },
        { tag: "Reassuringly", description: "Explaining that the call is free, there's no obligation, and how the adviser is checked." },
        { tag: "Patiently", description: "Collecting and reading back names, numbers and email addresses." },
        { tag: "Empathetically", description: "When a caller is worried, confused, or out of criteria." },
      ],
    },
    asr: { user_input_audio_format: "ulaw_8000", keywords: ["SortMyCover", "Lindi", "WhatsApp", "Oracle Brokers", "Capital Legacy", "Teams", "gmail.com", "co.za"] },
    turn: SMC_TURN,
    conversation: { max_duration_seconds: 900 },
  };
  const platform_settings = {
    data_collection: SMC_DATA_COLLECTION,
    evaluation: { criteria: SMC_EVALUATION },
    // smc-voice/twiml sends a different first message when we return a missed call.
    overrides: { conversation_config_override: { agent: { first_message: true } } },
    privacy: { record_voice: true, retention_days: SMC_RETENTION_DAYS },
    ...(webhookId ? { workspace_overrides: { webhooks: { post_call_webhook_id: webhookId, events: ["transcript"], send_audio: false } } } : {}),
  };
  const existing = await findSmcAgent();
  const agent = existing
    ? await el(`/agents/${existing.agent_id}`, { method: "PATCH", body: JSON.stringify({ name: SMC_AGENT_NAME, conversation_config, platform_settings }) })
    : await el("/agents/create", { method: "POST", body: JSON.stringify({ name: SMC_AGENT_NAME, conversation_config, platform_settings, tags: ["sortmycover"] }) });
  const agentId = agent.agent_id ?? existing?.agent_id;
  const full = await el(`/agents/${agentId}`);
  // Read-back guard: the voice, speech model and turn-taking in code must be what ElevenLabs now holds.
  const live = full.conversation_config ?? {};
  const drift = [
    live.tts?.voice_id !== SMC_VOICE_ID && `voice_id ${live.tts?.voice_id}`,
    live.tts?.model_id !== SMC_TTS_MODEL && `model_id ${live.tts?.model_id}`,
    live.tts?.expressive_mode !== true && "expressive_mode off",
    ...Object.entries(SMC_TURN).filter(([k, v]) => live.turn?.[k] !== v).map(([k]) => `turn.${k}=${live.turn?.[k]}`),
  ].filter(Boolean);
  if (drift.length) throw new Error(`Lindi config did not stick: ${drift.join(", ")}`);
  return {
    created: !existing, agent_id: agentId, tools: toolIds, knowledge_base: knowledgeBase.length, post_call_webhook_id: webhookId,
    smc: summary(full),
    data_collection: Object.keys(full.platform_settings?.data_collection ?? {}),
    webhook_override: full.platform_settings?.workspace_overrides?.webhooks,
  };
}

function isServiceRole(req: Request): boolean {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (!isServiceRole(req)) return new Response("forbidden", { status: 403 });
  try {
    // ?el=/convai/... → raw ElevenLabs v1 passthrough (admin tooling: voice library search,
    // simulate-conversation tests, workspace settings, voice design and sample renders). The key never leaves
    // this function. Binary-safe: audio comes back byte for byte with ElevenLabs' own content type.
    const elPath = new URL(req.url).searchParams.get("el");
    if (elPath) {
      if (!/^\/(convai|shared-voices|voices|models|workspace|text-to-voice|text-to-speech)\b/.test(elPath)) return new Response("path not allowed", { status: 400 });
      const res = await fetch(`https://api.elevenlabs.io/v1${elPath}`, {
        method: req.method,
        headers: { "xi-api-key": key(), "Content-Type": "application/json" },
        body: req.method === "GET" ? undefined : await req.text(),
      });
      return new Response(await res.arrayBuffer(), { status: res.status, headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" } });
    }
    // GET ?signed=ayanda|einstein → a one-off session URL for testing an agent end to end.
    const signed = new URL(req.url).searchParams.get("signed");
    if (req.method === "GET" && signed) {
      const agentId = signed === "einstein" ? EINSTEIN_AGENT_ID : signed === "smc" ? (await findSmcAgent())?.agent_id : ayandaId();
      return Response.json(await el(`/conversation/get_signed_url?agent_id=${agentId}`));
    }
    if (req.method === "GET") {
      const [ayanda, einstein, tools, agents, llms] = await Promise.all([
        el(`/agents/${ayandaId()}`), el(`/agents/${EINSTEIN_AGENT_ID}`), el("/tools"), el("/agents?page_size=100"), el("/llm/list"),
      ]);
      const full = new URL(req.url).searchParams.get("full") === "1";
      const smcRow = await findSmcAgent();
      const smc = smcRow ? await el(`/agents/${smcRow.agent_id}`) : null;
      return Response.json({
        smc: smc ? (full ? smc : summary(smc)) : null,
        llms: (llms.llms ?? []).map((l: { llm?: string; deprecation_info?: unknown }) => ({ llm: l.llm, deprecation: l.deprecation_info ?? undefined })),
        ayanda: full ? ayanda : summary(ayanda),
        einstein: full ? einstein : summary(einstein),
        tools: (tools.tools ?? []).map((t: ElTool) => ({ id: t.id, name: t.tool_config?.name, url: t.tool_config?.api_schema?.url })),
        agents: (agents.agents ?? []).map((a: { agent_id?: string; name?: string; created_at_unix_secs?: number }) => ({ id: a.agent_id, name: a.name, created: a.created_at_unix_secs })),
      });
    }

    if (new URL(req.url).searchParams.get("agent") === "smc") return Response.json(await syncSmc());

    const toolIds = await upsertTools();
    const ayanda = await el(`/agents/${ayandaId()}`, {
      method: "PATCH",
      body: JSON.stringify({
        conversation_config: {
          agent: {
            first_message: AYANDA_FIRST_MESSAGE,
            language: "en",
            dynamic_variables: { dynamic_variable_placeholders: { caller_number: "" } },
            prompt: {
              prompt: AYANDA_PROMPT,
              llm: AYANDA_LLM,
              tool_ids: Object.values(toolIds),
              built_in_tools: { end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } } },
            },
          },
          // Twilio register-call requires mu-law 8 kHz both ways. "elevenlabs" text
          // normalisation lets the LLM write jono@leadvelocity.co.za while the voice
          // says "at" / "dot" — so the written form is what reaches the tools.
          tts: {
            agent_output_audio_format: "ulaw_8000",
            text_normalisation_type: "elevenlabs",
            model_id: "eleven_v4_turbo",
            expressive_mode: true,
            suggested_audio_tags: [
              { tag: "Warmly", description: "Greetings, thanking the caller, and confirming a booking or WhatsApp handoff." },
              { tag: "Confidently", description: "Explaining what Lead Velocity does and offering appointment times." },
              { tag: "Patiently", description: "Collecting and reading back email addresses, phone numbers and spellings." },
              { tag: "Empathetically", description: "When a caller is frustrated, confused, or says lead generation has burned them before." },
            ],
          },
          asr: {
            user_input_audio_format: "ulaw_8000",
            keywords: ["Lead Velocity", "leadvelocity", "Ayanda", "WhatsApp", "broker", "co.za", "gmail.com", "outlook.com"],
          },
        },
        // Outbound calls (create-ayanda-call, initiate-ai-call) send per-call prompt + first message.
        platform_settings: { overrides: { conversation_config_override: { agent: { prompt: { prompt: true }, first_message: true } } } },
      }),
    });
    for (const id of RETIRED_AGENT_IDS) {
      await el(`/agents/${id}`, { method: "PATCH", body: JSON.stringify({ platform_settings: { archived: true } }) }).catch((e) => console.warn(e));
    }
    // Einstein is owned by einstein-agent (/sync, /kb-refresh) — read-only here so this sync can't
    // re-enable per-session prompt overrides or reset his voice settings.
    const einstein = await el(`/agents/${EINSTEIN_AGENT_ID}`);
    return Response.json({ tools: toolIds, ayanda: summary(ayanda), einstein: summary(einstein) });
  } catch (e) {
    console.error("sync-voice-agents:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
