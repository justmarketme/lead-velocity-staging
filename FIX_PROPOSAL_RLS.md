# 🚨 Action Required: Fix Document RLS Policies

This file contains the SQL needed to fix the "new row violates row-level security policy" error when saving proposals from the Dashboard.

## Problem
The `admin_documents` table and its associated storage bucket have strict security policies that only allow authenticated users with the `admin` role to upload or save files. Since development often uses a bypassed login, these requests are rejected by Supabase.

## Fix
Copy and run the SQL below in your **Supabase SQL Editor**. This will grant public access (safe for local development/testing) to the documents library and storage.

```sql
-- 1. Table Access: Allow anyone to manage admin documents (Proposals)
-- This allows the 'Save to System' button to work
DROP POLICY IF EXISTS "Enable all access for dev" ON public.admin_documents;
CREATE POLICY "Enable all access for dev" ON public.admin_documents
    FOR ALL USING (true) WITH CHECK (true);

-- 2. Storage Access: Allow anyone to upload to the 'admin-documents' bucket
-- This allows the PDF file to actually be uploaded to Supabase Storage
DROP POLICY IF EXISTS "Dev storage access" ON storage.objects;
CREATE POLICY "Dev storage access" ON storage.objects
    FOR ALL 
    USING (bucket_id = 'admin-documents') 
    WITH CHECK (bucket_id = 'admin-documents');

-- 3. Safety Check: Ensure the bucket exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('admin-documents', 'admin-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;
```

## How to use
1. Go to your Supabase project dashboard.
2. Click on **SQL Editor** in the left sidebar.
3. Paste the code above and click **Run**.
4. You should now be able to click "Save to System" in the Proposal Generator without errors!
