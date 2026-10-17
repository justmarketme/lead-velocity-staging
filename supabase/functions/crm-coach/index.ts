import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Admin-only CRM coach. Deliberately SEPARATE from `einstein-ai`, which is
// hard-scoped to the broker portal — this one is the internal sales strategist
// for Lead Velocity's own team working their broker pipeline.

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

const SYSTEM = `You are the internal deal strategist for Lead Velocity, a South African B2B lead-generation company that sells raw commercial leads to insurance brokers and financial advisers.

You think like Alex Hormozi and Russell Brunson:
- Hormozi: make the next offer so good it's illogical to refuse. Increase perceived value, reduce risk and effort, create urgency honestly. Focus on the one constraint blocking the deal.
- Brunson: meet them where they are in the value ladder. Hook, story, offer. Move them one concrete step, never ten.

You are coaching the Lead Velocity team on ONE broker relationship. Be specific and commercial, never generic. Reference the actual data you're given (their stage, what was said on calls, what they've bought, what's overdue). South African context: rands, POPIA, local insurance market.

Return STRICT JSON only, no markdown fences, in this exact shape:
{
  "headline": "one short sentence naming the single biggest constraint right now",
  "suggestions": [
    {"action": "short imperative next step", "why": "one sentence on why this moves the deal"},
    {"action": "...", "why": "..."},
    {"action": "...", "why": "..."}
  ],
  "script": "a short ready-to-send WhatsApp/email message (3-5 sentences) the team can copy, written to this specific broker"
}
Give exactly 3 suggestions, ordered by impact. Keep every field tight — no filler.`;

function buildUserPrompt(c: any) {
  const acts = (c.activities || []).slice(0, 8)
    .map((a: any) => `- ${a.activity_type}${a.outcome ? ` (${a.outcome})` : ""}: ${a.body || "no note"}`).join("\n") || "- none logged yet";
  const fus = (c.followups || []).slice(0, 5)
    .map((f: any) => `- ${f.title} due ${f.due_at}${f.overdue ? " [OVERDUE]" : ""}`).join("\n") || "- none scheduled";
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

async function callLLM(system: string, user: string, orKey?: string | null, gemKey?: string | null) {
  if (orKey) {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${orKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.7,
      }),
    });
    if (r.ok) {
      const j = await r.json();
      const t = j?.choices?.[0]?.message?.content;
      if (t) return { text: t, provider: "openrouter" };
    }
  }
  if (gemKey) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${gemKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.7 },
      }),
    });
    if (r.ok) {
      const j = await r.json();
      const t = j?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (t) return { text: t, provider: "gemini" };
    }
  }
  throw new Error("No working LLM provider (check OPENROUTER/GEMINI keys)");
}

serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: h });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...h, "Content-Type": "application/json" } });

    const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...h, "Content-Type": "application/json" } });

    const { data: role } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").single();
    if (!role) return new Response(JSON.stringify({ error: "Forbidden - admin only" }), { status: 403, headers: { ...h, "Content-Type": "application/json" } });

    const { context } = await req.json();
    if (!context) return new Response(JSON.stringify({ error: "Missing context" }), { status: 400, headers: { ...h, "Content-Type": "application/json" } });

    const orKey = req.headers.get("x-openrouter-key") || Deno.env.get("OPENROUTER_API_KEY");
    const gemKey = req.headers.get("x-gemini-key") || Deno.env.get("GEMINI_API_KEY");

    const { text, provider } = await callLLM(SYSTEM, buildUserPrompt(context), orKey, gemKey);

    let parsed: any = null;
    try {
      parsed = JSON.parse(String(text).replace(/```json|```/g, "").trim());
    } catch {
      parsed = { headline: "Coach returned free text", suggestions: [], script: String(text).slice(0, 1200) };
    }

    return new Response(JSON.stringify({ success: true, provider, ...parsed }), { status: 200, headers: { ...h, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("crm-coach error:", e);
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { ...h, "Content-Type": "application/json" } });
  }
});
