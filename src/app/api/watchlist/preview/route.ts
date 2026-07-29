import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AuthorizationError, assertPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { previewWatchTerm } from "@/lib/queries/watchlist";

/**
 * Probelauf eines Wortfilter-Begriffs, bevor er gespeichert wird.
 *
 * Dieselbe Berechtigung wie das Anlegen: Der Probelauf gibt aufgezeichnete
 * Nachrichten zurück und darf deshalb nicht weiter offenstehen als die
 * Funktion, für die er gedacht ist.
 */
const schema = z.object({
  term: z.string().trim().min(1).max(255),
  matchType: z.enum(["contains", "word", "regex"]),
  caseSensitive: z.boolean(),
  channelUuid: z.string().trim().max(36).optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    await assertPermission(PERMISSIONS.WATCHLIST_MANAGE);

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
    }

    const preview = await previewWatchTerm({
      term: parsed.data.term,
      matchType: parsed.data.matchType,
      caseSensitive: parsed.data.caseSensitive,
      channelUuid: parsed.data.channelUuid || null,
    });

    return NextResponse.json(
      {
        ...preview,
        samples: preview.samples.map((sample) => ({
          ...sample,
          receivedAt: sample.receivedAt.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[watchlist/preview]", error);
    return NextResponse.json({ error: "Probelauf fehlgeschlagen." }, { status: 500 });
  }
}
