-- Fix onboarding schema: allow anonymous submissions with contact info
-- Drop and recreate to fix issues with broker_id foreign key and missing contact fields

DROP TABLE IF EXISTS public.broker_analysis CASCADE;
DROP TABLE IF EXISTS public.broker_onboarding_responses CASCADE;

-- 1. Broker Onboarding Responses — no FK required (allows anonymous public submissions)
CREATE TABLE public.broker_onboarding_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broker_id UUID,  -- optional: auth user id if logged in

    -- Contact Details (collected at submission time)
    full_name TEXT,
    email TEXT,
    phone_number TEXT,
    firm_name TEXT,

    -- Operational Inputs
    crm_usage TEXT NOT NULL,
    speed_to_contact TEXT NOT NULL,
    team_size TEXT NOT NULL,
    follow_up_process TEXT NOT NULL,

    -- Budget & Spend
    monthly_lead_spend TEXT NOT NULL,
    cpl_awareness TEXT NOT NULL,
    pricing_comfort TEXT NOT NULL,

    -- Volume & Capacity
    desired_leads_weekly INTEGER NOT NULL,
    max_capacity_weekly INTEGER NOT NULL,

    -- Growth & Intent
    product_focus_clarity TEXT NOT NULL,
    geographic_focus_clarity TEXT NOT NULL,
    growth_goal_clarity TEXT NOT NULL,
    timeline_to_start TEXT NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Broker Analysis — stores computed scores linked to response
CREATE TABLE public.broker_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id UUID REFERENCES public.broker_onboarding_responses(id) ON DELETE CASCADE,
    broker_id UUID,  -- optional

    -- Deterministic Scores
    operational_score INTEGER NOT NULL DEFAULT 0,
    budget_score INTEGER NOT NULL DEFAULT 0,
    growth_score INTEGER NOT NULL DEFAULT 0,
    intent_score INTEGER NOT NULL DEFAULT 0,
    success_probability INTEGER NOT NULL DEFAULT 0,

    -- Results
    risk_flags TEXT[] DEFAULT '{}',
    primary_sales_angle TEXT NOT NULL DEFAULT '',
    success_band TEXT NOT NULL DEFAULT 'Low Probability',

    -- AI Generated Explanation (text field for display)
    ai_explanation TEXT,

    -- Admin State
    status TEXT DEFAULT 'pending',
    admin_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.broker_onboarding_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_analysis ENABLE ROW LEVEL SECURITY;

-- 4. Public insert policy (anyone can submit the onboarding form)
CREATE POLICY "Public can submit onboarding" ON public.broker_onboarding_responses
    FOR INSERT WITH CHECK (true);

-- 5. Admin/Service role can read and update everything
CREATE POLICY "Service role full access to responses" ON public.broker_onboarding_responses
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to analysis" ON public.broker_analysis
    FOR ALL USING (true) WITH CHECK (true);
