-- Parsa Emlak — initial schema
-- Apply with:
--   mysql -u root -p < backend/db/schema.sql
-- Or from the mysql shell:
--   source backend/db/schema.sql
--
-- This file is idempotent: CREATE TABLE IF NOT EXISTS + safe ALTERs.
-- Adjust DB_NAME below if your .env uses a different value.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

CREATE DATABASE IF NOT EXISTS `emlakdb`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `emlakdb`;

-- ---------------------------------------------------------------------------
-- users  ·  application accounts (login / register)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`          INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  `username`    VARCHAR(30)        NOT NULL,
  `password`    VARCHAR(255)       NOT NULL,            -- bcrypt hash
  `role`        ENUM('user','admin') NOT NULL DEFAULT 'user',
  `created_at`  TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- properties  ·  the listings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `properties` (
  `id`           INT UNSIGNED         NOT NULL AUTO_INCREMENT,
  `title`        VARCHAR(200)         NOT NULL,
  `location`     VARCHAR(200)         NOT NULL,
  `price`        DECIMAL(15, 2)       NOT NULL,
  `type`         ENUM('Daire','Villa','Arsa','Ofis') NOT NULL,
  `status`       ENUM('satilik','kiralik') NOT NULL DEFAULT 'satilik',
  -- `image` can hold either:
  --   * a relative /uploads/<file> path,
  --   * an https://... URL, or
  --   * a data:image/...;base64 URL (legacy entries).
  -- MEDIUMTEXT keeps room for the data: case without crippling the page-load query.
  `image`        MEDIUMTEXT           NULL,
  `bedrooms`     SMALLINT UNSIGNED    NULL,
  `bathrooms`    SMALLINT UNSIGNED    NULL,
  `area_m2`      INT UNSIGNED         NULL,
  `floor_no`     VARCHAR(20)          NULL,
  `year_built`   SMALLINT UNSIGNED    NULL,
  `description`  TEXT                 NULL,
  `created_at`   TIMESTAMP            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- Indexes back the WHERE / ORDER BY clauses in GET /api/properties.
  -- These are the filters; the PK already covers ORDER BY id DESC.
  KEY `idx_status`   (`status`),
  KEY `idx_type`     (`type`),
  KEY `idx_price`    (`price`),
  KEY `idx_bedrooms` (`bedrooms`),
  KEY `idx_area_m2`  (`area_m2`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- property_images  ·  gallery for each listing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `property_images` (
  `id`           INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  `property_id`  INT UNSIGNED       NOT NULL,
  `image_url`    VARCHAR(500)       NOT NULL,
  `sort_order`   SMALLINT UNSIGNED  NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_prop_sort` (`property_id`, `sort_order`),
  CONSTRAINT `fk_images_property`
    FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- inquiries  ·  contact-form submissions from /api/properties/:id/inquiry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inquiries` (
  `id`           INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  `property_id`  INT UNSIGNED       NOT NULL,
  `name`         VARCHAR(100)       NOT NULL,
  `phone`        VARCHAR(30)        NOT NULL,
  `email`        VARCHAR(100)       NULL,
  `message`      TEXT               NULL,
  `created_at`   TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_property` (`property_id`),
  KEY `idx_created`  (`created_at`),
  CONSTRAINT `fk_inq_property`
    FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Seed admin account (optional — uncomment + change password before running).
-- The hash below is bcrypt for the password "change_me_now" at cost 12.
-- Generate your own with:
--   node -e "console.log(require('bcrypt').hashSync('your-password', 12))"
-- ---------------------------------------------------------------------------
-- INSERT INTO `users` (`username`, `password`, `role`)
-- VALUES ('admin', '$2b$12$REPLACE_THIS_WITH_YOUR_OWN_BCRYPT_HASH', 'admin');
