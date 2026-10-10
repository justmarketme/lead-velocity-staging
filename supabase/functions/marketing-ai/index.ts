import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-gemini-key, X-Gemini-Key, x-tavily-key, x-openrouter-key, x-exa-key',
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

// Use standard Deno.serve for modern Supabase functions
// Fallback to std/serve if the environment is older
const handler = async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        let body;
        try {
            body = await req.json();
        } catch (e) {
            console.error("Failed to parse request body:", e);
            throw new Error("Invalid request body. Expected JSON.");
        }

        const { action, payload } = body;
        if (!payload) throw new Error("Missing payload in request.");
        
        const keys = payload.keys || {};
        
        // 1. Get API Keys from various sources (Body/Payload, Headers, or Env)
        const headerKey = req.headers.get('x-gemini-key');
        const envKey = Deno.env.get("GEMINI_API_KEY");
        const GEMINI_API_KEY = keys.gemini || (headerKey && headerKey !== 'undefined' ? headerKey : envKey);

        const tavilyHeaderKey = req.headers.get('x-tavily-key');
        const tavilyEnvKey = Deno.env.get("TAVILY_API_KEY");
        const TAVILY_API_KEY = keys.tavily || (tavilyHeaderKey && tavilyHeaderKey !== 'undefined' ? tavilyHeaderKey : tavilyEnvKey);

        const exaHeaderKey = req.headers.get('x-exa-key');
        const exaEnvKey = Deno.env.get("EXA_API_KEY");
        const EXA_API_KEY = keys.exa || (exaHeaderKey && exaHeaderKey !== 'undefined' ? exaHeaderKey : exaEnvKey);

        const openRouterHeaderKey = req.headers.get('x-openrouter-key');
        const openRouterEnvKey = Deno.env.get("OPENROUTER_API_KEY");
        const OPENROUTER_API_KEY = keys.openrouter || (openRouterHeaderKey && openRouterHeaderKey !== 'undefined' ? openRouterHeaderKey : openRouterEnvKey);

        const ACTIVE_KEY = OPENROUTER_API_KEY || GEMINI_API_KEY;

        console.log(`[Marketing AI] Action: ${action || 'default'}. AI Key detectable: ${!!ACTIVE_KEY}`);

        // 2. Perform Real Research
        let researchData = "";
        let tavilyResults = [];
        let exaResults = [];

        // Tavily Step
        if (TAVILY_API_KEY && action === 'prospect-leads') {
            try {
                console.log("[Tavily] Executing deep research...");
                const searchQuery = `List of ${payload.industry} companies in ${payload.geos || 'South Africa'}. Focus: ${payload.intent || 'General lead generation'}`;
                const tavilyRes = await fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        api_key: TAVILY_API_KEY,
                        query: searchQuery,
                        search_depth: "advanced",
                        max_results: 5
                    })
                });
                if (tavilyRes.ok) {
                    const tavilyData = await tavilyRes.json();
                    tavilyResults = tavilyData.results || [];
                    console.log(`[Tavily] Found ${tavilyResults.length} results.`);
                }
            } catch (err: any) {
                console.warn("[Tavily] Research failed:", err.message);
            }
        }

        // Exa Step (The Context Layer)
        if (EXA_API_KEY && action === 'prospect-leads') {
            try {
                console.log("[Exa] Executing semantic context extraction...");
                const exaRes = await fetch("https://api.exa.ai/search", {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "x-api-key": EXA_API_KEY
                    },
                    body: JSON.stringify({
                        query: `High-intent ${payload.industry} business contacts and company details in ${payload.geos || 'South Africa'}`,
                        type: "auto",
                        numResults: 5,
                        contents: { text: true }
                    })
                });
                if (exaRes.ok) {
                    const exaData = await exaRes.json();
                    exaResults = exaData.results || [];
                    console.log(`[Exa] Found ${exaResults.length} semantic matches.`);
                }
            } catch (err: any) {
                console.warn("[Exa] Research failed:", err.message);
            }
        }

        // Synthesize Research
        researchData = JSON.stringify({
            primary_research: tavilyResults,
            semantic_context: exaResults
        });

        let prompt = "";
        if (action === "prospect-leads") {
            const providerContext = payload.provider === 'tavily' 
                ? 'advanced semantic web research and high-performance lead synthesis' 
                : payload.provider === 'firecrawl' 
                    ? 'deep web crawling and stealth scraping' 
                    : 'social graph and maps extraction';
            
            prompt = `You are a high-performance Lead Generation AI using ${payload.provider} for ${providerContext}. 
            The industry is "${payload.industry}". 
            Target Geographic Focus: "${payload.geos || 'South Africa'}".
            Strategic Intent: "${payload.intent || 'Find high-quality leads'}".
            
            ${researchData && (tavilyResults.length > 0 || exaResults.length > 0) ? `REAL-TIME RESEARCH DATA:\n${researchData}\n\nBased on this real-time data, please synthesize the best leads.` : `Einstein: Proceed with neural simulation as the primary data crawler is in stealth mode.`}
            
            REFERENCE SEED DATA FOR REALITY CHECK (South Africa):
            ${SA_INSURANCE_SEED}

            Generate exactly 5 HIGH-FIDELITY, REAL-LIFE leads for this industry in South Africa. 
            Do NOT use obvious generic names. Use realistic South African professional names.
            Each lead must have: name, role, company name, email, phone, address, source (one of: "LinkedIn", "Google Maps", "Instagram", "Twitter/X", "Facebook", "Company Website", "Industry Directory"), and a "vibe" score (80-99).
            Return ONLY a JSON array of objects.`;
        } else if (action === "sales-briefing") {
            prompt = `You are Einstein, the Aggressive High-Performance Sales Architect. 
            Analyze the following batch of leads for the "${payload.industry}" industry:
            ${JSON.stringify(payload.leads)}

            Synthesize a 'Strategic Sales Directive'. Return JSON with: briefing, intent, strategy.`;
        } else if (action === "ad-architect") {
            prompt = `You are a top-tier Ad Copy Architect for "${payload.prompt}". 
            Generate 2 variants. Return JSON array of objects.`;
        } else {
            // Default response if action not recognized
            return new Response(JSON.stringify({ 
                leads: [], 
                context: researchData ? JSON.parse(researchData) : null,
                message: "Action not implemented" 
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (!ACTIVE_KEY) {
            throw new Error("AI Synthesis Blocked: Missing valid Gemini or OpenRouter API key.");
        }

        let responseText = "[]";
        let usedProvider = "openrouter";

        try {
            // Priority: OpenRouter
            const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY || GEMINI_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://leadvelocity.co.za",
                    "X-Title": "Lead Velocity Einstein"
                },
                body: JSON.stringify({
                    model: "google/gemini-2.0-flash-001",
                    messages: [{ role: "user", content: prompt }],
                    response_format: { type: "json_object" }
                })
            });

            if (orRes.ok) {
                const orData = await orRes.json();
                responseText = orData.choices?.[0]?.message?.content || "[]";
            } else {
                console.warn("OpenRouter fallback triggered.");
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: "user", parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.7, response_mime_type: "application/json" }
                    })
                });
                if (!res.ok) throw new Error(`AI Gateway Error: ${res.status}`);
                const geminiData = await res.json();
                responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
                usedProvider = "gemini";
            }
        } catch (error: any) {
            throw new Error(`AI Synthesis Collapse: ${error.message}`);
        }

        let result;
        try {
            const cleanResponse = responseText.replace(/```json\n?/g, "").replace(/```/g, "").trim();
            result = JSON.parse(cleanResponse);
        } catch (parseError) {
            const jsonMatch = responseText.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
            result = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        }

        return new Response(JSON.stringify({
            leads: Array.isArray(result) ? result : (result.leads || []),
            context: researchData ? JSON.parse(researchData) : null,
            meta: { provider: usedProvider }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-AI-Provider': usedProvider },
        });

    } catch (error: any) {
        console.error("Marketing AI Failure:", error);
        return new Response(JSON.stringify({ 
            error: error.message,
            leads: [],
            context: null 
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
};

// Check if we are in a Deno environment that supports Deno.serve (v1.35+)
if (typeof Deno.serve === 'function') {
    Deno.serve(handler);
} else {
    // Fallback for older Deno versions often used in some Edge environments
    serve(handler);
}

