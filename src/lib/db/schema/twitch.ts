import {
  bigint,
  boolean,
  char,
  datetime,
  index,
  int,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Bestehende Twitch-Tabellen.
 * Diese Definitionen bilden das vorhandene Schema ab und werden vom Panel
 * ausschliesslich gelesen bzw. (bei channels) gepflegt.
 */

export const channels = mysqlTable(
  "channels",
  {
    uuid: char("uuid", { length: 36 }).notNull(),
    broadcasterId: varchar("broadcaster_id", { length: 32 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: datetime("created_at").notNull(),
    updatedAt: datetime("updated_at").notNull(),
    createdByUuid: char("created_by_uuid", { length: 36 }),
    createdByName: varchar("created_by_name", { length: 64 }),
  },
  (table) => [
    primaryKey({ columns: [table.uuid] }),
    uniqueIndex("uq_channels_broadcaster_id").on(table.broadcasterId),
    index("idx_channels_name").on(table.name),
    index("idx_channels_active").on(table.active),
  ],
);

export const events = mysqlTable(
  "events",
  {
    id: bigint("id", { mode: "number" }).autoincrement().notNull(),
    channelUuid: char("channel_uuid", { length: 36 }).notNull(),
    channelId: varchar("channel_id", { length: 32 }).notNull(),
    channelName: varchar("channel_name", { length: 64 }).notNull(),
    eventType: varchar("event_type", { length: 24 }).notNull(),
    userId: varchar("user_id", { length: 32 }),
    userName: varchar("user_name", { length: 64 }),
    giftedByName: varchar("gifted_by_name", { length: 64 }),
    subTier: varchar("sub_tier", { length: 16 }),
    months: int("months"),
    giftCount: int("gift_count"),
    viewerCount: int("viewer_count"),
    message: text("message"),
    occurredAt: datetime("occurred_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("idx_events_channel_occurred").on(table.channelUuid, table.occurredAt),
    index("idx_events_type").on(table.eventType),
    index("idx_events_user").on(table.userId),
  ],
);

export const messages = mysqlTable(
  "messages",
  {
    id: bigint("id", { mode: "number" }).autoincrement().notNull(),
    channelUuid: char("channel_uuid", { length: 36 }).notNull(),
    channelId: varchar("channel_id", { length: 32 }).notNull(),
    channelName: varchar("channel_name", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 32 }).notNull(),
    userName: varchar("user_name", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 64 }),
    isMod: boolean("is_mod").notNull().default(false),
    isSubscriber: boolean("is_subscriber").notNull().default(false),
    isVip: boolean("is_vip").notNull().default(false),
    isBroadcaster: boolean("is_broadcaster").notNull().default(false),
    isTurbo: boolean("is_turbo").notNull().default(false),
    isFirstMessage: boolean("is_first_message").notNull().default(false),
    isAction: boolean("is_action").notNull().default(false),
    badges: varchar("badges", { length: 512 }),
    badgeInfo: varchar("badge_info", { length: 255 }),
    color: varchar("color", { length: 16 }),
    bits: int("bits").notNull().default(0),
    content: text("content").notNull(),
    emotes: text("emotes"),
    replyToMessageId: varchar("reply_to_message_id", { length: 64 }),
    messageId: varchar("message_id", { length: 64 }).notNull(),
    receivedAt: datetime("received_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("idx_messages_channel_received").on(table.channelUuid, table.receivedAt),
    index("idx_messages_user").on(table.userId),
    index("idx_messages_message_id").on(table.messageId),
  ],
);

export const moderationActions = mysqlTable(
  "moderation_actions",
  {
    id: bigint("id", { mode: "number" }).autoincrement().notNull(),
    channelUuid: char("channel_uuid", { length: 36 }).notNull(),
    channelId: varchar("channel_id", { length: 32 }).notNull(),
    channelName: varchar("channel_name", { length: 64 }).notNull(),
    action: varchar("action", { length: 16 }).notNull(),
    targetUserId: varchar("target_user_id", { length: 32 }),
    targetUserName: varchar("target_user_name", { length: 64 }),
    durationSeconds: int("duration_seconds"),
    reason: varchar("reason", { length: 500 }),
    deletedMessageId: varchar("deleted_message_id", { length: 64 }),
    deletedMessageContent: text("deleted_message_content"),
    occurredAt: datetime("occurred_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("idx_modactions_channel_occurred").on(table.channelUuid, table.occurredAt),
    index("idx_modactions_action").on(table.action),
    index("idx_modactions_target").on(table.targetUserId),
  ],
);

/** Twitch-Zuschauer (NICHT die Panel-Accounts, siehe schema/auth.ts). */
export const viewers = mysqlTable(
  "users",
  {
    userId: varchar("user_id", { length: 32 }).notNull(),
    userName: varchar("user_name", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 64 }),
    firstSeenAt: datetime("first_seen_at").notNull(),
    lastSeenAt: datetime("last_seen_at").notNull(),
    messageCount: bigint("message_count", { mode: "number" }).notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.userId] }),
    index("idx_viewers_user_name").on(table.userName),
    index("idx_viewers_last_seen").on(table.lastSeenAt),
  ],
);

export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
export type TwitchEvent = typeof events.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ModerationAction = typeof moderationActions.$inferSelect;
export type Viewer = typeof viewers.$inferSelect;
