/**
 * Admin Routes - Cleanup Recovery Module
 * Handles: Recovery list, restore, batch restore, stats
 */
import { express, dbQuery, authMiddleware, secureLog } from './shared.js';

const router = express.Router();

// ==================== Cleanup Recovery ====================

router.get('/cleanup-recovery/list', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, days = 7 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const daysAgo = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    // Get total count
    const countResult = await dbQuery(`
      SELECT COUNT(*) as total FROM user_balances_cleanup_log
      WHERE created_at >= ?
    `, [daysAgo]);
    const total = countResult[0]?.total || 0;

    // Get cleanup records with recovery info
    const records = await dbQuery(`
      SELECT 
        cl.id,
        cl.wallet_address,
        cl.cleanup_type,
        cl.old_balance,
        cl.new_balance,
        cl.reason,
        cl.operator,
        cl.created_at,
        CASE WHEN ub.wallet_address IS NOT NULL THEN 'exists' ELSE 'deleted' END as account_status,
        ub.usdt_balance as current_usdt,
        ub.wld_balance as current_wld
      FROM user_balances_cleanup_log cl
      LEFT JOIN user_balances ub ON cl.wallet_address = ub.wallet_address
      WHERE cl.created_at >= ?
      ORDER BY cl.created_at DESC
      LIMIT ? OFFSET ?
    `, [daysAgo, parseInt(limit), offset]);

    // Parse reason field to extract WLD balance
    const enrichedRecords = records.map(record => {
      let wld_balance_before = 0;
      if (record.reason) {
        const wldMatch = record.reason.match(/WLD:\s*([\d.]+)/);
        if (wldMatch) {
          wld_balance_before = parseFloat(wldMatch[1]) || 0;
        }
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
 * POST /api/admin/cleanup-recovery/restore/:id
 * Restore a cleaned account from cleanup log
 */
router.post('/cleanup-recovery/restore/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const adminUsername = req.admin?.username || 'admin';

    // Get cleanup record
    const cleanupRecord = await dbQuery(
      'SELECT * FROM user_balances_cleanup_log WHERE id = ?',
      [id]
    );

    if (!cleanupRecord || cleanupRecord.length === 0) {
      return res.status(404).json({ success: false, message: 'Cleanup record not found' });
    }

    const record = cleanupRecord[0];
    const walletAddr = record.wallet_address;

    // Parse WLD balance from reason field
    let wldBalance = 0;
    if (record.reason) {
      const wldMatch = record.reason.match(/WLD:\s*([\d.]+)/);
      if (wldMatch) {
        wldBalance = parseFloat(wldMatch[1]) || 0;
      }
    }

    const usdtBalance = parseFloat(record.old_balance) || 0;

    // Check if account already exists
    const existingAccount = await dbQuery(
      'SELECT * FROM user_balances WHERE wallet_address = ?',
      [walletAddr]
    );

    if (existingAccount && existingAccount.length > 0) {
      // Account exists - restore balance
      const current = existingAccount[0];
      await dbQuery(`
        UPDATE user_balances 
        SET usdt_balance = usdt_balance + ?,
            wld_balance = wld_balance + ?,
            updated_at = NOW()
        WHERE wallet_address = ?
      `, [usdtBalance, wldBalance, walletAddr]);

      // Log the recovery
      await dbQuery(`
        INSERT INTO user_balances_cleanup_log 
        (wallet_address, cleanup_type, old_balance, new_balance, reason, operator, created_at)
        VALUES (?, 'recovery', ?, ?, ?, ?, NOW())
      `, [
        walletAddr, 
        current.usdt_balance, 
        parseFloat(current.usdt_balance) + usdtBalance,
        `Recovered from cleanup #${id}: +${usdtBalance} USDT, +${wldBalance} WLD`,
        adminUsername
      ]);

      secureLog('info', `Account balance recovered: ${walletAddr} by ${adminUsername}`, {
        cleanup_id: id,
        usdt_restored: usdtBalance,
        wld_restored: wldBalance
      });

      res.json({
        success: true,
        message: `Balance restored successfully`,
        restored: { usdt: usdtBalance, wld: wldBalance }
      });
    } else {
      // Account deleted - recreate it
      await dbQuery(`
        INSERT INTO user_balances 
        (wallet_address, usdt_balance, wld_balance, total_deposit, total_withdraw, 
         total_profit, total_referral_reward, frozen_usdt, is_banned, created_at, updated_at)
        VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, NOW(), NOW())
      `, [walletAddr, usdtBalance, wldBalance]);

      // Also recreate user record if needed
      const userExists = await dbQuery(
        'SELECT wallet_address FROM users WHERE wallet_address = ?',
        [walletAddr]
      );
      if (!userExists || userExists.length === 0) {
        await dbQuery(`
          INSERT INTO users (wallet_address, created_at)
          VALUES (?, NOW())
        `, [walletAddr]);
      }

      // Log the recovery
      await dbQuery(`
        INSERT INTO user_balances_cleanup_log 
        (wallet_address, cleanup_type, old_balance, new_balance, reason, operator, created_at)
        VALUES (?, 'recovery_recreate', 0, ?, ?, ?, NOW())
      `, [
        walletAddr, 
        usdtBalance,
        `Account recreated from cleanup #${id}: ${usdtBalance} USDT, ${wldBalance} WLD`,
        adminUsername
      ]);

      secureLog('info', `Account recreated and recovered: ${walletAddr} by ${adminUsername}`, {
        cleanup_id: id,
        usdt_restored: usdtBalance,
        wld_restored: wldBalance
      });

      res.json({
        success: true,
        message: `Account recreated and balance restored successfully`,
        restored: { usdt: usdtBalance, wld: wldBalance }
      });
    }
  } catch (error) {
    console.error('[CleanupRecovery] Error restoring:', error);
    res.status(500).json({ success: false, message: 'Failed to restore account: ' + error.message });
  }
});

/**
 * POST /api/admin/cleanup-recovery/batch-restore
 * Batch restore multiple cleaned accounts
 */
router.post('/cleanup-recovery/batch-restore', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    const adminUsername = req.admin?.username || 'admin';

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No cleanup record IDs provided' });
    }

    let restored = 0, failed = 0;
    const results = [];

    for (const id of ids) {
      try {
        // Get cleanup record
        const cleanupRecord = await dbQuery(
          'SELECT * FROM user_balances_cleanup_log WHERE id = ?',
          [id]
        );

        if (!cleanupRecord || cleanupRecord.length === 0) {
          failed++;
          results.push({ id, status: 'not_found' });
          continue;
        }

        const record = cleanupRecord[0];
        const walletAddr = record.wallet_address;

        // Parse WLD balance
        let wldBalance = 0;
        if (record.reason) {
          const wldMatch = record.reason.match(/WLD:\s*([\d.]+)/);
          if (wldMatch) {
            wldBalance = parseFloat(wldMatch[1]) || 0;
          }
        }

        const usdtBalance = parseFloat(record.old_balance) || 0;

        // Check if account exists
        const existingAccount = await dbQuery(
          'SELECT usdt_balance FROM user_balances WHERE wallet_address = ?',
          [walletAddr]
        );

        if (existingAccount && existingAccount.length > 0) {
          // Restore balance
          await dbQuery(`
            UPDATE user_balances 
            SET usdt_balance = usdt_balance + ?,
                wld_balance = wld_balance + ?,
                updated_at = NOW()
            WHERE wallet_address = ?
          `, [usdtBalance, wldBalance, walletAddr]);
        } else {
          // Recreate account
          await dbQuery(`
            INSERT INTO user_balances 
            (wallet_address, usdt_balance, wld_balance, total_deposit, total_withdraw, 
             total_profit, total_referral_reward, frozen_usdt, is_banned, created_at, updated_at)
            VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, NOW(), NOW())
          `, [walletAddr, usdtBalance, wldBalance]);

          // Recreate user if needed
          const userExists = await dbQuery(
            'SELECT wallet_address FROM users WHERE wallet_address = ?',
            [walletAddr]
          );
          if (!userExists || userExists.length === 0) {
            await dbQuery(`
              INSERT INTO users (wallet_address, created_at)
              VALUES (?, NOW())
            `, [walletAddr]);
          }
        }

        // Log recovery
        await dbQuery(`
          INSERT INTO user_balances_cleanup_log 
          (wallet_address, cleanup_type, old_balance, new_balance, reason, operator, created_at)
          VALUES (?, 'batch_recovery', 0, ?, ?, ?, NOW())
        `, [
          walletAddr, 
          usdtBalance,
          `Batch recovered from cleanup #${id}: ${usdtBalance} USDT, ${wldBalance} WLD`,
          adminUsername
        ]);

        restored++;
        results.push({ id, wallet: walletAddr, status: 'restored', usdt: usdtBalance, wld: wldBalance });
      } catch (err) {
        failed++;
        results.push({ id, status: 'error', error: err.message });
      }
    }

    secureLog('info', `Batch recovery completed by ${adminUsername}`, { restored, failed });

    res.json({
      success: true,
      message: `Restored ${restored} accounts, failed ${failed}`,
      restored,
      failed,
      results: results.slice(0, 50) // Limit results for response size
    });
  } catch (error) {
    console.error('[CleanupRecovery] Error batch restoring:', error);
    res.status(500).json({ success: false, message: 'Failed to batch restore accounts' });
  }
});

/**
 * GET /api/admin/cleanup-recovery/stats
 * Get cleanup recovery statistics
 */
router.get('/cleanup-recovery/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await dbQuery(`
      SELECT 
        cleanup_type,
        COUNT(*) as count,
        SUM(old_balance) as total_balance_affected,
        DATE(created_at) as date
      FROM user_balances_cleanup_log
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY cleanup_type, DATE(created_at)
      ORDER BY date DESC, cleanup_type
    `);

    // Get summary
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
