-- =====================================================
-- VituFinance 系统维护状态表
-- 创建日期：2025-12-28
-- 功能：管理系统维护状态和公告内容
-- =====================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ==================== 系统维护状态表 ====================
CREATE TABLE IF NOT EXISTS `system_maintenance` (
    `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `is_enabled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用维护模式 (0:关闭, 1:启用)',
    `title` VARCHAR(255) DEFAULT 'System Maintenance' COMMENT '维护标题(默认英文)',
    `message` TEXT DEFAULT NULL COMMENT '维护公告内容(默认英文)',
    `estimated_duration` INT(11) DEFAULT 120 COMMENT '预计维护时长(分钟)',
    `start_time` DATETIME DEFAULT NULL COMMENT '维护开始时间',
    `end_time` DATETIME DEFAULT NULL COMMENT '预计结束时间',
    `updated_by` VARCHAR(50) DEFAULT NULL COMMENT '最后更新人',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统维护状态表';

-- ==================== 多语言维护公告表 ====================
CREATE TABLE IF NOT EXISTS `maintenance_translations` (
    `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `maintenance_id` INT(11) UNSIGNED NOT NULL DEFAULT 1 COMMENT '关联维护状态ID',
    `language_code` VARCHAR(10) NOT NULL COMMENT '语言代码 (en, zh-tw, ar, etc.)',
    `title` VARCHAR(255) NOT NULL COMMENT '维护标题',
    `message` TEXT NOT NULL COMMENT '维护公告内容',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_maintenance_lang` (`maintenance_id`, `language_code`),
    INDEX `idx_language_code` (`language_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='多语言维护公告表';

-- ==================== 初始化默认数据 ====================
INSERT INTO `system_maintenance` (`id`, `is_enabled`, `title`, `message`, `estimated_duration`) 
VALUES (1, 0, 'System Maintenance', 'The system is currently under maintenance. Please try again in 2 hours. Thank you for your patience.', 120)
ON DUPLICATE KEY UPDATE `id` = `id`;

-- Insert default translations for all supported languages
INSERT INTO `maintenance_translations` (`maintenance_id`, `language_code`, `title`, `message`) VALUES
(1, 'en', 'System Maintenance', 'The system is currently under maintenance. Please try again in 2 hours. Thank you for your patience.'),
(1, 'zh-tw', '系統維護中', '系統正在維護中，請2個小時後再次訪問。感謝您的耐心等待。'),
(1, 'ar', 'صيانة النظام', 'النظام قيد الصيانة حاليًا. يرجى المحاولة مرة أخرى بعد ساعتين. شكرًا لصبركم.'),
(1, 'de', 'Systemwartung', 'Das System befindet sich derzeit in Wartung. Bitte versuchen Sie es in 2 Stunden erneut. Vielen Dank für Ihre Geduld.'),
(1, 'es', 'Mantenimiento del Sistema', 'El sistema está actualmente en mantenimiento. Por favor, inténtelo de nuevo en 2 horas. Gracias por su paciencia.'),
(1, 'fr', 'Maintenance du Système', 'Le système est actuellement en maintenance. Veuillez réessayer dans 2 heures. Merci de votre patience.'),
(1, 'id', 'Pemeliharaan Sistem', 'Sistem sedang dalam pemeliharaan. Silakan coba lagi dalam 2 jam. Terima kasih atas kesabaran Anda.'),
(1, 'ms', 'Penyelenggaraan Sistem', 'Sistem sedang dalam penyelenggaraan. Sila cuba lagi dalam 2 jam. Terima kasih atas kesabaran anda.'),
(1, 'pt', 'Manutenção do Sistema', 'O sistema está atualmente em manutenção. Por favor, tente novamente em 2 horas. Obrigado pela sua paciência.'),
(1, 'tr', 'Sistem Bakımı', 'Sistem şu anda bakımdadır. Lütfen 2 saat sonra tekrar deneyin. Sabrınız için teşekkür ederiz.'),
(1, 'uk', 'Технічне обслуговування', 'Система наразі на технічному обслуговуванні. Будь ласка, спробуйте через 2 години. Дякуємо за терпіння.'),
(1, 'vi', 'Bảo trì Hệ thống', 'Hệ thống đang được bảo trì. Vui lòng thử lại sau 2 giờ. Cảm ơn sự kiên nhẫn của bạn.'),
(1, 'zu', 'Ukulungiswa Kwesistimu', 'Isistimu ikhona kulungiswa. Sicela uzame futhi emva kwamahora angu-2. Siyabonga ngokubekezela kwakho.')
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`), `message` = VALUES(`message`);

SET FOREIGN_KEY_CHECKS = 1;

