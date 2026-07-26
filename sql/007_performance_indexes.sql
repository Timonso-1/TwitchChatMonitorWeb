-- =====================================================================
-- TwitchPanel - Indizes für die haeufigsten Abfragen
--
-- Vor dem Einspielen pruefen, ob ein Index bereits existiert:
--   SHOW INDEX FROM messages;
-- MySQL bricht mit Fehler ab, wenn ein Indexname schon vergeben ist.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------

-- Nachrichtenliste und Verlaeufe sortieren immer nach Zeit.
CREATE INDEX `idx_messages_received` ON `messages` (`received_at`);

-- Chatter-Profil: Nachrichten eines Nutzers, neueste zuerst.
CREATE INDEX `idx_messages_user_received` ON `messages` (`user_id`, `received_at`);

-- Verknuepfung von Loeschungen und Antworten.
CREATE INDEX `idx_messages_reply_to` ON `messages` (`reply_to_message_id`);

-- Live-Chat fragt "alles neuer als ID X" ab.
CREATE INDEX `idx_messages_channel_id` ON `messages` (`channel_uuid`, `id`);

-- ---------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------

CREATE INDEX `idx_events_occurred` ON `events` (`occurred_at`);
CREATE INDEX `idx_events_user_occurred` ON `events` (`user_id`, `occurred_at`);

-- ---------------------------------------------------------------------
-- moderation_actions
-- ---------------------------------------------------------------------

CREATE INDEX `idx_modactions_occurred` ON `moderation_actions` (`occurred_at`);
CREATE INDEX `idx_modactions_target_occurred` ON `moderation_actions` (`target_user_id`, `occurred_at`);

-- Nachschlagen, ob eine Nachricht geloescht wurde.
CREATE INDEX `idx_modactions_deleted_message` ON `moderation_actions` (`deleted_message_id`);

-- ---------------------------------------------------------------------
-- users (Zuschauer)
-- ---------------------------------------------------------------------

-- Zuschauerliste sortiert nach Aktivitaet bzw. letztem Auftreten.
CREATE INDEX `idx_viewers_message_count` ON `users` (`message_count`);
CREATE INDEX `idx_viewers_first_seen` ON `users` (`first_seen_at`);
