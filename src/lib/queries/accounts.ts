import "server-only";
import { and, count, desc, eq, gt, gte, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adminAuditLog,
  adminRolePermissions,
  adminRoles,
  adminSessions,
  adminUserRoles,
  adminUsers,
} from "@/lib/db/schema";

export interface AccountRole {
  uuid: string;
  key: string;
  name: string;
  color: string;
  priority: number;
}

export interface AccountListItem {
  uuid: string;
  email: string;
  username: string;
  displayName: string | null;
  twitchUserId: string | null;
  twitchLogin: string | null;
  twitchDisplayName: string | null;
  twitchProfileImageUrl: string | null;
  isActive: boolean;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  roles: AccountRole[];
  activeSessions: number;
  maxPriority: number;
}

export interface AccountFilters {
  search?: string;
  status?: "all" | "active" | "inactive" | "locked" | "no2fa";
  roleUuid?: string;
  page: number;
  pageSize: number;
}

/** Lädt Rollen für mehrere Accounts in einer Abfrage. */
async function loadRolesFor(userUuids: string[]): Promise<Map<string, AccountRole[]>> {
  const result = new Map<string, AccountRole[]>();
  if (userUuids.length === 0) return result;

  const rows = await db
    .select({
      userUuid: adminUserRoles.userUuid,
      uuid: adminRoles.uuid,
      key: adminRoles.key,
      name: adminRoles.name,
      color: adminRoles.color,
      priority: adminRoles.priority,
    })
    .from(adminUserRoles)
    .innerJoin(adminRoles, eq(adminUserRoles.roleUuid, adminRoles.uuid))
    .where(inArray(adminUserRoles.userUuid, userUuids))
    .orderBy(desc(adminRoles.priority));

  for (const row of rows) {
    const list = result.get(row.userUuid) ?? [];
    list.push({ uuid: row.uuid, key: row.key, name: row.name, color: row.color, priority: row.priority });
    result.set(row.userUuid, list);
  }

  return result;
}

