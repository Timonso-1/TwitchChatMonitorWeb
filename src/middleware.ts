import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "tp_session";

/** Pfade, die ohne Session erreichbar sind. */
const PUBLIC_PATHS = ["/login", "/forbidden"];

/**
 * Leichtgewichtiger Vorfilter: prueft nur, ob ueberhaupt ein Session-Cookie
 * vorhanden ist. Die eigentliche Autorisierung passiert serverseitig in den
 * Layouts und Server Actions (`requireSession` / `requirePermission`), weil
 * die Edge-Runtime keinen Datenbankzugriff hat.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!hasSessionCookie && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Alles ausser:
     * - Next.js-interne Pfade (_next/*)
     * - statische Dateien (favicon, Bilder, Fonts)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
