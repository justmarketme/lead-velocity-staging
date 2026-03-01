import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testLogin() {
    console.log("Attempting to sign in with howzit@leadvelocity.co.za...");
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: 'howzit@leadvelocity.co.za',
        password: 'TestPassword123!'
    });

    if (signInData.user) {
        const { data: roleData, error: roleError } = await supabase
            .from('user_roles')
            .select('*')
            .eq('user_id', signInData.user.id);

        console.log("Role Error:", roleError);
        console.log("Role Data:", JSON.stringify(roleData, null, 2));
    }
}

testLogin();
