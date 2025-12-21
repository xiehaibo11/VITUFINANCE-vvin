#!/usr/bin/env node

/**
 * 团队分红数据检查脚本
 * 用于检查数据库中的分红数据统计
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'vitu_finance',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vitu_finance',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

async function main() {
  let connection;
  
  try {
    console.log('\n' + '='.repeat(80));
    log(colors.bright + colors.blue, '团队分红数据检查');
    console.log('='.repeat(80) + '\n');
    
    // 创建数据库连接
    connection = await mysql.createConnection(dbConfig);
    log(colors.green, '✓ 数据库连接成功\n');
    
    // 1. 检查总体统计
    console.log('━'.repeat(80));
    log(colors.bright, '【1】团队分红总体统计');
    console.log('━'.repeat(80));
    
    const [totalStats] = await connection.query(`
      SELECT 
        COUNT(DISTINCT wallet_address) as total_members,
        COUNT(*) as total_records,
        SUM(reward_amount) as total_amount
      FROM team_rewards
      WHERE reward_type = 'daily_dividend'
    `);
    
    console.log(`累计经纪人数: ${totalStats[0].total_members}`);
    console.log(`累计分红记录: ${totalStats[0].total_records}`);
    console.log(`累计分红总额: ${parseFloat(totalStats[0].total_amount || 0).toFixed(4)} USDT`);
    
    // 2. 检查今日统计
    console.log('\n' + '━'.repeat(80));
    log(colors.bright, '【2】今日分红统计');
    console.log('━'.repeat(80));
    
    const [todayStats] = await connection.query(`
      SELECT 
        COUNT(DISTINCT wallet_address) as today_members,
        SUM(reward_amount) as today_amount
      FROM team_rewards
      WHERE reward_type = 'daily_dividend'
      AND DATE(reward_date) = CURDATE()
    `);
    
    console.log(`今日发放人数: ${todayStats[0].today_members}`);
    console.log(`今日分红金额: ${parseFloat(todayStats[0].today_amount || 0).toFixed(4)} USDT`);
    
    // 3. 检查最近10条记录
    console.log('\n' + '━'.repeat(80));
    log(colors.bright, '【3】最近10条分红记录');
    console.log('━'.repeat(80));
    
    const [recentRecords] = await connection.query(`
      SELECT 
        wallet_address,
        broker_level,
        reward_amount,
        reward_date,
        created_at
      FROM team_rewards
      WHERE reward_type = 'daily_dividend'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    if (recentRecords.length > 0) {
      console.log('\n地址\t\t\t等级\t金额\t\t日期\t\t\t时间');
      console.log('-'.repeat(100));
      recentRecords.forEach(record => {
        const addr = record.wallet_address.slice(0, 10) + '...';
        const amount = parseFloat(record.reward_amount).toFixed(4);
        console.log(`${addr}\t${record.broker_level}\t${amount}\t${record.reward_date}\t${record.created_at}`);
      });
    } else {
      log(colors.yellow, '暂无分红记录');
    }
    
    // 4. 推荐关系统计
    console.log('\n' + '━'.repeat(80));
    log(colors.bright, '【4】推荐关系统计');
    console.log('━'.repeat(80));
    
    const [referralStats] = await connection.query(`
      SELECT 
        COUNT(DISTINCT wallet_address) as total_users,
        COUNT(DISTINCT referrer_address) as total_referrers,
        COUNT(*) as total_relationships
      FROM user_referrals
    `);
    
    console.log(`总用户数: ${referralStats[0].total_users}`);
    console.log(`推荐人数: ${referralStats[0].total_referrers}`);
    console.log(`推荐关系: ${referralStats[0].total_relationships}`);
    
    // 5. 推荐奖励统计
    console.log('\n' + '━'.repeat(80));
    log(colors.bright, '【5】推荐奖励统计');
    console.log('━'.repeat(80));
    
    const [rewardStats] = await connection.query(`
      SELECT 
        COUNT(DISTINCT wallet_address) as total_users_with_rewards,
        SUM(reward_amount) as total_reward_amount,
        COUNT(*) as total_records
      FROM referral_rewards
    `);
    
    console.log(`获得奖励用户数: ${rewardStats[0].total_users_with_rewards}`);
    console.log(`累计奖励总额: ${parseFloat(rewardStats[0].total_reward_amount || 0).toFixed(4)} USDT`);
    console.log(`奖励记录数: ${rewardStats[0].total_records}`);
    
    // 6. 今日新增推荐
    const [todayReferrals] = await connection.query(`
      SELECT COUNT(*) as today_new
      FROM user_referrals
      WHERE DATE(created_at) = CURDATE()
    `);
    
    console.log(`今日新增推荐: ${todayReferrals[0].today_new}`);
    
    // 7. 经纪人等级分布
    console.log('\n' + '━'.repeat(80));
    log(colors.bright, '【6】经纪人等级分布（最近7天）');
    console.log('━'.repeat(80));
    
    const [levelDistribution] = await connection.query(`
      SELECT 
        broker_level,
        COUNT(DISTINCT wallet_address) as member_count,
        SUM(reward_amount) as total_amount
      FROM team_rewards
      WHERE reward_type = 'daily_dividend'
      AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY broker_level
      ORDER BY broker_level DESC
    `);
    
    if (levelDistribution.length > 0) {
      console.log('\n等级\t人数\t金额');
      console.log('-'.repeat(40));
      levelDistribution.forEach(level => {
        const amount = parseFloat(level.total_amount).toFixed(4);
        console.log(`${level.broker_level}级\t${level.member_count}\t${amount} USDT`);
      });
    } else {
      log(colors.yellow, '暂无等级分布数据');
    }
    
    // 8. 检查潜在经纪人（有资格但未获得分红）
    console.log('\n' + '━'.repeat(80));
    log(colors.bright, '【7】潜在经纪人检查（有3+直推且3+合格成员但未获分红）');
    console.log('━'.repeat(80));
    
    const [potentialBrokers] = await connection.query(`
      SELECT 
        ur.referrer_address,
        COUNT(DISTINCT ur.wallet_address) as direct_count,
        COUNT(DISTINCT rp.id) as qualified_robots,
        IFNULL(tr.total_dividend, 0) as received_dividend
      FROM user_referrals ur
      LEFT JOIN robot_purchases rp ON ur.wallet_address = rp.wallet_address 
        AND rp.status = 'active' 
        AND rp.price >= 50
      LEFT JOIN (
        SELECT wallet_address, SUM(reward_amount) as total_dividend
        FROM team_rewards
        WHERE reward_type = 'daily_dividend'
        GROUP BY wallet_address
      ) tr ON ur.referrer_address = tr.wallet_address
      GROUP BY ur.referrer_address
      HAVING direct_count >= 3 AND qualified_robots >= 3 AND received_dividend = 0
      LIMIT 20
    `);
    
    if (potentialBrokers.length > 0) {
      log(colors.yellow, `\n发现 ${potentialBrokers.length} 个潜在经纪人：`);
      console.log('\n地址\t\t\t\t直推数\t合格机器人\t已获分红');
      console.log('-'.repeat(80));
      potentialBrokers.forEach(broker => {
        const addr = broker.referrer_address.slice(0, 20) + '...';
        console.log(`${addr}\t${broker.direct_count}\t${broker.qualified_robots}\t\t${broker.received_dividend}`);
      });
    } else {
      log(colors.green, '\n✓ 无潜在未发放经纪人');
    }
    
    // 总结
    console.log('\n' + '='.repeat(80));
    log(colors.bright + colors.green, '数据检查完成');
    console.log('='.repeat(80) + '\n');
    
    // 判断数据状态
    if (totalStats[0].total_members === 0) {
      log(colors.red, '⚠️  警告：team_rewards表中无数据，请检查分红定时任务是否正常运行！');
      console.log('\n建议执行：');
      console.log('  cd /www/wwwroot/vitufinance.com');
      console.log('  node backend/src/cron/teamDividendCron.js\n');
    } else {
      log(colors.green, `✓ 数据库中有 ${totalStats[0].total_members} 名经纪人的分红记录`);
    }
    
  } catch (error) {
    log(colors.red, `\n❌ 错误: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 运行主函数
main().catch(console.error);

