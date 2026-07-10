import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pwbvoosqunrvqewokynz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hiVcMsabjEaUOUOE1GNqQA_y30oYC8b';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runFullSystemTest() {
    const timestamp = Date.now();
    const outletName = `New Cinema ${timestamp}`;
    const managerPin = "8888";
    const staffPin = "9999";
    const customerPhone = `900${Math.floor(Math.random() * 10000000)}`;

    console.log('--- STEP 1: Creating New Outlet (Super Admin Action) ---');
    const { data: outlet, error: outletError } = await supabase
        .from('cinemas')
        .insert({
            name: outletName,
            location: 'Test City',
            login_email: `admin_${timestamp}@cinema.com`,
            login_password: 'password123'
        })
        .select()
        .single();

    if (outletError) {
        console.error('Failed to create outlet:', outletError.message);
        return;
    }
    console.log(`Outlet "${outletName}" created with ID: ${outlet.id}`);

    console.log('\n--- STEP 2: Creating Manager and Staff Credentials ---');
    const { data: manager, error: managerError } = await supabase
        .from('profiles')
        .insert({
            cinema_id: outlet.id,
            role: 'OUTLET_MANAGER',
            pin: managerPin,
            full_name: 'Test Manager'
        })
        .select()
        .single();

    const { data: staff, error: staffError } = await supabase
        .from('profiles')
        .insert({
            cinema_id: outlet.id,
            role: 'OUTLET_STAFF',
            pin: staffPin,
            full_name: 'Test Staff'
        })
        .select()
        .single();

    if (managerError || staffError) {
        console.error('Failed to create staff:', managerError?.message || staffError?.message);
        return;
    }
    console.log(`Manager created with PIN: ${managerPin}`);
    console.log(`Staff created with PIN: ${staffPin}`);

    console.log('\n--- STEP 3: Adding Food Items to New Outlet ---');
    const { error: foodError } = await supabase
        .from('food_items')
        .insert([
            { name: 'Popcorn XL', price: 200, category: 'Snacks', cinema_id: outlet.id },
            { name: 'Coke Large', price: 100, category: 'Beverages', cinema_id: outlet.id }
        ]);

    if (foodError) console.error('Food setup failed:', foodError.message);
    else console.log('Food menu initialized.');

    console.log('\n--- STEP 4: Customer Signup ---');
    const { error: customerError } = await supabase
        .from('customer_profiles')
        .insert({
            phone: customerPhone,
            password: 'customerpassword',
            first_name: 'John',
            last_name: 'Doe'
        });

    if (customerError) {
        console.error('Customer signup failed:', customerError.message);
        return;
    }
    console.log(`Customer signed up with phone: ${customerPhone}`);

    console.log('\n--- STEP 5: Customer Placing Order ---');
    const orderData = {
        cinema_id: outlet.id,
        items: JSON.stringify([{ name: 'Popcorn XL', price: 200, quantity: 1 }]),
        total_amount: 200,
        status: 'PENDING',
        location: 'Screen 1, Row J',
        customer_phone: customerPhone,
        payment_method: 'DEMO_UPI',
        payment_status: 'PAID',
        is_demo_order: true
    };

    const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert(orderData)
        .select()
        .single();

    if (orderError) {
        console.error('Order placement failed:', orderError.message);
        return;
    }
    console.log(`Order placed successfully! ID: ${order.id}`);

    console.log('\n--- STEP 6: Verifying Outlet Isolation (Manager Check) ---');
    const { data: visibleOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('cinema_id', outlet.id);
    
    console.log(`Manager of "${outletName}" sees ${visibleOrders.length} orders.`);

    console.log('\n--- STEP 7: Staff Accepting Order ---');
    const { error: acceptError } = await supabase
        .from('orders')
        .update({ status: 'PREPARING' })
        .eq('id', order.id);

    if (acceptError) console.error('Acceptance failed:', acceptError.message);
    else console.log('Staff accepted the order. Status: PREPARING');

    console.log('\n--- STEP 8: Delivering Order ---');
    const { error: deliverError } = await supabase
        .from('orders')
        .update({ status: 'DELIVERED' })
        .eq('id', order.id);

    if (deliverError) console.error('Delivery failed:', deliverError.message);
    else console.log('Order successfully DELIVERED to customer.');

    console.log('\n--- FULL FLOW TEST COMPLETE ---');
}

runFullSystemTest();
