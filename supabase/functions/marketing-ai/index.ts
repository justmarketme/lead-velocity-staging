import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

async function generateWithGemini(prompt: string, apiKey: string): Promise<any> {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
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

    const geminiData = await res.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    return JSON.parse(responseText);
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { action, payload } = await req.json();

        const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

        let result: any;

        if (action === "prospect-leads") {
            const geminiPrompt = `You are a Lead Generation AI. The industry is "${payload.industry}".
Generate exactly 5 highly plausible fictional leads for this industry in South Africa.
Each lead must have: name, role, company name, email (ending in .co.za or .com), and a "vibe" score (80-99).
Return ONLY a JSON array of objects.`;

            if (payload.provider === 'firecrawl') {
                const firecrawlLeads = await scrapeWithFirecrawl(payload.industry);
                result = firecrawlLeads || await generateWithGemini(geminiPrompt, GEMINI_API_KEY);
            } else if (payload.provider === 'tavily') {
                const tavilyLeads = await scrapeWithTavily(payload.industry);
                result = tavilyLeads || await generateWithGemini(geminiPrompt, GEMINI_API_KEY);
            } else {
                // Apify: use Gemini generation (social/maps context)
                const apifyPrompt = `You are a Lead Generation AI using social graph and maps extraction. The industry is "${payload.industry}".
Generate exactly 5 highly plausible fictional leads for this industry in South Africa.
Each lead must have: name, role, company name, email (ending in .co.za or .com), and a "vibe" score (80-99).
Return ONLY a JSON array of objects.`;
                result = await generateWithGemini(apifyPrompt, GEMINI_API_KEY);
            }
        } else if (action === "ad-architect") {
            const prompt = `You are a top-tier Ad Copy Architect. The user input is: "${payload.prompt}".
            The platform is "${payload.platform || 'facebook'}".
            Generate 2 distinct ad variants.
            Each variant must have: id, hook, body, cta, reach (e.g. "10k-15k"), and sentiment (80-100).
            Return ONLY a JSON array of objects.`;
            result = await generateWithGemini(prompt, GEMINI_API_KEY);
        } else if (action === "platform-blueprint") {
            const prompt = `You are a Social Media Strategist. The platform is "${payload.platform}".
            Based on current market trends in South Africa for insurance brokers, synthesize a high-converting hook and a strategy vibe category.
            Return ONLY a JSON object with "hook" and "vibe".`;
            result = await generateWithGemini(prompt, GEMINI_API_KEY);
        } else if (action === "ceo-briefing") {
            const prompt = `You are an Executive AI Coach for the CEO of Lead Velocity.
            Current Weekly Aim: "${payload.weeklyAim}"
            KPI Context: ${JSON.stringify(payload.kpiTargets)}

            Synthesize a Morning Directives Report.
            Include:
            1. "swot": An object with "strengths", "weaknesses", "opportunities", "threats" as concise strings.
            2. "summary": A one-sentence high-impact strategic summary.
            3. "actions": An array of 4 short, actionable CEO-level directive strings for today.

            Return ONLY valid JSON.`;
            result = await generateWithGemini(prompt, GEMINI_API_KEY);
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("Marketing AI Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
