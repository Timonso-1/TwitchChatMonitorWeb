"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { adminSessions, adminUsers } from "@/lib/db/schema";
import { decrypt, randomToken, sha256 } from "@/lib/auth/crypto";
import { checkPasswordStrength, hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  consumeRecoveryCode,
  encryptTotpSecret,
  regenerateRecoveryCodes,
  verifyTotpCode,
  verifyTotpCodeRaw,
} from "@/lib/auth/totp";
import {
  SESSION_COOKIE_NAME,
  createSession,
  destroyAllSessionsForUser,
  destroyCurrentSession,
  getSession,
  isTwoFactorEnforced,
  markSessionTwoFactorVerified,
  pruneExpiredSessions,
} from "@/lib/auth/session";
import { errorState, fromZodError, successState, type ActionState } from "./types";

const MAX_LOGIN_ATTEMPTS = Number(process.env.MAX_LOGIN_ATTEMPTS ?? 5);
const LOCKOUT_MINUTES = Number(process.env.LOCKOUT_MINUTES ?? 15);

/**
 * Damit ein nicht existierender Account dieselbe Laufzeit erzeugt wie ein
 * existierender (Schutz gegen User-Enumeration per Timing), wird beim ersten
 * Bedarf ein echter Argon2-Hash eines Zufallspassworts erzeugt und gecacht.
 */
let dummyHashPromise: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomToken(24));
  return dummyHashPromise;
}

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Benutzername oder E-Mail erforderlich.").max(255),
  password: z.string().min(1, "Passwort erforderlich.").max(128),
});

/** Schritt 1: Benutzername/E-Mail + Passwort. */
export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) return fromZodError(parsed.error);

  const { identifier, password } = parsed.data;
  const normalized = identifier.toLowerCase();

  const [user] = await db
    .select()
    .from(adminUsers)
    .where(
      identifier.includes("@")
        ? eq(adminUsers.email, normalized)
        : eq(adminUsers.username, normalized),
    )
    .limit(1);

  const genericError = errorState("Benutzername oder Passwort ist falsch.");

  if (!user) {
    // Konstante Laufzeit erzwingen.
    await verifyPassword(await getDummyHash(), password);
    await writeAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      actorName: identifier,
      outcome: "failure",
      note: "Unbekannter Account",
    });
    return genericError;
  }

  const now = new Date();

  if (user.lockedUntil && user.lockedUntil > now) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000);
    return errorState(`Account ist vorübergehend gesperrt. Bitte in ${minutes} Minute(n) erneut versuchen.`);
  }

  if (!user.isActive) {
    await writeAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      actorUuid: user.uuid,
      actorName: user.username,
      outcome: "failure",
      note: "Account deaktiviert",
    });
    return errorState("Dieser Account ist deaktiviert. Bitte wende dich an einen Administrator.");
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);

  if (!passwordValid) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_LOGIN_ATTEMPTS;

    await db
      .update(adminUsers)
      .set({
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : user.lockedUntil,
        updatedAt: now,
      })
      .where(eq(adminUsers.uuid, user.uuid));

    await writeAudit({
      action: shouldLock ? AUDIT_ACTIONS.LOGIN_LOCKED : AUDIT_ACTIONS.LOGIN_FAILED,
      actorUuid: user.uuid,
      actorName: user.username,
      outcome: "failure",
      metadata: { attempts },
    });

    if (shouldLock) {
      return errorState(
        `Zu viele Fehlversuche. Der Account ist für ${LOCKOUT_MINUTES} Minuten gesperrt.`,
      );
    }

    return genericError;
  }

  // Erfolgreiche Passwortprüfung.
  await db
    .update(adminUsers)
    .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: now })
    .where(eq(adminUsers.uuid, user.uuid));

  await pruneExpiredSessions();

  // Session anlegen: 2FA-Flag nur dann direkt true, wenn kein TOTP hinterlegt ist.
  await createSession(user.uuid, !user.totpEnabled);

  if (user.totpEnabled) {
    redirect("/login/2fa");
  }

  await db
    .update(adminUsers)
    .set({ lastLoginAt: now })
    .where(eq(adminUsers.uuid, user.uuid));

  await writeAudit({
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    actorUuid: user.uuid,
    actorName: user.username,
    metadata: { twoFactor: false },
  });

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  if (isTwoFactorEnforced()) {
    redirect("/setup-2fa");
  }

  redirect("/dashboard");
}

const twoFactorSchema = z.object({
  code: z.string().trim().min(1, "Code erforderlich.").max(32),
  mode: z.enum(["totp", "recovery"]).default("totp"),
});

