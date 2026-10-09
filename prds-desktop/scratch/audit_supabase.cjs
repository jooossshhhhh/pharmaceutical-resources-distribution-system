const { createClient } = require('../node_modules/@supabase/supabase-js');
const { DatabaseSync } = require('node:sqlite');

const url = 'https://pcktrkqqwykcmgswkjlj.supabase.co';
const key = 'sb_publishable_9ILbw8Bhh_DEZxRPM6WgUw_XXFvlfUh';
const sb = createClient(url, key);

async function runAudit() {
  console.log('--------------------------------------------------');
  console.log('PRDS SUPABASE AUDIT & INTEGRITY CHECK');
  console.log('Target: ' + url);
  console.log('Timestamp: ' + new Date().toISOString());
  console.log('--------------------------------------------------');

  // Test 1: stock_returns table
  const { data: retData, error: retErr } = await sb.from('stock_returns').select('*').limit(5);
  if (retErr) {
    console.log('❌ stock_returns:', retErr.message);
  } else {
    console.log('✅ stock_returns table: EXISTS and ACCESSIBLE (rows: ' + retData.length + ')');
  }

  // Test 2: stock_return_items table
  const { data: itData, error: itErr } = await sb.from('stock_return_items').select('*').limit(5);
  if (itErr) {
    console.log('❌ stock_return_items:', itErr.message);
  } else {
    console.log('✅ stock_return_items table: EXISTS and ACCESSIBLE (rows: ' + itData.length + ')');
  }

  // Test 3: legacy stock_transfers table (must be dropped)
  const { error: trErr } = await sb.from('stock_transfers').select('id').limit(1);
  if (trErr && (trErr.code === 'PGRST205' || trErr.message.includes('Could not find the table'))) {
    console.log('✅ legacy stock_transfers: PROPERLY DROPPED (PGRST205 table not found)');
  } else if (!trErr) {
    console.log('⚠️ legacy stock_transfers: STILL EXISTS in Supabase');
  } else {
    console.log('ℹ️ legacy stock_transfers response:', trErr.message);
  }

  // Test 4: legacy stock_transfer_items
  const { error: trItErr } = await sb.from('stock_transfer_items').select('id').limit(1);
  if (trItErr && (trItErr.code === 'PGRST205' || trItErr.message.includes('Could not find the table'))) {
    console.log('✅ legacy stock_transfer_items: PROPERLY DROPPED');
  } else {
    console.log('ℹ️ stock_transfer_items:', trItErr?.message || 'still exists');
  }

  // Test 5: legacy stock_transfer_fulfillments
  const { error: trFulErr } = await sb.from('stock_transfer_fulfillments').select('id').limit(1);
  if (trFulErr && (trFulErr.code === 'PGRST205' || trFulErr.message.includes('Could not find the table'))) {
    console.log('✅ legacy stock_transfer_fulfillments: PROPERLY DROPPED');
  } else {
    console.log('ℹ️ stock_transfer_fulfillments:', trFulErr?.message || 'still exists');
  }

  // Test 6: Check RPC
  const { error: rpcErr } = await sb.rpc('get_stock_transfer_allocation_batches', { p_transfer_id: '00000000-0000-0000-0000-000000000000' });
  if (rpcErr && (rpcErr.code === 'PGRST202' || rpcErr.message.includes('Could not find the function'))) {
    console.log('✅ legacy transfer RPCs: PROPERLY DROPPED (function does not exist)');
  } else {
    console.log('ℹ️ transfer RPC response:', rpcErr?.message);
  }

  // Test 7: Verify SQLite Local Cache
  try {
    const db = new DatabaseSync('C:/Users/laroa/AppData/Roaming/com.prds.naga/prds.db');
    const sqliteReturns = db.prepare('SELECT count(*) as count FROM stock_returns').get();
    const sqliteReturnItems = db.prepare('SELECT count(*) as count FROM stock_return_items').get();
    console.log('✅ SQLite Local Cache stock_returns: ' + sqliteReturns.count + ' records');
    console.log('✅ SQLite Local Cache stock_return_items: ' + sqliteReturnItems.count + ' records');
  } catch (e) {
    console.log('ℹ️ SQLite inspect notice:', e.message);
  }

  console.log('--------------------------------------------------');
  console.log('AUDIT COMPLETE');
}

runAudit().catch(console.error);
