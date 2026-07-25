import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  datetime,
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Panel-eigene Tabellen fuer Authentifizierung, Rollen und Auditierung.
 * Bewusst mit Praefix `admin_`, damit es keine Kollision mit den Twitch-Tabellen gibt.
 */

export const adminUsers = mysqlTable(
  "admin_users",
  {
    uuid: char("uuid", { length: 36 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    username: varchar("username", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 96 }),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    /** AES-256-GCM verschluesseltes TOTP-Secret (Format: iv:tag:ciphertext, base64url). */
    totpSecret: varchar("totp_secret", { length: 512 }),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    totpConfirmedAt: datetime("totp_confirmed_at"),
    isActive: boolean("is_active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    failedLoginAttempts: int("failed_login_attempts").notNull().default(0),
    lockedUntil: datetime("locked_until"),
    lastLoginAt: datetime("last_login_at"),
    lastLoginIp: varchar("last_login_ip", { length: 45 }),
    passwordChangedAt: datetime("password_changed_at"),
    createdAt: datetime("created_at").notNull(),
    updatedAt: datetime("updated_at").notNull(),
    createdByUuid: char("created_by_uuid", { length: 36 }),
  },
  (table) => [
    primaryKey({ columns: [table.uuid] }),
    uniqueIndex("uq_admin_users_email").on(table.email),
    uniqueIndex("uq_admin_users_username").on(table.username),
    index("idx_admin_users_active").on(table.isActive),
  ],
);

export const adminRoles = mysqlTable(
  "admin_roles",
  {
    uuid: char("uuid", { length: 36 }).notNull(),
    /** Technischer Schluessel, z. B. "superadmin". Unveraenderlich bei Systemrollen. */
    key: varchar("key", { length: 64 }).notNull(),
    name: varchar("name", { length: 96 }).notNull(),
    description: varchar("description", { length: 255 }),
    /** Hoehere Zahl = maechtigere Rolle. Verhindert Rechte-Eskalation nach oben. */
    priority: int("priority").notNull().default(0),
    color: varchar("color", { length: 16 }).notNull().default("#8b5cf6"),
    /** Systemrollen koennen nicht geloescht werden. */
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: datetime("created_at").notNull(),
    updatedAt: datetime("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.uuid] }),
    uniqueIndex("uq_admin_roles_key").on(table.key),
    index("idx_admin_roles_priority").on(table.priority),
  ],
);

export const adminRolePermissions = mysqlTable(
  "admin_role_permissions",
  {
    roleUuid: char("role_uuid", { length: 36 }).notNull(),
    permission: varchar("permission", { length: 64 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roleUuid, table.permission] }),
    index("idx_role_permissions_permission").on(table.permission),
  ],
);

export const adminUserRoles = mysqlTable(
  "admin_user_roles",
  {
    userUuid: char("user_uuid", { length: 36 }).notNull(),
    roleUuid: char("role_uuid", { length: 36 }).notNull(),
    assignedAt: datetime("assigned_at").notNull(),
    assignedByUuid: char("assigned_by_uuid", { length: 36 }),
  },
  (table) => [
    primaryKey({ columns: [table.userUuid, table.roleUuid] }),
    index("idx_user_roles_role").on(table.roleUuid),
  ],
);

export const adminSessions = mysqlTable(
  "admin_sessions",
  {
    /** SHA-256-Hash des Session-Tokens. Das Klartext-Token liegt nur im Cookie. */
    id: char("id", { length: 64 }).notNull(),
    userUuid: char("user_uuid", { length: 36 }).notNull(),
    /** false, solange der 2FA-Schritt noch aussteht. */
    twoFactorVerified: boolean("two_factor_verified").notNull().default(false),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: varchar("user_agent", { length: 255 }),
    createdAt: datetime("created_at").notNull(),
    lastActiveAt: datetime("last_active_at").notNull(),
    expiresAt: datetime("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("idx_admin_sessions_user").on(table.userUuid),
    index("idx_admin_sessions_expires").on(table.expiresAt),
  ],
);

export const adminRecoveryCodes = mysqlTable(
  "admin_recovery_codes",
  {
    id: bigint("id", { mode: "number" }).autoincrement().notNull(),
    userUuid: char("user_uuid", { length: 36 }).notNull(),
    /** SHA-256-Hash des Recovery-Codes. */
    codeHash: char("code_hash", { length: 64 }).notNull(),
    usedAt: datetime("used_at"),
    createdAt: datetime("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("idx_recovery_codes_user").on(table.userUuid),
    uniqueIndex("uq_recovery_codes_hash").on(table.codeHash),
  ],
);

/**
 * Interne Notizen zu Twitch-Zuschauern.
 * Bezug ueber die Twitch-User-ID, damit Notizen auch dann erhalten bleiben,
 * wenn der Nutzer seinen Namen aendert.
 */
export const adminViewerNotes = mysqlTable(
  "admin_viewer_notes",
  {
    id: bigint("id", { mode: "number" }).autoincrement().notNull(),
    /** Twitch-User-ID (entspricht users.user_id). */
    viewerUserId: varchar("viewer_user_id", { length: 32 }).notNull(),
    /** Denormalisiert, damit die Notiz auch nach Namensaenderung zuordenbar bleibt. */
    viewerUserName: varchar("viewer_user_name", { length: 64 }),
    content: text("content").notNull(),
    /** "info" | "warning" | "critical" */
    severity: varchar("severity", { length: 16 }).notNull().default("info"),
    /** Angeheftete Notizen erscheinen ganz oben. */
    pinned: boolean("pinned").notNull().default(false),
    authorUuid: char("author_uuid", { length: 36 }),
    authorName: varchar("author_name", { length: 96 }).notNull(),
    createdAt: datetime("created_at").notNull(),
    updatedAt: datetime("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("idx_viewer_notes_viewer").on(table.viewerUserId),
    index("idx_viewer_notes_created").on(table.createdAt),
  ],
);

export const adminAuditLog = mysqlTable(
  "admin_audit_log",
  {
    id: bigint("id", { mode: "number" }).autoincrement().notNull(),
    actorUuid: char("actor_uuid", { length: 36 }),
    actorName: varchar("actor_name", { length: 96 }),
    action: varchar("action", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 32 }),
    targetId: varchar("target_id", { length: 96 }),
    targetLabel: varchar("target_label", { length: 128 }),
    metadata: json("metadata"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: varchar("user_agent", { length: 255 }),
    /** "success" | "failure" */
    outcome: varchar("outcome", { length: 16 }).notNull().default("success"),
    note: text("note"),
    createdAt: datetime("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("idx_audit_created").on(table.createdAt),
    index("idx_audit_actor").on(table.actorUuid),
    index("idx_audit_action").on(table.action),
  ],
);

export const adminUsersRelations = relations(adminUsers, ({ many }) => ({
  userRoles: many(adminUserRoles),
  sessions: many(adminSessions),
  recoveryCodes: many(adminRecoveryCodes),
}));

export const adminRolesRelations = relations(adminRoles, ({ many }) => ({
  permissions: many(adminRolePermissions),
  userRoles: many(adminUserRoles),
}));

export const adminUserRolesRelations = relations(adminUserRoles, ({ one }) => ({
  user: one(adminUsers, {
    fields: [adminUserRoles.userUuid],
    references: [adminUsers.uuid],
  }),
  role: one(adminRoles, {
    fields: [adminUserRoles.roleUuid],
    references: [adminRoles.uuid],
  }),
}));

export const adminRolePermissionsRelations = relations(adminRolePermissions, ({ one }) => ({
  role: one(adminRoles, {
    fields: [adminRolePermissions.roleUuid],
    references: [adminRoles.uuid],
  }),
}));

export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({
  user: one(adminUsers, {
    fields: [adminSessions.userUuid],
    references: [adminUsers.uuid],
  }),
}));

export type AdminUser = typeof adminUsers.$inferSelect;
export type NewAdminUser = typeof adminUsers.$inferInsert;
export type AdminRole = typeof adminRoles.$inferSelect;
export type NewAdminRole = typeof adminRoles.$inferInsert;
export type AdminSession = typeof adminSessions.$inferSelect;
export type AdminAuditEntry = typeof adminAuditLog.$inferSelect;
export type ViewerNote = typeof adminViewerNotes.$inferSelect;
export type NewViewerNote = typeof adminViewerNotes.$inferInsert;
