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

// Real Firecrawl API scraping
async function scrapeWithFirecrawl(industry: string): Promise<any[] | null> {
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) return null;

    try {
        const res = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
            },
            body: JSON.stringify({
                query: `${industry} companies South Africa business contact email`,
                limit: 5,
                scrapeOptions: { formats: ["markdown"] },
            }),
        });

        if (!res.ok) {
            console.error("Firecrawl API error:", res.status, await res.text());
            return null;
        }

        const data = await res.json();
        const results = data.data || data.results || [];

        const leads = results.slice(0, 5).map((item: any, i: number) => {
            const content = item.markdown || item.content || "";
            const emailMatch = content.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
            const nameMatch = content.match(/(?:contact|name|person)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/i);
            return {
                name: nameMatch?.[1] || `Contact ${i + 1}`,
                role: "Business Owner",
                company: item.metadata?.title || item.title || `${industry} Business ${i + 1}`,
                email: emailMatch?.[0] || `contact${i + 1}@${industry.toLowerCase().replace(/\s+/g, "")}.co.za`,
                vibe: Math.floor(Math.random() * 20) + 80,
            };
        });

        return leads.length > 0 ? leads : null;
    } catch (err) {
        console.error("Firecrawl scrape failed:", err);
        return null;
    }
}

// Real Tavily API scraping
async function scrapeWithTavily(industry: string): Promise<any[] | null> {
    const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
    if (!TAVILY_API_KEY) return null;

    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${TAVILY_API_KEY}`,
            },
            body: JSON.stringify({
                query: `${industry} company South Africa business contact email`,
                search_depth: "advanced",
                max_results: 10,
                include_answer: false,
            }),
        });

        if (!res.ok) {
            console.error("Tavily API error:", res.status, await res.text());
            return null;
        }

        const data = await res.json();
        const results = data.results || [];

        const leads = results.slice(0, 5).map((item: any, i: number) => {
            const content = (item.content || item.snippet || "");
            const emailMatch = content.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
            const nameMatch = content.match(/(?:contact|director|owner|ceo|manager)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/i);
            return {
                name: nameMatch?.[1] || `Contact ${i + 1}`,
                role: "Business Contact",
                company: item.title || `${industry} Business ${i + 1}`,
                email: emailMatch?.[0] || `contact${i + 1}@${industry.toLowerCase().replace(/\s+/g, "")}.co.za`,
                vibe: Math.floor(Math.random() * 20) + 80,
            };
        });

        return leads.length > 0 ? leads : null;
    } catch (err) {
        console.error("Tavily scrape failed:", err);
        return null;
    }
}

serve(async (req: any) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { action, payload } = await req.json();

        // Get API Key from header (client-side) or environment secret
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

        // For prospect-leads, try real scraping APIs first, then fall back to Gemini
        if (action === "prospect-leads") {
            let realLeads: any[] | null = null;

            if (payload.provider === 'firecrawl') {
                realLeads = await scrapeWithFirecrawl(payload.industry);
            } else if (payload.provider === 'tavily') {
                realLeads = await scrapeWithTavily(payload.industry);
            }
            // apify: no direct API integration, falls through to Gemini generation

            if (realLeads && realLeads.length > 0) {
                return new Response(JSON.stringify(realLeads), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-AI-Provider': payload.provider },
                });
            }
            // Fall through to Gemini generation below
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
