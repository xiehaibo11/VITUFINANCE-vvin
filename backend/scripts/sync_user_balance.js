/**
 * User Balance Sync Script
 * 
 * Recalculates and synchronizes user balance based on all transactions.
 * This script ensures the usdt_balance matches the sum of all income/expense records.
 * 
 * Formula:
 * Balance = Deposits - Withdrawals - Robot_Costs + Robot_Profits + Referral_Rewards + Team_Rewards + Manual_Added
 * 
 * Usage:
 *   node scripts/sync_user_balance.js [wallet_suffix] [--fix]
 *   node scripts/sync_user_balance.js 63a506fa --fix
 * 
 * Options:
 *   --fix    Actually apply the fix (without this, only shows what would change)
 */

import { query as dbQuery } from '../db.js';

// Get command line arguments
const args = process.argv.slice(2);
const walletSuffix = args.find(arg => !arg.startsWith('--')) || null;
const shouldFix = args.includes('--fix');

console.log('=====================================');
console.log('🔄 User Balance Sync Tool');
console.log('=====================================');
console.log(`Mode: ${shouldFix ? '⚠️  FIX MODE (will update database)' : '🔍 CHECK MODE (dry run)'}`);
if (walletSuffix) {
    console.log(`Target: Wallet ending with ${walletSuffix}`);
} else {
    console.log('Target: ALL users');
}
console.log('');

