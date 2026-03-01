-- Migration: Broker Auth Security (Invitation Flow)
-- Description: Adds tables for broker invitations, security questions, and manual reset requests.

-- 1. Broker Invitations Table
CREATE TABLE IF NOT EXISTS public.broker_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    broker_name TEXT,
    firm_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id)
);

-- 2. Broker Security Questions Table
-- Note: Answers should be stored hashed on the frontend if possible, 
-- or we rely on RLS and SSL for transport. For now, we store them as TEXT.
CREATE TABLE IF NOT EXISTS public.broker_security_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    question_1 TEXT NOT NULL,
    answer_1 TEXT NOT NULL,
    question_2 TEXT NOT NULL,
    answer_2 TEXT NOT NULL,
    question_3 TEXT NOT NULL,
    answer_3 TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id)
);

-- 3. Broker Reset Requests Table
CREATE TABLE IF NOT EXISTS public.broker_reset_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES auth.users(id)
);

-- 4. Enable RLS
ALTER TABLE public.broker_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_security_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_reset_requests ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Invites: Admins can do everything. Brokers can't see them (except by token via function if needed).
CREATE POLICY "Admins can manage broker invites" ON public.broker_invites
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Security Questions: Admins can't see answers. Users can only see/edit their own.
CREATE POLICY "Users can manage their own security questions" ON public.broker_security_questions
    FOR ALL USING (auth.uid() = user_id);

-- Reset Requests: Anyone can create (to request reset). Only admins can view/update.
CREATE POLICY "Anyone can create reset requests" ON public.broker_reset_requests
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can manage reset requests" ON public.broker_reset_requests
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 6. Trigger for updated_at
DO $$ BEGIN
    CREATE TRIGGER update_broker_security_questions_updated_at 
    BEFORE UPDATE ON public.broker_security_questions 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
