-- =====================================================================
-- TwitchPanel - Verknüpfung von Panel-Accounts mit Twitch-Accounts
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE `admin_users`
  ADD COLUMN `twitch_user_id`           VARCHAR(32)  NULL DEFAULT NULL AFTER `password_changed_at`,
  ADD COLUMN `twitch_login`             VARCHAR(64)  NULL DEFAULT NULL AFTER `twitch_user_id`,
  ADD COLUMN `twitch_display_name`      VARCHAR(64)  NULL DEFAULT NULL AFTER `twitch_login`,
  ADD COLUMN `twitch_profile_image_url` VARCHAR(512) NULL DEFAULT NULL AFTER `twitch_display_name`,
  ADD COLUMN `twitch_linked_at`         DATETIME     NULL DEFAULT NULL AFTER `twitch_profile_image_url`;

-- Ein Twitch-Account darf nur einem Panel-Account zugeordnet sein.
-- NULL-Werte sind von einem UNIQUE-Index in MySQL ausgenommen,
-- unverknüpfte Accounts kollidieren also nicht.
ALTER TABLE `admin_users`
  ADD UNIQUE KEY `uq_admin_users_twitch` (`twitch_user_id`);
