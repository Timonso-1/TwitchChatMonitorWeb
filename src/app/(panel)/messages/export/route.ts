import { NextResponse, type NextRequest } from "next/server";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";

import { AuthorizationError, assertPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { resolveChannelFilter } from "@/lib/channel-filter";
import { EXPORT_LIMIT, buildCsv, csvHeaders } from "@/lib/csv";
import { listChannelFilterOptions } from "@/lib/queries/channels";
import { exportMessages } from "@/lib/queries/twitch";

export async function GET(request: NextRequest) {
  try {
    const session = await assertPermission(PERMISSIONS.MESSAGES_EXPORT);
    const params = request.nextUrl.searchParams;

    // Der Link der Nachrichtenliste trägt die Twitch-ID; sie muss wie dort zu den
    // UUIDs aufgelöst werden, sonst exportiert der Filter stillschweigend alles.
    const channels = await listChannelFilterOptions("messages");
    const channelFilter = resolveChannelFilter(channels, params.get("channel") ?? undefined);

    const filters = {
      channelUuids: channelFilter.uuids,
      user: params.get("user") ?? undefined,
      content: params.get("content") ?? undefined,
      role: (params.get("role") ?? "all") as "all" | "mod" | "subscriber" | "vip" | "broadcaster" | "first",
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    };

    const rows = await exportMessages(filters, EXPORT_LIMIT);
    const truncated = rows.length >= EXPORT_LIMIT;

    const csv = buildCsv(
      ["Zeitpunkt", "Channel", "Benutzername", "Anzeigename", "Mod", "Sub", "VIP", "Bits", "Nachricht"],
      rows.map((row) => [
        row.receivedAt,
        row.channelName,
        row.userName,
        row.displayName ?? "",
        row.isMod,
        row.isSubscriber,
        row.isVip,
        row.bits,
        row.content,
      ]),
    );

    await writeAudit({
      action: AUDIT_ACTIONS.MESSAGES_EXPORTED,
      actorUuid: session.user.uuid,
      actorName: session.user.username,
      targetType: "messages",
      metadata: { rows: rows.length, filters, truncated },
    });

    return new NextResponse(csv, { headers: csvHeaders("nachrichten", truncated) });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[messages/export]", error);
    return NextResponse.json({ error: "Export fehlgeschlagen." }, { status: 500 });
  }
}
