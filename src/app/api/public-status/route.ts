import { NextResponse } from "next/server";
import { getPublicActivity, getPublicStatus, isPublicStatusEnabled } from "@/lib/queries/public-status";

/**
 * Kennzahlen fuer die Anmeldeseite – bewusst OHNE Anmeldung erreichbar.
 *
 * Liefert ausschliesslich aggregierte Zahlen. Wer auch das nicht
 * veroeffentlichen will, setzt SHOW_PUBLIC_STATUS=false; dann antwortet
 * die Route mit 404.
 */
export async function GET() {
  if (!isPublicStatusEnabled()) {
    return NextResponse.json({ error: "Nicht verfügbar." }, { status: 404 });
  }

  const [status, activity] = await Promise.all([getPublicStatus(), getPublicActivity()]);

  if (!status) {
    return NextResponse.json({ error: "Nicht verfügbar." }, { status: 503 });
  }

  return NextResponse.json(
    {
      ...status,
      lastMessageAt: status.lastMessageAt?.toISOString() ?? null,
      activity,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
