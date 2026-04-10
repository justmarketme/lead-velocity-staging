
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://cmsylaupctrbsvzrgzwy.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtc3lsYXVwY3RyYnN2enJnend5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTI0ODgsImV4cCI6MjA4NzQyODQ4OH0.Yw__SmIqyMNNoqMarEl-xX_Na5BxHeuod5tidEPA4qI";

const supabase = createClient(supabaseUrl, supabaseKey);

async function addDemoLead() {
  const demoLead = {
    first_name: "Demo",
    last_name: "Lead",
    email: "demo@example.com",
    phone: "+27821234567", // Example South African number
    source: "ayanda_test",
    current_status: "New",
    notes: "Lead generated for Ayanda AI voice testing."
  };

  const { data, error } = await supabase
    .from('leads')
    .insert([demoLead])
    .select();

  if (error) {
    console.error('Error adding demo lead:', error);
  } else {
    console.log('Demo lead added successfully:', data);
  }
}

addDemoLead();
