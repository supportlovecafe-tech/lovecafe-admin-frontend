const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://pwbvoosqunrvqewokynz.supabase.co'
const supabaseAnonKey = 'sb_publishable_hiVcMsabjEaUOUOE1GNqQA_y30oYC8b'
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function validateRLS() {
    console.log('Testing RLS policies on food_items table...');
    
    // 1. Try Insert
    console.log('Attempting to insert a test item...');
    const testItem = {
        name: 'Validation Test Item',
        description: 'Testing RLS',
        price: 999,
        category: 'Test',
        is_available: false
    };

    const { data: insertData, error: insertError } = await supabase
        .from('food_items')
        .insert([testItem])
        .select()
        .single();

    if (insertError) {
        console.error('❌ Insert failed! RLS policy is likely still blocking inserts.');
        console.error('Error details:', insertError.message);
        return;
    }
    
    console.log('✅ Insert successful. ID:', insertData.id);

    // 2. Try Update
    console.log('Attempting to update the test item...');
    const { error: updateError } = await supabase
        .from('food_items')
        .update({ price: 1000 })
        .eq('id', insertData.id);

    if (updateError) {
        console.error('❌ Update failed!');
        console.error('Error details:', updateError.message);
    } else {
        console.log('✅ Update successful.');
    }

    // 3. Try Delete
    console.log('Cleaning up: attempting to delete the test item...');
    const { error: deleteError } = await supabase
        .from('food_items')
        .delete()
        .eq('id', insertData.id);

    if (deleteError) {
        console.error('❌ Delete failed!');
        console.error('Error details:', deleteError.message);
    } else {
        console.log('✅ Delete successful. Cleanup complete.');
    }
    
    console.log('\n🎉 Validation complete! If all steps passed, the Outlet Manager can now add/edit menu items.');
}

validateRLS();
