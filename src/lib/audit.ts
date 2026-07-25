import "server-only";
import { db } from "@/lib/db";
import { adminAuditLog } from "@/lib/db/schema";
import { getRequestContext } from "@/lib/auth/session";

export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "auth.login.success",
  LOGIN_FAILED: "auth.login.failed",
  LOGIN_LOCKED: "auth.login.locked",
  LOGOUT: "auth.logout",
  TWO_FACTOR_SUCCESS: "auth.2fa.success",
  TWO_FACTOR_FAILED: "auth.2fa.failed",
  TWO_FACTOR_RECOVERY_USED: "auth.2fa.recovery_used",
  TWO_FACTOR_ENABLED: "auth.2fa.enabled",
  TWO_FACTOR_DISABLED: "auth.2fa.disabled",
  TWO_FACTOR_RESET: "auth.2fa.reset",
  RECOVERY_CODES_REGENERATED: "auth.2fa.recovery_regenerated",
  PASSWORD_CHANGED: "auth.password.changed",
  PASSWORD_RESET: "auth.password.reset",

  ACCOUNT_CREATED: "account.created",
  ACCOUNT_UPDATED: "account.updated",
  ACCOUNT_DELETED: "account.deleted",
  ACCOUNT_ACTIVATED: "account.activated",
  ACCOUNT_DEACTIVATED: "account.deactivated",
  ACCOUNT_ROLES_CHANGED: "account.roles_changed",
  ACCOUNT_SESSIONS_REVOKED: "account.sessions_revoked",

  ROLE_CREATED: "role.created",
  ROLE_UPDATED: "role.updated",
  ROLE_DELETED: "role.deleted",

  CHANNEL_CREATED: "channel.created",
  CHANNEL_UPDATED: "channel.updated",
  CHANNEL_DELETED: "channel.deleted",

  VIEWER_NOTE_CREATED: "viewer_note.created",
  VIEWER_NOTE_UPDATED: "viewer_note.updated",
  VIEWER_NOTE_DELETED: "viewer_note.deleted",

  MESSAGES_EXPORTED: "messages.exported",

  TWITCH_LINKED: "auth.twitch.linked",
  TWITCH_UNLINKED: "auth.twitch.unlinked",
  TWITCH_LINK_FAILED: "auth.twitch.link_failed",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

const ACTION_LABELS: Record<string, string> = {
  [AUDIT_ACTIONS.LOGIN_SUCCESS]: "Anmeldung erfolgreich",
  [AUDIT_ACTIONS.LOGIN_FAILED]: "Anmeldung fehlgeschlagen",
  [AUDIT_ACTIONS.LOGIN_LOCKED]: "Account gesperrt",
  [AUDIT_ACTIONS.LOGOUT]: "Abmeldung",
  [AUDIT_ACTIONS.TWO_FACTOR_SUCCESS]: "2FA bestaetigt",
  [AUDIT_ACTIONS.TWO_FACTOR_FAILED]: "2FA fehlgeschlagen",
  [AUDIT_ACTIONS.TWO_FACTOR_RECOVERY_USED]: "Recovery-Code verwendet",
  [AUDIT_ACTIONS.TWO_FACTOR_ENABLED]: "2FA aktiviert",
  [AUDIT_ACTIONS.TWO_FACTOR_DISABLED]: "2FA deaktiviert",
  [AUDIT_ACTIONS.TWO_FACTOR_RESET]: "2FA zurueckgesetzt",
  [AUDIT_ACTIONS.RECOVERY_CODES_REGENERATED]: "Recovery-Codes neu erzeugt",
  [AUDIT_ACTIONS.PASSWORD_CHANGED]: "Passwort geaendert",
  [AUDIT_ACTIONS.PASSWORD_RESET]: "Passwort zurueckgesetzt",
  [AUDIT_ACTIONS.ACCOUNT_CREATED]: "Account angelegt",
  [AUDIT_ACTIONS.ACCOUNT_UPDATED]: "Account bearbeitet",
  [AUDIT_ACTIONS.ACCOUNT_DELETED]: "Account geloescht",
  [AUDIT_ACTIONS.ACCOUNT_ACTIVATED]: "Account aktiviert",
  [AUDIT_ACTIONS.ACCOUNT_DEACTIVATED]: "Account deaktiviert",
  [AUDIT_ACTIONS.ACCOUNT_ROLES_CHANGED]: "Rollen geaendert",
  [AUDIT_ACTIONS.ACCOUNT_SESSIONS_REVOKED]: "Sessions beendet",
  [AUDIT_ACTIONS.ROLE_CREATED]: "Rolle angelegt",
  [AUDIT_ACTIONS.ROLE_UPDATED]: "Rolle bearbeitet",
  [AUDIT_ACTIONS.ROLE_DELETED]: "Rolle geloescht",
  [AUDIT_ACTIONS.CHANNEL_CREATED]: "Channel angelegt",
  [AUDIT_ACTIONS.CHANNEL_UPDATED]: "Channel bearbeitet",
  [AUDIT_ACTIONS.CHANNEL_DELETED]: "Channel geloescht",
  [AUDIT_ACTIONS.VIEWER_NOTE_CREATED]: "Notiz angelegt",
  [AUDIT_ACTIONS.VIEWER_NOTE_UPDATED]: "Notiz bearbeitet",
  [AUDIT_ACTIONS.VIEWER_NOTE_DELETED]: "Notiz geloescht",
  [AUDIT_ACTIONS.MESSAGES_EXPORTED]: "Nachrichten exportiert",
  [AUDIT_ACTIONS.TWITCH_LINKED]: "Twitch verknuepft",
  [AUDIT_ACTIONS.TWITCH_UNLINKED]: "Twitch-Verknuepfung geloest",
  [AUDIT_ACTIONS.TWITCH_LINK_FAILED]: "Twitch-Verknuepfung fehlgeschlagen",
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export interface AuditInput {
  action: AuditAction | string;
  actorUuid?: string | null;
  actorName?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown> | null;
  outcome?: "success" | "failure";
  note?: string | null;
}

/**
 * Schreibt einen Audit-Eintrag. Fehler beim Loggen duerfen den
 * eigentlichen Vorgang niemals abbrechen.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    const context = await getRequestContext();

    await db.insert(adminAuditLog).values({
      actorUuid: input.actorUuid ?? null,
      actorName: input.actorName ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      targetLabel: input.targetLabel ?? null,
      metadata: input.metadata ?? null,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      outcome: input.outcome ?? "success",
      note: input.note ?? null,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("[audit] Eintrag konnte nicht geschrieben werden:", error);
  }
}
