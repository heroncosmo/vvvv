#!/usr/bin/env node
/**
 * wa-unfreeze-pending-timers.mjs
 *
 * Usage:
 *   node scripts/wa-unfreeze-pending-timers.mjs --dry-run
 *   node scripts/wa-unfreeze-pending-timers.mjs --apply
 *   node scripts/wa-unfreeze-pending-timers.mjs --apply --user-id <uuid>
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');

function readArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

const userId = readArg('--user-id');

if ((dryRun && apply) || (!dryRun && !apply)) {
  console.error('Choose exactly one mode: --dry-run or --apply');
  process.exit(1);
}

const MODE = dryRun ? 'DRY_RUN' : 'APPLY';
const ELIGIBLE_AGE_MS = 5 * 60 * 1000; // 5 minutes
const thresholdIso = new Date(Date.now() - ELIGIBLE_AGE_MS).toISOString();
const nowIso = new Date().toISOString();
const newExecuteAtIso = new Date(Date.now() + 5000).toISOString();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

async function loadEligible(limit = 2000) {
  let query = supabase
    .from('pending_ai_responses')
    .select('id, conversation_id, user_id, contact_number, execute_at, status, updated_at', { count: 'exact' })
    .eq('status', 'pending')
    .lte('execute_at', thresholdIso)
    .order('execute_at', { ascending: true })
    .limit(limit);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const result = await query;
  if (result.error) {
    throw result.error;
  }

  return {
    rows: result.data || [],
    count: result.count || 0,
  };
}

async function applyUnfreeze() {
  let query = supabase
    .from('pending_ai_responses')
    .update({
      execute_at: newExecuteAtIso,
      updated_at: nowIso,
    })
    .eq('status', 'pending')
    .lte('execute_at', thresholdIso)
    .select('id', { count: 'exact' });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const result = await query;
  if (result.error) {
    throw result.error;
  }

  return {
    updatedCount: result.count || (result.data?.length || 0),
    sampleIds: (result.data || []).slice(0, 10).map((r) => r.id),
  };
}

async function main() {
  console.log('=== WA Pending Timers Unfreeze ===');
  console.log(`Mode: ${MODE}`);
  console.log(`Eligible filter: status='pending' AND execute_at <= ${thresholdIso} (now-5m)`);
  if (userId) {
    console.log(`User filter: user_id='${userId}'`);
  }

  const { rows, count } = await loadEligible();
  console.log(`Eligible rows: ${count}`);

  if (rows.length > 0) {
    console.log('Sample rows:');
    for (const row of rows.slice(0, 10)) {
      console.log(`- id=${row.id} conv=${row.conversation_id} user=${row.user_id} execute_at=${row.execute_at}`);
    }
  }

  if (dryRun) {
    console.log('Dry-run complete. No rows were changed.');
    return;
  }

  if (count === 0) {
    console.log('Nothing to update.');
    return;
  }

  console.log(`Applying update: execute_at=${newExecuteAtIso}, updated_at=${nowIso}`);
  const { updatedCount, sampleIds } = await applyUnfreeze();
  console.log(`Updated rows: ${updatedCount}`);
  if (sampleIds.length > 0) {
    console.log(`Updated sample IDs: ${sampleIds.join(', ')}`);
  }
  console.log('Apply complete.');
}

main().catch((error) => {
  console.error('Unfreeze failed:', error);
  process.exit(1);
});
