// Script to apply the broker onboarding schema migration to Supabase
// Run with: node scripts/apply-migration.js

const https = require('https');

const SUPABASE_URL = 'https://jxrfcxfuzwnsojfasnnu.supabase.co';
// Using the anon key from .env - note this won't work for DDL statements
// We need to use the Supabase dashboard SQL editor instead

const sql = `
-- Fix onboarding schema: allow anonymous submissions with contact info
DROP TABLE IF EXISTS public.broker_analysis CASCADE;
DROP TABLE IF EXISTS public.broker_onboarding_responses CASCADE;

CREATE TABLE public.broker_onboarding_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broker_id UUID,
    full_name TEXT,
    email TEXT,
    phone_number TEXT,
    firm_name TEXT,
    crm_usage TEXT NOT NULL,
    speed_to_contact TEXT NOT NULL,
    team_size TEXT NOT NULL,
    follow_up_process TEXT NOT NULL,
    monthly_lead_spend TEXT NOT NULL,
    cpl_awareness TEXT NOT NULL,
    pricing_comfort TEXT NOT NULL,
    desired_leads_weekly INTEGER NOT NULL,
    max_capacity_weekly INTEGER NOT NULL,
    product_focus_clarity TEXT NOT NULL,
    geographic_focus_clarity TEXT NOT NULL,
    growth_goal_clarity TEXT NOT NULL,
    timeline_to_start TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.broker_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id UUID REFERENCES public.broker_onboarding_responses(id) ON DELETE CASCADE,
    broker_id UUID,
    operational_score INTEGER NOT NULL DEFAULT 0,
    budget_score INTEGER NOT NULL DEFAULT 0,
    growth_score INTEGER NOT NULL DEFAULT 0,
    intent_score INTEGER NOT NULL DEFAULT 0,
    success_probability INTEGER NOT NULL DEFAULT 0,
    risk_flags TEXT[] DEFAULT '{}',
    primary_sales_angle TEXT NOT NULL DEFAULT '',
    success_band TEXT NOT NULL DEFAULT 'Low Probability',
    ai_explanation TEXT,
    status TEXT DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.broker_onboarding_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can submit onboarding" ON public.broker_onboarding_responses
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role full access to responses" ON public.broker_onboarding_responses
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to analysis" ON public.broker_analysis
    FOR ALL USING (true) WITH CHECK (true);
`;

console.log('='.repeat(60));
console.log('SUPABASE MIGRATION SQL');
console.log('='.repeat(60));
console.log('\nPlease run the following SQL in your Supabase Dashboard:');
console.log(`${SUPABASE_URL.replace('https://', 'https://supabase.com/dashboard/project/')}/sql/new`);
console.log('\n' + sql);
console.log('='.repeat(60));
