import "server-only";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { adminRolePermissions, adminRoles, adminSessions, adminUserRoles, adminUsers } from "@/lib/db/schema";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE_NAME = "tp_session";

export function sessionTtlSeconds(): number {
  return Number(process.env.SESSION_TTL_SECONDS ?? 43_200);
}

function refreshThresholdSeconds(): number {
  return Number(process.env.SESSION_REFRESH_THRESHOLD_SECONDS ?? 3_600);
}

/**
 * Das Cookie lebt bewusst deutlich laenger als die Session in der Datenbank.
 * Massgeblich fuer die Gueltigkeit ist ausschliesslich `admin_sessions.expires_at`;
 * so kann eine Session serverseitig gleitend verlaengert werden, ohne dass das
 * Cookie bei jedem Seitenaufruf neu gesetzt werden muesste (was in React Server
 * Components ohnehin nicht erlaubt ist).
 */
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function isTwoFactorEnforced(): boolean {
  return (process.env.ENFORCE_2FA ?? "true").toLowerCase() !== "false";
}

export interface SessionRole {
  uuid: string;
  key: string;
  name: string;
  color: string;
  priority: number;
}

export interface SessionUser {
  uuid: string;
  email: string;
  username: string;
  displayName: string | null;
  isActive: boolean;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  roles: SessionRole[];
  permissions: string[];
  /** Hoechste Rollen-Prioritaet des Nutzers. Verhindert Eskalation nach oben. */
  maxPriority: number;
}

export interface ActiveSession {
  id: string;
  userUuid: string;
  twoFactorVerified: boolean;
  expiresAt: Date;
  user: SessionUser;
}

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Liest IP und User-Agent aus den Request-Headern (proxy-aware). */
export async function getRequestContext(): Promise<RequestContext> {
  const headerList = await headers();

  const forwardedFor = headerList.get("x-forwarded-for");
  const ipAddress =
    forwardedFor?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip")?.trim() ||
    headerList.get("cf-connecting-ip")?.trim() ||
    null;

  const userAgent = headerList.get("user-agent");

  return {
    ipAddress: ipAddress ? ipAddress.slice(0, 45) : null,
    userAgent: userAgent ? userAgent.slice(0, 255) : null,
  };
}

/**
 * Legt eine neue Session an und setzt das Cookie.
 * `twoFactorVerified` bleibt false, solange der 2FA-Schritt aussteht.
 */
export async function createSession(userUuid: string, twoFactorVerified: boolean): Promise<string> {
  const token = randomToken(32);
  const sessionId = sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionTtlSeconds() * 1000);
  const context = await getRequestContext();

  await db.insert(adminSessions).values({
    id: sessionId,
    userUuid,
    twoFactorVerified,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    createdAt: now,
    lastActiveAt: now,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return sessionId;
}

/** Markiert die aktuelle Session als 2FA-verifiziert. */
export async function markSessionTwoFactorVerified(sessionId: string): Promise<void> {
  await db
    .update(adminSessions)
    .set({ twoFactorVerified: true, lastActiveAt: new Date() })
    .where(eq(adminSessions.id, sessionId));
}

/** Beendet die aktuelle Session und loescht das Cookie. */
export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await db.delete(adminSessions).where(eq(adminSessions.id, sha256(token)));
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** Beendet alle Sessions eines Accounts, optional mit Ausnahme einer Session. */
export async function destroyAllSessionsForUser(userUuid: string, exceptSessionId?: string): Promise<void> {
  if (exceptSessionId) {
    await db
      .delete(adminSessions)
      .where(and(eq(adminSessions.userUuid, userUuid), ne(adminSessions.id, exceptSessionId)));
    return;
  }

  await db.delete(adminSessions).where(eq(adminSessions.userUuid, userUuid));
}

export async function destroySessionById(sessionId: string): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.id, sessionId));
}

/** Entfernt abgelaufene Sessions. Wird beim Login opportunistisch aufgerufen. */
export async function pruneExpiredSessions(): Promise<void> {
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date()));
}

/** Laedt Rollen und aggregierte Rechte eines Accounts. */
export async function loadUserAuthorization(userUuid: string): Promise<{
  roles: SessionRole[];
  permissions: string[];
  maxPriority: number;
}> {
  const roleRows = await db
    .select({
      uuid: adminRoles.uuid,
      key: adminRoles.key,
      name: adminRoles.name,
      color: adminRoles.color,
      priority: adminRoles.priority,
    })
    .from(adminUserRoles)
    .innerJoin(adminRoles, eq(adminUserRoles.roleUuid, adminRoles.uuid))
    .where(eq(adminUserRoles.userUuid, userUuid));

  if (roleRows.length === 0) {
    return { roles: [], permissions: [], maxPriority: 0 };
  }

  const permissionRows = await db
    .select({ permission: adminRolePermissions.permission })
    .from(adminRolePermissions)
    .innerJoin(adminUserRoles, eq(adminRolePermissions.roleUuid, adminUserRoles.roleUuid))
    .where(eq(adminUserRoles.userUuid, userUuid));

  const permissions = [...new Set(permissionRows.map((row) => row.permission))];
  const maxPriority = roleRows.reduce((max, role) => Math.max(max, role.priority), 0);

  return {
    roles: roleRows.sort((a, b) => b.priority - a.priority),
    permissions,
    maxPriority,
  };
}

/**
 * Liest die aktuelle Session aus dem Cookie und validiert sie gegen die Datenbank.
 * Ergebnis wird pro Request gecacht.
 */
export const getSession = cache(async (): Promise<ActiveSession | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const sessionId = sha256(token);
  const now = new Date();

  const [row] = await db
    .select({
      sessionId: adminSessions.id,
      twoFactorVerified: adminSessions.twoFactorVerified,
      expiresAt: adminSessions.expiresAt,
      userUuid: adminUsers.uuid,
      email: adminUsers.email,
      username: adminUsers.username,
      displayName: adminUsers.displayName,
      isActive: adminUsers.isActive,
      totpEnabled: adminUsers.totpEnabled,
      mustChangePassword: adminUsers.mustChangePassword,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.userUuid, adminUsers.uuid))
    .where(and(eq(adminSessions.id, sessionId), gt(adminSessions.expiresAt, now)))
    .limit(1);

  if (!row) return null;

  // Deaktivierte Accounts verlieren ihre Session sofort.
  if (!row.isActive) {
    await db.delete(adminSessions).where(eq(adminSessions.userUuid, row.userUuid));
    return null;
  }

  const authorization = await loadUserAuthorization(row.userUuid);

  // Gleitende Verlaengerung, wenn die Session bald ablaeuft.
  const remainingSeconds = (row.expiresAt.getTime() - now.getTime()) / 1000;
  let expiresAt = row.expiresAt;

  if (remainingSeconds < sessionTtlSeconds() - refreshThresholdSeconds()) {
    expiresAt = new Date(now.getTime() + sessionTtlSeconds() * 1000);
    await db
      .update(adminSessions)
      .set({ expiresAt, lastActiveAt: now })
      .where(eq(adminSessions.id, sessionId));
  }

  return {
    id: row.sessionId,
    userUuid: row.userUuid,
    twoFactorVerified: row.twoFactorVerified,
    expiresAt,
    user: {
      uuid: row.userUuid,
      email: row.email,
      username: row.username,
      displayName: row.displayName,
      isActive: row.isActive,
      totpEnabled: row.totpEnabled,
      mustChangePassword: row.mustChangePassword,
      roles: authorization.roles,
      permissions: authorization.permissions,
      maxPriority: authorization.maxPriority,
    },
  };
});
