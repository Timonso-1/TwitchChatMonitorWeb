import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";

/**
 * Zähler, die in der Seitenleiste hinter dem Eintrag stehen.
 * Die zugehörigen Abfragen liegen in `lib/queries/nav-counts.ts`; die Union hier
 * ist die gemeinsame Quelle, damit Navigation und Abfrageschicht nicht
 * auseinanderlaufen können.
 *
 * Der Typ wohnt bewusst in dieser Datei und nicht in der Query-Datei: Letztere
 * ist `server-only` und darf von Client-Komponenten nicht importiert werden.
 */
export type NavCountKey =
  | "channels"
  | "messages"
  | "events"
  | "viewers"
  | "moderation"
  | "watchlist"
  | "watchboard"
  | "accounts"
  | "roles"
  | "audit";

/** Fehlt ein Schlüssel, ist die Abfrage fehlgeschlagen oder nicht erlaubt. */
export type NavCounts = Partial<Record<NavCountKey, number>>;

export interface NavItem {
  href: string;
  label: string;
  /** Lucide-Icon-Name, wird clientseitig aufgelöst. */
  icon: string;
  permission: Permission;
  /** Exakter Pfadvergleich statt Präfix (für /dashboard). */
  exact?: boolean;
  /** Ohne Schlüssel bleibt der Eintrag ohne Zahl (Dashboard, Live-Chat, Emotes …). */
  countKey?: NavCountKey;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    label: "Übersicht",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: "LayoutDashboard",
        permission: PERMISSIONS.DASHBOARD_VIEW,
        exact: true,
      },
    ],
  },
  {
    label: "Chat",
    items: [
      { href: "/live", label: "Live-Chat", icon: "Radar", permission: PERMISSIONS.CHAT_LIVE },
      {
        href: "/channels",
        label: "Channels",
        icon: "Radio",
        permission: PERMISSIONS.CHANNELS_VIEW,
        countKey: "channels",
      },
      {
        href: "/messages",
        label: "Nachrichten",
        icon: "MessageSquare",
        permission: PERMISSIONS.MESSAGES_VIEW,
        countKey: "messages",
      },
      { href: "/events", label: "Events", icon: "Zap", permission: PERMISSIONS.EVENTS_VIEW, countKey: "events" },
      // Emotes bewusst ohne Zahl: Verwendungen stecken im nicht indizierbaren
      // `emotes`-Tag und werden nur über eine Stichprobe hochgerechnet.
      { href: "/emotes", label: "Emotes", icon: "Smile", permission: PERMISSIONS.MESSAGES_VIEW },
    ],
  },
  {
    label: "Community",
    items: [
      { href: "/viewers", label: "Zuschauer", icon: "Users", permission: PERMISSIONS.VIEWERS_VIEW, countKey: "viewers" },
      {
        href: "/moderation",
        label: "Moderation",
        icon: "ShieldAlert",
        permission: PERMISSIONS.MODERATION_VIEW,
        countKey: "moderation",
      },
      {
        href: "/watchlist",
        label: "Wortfilter",
        icon: "Radar",
        permission: PERMISSIONS.WATCHLIST_VIEW,
        countKey: "watchlist",
      },
      {
        href: "/watchboard",
        label: "Beobachtungsliste",
        icon: "Eye",
        permission: PERMISSIONS.VIEWERS_NOTES_VIEW,
        countKey: "watchboard",
      },
    ],
  },
  {
    label: "Werkzeuge",
    items: [
      {
        href: "/tools/lookup",
        label: "Name-/ID-Konverter",
        icon: "ArrowLeftRight",
        permission: PERMISSIONS.VIEWERS_VIEW,
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/accounts",
        label: "Accounts",
        icon: "UserCog",
        permission: PERMISSIONS.ACCOUNTS_VIEW,
        countKey: "accounts",
      },
      { href: "/roles", label: "Rollen", icon: "KeyRound", permission: PERMISSIONS.ROLES_VIEW, countKey: "roles" },
      {
        href: "/audit",
        label: "Audit-Log",
        icon: "ScrollText",
        permission: PERMISSIONS.AUDIT_VIEW,
        countKey: "audit",
      },
    ],
  },
];
