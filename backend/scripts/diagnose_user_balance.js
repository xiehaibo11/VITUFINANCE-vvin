/**
 * User Balance Diagnostic Script
 * 
 * Diagnoses balance inconsistency issues for a specific user
 * Checks for:
 * 1. Duplicate wallet addresses (different case)
 * 2. Balance calculation correctness
 * 3. Missing/orphan records
 * 
 * Usage: node scripts/diagnose_user_balance.js [wallet_suffix]
 * Example: node scripts/diagnose_user_balance.js 63a506fa
 */

import { query as dbQuery } from '../db.js';

// Get wallet suffix from command line argument
const walletSuffix = process.argv[2] || '63a506fa';

console.log('=====================================');
console.log('🔍 User Balance Diagnostic Tool');
console.log('=====================================');
console.log(`Searching for wallet ending with: ${walletSuffix}`);
console.log('');

async function diagnoseUserBalance() {
    try {
        // 1. Find all matching wallet addresses (case-insensitive)
        console.log('📋 Step 1: Finding matching wallet addresses...');
        const matchingUsers = await dbQuery(`
            SELECT 
                wallet_address,
                usdt_balance,
                wld_balance,
                total_deposit,
                total_withdraw,
                manual_added_balance,
                created_at,
                updated_at
            FROM user_balances 
            WHERE LOWER(wallet_address) LIKE ?
            ORDER BY created_at
        `, [`%${walletSuffix.toLowerCase()}`]);
        
        console.log(`Found ${matchingUsers.length} matching record(s):\n`);
        
        if (matchingUsers.length === 0) {
            console.log('❌ No users found with this wallet suffix.');
            return;
        }
        
        // Display each matching record
        for (const user of matchingUsers) {
            console.log('───────────────────────────────────────');
            console.log(`📍 Wallet: ${user.wallet_address}`);
            console.log(`   USDT Balance: ${parseFloat(user.usdt_balance).toFixed(4)}`);
            console.log(`   WLD Balance: ${parseFloat(user.wld_balance).toFixed(4)}`);
            console.log(`   Total Deposit: ${parseFloat(user.total_deposit).toFixed(4)}`);
            console.log(`   Total Withdraw: ${parseFloat(user.total_withdraw).toFixed(4)}`);
            console.log(`   Manual Added: ${parseFloat(user.manual_added_balance || 0).toFixed(4)}`);
            console.log(`   Created: ${user.created_at}`);
            console.log(`   Updated: ${user.updated_at}`);
        }
        
        // Check for duplicate addresses (same address different case)
        if (matchingUsers.length > 1) {
            console.log('\n⚠️  WARNING: Multiple records found!');
            console.log('This could indicate duplicate wallet addresses with different case.');
        }
        
        // 2. For each user, calculate expected balance
        console.log('\n📋 Step 2: Verifying balance calculations...\n');
        
        for (const user of matchingUsers) {
            const wallet = user.wallet_address;
            const walletLower = wallet.toLowerCase();
            
            // Get all deposits (both exact and lowercase match)
            const deposits = await dbQuery(`
                SELECT id, amount, status, tx_hash, created_at
                FROM deposit_records 
                WHERE LOWER(wallet_address) = ?
                ORDER BY created_at
            `, [walletLower]);
            
            const completedDeposits = deposits.filter(d => d.status === 'completed');
            const totalDeposits = completedDeposits.reduce((sum, d) => sum + parseFloat(d.amount), 0);
            
            // Get all withdrawals
            const withdrawals = await dbQuery(`
                SELECT id, amount, status, created_at
                FROM withdraw_records 
                WHERE LOWER(wallet_address) = ?
                ORDER BY created_at
            `, [walletLower]);
            
            const completedWithdrawals = withdrawals.filter(w => w.status === 'completed');
            const totalWithdrawals = completedWithdrawals.reduce((sum, w) => sum + parseFloat(w.amount), 0);
            
            // Get robot purchases
            const robots = await dbQuery(`
                SELECT id, robot_name, price, total_profit, status, created_at, end_time
                FROM robot_purchases 
                WHERE LOWER(wallet_address) = ?
                ORDER BY created_at
            `, [walletLower]);
            
            const activeRobots = robots.filter(r => r.status === 'active');
            const expiredRobots = robots.filter(r => r.status === 'expired');
            const totalRobotCost = robots.reduce((sum, r) => sum + parseFloat(r.price), 0);
            const totalRobotProfit = robots.reduce((sum, r) => sum + parseFloat(r.total_profit), 0);
            
            // Get referral rewards
            const referralRewards = await dbQuery(`
                SELECT COALESCE(SUM(reward_amount), 0) as total
                FROM referral_rewards 
                WHERE LOWER(wallet_address) = ?
            `, [walletLower]);
            const totalReferralReward = parseFloat(referralRewards[0]?.total) || 0;
            
            // Get team rewards
            const teamRewards = await dbQuery(`
                SELECT COALESCE(SUM(reward_amount), 0) as total
                FROM team_rewards 
                WHERE LOWER(wallet_address) = ?
            `, [walletLower]);
            const totalTeamReward = parseFloat(teamRewards[0]?.total) || 0;
            
            // Get exchange records (WLD -> USDT, USDT -> WLD) - table may not exist
            let exchanges = [];
            let exchangeUsdtIn = 0;
            let exchangeUsdtOut = 0;
            try {
                exchanges = await dbQuery(`
                    SELECT from_currency, to_currency, from_amount, to_amount, created_at
                    FROM exchange_records 
                    WHERE LOWER(wallet_address) = ?
                    ORDER BY created_at
                `, [walletLower]);
                
                for (const ex of exchanges) {
                    if (ex.to_currency === 'USDT') {
                        exchangeUsdtIn += parseFloat(ex.to_amount);
                    }
                    if (ex.from_currency === 'USDT') {
                        exchangeUsdtOut += parseFloat(ex.from_amount);
                    }
                }
            } catch (e) {
                // Table may not exist, ignore
                console.log('   (exchange_records table not found, skipping)');
            }
            
            // Get daily checkin WLD rewards - table may not exist
            let totalCheckinWld = 0;
            try {
                const checkins = await dbQuery(`
                    SELECT COALESCE(SUM(reward_amount), 0) as total
                    FROM daily_checkin 
                    WHERE LOWER(wallet_address) = ?
                `, [walletLower]);
                totalCheckinWld = parseFloat(checkins[0]?.total) || 0;
            } catch (e) {
                // Table may not exist
            }
            
            // Calculate expected balance
            const manualAdded = parseFloat(user.manual_added_balance || 0);
            const expectedUsdtBalance = 
                totalDeposits 
                - totalWithdrawals 
                - totalRobotCost 
                + totalRobotProfit 
                + totalReferralReward 
                + totalTeamReward 
                + manualAdded
                + exchangeUsdtIn
                - exchangeUsdtOut;
            
            const actualBalance = parseFloat(user.usdt_balance);
            const difference = actualBalance - expectedUsdtBalance;
            
            console.log('───────────────────────────────────────');
            console.log(`🔍 Balance Analysis for: ${wallet.slice(0, 10)}...${wallet.slice(-8)}`);
            console.log('');
            console.log('📥 Income:');
            console.log(`   Deposits: ${totalDeposits.toFixed(4)} USDT (${completedDeposits.length} completed)`);
            console.log(`   Robot Profits: ${totalRobotProfit.toFixed(4)} USDT`);
            console.log(`   Referral Rewards: ${totalReferralReward.toFixed(4)} USDT`);
            console.log(`   Team Rewards: ${totalTeamReward.toFixed(4)} USDT`);
            console.log(`   Manual Added: ${manualAdded.toFixed(4)} USDT`);
            console.log(`   Exchange In (WLD→USDT): ${exchangeUsdtIn.toFixed(4)} USDT`);
            console.log('');
            console.log('📤 Outgoing:');
            console.log(`   Withdrawals: ${totalWithdrawals.toFixed(4)} USDT (${completedWithdrawals.length} completed)`);
            console.log(`   Robot Purchases: ${totalRobotCost.toFixed(4)} USDT (${robots.length} robots)`);
            console.log(`   Exchange Out (USDT→WLD): ${exchangeUsdtOut.toFixed(4)} USDT`);
            console.log('');
            console.log('📊 Result:');
            console.log(`   Expected Balance: ${expectedUsdtBalance.toFixed(4)} USDT`);
            console.log(`   Actual Balance: ${actualBalance.toFixed(4)} USDT`);
            console.log(`   Difference: ${difference.toFixed(4)} USDT`);
            
            if (Math.abs(difference) > 0.01) {
                console.log(`   ⚠️  MISMATCH DETECTED!`);
            } else {
                console.log(`   ✅ Balance is correct`);
            }
            
            // 3. Show detailed records
            console.log('\n📋 Detailed Records:');
            
            if (deposits.length > 0) {
                console.log('\n   Deposit Records:');
                for (const d of deposits) {
                    console.log(`   - ${parseFloat(d.amount).toFixed(4)} USDT | Status: ${d.status} | ${d.created_at}`);
                }
            }
            
            if (withdrawals.length > 0) {
                console.log('\n   Withdrawal Records:');
                for (const w of withdrawals) {
                    console.log(`   - ${parseFloat(w.amount).toFixed(4)} USDT | Status: ${w.status} | ${w.created_at}`);
                }
            }
            
            if (robots.length > 0) {
                console.log('\n   Robot Purchases:');
                for (const r of robots) {
                    console.log(`   - ${r.robot_name} | Cost: ${parseFloat(r.price).toFixed(4)} | Profit: ${parseFloat(r.total_profit).toFixed(4)} | Status: ${r.status}`);
                }
            }
            
            if (exchanges.length > 0) {
                console.log('\n   Exchange Records:');
                for (const e of exchanges) {
                    console.log(`   - ${parseFloat(e.from_amount).toFixed(4)} ${e.from_currency} → ${parseFloat(e.to_amount).toFixed(4)} ${e.to_currency}`);
                }
            }
        }
        
        // 3. Check for case-sensitive duplicates globally
        console.log('\n\n📋 Step 3: Checking for global address case issues...');
        const caseIssues = await dbQuery(`
            SELECT 
                LOWER(wallet_address) as normalized,
                COUNT(*) as count,
                GROUP_CONCAT(wallet_address) as addresses
            FROM user_balances
            GROUP BY LOWER(wallet_address)
            HAVING COUNT(*) > 1
        `);
        
        if (caseIssues.length > 0) {
            console.log(`\n⚠️  Found ${caseIssues.length} wallet addresses with case duplicates!`);
            for (const issue of caseIssues) {
                console.log(`   - ${issue.addresses} (${issue.count} records)`);
            }
        } else {
            console.log('\n✅ No duplicate addresses found (case issue).');
        }
        
        console.log('\n=====================================');
        console.log('🎉 Diagnosis Complete');
        console.log('=====================================');
        
    } catch (error) {
        console.error('❌ Diagnosis failed:', error);
        throw error;
    }
}

// Run diagnosis
diagnoseUserBalance()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });

