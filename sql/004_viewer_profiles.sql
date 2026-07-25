-- =====================================================================
-- TwitchPanel - Zwischenspeicher fuer Profildaten aus der Twitch-API
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `admin_viewer_profiles` (
  `user_id`           VARCHAR(32)  NOT NULL,
  `login`             VARCHAR(64)  NULL DEFAULT NULL,
  `display_name`      VARCHAR(64)  NULL DEFAULT NULL,
  `profile_image_url` VARCHAR(512) NULL DEFAULT NULL,
  `offline_image_url` VARCHAR(512) NULL DEFAULT NULL,
  `description`       TEXT         NULL DEFAULT NULL,
  `broadcaster_type`  VARCHAR(24)  NULL DEFAULT NULL,
  `twitch_created_at` DATETIME     NULL DEFAULT NULL,
  `fetched_at`        DATETIME     NOT NULL,
  `not_found`         TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`),
  KEY `idx_viewer_profiles_fetched` (`fetched_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
