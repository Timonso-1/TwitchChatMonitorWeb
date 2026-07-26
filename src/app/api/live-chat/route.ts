import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, gt, type SQL } from "drizzle-orm";
import { AuthorizationError, assertPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { getActiveWatchTerms } from "@/lib/queries/watchlist";
import { findMatches } from "@/lib/watchlist";

/**
 * Liefert neue Chatnachrichten fuer die Live-Ansicht.
 *
 * Bewusst als einfaches Polling statt WebSocket: der Bot schreibt in die
 * Datenbank, das Panel liest daraus. Ein Push-Kanal waere zusaetzliche
 * Infrastruktur ohne echten Gewinn bei Intervallen von wenigen Sekunden.
 */

const MAX_BATCH = 200;

export async function GET(request: NextRequest) {
  try {
    await assertPermission(PERMISSIONS.CHAT_LIVE);

    const params = request.nextUrl.searchParams;
    const channelUuid = params.get("channel") ?? undefined;
    const afterId = Number(params.get("after") ?? 0);
    const limit = Math.min(Number(params.get("limit") ?? 60), MAX_BATCH);

    const conditions: SQL[] = [];
    if (channelUuid) conditions.push(eq(messages.channelUuid, channelUuid));
    // Beim ersten Abruf (after = 0) wird der aktuelle Verlauf geladen.
    if (Number.isFinite(afterId) && afterId > 0) conditions.push(gt(messages.id, afterId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: messages.id,
        channelUuid: messages.channelUuid,
        channelName: messages.channelName,
        userId: messages.userId,
        userName: messages.userName,
        displayName: messages.displayName,
        color: messages.color,
        content: messages.content,
        bits: messages.bits,
        isMod: messages.isMod,
        isSubscriber: messages.isSubscriber,
        isVip: messages.isVip,
        isBroadcaster: messages.isBroadcaster,
        isFirstMessage: messages.isFirstMessage,
        isAction: messages.isAction,
        receivedAt: messages.receivedAt,
      })
      .from(messages)
      .where(where)
      .orderBy(desc(messages.id))
      .limit(limit);

    const terms = await getActiveWatchTerms();

    // Aelteste zuerst, damit die Liste chronologisch waechst.
    const ordered = rows.reverse().map((row) => ({
      ...row,
      receivedAt: row.receivedAt.toISOString(),
      matches: findMatches(row.content, terms, row.channelUuid),
    }));

    return NextResponse.json(
      {
        messages: ordered,
        latestId: ordered.length > 0 ? ordered[ordered.length - 1].id : afterId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[live-chat]", error);
    return NextResponse.json({ error: "Nachrichten konnten nicht geladen werden." }, { status: 500 });
  }
}
