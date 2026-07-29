import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/ui/toast";
import { logoutAction } from "@/lib/actions/auth";
import { requireSession } from "@/lib/auth/guard";
import { getNavCounts } from "@/lib/queries/nav-counts";
import { THEME_COOKIE_NAME, isThemePreference } from "@/lib/theme";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  const cookieStore = await cookies();
  const rawTheme = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const theme = isThemePreference(rawTheme) ? rawTheme : "system";

  // Startet die Abfragen, ohne zu warten: die Seitenleiste löst jedes Badge in
  // einer eigenen Suspense-Grenze auf. Kein Seitenaufruf blockiert dadurch auf
  // einem Zähler, und ein langsamer hält die übrigen nicht auf.
  const navCounts = getNavCounts(session.user.permissions);

  return (
    <ToastProvider>
      <AppShell
        navCounts={navCounts}
        user={{
          uuid: session.user.uuid,
          username: session.user.username,
          // Der Twitch-Anzeigename hat Vorrang – er ist das, was das Team kennt.
          displayName: session.user.twitchDisplayName ?? session.user.displayName,
          email: session.user.email,
          permissions: session.user.permissions,
          roles: session.user.roles.map((role) => ({ uuid: role.uuid, name: role.name, color: role.color })),
          totpEnabled: session.user.totpEnabled,
          avatarUrl: session.user.twitchProfileImageUrl,
          twitchLogin: session.user.twitchLogin,
        }}
        theme={theme}
        logoutAction={logoutAction}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
