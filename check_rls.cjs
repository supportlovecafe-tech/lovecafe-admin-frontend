
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pwbvoosqunrvqewokynz.supabase.co';
const supabaseAnonKey = 'sb_publishable_hiVcMsabjEaUOUOE1GNqQA_y30oYC8b';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkRLS() {
  const { data, error } = await supabase.rpc('get_policies', { table_name: 'orders' });
  // Since get_policies might not exist, let's try a direct query on pg_policies
  
  const { data: policies, error: polError } = await supabase.from('pg_policies').select('*').eq('tablename', 'orders');
  
  if (polError) {
    console.error('Could not fetch policies directly. Trying to check if anon can select...');
    const { data: testData, error: testError } = await supabase.from('orders').select('id').limit(1);
    if (testError) {
        console.error('Anon CANNOT SELECT from orders:', testError.message);
    } else {
        console.log('Anon CAN SELECT from orders.');
    }
  } else {
    console.log('Policies for orders:', policies);
  }
}

checkRLS();
