
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pwbvoosqunrvqewokynz.supabase.co';
const supabaseAnonKey = 'sb_publishable_hiVcMsabjEaUOUOE1GNqQA_y30oYC8b';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function findCinemaAndDebug() {
  const { data: cinemas } = await supabase.from('cinemas').select('id, name').limit(1);
  if (!cinemas || cinemas.length === 0) {
    console.error('No cinemas found!');
    return;
  }
  
  const cinemaId = cinemas[0].id;
  console.log(`Using cinema: ${cinemas[0].name} (${cinemaId})`);

  const testOrder = {
    cinema_id: cinemaId,
    display_id: 'DEBUG-' + Math.floor(Math.random() * 1000),
    items: [{ food_name: 'Test Item', quantity: 1, food_price: 100 }],
    total_amount: 100,
    location: 'APK Debug',
    customer_phone: '9999999999',
    status: 'PENDING',
    payment_status: 'PAID',
    payment_method: 'DEMO_UPI',
    timestamp: new Date().toISOString(),
    is_demo_order: true 
  };

  console.log('Attempting to insert test order...');
  const { data, error } = await supabase.from('orders').insert(testOrder).select();

  if (error) {
    console.error('INSERT FAILED!');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    console.error('Error Hint:', error.hint);
  } else {
    console.log('INSERT SUCCESS:', data);
  }
}

findCinemaAndDebug();
