"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { THEME_COOKIE_MAX_AGE, THEME_COOKIE_NAME, isThemePreference } from "@/lib/theme";

/** Speichert die Theme-Wahl im Cookie. Bewusst ohne Anmeldezwang. */
export async function setThemeAction(formData: FormData): Promise<void> {
  const value = formData.get("theme");
  if (!isThemePreference(value)) return;

  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE_NAME, value, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/", "layout");
}
