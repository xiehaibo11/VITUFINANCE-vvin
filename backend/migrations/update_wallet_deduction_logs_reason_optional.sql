-- 将 wallet_deduction_logs 表的 reason 字段改为可选
ALTER TABLE `wallet_deduction_logs` 
MODIFY COLUMN `reason` TEXT NULL COMMENT '扣费原因（可选）';
