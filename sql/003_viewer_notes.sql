-- =====================================================================
-- TwitchPanel - Interne Notizen zu Twitch-Zuschauern
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `admin_viewer_notes` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `viewer_user_id`   VARCHAR(32)  NOT NULL,
  `viewer_user_name` VARCHAR(64)  NULL DEFAULT NULL,
  `content`          TEXT         NOT NULL,
  `severity`         VARCHAR(16)  NOT NULL DEFAULT 'info',
  `pinned`           TINYINT(1)   NOT NULL DEFAULT 0,
  `author_uuid`      CHAR(36)     NULL DEFAULT NULL,
  `author_name`      VARCHAR(96)  NOT NULL,
  `created_at`       DATETIME     NOT NULL,
  `updated_at`       DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_viewer_notes_viewer` (`viewer_user_id`),
  KEY `idx_viewer_notes_created` (`created_at`),
  CONSTRAINT `fk_viewer_notes_author`
    FOREIGN KEY (`author_uuid`) REFERENCES `admin_users` (`uuid`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Neue Rechte an die bestehenden Systemrollen verteilen
-- ---------------------------------------------------------------------

-- Administrator: alle drei Notiz-Rechte
INSERT IGNORE INTO `admin_role_permissions` (`role_uuid`, `permission`)
SELECT `uuid`, 'viewers.notes_view' FROM `admin_roles` WHERE `key` = 'admin';
INSERT IGNORE INTO `admin_role_permissions` (`role_uuid`, `permission`)
SELECT `uuid`, 'viewers.notes_write' FROM `admin_roles` WHERE `key` = 'admin';
INSERT IGNORE INTO `admin_role_permissions` (`role_uuid`, `permission`)
SELECT `uuid`, 'viewers.notes_delete' FROM `admin_roles` WHERE `key` = 'admin';

-- Moderator: lesen und schreiben, aber nicht loeschen
INSERT IGNORE INTO `admin_role_permissions` (`role_uuid`, `permission`)
SELECT `uuid`, 'viewers.notes_view' FROM `admin_roles` WHERE `key` = 'moderator';
INSERT IGNORE INTO `admin_role_permissions` (`role_uuid`, `permission`)
SELECT `uuid`, 'viewers.notes_write' FROM `admin_roles` WHERE `key` = 'moderator';
