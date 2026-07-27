import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";

export interface NavItem {
  href: string;
  label: string;
  /** Lucide-Icon-Name, wird clientseitig aufgelöst. */
  icon: string;
  permission: Permission;
  /** Exakter Pfadvergleich statt Präfix (für /dashboard). */
  exact?: boolean;
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
      { href: "/channels", label: "Channels", icon: "Radio", permission: PERMISSIONS.CHANNELS_VIEW },
      { href: "/messages", label: "Nachrichten", icon: "MessageSquare", permission: PERMISSIONS.MESSAGES_VIEW },
      { href: "/events", label: "Events", icon: "Zap", permission: PERMISSIONS.EVENTS_VIEW },
      { href: "/emotes", label: "Emotes", icon: "Smile", permission: PERMISSIONS.MESSAGES_VIEW },
    ],
  },
  {
    label: "Community",
    items: [
      { href: "/viewers", label: "Zuschauer", icon: "Users", permission: PERMISSIONS.VIEWERS_VIEW },
      { href: "/moderation", label: "Moderation", icon: "ShieldAlert", permission: PERMISSIONS.MODERATION_VIEW },
      { href: "/watchlist", label: "Wortfilter", icon: "Radar", permission: PERMISSIONS.WATCHLIST_VIEW },
      {
        href: "/watchboard",
        label: "Beobachtungsliste",
        icon: "Eye",
        permission: PERMISSIONS.VIEWERS_NOTES_VIEW,
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
      { href: "/accounts", label: "Accounts", icon: "UserCog", permission: PERMISSIONS.ACCOUNTS_VIEW },
      { href: "/roles", label: "Rollen", icon: "KeyRound", permission: PERMISSIONS.ROLES_VIEW },
      { href: "/audit", label: "Audit-Log", icon: "ScrollText", permission: PERMISSIONS.AUDIT_VIEW },
    ],
  },
];
