-- Migration 001 · add indexes for the bedrooms / area_m2 filters.
-- Run once against any DB that was bootstrapped before these indexes existed:
--   mysql -u root -p emlakdb < backend/db/migrations/001_add_filter_indexes.sql
--
-- Already in schema.sql for fresh installs.

USE `emlakdb`;

-- MySQL < 8.0 has no `CREATE INDEX IF NOT EXISTS`, so we guard manually.
DROP PROCEDURE IF EXISTS _ensure_index;
DELIMITER //
CREATE PROCEDURE _ensure_index(
  IN tbl VARCHAR(64),
  IN idx VARCHAR(64),
  IN cols VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = tbl
       AND INDEX_NAME   = idx
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD KEY `', idx, '` (', cols, ')');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL _ensure_index('properties', 'idx_bedrooms', '`bedrooms`');
CALL _ensure_index('properties', 'idx_area_m2',  '`area_m2`');

DROP PROCEDURE _ensure_index;
