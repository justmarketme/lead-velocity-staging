// crm-coach: "Einstein — next move" in the admin broker drawer (mode "broker") and the lead pipeline (mode "lead_pipeline").
// Synced from the deployed v2 source (which added lead_pipeline) on 2026-10-12, then:
// - Gemini model updated: gemini-2.0-flash is retired; try gemini-2.5-flash, then gemini-flash-latest.
// - OpenRouter model updated to google/gemini-2.5-flash (used only when OPENROUTER_API_KEY / x-openrouter-key is set).
// - Provider failures are logged with their HTTP status and body, and the function answers 200 {success:false, unavailable:true}
//   so the CRM shows a calm message instead of "Edge Function returned a non-2xx status code".
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://www.leadvelocity.co.za",
  "https://leadvelocity.co.za",
  "http://localhost:5173",
  "http://localhost:8080",
];
function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-gemini-key, x-openrouter-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const BASE = `You are the internal deal strategist for Lead Velocity, a South African B2B lead-generation company that sells raw commercial leads to insurance brokers and financial advisers.

You think like Alex Hormozi and Russell Brunson:
- Hormozi: make the next offer so good it's illogical to refuse. Increase perceived value, reduce risk and effort, create urgency honestly. Focus on the one constraint.
- Brunson: meet them where they are in the value ladder. Hook, story, offer. Move them one concrete step, never ten.

Be specific and commercial, never generic. Reference the actual data given. South African context: rands, POPIA, local insurance market.

Return STRICT JSON only, no markdown fences:
{
  "headline": "one short sentence naming the single biggest constraint right now",
  "suggestions": [
    {"action": "short imperative next step", "why": "one sentence on why this moves the needle"},
    {"action": "...", "why": "..."},
    {"action": "...", "why": "..."}
  ],
  "script": "a short ready-to-send message (3-5 sentences) the team can copy"
}
Exactly 3 suggestions, ordered by impact. Tight — no filler.`;

const BROKER_SYSTEM = BASE + `\n\nYou are coaching the team on ONE broker relationship.`;
const PIPELINE_SYSTEM = BASE + `\n\nYou are coaching the team on their WHOLE lead-sourcing pipeline — the client-facing leads they deliver to brokers. Focus on where leads are stalling, which stage is the bottleneck, and what to do today to convert more. The "script" should be a short outreach/follow-up message template the team can reuse on stalled leads.`;

// deno-lint-ignore no-explicit-any
function brokerPrompt(c: any) {
  // deno-lint-ignore no-explicit-any
  const acts = (c.activities || []).slice(0, 8)
    .map((a: any) => `- ${a.activity_type}${a.outcome ? ` (${a.outcome})` : ""}: ${a.body || "no note"}`).join("\n") || "- none logged yet";
  // deno-lint-ignore no-explicit-any
  const fus = (c.followups || []).slice(0, 5)
    .map((f: any) => `- ${f.title} due ${f.due_at}${f.overdue ? " [OVERDUE]" : ""}`).join("\n") || "- none scheduled";
  // deno-lint-ignore no-explicit-any
  const orders = (c.orders || [])
    .map((o: any) => `- ${o.title || "order"}: ${o.lead_count ?? 0} leads, R${((o.amount_zar ?? 0) / 100).toFixed(2)}, status ${o.status}`).join("\n") || "- no orders yet";

  return `BROKER SNAPSHOT
Firm: ${c.firm_name || "unknown"}
Contact: ${c.contact_person || "unknown"}
Pipeline stage: ${c.mgmt_stage || "New"}
Tier: ${c.tier || "n/a"}
Next follow-up: ${c.next_follow_up_at || "none set"}

ORDERS / WHAT THEY'VE BOUGHT
${orders}

RECENT ACTIVITY (newest first)
${acts}

OPEN FOLLOW-UPS
${fus}

Coach the team on the single best way to move this broker forward right now.`;
}

// deno-lint-ignore no-explicit-any
function pipelinePrompt(c: any) {
  // deno-lint-ignore no-explicit-any
  const stages = (c.stage_counts || [])
    .map((s: any) => `- ${s.stage}: ${s.count}`).join("\n") || "- no stage data";
  return `LEAD PIPELINE SNAPSHOT
Total leads in view: ${c.total_leads ?? 0}

LEADS BY STAGE
${stages}

Where is this pipeline leaking, and what should the team do today to move more leads to won?`;
}

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];
const OPENROUTER_MODEL = "google/gemini-2.5-flash";

async function callLLM(system: string, user: string, orKey?: string | null, gemKey?: string | null) {
  const failures: string[] = [];
  if (orKey) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${orKey}` },
        body: JSON.stringify({ model: OPENROUTER_MODEL, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.7 }),
      });
      if (r.ok) {
        const j = await r.json();
        const t = j?.choices?.[0]?.message?.content;
        if (t) return { text: t, provider: "openrouter" };
        failures.push("openrouter: empty reply");
      } else failures.push(`openrouter ${r.status}: ${(await r.text()).slice(0, 200)}`);
    } catch (e) { failures.push(`openrouter: ${(e as Error).message}`); }
  }
  if (gemKey) {
    for (const model of GEMINI_MODELS) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": gemKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
          }),
        });
        if (r.ok) {
          const j = await r.json();
          // deno-lint-ignore no-explicit-any
          const t = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || "").join("");
          if (t) return { text: t, provider: `gemini:${model}` };
          failures.push(`${model}: empty reply (${j?.candidates?.[0]?.finishReason || "no candidates"})`);
        } else failures.push(`${model} ${r.status}: ${(await r.text()).slice(0, 200)}`);
      } catch (e) { failures.push(`${model}: ${(e as Error).message}`); }
    }
  }
  if (!orKey && !gemKey) failures.push("no OPENROUTER_API_KEY or GEMINI_API_KEY secret");
  const err = new Error("No working LLM provider");
  (err as Error & { failures?: string[] }).failures = failures;
  throw err;
}

serve(async (req) => {
  const h = cors(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: h });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: role } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").single();
    if (!role) return json({ error: "Forbidden - admin only" }, 403);

    const body = await req.json();
    const context = body?.context;
    const mode = body?.mode || context?.mode || "broker";
    if (!context) return json({ error: "Missing context" }, 400);

    const orKey = req.headers.get("x-openrouter-key") || Deno.env.get("OPENROUTER_API_KEY");
    const gemKey = req.headers.get("x-gemini-key") || Deno.env.get("GEMINI_API_KEY");

    const system = mode === "lead_pipeline" ? PIPELINE_SYSTEM : BROKER_SYSTEM;
    const prompt = mode === "lead_pipeline" ? pipelinePrompt(context) : brokerPrompt(context);

    let result: { text: string; provider: string };
    try {
      result = await callLLM(system, prompt, orKey, gemKey);
    } catch (e) {
      // The model being down is not the admin's problem to debug: log the detail, answer calmly.
      console.error("crm-coach: no provider answered", (e as Error & { failures?: string[] }).failures || (e as Error).message);
      return json({ success: false, unavailable: true, error: "Einstein is unavailable right now. Try again in a minute." });
    }

    // deno-lint-ignore no-explicit-any
    let parsed: any = null;
    try {
      parsed = JSON.parse(String(result.text).replace(/```json|```/g, "").trim());
    } catch {
      parsed = { headline: "Coach returned free text", suggestions: [], script: String(result.text).slice(0, 1200) };
    }

    return json({ success: true, provider: result.provider, mode, ...parsed });
  } catch (e) {
    console.error("crm-coach error:", e);
    return json({ success: false, error: "Einstein hit a problem. Try again in a minute." });
  }
});
