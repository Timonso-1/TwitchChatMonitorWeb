"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronsUpDown,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Menu,
  PanelLeft,
  Radio,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Breadcrumbs, type Crumb } from "@/components/breadcrumbs";
import { CommandPalette, type CommandEntry } from "@/components/command-palette";
import { ThemeSwitch } from "@/components/theme-switch";
import { NAVIGATION, type NavItem } from "@/lib/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import type { ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Radio,
  MessageSquare,
  Zap,
  ShieldAlert,
  Users,
  UserCog,
  KeyRound,
  ScrollText,
  ArrowLeftRight,
};

export interface AppShellUser {
  uuid: string;
  username: string;
  displayName: string | null;
  email: string;
  permissions: string[];
  roles: Array<{ uuid: string; name: string; color: string }>;
  totpEnabled: boolean;
}

interface AppShellProps {
  user: AppShellUser;
  theme: ThemePreference;
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Leitet die Pfadanzeige aus der aktuellen URL und der Navigation ab. */
function buildCrumbs(pathname: string, sections: typeof NAVIGATION): Crumb[] {
  for (const section of sections) {
    for (const item of section.items) {
      if (!isActive(pathname, item)) continue;

      const crumbs: Crumb[] = [{ label: section.label }, { label: item.label, href: item.href }];

      const rest = pathname.slice(item.href.length).split("/").filter(Boolean);
      for (const segment of rest) {
        crumbs.push({ label: segment.length > 14 ? `${segment.slice(0, 8)}…` : segment });
      }

      return crumbs;
    }
  }

  if (pathname.startsWith("/profile")) {
    return [{ label: "Konto" }, { label: "Profil & Sicherheit", href: "/profile" }];
  }

  return [];
}

const COLLAPSED_STORAGE_KEY = "tp_sidebar_collapsed";

export function AppShell({ user, theme, logoutAction, children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [sidebarVisible, setSidebarVisible] = React.useState(true);
  const [collapsed, setCollapsed] = React.useState<string[]>([]);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Eingeklappte Gruppen ueber Seitenwechsel hinweg merken.
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (stored) setCollapsed(JSON.parse(stored) as string[]);
    } catch {
      // Kein Zugriff auf localStorage – dann bleiben alle Gruppen offen.
    }
  }, []);

  function toggleSection(label: string) {
    setCollapsed((previous) => {
      const next = previous.includes(label)
        ? previous.filter((entry) => entry !== label)
        : [...previous, label];

      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Speichern ist optional.
      }

      return next;
    });
  }

  const sections = React.useMemo(
    () =>
      NAVIGATION.map((section) => ({
        ...section,
        items: section.items.filter((item) => hasPermission(user.permissions, item.permission)),
      })).filter((section) => section.items.length > 0),
    [user.permissions],
  );

  const crumbs = React.useMemo(() => buildCrumbs(pathname, sections), [pathname, sections]);

  const commandEntries = React.useMemo<CommandEntry[]>(
    () => [
      ...sections.flatMap((section) =>
        section.items.map((item) => ({ href: item.href, label: item.label, group: section.label })),
      ),
      { href: "/profile", label: "Profil & Sicherheit", group: "Konto" },
    ],
    [sections],
  );

  const displayName = user.displayName ?? user.username;
  const initials = displayName.slice(0, 2).toUpperCase();

  const brand = (
    <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-4 py-3.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary)]">
        <Radio className="size-4" />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold">TwitchPanel</p>
        <p className="truncate text-xs text-[var(--color-subtle)]">Chat-Monitor</p>
      </div>
    </div>
  );

  const navigation = (
    <nav className="space-y-1 overflow-y-auto scrollbar-thin px-2.5 py-3">
      {sections.map((section) => {
        const isCollapsed = collapsed.includes(section.label);
        // Eine Gruppe mit aktivem Eintrag bleibt sichtbar, auch wenn sie eingeklappt ist.
        const hasActiveItem = section.items.some((item) => isActive(pathname, item));
        const showItems = !isCollapsed || hasActiveItem;

        return (
          <div key={section.label}>
            <button
              type="button"
              onClick={() => toggleSection(section.label)}
              aria-expanded={showItems}
              className="flex w-full items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-subtle)] transition-colors hover:text-[var(--color-muted-foreground)]"
            >
              <ChevronDown
                className={cn("size-3 transition-transform duration-150", !showItems && "-rotate-90")}
              />
              {section.label}
            </button>

            {showItems && (
              <div className="space-y-0.5 pt-0.5">
                {section.items.map((item) => {
                  const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
                  const active = isActive(pathname, item);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-100",
                        active
                          ? "bg-[var(--color-accent)] font-medium text-[var(--color-foreground)]"
                          : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", active ? "opacity-100" : "opacity-70")} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  /** Account-Block am Fuss der Seitenleiste. */
  const accountBlock = (
    <div className="border-t border-[var(--color-border)] p-2.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--color-surface)]"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-secondary)] text-xs font-semibold">
              {initials}
            </span>

            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{displayName}</span>
              <span className="block truncate text-xs text-[var(--color-subtle)]">{user.email}</span>
            </span>

            <ChevronsUpDown className="size-3.5 shrink-0 text-[var(--color-subtle)]" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="top" align="start" className="w-[15rem]">
          <DropdownMenuLabel>
            <span className="block truncate text-sm font-medium text-[var(--color-foreground)]">{displayName}</span>
            <span className="block truncate text-xs font-normal text-[var(--color-muted-foreground)]">
              {user.email}
            </span>
          </DropdownMenuLabel>

          {user.roles.length > 0 && (
            <div className="flex flex-wrap gap-1 px-2 pb-2">
              {user.roles.map((role) => (
                <span
                  key={role.uuid}
                  className="rounded px-1.5 py-0.5 text-[0.65rem] font-medium"
                  style={{ backgroundColor: `${role.color}22`, color: role.color }}
                >
                  {role.name}
                </span>
              ))}
            </div>
          )}

          <DropdownMenuSeparator />

          <div className="px-2 py-1.5">
            <p className="pb-1.5 text-xs text-[var(--color-muted-foreground)]">Erscheinungsbild</p>
            <ThemeSwitch value={theme} />
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/profile">
              <ShieldCheck />
              Profil &amp; Sicherheit
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild destructive>
            <form action={logoutAction} className="w-full">
              <button type="submit" className="flex w-full items-center gap-2">
                <LogOut />
                Abmelden
              </button>
            </form>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const sidebarInner = (
    <>
      {brand}

      {/* Nimmt nur die noetige Hoehe ein; der Rest schiebt den Account-Block nach unten. */}
      {navigation}
      <div className="flex-1" />

      {!user.totpEnabled && (
        <div className="px-2.5 pb-2">
          <Link
            href="/setup-2fa"
            className="flex items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-2.5 py-2 text-xs text-[var(--color-foreground)]"
          >
            <ShieldAlert className="size-3.5 shrink-0 text-[var(--color-warning)]" />
            Zwei-Faktor einrichten
          </Link>
        </div>
      )}

      {accountBlock}
    </>
  );

  return (
    <div className="flex min-h-dvh bg-[var(--color-background)]">
      {sidebarVisible && (
        <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:flex">
          {sidebarInner}
        </aside>
      )}

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Menü schließen"
            className="absolute inset-0 bg-[hsl(0_0%_0%/0.55)]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2.5 z-10"
              onClick={() => setMobileOpen(false)}
            >
              <X />
            </Button>
            {sidebarInner}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-background)]/90 px-3 backdrop-blur sm:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu />
            <span className="sr-only">Menü öffnen</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            onClick={() => setSidebarVisible((visible) => !visible)}
          >
            <PanelLeft />
            <span className="sr-only">Seitenleiste ein- oder ausblenden</span>
          </Button>

          <div className="min-w-0 flex-1 overflow-hidden">
            <Breadcrumbs items={crumbs} />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!user.totpEnabled && (
              <Badge variant="warning" className="hidden md:inline-flex">
                2FA fehlt
              </Badge>
            )}
            <CommandPalette entries={commandEntries} />
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 space-y-5 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
