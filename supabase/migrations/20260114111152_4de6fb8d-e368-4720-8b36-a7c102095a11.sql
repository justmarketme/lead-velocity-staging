-- Add Follow-up as a valid status by updating any leads that might need it
-- This ensures the workflow stages align with actual data

-- Create an index for better performance on status filtering
CREATE INDEX IF NOT EXISTS idx_leads_current_status ON leads(current_status);

-- Create an index for better performance on updated_at for bottleneck detection
CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at);