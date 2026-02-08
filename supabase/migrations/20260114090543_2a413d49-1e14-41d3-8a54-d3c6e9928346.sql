-- Add INSERT policy for brokers to add referrals to their own leads
CREATE POLICY "Brokers can insert referrals for their leads"
ON public.referrals
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM leads
    JOIN brokers ON leads.broker_id = brokers.id
    WHERE leads.id = referrals.parent_lead_id
    AND brokers.user_id = auth.uid()
  )
);