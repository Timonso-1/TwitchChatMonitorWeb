import { NextResponse, type NextRequest } from "next/server";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";

import { AuthorizationError, assertPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { exportMessages } from "@/lib/queries/twitch";

const EXPORT_LIMIT = 10_000;

/** Maskiert Werte, die von Excel als Formel interpretiert werden koennten. */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await assertPermission(PERMISSIONS.MESSAGES_EXPORT);
    const params = request.nextUrl.searchParams;

    const filters = {
      channelUuid: params.get("channel") ?? undefined,
      user: params.get("user") ?? undefined,
      content: params.get("content") ?? undefined,
      role: (params.get("role") ?? "all") as "all" | "mod" | "subscriber" | "vip" | "broadcaster" | "first",
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    };

    const rows = await exportMessages(filters, EXPORT_LIMIT);

    const header = ["Zeitpunkt", "Channel", "Benutzername", "Anzeigename", "Mod", "Sub", "VIP", "Bits", "Nachricht"];
    const lines = [
      header.map(csvEscape).join(","),
      ...rows.map((row) =>
        [
          row.receivedAt,
          row.channelName,
          row.userName,
          row.displayName ?? "",
          row.isMod ? "ja" : "nein",
          row.isSubscriber ? "ja" : "nein",
          row.isVip ? "ja" : "nein",
          row.bits,
          row.content,
        ]
          .map(csvEscape)
          .join(","),
      ),
    ];

    await writeAudit({
      action: AUDIT_ACTIONS.MESSAGES_EXPORTED,
      actorUuid: session.user.uuid,
      actorName: session.user.username,
      targetType: "messages",
      metadata: { rows: rows.length, filters, truncated: rows.length >= EXPORT_LIMIT },
    });

    const filename = `nachrichten-${new Date().toISOString().slice(0, 10)}.csv`;

    // BOM, damit Excel UTF-8 korrekt erkennt.
    return new NextResponse(`﻿${lines.join("\r\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[messages/export]", error);
    return NextResponse.json({ error: "Export fehlgeschlagen." }, { status: 500 });
  }
}
