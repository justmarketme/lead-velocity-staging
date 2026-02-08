-- Add UPDATE policy for brokers to update referral appointments on their leads
CREATE POLICY "Brokers can update referrals for their leads"
ON public.referrals
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM leads
    JOIN brokers ON leads.broker_id = brokers.id
    WHERE leads.id = referrals.parent_lead_id
    AND brokers.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM leads
    JOIN brokers ON leads.broker_id = brokers.id
    WHERE leads.id = referrals.parent_lead_id
    AND brokers.user_id = auth.uid()
  )
);