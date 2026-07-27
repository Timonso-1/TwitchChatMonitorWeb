import "server-only";
import { randomToken, sha256 } from "./crypto";

/**
 * Twitch-Anmeldung nach dem Authorization-Code-Flow.
 *
 * Das Panel nutzt Twitch ausschliesslich zur Identitätsfeststellung –
 * es werden keine Tokens gespeichert. Nach dem Abruf der eigenen
 * Twitch-Identität wird das Zugangstoken sofort verworfen.
 */

const AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const USERS_URL = "https://api.twitch.tv/helix/users";
const REVOKE_URL = "https://id.twitch.tv/oauth2/revoke";

export const OAUTH_STATE_COOKIE = "tp_twitch_state";
/** Der Vorgang muss innerhalb dieser Zeit abgeschlossen sein. */
export const OAUTH_STATE_MAX_AGE = 10 * 60;

export function isTwitchOAuthConfigured(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET && getRedirectUri());
}

/** Öffentliche Basis-URL des Panels (ohne trailing slash). */
export function getAppUrl(): string | null {
  const appUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
  return appUrl || null;
}

/**
 * Muss exakt mit dem Eintrag in der Twitch-Anwendung übereinstimmen –
 * Twitch vergleicht zeichengenau.
 */
export function getRedirectUri(): string | null {
  const explicit = process.env.TWITCH_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  const appUrl = getAppUrl();
  return appUrl ? `${appUrl}/auth/twitch/callback` : null;
}

/**
 * Absolute Redirect-URL für OAuth-Routen.
 * Nutzt APP_URL, damit hinter einem Reverse-Proxy nicht die interne
 * Adresse (z. B. localhost:3010) in den Location-Header wandert.
 */
export function absoluteAppUrl(path: string, request: Request): URL {
  const appUrl = getAppUrl();
  if (appUrl) return new URL(path, `${appUrl}/`);
  return new URL(path, request.url);
}

export interface OAuthStatePayload {
  /** Klartext für das Cookie. */
  raw: string;
  /** Hash für die URL – so steht das Geheimnis nie in der Adresszeile. */
  hashed: string;
}

export function createOAuthState(): OAuthStatePayload {
  const raw = randomToken(24);
  return { raw, hashed: sha256(raw) };
}

export function verifyOAuthState(cookieValue: string | undefined, stateFromUrl: string | null): boolean {
  if (!cookieValue || !stateFromUrl) return false;
  return sha256(cookieValue) === stateFromUrl;
}

/** Baut die Twitch-Anmelde-URL. */
export function buildAuthorizeUrl(state: string): string | null {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const redirectUri = getRedirectUri();
  if (!clientId || !redirectUri) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // Ohne Scope liefert /helix/users die eigene Identität ohne E-Mail –
    // mehr wird für die Verknüpfung nicht gebraucht.
    scope: "",
    state,
    // Erzwingt die Kontoauswahl, damit man nicht versehentlich
    // den bereits angemeldeten Twitch-Account verknüpft.
    force_verify: "true",
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface TwitchIdentity {
  userId: string;
  login: string;
  displayName: string;
  profileImageUrl: string | null;
}

/** Tauscht den Autorisierungscode gegen ein Token und liest die Identität aus. */
export async function exchangeCodeForIdentity(code: string): Promise<TwitchIdentity | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const redirectUri = getRedirectUri();

  if (!clientId || !clientSecret || !redirectUri) return null;

  let accessToken: string | null = null;

  try {
    const tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });

    if (!tokenResponse.ok) {
      console.error("[twitch-oauth] Token-Tausch fehlgeschlagen:", tokenResponse.status, await tokenResponse.text());
      return null;
    }

    const tokenData = (await tokenResponse.json()) as { access_token?: string };
    accessToken = tokenData.access_token ?? null;
    if (!accessToken) return null;

    const userResponse = await fetch(USERS_URL, {
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!userResponse.ok) {
      console.error("[twitch-oauth] Identitätsabruf fehlgeschlagen:", userResponse.status);
      return null;
    }

    const userData = (await userResponse.json()) as {
      data?: Array<{ id: string; login: string; display_name: string; profile_image_url: string }>;
    };

    const user = userData.data?.[0];
    if (!user) return null;

    return {
      userId: user.id,
      login: user.login,
      displayName: user.display_name,
      profileImageUrl: user.profile_image_url || null,
    };
  } catch (error) {
    console.error("[twitch-oauth] Anmeldung fehlgeschlagen:", error);
    return null;
  } finally {
    // Das Token wird nicht gespeichert – also sofort entwerten.
    if (accessToken) void revokeToken(accessToken, clientId);
  }
}

async function revokeToken(token: string, clientId: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, token }),
      cache: "no-store",
    });
  } catch {
    // Entwerten ist eine Aufräumaktion – ein Fehler darf den Login nicht stören.
  }
}

/** true, wenn jeder Account eine Twitch-Verknüpfung braucht. */
export function isTwitchLinkEnforced(): boolean {
  return (process.env.ENFORCE_TWITCH_LINK ?? "true").toLowerCase() !== "false";
}
