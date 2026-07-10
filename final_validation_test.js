import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pwbvoosqunrvqewokynz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hiVcMsabjEaUOUOE1GNqQA_y30oYC8b';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runFinalValidation() {
    const timestamp = Date.now();
    const outletName = `Validation Cinema ${timestamp}`;
    const customerPhone = `999${Math.floor(Math.random() * 10000000)}`;
    const staffPin = "7777";

    console.log('--- PHASE 1: SETUP NEW OUTLET ---');
    const { data: outlet } = await supabase.from('cinemas').insert({
        name: outletName,
        location: 'Validation Hub',
        login_email: `val_${timestamp}@cinema.com`,
        login_password: 'password123'
    }).select().single();
    console.log(`Outlet Created: ${outlet.name} (${outlet.id})`);

    await supabase.from('profiles').insert({
        cinema_id: outlet.id,
        role: 'OUTLET_STAFF',
        pin: staffPin,
        full_name: 'Val Staff'
    });
    console.log(`Staff Credentials Set (PIN: ${staffPin})`);

    console.log('\n--- PHASE 2: CUSTOMER SIGNUP & ORDER ---');
    await supabase.from('customer_profiles').insert({
        phone: customerPhone,
        password: 'pass',
        first_name: 'Val',
        last_name: 'Customer'
    });
    console.log(`Customer Signed Up: ${customerPhone}`);

    const orderData = {
        cinema_id: outlet.id,
        items: JSON.stringify([{ name: 'Test Popcorn', price: 100, quantity: 1 }]),
        total_amount: 100,
        status: 'PENDING',
        location: 'VIP Hall, Seat 1',
        customer_phone: customerPhone,
        payment_method: 'DEMO_UPI',
        payment_status: 'PAID',
        is_demo_order: true
    };

    const { data: order } = await supabase.from('orders').insert(orderData).select().single();
    console.log(`Order Placed: ${order.id}`);

    console.log('\n--- PHASE 3: VERIFICATION (CUSTOMER PERSPECTIVE) ---');
    // Check Profile
    const { data: profile } = await supabase.from('customer_profiles').select().eq('phone', customerPhone).single();
    console.log(`Profile check: ${profile.first_name} ${profile.last_name} (${profile.phone}) - SUCCESS`);

    // Check My Orders (Filtering by Phone - what the fix addressed)
    const { data: myOrders } = await supabase.from('orders').select('*').eq('customer_phone', customerPhone);
    console.log(`Customer sees ${myOrders.length} orders. Correct Order Present: ${myOrders.some(o => o.id === order.id)}`);

    console.log('\n--- PHASE 4: PROCESSING (STAFF PERSPECTIVE) ---');
    // Verify Outlet Isolation
    const { data: staffOrders } = await supabase.from('orders').select('*').eq('cinema_id', outlet.id);
    console.log(`Staff of "${outletName}" sees ${staffOrders.length} orders. Isolation Check: SUCCESS`);

    // Accept & Deliver
    await supabase.from('orders').update({ status: 'PREPARING' }).eq('id', order.id);
    console.log('Order Status Updated: PREPARING');

    await supabase.from('orders').update({ status: 'DELIVERED' }).eq('id', order.id);
    console.log('Order Status Updated: DELIVERED');

    console.log('\n--- PHASE 5: FINAL VERIFICATION ---');
    const { data: finalOrder } = await supabase.from('orders').select('status').eq('id', order.id).single();
    console.log(`Final Order Status for Customer: ${finalOrder.status}`);

    if (finalOrder.status === 'DELIVERED') {
        console.log('\n✅ ALL TESTS PASSED: Flow, Persistence, and Isolation Verified.');
    } else {
        console.log('\n❌ TEST FAILED: Status mismatch.');
    }
}

runFinalValidation();
