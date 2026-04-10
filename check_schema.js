
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load .env
const envConfig = dotenv.parse(fs.readFileSync('.env'));

const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_PUBLISHABLE_KEY);

async function checkSchema() {
  const { data, error } = await supabase.rpc('get_table_definition', { table_name: 'leads' });
  if (error) {
    console.error('Error fetching definition via RPC:', error.message);
    // Try a simple query to see columns
    const { data: leadData, error: leadError } = await supabase.from('leads').select('*').limit(1);
    if (leadError) {
      console.error('Error fetching lead data:', leadError.message);
    } else {
      console.log('Columns in leads table:', Object.keys(leadData[0] || {}));
    }
  } else {
    console.log('Table definition:', data);
  }
}

checkSchema();
