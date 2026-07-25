import "server-only";
import { inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminViewerProfiles } from "@/lib/db/schema";

/**
 * Anbindung an die Twitch-Helix-API zum Abruf von Profilbildern.
 *
 * Die Daten werden in `admin_viewer_profiles` zwischengespeichert und
 * erst nach Ablauf der Frist erneut geholt. Ohne hinterlegte Zugangsdaten
 * verhaelt sich das Modul still: es liefert einfach keine Bilder.
 */

const HELIX_USERS_URL = "https://api.twitch.tv/helix/users";
const OAUTH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";

/** Twitch erlaubt bis zu 100 IDs pro Anfrage. */
const MAX_IDS_PER_REQUEST = 100;

/** Nach dieser Zeit gilt ein zwischengespeicherter Eintrag als veraltet. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Nicht gefundene Accounts seltener erneut anfragen. */
const NOT_FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function isTwitchApiConfigured(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

// Token im Prozess halten – es ist rund 60 Tage gueltig.
const globalForToken = globalThis as unknown as { __twitchAppToken?: CachedToken };

async function getAppAccessToken(): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const cached = globalForToken.__twitchAppToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.value;
  }

  try {
    const response = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[twitch] Token-Abruf fehlgeschlagen:", response.status, await response.text());
      return null;
    }

    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    globalForToken.__twitchAppToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };

    return data.access_token;
  } catch (error) {
    console.error("[twitch] Token-Abruf fehlgeschlagen:", error);
    return null;
  }
}

interface HelixUser {
  id: string;
  login: string;
  display_name: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  broadcaster_type: string;
  created_at: string;
}

async function fetchUsersFromApi(userIds: string[]): Promise<HelixUser[]> {
  const token = await getAppAccessToken();
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!token || !clientId) return [];

  const results: HelixUser[] = [];

  for (let index = 0; index < userIds.length; index += MAX_IDS_PER_REQUEST) {
    const chunk = userIds.slice(index, index + MAX_IDS_PER_REQUEST);
    const params = new URLSearchParams();
    for (const id of chunk) params.append("id", id);

    try {
      const response = await fetch(`${HELIX_USERS_URL}?${params.toString()}`, {
        headers: {
          "Client-Id": clientId,
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        console.error("[twitch] Profilabruf fehlgeschlagen:", response.status, await response.text());
        continue;
      }

      const data = (await response.json()) as { data?: HelixUser[] };
      if (data.data) results.push(...data.data);
    } catch (error) {
      console.error("[twitch] Profilabruf fehlgeschlagen:", error);
    }
  }

  return results;
}

export interface ViewerAvatar {
  userId: string;
  profileImageUrl: string | null;
  displayName: string | null;
}

/**
 * Liefert Profilbilder zu den angegebenen Twitch-User-IDs.
 * Fehlende oder veraltete Eintraege werden nachgeladen, sofern
 * Zugangsdaten hinterlegt sind. Fehler fuehren nie zu einem Abbruch –
 * im Zweifel gibt es einfach kein Bild.
 */
export async function getViewerAvatars(userIds: string[]): Promise<Map<string, ViewerAvatar>> {
  const result = new Map<string, ViewerAvatar>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return result;

  let cached: Array<typeof adminViewerProfiles.$inferSelect> = [];

  try {
    cached = await db.select().from(adminViewerProfiles).where(inArray(adminViewerProfiles.userId, unique));
  } catch (error) {
    // Tabelle fehlt vermutlich noch – dann gibt es eben keine Bilder.
    console.error("[twitch] Profil-Cache nicht lesbar:", error);
    return result;
  }

  const now = Date.now();
  const cachedById = new Map(cached.map((row) => [row.userId, row]));

  for (const row of cached) {
    result.set(row.userId, {
      userId: row.userId,
      profileImageUrl: row.profileImageUrl,
      displayName: row.displayName,
    });
  }

  if (!isTwitchApiConfigured()) return result;

  // Was fehlt oder veraltet ist, wird nachgeladen.
  const stale = unique.filter((id) => {
    const row = cachedById.get(id);
    if (!row) return true;

    const age = now - row.fetchedAt.getTime();
    return row.notFound ? age > NOT_FOUND_TTL_MS : age > CACHE_TTL_MS;
  });

  if (stale.length === 0) return result;

  const users = await fetchUsersFromApi(stale);
  const fetchedAt = new Date();
  const foundIds = new Set(users.map((user) => user.id));

  if (users.length > 0) {
    try {
      await db
        .insert(adminViewerProfiles)
        .values(
          users.map((user) => ({
            userId: user.id,
            login: user.login,
            displayName: user.display_name,
            profileImageUrl: user.profile_image_url,
            offlineImageUrl: user.offline_image_url || null,
            description: user.description || null,
            broadcasterType: user.broadcaster_type || null,
            twitchCreatedAt: user.created_at ? new Date(user.created_at) : null,
            fetchedAt,
            notFound: false,
          })),
        )
        .onDuplicateKeyUpdate({
          set: {
            login: sql`VALUES(login)`,
            displayName: sql`VALUES(display_name)`,
            profileImageUrl: sql`VALUES(profile_image_url)`,
            offlineImageUrl: sql`VALUES(offline_image_url)`,
            description: sql`VALUES(description)`,
            broadcasterType: sql`VALUES(broadcaster_type)`,
            twitchCreatedAt: sql`VALUES(twitch_created_at)`,
            fetchedAt: sql`VALUES(fetched_at)`,
            notFound: sql`0`,
          },
        });
    } catch (error) {
      console.error("[twitch] Profil-Cache nicht schreibbar:", error);
    }

    for (const user of users) {
      result.set(user.id, {
        userId: user.id,
        profileImageUrl: user.profile_image_url,
        displayName: user.display_name,
      });
    }
  }

  // Nicht gefundene IDs markieren, damit sie nicht bei jedem Aufruf erneut angefragt werden.
  const missing = stale.filter((id) => !foundIds.has(id));

  if (missing.length > 0) {
    try {
      await db
        .insert(adminViewerProfiles)
        .values(missing.map((userId) => ({ userId, fetchedAt, notFound: true })))
        .onDuplicateKeyUpdate({
          set: { fetchedAt: sql`VALUES(fetched_at)`, notFound: sql`1` },
        });
    } catch (error) {
      console.error("[twitch] Profil-Cache nicht schreibbar:", error);
    }
  }

  return result;
}

/** Bequemer Zugriff fuer eine einzelne ID. */
export async function getViewerAvatar(userId: string): Promise<ViewerAvatar | null> {
  const map = await getViewerAvatars([userId]);
  return map.get(userId) ?? null;
}

/** Entfernt abgelaufene Eintraege – optional per Wartungsaufgabe aufrufbar. */
export async function pruneProfileCache(): Promise<void> {
  const cutoff = new Date(Date.now() - NOT_FOUND_TTL_MS * 2);
  await db.delete(adminViewerProfiles).where(lt(adminViewerProfiles.fetchedAt, cutoff));
}
