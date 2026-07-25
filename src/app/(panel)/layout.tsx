import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { logoutAction } from "@/lib/actions/auth";
import { requireSession } from "@/lib/auth/guard";
import { THEME_COOKIE_NAME, isThemePreference } from "@/lib/theme";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  const cookieStore = await cookies();
  const rawTheme = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const theme = isThemePreference(rawTheme) ? rawTheme : "system";

  return (
    <AppShell
      user={{
        uuid: session.user.uuid,
        username: session.user.username,
        displayName: session.user.displayName,
        email: session.user.email,
        permissions: session.user.permissions,
        roles: session.user.roles.map((role) => ({ uuid: role.uuid, name: role.name, color: role.color })),
        totpEnabled: session.user.totpEnabled,
      }}
      theme={theme}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
