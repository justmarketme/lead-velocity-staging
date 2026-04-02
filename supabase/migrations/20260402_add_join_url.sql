-- Add join_url to ai_call_requests for real-time monitoring
ALTER TABLE ai_call_requests ADD COLUMN IF NOT EXISTS join_url TEXT;

-- Update the existing in_progress calls to ensure they have a place for it
COMMENT ON COLUMN ai_call_requests.join_url IS 'The WebSocket URL used by the frontend to join and monitor the live call.';
