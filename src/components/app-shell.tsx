"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Menu,
  PanelLeft,
  Radar,
  Radio,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Smile,
  Twitch,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AutoRefresh } from "@/components/auto-refresh";
import { Breadcrumbs, type Crumb } from "@/components/breadcrumbs";
import { CommandPalette, type CommandEntry } from "@/components/command-palette";
import { NavCount } from "@/components/nav-count";
import { ThemeSwitch } from "@/components/theme-switch";
import { NAVIGATION, type NavCountPromises, type NavItem } from "@/lib/navigation";
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
  Radar,
  Eye,
  Smile,
};

export interface AppShellUser {
  uuid: string;
  username: string;
  displayName: string | null;
  email: string;
  permissions: string[];
  roles: Array<{ uuid: string; name: string; color: string }>;
  totpEnabled: boolean;
  /** Profilbild aus der Twitch-Verknüpfung. */
  avatarUrl: string | null;
  twitchLogin: string | null;
}

interface AppShellProps {
  user: AppShellUser;
  theme: ThemePreference;
  /** Je Zähler ein eigenes Promise, damit jedes Badge einzeln nachrücken kann. */
  navCounts: NavCountPromises;
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

export function AppShell({ user, theme, navCounts, logoutAction, children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [sidebarVisible, setSidebarVisible] = React.useState(true);
  const [collapsed, setCollapsed] = React.useState<string[]>([]);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Eingeklappte Gruppen über Seitenwechsel hinweg merken.
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
    <Link
      href="/dashboard"
      className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-3 py-3 transition-colors hover:bg-[var(--color-surface)]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary)]">
        <Twitch className="size-5" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-lg font-bold tracking-tight text-[var(--color-foreground)]">
          TwitchPanel
        </span>
        <span className="block truncate text-xs text-[var(--color-subtle)]">Chat-Monitor</span>
      </span>
    </Link>
  );

  const navigation = (
    // Nimmt den freien Raum ein und scrollt bei Bedarf – Kopfbereich und
    // Account-Block bleiben dabei stehen.
    <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin px-2.5 py-3">
      {sections.map((section) => {
        const isCollapsed = collapsed.includes(section.label);
        // Eine Gruppe mit aktivem Eintrag bleibt sichtbar, auch wenn sie eingeklappt ist.
        const hasActiveItem = section.items.some((item) => isActive(pathname, item));
        const showItems = !isCollapsed || hasActiveItem;

        return (
          <div key={section.label}>
            {/* Überschrift links, Pfeil rechts am Zeilenende */}
            <button
              type="button"
              onClick={() => toggleSection(section.label)}
              aria-expanded={showItems}
              className="flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-sm font-medium text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
            >
              <span className="truncate">{section.label}</span>
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 opacity-60 transition-transform duration-150",
                  !showItems && "-rotate-90",
                )}
              />
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
                        "flex items-center gap-3 rounded-md px-2.5 py-2 text-[0.95rem] font-semibold transition-colors duration-100",
                        active
                          ? "bg-[var(--color-accent)] text-[var(--color-foreground)]"
                          : "text-[var(--color-foreground)] hover:bg-[var(--color-accent)]",
                      )}
                    >
                      <Icon className={cn("size-5 shrink-0", active ? "opacity-100" : "opacity-80")} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>

                      {item.countKey && (
                        // fallback={null}: Die Navigation soll sofort stehen,
                        // die Zahl darf nachrücken.
                        <React.Suspense fallback={null}>
                          <NavCount promise={navCounts[item.countKey]} active={active} />
                        </React.Suspense>
                      )}
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
    <div className="shrink-0 border-t border-[var(--color-border)] p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-surface)]"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                aria-hidden
                className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-[var(--color-border)]"
              />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary)] text-xs font-semibold ring-1 ring-[var(--color-border)]">
                {initials}
              </span>
            )}

            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{displayName}</span>
              <span className="block truncate text-xs text-[var(--color-subtle)]">
                {user.twitchLogin ? `@${user.twitchLogin}` : user.email}
              </span>
            </span>

            <ChevronsUpDown className="size-3.5 shrink-0 text-[var(--color-subtle)]" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-[17.5rem] overflow-hidden p-0">
          <div className="relative overflow-hidden border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 80% 70% at 10% 0%, color-mix(in srgb, var(--color-brand) 12%, transparent), transparent 65%)",
              }}
            />

            <div className="relative space-y-3 p-4">
              <div className="flex items-start gap-3">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt=""
                    aria-hidden
                    className="size-12 shrink-0 rounded-xl object-cover ring-1 ring-[var(--color-border)]"
                  />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-secondary)] text-sm font-semibold ring-1 ring-[var(--color-border)]">
                    {initials}
                  </span>
                )}

                <div className="min-w-0 flex-1 space-y-1 pt-0.5">
                  <p className="truncate text-sm font-semibold tracking-tight">{displayName}</p>
                  <p className="truncate text-xs text-[var(--color-muted-foreground)]">{user.email}</p>
                  {user.twitchLogin && (
                    <p className="truncate text-xs text-[var(--color-subtle)]">@{user.twitchLogin}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {user.roles.map((role) => (
                  <span
                    key={role.uuid}
                    className="rounded px-1.5 py-0.5 text-[0.65rem] font-medium"
                    style={{ backgroundColor: `${role.color}22`, color: role.color }}
                  >
                    {role.name}
                  </span>
                ))}
                {user.totpEnabled ? (
                  <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.65rem] font-medium text-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)]">
                    <ShieldCheck className="size-3" />
                    2FA
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.65rem] font-medium text-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)]">
                    <ShieldAlert className="size-3" />
                    2FA fehlt
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2 border-b border-[var(--color-border)] p-3.5">
            <p className="text-xs font-medium text-[var(--color-muted-foreground)]">Erscheinungsbild</p>
            <ThemeSwitch value={theme} withLabels />
          </div>

          <div className="p-1.5">
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <ShieldCheck />
                Profil &amp; Sicherheit
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Form muss aussen bleiben; onSelect preventDefault hält das Menü
                offen, sonst unmountet Radix die Form vor dem Server-Action-Submit. */}
            <form action={logoutAction} className="w-full">
              <DropdownMenuItem
                asChild
                destructive
                onSelect={(event) => {
                  event.preventDefault();
                }}
              >
                <button type="submit" className="flex w-full items-center gap-2">
                  <LogOut />
                  Abmelden
                </button>
              </DropdownMenuItem>
            </form>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const sidebarInner = (
    <>
      {brand}

      {/* Die Navigation trägt den Scrollbereich; der Account-Block bleibt unten sichtbar. */}
      {navigation}

      {!user.totpEnabled && (
        <div className="shrink-0 px-2.5 pb-2">
          <Link
            href="/setup-2fa"
            className="flex items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-2.5 py-1.5 text-xs text-[var(--color-foreground)]"
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
    <div className="flex h-dvh gap-2 bg-[var(--color-surface)] p-2">
      {sidebarVisible && (
        <aside className="hidden h-full w-60 shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-panel lg:flex">
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
          <aside className="relative m-2 flex h-[calc(100%-1rem)] w-60 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-panel">
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

      {/* Abgerundete Inhaltsfläche rechts neben der Sidebar */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-panel">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-background)]/90 px-3 backdrop-blur sm:px-4">
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

            {/* Auf Seiten mit eigener Aktualisierung (Live-Chat) überflüssig. */}
            {!pathname.startsWith("/live") && <AutoRefresh />}

            <CommandPalette
              entries={commandEntries}
              canSearchMessages={hasPermission(user.permissions, "messages.view")}
            />
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 space-y-5 overflow-y-auto scrollbar-thin p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
