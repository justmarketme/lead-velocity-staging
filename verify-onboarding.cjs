
const { createClient } = require('@supabase/supabase-js');

// Configuration - I'll need to find the keys from the environment or existing files
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://cmsylaupctrbsvzrgzwy.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testBrokerSignup(email) {
    console.log(`Starting atomic signup test for: ${email}`);

    const testPassword = "TestP@ssword123!";
    const testToken = "TEST_TOKEN_" + Date.now();

    // 1. Simulate the signUp call with all metadata
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: testPassword,
        options: {
            data: {
                user_type: 'broker',
                full_name: 'Test Master Broker',
                firm_name: 'Lead Velocity Lab',
                portal_type: 'marketing',
                token: testToken,
                q1: 'Test Q1',
                a1: 'test a1',
                q2: 'Test Q2',
                a2: 'test a2',
                q3: 'Test Q3',
                a3: 'test a3',
            }
        }
    });

    if (error) {
        console.error("❌ Signup Failed:", error.message);
        return;
    }

    console.log("✅ Auth Signup successful. User ID:", data.user.id);
    console.log("Waiting for master trigger to propagate (deferred FKs)...");

    // Allow a small delay for the trigger to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Verify Database State
    const { data: broker, error: bError } = await supabase
        .from('brokers')
        .select('*')
        .eq('user_id', data.user.id)
        .single();

    if (bError || !broker) {
        console.error("❌ Broker record NOT found. Trigger might have failed.");
    } else {
        console.log("✅ Broker record created successfully.");
    }

    const { data: questions, error: qError } = await supabase
        .from('broker_security_questions')
        .select('*')
        .eq('user_id', data.user.id)
        .single();

    if (qError || !questions) {
        console.error("❌ Security questions NOT found. Trigger might have failed.");
    } else {
        console.log("✅ Security questions stored successfully.");
    }

    const { data: role, error: rError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', data.user.id)
        .eq('role', 'broker')
        .single();

    if (rError || !role) {
        console.error("❌ Broker role NOT assigned.");
    } else {
        console.log("✅ Broker role verified.");
    }
}

// Example usage: node test-onboarding.js test_broker_123@example.com
const email = process.argv[2] || `test_${Date.now()}@example.com`;
testBrokerSignup(email);
