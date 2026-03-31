-- Sales Consultant Dashboard: scraped leads, voice campaigns, and campaign calls

-- Table: scraped_leads
-- Stores leads scraped from the Marketing Hub (Firecrawl / Apify)
CREATE TABLE IF NOT EXISTS scraped_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text,
  company text,
  email text,
  phone text,
  vibe_score integer,
  industry text,
  source text DEFAULT 'firecrawl',  -- 'firecrawl' | 'apify'
  status text DEFAULT 'new',         -- 'new' | 'assigned' | 'contacted' | 'converted'
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scraped_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on scraped_leads"
  ON scraped_leads FOR ALL
  USING (true);

-- Table: voice_campaigns
-- Stores AI outbound calling campaigns (Twilio + ElevenLabs)
CREATE TABLE IF NOT EXISTS voice_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text DEFAULT 'draft',   -- 'draft' | 'running' | 'completed' | 'paused'
  lead_ids jsonb DEFAULT '[]',
  voice_config jsonb DEFAULT '{}',  -- {voice_id, stability, similarity_boost, style, use_speaker_boost}
  knowledge_base text,
  objective text DEFAULT 'cold_call',  -- 'cold_call' | 'appointment_scheduling' | 'follow_up' | 'product_pitch'
  total_leads integer DEFAULT 0,
  contacted integer DEFAULT 0,
  appointments_set integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  launched_at timestamptz
);

ALTER TABLE voice_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on voice_campaigns"
  ON voice_campaigns FOR ALL
  USING (true);

-- Table: voice_campaign_calls
-- Individual call records within a campaign
CREATE TABLE IF NOT EXISTS voice_campaign_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES voice_campaigns(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES scraped_leads(id),
  call_status text DEFAULT 'queued',  -- 'queued' | 'initiated' | 'completed' | 'failed'
  call_sid text,                       -- Twilio Call SID
  elevenlabs_agent_id text,            -- ElevenLabs Conversation ID
  duration integer,                    -- Call duration in seconds
  outcome text,                        -- 'appointment' | 'callback' | 'not_interested' | 'no_answer'
  created_at timestamptz DEFAULT now()
);

ALTER TABLE voice_campaign_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on voice_campaign_calls"
  ON voice_campaign_calls FOR ALL
  USING (true);
