import { NextResponse, type NextRequest } from "next/server";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { AuthorizationError, assertPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { resolveChannelFilter } from "@/lib/channel-filter";
import { EXPORT_LIMIT, buildCsv, csvHeaders } from "@/lib/csv";
import { listChannelFilterOptions } from "@/lib/queries/channels";
import { listModerationActions } from "@/lib/queries/twitch";
import { formatDuration, moderationActionLabel } from "@/lib/twitch";

export async function GET(request: NextRequest) {
  try {
    const session = await assertPermission(PERMISSIONS.MODERATION_EXPORT);
    const params = request.nextUrl.searchParams;

    // Der Link der Moderationsliste trägt die Twitch-ID; sie muss wie dort zu den
    // UUIDs aufgelöst werden, sonst exportiert der Filter stillschweigend alles.
    const channels = await listChannelFilterOptions("moderation_actions");
    const channelFilter = resolveChannelFilter(channels, params.get("channel") ?? undefined);

    const filters = {
      channelUuids: channelFilter.uuids,
      action: params.get("action") ?? undefined,
      target: params.get("target") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    };

    const { items } = await listModerationActions({ ...filters, page: 1, pageSize: EXPORT_LIMIT });

    const csv = buildCsv(
      ["Zeitpunkt", "Aktion", "Channel", "Betroffener", "User-ID", "Dauer", "Grund", "Gelöschte Nachricht"],
      items.map((entry) => [
        entry.occurredAt,
        moderationActionLabel(entry.action),
        entry.channelName,
        entry.targetUserName ?? "",
        entry.targetUserId ?? "",
        formatDuration(entry.durationSeconds),
        entry.reason ?? "",
        entry.deletedMessageContent ?? "",
      ]),
    );

    await writeAudit({
      action: AUDIT_ACTIONS.MODERATION_EXPORTED,
      actorUuid: session.user.uuid,
      actorName: session.user.username,
      targetType: "moderation",
      metadata: { rows: items.length, filters, truncated: items.length >= EXPORT_LIMIT },
    });

    return new NextResponse(csv, { headers: csvHeaders("moderation", items.length >= EXPORT_LIMIT) });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[moderation/export]", error);
    return NextResponse.json({ error: "Export fehlgeschlagen." }, { status: 500 });
  }
}
