-- =====================================================================
-- Referenz-Schema der bestehenden Twitch-Tabellen.
-- NUR ausfuehren, wenn diese Tabellen noch nicht existieren.
-- Sie bilden das vom Bot beschriebene Schema ab.
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `channels` (
  `uuid`            CHAR(36)    NOT NULL,
  `broadcaster_id`  VARCHAR(32) NOT NULL,
  `name`            VARCHAR(64) NOT NULL,
  `active`          TINYINT(1)  NOT NULL DEFAULT 1,
  `created_at`      DATETIME    NOT NULL,
  `updated_at`      DATETIME    NOT NULL,
  `created_by_uuid` CHAR(36)    NULL DEFAULT NULL,
  `created_by_name` VARCHAR(64) NULL DEFAULT NULL,
  PRIMARY KEY (`uuid`),
  UNIQUE KEY `uq_channels_broadcaster_id` (`broadcaster_id`),
  KEY `idx_channels_name` (`name`),
  KEY `idx_channels_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `events` (
  `id`             BIGINT      NOT NULL AUTO_INCREMENT,
  `channel_uuid`   CHAR(36)    NOT NULL,
  `channel_id`     VARCHAR(32) NOT NULL,
  `channel_name`   VARCHAR(64) NOT NULL,
  `event_type`     VARCHAR(24) NOT NULL,
  `user_id`        VARCHAR(32) NULL DEFAULT NULL,
  `user_name`      VARCHAR(64) NULL DEFAULT NULL,
  `gifted_by_name` VARCHAR(64) NULL DEFAULT NULL,
  `sub_tier`       VARCHAR(16) NULL DEFAULT NULL,
  `months`         INT         NULL DEFAULT NULL,
  `gift_count`     INT         NULL DEFAULT NULL,
  `viewer_count`   INT         NULL DEFAULT NULL,
  `message`        TEXT        NULL DEFAULT NULL,
  `occurred_at`    DATETIME    NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_events_channel_occurred` (`channel_uuid`, `occurred_at`),
  KEY `idx_events_type` (`event_type`),
  KEY `idx_events_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `messages` (
  `id`                  BIGINT       NOT NULL AUTO_INCREMENT,
  `channel_uuid`        CHAR(36)     NOT NULL,
  `channel_id`          VARCHAR(32)  NOT NULL,
  `channel_name`        VARCHAR(64)  NOT NULL,
  `user_id`             VARCHAR(32)  NOT NULL,
  `user_name`           VARCHAR(64)  NOT NULL,
  `display_name`        VARCHAR(64)  NULL DEFAULT NULL,
  `is_mod`              TINYINT(1)   NOT NULL DEFAULT 0,
  `is_subscriber`       TINYINT(1)   NOT NULL DEFAULT 0,
  `is_vip`              TINYINT(1)   NOT NULL DEFAULT 0,
  `is_broadcaster`      TINYINT(1)   NOT NULL DEFAULT 0,
  `is_turbo`            TINYINT(1)   NOT NULL DEFAULT 0,
  `is_first_message`    TINYINT(1)   NOT NULL DEFAULT 0,
  `is_action`           TINYINT(1)   NOT NULL DEFAULT 0,
  `badges`              VARCHAR(512) NULL DEFAULT NULL,
  `badge_info`          VARCHAR(255) NULL DEFAULT NULL,
  `color`               VARCHAR(16)  NULL DEFAULT NULL,
  `bits`                INT          NOT NULL DEFAULT 0,
  `content`             TEXT         NOT NULL,
  `emotes`              TEXT         NULL DEFAULT NULL,
  `reply_to_message_id` VARCHAR(64)  NULL DEFAULT NULL,
  `message_id`          VARCHAR(64)  NOT NULL,
  `received_at`         DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_messages_channel_received` (`channel_uuid`, `received_at`),
  KEY `idx_messages_user` (`user_id`),
  KEY `idx_messages_message_id` (`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `moderation_actions` (
  `id`                      BIGINT       NOT NULL AUTO_INCREMENT,
  `channel_uuid`            CHAR(36)     NOT NULL,
  `channel_id`              VARCHAR(32)  NOT NULL,
  `channel_name`            VARCHAR(64)  NOT NULL,
  `action`                  VARCHAR(16)  NOT NULL,
  `target_user_id`          VARCHAR(32)  NULL DEFAULT NULL,
  `target_user_name`        VARCHAR(64)  NULL DEFAULT NULL,
  `duration_seconds`        INT          NULL DEFAULT NULL,
  `reason`                  VARCHAR(500) NULL DEFAULT NULL,
  `deleted_message_id`      VARCHAR(64)  NULL DEFAULT NULL,
  `deleted_message_content` TEXT         NULL DEFAULT NULL,
  `occurred_at`             DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_modactions_channel_occurred` (`channel_uuid`, `occurred_at`),
  KEY `idx_modactions_action` (`action`),
  KEY `idx_modactions_target` (`target_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `user_id`       VARCHAR(32) NOT NULL,
  `user_name`     VARCHAR(64) NOT NULL,
  `display_name`  VARCHAR(64) NULL DEFAULT NULL,
  `first_seen_at` DATETIME    NOT NULL,
  `last_seen_at`  DATETIME    NOT NULL,
  `message_count` BIGINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`),
  KEY `idx_viewers_user_name` (`user_name`),
  KEY `idx_viewers_last_seen` (`last_seen_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