/** Schritt 2: TOTP-Code oder Recovery-Code. */
export async function verifyTwoFactorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.twoFactorVerified) {
    redirect("/dashboard");
  }

  const parsed = twoFactorSchema.safeParse({
    code: formData.get("code"),
    mode: formData.get("mode") ?? "totp",
  });

  if (!parsed.success) return fromZodError(parsed.error);

  const [user] = await db
    .select({
      uuid: adminUsers.uuid,
      username: adminUsers.username,
      totpSecret: adminUsers.totpSecret,
      totpEnabled: adminUsers.totpEnabled,
      mustChangePassword: adminUsers.mustChangePassword,
    })
    .from(adminUsers)
    .where(eq(adminUsers.uuid, session.userUuid))
    .limit(1);

  if (!user?.totpEnabled || !user.totpSecret) {
    await markSessionTwoFactorVerified(session.id);
    redirect("/dashboard");
  }

  const { code, mode } = parsed.data;
  let valid = false;
  let usedRecovery = false;

  if (mode === "recovery") {
    valid = await consumeRecoveryCode(user.uuid, code);
    usedRecovery = valid;
  } else {
    valid = verifyTotpCode(user.totpSecret, code);
  }

  if (!valid) {
    await writeAudit({
      action: AUDIT_ACTIONS.TWO_FACTOR_FAILED,
      actorUuid: user.uuid,
      actorName: user.username,
      outcome: "failure",
      metadata: { mode },
    });
    return errorState(
      mode === "recovery" ? "Recovery-Code ist ungültig oder bereits verbraucht." : "Der Code ist ungültig.",
    );
  }

  await markSessionTwoFactorVerified(session.id);
  await db
    .update(adminUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(adminUsers.uuid, user.uuid));

  await writeAudit({
    action: usedRecovery ? AUDIT_ACTIONS.TWO_FACTOR_RECOVERY_USED : AUDIT_ACTIONS.TWO_FACTOR_SUCCESS,
    actorUuid: user.uuid,
    actorName: user.username,
  });
  await writeAudit({
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    actorUuid: user.uuid,
    actorName: user.username,
    metadata: { twoFactor: true, recovery: usedRecovery },
  });

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  redirect("/dashboard");
}

const confirmSchema = z.object({
  secretToken: z.string().trim().min(16, "Ungültiges Setup-Token."),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Bitte den sechsstelligen Code aus deiner App eingeben."),
});

/** Bestätigt das 2FA-Setup und gibt die Recovery-Codes einmalig zurück. */
export async function confirmTwoFactorSetup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const parsed = confirmSchema.safeParse({
    secretToken: formData.get("secretToken"),
    code: formData.get("code"),
  });

  if (!parsed.success) return fromZodError(parsed.error);

  let secret: string;
  try {
    secret = decrypt(parsed.data.secretToken);
  } catch {
    return errorState("Das Setup ist abgelaufen oder ungültig. Bitte lade die Seite neu.");
  }

  if (!verifyTotpCodeRaw(secret, parsed.data.code)) {
    return errorState("Der Code stimmt nicht. Prüfe die Uhrzeit deines Geräts und versuche es erneut.");
  }

  const now = new Date();

  await db
    .update(adminUsers)
    .set({
      totpSecret: encryptTotpSecret(secret),
      totpEnabled: true,
      totpConfirmedAt: now,
      updatedAt: now,
    })
    .where(eq(adminUsers.uuid, session.userUuid));

  const recoveryCodes = await regenerateRecoveryCodes(session.userUuid);
  await markSessionTwoFactorVerified(session.id);

  await writeAudit({
    action: AUDIT_ACTIONS.TWO_FACTOR_ENABLED,
    actorUuid: session.userUuid,
    actorName: session.user.username,
  });

  return successState("Zwei-Faktor-Authentifizierung ist aktiv.", { recoveryCodes });
}

/** Erzeugt neue Recovery-Codes für den angemeldeten Nutzer. */
export async function regenerateOwnRecoveryCodes(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const password = String(formData.get("password") ?? "");
  if (password.length === 0) {
    return errorState("Bitte bestätige mit deinem Passwort.", { password: ["Passwort erforderlich."] });
  }

  const [user] = await db
    .select({ passwordHash: adminUsers.passwordHash, totpEnabled: adminUsers.totpEnabled })
    .from(adminUsers)
    .where(eq(adminUsers.uuid, session.userUuid))
    .limit(1);

  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    return errorState("Passwort ist falsch.", { password: ["Passwort ist falsch."] });
  }

  if (!user.totpEnabled) {
    return errorState("Zwei-Faktor-Authentifizierung ist für diesen Account nicht aktiv.");
  }

  const recoveryCodes = await regenerateRecoveryCodes(session.userUuid);

  await writeAudit({
    action: AUDIT_ACTIONS.RECOVERY_CODES_REGENERATED,
    actorUuid: session.userUuid,
    actorName: session.user.username,
  });

  return successState("Neue Recovery-Codes erzeugt. Die alten sind nun ungültig.", { recoveryCodes });
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Aktuelles Passwort erforderlich."),
    newPassword: z.string().min(1, "Neues Passwort erforderlich."),
    confirmPassword: z.string().min(1, "Bestätigung erforderlich."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Die Passwörter stimmen nicht überein.",
    path: ["confirmPassword"],
  });

