import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { getSession } from "@/lib/auth/session";
import {
  OAUTH_STATE_COOKIE,
  exchangeCodeForIdentity,
  verifyOAuthState,
} from "@/lib/auth/twitch-oauth";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";

/** Nimmt die Antwort von Twitch entgegen und speichert die Verknüpfung. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();

  const fail = (reason: string) => {
    cookieStore.delete(OAUTH_STATE_COOKIE);
    return NextResponse.redirect(new URL(`/link-twitch?error=${reason}`, request.url));
  };

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Twitch meldet Abbruch oder Ablehnung über den error-Parameter.
  if (url.searchParams.get("error")) {
    return fail(url.searchParams.get("error") === "access_denied" ? "denied" : "twitch_error");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;

  if (!verifyOAuthState(storedState, state)) {
    return fail("state");
  }

  if (!code) return fail("no_code");

  const identity = await exchangeCodeForIdentity(code);
  if (!identity) return fail("exchange");

  // Ein Twitch-Account darf nur zu einem Panel-Account gehören.
  const [conflict] = await db
    .select({ uuid: adminUsers.uuid, username: adminUsers.username })
    .from(adminUsers)
    .where(and(eq(adminUsers.twitchUserId, identity.userId), ne(adminUsers.uuid, session.userUuid)))
    .limit(1);

  if (conflict) {
    await writeAudit({
      action: AUDIT_ACTIONS.TWITCH_LINK_FAILED,
      actorUuid: session.userUuid,
      actorName: session.user.username,
      outcome: "failure",
      note: `Twitch-Account ${identity.login} ist bereits mit ${conflict.username} verknüpft.`,
      metadata: { twitchLogin: identity.login, twitchUserId: identity.userId },
    });

    return fail("already_linked");
  }

  const now = new Date();

  await db
    .update(adminUsers)
    .set({
      twitchUserId: identity.userId,
      twitchLogin: identity.login,
      twitchDisplayName: identity.displayName,
      twitchProfileImageUrl: identity.profileImageUrl,
      twitchLinkedAt: now,
      updatedAt: now,
    })
    .where(eq(adminUsers.uuid, session.userUuid));

  await writeAudit({
    action: AUDIT_ACTIONS.TWITCH_LINKED,
    actorUuid: session.userUuid,
    actorName: session.user.username,
    targetType: "account",
    targetId: session.userUuid,
    targetLabel: session.user.username,
    metadata: { twitchLogin: identity.login, twitchUserId: identity.userId },
  });

  cookieStore.delete(OAUTH_STATE_COOKIE);

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
