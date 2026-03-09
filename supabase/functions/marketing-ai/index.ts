import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { action, payload } = await req.json();
        const authHeader = req.headers.get('Authorization')!;

        // CALL GEMINI
        const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

        let prompt = "";
        if (action === "prospect-leads") {
            const providerContext = payload.provider === 'firecrawl' ? 'deep web crawling and stealth scraping' : 'social graph and maps extraction';
            prompt = `You are a high-performance Lead Generation AI using ${payload.provider} for ${providerContext}. 
            The industry is "${payload.industry}". 
            Generate exactly 5 highly plausible fictional leads for this industry in South Africa.
            Each lead must have: name, role, company name, email (ending in .co.za or .com), and a "vibe" score (80-99).
            Return ONLY a JSON array of objects.`;
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

        const geminiData = await res.json();
        const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        const result = JSON.parse(responseText);

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
