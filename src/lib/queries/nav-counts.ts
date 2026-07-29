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
import { NAVIGATION, type NavCountKey, type NavCountPromises } from "@/lib/navigation";

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
 * Startet die Abfragen für alle Navigationseinträge, die der Nutzer sehen darf,
 * und gibt sie einzeln als Promise zurück.
 *
 * Bewusst ein Promise je Zähler und nicht ein gemeinsames `Promise.all`: Sonst
 * warten alle Badges auf den langsamsten, und ein hängender Zähler lässt die
 * gesamte Leiste ohne Zahlen. So rückt jede Zahl nach, sobald ihre eigene
 * Abfrage zurück ist.
 *
 * Die Funktion ist absichtlich nicht `async` – sie kehrt sofort zurück, während
 * die Abfragen bereits laufen.
 *
 * Wirft nie: Ein Datenbankproblem darf nicht die Seitenleiste und damit das
 * Panel unbrauchbar machen. Ein fehlgeschlagener Zähler liefert `undefined`,
 * das Badge entfällt dann einfach.
 */
export function getNavCounts(permissions: string[]): NavCountPromises {
  const promises: NavCountPromises = {};

  for (const key of visibleKeys(permissions)) {
    promises[key] = LOADERS[key]().catch((error) => {
      console.error(`[nav-counts] Zähler "${key}" fehlgeschlagen:`, error);
      return undefined;
    });
  }

  return promises;
}
