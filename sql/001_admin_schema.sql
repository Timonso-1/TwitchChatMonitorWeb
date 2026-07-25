-- =====================================================================
-- TwitchPanel - Panel-eigene Tabellen (Auth, Rollen, Audit)
-- Die bestehenden Twitch-Tabellen (channels, events, messages,
-- moderation_actions, users) werden hierdurch NICHT veraendert.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- Panel-Accounts
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin_users` (
  `uuid`                  CHAR(36)      NOT NULL,
  `email`                 VARCHAR(255)  NOT NULL,
  `username`              VARCHAR(64)   NOT NULL,
  `display_name`          VARCHAR(96)   NULL DEFAULT NULL,
  `password_hash`         VARCHAR(255)  NOT NULL,
  `totp_secret`           VARCHAR(512)  NULL DEFAULT NULL,
  `totp_enabled`          TINYINT(1)    NOT NULL DEFAULT 0,
  `totp_confirmed_at`     DATETIME      NULL DEFAULT NULL,
  `is_active`             TINYINT(1)    NOT NULL DEFAULT 1,
  `must_change_password`  TINYINT(1)    NOT NULL DEFAULT 0,
  `failed_login_attempts` INT           NOT NULL DEFAULT 0,
  `locked_until`          DATETIME      NULL DEFAULT NULL,
  `last_login_at`         DATETIME      NULL DEFAULT NULL,
  `last_login_ip`         VARCHAR(45)   NULL DEFAULT NULL,
  `password_changed_at`   DATETIME      NULL DEFAULT NULL,
  `created_at`            DATETIME      NOT NULL,
  `updated_at`            DATETIME      NOT NULL,
  `created_by_uuid`       CHAR(36)      NULL DEFAULT NULL,
  PRIMARY KEY (`uuid`),
  UNIQUE KEY `uq_admin_users_email` (`email`),
  UNIQUE KEY `uq_admin_users_username` (`username`),
  KEY `idx_admin_users_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Rollen
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin_roles` (
  `uuid`        CHAR(36)      NOT NULL,
  `key`         VARCHAR(64)   NOT NULL,
  `name`        VARCHAR(96)   NOT NULL,
  `description` VARCHAR(255)  NULL DEFAULT NULL,
  `priority`    INT           NOT NULL DEFAULT 0,
  `color`       VARCHAR(16)   NOT NULL DEFAULT '#8b5cf6',
  `is_system`   TINYINT(1)    NOT NULL DEFAULT 0,
  `created_at`  DATETIME      NOT NULL,
  `updated_at`  DATETIME      NOT NULL,
  PRIMARY KEY (`uuid`),
  UNIQUE KEY `uq_admin_roles_key` (`key`),
  KEY `idx_admin_roles_priority` (`priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Rechte pro Rolle
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin_role_permissions` (
  `role_uuid`  CHAR(36)    NOT NULL,
  `permission` VARCHAR(64) NOT NULL,
  PRIMARY KEY (`role_uuid`, `permission`),
  KEY `idx_role_permissions_permission` (`permission`),
  CONSTRAINT `fk_role_permissions_role`
    FOREIGN KEY (`role_uuid`) REFERENCES `admin_roles` (`uuid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Rollenzuweisung
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin_user_roles` (
  `user_uuid`        CHAR(36) NOT NULL,
  `role_uuid`        CHAR(36) NOT NULL,
  `assigned_at`      DATETIME NOT NULL,
  `assigned_by_uuid` CHAR(36) NULL DEFAULT NULL,
  PRIMARY KEY (`user_uuid`, `role_uuid`),
  KEY `idx_user_roles_role` (`role_uuid`),
  CONSTRAINT `fk_user_roles_user`
    FOREIGN KEY (`user_uuid`) REFERENCES `admin_users` (`uuid`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_roles_role`
    FOREIGN KEY (`role_uuid`) REFERENCES `admin_roles` (`uuid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Sessions (id = SHA-256 des Cookie-Tokens)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin_sessions` (
  `id`                  CHAR(64)     NOT NULL,
  `user_uuid`           CHAR(36)     NOT NULL,
  `two_factor_verified` TINYINT(1)   NOT NULL DEFAULT 0,
  `ip_address`          VARCHAR(45)  NULL DEFAULT NULL,
  `user_agent`          VARCHAR(255) NULL DEFAULT NULL,
  `created_at`          DATETIME     NOT NULL,
  `last_active_at`      DATETIME     NOT NULL,
  `expires_at`          DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_admin_sessions_user` (`user_uuid`),
  KEY `idx_admin_sessions_expires` (`expires_at`),
  CONSTRAINT `fk_admin_sessions_user`
    FOREIGN KEY (`user_uuid`) REFERENCES `admin_users` (`uuid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Recovery-Codes fuer 2FA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin_recovery_codes` (
  `id`         BIGINT       NOT NULL AUTO_INCREMENT,
  `user_uuid`  CHAR(36)     NOT NULL,
  `code_hash`  CHAR(64)     NOT NULL,
  `used_at`    DATETIME     NULL DEFAULT NULL,
  `created_at` DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_recovery_codes_hash` (`code_hash`),
  KEY `idx_recovery_codes_user` (`user_uuid`),
  CONSTRAINT `fk_recovery_codes_user`
    FOREIGN KEY (`user_uuid`) REFERENCES `admin_users` (`uuid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Audit-Log
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin_audit_log` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `actor_uuid`   CHAR(36)     NULL DEFAULT NULL,
  `actor_name`   VARCHAR(96)  NULL DEFAULT NULL,
  `action`       VARCHAR(64)  NOT NULL,
  `target_type`  VARCHAR(32)  NULL DEFAULT NULL,
  `target_id`    VARCHAR(96)  NULL DEFAULT NULL,
  `target_label` VARCHAR(128) NULL DEFAULT NULL,
  `metadata`     JSON         NULL DEFAULT NULL,
  `ip_address`   VARCHAR(45)  NULL DEFAULT NULL,
  `user_agent`   VARCHAR(255) NULL DEFAULT NULL,
  `outcome`      VARCHAR(16)  NOT NULL DEFAULT 'success',
  `note`         TEXT         NULL DEFAULT NULL,
  `created_at`   DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_created` (`created_at`),
  KEY `idx_audit_actor` (`actor_uuid`),
  KEY `idx_audit_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