async function syncUserBalance() {
    try {
        // Build WHERE clause for targeting specific user(s)
        let whereClause = '';
        let params = [];
        
        if (walletSuffix) {
            whereClause = 'WHERE LOWER(wallet_address) LIKE ?';
            params.push(`%${walletSuffix.toLowerCase()}`);
        }
        
        // Get all users to check
        const users = await dbQuery(`
            SELECT 
                wallet_address,
                usdt_balance,
                wld_balance,
                total_deposit,
                total_withdraw,
                manual_added_balance
            FROM user_balances 
            ${whereClause}
            ORDER BY updated_at DESC
        `, params);
        
        console.log(`📊 Found ${users.length} user(s) to check\n`);
        
        if (users.length === 0) {
            console.log('❌ No users found matching criteria');
            return;
        }
        
        let fixedCount = 0;
        let errorCount = 0;
        
        for (const user of users) {
            const wallet = user.wallet_address;
            const walletLower = wallet.toLowerCase();
            
            console.log('───────────────────────────────────────');
            console.log(`👤 ${wallet.slice(0, 10)}...${wallet.slice(-8)}`);
            
            // Calculate all income sources
            
            // 1. Completed deposits
            const depositResult = await dbQuery(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM deposit_records 
                WHERE LOWER(wallet_address) = ? AND status = 'completed'
            `, [walletLower]);
            const totalDeposits = parseFloat(depositResult[0]?.total) || 0;
            
            // 2. Completed withdrawals
            const withdrawResult = await dbQuery(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM withdraw_records 
                WHERE LOWER(wallet_address) = ? AND status = 'completed'
            `, [walletLower]);
            const totalWithdrawals = parseFloat(withdrawResult[0]?.total) || 0;
            
            // 3. Robot purchases (all robots, active + expired)
            const robotResult = await dbQuery(`
                SELECT 
                    COALESCE(SUM(price), 0) as total_cost,
                    COALESCE(SUM(total_profit), 0) as total_profit
                FROM robot_purchases 
                WHERE LOWER(wallet_address) = ?
            `, [walletLower]);
            const totalRobotCost = parseFloat(robotResult[0]?.total_cost) || 0;
            const totalRobotProfit = parseFloat(robotResult[0]?.total_profit) || 0;
            
            // 4. Referral rewards
            const referralResult = await dbQuery(`
                SELECT COALESCE(SUM(reward_amount), 0) as total
                FROM referral_rewards 
                WHERE LOWER(wallet_address) = ?
            `, [walletLower]);
            const totalReferralReward = parseFloat(referralResult[0]?.total) || 0;
            
            // 5. Team rewards
            const teamResult = await dbQuery(`
                SELECT COALESCE(SUM(reward_amount), 0) as total
                FROM team_rewards 
                WHERE LOWER(wallet_address) = ?
            `, [walletLower]);
            const totalTeamReward = parseFloat(teamResult[0]?.total) || 0;
            
            // 6. Manual added balance (from admin operations)
            const manualAdded = parseFloat(user.manual_added_balance) || 0;
            
            // 7. Lucky wheel rewards (if table exists)
            let totalLuckyReward = 0;
            try {
                const luckyResult = await dbQuery(`
                    SELECT COALESCE(SUM(reward_amount), 0) as total
                    FROM lucky_wheel_records 
                    WHERE LOWER(wallet_address) = ? AND reward_type = 'usdt'
                `, [walletLower]);
                totalLuckyReward = parseFloat(luckyResult[0]?.total) || 0;
            } catch (e) {
                // Table may not exist
            }
            
            // Calculate expected balance
            const expectedBalance = 
                totalDeposits 
                - totalWithdrawals 
                - totalRobotCost 
                + totalRobotProfit 
                + totalReferralReward 
                + totalTeamReward 
                + manualAdded
                + totalLuckyReward;
            
            const currentBalance = parseFloat(user.usdt_balance);
            const difference = currentBalance - expectedBalance;
            
            // Display calculation breakdown
            console.log(`\n   📥 Income:`);
            console.log(`      Deposits:       +${totalDeposits.toFixed(4)}`);
            console.log(`      Robot Profit:   +${totalRobotProfit.toFixed(4)}`);
            console.log(`      Referral:       +${totalReferralReward.toFixed(4)}`);
            console.log(`      Team Reward:    +${totalTeamReward.toFixed(4)}`);
            console.log(`      Manual Added:   +${manualAdded.toFixed(4)}`);
            console.log(`      Lucky Wheel:    +${totalLuckyReward.toFixed(4)}`);
            console.log(`\n   📤 Expense:`);
            console.log(`      Withdrawals:    -${totalWithdrawals.toFixed(4)}`);
            console.log(`      Robot Cost:     -${totalRobotCost.toFixed(4)}`);
            console.log(`\n   📊 Result:`);
            console.log(`      Expected: ${expectedBalance.toFixed(4)} USDT`);
            console.log(`      Actual:   ${currentBalance.toFixed(4)} USDT`);
            console.log(`      Diff:     ${difference.toFixed(4)} USDT`);
            
            // Check if fix is needed
            if (Math.abs(difference) > 0.0001) {
                if (expectedBalance < 0) {
                    console.log(`\n   ⚠️  WARNING: Expected balance is negative!`);
                    console.log(`   This indicates missing income records.`);
                    
                    // If there's a significant unexplained balance, record it as manual_added
                    if (shouldFix && currentBalance > 0) {
                        const missingAmount = currentBalance - expectedBalance;
                        console.log(`   🔧 Recording ${missingAmount.toFixed(4)} as manual_added_balance`);
                        
                        await dbQuery(`
                            UPDATE user_balances 
                            SET manual_added_balance = ?,
                                updated_at = NOW()
                            WHERE wallet_address = ?
                        `, [missingAmount, wallet]);
                        
                        fixedCount++;
                        console.log(`   ✅ Fixed: manual_added_balance updated`);
                    }
                } else if (shouldFix) {
                    // Update balance to expected value
                    console.log(`\n   🔧 Fixing balance: ${currentBalance.toFixed(4)} → ${expectedBalance.toFixed(4)}`);
                    
                    await dbQuery(`
                        UPDATE user_balances 
                        SET usdt_balance = ?,
                            updated_at = NOW()
                        WHERE wallet_address = ?
                    `, [expectedBalance, wallet]);
                    
                    fixedCount++;
                    console.log(`   ✅ Balance updated!`);
                } else {
                    console.log(`\n   ⚠️  MISMATCH - Run with --fix to correct`);
                    errorCount++;
                }
            } else {
                console.log(`\n   ✅ Balance is correct`);
            }
            
            // Also verify total_deposit field
            const storedTotalDeposit = parseFloat(user.total_deposit) || 0;
            if (Math.abs(storedTotalDeposit - totalDeposits) > 0.0001) {
                console.log(`\n   📌 Note: total_deposit field mismatch`);
                console.log(`      Stored: ${storedTotalDeposit.toFixed(4)}`);
                console.log(`      Calculated: ${totalDeposits.toFixed(4)}`);
                
                if (shouldFix) {
                    await dbQuery(`
                        UPDATE user_balances 
                        SET total_deposit = ?
                        WHERE wallet_address = ?
                    `, [totalDeposits, wallet]);
                    console.log(`      ✅ total_deposit corrected`);
                }
            }
            
            // Verify total_withdraw field
            const storedTotalWithdraw = parseFloat(user.total_withdraw) || 0;
            if (Math.abs(storedTotalWithdraw - totalWithdrawals) > 0.0001) {
                console.log(`\n   📌 Note: total_withdraw field mismatch`);
                console.log(`      Stored: ${storedTotalWithdraw.toFixed(4)}`);
                console.log(`      Calculated: ${totalWithdrawals.toFixed(4)}`);
                
                if (shouldFix) {
                    await dbQuery(`
                        UPDATE user_balances 
                        SET total_withdraw = ?
                        WHERE wallet_address = ?
                    `, [totalWithdrawals, wallet]);
                    console.log(`      ✅ total_withdraw corrected`);
                }
            }
        }
        
        console.log('\n───────────────────────────────────────');
        console.log('\n📈 Summary:');
        console.log(`   Checked: ${users.length} user(s)`);
        console.log(`   Fixed: ${fixedCount}`);
        console.log(`   Errors: ${errorCount}`);
        
        if (!shouldFix && errorCount > 0) {
            console.log(`\n💡 To apply fixes, run: node scripts/sync_user_balance.js ${walletSuffix || ''} --fix`);
        }
        
        console.log('\n=====================================');
        console.log('✅ Sync Complete');
        console.log('=====================================');
        
    } catch (error) {
        console.error('❌ Sync failed:', error);
        throw error;
    }
}

// Run sync
syncUserBalance()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });

