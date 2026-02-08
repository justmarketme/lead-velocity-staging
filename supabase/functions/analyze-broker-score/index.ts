import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { analysisId } = await req.json();

        if (!analysisId) {
            return new Response(JSON.stringify({ error: 'Missing analysisId' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 1. Fetch analysis and response data
        const { data: analysis, error: fetchError } = await supabase
            .from('broker_analysis')
            .select(`
        *,
        responses:broker_onboarding_responses(*)
      `)
            .eq('id', analysisId)
            .single();

        if (fetchError || !analysis) {
            throw new Error(`Failed to fetch analysis: ${fetchError?.message}`);
        }

        const { responses } = analysis;

        // 2. Prepare prompt for Gemini
        const prompt = `
Analyze this broker's onboarding data and deterministic scores. Generate plain-English explanations for the scores and risk flags.

DATA:
- CRM Usage: ${responses.crm_usage}
- Contact Speed: ${responses.speed_to_contact}
- Team Size: ${responses.team_size}
- Follow-up Process: ${responses.follow_up_process}
- Monthly Lead Spend: ${responses.monthly_lead_spend}
- CPL Awareness: ${responses.cpl_awareness}
- Pricing Comfort: ${responses.pricing_comfort}
- Vol vs Cap: Desired ${responses.desired_leads_weekly}, Max ${responses.max_capacity_weekly}
- Product Focus: ${responses.product_focus_clarity}
- Growth Goals: ${responses.growth_goal_clarity}
- Timeline: ${responses.timeline_to_start}

DETERMINISTIC RESULTS:
- Operational Score: ${analysis.operational_score}/100
- Budget Score: ${analysis.budget_score}/100
- Growth Score: ${analysis.growth_score}/100
- Success Probability: ${analysis.success_probability}% (${analysis.success_band})
- Risk Flags: ${analysis.risk_flags.join(', ')}
- Primary Sales Angle: ${analysis.primary_sales_angle}

INSTRUCTIONS:
Generate a concise analysis (approx 150-200 words) that:
1. Explains why the individual scores are what they are, referencing specific inputs.
2. Explains the overall success probability and its practical implications.
3. Explains each triggered risk flag with improvement suggestions.
4. Maintains a professional, consultative tone.

Do not invent data. Explain the deterministic results only.
`;

        // 3. Call Gemini API
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
        if (!geminiApiKey) {
            console.warn('GEMINI_API_KEY not found, using rule-based fallback');
            const fallback = generateFallbackExplanation(analysis, responses);
            await updateAnalysis(supabase, analysisId, fallback);
            return new Response(JSON.stringify({ success: true, ai_explanation: fallback, note: 'fallback used' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const result = await response.json();
        const explanation = result.candidates?.[0]?.content?.parts?.[0]?.text || generateFallbackExplanation(analysis, responses);

        // 4. Update the analysis record
        await updateAnalysis(supabase, analysisId, explanation);

        return new Response(JSON.stringify({ success: true, ai_explanation: explanation }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Error in analyze-broker-score:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

async function updateAnalysis(supabase: any, id: string, explanation: string) {
    const { error } = await supabase
        .from('broker_analysis')
        .update({ ai_explanation: explanation })
        .eq('id', id);
    if (error) console.error('Error updating record:', error);
}

function generateFallbackExplanation(analysis: any, responses: any) {
    let text = `Operational readiness is ${analysis.operational_score >= 80 ? 'strong' : 'limited'}. `;
    if (responses.crm_usage === 'none') text += "The lack of a CRM system typically lowers conversion efficiency. ";
    if (responses.speed_to_contact === 'nextDay') text += "Delayed lead contact is a significant barrier to success. ";

    text += `\n\nBudget alignment is ${analysis.budget_score >= 70 ? 'optimal' : 'a concern'}. `;
    if (responses.pricing_comfort === 'sensitive') text += "High price sensitivity suggests a need for education on cost-per-acquisition vs lead cost. ";

    text += `\n\nOverall, the ${analysis.success_probability}% probability indicates ${analysis.success_band.toLowerCase()}. `;
    if (analysis.risk_flags.length > 0) {
        text += `Key risks include ${analysis.risk_flags.join(' and ')}. Focus on process optimization before significant scaling.`;
    }

    return text;
}
