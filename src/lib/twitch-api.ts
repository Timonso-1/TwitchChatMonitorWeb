import "server-only";
import { inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminViewerProfiles } from "@/lib/db/schema";

/**
 * Anbindung an die Twitch-Helix-API zum Abruf von Profilbildern.
 *
 * Die Daten werden in `admin_viewer_profiles` zwischengespeichert und
 * erst nach Ablauf der Frist erneut geholt. Ohne hinterlegte Zugangsdaten
 * verhält sich das Modul still: es liefert einfach keine Bilder.
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

// Token im Prozess halten – es ist rund 60 Tage gültig.
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

/**
 * Fragt Nutzer bei Twitch ab.
 * `key` bestimmt, ob nach User-ID ("id") oder Login-Name ("login") gesucht wird.
 */
async function fetchUsersFromApi(values: string[], key: "id" | "login" = "id"): Promise<HelixUser[]> {
  const token = await getAppAccessToken();
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!token || !clientId) return [];

  const results: HelixUser[] = [];

  for (let index = 0; index < values.length; index += MAX_IDS_PER_REQUEST) {
    const chunk = values.slice(index, index + MAX_IDS_PER_REQUEST);
    const params = new URLSearchParams();
    for (const value of chunk) params.append(key, value);

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

export interface TwitchLookupResult {
  /** Die Eingabe, zu der dieser Treffer gehört. */
  query: string;
  found: boolean;
  userId?: string;
  login?: string;
  displayName?: string;
  profileImageUrl?: string;
  description?: string;
  broadcasterType?: string;
  createdAt?: Date;
}

/** Richtung der Umwandlung. */
export type LookupDirection = "name-to-id" | "id-to-name";

/** Entfernt Twitch-URLs und @-Präfixe, damit nur der Login übrig bleibt. */
export function normalizeTwitchLogin(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?twitch\.tv\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^@/, "")
    .toLowerCase();
}

/**
 * Schlägt Twitch-Accounts nach, in der angegebenen Richtung.
 * Die Richtung ist bewusst explizit statt geraten – ein Login darf
 * schliesslich auch nur aus Ziffern bestehen.
 */
export async function lookupTwitchUsers(
  queries: string[],
  direction: LookupDirection,
): Promise<TwitchLookupResult[]> {
  const cleaned = [...new Set(queries.map((entry) => entry.trim()).filter(Boolean))].slice(0, MAX_IDS_PER_REQUEST);
  if (cleaned.length === 0) return [];

  if (!isTwitchApiConfigured()) {
    return cleaned.map((query) => ({ query, found: false }));
  }

  const byId = direction === "id-to-name";

  // Bei IDs nur Ziffern zulassen, bei Namen URLs und @ entfernen.
  const values = cleaned.map((entry) => (byId ? entry.replace(/\D/g, "") : normalizeTwitchLogin(entry)));

  const found = await fetchUsersFromApi(
    values.filter(Boolean),
    byId ? "id" : "login",
  );

  return cleaned.map((query, index) => {
    const normalized = values[index];

    const match = found.find((user) =>
      byId ? user.id === normalized : user.login.toLowerCase() === normalized,
    );

    if (!match) return { query, found: false };

    return {
      query,
      found: true,
      userId: match.id,
      login: match.login,
      displayName: match.display_name,
      profileImageUrl: match.profile_image_url,
      description: match.description || undefined,
      broadcasterType: match.broadcaster_type || undefined,
      createdAt: match.created_at ? new Date(match.created_at) : undefined,
    };
  });
}

export interface ViewerAvatar {
  userId: string;
  profileImageUrl: string | null;
  displayName: string | null;
}

/**
 * Liefert Profilbilder aus dem Zwischenspeicher, OHNE auf die Twitch-API zu warten.
 *
 * Fehlende Einträge werden im Hintergrund nachgeladen und stehen beim
 * nächsten Aufruf bereit. Das ist der entscheidende Unterschied zu
 * `getViewerAvatars`: dort wartet der Seitenaufbau auf die API-Antwort,
 * was bei vielen unbekannten Nutzern mehrere Sekunden kosten kann.
 */
