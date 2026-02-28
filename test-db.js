import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "https://deno.land/std@0.168.0/dotenv/load.ts";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('admin_invites')
        .select('*')
        .order('created_at', { ascending: false });

    console.log("Error querying admin_invites:", error);
    console.log("Data (admin_invites):", JSON.stringify(data, null, 2));

    // Let's also test inserting into admin_invites to check for RLS
    const { data: insertData, error: insertError } = await supabase
        .from('admin_invites')
        .insert({
            token: 'test-token-123',
            email: 'test@example.com',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select();

    console.log("Error inserting into admin_invites:", insertError);
    console.log("Insert Result:", JSON.stringify(insertData, null, 2));
}

check();
