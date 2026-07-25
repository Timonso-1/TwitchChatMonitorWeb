import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Zwei-Faktor-Bestätigung" };

export default async function TwoFactorPage() {
  const session = await getSession();

  if (!session) redirect("/login");
  if (session.twoFactorVerified) redirect("/dashboard");
  if (!session.user.totpEnabled) redirect("/setup-2fa");

  return <TwoFactorForm username={session.user.displayName ?? session.user.username} />;
}
