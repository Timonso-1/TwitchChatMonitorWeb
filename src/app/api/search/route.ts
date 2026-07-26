import { NextResponse, type NextRequest } from "next/server";
import { desc, like, or, sql } from "drizzle-orm";
import { AuthorizationError, assertAuthenticated } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { channels, viewers } from "@/lib/db/schema";

/**
 * Globale Suche fuer die Befehlspalette.
 *
 * Nachrichten werden bewusst nicht durchsucht: eine Volltextsuche ueber
 * Millionen Zeilen waere zu langsam fuer Eingaben waehrend des Tippens.
 * Stattdessen wird auf die Nachrichtensuche verlinkt.
 */

const LIMIT_PER_TYPE = 5;

export interface SearchResult {
  type: "viewer" | "channel";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

export async function GET(request: NextRequest) {
  try {
    const session = await assertAuthenticated();
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

    // Unter zwei Zeichen liefert die Suche zu viel Rauschen.
    if (query.length < 2) {
      return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const pattern = `%${query}%`;
    const permissions = session.user.permissions;
    const results: SearchResult[] = [];

    if (hasPermission(permissions, PERMISSIONS.CHANNELS_VIEW)) {
      const rows = await db
        .select({ uuid: channels.uuid, name: channels.name, broadcasterId: channels.broadcasterId })
        .from(channels)
        .where(or(like(channels.name, pattern), like(channels.broadcasterId, pattern)))
        .limit(LIMIT_PER_TYPE);

      results.push(
        ...rows.map((row) => ({
          type: "channel" as const,
          id: row.uuid,
          label: row.name,
          sublabel: `Channel · ${row.broadcasterId}`,
          href: `/channels/${row.uuid}`,
        })),
      );
    }

    if (hasPermission(permissions, PERMISSIONS.VIEWERS_VIEW)) {
      const rows = await db
        .select({
          userId: viewers.userId,
          userName: viewers.userName,
          displayName: viewers.displayName,
          messageCount: viewers.messageCount,
        })
        .from(viewers)
        .where(or(like(viewers.userName, pattern), like(viewers.displayName, pattern), like(viewers.userId, pattern)))
        // Aktive Chatter zuerst – die sind meist gemeint.
        .orderBy(desc(viewers.messageCount))
        .limit(LIMIT_PER_TYPE);

      results.push(
        ...rows.map((row) => ({
          type: "viewer" as const,
          id: row.userId,
          label: row.displayName ?? row.userName,
          sublabel: `Zuschauer · ${new Intl.NumberFormat("de-DE").format(row.messageCount)} Nachrichten`,
          href: `/viewers/${row.userId}`,
        })),
      );
    }

    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[search]", error);
    return NextResponse.json({ error: "Suche fehlgeschlagen." }, { status: 500 });
  }
}
