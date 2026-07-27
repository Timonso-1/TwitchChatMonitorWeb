"use server";

import { and, eq, inArray, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { AuthorizationError, assertPermission, canManagePriority } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { checkPasswordStrength, generatePassword, hashPassword } from "@/lib/auth/password";
import { destroyAllSessionsForUser, type ActiveSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { adminRecoveryCodes, adminRoles, adminSessions, adminUserRoles, adminUsers } from "@/lib/db/schema";
import { errorState, fromZodError, successState, type ActionState } from "./types";

/** Kapselt den Berechtigungscheck und liefert eine Fehler-ActionState statt zu werfen. */
async function guard(permission: Parameters<typeof assertPermission>[0]) {
  try {
    return { session: await assertPermission(permission), error: null as ActionState | null };
  } catch (error) {
    return {
      session: null,
      error: errorState(error instanceof AuthorizationError ? error.message : "Unerwarteter Fehler."),
    };
  }
}

/** Ermittelt die höchste Rollen-Priorität eines Zielaccounts. */
async function getTargetPriority(userUuid: string): Promise<number> {
  const rows = await db
    .select({ priority: adminRoles.priority })
    .from(adminUserRoles)
    .innerJoin(adminRoles, eq(adminUserRoles.roleUuid, adminRoles.uuid))
    .where(eq(adminUserRoles.userUuid, userUuid));

  return rows.reduce((max, row) => Math.max(max, row.priority), 0);
}

/**
 * Prüft, ob der Handelnde die angegebenen Rollen vergeben darf.
 * Eine Rolle mit einer Priorität >= der eigenen darf nicht vergeben werden.
 */
async function validateAssignableRoles(
  session: ActiveSession,
  roleUuids: string[],
): Promise<{ ok: true; roles: Array<{ uuid: string; name: string; priority: number }> } | { ok: false; message: string }> {
  if (roleUuids.length === 0) return { ok: true, roles: [] };

  const roles = await db
    .select({ uuid: adminRoles.uuid, name: adminRoles.name, priority: adminRoles.priority })
    .from(adminRoles)
    .where(inArray(adminRoles.uuid, roleUuids));

  if (roles.length !== roleUuids.length) {
    return { ok: false, message: "Mindestens eine der gewählten Rollen existiert nicht." };
  }

  const isSuperadmin = session.user.permissions.includes("*");
  if (!isSuperadmin) {
    const tooHigh = roles.find((role) => role.priority >= session.user.maxPriority);
    if (tooHigh) {
      return {
        ok: false,
        message: `Du darfst die Rolle "${tooHigh.name}" nicht vergeben, weil sie mindestens deiner eigenen Berechtigungsstufe entspricht.`,
      };
    }
  }

  return { ok: true, roles };
}

function parseRoleUuids(formData: FormData): string[] {
  return formData
    .getAll("roles")
    .map((value) => String(value))
    .filter((value) => value.length > 0);
}

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Mindestens 3 Zeichen.")
    .max(64, "Maximal 64 Zeichen.")
    .regex(/^[a-z0-9._-]+$/, "Nur Kleinbuchstaben, Ziffern, Punkt, Bindestrich und Unterstrich."),
  email: z.string().trim().toLowerCase().email("Keine gültige E-Mail-Adresse.").max(255),
  displayName: z.string().trim().max(96).optional().or(z.literal("")),
  password: z.string().max(128).optional().or(z.literal("")),
});

