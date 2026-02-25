
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase URL or Key in .env");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSupabase() {
    console.log("Checking Supabase connection...");

    // Check profiles table (mentioned in FIX_DASHBOARD_SQL.md)
    const { data: profiles, error: pError } = await supabase.from('profiles').select('*').limit(1);
    if (pError) {
        console.error("Error fetching profiles:", pError.message);
    } else {
        console.log("Profiles table exists.");
    }

    // Check broker_onboarding_responses table
    const { data: responses, error: rError } = await supabase.from('broker_onboarding_responses').select('*').limit(1);
    if (rError) {
        console.error("Error fetching broker_onboarding_responses:", rError.message);
    } else {
        console.log("broker_onboarding_responses table exists.");
    }

    // Check admin_documents table
    const { data: docs, error: dError } = await supabase.from('admin_documents').select('*').limit(1);
    if (dError) {
        console.error("Error fetching admin_documents:", dError.message);
    } else {
        console.log("admin_documents table exists.");
    }

    // Check storage bucket
    const { data: buckets, error: bError } = await supabase.storage.listBuckets();
    if (bError) {
        console.error("Error fetching buckets:", bError.message);
    } else {
        const adminDocsBucket = buckets.find(b => b.id === 'admin-documents');
        if (adminDocsBucket) {
            console.log("'admin-documents' storage bucket exists.");
        } else {
            console.log("'admin-documents' storage bucket does NOT exist.");
        }
    }
}

checkSupabase();
