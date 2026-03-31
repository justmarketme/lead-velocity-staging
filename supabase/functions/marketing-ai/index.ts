import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-gemini-key, X-Gemini-Key',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

const SA_INSURANCE_SEED = `
- Aon South Africa (Sandton)
- Marsh SA (Johannesburg)
- PSG Wealth & Insure (Centurion)
- Hollard Insurance (Parktown)
- Sanlam Brokerage (Bellville)
- Old Mutual Insure (Mutualpark)
- Discovery Insure (Sandton)
- Alexander Forbes (Sandton)
- Willis Towers Watson (Bryanston)
- Indigenous firms: King Price, Outsurance, MiWay
`;

serve(async (req: any) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { action, payload } = await req.json();
        
        // 1. Get API Key from various sources
        const headerKey = req.headers.get('x-gemini-key');
        const envKey = Deno.env.get("GEMINI_API_KEY");
        const GEMINI_API_KEY = (headerKey && headerKey !== 'undefined') ? headerKey : envKey;

        if (!GEMINI_API_KEY) {
            console.error("No API Key found in headers or environment secrets.");
            return new Response(JSON.stringify({ error: "Neural Link Offline: API key is missing. Please contact system administrator." }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        let prompt = "";
        if (action === "prospect-leads") {
            const providerContext = payload.provider === 'firecrawl' ? 'deep web crawling and stealth scraping' : 'social graph and maps extraction';
            prompt = `You are a high-performance Lead Generation AI using ${payload.provider} for ${providerContext}. 
            The industry is "${payload.industry}". 
            
            REFERENCE SEED DATA FOR REALITY CHECK (South Africa):
            ${SA_INSURANCE_SEED}

            Generate exactly 5 HIGH-FIDELITY, REAL-LIFE leads for this industry in South Africa. 
            Do NOT use obvious generic names. Use realistic South African professional names (mixed ethnicities: Afrikaans, English, Zulu, Xhosa, etc.).
            Each lead must have: name, role (e.g. Principal Broker, Risk Specialist, Agency Owner), company name (must be a real entity or highly realistic derivative from the seed data), email (must be a realistic professional format), and a "vibe" score (80-99).
            Return ONLY a JSON array of objects.`;
        } else if (action === "sales-briefing") {
            prompt = `You are Einstein, the Aggressive High-Performance Sales Architect. 
            Analyze the following batch of leads for the "${payload.industry}" industry:
            ${JSON.stringify(payload.leads)}

            Synthesize a 'Strategic Sales Directive' for the Consultant.
            Include:
            1. "briefing": A high-energy, German-accented directive (raspy professor style) about the opportunity. Explicitly mention that **Ayanda** should be used to dial these prospects immediately.
            2. "intent": The estimated aggregate 'warmth' score of this batch (0-100).
            3. "strategy": A one-sentence technical strategy for the first 30 seconds of the call.
            
            Return ONLY valid JSON.`;
        } else if (action === "ad-architect") {
            prompt = `You are a top-tier Ad Copy Architect. The user input is: "${payload.prompt}".
            The platform is "${payload.platform || 'facebook'}".
            Generate 2 distinct ad variants.
            Each variant must have: id, hook, body, cta, reach (e.g. "10k-15k"), and sentiment (80-100).
            Return ONLY a JSON array of objects.`;
        } else if (action === "platform-blueprint") {
            prompt = `You are a Social Media Strategist. The platform is "${payload.platform}".
            Based on current market trends in South Africa for insurance brokers, synthesize a high-converting hook and a strategy vibe category.
            Return ONLY a JSON object with "hook" and "vibe".`;
        } else if (action === "ceo-briefing") {
            prompt = `You are an Executive AI Coach for the CEO of Lead Velocity.
            Current Weekly Aim: "${payload.weeklyAim}"
            KPI Context: ${JSON.stringify(payload.kpiTargets)}
            
            Synthesize a Morning Directives Report.
            Include:
            1. "swot": An object with "strengths", "weaknesses", "opportunities", "threats" as concise strings.
            2. "summary": A one-sentence high-impact strategic summary.
            3. "actions": An array of 4 short, actionable CEO-level directive strings for today.
            
            Return ONLY valid JSON.`;
        }

        let responseText = "[]";
        let usedProvider = "gemini";

        try {
            // Attempt Gemini Call
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        response_mime_type: "application/json"
                    }
                })
            });

            if (!res.ok) throw new Error(`Gemini API failed with status ${res.status}`);
            
            const geminiData = await res.json();
            responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        } catch (geminiError: any) {
            console.warn("Gemini primary call failed, attempting OpenRouter fallback:", geminiError.message);
            usedProvider = "openrouter";
            
            // OpenRouter Fallback (using the same key, as many Gemini keys work there)
            const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${GEMINI_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://leadvelocity.co.za",
                    "X-Title": "Lead Velocity Einstein"
                },
                body: JSON.stringify({
                    model: "google/gemini-flash-1.5",
                    messages: [{ role: "user", content: prompt }]
                })
            });

            if (orRes.ok) {
                const orData = await orRes.json();
                responseText = orData.choices?.[0]?.message?.content || "[]";
            } else {
                throw new Error("Both Gemini and OpenRouter fallback failed. Please check your API key.");
            }
        }

        const result = JSON.parse(responseText.replace(/```json\n?/g, "").replace(/```/g, ""));

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-AI-Provider': usedProvider },
        });

    } catch (error: any) {
        console.error("Marketing AI Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