/** Zählt aktive Sessions je Account. */
async function loadSessionCounts(userUuids: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (userUuids.length === 0) return result;

  const rows = await db
    .select({ userUuid: adminSessions.userUuid, total: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(adminSessions)
    .where(and(inArray(adminSessions.userUuid, userUuids), gt(adminSessions.expiresAt, new Date())))
    .groupBy(adminSessions.userUuid);

  for (const row of rows) result.set(row.userUuid, row.total);
  return result;
}

export interface AccountStats {
  total: number;
  active: number;
  locked: number;
  no2fa: number;
}

/** Kennzahlen unabhängig von Filter und Seite – für die Kopfzeile der Accounts-Übersicht. */
export async function getAccountStats(): Promise<AccountStats> {
  const [totalRow, activeRow, lockedRow, no2faRow] = await Promise.all([
    db.select({ value: count() }).from(adminUsers),
    db.select({ value: count() }).from(adminUsers).where(eq(adminUsers.isActive, true)),
    db.select({ value: count() }).from(adminUsers).where(gt(adminUsers.lockedUntil, new Date())),
    db.select({ value: count() }).from(adminUsers).where(eq(adminUsers.totpEnabled, false)),
  ]);

  return {
    total: totalRow[0]?.value ?? 0,
    active: activeRow[0]?.value ?? 0,
    locked: lockedRow[0]?.value ?? 0,
    no2fa: no2faRow[0]?.value ?? 0,
  };
}

export async function listAccounts(filters: AccountFilters): Promise<{
  items: AccountListItem[];
  total: number;
}> {
  const conditions: SQL[] = [];

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    const condition = or(
      like(adminUsers.username, pattern),
      like(adminUsers.email, pattern),
      like(adminUsers.displayName, pattern),
    );
    if (condition) conditions.push(condition);
  }

  switch (filters.status) {
    case "active":
      conditions.push(eq(adminUsers.isActive, true));
      break;
    case "inactive":
      conditions.push(eq(adminUsers.isActive, false));
      break;
    case "locked":
      conditions.push(gt(adminUsers.lockedUntil, new Date()));
      break;
    case "no2fa":
      conditions.push(eq(adminUsers.totpEnabled, false));
      break;
    default:
      break;
  }

  if (filters.roleUuid) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${adminUserRoles} WHERE ${adminUserRoles.userUuid} = ${adminUsers.uuid} AND ${adminUserRoles.roleUuid} = ${filters.roleUuid})`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(adminUsers).where(where);

  const rows = await db
    .select({
      uuid: adminUsers.uuid,
      email: adminUsers.email,
      username: adminUsers.username,
      displayName: adminUsers.displayName,
      twitchUserId: adminUsers.twitchUserId,
      twitchLogin: adminUsers.twitchLogin,
      twitchDisplayName: adminUsers.twitchDisplayName,
      twitchProfileImageUrl: adminUsers.twitchProfileImageUrl,
      isActive: adminUsers.isActive,
      totpEnabled: adminUsers.totpEnabled,
      mustChangePassword: adminUsers.mustChangePassword,
      lockedUntil: adminUsers.lockedUntil,
      lastLoginAt: adminUsers.lastLoginAt,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .where(where)
    .orderBy(desc(adminUsers.isActive), adminUsers.username)
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const uuids = rows.map((row) => row.uuid);
  const [rolesByUser, sessionsByUser] = await Promise.all([loadRolesFor(uuids), loadSessionCounts(uuids)]);

  const items: AccountListItem[] = rows.map((row) => {
    const roles = rolesByUser.get(row.uuid) ?? [];
    return {
      ...row,
      roles,
      activeSessions: sessionsByUser.get(row.uuid) ?? 0,
      maxPriority: roles.reduce((max, role) => Math.max(max, role.priority), 0),
    };
  });

  return { items, total: totalRow?.value ?? 0 };
}

export interface AccountSession {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  twoFactorVerified: boolean;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
}

export interface AccountDetail extends AccountListItem {
  lastLoginIp: string | null;
  passwordChangedAt: Date | null;
  totpConfirmedAt: Date | null;
  twitchLinkedAt: Date | null;
  updatedAt: Date;
  sessions: AccountSession[];
  permissions: string[];
}

export async function getAccountDetail(uuid: string): Promise<AccountDetail | null> {
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.uuid, uuid)).limit(1);
  if (!user) return null;

  const [rolesByUser, sessions, permissionRows] = await Promise.all([
    loadRolesFor([uuid]),
    db
      .select({
        id: adminSessions.id,
        ipAddress: adminSessions.ipAddress,
        userAgent: adminSessions.userAgent,
        twoFactorVerified: adminSessions.twoFactorVerified,
        createdAt: adminSessions.createdAt,
        lastActiveAt: adminSessions.lastActiveAt,
        expiresAt: adminSessions.expiresAt,
      })
      .from(adminSessions)
      .where(and(eq(adminSessions.userUuid, uuid), gt(adminSessions.expiresAt, new Date())))
      .orderBy(desc(adminSessions.lastActiveAt)),
    db
      .select({ permission: adminRolePermissions.permission })
      .from(adminRolePermissions)
      .innerJoin(adminUserRoles, eq(adminRolePermissions.roleUuid, adminUserRoles.roleUuid))
      .where(eq(adminUserRoles.userUuid, uuid)),
  ]);

  const roles = rolesByUser.get(uuid) ?? [];

  return {
    uuid: user.uuid,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    twitchUserId: user.twitchUserId,
    twitchLogin: user.twitchLogin,
    twitchDisplayName: user.twitchDisplayName,
    twitchProfileImageUrl: user.twitchProfileImageUrl,
    twitchLinkedAt: user.twitchLinkedAt,
    isActive: user.isActive,
    totpEnabled: user.totpEnabled,
    mustChangePassword: user.mustChangePassword,
    lockedUntil: user.lockedUntil,
    lastLoginAt: user.lastLoginAt,
    lastLoginIp: user.lastLoginIp,
    passwordChangedAt: user.passwordChangedAt,
    totpConfirmedAt: user.totpConfirmedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles,
    maxPriority: roles.reduce((max, role) => Math.max(max, role.priority), 0),
    activeSessions: sessions.length,
    sessions,
    permissions: [...new Set(permissionRows.map((row) => row.permission))],
  };
}

// ---------------------------------------------------------------------------
// Rollen
// ---------------------------------------------------------------------------

export interface RoleListItem {
  uuid: string;
  key: string;
  name: string;
  description: string | null;
  priority: number;
  color: string;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

export async function listRoles(): Promise<RoleListItem[]> {
  const roles = await db.select().from(adminRoles).orderBy(desc(adminRoles.priority), adminRoles.name);
  if (roles.length === 0) return [];

  const uuids = roles.map((role) => role.uuid);

  const [permissionRows, userCountRows] = await Promise.all([
    db
      .select({ roleUuid: adminRolePermissions.roleUuid, permission: adminRolePermissions.permission })
      .from(adminRolePermissions)
      .where(inArray(adminRolePermissions.roleUuid, uuids)),
    db
      .select({ roleUuid: adminUserRoles.roleUuid, total: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(adminUserRoles)
      .where(inArray(adminUserRoles.roleUuid, uuids))
      .groupBy(adminUserRoles.roleUuid),
  ]);

  const permissionsByRole = new Map<string, string[]>();
  for (const row of permissionRows) {
    const list = permissionsByRole.get(row.roleUuid) ?? [];
    list.push(row.permission);
    permissionsByRole.set(row.roleUuid, list);
  }

  const userCountByRole = new Map(userCountRows.map((row) => [row.roleUuid, row.total]));

  return roles.map((role) => ({
    uuid: role.uuid,
    key: role.key,
    name: role.name,
    description: role.description,
    priority: role.priority,
    color: role.color,
    isSystem: role.isSystem,
    permissions: permissionsByRole.get(role.uuid) ?? [],
    userCount: userCountByRole.get(role.uuid) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Audit-Log
// ---------------------------------------------------------------------------

export interface AuditFilters {
  actor?: string;
  action?: string;
  outcome?: "all" | "success" | "failure";
  page: number;
  pageSize: number;
}

export interface AuditListItem {
  id: number;
  actorName: string | null;
  actorUuid: string | null;
  action: string;
  targetType: string | null;
  targetLabel: string | null;
  targetId: string | null;
  outcome: string;
  ipAddress: string | null;
  userAgent: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface AuditStats {
  total: number;
  failures24h: number;
  lastEntryAt: Date | null;
}

/** Kennzahlen unabhängig von Filter und Seite – für die Kopfzeile des Audit-Logs. */
export async function getAuditStats(): Promise<AuditStats> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalRow, failureRow, lastRow] = await Promise.all([
    db.select({ value: count() }).from(adminAuditLog),
    db
      .select({ value: count() })
      .from(adminAuditLog)
      .where(and(eq(adminAuditLog.outcome, "failure"), gte(adminAuditLog.createdAt, since))),
    db.select({ createdAt: adminAuditLog.createdAt }).from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(1),
  ]);

  return {
    total: totalRow[0]?.value ?? 0,
    failures24h: failureRow[0]?.value ?? 0,
    lastEntryAt: lastRow[0]?.createdAt ?? null,
  };
}

export async function listAuditEntries(filters: AuditFilters): Promise<{
  items: AuditListItem[];
  total: number;
}> {
  const conditions: SQL[] = [];

  if (filters.actor) conditions.push(like(adminAuditLog.actorName, `%${filters.actor}%`));
  if (filters.action) conditions.push(eq(adminAuditLog.action, filters.action));
  if (filters.outcome === "success") conditions.push(eq(adminAuditLog.outcome, "success"));
  if (filters.outcome === "failure") conditions.push(eq(adminAuditLog.outcome, "failure"));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(adminAuditLog).where(where);

  const items = await db
    .select({
      id: adminAuditLog.id,
      actorName: adminAuditLog.actorName,
      actorUuid: adminAuditLog.actorUuid,
      action: adminAuditLog.action,
      targetType: adminAuditLog.targetType,
      targetLabel: adminAuditLog.targetLabel,
      targetId: adminAuditLog.targetId,
      outcome: adminAuditLog.outcome,
      ipAddress: adminAuditLog.ipAddress,
      userAgent: adminAuditLog.userAgent,
      note: adminAuditLog.note,
      metadata: adminAuditLog.metadata,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .where(where)
    .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  return { items, total: totalRow?.value ?? 0 };
}

export async function listAuditActions(): Promise<string[]> {
  const rows = await db.selectDistinct({ action: adminAuditLog.action }).from(adminAuditLog).orderBy(adminAuditLog.action);
  return rows.map((row) => row.action);
}
