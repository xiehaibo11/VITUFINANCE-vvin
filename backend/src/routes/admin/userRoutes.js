/**
 * Admin Routes - User Management Module
 * Handles: User list, balance adjustment, diagnostics, ban/unban
 */
import { 
  express, 
  dbQuery, 
  authMiddleware,
  secureLog,
  sanitizeString
} from './shared.js';

const router = express.Router();

// ==================== User Management ====================

router.get('/users', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, wallet_address } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    let whereClause = '';
    const params = [];
    
    if (wallet_address) {
      whereClause = 'WHERE wallet_address LIKE ?';
      params.push(`%${wallet_address}%`);
    }
    
    // 获取总数
    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM user_balances ${whereClause}`,
      params
    );
    
    // 获取列表
    const list = await dbQuery(
      `SELECT * FROM user_balances ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    
    res.json({
      success: true,
      data: {
        list,
        total: countResult?.[0]?.total || 0,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取用户列表失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取用户列表失败'
    });
  }
});

/**
 * 更新用户余额
 * PUT /api/admin/users/:wallet_address/balance
 */
router.put('/users/:wallet_address/balance', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const { usdt_balance, wld_balance, remark, is_internal_operation } = req.body;
    const admin_username = req.admin?.username || 'unknown';
    const admin_id = req.admin?.id || 0;
    
    if (usdt_balance === undefined && wld_balance === undefined) {
      return res.status(400).json({
        success: false,
        message: '请提供要更新的余额'
      });
    }
    
    const walletAddr = wallet_address.toLowerCase();
    
    // Get current balance for comparison and logging
    const currentBalanceResult = await dbQuery(
      'SELECT usdt_balance, wld_balance, manual_added_balance FROM user_balances WHERE wallet_address = ?',
      [walletAddr]
    );
    
    if (!currentBalanceResult || currentBalanceResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    const currentBalance = currentBalanceResult[0];
    const oldUsdt = parseFloat(currentBalance.usdt_balance) || 0;
    const oldWld = parseFloat(currentBalance.wld_balance) || 0;
    const newUsdt = usdt_balance !== undefined ? parseFloat(usdt_balance) : oldUsdt;
    const newWld = wld_balance !== undefined ? parseFloat(wld_balance) : oldWld;
    
    // Build update query
    const updateFields = [];
    const updateParams = [];
    
    // If internal operation, track manual_added_balance
    if (is_internal_operation === true) {
      if (usdt_balance !== undefined) {
        const diff = newUsdt - oldUsdt;
        
        if (diff > 0) {
          // Increasing balance, record to manual_added_balance
          updateFields.push('usdt_balance = ?');
          updateParams.push(newUsdt);
          updateFields.push('manual_added_balance = manual_added_balance + ?');
          updateParams.push(diff);
        } else {
          // Decreasing balance, don't record to manual_added_balance
          updateFields.push('usdt_balance = ?');
          updateParams.push(newUsdt);
        }
      }
      
      if (wld_balance !== undefined) {
        updateFields.push('wld_balance = ?');
        updateParams.push(newWld);
      }
    } else {
      // Normal update operation
      if (usdt_balance !== undefined) {
        updateFields.push('usdt_balance = ?');
        updateParams.push(newUsdt);
      }
      
      if (wld_balance !== undefined) {
        updateFields.push('wld_balance = ?');
        updateParams.push(newWld);
      }
    }
    
    updateFields.push('updated_at = NOW()');
    updateParams.push(walletAddr);
    
    // Execute update
    await dbQuery(
      `UPDATE user_balances SET ${updateFields.join(', ')} WHERE wallet_address = ?`,
      updateParams
    );
    
    // Build detailed operation log
    const operationDetail = JSON.stringify({
      wallet_address: walletAddr,
      before: { usdt: oldUsdt.toFixed(4), wld: oldWld.toFixed(4) },
      after: { usdt: newUsdt.toFixed(4), wld: newWld.toFixed(4) },
      change: { 
        usdt: (newUsdt - oldUsdt).toFixed(4), 
        wld: (newWld - oldWld).toFixed(4) 
      },
      is_internal_operation: is_internal_operation || false,
      remark: remark || ''
    });
    
    // Record to admin_operation_logs table
    await dbQuery(
      `INSERT INTO admin_operation_logs 
       (admin_id, admin_username, operation_type, operation_target, operation_detail, ip_address, created_at) 
       VALUES (?, ?, 'balance_update', ?, ?, ?, NOW())`,
      [
        admin_id,
        admin_username,
        walletAddr,
        operationDetail,
        req.ip || req.connection?.remoteAddress || 'unknown'
      ]
    );
    
    console.log(`[Admin] 余额更新: admin=${admin_username}, wallet=${walletAddr}, USDT: ${oldUsdt} -> ${newUsdt}, WLD: ${oldWld} -> ${newWld}, 备注: ${remark}`);
    
    res.json({
      success: true,
      message: '余额更新成功',
      data: {
        before: { usdt: oldUsdt.toFixed(4), wld: oldWld.toFixed(4) },
        after: { usdt: newUsdt.toFixed(4), wld: newWld.toFixed(4) }
      }
    });
  } catch (error) {
    console.error('更新用户余额失败:', error.message);
    res.status(500).json({
      success: false,
      message: '更新失败'
    });
  }
});

