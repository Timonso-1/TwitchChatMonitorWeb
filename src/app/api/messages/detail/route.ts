import { NextResponse, type NextRequest } from "next/server";
import { AuthorizationError, assertAnyPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { loadMessageDetail } from "@/lib/queries/message-detail";

/**
 * Details zu einer einzelnen Chatnachricht für den Detaildialog.
 *
 * Beide Rechte sind zugelassen: der Dialog hängt sowohl im Nachrichten-Tab
 * als auch im Live-Chat, und wer nur den Live-Chat sehen darf, muss ihn
 * trotzdem öffnen können.
 */
export async function GET(request: NextRequest) {
  try {
    await assertAnyPermission([PERMISSIONS.MESSAGES_VIEW, PERMISSIONS.CHAT_LIVE]);

    const messageId = request.nextUrl.searchParams.get("messageId");
    if (!messageId) {
      return NextResponse.json({ error: "Keine Nachricht angegeben." }, { status: 400 });
    }

    const detail = await loadMessageDetail(messageId);
    if (!detail) {
      return NextResponse.json({ error: "Nachricht wurde nicht gefunden." }, { status: 404 });
    }

    return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[message-detail]", error);
    return NextResponse.json({ error: "Details konnten nicht geladen werden." }, { status: 500 });
  }
}
