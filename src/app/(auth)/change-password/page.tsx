import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AuthShell } from "../auth-shell";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Passwort ändern" };

export default async function ChangePasswordPage() {
  const session = await getSession();

  if (!session) redirect("/login");
  if (session.user.totpEnabled && !session.twoFactorVerified) redirect("/login/2fa");

  return (
    <AuthShell>
      <ChangePasswordForm forced={session.user.mustChangePassword} />
    </AuthShell>
  );
}