export async function getCachedViewerAvatars(userIds: string[]): Promise<Map<string, ViewerAvatar>> {
  const result = new Map<string, ViewerAvatar>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return result;

  try {
    const cached = await db
      .select()
      .from(adminViewerProfiles)
      .where(inArray(adminViewerProfiles.userId, unique));

    for (const row of cached) {
      result.set(row.userId, {
        userId: row.userId,
        profileImageUrl: row.profileImageUrl,
        displayName: row.displayName,
      });
    }

    if (!isTwitchApiConfigured()) return result;

    // Was fehlt, wird nachgeladen – aber ohne darauf zu warten.
    const now = Date.now();
    const cachedById = new Map(cached.map((row) => [row.userId, row]));

    const stale = unique.filter((id) => {
      const row = cachedById.get(id);
      if (!row) return true;

      const age = now - row.fetchedAt.getTime();
      return row.notFound ? age > NOT_FOUND_TTL_MS : age > CACHE_TTL_MS;
    });

    if (stale.length > 0) {
      // Bewusst ohne await: der Seitenaufbau soll nicht darauf warten.
      void refreshProfiles(stale).catch((error) => {
        console.error("[twitch] Hintergrundabruf fehlgeschlagen:", error);
      });
    }
  } catch (error) {
    console.error("[twitch] Profil-Cache nicht lesbar:", error);
  }

  return result;
}

/** Holt Profile bei Twitch und schreibt sie in den Zwischenspeicher. */
async function refreshProfiles(userIds: string[]): Promise<void> {
  const users = await fetchUsersFromApi(userIds, "id");
  const fetchedAt = new Date();
  const foundIds = new Set(users.map((user) => user.id));

  if (users.length > 0) {
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
  }

  const missing = userIds.filter((id) => !foundIds.has(id));

  if (missing.length > 0) {
    await db
      .insert(adminViewerProfiles)
      .values(missing.map((userId) => ({ userId, fetchedAt, notFound: true })))
      .onDuplicateKeyUpdate({
        set: { fetchedAt: sql`VALUES(fetched_at)`, notFound: sql`1` },
      });
  }
}

/**
 * Liefert Profilbilder und WARTET auf fehlende Einträge.
 * Nur für Einzelabrufe geeignet – bei Listen `getCachedViewerAvatars` nutzen.
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

/** Bequemer Zugriff für eine einzelne ID. */
export async function getViewerAvatar(userId: string): Promise<ViewerAvatar | null> {
  const map = await getViewerAvatars([userId]);
  return map.get(userId) ?? null;
}

/** Entfernt abgelaufene Einträge – optional per Wartungsaufgabe aufrufbar. */
export async function pruneProfileCache(): Promise<void> {
  const cutoff = new Date(Date.now() - NOT_FOUND_TTL_MS * 2);
  await db.delete(adminViewerProfiles).where(lt(adminViewerProfiles.fetchedAt, cutoff));
}

// ---------------------------------------------------------------------------
// Chat-Abzeichen
// ---------------------------------------------------------------------------

/**
 * Abzeichenbilder des Chats.
 *
 * Twitch liefert die Bild-URLs pro Abzeichen und Version – global und je
 * Channel. Diese Sätze ändern sich sehr selten, deshalb liegen sie nur im
 * Prozessspeicher und nicht in der Datenbank. Nach einem Neustart wird beim
 * ersten Seitenaufruf einmal nachgeladen.
 */

const HELIX_GLOBAL_BADGES_URL = "https://api.twitch.tv/helix/chat/badges/global";
const HELIX_CHANNEL_BADGES_URL = "https://api.twitch.tv/helix/chat/badges";

/** Abzeichensätze so lange als aktuell betrachten. */
const BADGE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/** Notbremse: eine langsame Twitch-Antwort darf den Seitenaufbau nicht blockieren. */
const BADGE_FETCH_TIMEOUT_MS = 4000;

export interface BadgeImage {
  title: string;
  url1x: string;
  url2x: string;
}

/** Abzeichen-Name → Version → Bild. */
export type BadgeSet = Map<string, Map<string, BadgeImage>>;

