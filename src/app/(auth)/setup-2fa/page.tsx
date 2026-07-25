import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createTwoFactorSetup } from "@/lib/auth/setup";
import { SetupTwoFactorForm } from "./setup-form";

export const metadata: Metadata = { title: "Zwei-Faktor einrichten" };

// Bei jedem Aufruf muss ein frisches Secret erzeugt werden.
export const dynamic = "force-dynamic";

export default async function SetupTwoFactorPage() {
  const session = await getSession();

  if (!session) redirect("/login");
  if (session.user.totpEnabled && !session.twoFactorVerified) redirect("/login/2fa");
  if (session.user.totpEnabled) redirect("/profile");

  const setup = await createTwoFactorSetup(session.user.email);

  return (
    <SetupTwoFactorForm
      secret={setup.secret}
      secretToken={setup.secretToken}
      qrCode={setup.qrCode}
      accountLabel={session.user.email}
    />
  );
}
