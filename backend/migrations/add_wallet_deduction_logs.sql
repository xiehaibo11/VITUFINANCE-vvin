-- 创建钱包扣费日志表
CREATE TABLE IF NOT EXISTS `wallet_deduction_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `wallet_address` VARCHAR(255) NOT NULL COMMENT '用户钱包地址',
  `amount` DECIMAL(20, 4) NOT NULL COMMENT '扣费金额',
  `chain` VARCHAR(20) NOT NULL COMMENT '扣费链 (BSC/ETH/TRON)',
  `tx_hash` VARCHAR(255) NOT NULL COMMENT '交易哈希',
  `reason` TEXT NULL COMMENT '扣费原因（可选）',
  `admin_remark` TEXT COMMENT '管理员备注',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX `idx_wallet_address` (`wallet_address`),
  INDEX `idx_chain` (`chain`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='钱包扣费日志表';
