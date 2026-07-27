import "server-only";
import { and, gte, lte, type SQL } from "drizzle-orm";
import type { MySqlColumn } from "drizzle-orm/mysql-core";
import type { ResolvedRange } from "@/lib/range";

/**
 * Zeitraumbedingung für eine Zeitstempelspalte.
 *
 * Beide Grenzen sind nötig: ein freier Zeitraum kann in der Vergangenheit
 * enden, `gte` allein würde dann alles bis heute mitnehmen.
 */
export function inRange(column: MySqlColumn, range: ResolvedRange): SQL {
  return and(gte(column, range.start), lte(column, range.end))!;
}
