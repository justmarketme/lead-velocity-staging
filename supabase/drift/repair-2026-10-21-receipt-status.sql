-- NEEDS JONO'S GO. Not a migration and never run automatically: a one-off data repair, run by hand in the Supabase SQL
-- editor (project cmsylaupctrbsvzrgzwy) after the preview below has been read.
--
-- Smoke test 21 Oct 2026, issue #18 (EMMA checklist/SMOKE-TEST-SMC-2026-10-21.md): Twilio status receipts arrived out of
-- order and the receipt UPDATEs wrote whatever came last (W07 exec 11587 'failed' 63024, then exec 11588 'sent' a second
-- later; row eb052c4f). The code fix makes the status move forward only (pending < sent < delivered < read; failed only
-- over pending / sent, and terminal): W06 "Stamp disclosure evidence" on fix/smc-smoke-c2, W07 "Status receipt" in its
-- own fix. This file puts the rows already overwritten back, using the evidence the row itself still carries:
--   failed_reason set, no delivered_at / read_at, status 'sent'  -> 'failed'     (21 rows on 21 Oct 2026, all test numbers)
--   delivered_at set, no read_at, status pending / sent          -> 'delivered'  (1 row, 20 Oct 2026)
--   read_at set, status pending / sent / delivered               -> 'read'       (1 row, 19 Oct 2026)
-- Counts read live (SELECT only) on 21 Oct 2026. Run it after both receipt fixes are live, or a late receipt can undo it.

-- 1. Preview: what would change (expect 21 + 1 + 1 = 23 rows; stop if the numbers are very different).
SELECT id, workflow, recipient_contact, status AS status_now,
       CASE WHEN read_at IS NOT NULL THEN 'read' WHEN delivered_at IS NOT NULL THEN 'delivered' ELSE 'failed' END AS status_repaired,
       failed_reason, delivered_at, read_at, created_at
  FROM public.communications
 WHERE channel = 'whatsapp' AND direction = 'outbound'
   AND (   (read_at IS NOT NULL AND status IN ('pending', 'sent', 'delivered'))
        OR (delivered_at IS NOT NULL AND read_at IS NULL AND status IN ('pending', 'sent'))
        OR (status = 'sent' AND failed_reason IS NOT NULL AND delivered_at IS NULL AND read_at IS NULL))
 ORDER BY created_at;

-- 2. Repair (one transaction; the RETURNING list is the audit trail of what moved).
BEGIN;
UPDATE public.communications
   SET status = CASE WHEN read_at IS NOT NULL THEN 'read' WHEN delivered_at IS NOT NULL THEN 'delivered' ELSE 'failed' END,
       updated_at = now()
 WHERE channel = 'whatsapp' AND direction = 'outbound'
   AND (   (read_at IS NOT NULL AND status IN ('pending', 'sent', 'delivered'))
        OR (delivered_at IS NOT NULL AND read_at IS NULL AND status IN ('pending', 'sent'))
        OR (status = 'sent' AND failed_reason IS NOT NULL AND delivered_at IS NULL AND read_at IS NULL))
RETURNING id, workflow, status, failed_reason;
-- check the returned rows, then:
COMMIT;
-- (or ROLLBACK; if anything looks wrong)
