import "server-only";
import { redirect } from "next/navigation";
import { hasAnyPermission, hasPermission, type Permission } from "./permissions";
import { getSession, isTwoFactorEnforced, type ActiveSession } from "./session";
import { isTwitchLinkEnforced, isTwitchOAuthConfigured } from "./twitch-oauth";

/** Wird geworfen, wenn eine Server Action ohne ausreichende Rechte aufgerufen wird. */
export class AuthorizationError extends Error {
  constructor(message = "Keine Berechtigung für diese Aktion.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * Stellt sicher, dass eine vollständig authentifizierte Session existiert
 * (inklusive abgeschlossenem 2FA-Schritt). Leitet sonst weiter.
 */
export async function requireSession(): Promise<ActiveSession> {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.user.totpEnabled && !session.twoFactorVerified) {
    redirect("/login/2fa");
  }

  if (!session.user.totpEnabled && isTwoFactorEnforced()) {
    redirect("/setup-2fa");
  }

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  // Twitch-Verknüpfung ist der letzte Pflichtschritt der Einrichtung.
  if (!session.user.twitchUserId && isTwitchLinkEnforced() && isTwitchOAuthConfigured()) {
    redirect("/link-twitch");
  }

  return session;
}

/** Wie `requireSession`, erzwingt zusätzlich ein bestimmtes Recht. */
export async function requirePermission(permission: Permission): Promise<ActiveSession> {
  const session = await requireSession();

  if (!hasPermission(session.user.permissions, permission)) {
    redirect(`/forbidden?permission=${encodeURIComponent(permission)}`);
  }

  return session;
}

/** Erzwingt mindestens eines der angegebenen Rechte. */
export async function requireAnyPermission(permissions: readonly Permission[]): Promise<ActiveSession> {
  const session = await requireSession();

  if (!hasAnyPermission(session.user.permissions, permissions)) {
    redirect(`/forbidden?permission=${encodeURIComponent(permissions[0] ?? "")}`);
  }

  return session;
}

/**
 * Variante für Server Actions: wirft statt weiterzuleiten,
 * damit der Fehler als Formular-Ergebnis zurückgegeben werden kann.
 */
export async function assertPermission(permission: Permission): Promise<ActiveSession> {
  const session = await getSession();

  if (!session) {
    throw new AuthorizationError("Nicht angemeldet.");
  }
  if (session.user.totpEnabled && !session.twoFactorVerified) {
    throw new AuthorizationError("Zwei-Faktor-Authentifizierung nicht abgeschlossen.");
  }
  if (!hasPermission(session.user.permissions, permission)) {
    throw new AuthorizationError("Keine Berechtigung für diese Aktion.");
  }

  return session;
}

/** Session ohne Rechteprüfung, aber mit Login-Zwang (für Profil/Logout). */
export async function assertAuthenticated(): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) {
    throw new AuthorizationError("Nicht angemeldet.");
  }
  return session;
}

/**
 * Verhindert Rechte-Eskalation: ein Nutzer darf nur Accounts oder Rollen
 * bearbeiten, deren höchste Priorität unter seiner eigenen liegt.
 * Superadmins (Wildcard) sind ausgenommen.
 */
export function canManagePriority(session: ActiveSession, targetPriority: number): boolean {
  if (session.user.permissions.includes("*")) return true;
  return targetPriority < session.user.maxPriority;
}