export async function createAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.ACCOUNTS_CREATE);
  if (!session) return error!;

  const parsed = createSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
  });

  if (!parsed.success) return fromZodError(parsed.error);

  const roleUuids = parseRoleUuids(formData);
  const roleCheck = await validateAssignableRoles(session, roleUuids);
  if (!roleCheck.ok) return errorState(roleCheck.message);

  const [existing] = await db
    .select({ uuid: adminUsers.uuid, username: adminUsers.username, email: adminUsers.email })
    .from(adminUsers)
    .where(or(eq(adminUsers.username, parsed.data.username), eq(adminUsers.email, parsed.data.email)))
    .limit(1);

  if (existing) {
    return errorState(
      existing.username === parsed.data.username
        ? "Dieser Benutzername ist bereits vergeben."
        : "Diese E-Mail-Adresse ist bereits registriert.",
      existing.username === parsed.data.username
        ? { username: ["Bereits vergeben."] }
        : { email: ["Bereits registriert."] },
    );
  }

  // Leeres Passwortfeld => automatisch generieren.
  const generated = !parsed.data.password;
  const password = parsed.data.password || generatePassword();

  if (!generated) {
    const strength = checkPasswordStrength(password);
    if (!strength.ok) {
      return errorState("Das Passwort erfüllt die Anforderungen nicht.", { password: strength.errors });
    }
  }

  const uuid = uuidv4();
  const now = new Date();

  await db.insert(adminUsers).values({
    uuid,
    username: parsed.data.username,
    email: parsed.data.email,
    displayName: parsed.data.displayName || null,
    passwordHash: await hashPassword(password),
    isActive: true,
    mustChangePassword: true,
    createdAt: now,
    updatedAt: now,
    passwordChangedAt: now,
    createdByUuid: session.user.uuid,
  });

  if (roleUuids.length > 0) {
    await db.insert(adminUserRoles).values(
      roleUuids.map((roleUuid) => ({
        userUuid: uuid,
        roleUuid,
        assignedAt: now,
        assignedByUuid: session.user.uuid,
      })),
    );
  }

  await writeAudit({
    action: AUDIT_ACTIONS.ACCOUNT_CREATED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "account",
    targetId: uuid,
    targetLabel: parsed.data.username,
    metadata: { email: parsed.data.email, roles: roleCheck.roles.map((role) => role.name) },
  });

  revalidatePath("/accounts");

  return successState(
    `Account "${parsed.data.username}" wurde angelegt. Das Passwort muss bei der ersten Anmeldung geändert werden.`,
    { initialPassword: password, generated },
  );
}

const updateSchema = z.object({
  uuid: z.string().uuid("Ungültige Account-ID."),
  email: z.string().trim().toLowerCase().email("Keine gültige E-Mail-Adresse.").max(255),
  displayName: z.string().trim().max(96).optional().or(z.literal("")),
  isActive: z.boolean(),
});

