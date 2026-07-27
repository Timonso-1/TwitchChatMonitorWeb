/**
 * Zeitbasierte Indizes für Dashboard- und Listen-Auswertungen.
 *
 * Die bestehenden Indizes beginnen mit channel_uuid – Abfragen nur nach
 * received_at / occurred_at können sie nicht nutzen und scannen die Tabelle.
 *
 * Einmal ausführen:
 *   mysql -u … -p … < scripts/add-time-indexes.sql
 */

CREATE INDEX idx_messages_received ON messages (received_at);
CREATE INDEX idx_events_occurred ON events (occurred_at);
CREATE INDEX idx_modactions_occurred ON moderation_actions (occurred_at);
