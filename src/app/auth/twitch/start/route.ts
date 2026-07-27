import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE,
  absoluteAppUrl,
  buildAuthorizeUrl,
  createOAuthState,
  isTwitchOAuthConfigured,
} from "@/lib/auth/twitch-oauth";

/**
 * Startet die Twitch-Anmeldung.
 * Der State liegt gehasht in der URL und im Klartext im Cookie –
 * so lässt sich der Rückweg prüfen, ohne das Geheimnis preiszugeben.
 */
export async function GET(request: Request) {
  const session = await getSession();

  // Nur angemeldete Nutzer dürfen verknüpfen – die Verknüpfung
  // ersetzt den Login nicht, sie ergänzt ihn.
  if (!session) {
    return NextResponse.redirect(absoluteAppUrl("/login", request));
  }

  if (!isTwitchOAuthConfigured()) {
    return NextResponse.redirect(absoluteAppUrl("/link-twitch?error=not_configured", request));
  }

  const state = createOAuthState();
  const authorizeUrl = buildAuthorizeUrl(state.hashed);

  if (!authorizeUrl) {
    return NextResponse.redirect(absoluteAppUrl("/link-twitch?error=not_configured", request));
  }

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state.raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE,
  });

  return NextResponse.redirect(authorizeUrl);
}
