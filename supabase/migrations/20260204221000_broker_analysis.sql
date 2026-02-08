-- 1. DROP existing tables to fix the schema (CAUTION: This clears test data)
DROP TABLE IF EXISTS public.broker_analysis;
DROP TABLE IF EXISTS public.broker_onboarding_responses;

-- 2. Create Onboarding Table (Corrected Link)
CREATE TABLE public.broker_onboarding_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- LINK TO PROFILES, NOT AUTH.USERS
    broker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    
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

-- 3. Create Analysis Table (Corrected Link)
CREATE TABLE public.broker_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    response_id UUID REFERENCES public.broker_onboarding_responses(id) ON DELETE CASCADE,
    -- LINK TO PROFILES, NOT AUTH.USERS
    broker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Deterministic Scores
    operational_score INTEGER NOT NULL,
    budget_score INTEGER NOT NULL,
    growth_score INTEGER NOT NULL,
    intent_score INTEGER NOT NULL,
    success_probability INTEGER NOT NULL,
    
    -- Results
    risk_flags TEXT[] DEFAULT '{}',
    primary_sales_angle TEXT NOT NULL,
    success_band TEXT NOT NULL,
    
    -- AI Generated Explanations
    ai_explanations JSONB DEFAULT '{}',
    
    -- Admin State
    status TEXT DEFAULT 'Pending',
    admin_notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable RLS but allow Public access for Development
ALTER TABLE public.broker_onboarding_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_analysis ENABLE ROW LEVEL SECURITY;

-- ALLOW ALL (Development Mode)
CREATE POLICY "Enable all access for dev" ON public.broker_onboarding_responses
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for dev" ON public.broker_analysis
    FOR ALL USING (true) WITH CHECK (true);
