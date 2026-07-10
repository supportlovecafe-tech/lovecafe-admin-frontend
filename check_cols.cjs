
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pwbvoosqunrvqewokynz.supabase.co';
const supabaseAnonKey = 'sb_publishable_hiVcMsabjEaUOUOE1GNqQA_y30oYC8b';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkColumns() {
  // Query to get column names for 'orders' table
  const { data, error } = await supabase.rpc('get_table_columns', { t_name: 'orders' });
  
  if (error) {
    // If RPC fails, try a direct query on a non-existent column to see the error message which lists columns
    console.log('RPC failed, trying fallback...');
    const { data: d, error: e } = await supabase.from('orders').select('non_existent_column').limit(1);
    console.log('Error output (may contain schema info):', e.message);
  } else {
    console.log('Columns in orders table:', data);
  }
}

checkColumns();
