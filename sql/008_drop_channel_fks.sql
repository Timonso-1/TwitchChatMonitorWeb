-- =====================================================================
-- TwitchPanel - Fremdschluessel auf `channels` entfernen
--
-- Warum:
-- Die vom Bot angelegten Constraints stehen auf ON DELETE RESTRICT und
-- `channel_uuid` ist ueberall NOT NULL. Dadurch laesst sich ein Channel,
-- fuer den schon Daten aufgezeichnet wurden, gar nicht loeschen - MySQL
-- meldet ER_ROW_IS_REFERENCED_2 (errno 1451).
--
-- Gewuenschtes Verhalten: der Eintrag verschwindet aus `channels`,
-- Nachrichten, Events und Moderationsaktionen bleiben erhalten. Das geht
-- nur ohne diese Constraints.
--
-- Unbedenklich, weil das Panel `channels` nirgends in die Abfragen von
-- messages/events/moderation_actions joint. Diese Tabellen tragen
-- `channel_id` und `channel_name` denormalisiert mit und bleiben ohne
-- den Channel-Datensatz vollstaendig lesbar.
--
-- Die Indizes auf `channel_uuid` bleiben bestehen; DROP FOREIGN KEY
-- entfernt nur den Constraint, nicht den darunterliegenden Index.
--
-- Vorher pruefen, welche Constraints wirklich existieren:
--   SELECT CONSTRAINT_NAME, TABLE_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
--    WHERE CONSTRAINT_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'channels';
-- MySQL bricht mit Fehler ab, wenn ein Constraint-Name nicht existiert.
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE `events` DROP FOREIGN KEY `fk_events_channel_uuid__uuid`;

ALTER TABLE `messages` DROP FOREIGN KEY `fk_messages_channel_uuid__uuid`;

ALTER TABLE `moderation_actions` DROP FOREIGN KEY `fk_moderation_actions_channel_uuid__uuid`;
