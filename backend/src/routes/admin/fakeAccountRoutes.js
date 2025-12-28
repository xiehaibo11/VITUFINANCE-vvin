/**
 * Admin Routes - Fake Account Management
 * 
 * Features:
 * - Detect fake accounts (users with no deposits)
 * - Clean fake accounts
 * - Cleanup recovery
 * - Zero balance account management
 */
import express from 'express';
import { dbQuery, secureLog, authMiddleware } from './shared.js';

const router = express.Router();

/**
 * GET /fake-accounts
 * Detect fake accounts (users with no deposit records)
 * 
 * Safety: Excludes accounts with admin balance operations or robot purchases
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, minBalance = 0, sortBy = 'created_at', sortOrder = 'DESC', includeAdminOps = 'false' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const minBal = parseFloat(minBalance) || 0;
    const showAdminOps = includeAdminOps === 'true';

    // Build exclusion conditions for safety
    const adminOpsCondition = showAdminOps ? '' : `
        AND NOT EXISTS (
          SELECT 1 FROM admin_operation_logs aol 
          WHERE aol.operation_target = ub.wallet_address 
          AND aol.operation_type = 'balance_update'
        )
        AND NOT EXISTS (
          SELECT 1 FROM robot_purchases rp
          WHERE rp.wallet_address = ub.wallet_address
        )`;

    // Get total count
    const countResult = await dbQuery(`
      SELECT COUNT(*) as total FROM user_balances ub
      WHERE ub.total_deposit = 0 
        AND (ub.usdt_balance > ? OR ub.wld_balance > 0 OR ub.total_profit > 0)
        AND NOT EXISTS (
          SELECT 1 FROM deposit_records dr 
          WHERE dr.wallet_address = ub.wallet_address AND dr.status = 'completed'
        )
        ${adminOpsCondition}
    `, [minBal]);
    const total = countResult[0]?.total || 0;

    // Validate sort fields
    const validSortFields = ['created_at', 'usdt_balance', 'total_profit', 'wallet_address'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get fake accounts with details
    const fakeAccounts = await dbQuery(`
      SELECT 
        ub.wallet_address,
        ub.usdt_balance,
        ub.wld_balance,
        ub.frozen_usdt,
        ub.total_deposit,
        ub.total_withdraw,
        ub.total_profit,
        ub.total_referral_reward,
        ub.is_banned,
        ub.created_at,
        ub.updated_at,
        (SELECT COUNT(*) FROM robot_purchases rp WHERE rp.wallet_address = ub.wallet_address) as robot_count,
        (SELECT COUNT(*) FROM user_pledges pr WHERE pr.wallet_address = ub.wallet_address) as pledge_count,
        (SELECT COUNT(*) FROM follow_records fr WHERE fr.wallet_address = ub.wallet_address) as follow_count,
        (SELECT COUNT(*) FROM admin_operation_logs aol WHERE aol.operation_target = ub.wallet_address AND aol.operation_type = 'balance_update') as admin_balance_ops
      FROM user_balances ub
      WHERE ub.total_deposit = 0 
        AND (ub.usdt_balance > ? OR ub.wld_balance > 0 OR ub.total_profit > 0)
        AND NOT EXISTS (
          SELECT 1 FROM deposit_records dr 
          WHERE dr.wallet_address = ub.wallet_address AND dr.status = 'completed'
        )
        ${adminOpsCondition}
      ORDER BY ${sortField} ${order}
      LIMIT ? OFFSET ?
    `, [minBal, parseInt(limit), offset]);

    // Get summary
    const summaryResult = await dbQuery(`
      SELECT 
        COUNT(*) as fake_count,
        COALESCE(SUM(usdt_balance), 0) as total_usdt,
        COALESCE(SUM(wld_balance), 0) as total_wld,
        COALESCE(SUM(total_profit), 0) as total_profit
      FROM user_balances ub
      WHERE ub.total_deposit = 0 
        AND (ub.usdt_balance > 0 OR ub.wld_balance > 0 OR ub.total_profit > 0)
        AND NOT EXISTS (
          SELECT 1 FROM deposit_records dr 
          WHERE dr.wallet_address = ub.wallet_address AND dr.status = 'completed'
        )
        ${adminOpsCondition}
    `);
    const summary = summaryResult[0] || { fake_count: 0, total_usdt: 0, total_wld: 0, total_profit: 0 };

    res.json({
      success: true,
      data: fakeAccounts,
      summary: {
        fakeAccountCount: parseInt(summary.fake_count) || 0,
        totalUSDT: parseFloat(summary.total_usdt) || 0,
        totalWLD: parseFloat(summary.total_wld) || 0,
        totalProfit: parseFloat(summary.total_profit) || 0
      },
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('[FakeAccounts] Error detecting:', error);
    res.status(500).json({ success: false, message: 'Failed to detect fake accounts' });
  }
});

/**
 * DELETE /fake-accounts/:wallet_address
 * Clean single fake account
 * 
 * Safety: Rejects accounts with admin operations unless force=true
 */
