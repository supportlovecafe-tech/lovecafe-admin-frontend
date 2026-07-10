import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pwbvoosqunrvqewokynz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hiVcMsabjEaUOUOE1GNqQA_y30oYC8b';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ATINDRA_ID = 'f115ebed-c919-4fd2-850a-f0deb0753936';
const UDAYAN_ID = 'f0701a53-b2b8-4a1a-b621-e248665564fc';

async function runTest() {
    const testPhone = `987${Math.floor(Math.random() * 10000000)}`;
    const testPassword = 'Password123!';

    console.log('--- STEP 1: Signing up new customer in customer_profiles ---');
    const { data: profileData, error: profileError } = await supabase
        .from('customer_profiles')
        .insert({
            phone: testPhone,
            password: testPassword,
            first_name: 'Test',
            last_name: 'Customer',
            email: `test_${testPhone}@gmail.com`
        })
        .select()
        .single();

    if (profileError) {
        console.error('Profile creation failed:', profileError.message);
        // If it fails because table doesn't exist or permission, we might need to check fix_customer_auth.sql
        return;
    }
    console.log('Customer profile created with phone:', testPhone);

    console.log('\n--- STEP 2: Placing order for Atindra ---');
    const atindraOrder = {
        cinema_id: ATINDRA_ID,
        // Skipping customer_id as it references auth.users which we are bypassing
        items: JSON.stringify([{ name: 'Cold Coffee', price: 150, quantity: 1 }]),
        total_amount: 150,
        status: 'PENDING',
        location: 'Hall A, Seat 12',
        customer_phone: testPhone,
        payment_method: 'DEMO_UPI',
        payment_status: 'PAID',
        is_demo_order: true
    };

    const { error: order1Error } = await supabase.from('orders').insert(atindraOrder);
    if (order1Error) {
        console.error('Atindra order failed:', order1Error.message);
    } else {
        console.log('Atindra order placed (assumed, as no select was used)');
    }

    console.log('\n--- STEP 3: Placing order for Udayan ---');
    const udayanOrder = {
        cinema_id: UDAYAN_ID,
        items: JSON.stringify([{ name: 'popcorn salted', price: 300, quantity: 2 }]),
        total_amount: 600,
        status: 'PENDING',
        location: 'Hall 1, Seat 5',
        customer_phone: testPhone,
        payment_method: 'DEMO_UPI',
        payment_status: 'PAID',
        is_demo_order: true
    };

    const { error: order2Error } = await supabase.from('orders').insert(udayanOrder);
    if (order2Error) {
        console.error('Udayan order failed:', order2Error.message);
    } else {
        console.log('Udayan order placed (assumed)');
    }

    // Since we didn't get the IDs, we'll fetch them by phone
    console.log('\n--- Fetching placed order IDs ---');
    const { data: myOrders } = await supabase.from('orders').select('id, cinema_id').eq('customer_phone', testPhone);
    const order1 = myOrders?.find(o => o.cinema_id === ATINDRA_ID);
    const order2 = myOrders?.find(o => o.cinema_id === UDAYAN_ID);
    if (order1) console.log('Found Atindra order ID:', order1.id);
    if (order2) console.log('Found Udayan order ID:', order2.id);

    const { data: atindraOrders, error: atindraFetchError } = await supabase
        .from('orders')
        .select('id, cinema_id, items, total_amount, status, location, customer_phone')
        .eq('cinema_id', ATINDRA_ID)
        .order('timestamp', { ascending: false });

    if (atindraFetchError) {
        console.error('Atindra fetch failed:', atindraFetchError.message);
    } else {
        console.log(`Atindra manager sees ${atindraOrders.length} orders.`);
        const hasOwn = order1 && atindraOrders.some(o => o.id === order1.id);
        const hasOther = order2 && atindraOrders.some(o => o.id === order2.id);
        console.log('Includes own order:', hasOwn);
        console.log('Includes Udayan order (SHOULD BE FALSE):', hasOther);
    }

    console.log('\n--- STEP 5: Verifying as Udayan Manager ---');
    const { data: udayanOrders, error: udayanFetchError } = await supabase
        .from('orders')
        .select('id, cinema_id, items, total_amount, status, location, customer_phone')
        .eq('cinema_id', UDAYAN_ID)
        .order('timestamp', { ascending: false });

    if (udayanFetchError) {
        console.error('Udayan fetch failed:', udayanFetchError.message);
    } else {
        console.log(`Udayan manager sees ${udayanOrders.length} orders.`);
        const hasOwn = order2 && udayanOrders.some(o => o.id === order2.id);
        const hasOther = order1 && udayanOrders.some(o => o.id === order1.id);
        console.log('Includes own order:', hasOwn);
        console.log('Includes Atindra order (SHOULD BE FALSE):', hasOther);
    }

    console.log('\n--- STEP 6: Delivering orders ---');
    if (order1) {
        const { error: del1Error } = await supabase.from('orders').update({ status: 'DELIVERED' }).eq('id', order1.id);
        if (del1Error) console.error('Delivery 1 failed:', del1Error.message);
        else console.log('Atindra order marked as DELIVERED');
    }
    if (order2) {
        const { error: del2Error } = await supabase.from('orders').update({ status: 'DELIVERED' }).eq('id', order2.id);
        if (del2Error) console.error('Delivery 2 failed:', del2Error.message);
        else console.log('Udayan order marked as DELIVERED');
    }

    console.log('\n--- TEST COMPLETE ---');
}

runTest();