interface HelixBadgeSet {
  set_id: string;
  versions?: Array<{
    id: string;
    title?: string;
    image_url_1x?: string;
    image_url_2x?: string;
  }>;
}

interface BadgeCacheEntry {
  set: BadgeSet;
  fetchedAt: number;
}

const globalForBadges = globalThis as unknown as {
  __twitchBadgeCache?: { global?: BadgeCacheEntry; channels: Map<string, BadgeCacheEntry> };
};

function badgeCache() {
  globalForBadges.__twitchBadgeCache ??= { channels: new Map() };
  return globalForBadges.__twitchBadgeCache;
}

function isFresh(entry: BadgeCacheEntry): boolean {
  return Date.now() - entry.fetchedAt < BADGE_CACHE_TTL_MS;
}

function toBadgeSet(data: HelixBadgeSet[]): BadgeSet {
  const set: BadgeSet = new Map();

  for (const entry of data) {
    const versions = new Map<string, BadgeImage>();

    for (const version of entry.versions ?? []) {
      const url1x = version.image_url_1x;
      if (!url1x) continue;

      versions.set(version.id, {
        title: version.title || entry.set_id,
        url1x,
        url2x: version.image_url_2x || url1x,
      });
    }

    if (versions.size > 0) set.set(entry.set_id.toLowerCase(), versions);
  }

  return set;
}

async function fetchBadgeSet(url: string): Promise<BadgeSet | null> {
  const token = await getAppAccessToken();
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!token || !clientId) return null;

  try {
    const response = await fetch(url, {
      headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(BADGE_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("[twitch] Abzeichenabruf fehlgeschlagen:", response.status, await response.text());
      return null;
    }

    const data = (await response.json()) as { data?: HelixBadgeSet[] };
    return toBadgeSet(data.data ?? []);
  } catch (error) {
    console.error("[twitch] Abzeichenabruf fehlgeschlagen:", error);
    return null;
  }
}

async function getGlobalBadges(): Promise<BadgeSet> {
  const cache = badgeCache();
  const cached = cache.global;
  if (cached && isFresh(cached)) return cached.set;

  const set = await fetchBadgeSet(HELIX_GLOBAL_BADGES_URL);

  // Auch ein Fehlschlag wird vermerkt, damit nicht jeder Seitenaufruf
  // erneut in dieselbe Wand läuft.
  const entry: BadgeCacheEntry = { set: set ?? cached?.set ?? new Map(), fetchedAt: Date.now() };
  cache.global = entry;
  return entry.set;
}

async function getChannelBadges(channelId: string): Promise<BadgeSet> {
  const cache = badgeCache();
  const cached = cache.channels.get(channelId);
  if (cached && isFresh(cached)) return cached.set;

  const set = await fetchBadgeSet(`${HELIX_CHANNEL_BADGES_URL}?broadcaster_id=${encodeURIComponent(channelId)}`);

  const entry: BadgeCacheEntry = { set: set ?? cached?.set ?? new Map(), fetchedAt: Date.now() };
  cache.channels.set(channelId, entry);
  return entry.set;
}

/** Kanaleigene Abzeichen überschreiben die globalen mit gleichem Namen. */
function mergeBadgeSets(global: BadgeSet, channel: BadgeSet): BadgeSet {
  const merged: BadgeSet = new Map(global);
  for (const [name, versions] of channel) merged.set(name, versions);
  return merged;
}

/**
 * Abzeichenbilder für die angegebenen Channels (Broadcaster-IDs).
 *
 * Ohne hinterlegte Zugangsdaten kommt eine leere Map zurück – die Anzeige
 * fällt dann auf beschriftete Abzeichen ohne Bild zurück.
 */
export async function getCachedBadgeSets(channelIds: string[]): Promise<Map<string, BadgeSet>> {
  const result = new Map<string, BadgeSet>();
  const unique = [...new Set(channelIds.filter(Boolean))];
  if (unique.length === 0 || !isTwitchApiConfigured()) return result;

  const global = await getGlobalBadges();

  const sets = await Promise.all(unique.map(async (id) => [id, await getChannelBadges(id)] as const));

  for (const [id, channel] of sets) {
    result.set(id, mergeBadgeSets(global, channel));
  }

  return result;
}