router.delete('/:wallet_address', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const { force = 'false' } = req.query;
    const walletAddr = wallet_address.toLowerCase();
    const adminUsername = req.admin?.username || 'admin';

    // Verify no deposits
    const depositCheck = await dbQuery(
      'SELECT COUNT(*) as cnt FROM deposit_records WHERE wallet_address = ? AND status = "completed"',
      [walletAddr]
    );
    if (depositCheck[0]?.cnt > 0) {
      return res.status(400).json({ success: false, message: 'This account has deposit records and cannot be cleaned' });
    }

    // Check for admin balance operations
    const adminOpsCheck = await dbQuery(
      `SELECT COUNT(*) as cnt FROM admin_operation_logs WHERE operation_target = ? AND operation_type = 'balance_update'`,
      [walletAddr]
    );
    if (adminOpsCheck[0]?.cnt > 0 && force !== 'true') {
      return res.status(400).json({ 
        success: false, 
        message: 'This account has admin balance operations. Use force=true to override.',
        adminOpsCount: adminOpsCheck[0].cnt
      });
    }

    // Check for robot purchases
    const robotCheck = await dbQuery(
      'SELECT COUNT(*) as cnt FROM robot_purchases WHERE wallet_address = ?',
      [walletAddr]
    );
    if (robotCheck[0]?.cnt > 0 && force !== 'true') {
      return res.status(400).json({ 
        success: false, 
        message: 'This account has robot purchases. Use force=true to override.',
        robotCount: robotCheck[0].cnt
      });
    }

    // Get current balance
    const currentBalance = await dbQuery('SELECT * FROM user_balances WHERE wallet_address = ?', [walletAddr]);
    if (!currentBalance || currentBalance.length === 0) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Log cleanup
    const reason = adminOpsCheck[0]?.cnt > 0 
      ? `Force cleaned - had ${adminOpsCheck[0].cnt} admin balance ops` 
      : 'No deposit records - fake account';
    await dbQuery(
      `INSERT INTO user_balances_cleanup_log (wallet_address, cleanup_type, old_balance, new_balance, reason, operator, created_at)
       VALUES (?, 'fake_account_cleanup', ?, 0, ?, ?, NOW())`,
      [walletAddr, currentBalance[0].usdt_balance, reason, adminUsername]
    );

    // Delete related records
    await dbQuery('DELETE FROM robot_purchases WHERE wallet_address = ?', [walletAddr]);
    await dbQuery('DELETE FROM user_pledges WHERE wallet_address = ?', [walletAddr]);
    await dbQuery('DELETE FROM follow_records WHERE wallet_address = ?', [walletAddr]);
    await dbQuery('DELETE FROM balance_logs WHERE wallet_address = ?', [walletAddr]);
    await dbQuery('DELETE FROM referral_relationships WHERE user_wallet = ? OR referrer_wallet = ?', [walletAddr, walletAddr]);
    await dbQuery('DELETE FROM user_balances WHERE wallet_address = ?', [walletAddr]);

    secureLog('info', `Fake account cleaned: ${walletAddr} by ${adminUsername} (force=${force})`);
    res.json({ success: true, message: 'Fake account cleaned successfully' });
  } catch (error) {
    console.error('[FakeAccounts] Error cleaning:', error);
    res.status(500).json({ success: false, message: 'Failed to clean fake account' });
  }
});

/**
 * POST /fake-accounts/batch-clean
 * Batch clean fake accounts
 */
