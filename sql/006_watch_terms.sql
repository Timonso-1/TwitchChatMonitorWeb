-- =====================================================================
-- TwitchPanel - Wortfilter: beobachtete Begriffe im Chat
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `admin_watch_terms` (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT,
  `term`            VARCHAR(255) NOT NULL,
  `match_type`      VARCHAR(16)  NOT NULL DEFAULT 'contains',
  `severity`        VARCHAR(16)  NOT NULL DEFAULT 'warning',
  `case_sensitive`  TINYINT(1)   NOT NULL DEFAULT 0,
  `active`          TINYINT(1)   NOT NULL DEFAULT 1,
  `note`            VARCHAR(255) NULL DEFAULT NULL,
  `channel_uuid`    CHAR(36)     NULL DEFAULT NULL,
  `created_by_uuid` CHAR(36)     NULL DEFAULT NULL,
  `created_by_name` VARCHAR(96)  NULL DEFAULT NULL,
  `created_at`      DATETIME     NOT NULL,
  `updated_at`      DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_watch_terms_term` (`term`, `match_type`, `channel_uuid`),
  KEY `idx_watch_terms_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Rechte an die Systemrollen verteilen
-- ---------------------------------------------------------------------

-- Administrator: sehen und verwalten
INSERT IGNORE INTO `admin_role_permissions` (`role_uuid`, `permission`)
SELECT `uuid`, 'watchlist.view' FROM `admin_roles` WHERE `key` = 'admin';
INSERT IGNORE INTO `admin_role_permissions` (`role_uuid`, `permission`)
SELECT `uuid`, 'watchlist.manage' FROM `admin_roles` WHERE `key` = 'admin';

-- Moderator: sehen und verwalten (er pflegt die Begriffe im Alltag)
INSERT IGNORE INTO `admin_role_permissions` (`role_uuid`, `permission`)
SELECT `uuid`, 'watchlist.view' FROM `admin_roles` WHERE `key` = 'moderator';
INSERT IGNORE INTO `admin_role_permissions` (`role_uuid`, `permission`)
SELECT `uuid`, 'watchlist.manage' FROM `admin_roles` WHERE `key` = 'moderator';

-- Live-Chat für Moderator und Administrator
INSERT IGNORE INTO `admin_role_permissions` (`role_uuid`, `permission`)
SELECT `uuid`, 'chat.live' FROM `admin_roles` WHERE `key` IN ('admin', 'moderator');
