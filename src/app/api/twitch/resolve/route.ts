import { NextResponse, type NextRequest } from "next/server";
import { AuthorizationError, assertPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isTwitchApiConfigured, lookupTwitchUsers, type LookupDirection } from "@/lib/twitch-api";

/**
 * Einzel-Lookup für das Autofill im Channel-Formular: liefert zu einem
 * Namen die Broadcaster-ID oder umgekehrt, ohne die volle Batch-Oberfläche
 * des Name-/ID-Konverters.
 */
export async function GET(request: NextRequest) {
  try {
    await assertPermission(PERMISSIONS.CHANNELS_CREATE);

    if (!isTwitchApiConfigured()) {
      return NextResponse.json({ found: false }, { headers: { "Cache-Control": "no-store" } });
    }

    const params = request.nextUrl.searchParams;
    const query = (params.get("q") ?? "").trim();
    const dir: LookupDirection = params.get("dir") === "id-to-name" ? "id-to-name" : "name-to-id";

    if (!query) {
      return NextResponse.json({ found: false }, { headers: { "Cache-Control": "no-store" } });
    }

    const [result] = await lookupTwitchUsers([query], dir);

    return NextResponse.json(
      result?.found
        ? { found: true, userId: result.userId, login: result.login, displayName: result.displayName }
        : { found: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[twitch-resolve]", error);
    return NextResponse.json({ found: false }, { status: 500 });
  }
}