/** Passwortwechsel durch den Nutzer selbst. Beendet alle anderen Sessions. */
export async function changeOwnPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) return fromZodError(parsed.error);

  const strength = checkPasswordStrength(parsed.data.newPassword);
  if (!strength.ok) {
    return errorState("Das neue Passwort erfüllt die Anforderungen nicht.", { newPassword: strength.errors });
  }

  const [user] = await db
    .select({ passwordHash: adminUsers.passwordHash })
    .from(adminUsers)
    .where(eq(adminUsers.uuid, session.userUuid))
    .limit(1);

  if (!user || !(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
    return errorState("Das aktuelle Passwort ist falsch.", { currentPassword: ["Passwort ist falsch."] });
  }

  if (await verifyPassword(user.passwordHash, parsed.data.newPassword)) {
    return errorState("Das neue Passwort muss sich vom alten unterscheiden.", {
      newPassword: ["Bitte ein anderes Passwort wählen."],
    });
  }

  const now = new Date();

  await db
    .update(adminUsers)
    .set({
      passwordHash: await hashPassword(parsed.data.newPassword),
      passwordChangedAt: now,
      mustChangePassword: false,
      updatedAt: now,
    })
    .where(eq(adminUsers.uuid, session.userUuid));

  // Alle anderen Geräte abmelden.
  await destroyAllSessionsForUser(session.userUuid, session.id);

  await writeAudit({
    action: AUDIT_ACTIONS.PASSWORD_CHANGED,
    actorUuid: session.userUuid,
    actorName: session.user.username,
  });

  return successState("Passwort geändert. Alle anderen Sitzungen wurden beendet.");
}

/** Deaktiviert 2FA für den eigenen Account (nur wenn nicht erzwungen). */
export async function disableOwnTwoFactor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");

  if (isTwoFactorEnforced()) {
    return errorState("Zwei-Faktor-Authentifizierung ist systemweit verpflichtend und kann nicht deaktiviert werden.");
  }

  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "");

  const [user] = await db
    .select({
      passwordHash: adminUsers.passwordHash,
      totpSecret: adminUsers.totpSecret,
      totpEnabled: adminUsers.totpEnabled,
    })
    .from(adminUsers)
    .where(eq(adminUsers.uuid, session.userUuid))
    .limit(1);

  if (!user?.totpEnabled || !user.totpSecret) {
    return errorState("Zwei-Faktor-Authentifizierung ist nicht aktiv.");
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    return errorState("Passwort ist falsch.", { password: ["Passwort ist falsch."] });
  }

  if (!verifyTotpCode(user.totpSecret, code)) {
    return errorState("Der Code ist ungültig.", { code: ["Code ist ungültig."] });
  }

  const now = new Date();

  await db
    .update(adminUsers)
    .set({ totpSecret: null, totpEnabled: false, totpConfirmedAt: null, updatedAt: now })
    .where(eq(adminUsers.uuid, session.userUuid));

  await writeAudit({
    action: AUDIT_ACTIONS.TWO_FACTOR_DISABLED,
    actorUuid: session.userUuid,
    actorName: session.user.username,
  });

  return successState("Zwei-Faktor-Authentifizierung deaktiviert.");
}

/** Beendet eine einzelne eigene Session (aus der Sitzungsliste im Profil). */
export async function revokeOwnSession(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const sessionId = String(formData.get("sessionId") ?? "");

  // Die aktuelle Sitzung kann hier nicht beendet werden – dafür gibt es "Abmelden".
  if (!sessionId || sessionId === session.id) return;

  await db
    .delete(adminSessions)
    .where(and(eq(adminSessions.id, sessionId), eq(adminSessions.userUuid, session.userUuid)));

  revalidatePath("/profile");
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();

  if (session) {
    await writeAudit({
      action: AUDIT_ACTIONS.LOGOUT,
      actorUuid: session.userUuid,
      actorName: session.user.username,
    });
  }

  await destroyCurrentSession();
  redirect("/login");
}

/** Bricht einen halbfertigen Login (2FA ausstehend) ab. */
export async function cancelLoginAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await db.delete(adminSessions).where(eq(adminSessions.id, sha256(token)));
    cookieStore.delete(SESSION_COOKIE_NAME);
  }

  redirect("/login");
}