/**
 * 用户余额诊断
 * GET /api/admin/users/:wallet_address/diagnose
 * 
 * Returns detailed balance calculation breakdown
 * Helps identify data inconsistencies
 */
router.get('/users/:wallet_address/diagnose', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const walletAddr = wallet_address.toLowerCase();
    
    // Get user basic info
    const userResult = await dbQuery(
      `SELECT wallet_address, usdt_balance, wld_balance, total_deposit, 
              total_withdraw, manual_added_balance, created_at, updated_at
       FROM user_balances WHERE wallet_address = ?`,
      [walletAddr]
    );
    
    if (!userResult || userResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    const user = userResult[0];
    
    // Get completed deposits
    const depositResult = await dbQuery(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM deposit_records 
       WHERE LOWER(wallet_address) = ? AND status = 'completed'`,
      [walletAddr]
    );
    const totalDeposits = parseFloat(depositResult[0]?.total) || 0;
    const depositCount = depositResult[0]?.count || 0;
    
    // Get completed withdrawals
    const withdrawResult = await dbQuery(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM withdraw_records 
       WHERE LOWER(wallet_address) = ? AND status = 'completed'`,
      [walletAddr]
    );
    const totalWithdrawals = parseFloat(withdrawResult[0]?.total) || 0;
    const withdrawCount = withdrawResult[0]?.count || 0;
    
    // Get robot purchases
    const robotResult = await dbQuery(
      `SELECT COALESCE(SUM(price), 0) as total_cost,
              COALESCE(SUM(total_profit), 0) as total_profit,
              COUNT(*) as count
       FROM robot_purchases 
       WHERE LOWER(wallet_address) = ?`,
      [walletAddr]
    );
    const totalRobotCost = parseFloat(robotResult[0]?.total_cost) || 0;
    const totalRobotProfit = parseFloat(robotResult[0]?.total_profit) || 0;
    const robotCount = robotResult[0]?.count || 0;
    
    // Get referral rewards
    const referralResult = await dbQuery(
      `SELECT COALESCE(SUM(reward_amount), 0) as total, COUNT(*) as count
       FROM referral_rewards 
       WHERE LOWER(wallet_address) = ?`,
      [walletAddr]
    );
    const totalReferralReward = parseFloat(referralResult[0]?.total) || 0;
    
    // Get team rewards
    const teamResult = await dbQuery(
      `SELECT COALESCE(SUM(reward_amount), 0) as total, COUNT(*) as count
       FROM team_rewards 
       WHERE LOWER(wallet_address) = ?`,
      [walletAddr]
    );
    const totalTeamReward = parseFloat(teamResult[0]?.total) || 0;
    
    // Get manual added balance
    const manualAdded = parseFloat(user.manual_added_balance) || 0;
    
    // Calculate expected balance
    const expectedBalance = 
      totalDeposits 
      - totalWithdrawals 
      - totalRobotCost 
      + totalRobotProfit 
      + totalReferralReward 
      + totalTeamReward 
      + manualAdded;
    
    const currentBalance = parseFloat(user.usdt_balance);
    const difference = currentBalance - expectedBalance;
    
    // Get recent transactions for debugging
    const recentDeposits = await dbQuery(
      `SELECT id, amount, status, tx_hash, created_at
       FROM deposit_records 
       WHERE LOWER(wallet_address) = ?
       ORDER BY created_at DESC LIMIT 10`,
      [walletAddr]
    );
    
    const recentWithdrawals = await dbQuery(
      `SELECT id, amount, status, created_at
       FROM withdraw_records 
       WHERE LOWER(wallet_address) = ?
       ORDER BY created_at DESC LIMIT 10`,
      [walletAddr]
    );
    
    const recentRobots = await dbQuery(
      `SELECT id, robot_name, price, total_profit, status, created_at
       FROM robot_purchases 
       WHERE LOWER(wallet_address) = ?
       ORDER BY created_at DESC LIMIT 10`,
      [walletAddr]
    );
    
    res.json({
      success: true,
      data: {
        // Basic user info
        wallet_address: user.wallet_address,
        current_balance: {
          usdt: parseFloat(user.usdt_balance).toFixed(4),
          wld: parseFloat(user.wld_balance).toFixed(4)
        },
        stored_totals: {
          total_deposit: parseFloat(user.total_deposit).toFixed(4),
          total_withdraw: parseFloat(user.total_withdraw).toFixed(4),
          manual_added: manualAdded.toFixed(4)
        },
        
        // Calculated values
        calculated: {
          deposits: { total: totalDeposits.toFixed(4), count: depositCount },
          withdrawals: { total: totalWithdrawals.toFixed(4), count: withdrawCount },
          robots: { 
            cost: totalRobotCost.toFixed(4), 
            profit: totalRobotProfit.toFixed(4),
            count: robotCount 
          },
          referral_reward: totalReferralReward.toFixed(4),
          team_reward: totalTeamReward.toFixed(4)
        },
        
        // Balance analysis
        analysis: {
          expected_balance: expectedBalance.toFixed(4),
          actual_balance: currentBalance.toFixed(4),
          difference: difference.toFixed(4),
          is_mismatch: Math.abs(difference) > 0.01,
          has_negative_expected: expectedBalance < 0
        },
        
        // Field mismatches
        field_mismatches: {
          total_deposit: Math.abs(parseFloat(user.total_deposit) - totalDeposits) > 0.01 
            ? { stored: parseFloat(user.total_deposit).toFixed(4), calculated: totalDeposits.toFixed(4) }
            : null,
          total_withdraw: Math.abs(parseFloat(user.total_withdraw) - totalWithdrawals) > 0.01
            ? { stored: parseFloat(user.total_withdraw).toFixed(4), calculated: totalWithdrawals.toFixed(4) }
            : null
        },
        
        // Recent transactions for debugging
        recent_transactions: {
          deposits: recentDeposits.map(d => ({
            id: d.id,
            amount: parseFloat(d.amount).toFixed(4),
            status: d.status,
            created_at: d.created_at
          })),
          withdrawals: recentWithdrawals.map(w => ({
            id: w.id,
            amount: parseFloat(w.amount).toFixed(4),
            status: w.status,
            created_at: w.created_at
          })),
          robots: recentRobots.map(r => ({
            id: r.id,
            name: r.robot_name,
            cost: parseFloat(r.price).toFixed(4),
            profit: parseFloat(r.total_profit).toFixed(4),
            status: r.status
          }))
        },
        
        // Timestamps
        timestamps: {
          created_at: user.created_at,
          updated_at: user.updated_at,
          diagnosed_at: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('用户余额诊断失败:', error.message);
    res.status(500).json({
      success: false,
      message: '诊断失败: ' + error.message
    });
  }
});

/**
 * 用户余额完整明细
 * GET /api/admin/users/:wallet_address/balance-details
 * 
 * Returns all balance-affecting transactions for a user
 * Includes: deposits, withdrawals, robot purchases, robot profits, 
 *           referral rewards, team rewards, exchanges, admin adjustments
 */
router.get('/users/:wallet_address/balance-details', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const walletAddr = wallet_address.toLowerCase();
    
    // Get user basic info
    const userResult = await dbQuery(
      `SELECT wallet_address, usdt_balance, wld_balance, total_deposit, 
              total_withdraw, manual_added_balance, created_at, updated_at
       FROM user_balances WHERE wallet_address = ?`,
      [walletAddr]
    );
    
    if (!userResult || userResult.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    const user = userResult[0];
    
    // Collect all transactions
    const transactions = [];
    
    // 1. Deposit records (completed only affect balance)
    const deposits = await dbQuery(
      `SELECT id, amount, status, tx_hash, network, created_at, completed_at
       FROM deposit_records WHERE LOWER(wallet_address) = ? ORDER BY created_at DESC`,
      [walletAddr]
    );
    for (const d of deposits) {
      transactions.push({
        id: `deposit_${d.id}`,
        type: 'deposit',
        type_cn: '充值',
        amount: d.status === 'completed' ? parseFloat(d.amount) : 0,
        display_amount: parseFloat(d.amount),
        status: d.status,
        affects_balance: d.status === 'completed',
        description: `充值 ${parseFloat(d.amount).toFixed(4)} USDT`,
        tx_hash: d.tx_hash,
        network: d.network,
        created_at: d.created_at
      });
    }
    
    // 2. Withdrawal records (completed only affect balance)
    const withdrawals = await dbQuery(
      `SELECT id, amount, fee, status, to_address, tx_hash, created_at, completed_at
       FROM withdraw_records WHERE LOWER(wallet_address) = ? ORDER BY created_at DESC`,
      [walletAddr]
    );
    for (const w of withdrawals) {
      transactions.push({
        id: `withdraw_${w.id}`,
        type: 'withdraw',
        type_cn: '提款',
        amount: w.status === 'completed' ? -parseFloat(w.amount) : 0,
        display_amount: parseFloat(w.amount),
        fee: parseFloat(w.fee || 0),
        status: w.status,
        affects_balance: w.status === 'completed',
        description: `提款 ${parseFloat(w.amount).toFixed(4)} USDT`,
        to_address: w.to_address,
        tx_hash: w.tx_hash,
        created_at: w.created_at
      });
    }
    
    // 3. Robot purchases
    const robots = await dbQuery(
      `SELECT id, robot_name, price, total_profit, status, daily_profit, 
              start_time, end_time, created_at
       FROM robot_purchases WHERE LOWER(wallet_address) = ? ORDER BY created_at DESC`,
      [walletAddr]
    );
    for (const r of robots) {
      // Purchase record (always affects balance)
      transactions.push({
        id: `robot_buy_${r.id}`,
        type: 'robot_purchase',
        type_cn: '购买机器人',
        amount: -parseFloat(r.price),
        display_amount: parseFloat(r.price),
        status: r.status,
        affects_balance: true,
        description: `购买 ${r.robot_name} (${r.status})`,
        robot_id: r.id,
        robot_name: r.robot_name,
        daily_profit: r.daily_profit,
        created_at: r.created_at
      });
    }
    
    // 4. Robot quantify logs (earnings)
    const quantifyLogs = await dbQuery(
      `SELECT id, robot_purchase_id, robot_name, earnings, created_at
       FROM robot_quantify_logs WHERE LOWER(wallet_address) = ? ORDER BY created_at DESC`,
      [walletAddr]
    );
    for (const q of quantifyLogs) {
      transactions.push({
        id: `quantify_${q.id}`,
        type: 'robot_earning',
        type_cn: '量化收益',
        amount: parseFloat(q.earnings),
        display_amount: parseFloat(q.earnings),
        status: 'completed',
        affects_balance: true,
        description: `${q.robot_name} 量化收益`,
        robot_id: q.robot_purchase_id,
        robot_name: q.robot_name,
        created_at: q.created_at
      });
    }
    
    // 5. Referral rewards
    const referralRewards = await dbQuery(
      `SELECT id, from_wallet, level, reward_rate, reward_amount, 
              source_type, robot_name, source_amount, created_at
       FROM referral_rewards WHERE LOWER(wallet_address) = ? ORDER BY created_at DESC`,
      [walletAddr]
    );
    for (const r of referralRewards) {
      transactions.push({
        id: `referral_${r.id}`,
        type: 'referral_reward',
        type_cn: '推荐奖励',
        amount: parseFloat(r.reward_amount),
        display_amount: parseFloat(r.reward_amount),
        status: 'completed',
        affects_balance: true,
        description: `${r.level}级推荐奖励 (${r.reward_rate}%) 来自 ${r.from_wallet.slice(-8)}`,
        from_wallet: r.from_wallet,
        level: r.level,
        reward_rate: r.reward_rate,
        source_type: r.source_type,
        created_at: r.created_at
      });
    }
    
    // 6. Team rewards
    const teamRewards = await dbQuery(
      `SELECT id, reward_type, reward_amount, broker_level, created_at
       FROM team_rewards WHERE LOWER(wallet_address) = ? ORDER BY created_at DESC`,
      [walletAddr]
    );
    for (const t of teamRewards) {
      transactions.push({
        id: `team_${t.id}`,
        type: 'team_reward',
        type_cn: '团队奖励',
        amount: parseFloat(t.reward_amount),
        display_amount: parseFloat(t.reward_amount),
        status: 'completed',
        affects_balance: true,
        description: `团队${t.reward_type}奖励 (等级${t.broker_level})`,
        reward_type: t.reward_type,
        broker_level: t.broker_level,
        created_at: t.created_at
      });
    }
    
    // 7. Admin balance adjustments (from operation logs)
    try {
      const adminLogs = await dbQuery(
        `SELECT id, operation_type, operation_detail, admin_name, created_at
         FROM admin_operation_logs 
         WHERE operation_type LIKE '%balance%' AND operation_detail LIKE ?
         ORDER BY created_at DESC LIMIT 50`,
        [`%${walletAddr}%`]
      );
      for (const log of adminLogs) {
        try {
          const details = JSON.parse(log.operation_detail);
          if (details.wallet_address === walletAddr && details.change) {
            const usdtChange = parseFloat(details.change.usdt) || 0;
            if (usdtChange !== 0) {
              transactions.push({
                id: `admin_${log.id}`,
                type: 'admin_adjustment',
                type_cn: '管理员调整',
                amount: usdtChange,
                display_amount: Math.abs(usdtChange),
                status: 'completed',
                affects_balance: true,
                description: `管理员 ${log.admin_name} 调整余额`,
                admin: log.admin_name,
                before: details.before,
                after: details.after,
                created_at: log.created_at
              });
            }
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    } catch (e) {
      // Table may not exist or have different structure, skip
      console.log('[Balance Details] Admin logs query skipped:', e.message);
    }
    
    // Sort all transactions by created_at DESC
    transactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // Calculate running balance
    let runningBalance = 0;
    const transactionsWithBalance = [];
    
    // Process in chronological order for running balance
    const chronologicalTx = [...transactions].reverse();
    for (const tx of chronologicalTx) {
      if (tx.affects_balance) {
        runningBalance += tx.amount;
      }
      transactionsWithBalance.unshift({
        ...tx,
        running_balance: runningBalance
      });
    }
    
    // Calculate totals
    const totals = {
      deposits: transactions.filter(t => t.type === 'deposit' && t.affects_balance).reduce((sum, t) => sum + t.amount, 0),
      withdrawals: Math.abs(transactions.filter(t => t.type === 'withdraw' && t.affects_balance).reduce((sum, t) => sum + t.amount, 0)),
      robot_purchases: Math.abs(transactions.filter(t => t.type === 'robot_purchase').reduce((sum, t) => sum + t.amount, 0)),
      robot_earnings: transactions.filter(t => t.type === 'robot_earning').reduce((sum, t) => sum + t.amount, 0),
      referral_rewards: transactions.filter(t => t.type === 'referral_reward').reduce((sum, t) => sum + t.amount, 0),
      team_rewards: transactions.filter(t => t.type === 'team_reward').reduce((sum, t) => sum + t.amount, 0),
      admin_adjustments: transactions.filter(t => t.type === 'admin_adjustment').reduce((sum, t) => sum + t.amount, 0)
    };
    
    totals.calculated_balance = totals.deposits - totals.withdrawals - totals.robot_purchases + 
                                 totals.robot_earnings + totals.referral_rewards + 
                                 totals.team_rewards + totals.admin_adjustments;
    
    res.json({
      success: true,
      data: {
        user: {
          wallet_address: user.wallet_address,
          current_usdt_balance: parseFloat(user.usdt_balance).toFixed(4),
          current_wld_balance: parseFloat(user.wld_balance).toFixed(4),
          stored_total_deposit: parseFloat(user.total_deposit).toFixed(4),
          stored_total_withdraw: parseFloat(user.total_withdraw).toFixed(4),
          manual_added: parseFloat(user.manual_added_balance || 0).toFixed(4),
          created_at: user.created_at,
          updated_at: user.updated_at
        },
        totals: {
          deposits: totals.deposits.toFixed(4),
          withdrawals: totals.withdrawals.toFixed(4),
          robot_purchases: totals.robot_purchases.toFixed(4),
          robot_earnings: totals.robot_earnings.toFixed(4),
          referral_rewards: totals.referral_rewards.toFixed(4),
          team_rewards: totals.team_rewards.toFixed(4),
          admin_adjustments: totals.admin_adjustments.toFixed(4),
          calculated_balance: totals.calculated_balance.toFixed(4),
          balance_difference: (parseFloat(user.usdt_balance) - totals.calculated_balance).toFixed(4)
        },
        transactions: transactionsWithBalance,
        transaction_count: transactions.length
      }
    });
  } catch (error) {
    console.error('获取用户余额明细失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取明细失败: ' + error.message
    });
  }
});

/**
 * 封禁用户
 * POST /api/admin/users/:wallet_address/ban
 */
router.post('/users/:wallet_address/ban', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const { reason } = req.body;
    const admin_username = req.admin.username;
    
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: '请提供封禁原因'
      });
    }
    
    const walletAddr = wallet_address.toLowerCase();
    
    // 检查用户是否存在
    const user = await dbQuery(
      'SELECT wallet_address, is_banned FROM user_balances WHERE wallet_address = ?',
      [walletAddr]
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    if (user.is_banned === 1) {
      return res.status(400).json({
        success: false,
        message: '该用户已被封禁'
      });
    }
    
    // 执行封禁操作
    await dbQuery(
      `UPDATE user_balances 
       SET is_banned = 1, 
           banned_at = NOW(), 
           ban_reason = ?, 
           banned_by = ?, 
           updated_at = NOW() 
       WHERE wallet_address = ?`,
      [reason, admin_username, walletAddr]
    );
    
    // 记录日志
    console.log(`[Admin Ban] 用户已被封禁: ${walletAddr}, 原因: ${reason}, 操作员: ${admin_username}`);
    
    res.json({
      success: true,
      message: '用户已成功封禁'
    });
  } catch (error) {
    console.error('封禁用户失败:', error.message);
    res.status(500).json({
      success: false,
      message: '封禁操作失败'
    });
  }
});

/**
 * 解封用户
 * POST /api/admin/users/:wallet_address/unban
 */
router.post('/users/:wallet_address/unban', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const admin_username = req.admin.username;
    
    const walletAddr = wallet_address.toLowerCase();
    
    // 检查用户是否存在
    const user = await dbQuery(
      'SELECT wallet_address, is_banned FROM user_balances WHERE wallet_address = ?',
      [walletAddr]
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    if (user.is_banned === 0) {
      return res.status(400).json({
        success: false,
        message: '该用户未被封禁'
      });
    }
    
    // 执行解封操作
    await dbQuery(
      `UPDATE user_balances 
       SET is_banned = 0, 
           banned_at = NULL, 
           ban_reason = NULL, 
           banned_by = NULL, 
           updated_at = NOW() 
       WHERE wallet_address = ?`,
      [walletAddr]
    );
    
    // 记录日志
    console.log(`[Admin Unban] 用户已解封: ${walletAddr}, 操作员: ${admin_username}`);
    
    res.json({
      success: true,
      message: '用户已成功解封'
    });
  } catch (error) {
    console.error('解封用户失败:', error.message);
    res.status(500).json({
      success: false,
      message: '解封操作失败'
    });
  }
});



export default router;
