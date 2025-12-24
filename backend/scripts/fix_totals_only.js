/**
 * Totals-only Consistency Fix Script (SAFE MODE)
 *
 * What it does:
 * - Fixes ONLY user_balances.total_deposit and user_balances.total_withdraw
 *   based on completed deposit_records / withdraw_records.
 *
 * What it does NOT do:
 * - Does NOT change user_balances.usdt_balance
 * - Does NOT change manual_added_balance
 *
 * Outputs:
 * - Prints mismatches and applied fixes to stdout
 * - Writes a "balance anomaly" list (expected vs actual) to /tmp
 *
 * Usage:
 * - Dry-run: node scripts/fix_totals_only.js
 * - Apply:   node scripts/fix_totals_only.js --fix
 *
 * Notes:
 * - Comments must be English (project rule).
 * - Keep this file < 600 lines (project rule).
 */

import fs from 'fs';
import { query as dbQuery } from '../db.js';

const shouldFix = process.argv.includes('--fix');
const OUTPUT_FILE = process.env.VITU_TOTALS_AUDIT_OUT || '/tmp/vitu_totals_only_audit.txt';

/**
 * Safe parse number.
 * @param {any} v - Value.
 * @returns {number}
 */
function toNumber(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Format address for logs.
 * @param {string} addr - Wallet address.
 * @returns {string}
 */
function shortAddr(addr) {
  const s = String(addr || '');
  if (s.length <= 16) return s;
  return `${s.slice(0, 10)}...${s.slice(-8)}`;
}

/**
 * Compare floats with tolerance.
 * @param {number} a - Number A.
 * @param {number} b - Number B.
 * @param {number} eps - Tolerance.
 * @returns {boolean}
 */
function isDiff(a, b, eps = 0.01) {
  return Math.abs(a - b) > eps;
}

async function main() {
  console.log('=====================================');
  console.log('🔧 Totals-only Consistency Fix');
  console.log('=====================================');
  console.log(`Mode: ${shouldFix ? '⚠️  FIX MODE (totals only)' : '🔍 CHECK MODE (dry run)'}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log('');

  const stats = {
    users_checked: 0,
    total_deposit_fixed: 0,
    total_withdraw_fixed: 0,
    anomalies: 0,
    errors: 0
  };

  const lines = [];
  lines.push(`[TotalsOnly] ${new Date().toISOString()}`);
  lines.push(`Mode=${shouldFix ? 'fix' : 'dry-run'}`);
  lines.push('');

  // Get all users once.
  const users = await dbQuery(
    `SELECT wallet_address, usdt_balance, total_deposit, total_withdraw, manual_added_balance
     FROM user_balances
     ORDER BY created_at DESC`
  );

  stats.users_checked = users.length;
  console.log(`📊 Found ${users.length} users to check\n`);

  for (const user of users) {
    const wallet = String(user.wallet_address || '').toLowerCase();

    try {
      // Calculate completed totals from records.
      const depositResult = await dbQuery(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM deposit_records
         WHERE LOWER(wallet_address) = ? AND status = 'completed'`,
        [wallet]
      );
      const calcDeposits = toNumber(depositResult?.[0]?.total);

      const withdrawResult = await dbQuery(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM withdraw_records
         WHERE LOWER(wallet_address) = ? AND status = 'completed'`,
        [wallet]
      );
      const calcWithdrawals = toNumber(withdrawResult?.[0]?.total);

      const storedDeposit = toNumber(user.total_deposit);
      const storedWithdraw = toNumber(user.total_withdraw);

      let fixedDeposit = false;
      let fixedWithdraw = false;

      if (isDiff(storedDeposit, calcDeposits)) {
        console.log(`⚠️  ${shortAddr(wallet)} total_deposit mismatch: stored ${storedDeposit.toFixed(4)} vs calc ${calcDeposits.toFixed(4)}`);
        if (shouldFix) {
          await dbQuery('UPDATE user_balances SET total_deposit = ?, updated_at = NOW() WHERE wallet_address = ?', [
            calcDeposits,
            wallet
          ]);
          stats.total_deposit_fixed += 1;
          fixedDeposit = true;
          console.log('   ✅ total_deposit fixed');
        }
      }

      if (isDiff(storedWithdraw, calcWithdrawals)) {
        console.log(`⚠️  ${shortAddr(wallet)} total_withdraw mismatch: stored ${storedWithdraw.toFixed(4)} vs calc ${calcWithdrawals.toFixed(4)}`);
        if (shouldFix) {
          await dbQuery('UPDATE user_balances SET total_withdraw = ?, updated_at = NOW() WHERE wallet_address = ?', [
            calcWithdrawals,
            wallet
          ]);
          stats.total_withdraw_fixed += 1;
          fixedWithdraw = true;
          console.log('   ✅ total_withdraw fixed');
        }
      }

      // Produce "balance anomaly list" (no writes).
      // We intentionally DO NOT fix balances here; we only report.
      // Expected formula aligns with internal scripts (baseline reconciliation):
      // expected = deposits - withdrawals + manual_added_balance (no robot/rewards here to keep it conservative).
      // If you want a full ledger formula, we will use the balance-details endpoint for manual confirmation.
      const actualUsdt = toNumber(user.usdt_balance);
      const manualAdded = toNumber(user.manual_added_balance);
      const expectedBaseline = calcDeposits - calcWithdrawals + manualAdded;
      const diff = actualUsdt - expectedBaseline;

      // Mark as anomaly if the baseline diff is large.
      if (Math.abs(diff) > 0.01) {
        stats.anomalies += 1;
        lines.push(
          [
            wallet,
            `actual_usdt=${actualUsdt.toFixed(4)}`,
            `baseline_expected=${expectedBaseline.toFixed(4)}`,
            `diff=${diff.toFixed(4)}`,
            `calcDeposits=${calcDeposits.toFixed(4)}`,
            `calcWithdrawals=${calcWithdrawals.toFixed(4)}`,
            `manualAdded=${manualAdded.toFixed(4)}`,
            `fixedDeposit=${fixedDeposit}`,
            `fixedWithdraw=${fixedWithdraw}`
          ].join('\t')
        );
      }
    } catch (e) {
      stats.errors += 1;
      console.error(`❌ Error processing ${shortAddr(wallet)}:`, e?.message || e);
    }
  }

  lines.push('');
  lines.push(`Summary users_checked=${stats.users_checked} total_deposit_fixed=${stats.total_deposit_fixed} total_withdraw_fixed=${stats.total_withdraw_fixed} anomalies=${stats.anomalies} errors=${stats.errors}`);

  try {
    fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf-8');
  } catch (e) {
    console.error('❌ Failed to write output file:', e?.message || e);
  }

  console.log('\n───────────────────────────────────────');
  console.log('📈 Summary:');
  console.log(`   Users checked:        ${stats.users_checked}`);
  console.log(`   total_deposit fixed:  ${stats.total_deposit_fixed}`);
  console.log(`   total_withdraw fixed: ${stats.total_withdraw_fixed}`);
  console.log(`   anomalies reported:   ${stats.anomalies}`);
  console.log(`   errors:               ${stats.errors}`);
  console.log('=====================================');
  console.log('✅ Totals-only run complete');
  console.log('=====================================');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Totals-only script failed:', e?.message || e);
    process.exit(1);
  });