export async function updateAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.ACCOUNTS_UPDATE);
  if (!session) return error!;

  const parsed = updateSchema.safeParse({
    uuid: formData.get("uuid"),
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  if (!parsed.success) return fromZodError(parsed.error);

  const [target] = await db.select().from(adminUsers).where(eq(adminUsers.uuid, parsed.data.uuid)).limit(1);
  if (!target) return errorState("Account wurde nicht gefunden.");

  const targetPriority = await getTargetPriority(target.uuid);
  if (target.uuid !== session.user.uuid && !canManagePriority(session, targetPriority)) {
    return errorState("Dieser Account hat mindestens deine eigene Berechtigungsstufe und kann nicht bearbeitet werden.");
  }

  if (target.uuid === session.user.uuid && !parsed.data.isActive) {
    return errorState("Du kannst deinen eigenen Account nicht deaktivieren.");
  }

  const [conflict] = await db
    .select({ uuid: adminUsers.uuid })
    .from(adminUsers)
    .where(and(eq(adminUsers.email, parsed.data.email), ne(adminUsers.uuid, parsed.data.uuid)))
    .limit(1);

  if (conflict) {
    return errorState("Diese E-Mail-Adresse gehört bereits zu einem anderen Account.", {
      email: ["Bereits registriert."],
    });
  }

  const roleUuids = parseRoleUuids(formData);
  const roleCheck = await validateAssignableRoles(session, roleUuids);
  if (!roleCheck.ok) return errorState(roleCheck.message);

  const now = new Date();

  await db
    .update(adminUsers)
    .set({
      email: parsed.data.email,
      displayName: parsed.data.displayName || null,
      isActive: parsed.data.isActive,
      updatedAt: now,
    })
    .where(eq(adminUsers.uuid, parsed.data.uuid));

  // Rollen komplett neu setzen.
  const previousRoles = await db
    .select({ name: adminRoles.name })
    .from(adminUserRoles)
    .innerJoin(adminRoles, eq(adminUserRoles.roleUuid, adminRoles.uuid))
    .where(eq(adminUserRoles.userUuid, parsed.data.uuid));

  await db.delete(adminUserRoles).where(eq(adminUserRoles.userUuid, parsed.data.uuid));

  if (roleUuids.length > 0) {
    await db.insert(adminUserRoles).values(
      roleUuids.map((roleUuid) => ({
        userUuid: parsed.data.uuid,
        roleUuid,
        assignedAt: now,
        assignedByUuid: session.user.uuid,
      })),
    );
  }

  // Deaktivierte Accounts verlieren sofort alle Sessions.
  if (!parsed.data.isActive) {
    await destroyAllSessionsForUser(parsed.data.uuid);
  }

  await writeAudit({
    action: AUDIT_ACTIONS.ACCOUNT_UPDATED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "account",
    targetId: parsed.data.uuid,
    targetLabel: target.username,
    metadata: {
      before: {
        email: target.email,
        displayName: target.displayName,
        isActive: target.isActive,
        roles: previousRoles.map((role) => role.name),
      },
      after: {
        email: parsed.data.email,
        displayName: parsed.data.displayName || null,
        isActive: parsed.data.isActive,
        roles: roleCheck.roles.map((role) => role.name),
      },
    },
  });

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${parsed.data.uuid}`);
  return successState("Account wurde aktualisiert.");
}

export async function resetAccountPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.ACCOUNTS_UPDATE);
  if (!session) return error!;

  const uuid = String(formData.get("uuid") ?? "");

  const [target] = await db.select().from(adminUsers).where(eq(adminUsers.uuid, uuid)).limit(1);
  if (!target) return errorState("Account wurde nicht gefunden.");

  const targetPriority = await getTargetPriority(uuid);
  if (uuid !== session.user.uuid && !canManagePriority(session, targetPriority)) {
    return errorState("Dieser Account hat mindestens deine eigene Berechtigungsstufe.");
  }

  const password = generatePassword();
  const now = new Date();

  await db
    .update(adminUsers)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      passwordChangedAt: now,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    })
    .where(eq(adminUsers.uuid, uuid));

  await destroyAllSessionsForUser(uuid);

  await writeAudit({
    action: AUDIT_ACTIONS.PASSWORD_RESET,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "account",
    targetId: uuid,
    targetLabel: target.username,
  });

  revalidatePath(`/accounts/${uuid}`);
  return successState("Passwort wurde zurückgesetzt. Alle Sitzungen des Accounts wurden beendet.", {
    initialPassword: password,
  });
}

export async function resetAccountTwoFactorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.ACCOUNTS_RESET_2FA);
  if (!session) return error!;

  const uuid = String(formData.get("uuid") ?? "");

  const [target] = await db.select().from(adminUsers).where(eq(adminUsers.uuid, uuid)).limit(1);
  if (!target) return errorState("Account wurde nicht gefunden.");

  const targetPriority = await getTargetPriority(uuid);
  if (uuid !== session.user.uuid && !canManagePriority(session, targetPriority)) {
    return errorState("Dieser Account hat mindestens deine eigene Berechtigungsstufe.");
  }

  const now = new Date();

  await db
    .update(adminUsers)
    .set({ totpSecret: null, totpEnabled: false, totpConfirmedAt: null, updatedAt: now })
    .where(eq(adminUsers.uuid, uuid));

  await db.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userUuid, uuid));
  await destroyAllSessionsForUser(uuid);

  await writeAudit({
    action: AUDIT_ACTIONS.TWO_FACTOR_RESET,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "account",
    targetId: uuid,
    targetLabel: target.username,
    note: "Der Nutzer muss 2FA bei der nächsten Anmeldung neu einrichten.",
  });

  revalidatePath(`/accounts/${uuid}`);
  return successState("Zwei-Faktor-Authentifizierung wurde zurückgesetzt.");
}

export async function unlockAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.ACCOUNTS_UPDATE);
  if (!session) return error!;

  const uuid = String(formData.get("uuid") ?? "");

  const [target] = await db.select().from(adminUsers).where(eq(adminUsers.uuid, uuid)).limit(1);
  if (!target) return errorState("Account wurde nicht gefunden.");

  await db
    .update(adminUsers)
    .set({ lockedUntil: null, failedLoginAttempts: 0, updatedAt: new Date() })
    .where(eq(adminUsers.uuid, uuid));

  await writeAudit({
    action: AUDIT_ACTIONS.ACCOUNT_UPDATED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "account",
    targetId: uuid,
    targetLabel: target.username,
    note: "Sperre aufgehoben",
  });

  revalidatePath(`/accounts/${uuid}`);
  return successState("Die Sperre wurde aufgehoben.");
}

export async function revokeAccountSessionsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.ACCOUNTS_MANAGE_SESSIONS);
  if (!session) return error!;

  const uuid = String(formData.get("uuid") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");

  const [target] = await db.select().from(adminUsers).where(eq(adminUsers.uuid, uuid)).limit(1);
  if (!target) return errorState("Account wurde nicht gefunden.");

  const targetPriority = await getTargetPriority(uuid);
  if (uuid !== session.user.uuid && !canManagePriority(session, targetPriority)) {
    return errorState("Dieser Account hat mindestens deine eigene Berechtigungsstufe.");
  }

  if (sessionId) {
    await db.delete(adminSessions).where(and(eq(adminSessions.id, sessionId), eq(adminSessions.userUuid, uuid)));
  } else {
    await destroyAllSessionsForUser(uuid);
  }

  await writeAudit({
    action: AUDIT_ACTIONS.ACCOUNT_SESSIONS_REVOKED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "account",
    targetId: uuid,
    targetLabel: target.username,
    metadata: { scope: sessionId ? "single" : "all" },
  });

  revalidatePath(`/accounts/${uuid}`);
  return successState(sessionId ? "Sitzung wurde beendet." : "Alle Sitzungen wurden beendet.");
}

/**
 * Löst die Twitch-Verknüpfung eines Accounts.
 * Bewusst nur für Administratoren – sonst könnte sich jemand
 * unbemerkt hinter einem anderen Twitch-Namen verstecken.
 */
export async function unlinkTwitchAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.ACCOUNTS_UPDATE);
  if (!session) return error!;

  const uuid = String(formData.get("uuid") ?? "");

  const [target] = await db.select().from(adminUsers).where(eq(adminUsers.uuid, uuid)).limit(1);
  if (!target) return errorState("Account wurde nicht gefunden.");

  if (!target.twitchUserId) {
    return errorState("Für diesen Account besteht keine Twitch-Verknüpfung.");
  }

  const targetPriority = await getTargetPriority(uuid);
  if (uuid !== session.user.uuid && !canManagePriority(session, targetPriority)) {
    return errorState("Dieser Account hat mindestens deine eigene Berechtigungsstufe.");
  }

  const now = new Date();

  await db
    .update(adminUsers)
    .set({
      twitchUserId: null,
      twitchLogin: null,
      twitchDisplayName: null,
      twitchProfileImageUrl: null,
      twitchLinkedAt: null,
      updatedAt: now,
    })
    .where(eq(adminUsers.uuid, uuid));

  await writeAudit({
    action: AUDIT_ACTIONS.TWITCH_UNLINKED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "account",
    targetId: uuid,
    targetLabel: target.username,
    metadata: { previousTwitchLogin: target.twitchLogin },
    note: "Der Nutzer muss beim nächsten Login neu verknüpfen.",
  });

  revalidatePath(`/accounts/${uuid}`);
  return successState("Twitch-Verknüpfung wurde gelöst.");
}

export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.ACCOUNTS_DELETE);
  if (!session) return error!;

  const uuid = String(formData.get("uuid") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  if (uuid === session.user.uuid) {
    return errorState("Du kannst deinen eigenen Account nicht löschen.");
  }

  const [target] = await db.select().from(adminUsers).where(eq(adminUsers.uuid, uuid)).limit(1);
  if (!target) return errorState("Account wurde nicht gefunden.");

  const targetPriority = await getTargetPriority(uuid);
  if (!canManagePriority(session, targetPriority)) {
    return errorState("Dieser Account hat mindestens deine eigene Berechtigungsstufe.");
  }

  if (confirmation.toLowerCase() !== target.username.toLowerCase()) {
    return errorState("Zur Bestätigung bitte den Benutzernamen exakt eingeben.", {
      confirmation: ["Benutzername stimmt nicht überein."],
    });
  }

  await db.delete(adminUsers).where(eq(adminUsers.uuid, uuid));

  await writeAudit({
    action: AUDIT_ACTIONS.ACCOUNT_DELETED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "account",
    targetId: uuid,
    targetLabel: target.username,
    metadata: { email: target.email },
  });

  revalidatePath("/accounts");
  return successState(`Account "${target.username}" wurde gelöscht.`);
}
