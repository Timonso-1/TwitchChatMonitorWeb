import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect(session.twoFactorVerified ? "/dashboard" : "/login/2fa");
  }

  return <LoginForm />;
}
