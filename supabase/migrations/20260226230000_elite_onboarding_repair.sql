-- Final Onboarding & Elite Portal Support Repair
-- Date: 2026-02-26

-- 1. Add Elite Portal Support to Brokers
ALTER TABLE public.brokers 
ADD COLUMN IF NOT EXISTS portal_style TEXT DEFAULT 'Standard' CHECK (portal_style IN ('Standard', 'Elite')),
ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'Pilot' CHECK (tier IN ('Pilot', 'Bronze', 'Silver', 'Gold')),
ADD COLUMN IF NOT EXISTS is_lead_loading BOOLEAN DEFAULT true;

-- 2. Fix Column Names in Onboarding Responses (for cross-compatibility)
-- This ensures 'phone' and 'phone_number' are interchangeable
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='broker_onboarding_responses' AND column_name='phone_number') THEN
        ALTER TABLE public.broker_onboarding_responses RENAME COLUMN phone_number TO phone;
    END IF;
END $$;

-- 3. Ensure Onboarding Policies are Active
ALTER TABLE public.broker_analysis ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can view all analyses') THEN
        CREATE POLICY "Admins can view all analyses"
        ON public.broker_analysis
        FOR ALL
        USING (public.has_role(auth.uid(), 'admin'));
    END IF;
END $$;

-- 4. Create the Admin Documents Bucket (if missing)
-- This is often handled via the Supabase Dashboard, but placing the policy here for completeness.
INSERT INTO storage.buckets (id, name, public) 
VALUES ('admin-documents', 'admin-documents', true)
ON CONFLICT (id) DO NOTHING;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access') THEN
        CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'admin-documents');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin Upload') THEN
        CREATE POLICY "Admin Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'admin-documents' AND public.has_role(auth.uid(), 'admin'));
    END IF;
END $$;
