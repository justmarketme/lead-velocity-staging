import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_ROLE_KEY'; // Need service role key for admin actions

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing Supabase URL or Service Role Key. Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function resetAdminPassword() {
    const email = 'howzit@leadvelocity.co.za';
    const newPassword = 'Password123!'; // Temporary password

    console.log(`Attempting to update password for: ${email}`);

    // Need to get the user ID first
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
        console.error('Error listing users:', listError.message);
        return;
    }

    const user = users.find(u => u.email === email);

    if (!user) {
        console.error(`User not found with email: ${email}`);
        // Let's create the user since they might not exist
        console.log('Creating the user instead...');
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email: email,
            password: newPassword,
            email_confirm: true
        });

        if (createError) {
            console.error('Error creating user:', createError.message);
            return;
        }

        console.log(`User created successfully! ID: ${newUser.user.id}`);

        // Assign admin role
        const { error: rpcError } = await supabase.rpc('set_claim', { uid: newUser.user.id, claim: 'role', value: '"admin"' });
        if (rpcError) console.error("Error setting admin role initially, but user created. You may need to run SQL to set the role.");

        console.log('New temporary password is:', newPassword);
        return;
    }

    const { data, error } = await supabase.auth.admin.updateUserById(
        user.id,
        { password: newPassword }
    );

    if (error) {
        console.error('Error updating password:', error.message);
    } else {
        console.log('Password successfully reset!');
        console.log('Your new temporary password is:', newPassword);
        console.log('Please log in with this password and change it immediately.');
    }
}

resetAdminPassword();
