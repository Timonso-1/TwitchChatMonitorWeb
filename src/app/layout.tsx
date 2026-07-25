import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { THEME_COOKIE_NAME, THEME_INIT_SCRIPT, isThemePreference } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TwitchPanel",
    template: "%s · TwitchPanel",
  },
  description: "Administrationsoberfläche für die Twitch-Chatdatenbank",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#fcfcfc" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const preference = isThemePreference(raw) ? raw : "system";

  // Bei einer expliziten Wahl kann die Klasse direkt serverseitig gesetzt werden.
  // Bei "system" ergaenzt sie das Inline-Skript vor dem ersten Paint.
  const initialClass = preference === "light" ? "light" : "dark";

  return (
    <html
      lang="de"
      className={initialClass}
      data-theme-preference={preference}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
