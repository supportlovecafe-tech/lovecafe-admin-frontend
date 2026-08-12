import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_KEY'

// Replace this with actual env or load from .env.local
import fs from 'fs'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function testUpdate() {
  const { data, error } = await supabase.from('screens').select('id').limit(1);
  if (error) {
    console.error('Select Error:', error);
    return;
  }
  if (!data || data.length === 0) {
    console.log('No screens found');
    return;
  }
  
  const screenId = data[0].id;
  console.log('Attempting to update screen:', screenId);
  const { data: updateData, error: updateError } = await supabase
    .from('screens')
    .update({ name: 'Test Screen Update' })
    .eq('id', screenId);
    
  if (updateError) {
    console.error('Update Error:', updateError);
  } else {
    console.log('Update Success:', updateData);
  }
}

testUpdate();