router.post('/batch-clean', authMiddleware, async (req, res) => {
  try {
    const { wallet_addresses, force = false } = req.body;
    const adminUsername = req.admin?.username || 'admin';

    if (!wallet_addresses || !Array.isArray(wallet_addresses) || wallet_addresses.length === 0) {
      return res.status(400).json({ success: false, message: 'No wallet addresses provided' });
    }

    let cleaned = 0, skipped = 0, adminOpSkipped = 0;
    const skippedDetails = [];

    for (const addr of wallet_addresses) {
      const walletAddr = addr.toLowerCase();

      // Check deposits
      const depositCheck = await dbQuery(
        'SELECT COUNT(*) as cnt FROM deposit_records WHERE wallet_address = ? AND status = "completed"',
        [walletAddr]
      );
      if (depositCheck[0]?.cnt > 0) { 
        skipped++; 
        skippedDetails.push({ wallet: walletAddr, reason: 'has_deposits' });
        continue; 
      }

      // Check admin operations
      const adminOpsCheck = await dbQuery(
        `SELECT COUNT(*) as cnt FROM admin_operation_logs WHERE operation_target = ? AND operation_type = 'balance_update'`,
        [walletAddr]
      );
      if (adminOpsCheck[0]?.cnt > 0 && !force) { 
        adminOpSkipped++; 
        skippedDetails.push({ wallet: walletAddr, reason: 'admin_balance_ops', count: adminOpsCheck[0].cnt });
        continue; 
      }

      // Check robot purchases
      const robotCheck = await dbQuery('SELECT COUNT(*) as cnt FROM robot_purchases WHERE wallet_address = ?', [walletAddr]);
      if (robotCheck[0]?.cnt > 0 && !force) { 
        skipped++; 
        skippedDetails.push({ wallet: walletAddr, reason: 'has_robot_purchases', count: robotCheck[0].cnt });
        continue; 
      }

      // Get balance
      const balance = await dbQuery('SELECT usdt_balance FROM user_balances WHERE wallet_address = ?', [walletAddr]);
      if (!balance || balance.length === 0) { 
        skipped++; 
        skippedDetails.push({ wallet: walletAddr, reason: 'not_found' });
        continue; 
      }

      // Log and delete
      const reason = adminOpsCheck[0]?.cnt > 0 
        ? `Batch cleanup (force) - had ${adminOpsCheck[0].cnt} admin balance ops` 
        : 'Batch cleanup - no deposits';
      await dbQuery(
        `INSERT INTO user_balances_cleanup_log (wallet_address, cleanup_type, old_balance, new_balance, reason, operator, created_at)
         VALUES (?, 'fake_account_batch_cleanup', ?, 0, ?, ?, NOW())`,
        [walletAddr, balance[0].usdt_balance, reason, adminUsername]
      );

      await dbQuery('DELETE FROM robot_purchases WHERE wallet_address = ?', [walletAddr]);
      await dbQuery('DELETE FROM user_pledges WHERE wallet_address = ?', [walletAddr]);
      await dbQuery('DELETE FROM follow_records WHERE wallet_address = ?', [walletAddr]);
      await dbQuery('DELETE FROM balance_logs WHERE wallet_address = ?', [walletAddr]);
      await dbQuery('DELETE FROM referral_relationships WHERE user_wallet = ? OR referrer_wallet = ?', [walletAddr, walletAddr]);
      await dbQuery('DELETE FROM user_balances WHERE wallet_address = ?', [walletAddr]);
      cleaned++;
    }

    secureLog('info', `Batch cleaned ${cleaned} fake accounts by ${adminUsername} (force=${force}, adminOpSkipped=${adminOpSkipped})`);
    res.json({ 
      success: true, 
      message: `Cleaned ${cleaned} accounts, skipped ${skipped + adminOpSkipped}`, 
      cleaned, skipped, adminOpSkipped,
      skippedDetails: skippedDetails.slice(0, 20)
    });
  } catch (error) {
    console.error('[FakeAccounts] Error batch cleaning:', error);
    res.status(500).json({ success: false, message: 'Failed to batch clean fake accounts' });
  }
});

/**
 * GET /fake-accounts/zero-balance
 * Get accounts with zero balance and no activity
 */
