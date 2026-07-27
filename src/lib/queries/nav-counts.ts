import "server-only";
import { unstable_cache } from "next/cache";
import { count, sql } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { db } from "@/lib/db";
import {
  adminAuditLog,
  adminRoles,
  adminUsers,
  adminViewerNotes,
  adminWatchTerms,
  channels,
  events,
  messages,
  moderationActions,
  viewers,
} from "@/lib/db/schema";
import { hasPermission } from "@/lib/auth/permissions";
import { NAVIGATION, type NavCountKey, type NavCounts } from "@/lib/navigation";

/**
 * Zähler für die Badges in der Seitenleiste.
 *
 * Jeder Zähler wird einzeln gecacht statt als gemeinsames Bündel: Sonst würde
 * der billige Channel-Zähler beim Ablaufen den teuren `COUNT(*)` über
 * `messages` mit invalidieren.
 */

/** Kleine, manuell gepflegte Tabellen – eine Änderung soll rasch sichtbar sein. */
const SHORT = 60;
/** Grosse Log-Tabellen – ein paar Minuten Abweichung fallen nicht ins Gewicht. */
const LONG = 300;

async function totalRows(table: MySqlTable): Promise<number> {
  const [row] = await db.select({ value: count() }).from(table);
  return row?.value ?? 0;
}

function cached(key: NavCountKey, revalidate: number, loader: () => Promise<number>) {
  return unstable_cache(loader, ["nav-count", key], { revalidate });
}

const LOADERS: Record<NavCountKey, () => Promise<number>> = {
  channels: cached("channels", SHORT, () => totalRows(channels)),
  messages: cached("messages", LONG, () => totalRows(messages)),
  events: cached("events", LONG, () => totalRows(events)),
  viewers: cached("viewers", LONG, () => totalRows(viewers)),
  moderation: cached("moderation", LONG, () => totalRows(moderationActions)),
  watchlist: cached("watchlist", SHORT, () => totalRows(adminWatchTerms)),
  // Die Seite listet beobachtete Zuschauer, nicht einzelne Notizen – ein
  // einfaches COUNT(*) zeigte mehr an, als die Liste Zeilen hat.
  watchboard: cached("watchboard", SHORT, async () => {
    const [row] = await db
      .select({ value: sql<number>`COUNT(DISTINCT ${adminViewerNotes.viewerUserId})`.mapWith(Number) })
      .from(adminViewerNotes);
    return row?.value ?? 0;
  }),
  accounts: cached("accounts", SHORT, () => totalRows(adminUsers)),
  roles: cached("roles", SHORT, () => totalRows(adminRoles)),
  audit: cached("audit", LONG, () => totalRows(adminAuditLog)),
};

/** Schlüssel, die dieser Nutzer laut Navigation überhaupt zu sehen bekommt. */
function visibleKeys(permissions: string[]): NavCountKey[] {
  const keys = new Set<NavCountKey>();

  for (const section of NAVIGATION) {
    for (const item of section.items) {
      if (item.countKey && hasPermission(permissions, item.permission)) keys.add(item.countKey);
    }
  }

  return [...keys];
}

/**
 * Liefert die Zahlen für alle Navigationseinträge, die der Nutzer sehen darf.
 *
 * Wirft nie: Ein Datenbankproblem darf nicht die gesamte Seitenleiste und damit
 * das Panel unbrauchbar machen. Ein fehlgeschlagener Zähler fehlt im Ergebnis,
 * das Badge entfällt dann einfach.
 */
export async function getNavCounts(permissions: string[]): Promise<NavCounts> {
  const entries = await Promise.all(
    visibleKeys(permissions).map(async (key) => {
      try {
        return [key, await LOADERS[key]()] as const;
      } catch (error) {
        console.error(`[nav-counts] Zähler "${key}" fehlgeschlagen:`, error);
        return [key, undefined] as const;
      }
    }),
  );

  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}
