-- ==========================================
-- Fix Robot Quantify Status and Count
-- 修复机器人量化状态和次数
-- ==========================================

-- 1. 更新所有有量化日志的机器人的量化状态和次数
-- Update quantify status and count for robots with quantify logs
UPDATE robot_purchases rp
INNER JOIN (
    SELECT 
        robot_purchase_id,
        COUNT(*) as log_count
    FROM robot_quantify_logs
    GROUP BY robot_purchase_id
) ql ON rp.id = ql.robot_purchase_id
SET 
    rp.is_quantified = TRUE,
    rp.quantify_count = ql.log_count,
    rp.updated_at = NOW()
WHERE rp.quantify_count != ql.log_count 
   OR rp.is_quantified != TRUE;

-- 2. 显示修复结果统计
-- Show fix statistics
SELECT 
    '修复前状态不一致的机器人' as description,
    COUNT(*) as count
FROM robot_purchases rp
LEFT JOIN (
    SELECT 
        robot_purchase_id,
        COUNT(*) as log_count
    FROM robot_quantify_logs
    GROUP BY robot_purchase_id
) ql ON rp.id = ql.robot_purchase_id
WHERE (ql.log_count IS NOT NULL AND (rp.is_quantified != TRUE OR rp.quantify_count != ql.log_count))
   OR (ql.log_count IS NULL AND rp.is_quantified = TRUE);

-- 3. 验证修复后的数据
-- Verify fixed data
SELECT 
    rp.id,
    rp.robot_name,
    rp.robot_type,
    rp.is_quantified as current_status,
    rp.quantify_count as current_count,
    COALESCE(ql.log_count, 0) as actual_log_count,
    CASE 
        WHEN ql.log_count IS NULL AND rp.is_quantified = FALSE THEN '✓ 正确'
        WHEN ql.log_count IS NOT NULL AND rp.is_quantified = TRUE AND rp.quantify_count = ql.log_count THEN '✓ 正确'
        ELSE '✗ 不一致'
    END as status_check
FROM robot_purchases rp
LEFT JOIN (
    SELECT 
        robot_purchase_id,
        COUNT(*) as log_count
    FROM robot_quantify_logs
    GROUP BY robot_purchase_id
) ql ON rp.id = ql.robot_purchase_id
WHERE rp.status = 'active'
ORDER BY rp.id DESC
LIMIT 20;

-- 4. 显示修复摘要
-- Show fix summary
SELECT 
    '总机器人数' as metric,
    COUNT(*) as value
FROM robot_purchases
WHERE status = 'active'
UNION ALL
SELECT 
    '已量化机器人数',
    COUNT(*)
FROM robot_purchases
WHERE status = 'active' AND is_quantified = TRUE
UNION ALL
SELECT 
    '量化次数总计',
    SUM(quantify_count)
FROM robot_purchases
WHERE status = 'active'
UNION ALL
SELECT 
    '量化日志总数',
    COUNT(*)
FROM robot_quantify_logs;

