import { NextResponse, type NextRequest } from "next/server";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { AuthorizationError, assertPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { resolveChannelFilter } from "@/lib/channel-filter";
import { buildCsv, csvHeaders } from "@/lib/csv";
import { listChannelFilterOptions } from "@/lib/queries/channels";
import { listEvents } from "@/lib/queries/twitch";
import { eventTypeLabel, subTierLabel } from "@/lib/twitch";

const EXPORT_LIMIT = 10_000;

export async function GET(request: NextRequest) {
  try {
    const session = await assertPermission(PERMISSIONS.EVENTS_EXPORT);
    const params = request.nextUrl.searchParams;

    // Der Link der Eventliste trägt die Twitch-ID; sie muss wie dort zu den UUIDs
    // aufgelöst werden, sonst exportiert der Filter stillschweigend alles.
    const channels = await listChannelFilterOptions("events");
    const channelFilter = resolveChannelFilter(channels, params.get("channel") ?? undefined);

    const filters = {
      channelUuids: channelFilter.uuids,
      eventType: params.get("type") ?? undefined,
      user: params.get("user") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    };

    // Die Listenabfrage wird mit einer einzigen grossen Seite wiederverwendet.
    const { items } = await listEvents({ ...filters, page: 1, pageSize: EXPORT_LIMIT });

    const csv = buildCsv(
      ["Zeitpunkt", "Typ", "Channel", "Nutzer", "Abo-Stufe", "Monate", "Geschenke", "Zuschauer", "Von", "Nachricht"],
      items.map((event) => [
        event.occurredAt,
        eventTypeLabel(event.eventType),
        event.channelName,
        event.userName ?? "",
        event.subTier ? subTierLabel(event.subTier) : "",
        event.months ?? "",
        event.giftCount ?? "",
        event.viewerCount ?? "",
        event.giftedByName ?? "",
        event.message ?? "",
      ]),
    );

    await writeAudit({
      action: AUDIT_ACTIONS.EVENTS_EXPORTED,
      actorUuid: session.user.uuid,
      actorName: session.user.username,
      targetType: "events",
      metadata: { rows: items.length, filters, truncated: items.length >= EXPORT_LIMIT },
    });

    return new NextResponse(csv, { headers: csvHeaders("events") });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[events/export]", error);
    return NextResponse.json({ error: "Export fehlgeschlagen." }, { status: 500 });
  }
}