router.get('/zero-balance', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, days = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const daysAgo = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const countResult = await dbQuery(`
      SELECT COUNT(*) as total FROM user_balances ub
      WHERE ub.usdt_balance = 0 AND ub.wld_balance = 0 AND ub.total_deposit = 0 AND ub.total_profit = 0
        AND ub.created_at < ?
        AND NOT EXISTS (SELECT 1 FROM robot_purchases rp WHERE rp.wallet_address = ub.wallet_address)
        AND NOT EXISTS (SELECT 1 FROM user_pledges pr WHERE pr.wallet_address = ub.wallet_address)
    `, [daysAgo]);
    const total = countResult[0]?.total || 0;

    const accounts = await dbQuery(`
      SELECT ub.wallet_address, ub.created_at, ub.updated_at
      FROM user_balances ub
      WHERE ub.usdt_balance = 0 AND ub.wld_balance = 0 AND ub.total_deposit = 0 AND ub.total_profit = 0
        AND ub.created_at < ?
        AND NOT EXISTS (SELECT 1 FROM robot_purchases rp WHERE rp.wallet_address = ub.wallet_address)
        AND NOT EXISTS (SELECT 1 FROM user_pledges pr WHERE pr.wallet_address = ub.wallet_address)
      ORDER BY ub.created_at ASC
      LIMIT ? OFFSET ?
    `, [daysAgo, parseInt(limit), offset]);

    res.json({
      success: true,
      data: accounts,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('[FakeAccounts] Error getting zero balance:', error);
    res.status(500).json({ success: false, message: 'Failed to get zero balance accounts' });
  }
});

// ==================== Cleanup Recovery ====================

/**
 * GET /fake-accounts/recovery/list
 * Get list of cleaned accounts that can be recovered
 */
