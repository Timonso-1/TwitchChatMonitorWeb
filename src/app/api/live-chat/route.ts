import { NextResponse, type NextRequest } from "next/server";
import { AuthorizationError, assertPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { loadLiveChat } from "@/lib/queries/live-chat";

/**
 * Liefert neue Chatnachrichten für die Live-Ansicht.
 *
 * Bewusst als einfaches Polling statt WebSocket: der Bot schreibt in die
 * Datenbank, das Panel liest daraus. Ein Push-Kanal wäre zusätzliche
 * Infrastruktur ohne echten Gewinn bei Intervallen von wenigen Sekunden.
 */

const MAX_BATCH = 200;
const DEFAULT_BATCH = 60;

function positiveNumber(raw: string | null, fallback: number): number {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function GET(request: NextRequest) {
  try {
    await assertPermission(PERMISSIONS.CHAT_LIVE);

    const params = request.nextUrl.searchParams;

    const payload = await loadLiveChat({
      channelUuid: params.get("channel") ?? undefined,
      afterId: positiveNumber(params.get("after"), 0),
      modAfter: positiveNumber(params.get("modAfter"), 0),
      limit: Math.min(positiveNumber(params.get("limit"), DEFAULT_BATCH), MAX_BATCH),
    });

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[live-chat]", error);
    return NextResponse.json({ error: "Nachrichten konnten nicht geladen werden." }, { status: 500 });
  }
}
