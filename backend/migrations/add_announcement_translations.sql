-- 添加公告多语言支持
-- 日期: 2026-02-25

-- 添加多语言字段
ALTER TABLE announcements
ADD COLUMN title_translations JSON COMMENT '标题多语言翻译 {en: "", zh-tw: "", es: "", ...}' AFTER title,
ADD COLUMN content_translations JSON COMMENT '内容多语言翻译 {en: "", zh-tw: "", es: "", ...}' AFTER content;

-- 初始化现有数据的翻译字段（将现有英文内容作为默认值）
UPDATE announcements
SET
  title_translations = JSON_OBJECT('en', title),
  content_translations = JSON_OBJECT('en', COALESCE(content, ''))
WHERE title_translations IS NULL;