router.get('/recovery/list', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, days = 7 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const daysAgo = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM user_balances_cleanup_log WHERE created_at >= ?`,
      [daysAgo]
    );
    const total = countResult[0]?.total || 0;

    const records = await dbQuery(`
      SELECT 
        cl.id, cl.wallet_address, cl.cleanup_type, cl.old_balance, cl.new_balance,
        cl.reason, cl.operator, cl.created_at,
        CASE WHEN ub.wallet_address IS NOT NULL THEN 'exists' ELSE 'deleted' END as account_status,
        ub.usdt_balance as current_usdt, ub.wld_balance as current_wld
      FROM user_balances_cleanup_log cl
      LEFT JOIN user_balances ub ON cl.wallet_address = ub.wallet_address
      WHERE cl.created_at >= ?
      ORDER BY cl.created_at DESC
      LIMIT ? OFFSET ?
    `, [daysAgo, parseInt(limit), offset]);

    // Parse WLD from reason field
    const enrichedRecords = records.map(record => {
      let wld_balance_before = 0;
      if (record.reason) {
        const wldMatch = record.reason.match(/WLD:\s*([\d.]+)/);
        if (wldMatch) wld_balance_before = parseFloat(wldMatch[1]) || 0;
      }
      return {
        ...record,
        wld_balance_before,
        can_recover: record.account_status === 'deleted' || parseFloat(record.current_usdt || 0) === 0
      };
    });

    res.json({
      success: true,
      data: enrichedRecords,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('[CleanupRecovery] Error listing:', error);
    res.status(500).json({ success: false, message: 'Failed to list cleanup records' });
  }
});

/**
 * POST /fake-accounts/recovery/restore/:id
 * Restore a cleaned account from cleanup log
 */
router.post('/recovery/restore/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const adminUsername = req.admin?.username || 'admin';

    const cleanupRecord = await dbQuery('SELECT * FROM user_balances_cleanup_log WHERE id = ?', [id]);
    if (!cleanupRecord || cleanupRecord.length === 0) {
      return res.status(404).json({ success: false, message: 'Cleanup record not found' });
    }

    const record = cleanupRecord[0];
    const walletAddr = record.wallet_address;

    // Parse WLD balance from reason
    let wldBalance = 0;
    if (record.reason) {
      const wldMatch = record.reason.match(/WLD:\s*([\d.]+)/);
      if (wldMatch) wldBalance = parseFloat(wldMatch[1]) || 0;
    }
    const usdtBalance = parseFloat(record.old_balance) || 0;

    // Check if account exists
    const existingAccount = await dbQuery('SELECT * FROM user_balances WHERE wallet_address = ?', [walletAddr]);

    if (existingAccount && existingAccount.length > 0) {
      // Restore balance
      const current = existingAccount[0];
      await dbQuery(
        `UPDATE user_balances SET usdt_balance = usdt_balance + ?, wld_balance = wld_balance + ?, updated_at = NOW() WHERE wallet_address = ?`,
        [usdtBalance, wldBalance, walletAddr]
      );

      await dbQuery(
        `INSERT INTO user_balances_cleanup_log (wallet_address, cleanup_type, old_balance, new_balance, reason, operator, created_at)
         VALUES (?, 'recovery', ?, ?, ?, ?, NOW())`,
        [walletAddr, current.usdt_balance, parseFloat(current.usdt_balance) + usdtBalance, `Recovered from cleanup #${id}: +${usdtBalance} USDT, +${wldBalance} WLD`, adminUsername]
      );

      res.json({
        success: true,
        message: 'Balance restored successfully',
        restored: { usdt: usdtBalance, wld: wldBalance }
      });
    } else {
      // Recreate account
      await dbQuery(
        `INSERT INTO user_balances 
         (wallet_address, usdt_balance, wld_balance, total_deposit, total_withdraw, total_profit, total_referral_reward, frozen_usdt, is_banned, created_at, updated_at)
         VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, NOW(), NOW())`,
        [walletAddr, usdtBalance, wldBalance]
      );

      const userExists = await dbQuery('SELECT wallet_address FROM users WHERE wallet_address = ?', [walletAddr]);
      if (!userExists || userExists.length === 0) {
        await dbQuery('INSERT INTO users (wallet_address, created_at) VALUES (?, NOW())', [walletAddr]);
      }

      await dbQuery(
        `INSERT INTO user_balances_cleanup_log (wallet_address, cleanup_type, old_balance, new_balance, reason, operator, created_at)
         VALUES (?, 'recovery_recreate', 0, ?, ?, ?, NOW())`,
        [walletAddr, usdtBalance, `Account recreated from cleanup #${id}: ${usdtBalance} USDT, ${wldBalance} WLD`, adminUsername]
      );

      res.json({
        success: true,
        message: 'Account recreated and balance restored',
        restored: { usdt: usdtBalance, wld: wldBalance }
      });
    }

    secureLog('info', `Account restored: ${walletAddr} by ${adminUsername}`, { cleanup_id: id, usdt: usdtBalance, wld: wldBalance });
  } catch (error) {
    console.error('[CleanupRecovery] Error restoring:', error);
    res.status(500).json({ success: false, message: 'Failed to restore account: ' + error.message });
  }
});

/**
 * GET /fake-accounts/recovery/stats
 * Get cleanup recovery statistics
 */
router.get('/recovery/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await dbQuery(`
      SELECT cleanup_type, COUNT(*) as count, SUM(old_balance) as total_balance_affected, DATE(created_at) as date
      FROM user_balances_cleanup_log
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY cleanup_type, DATE(created_at)
      ORDER BY date DESC, cleanup_type
    `);

    const summary = await dbQuery(`
      SELECT 
        SUM(CASE WHEN cleanup_type NOT LIKE '%recovery%' THEN 1 ELSE 0 END) as total_cleanups,
        SUM(CASE WHEN cleanup_type LIKE '%recovery%' THEN 1 ELSE 0 END) as total_recoveries,
        SUM(CASE WHEN cleanup_type NOT LIKE '%recovery%' THEN old_balance ELSE 0 END) as total_cleaned_balance,
        SUM(CASE WHEN cleanup_type LIKE '%recovery%' THEN new_balance ELSE 0 END) as total_recovered_balance
      FROM user_balances_cleanup_log
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);

    res.json({
      success: true,
      summary: summary[0] || { total_cleanups: 0, total_recoveries: 0, total_cleaned_balance: 0, total_recovered_balance: 0 },
      daily_stats: stats
    });
  } catch (error) {
    console.error('[CleanupRecovery] Error getting stats:', error);
    res.status(500).json({ success: false, message: 'Failed to get stats' });
  }
});

export default router;

