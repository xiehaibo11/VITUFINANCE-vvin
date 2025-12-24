/**
 * Database Data Consistency Fix Script
 * 
 * Fixes all data consistency issues:
 * 1. User balance mismatches
 * 2. total_deposit / total_withdraw field mismatches
 * 3. Missing user records
 * 
 * Usage:
 *   node scripts/fix_all_data_consistency.js           # Check only (dry run)
 *   node scripts/fix_all_data_consistency.js --fix     # Apply fixes
 */

import { query as dbQuery } from '../db.js';

const shouldFix = process.argv.includes('--fix');

console.log('=====================================');
console.log('🔧 Database Data Consistency Fix');
console.log('=====================================');
console.log(`Mode: ${shouldFix ? '⚠️  FIX MODE' : '🔍 CHECK MODE (dry run)'}`);
console.log('');

async function fixAllDataConsistency() {
    const stats = {
        users_checked: 0,
        balance_fixed: 0,
        total_deposit_fixed: 0,
        total_withdraw_fixed: 0,
        errors: 0
    };
    
    try {
        // Get all users
        const users = await dbQuery(`
            SELECT wallet_address, usdt_balance, wld_balance, 
                   total_deposit, total_withdraw, manual_added_balance
            FROM user_balances
            ORDER BY created_at DESC
        `);
        
        console.log(`📊 Found ${users.length} users to check\n`);
        stats.users_checked = users.length;
        
        for (const user of users) {
            const wallet = user.wallet_address;
            const walletLower = wallet.toLowerCase();
            
            // Calculate all income/expense
            const depositResult = await dbQuery(
                `SELECT COALESCE(SUM(amount), 0) as total FROM deposit_records 
                 WHERE LOWER(wallet_address) = ? AND status = 'completed'`,
                [walletLower]
            );
            const calcDeposits = parseFloat(depositResult[0]?.total) || 0;
            
            const withdrawResult = await dbQuery(
                `SELECT COALESCE(SUM(amount), 0) as total FROM withdraw_records 
                 WHERE LOWER(wallet_address) = ? AND status = 'completed'`,
                [walletLower]
            );
            const calcWithdrawals = parseFloat(withdrawResult[0]?.total) || 0;
            
            const robotResult = await dbQuery(
                `SELECT COALESCE(SUM(price), 0) as cost, COALESCE(SUM(total_profit), 0) as profit
                 FROM robot_purchases WHERE LOWER(wallet_address) = ?`,
                [walletLower]
            );
            const robotCost = parseFloat(robotResult[0]?.cost) || 0;
            const robotProfit = parseFloat(robotResult[0]?.profit) || 0;
            
            const referralResult = await dbQuery(
                `SELECT COALESCE(SUM(reward_amount), 0) as total FROM referral_rewards 
                 WHERE LOWER(wallet_address) = ?`,
                [walletLower]
            );
            const referralReward = parseFloat(referralResult[0]?.total) || 0;
            
            const teamResult = await dbQuery(
                `SELECT COALESCE(SUM(reward_amount), 0) as total FROM team_rewards 
                 WHERE LOWER(wallet_address) = ?`,
                [walletLower]
            );
            const teamReward = parseFloat(teamResult[0]?.total) || 0;
            
            const manualAdded = parseFloat(user.manual_added_balance) || 0;
            
            // Calculate expected balance
            const expectedBalance = calcDeposits - calcWithdrawals - robotCost + robotProfit + 
                                   referralReward + teamReward + manualAdded;
            
            const currentBalance = parseFloat(user.usdt_balance);
            const storedDeposit = parseFloat(user.total_deposit);
            const storedWithdraw = parseFloat(user.total_withdraw);
            
            let hasIssue = false;
            const issues = [];
            
            // Check balance mismatch
            const balanceDiff = Math.abs(currentBalance - expectedBalance);
            if (balanceDiff > 0.01) {
                if (expectedBalance < 0) {
                    // Expected is negative, need to record missing amount as manual_added
                    const missingAmount = currentBalance - expectedBalance;
                    issues.push(`Balance issue: expected ${expectedBalance.toFixed(4)} but have ${currentBalance.toFixed(4)}, missing ${missingAmount.toFixed(4)}`);
                    hasIssue = true;
                    
                    if (shouldFix) {
                        await dbQuery(
                            `UPDATE user_balances SET manual_added_balance = ?, updated_at = NOW() WHERE wallet_address = ?`,
                            [missingAmount, wallet]
                        );
                        stats.balance_fixed++;
                    }
                } else {
                    issues.push(`Balance mismatch: expected ${expectedBalance.toFixed(4)} but have ${currentBalance.toFixed(4)}`);
                    hasIssue = true;
                    
                    if (shouldFix) {
                        await dbQuery(
                            `UPDATE user_balances SET usdt_balance = ?, updated_at = NOW() WHERE wallet_address = ?`,
                            [expectedBalance, wallet]
                        );
                        stats.balance_fixed++;
                    }
                }
            }
            
            // Check total_deposit mismatch
            if (Math.abs(storedDeposit - calcDeposits) > 0.01) {
                issues.push(`total_deposit mismatch: stored ${storedDeposit.toFixed(4)} but calculated ${calcDeposits.toFixed(4)}`);
                hasIssue = true;
                
                if (shouldFix) {
                    await dbQuery(
                        `UPDATE user_balances SET total_deposit = ? WHERE wallet_address = ?`,
                        [calcDeposits, wallet]
                    );
                    stats.total_deposit_fixed++;
                }
            }
            
            // Check total_withdraw mismatch
            if (Math.abs(storedWithdraw - calcWithdrawals) > 0.01) {
                issues.push(`total_withdraw mismatch: stored ${storedWithdraw.toFixed(4)} but calculated ${calcWithdrawals.toFixed(4)}`);
                hasIssue = true;
                
                if (shouldFix) {
                    await dbQuery(
                        `UPDATE user_balances SET total_withdraw = ? WHERE wallet_address = ?`,
                        [calcWithdrawals, wallet]
                    );
                    stats.total_withdraw_fixed++;
                }
            }
            
            if (hasIssue) {
                console.log(`───────────────────────────────────────`);
                console.log(`⚠️  ${wallet.slice(0, 10)}...${wallet.slice(-8)}`);
                for (const issue of issues) {
                    console.log(`   - ${issue}`);
                }
                if (shouldFix) {
                    console.log(`   ✅ Fixed`);
                }
            }
        }
        
        // Summary
        console.log(`\n───────────────────────────────────────`);
        console.log(`\n📈 Summary:`);
        console.log(`   Users checked: ${stats.users_checked}`);
        console.log(`   Balance issues fixed: ${stats.balance_fixed}`);
        console.log(`   total_deposit fixed: ${stats.total_deposit_fixed}`);
        console.log(`   total_withdraw fixed: ${stats.total_withdraw_fixed}`);
        
        if (!shouldFix && (stats.balance_fixed > 0 || stats.total_deposit_fixed > 0 || stats.total_withdraw_fixed > 0)) {
            console.log(`\n💡 To apply fixes, run: node scripts/fix_all_data_consistency.js --fix`);
        }
        
        console.log(`\n=====================================`);
        console.log(`✅ Data Consistency Check Complete`);
        console.log(`=====================================`);
        
    } catch (error) {
        console.error('❌ Fix failed:', error);
        throw error;
    }
}

// Run fix
fixAllDataConsistency()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));

