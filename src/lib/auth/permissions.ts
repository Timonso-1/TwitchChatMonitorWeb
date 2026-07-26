/**
 * Zentrale Rechte-Registry.
 * Ein Recht ist ein String im Format "<bereich>.<aktion>".
 * Der Wildcard "*" bedeutet Vollzugriff und ist der Superadmin-Rolle vorbehalten.
 */

export const WILDCARD_PERMISSION = "*" as const;

export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",

  CHANNELS_VIEW: "channels.view",
  CHANNELS_CREATE: "channels.create",
  CHANNELS_UPDATE: "channels.update",
  CHANNELS_DELETE: "channels.delete",

  MESSAGES_VIEW: "messages.view",
  MESSAGES_EXPORT: "messages.export",
  CHAT_LIVE: "chat.live",

  EVENTS_VIEW: "events.view",
  EVENTS_EXPORT: "events.export",

  WATCHLIST_VIEW: "watchlist.view",
  WATCHLIST_MANAGE: "watchlist.manage",

  MODERATION_VIEW: "moderation.view",
  MODERATION_EXPORT: "moderation.export",

  VIEWERS_VIEW: "viewers.view",
  VIEWERS_NOTES_VIEW: "viewers.notes_view",
  VIEWERS_NOTES_WRITE: "viewers.notes_write",
  VIEWERS_NOTES_DELETE: "viewers.notes_delete",

  ACCOUNTS_VIEW: "accounts.view",
  ACCOUNTS_CREATE: "accounts.create",
  ACCOUNTS_UPDATE: "accounts.update",
  ACCOUNTS_DELETE: "accounts.delete",
  ACCOUNTS_RESET_2FA: "accounts.reset_2fa",
  ACCOUNTS_MANAGE_SESSIONS: "accounts.manage_sessions",

  ROLES_VIEW: "roles.view",
  ROLES_MANAGE: "roles.manage",

  AUDIT_VIEW: "audit.view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionGroup {
  key: string;
  label: string;
  description: string;
  permissions: Array<{
    value: Permission;
    label: string;
    description: string;
    /** Rechte, die implizit mitbenoetigt werden. */
    requires?: Permission[];
  }>;
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "general",
    label: "Allgemein",
    description: "Grundlegender Zugang zum Panel",
    permissions: [
      {
        value: PERMISSIONS.DASHBOARD_VIEW,
        label: "Dashboard ansehen",
        description: "Zugriff auf die Startseite mit den Kennzahlen",
      },
    ],
  },
  {
    key: "channels",
    label: "Channels",
    description: "Verwaltung der ueberwachten Twitch-Channels",
    permissions: [
      { value: PERMISSIONS.CHANNELS_VIEW, label: "Channels ansehen", description: "Liste und Details der Channels" },
      {
        value: PERMISSIONS.CHANNELS_CREATE,
        label: "Channel anlegen",
        description: "Neuen Channel hinzufuegen",
        requires: [PERMISSIONS.CHANNELS_VIEW],
      },
      {
        value: PERMISSIONS.CHANNELS_UPDATE,
        label: "Channel bearbeiten",
        description: "Name, Broadcaster-ID und Status aendern",
        requires: [PERMISSIONS.CHANNELS_VIEW],
      },
      {
        value: PERMISSIONS.CHANNELS_DELETE,
        label: "Channel loeschen",
        description: "Channel dauerhaft entfernen",
        requires: [PERMISSIONS.CHANNELS_VIEW],
      },
    ],
  },
  {
    key: "chat",
    label: "Chat & Events",
    description: "Lesezugriff auf die aufgezeichneten Chatdaten",
    permissions: [
      { value: PERMISSIONS.MESSAGES_VIEW, label: "Nachrichten ansehen", description: "Chatverlauf durchsuchen" },
      {
        value: PERMISSIONS.MESSAGES_EXPORT,
        label: "Nachrichten exportieren",
        description: "Suchergebnisse als CSV herunterladen",
        requires: [PERMISSIONS.MESSAGES_VIEW],
      },
      {
        value: PERMISSIONS.CHAT_LIVE,
        label: "Live-Chat ansehen",
        description: "Laufenden Chat mit automatischer Aktualisierung verfolgen",
        requires: [PERMISSIONS.MESSAGES_VIEW],
      },
      { value: PERMISSIONS.EVENTS_VIEW, label: "Events ansehen", description: "Subs, Raids, Follows, Cheers" },
      {
        value: PERMISSIONS.EVENTS_EXPORT,
        label: "Events exportieren",
        description: "Suchergebnisse als CSV herunterladen",
        requires: [PERMISSIONS.EVENTS_VIEW],
      },
      {
        value: PERMISSIONS.MODERATION_VIEW,
        label: "Moderationslog ansehen",
        description: "Banns, Timeouts und geloeschte Nachrichten",
      },
      {
        value: PERMISSIONS.MODERATION_EXPORT,
        label: "Moderationslog exportieren",
        description: "Suchergebnisse als CSV herunterladen",
        requires: [PERMISSIONS.MODERATION_VIEW],
      },
      { value: PERMISSIONS.VIEWERS_VIEW, label: "Zuschauer ansehen", description: "Zuschauerprofile und Statistiken" },
    ],
  },
  {
    key: "watchlist",
    label: "Wortfilter",
    description: "Beobachtete Begriffe im Chat",
    permissions: [
      {
        value: PERMISSIONS.WATCHLIST_VIEW,
        label: "Wortfilter ansehen",
        description: "Begriffe und deren Treffer einsehen",
        requires: [PERMISSIONS.MESSAGES_VIEW],
      },
      {
        value: PERMISSIONS.WATCHLIST_MANAGE,
        label: "Wortfilter verwalten",
        description: "Begriffe anlegen, ändern und entfernen",
        requires: [PERMISSIONS.MESSAGES_VIEW, PERMISSIONS.WATCHLIST_VIEW],
      },
    ],
  },
  {
    key: "notes",
    label: "Zuschauer-Notizen",
    description: "Interne Vermerke zu einzelnen Zuschauern",
    permissions: [
      {
        value: PERMISSIONS.VIEWERS_NOTES_VIEW,
        label: "Notizen lesen",
        description: "Interne Notizen auf Zuschauerprofilen einsehen",
        requires: [PERMISSIONS.VIEWERS_VIEW],
      },
      {
        value: PERMISSIONS.VIEWERS_NOTES_WRITE,
        label: "Notizen schreiben",
        description: "Eigene Notizen anlegen und bearbeiten",
        requires: [PERMISSIONS.VIEWERS_VIEW, PERMISSIONS.VIEWERS_NOTES_VIEW],
      },
      {
        value: PERMISSIONS.VIEWERS_NOTES_DELETE,
        label: "Notizen löschen",
        description: "Notizen aller Teammitglieder entfernen",
        requires: [PERMISSIONS.VIEWERS_VIEW, PERMISSIONS.VIEWERS_NOTES_VIEW],
      },
    ],
  },
  {
    key: "accounts",
    label: "Accountverwaltung",
    description: "Panel-Accounts und deren Zugaenge",
    permissions: [
      { value: PERMISSIONS.ACCOUNTS_VIEW, label: "Accounts ansehen", description: "Liste aller Panel-Accounts" },
      {
        value: PERMISSIONS.ACCOUNTS_CREATE,
        label: "Account anlegen",
        description: "Neuen Panel-Account erstellen",
        requires: [PERMISSIONS.ACCOUNTS_VIEW],
      },
      {
        value: PERMISSIONS.ACCOUNTS_UPDATE,
        label: "Account bearbeiten",
        description: "Stammdaten, Rollen, Aktivstatus, Passwort-Reset",
        requires: [PERMISSIONS.ACCOUNTS_VIEW],
      },
      {
        value: PERMISSIONS.ACCOUNTS_DELETE,
        label: "Account loeschen",
        description: "Panel-Account dauerhaft entfernen",
        requires: [PERMISSIONS.ACCOUNTS_VIEW],
      },
      {
        value: PERMISSIONS.ACCOUNTS_RESET_2FA,
        label: "2FA zuruecksetzen",
        description: "Zwei-Faktor-Authentifizierung eines Accounts entfernen",
        requires: [PERMISSIONS.ACCOUNTS_VIEW],
      },
      {
        value: PERMISSIONS.ACCOUNTS_MANAGE_SESSIONS,
        label: "Sessions verwalten",
        description: "Aktive Sessions fremder Accounts beenden",
        requires: [PERMISSIONS.ACCOUNTS_VIEW],
      },
    ],
  },
  {
    key: "roles",
    label: "Rollen & Rechte",
    description: "Rollenmodell des Panels",
    permissions: [
      { value: PERMISSIONS.ROLES_VIEW, label: "Rollen ansehen", description: "Rollen und deren Rechte einsehen" },
      {
        value: PERMISSIONS.ROLES_MANAGE,
        label: "Rollen verwalten",
        description: "Rollen anlegen, bearbeiten und loeschen",
        requires: [PERMISSIONS.ROLES_VIEW],
      },
    ],
  },
  {
    key: "audit",
    label: "Audit",
    description: "Nachvollziehbarkeit aller Aktionen",
    permissions: [
      { value: PERMISSIONS.AUDIT_VIEW, label: "Audit-Log ansehen", description: "Protokoll aller Panel-Aktionen" },
    ],
  },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.value),
);

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function isValidPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

const PERMISSION_LABELS = new Map<string, string>(
  PERMISSION_GROUPS.flatMap((group) => group.permissions.map((p) => [p.value, `${group.label}: ${p.label}`] as const)),
);

export function permissionLabel(permission: string): string {
  if (permission === WILDCARD_PERMISSION) return "Vollzugriff (alle Rechte)";
  return PERMISSION_LABELS.get(permission) ?? permission;
}

/**
 * Erweitert eine Rechteauswahl um alle implizit benoetigten Rechte.
 * Beispiel: "channels.create" zieht "channels.view" nach sich.
 */
export function expandRequiredPermissions(permissions: string[]): Permission[] {
  const result = new Set<string>();

  for (const permission of permissions) {
    if (!isValidPermission(permission)) continue;
    result.add(permission);

    for (const group of PERMISSION_GROUPS) {
      const definition = group.permissions.find((p) => p.value === permission);
      if (!definition?.requires) continue;
      for (const required of definition.requires) result.add(required);
    }
  }

  return [...result] as Permission[];
}

/** Prueft, ob eine Rechte-Menge ein bestimmtes Recht abdeckt. */
export function hasPermission(granted: ReadonlySet<string> | readonly string[], required: Permission): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  return set.has(WILDCARD_PERMISSION) || set.has(required);
}

/** Prueft, ob mindestens eines der geforderten Rechte vorhanden ist. */
export function hasAnyPermission(
  granted: ReadonlySet<string> | readonly string[],
  required: readonly Permission[],
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  if (set.has(WILDCARD_PERMISSION)) return true;
  return required.some((permission) => set.has(permission));
}

/** Standardrollen, die beim Seeding angelegt werden. */
export const DEFAULT_ROLES: Array<{
  key: string;
  name: string;
  description: string;
  priority: number;
  color: string;
  isSystem: boolean;
  permissions: string[];
}> = [
  {
    key: "superadmin",
    name: "Superadmin",
    description: "Uneingeschraenkter Zugriff auf saemtliche Funktionen",
    priority: 100,
    color: "#ef4444",
    isSystem: true,
    permissions: [WILDCARD_PERMISSION],
  },
  {
    key: "admin",
    name: "Administrator",
    description: "Verwaltet Channels, Accounts und Rollen",
    priority: 80,
    color: "#f97316",
    isSystem: true,
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CHANNELS_VIEW,
      PERMISSIONS.CHANNELS_CREATE,
      PERMISSIONS.CHANNELS_UPDATE,
      PERMISSIONS.CHANNELS_DELETE,
      PERMISSIONS.MESSAGES_VIEW,
      PERMISSIONS.MESSAGES_EXPORT,
      PERMISSIONS.CHAT_LIVE,
      PERMISSIONS.EVENTS_VIEW,
      PERMISSIONS.EVENTS_EXPORT,
      PERMISSIONS.MODERATION_VIEW,
      PERMISSIONS.MODERATION_EXPORT,
      PERMISSIONS.VIEWERS_VIEW,
      PERMISSIONS.VIEWERS_NOTES_VIEW,
      PERMISSIONS.VIEWERS_NOTES_WRITE,
      PERMISSIONS.VIEWERS_NOTES_DELETE,
      PERMISSIONS.WATCHLIST_VIEW,
      PERMISSIONS.WATCHLIST_MANAGE,
      PERMISSIONS.ACCOUNTS_VIEW,
      PERMISSIONS.ACCOUNTS_CREATE,
      PERMISSIONS.ACCOUNTS_UPDATE,
      PERMISSIONS.ACCOUNTS_RESET_2FA,
      PERMISSIONS.ACCOUNTS_MANAGE_SESSIONS,
      PERMISSIONS.ROLES_VIEW,
      PERMISSIONS.AUDIT_VIEW,
    ],
  },
  {
    key: "moderator",
    name: "Moderator",
    description: "Liest Chat-, Event- und Moderationsdaten",
    priority: 50,
    color: "#8b5cf6",
    isSystem: true,
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CHANNELS_VIEW,
      PERMISSIONS.MESSAGES_VIEW,
      PERMISSIONS.CHAT_LIVE,
      PERMISSIONS.EVENTS_VIEW,
      PERMISSIONS.MODERATION_VIEW,
      PERMISSIONS.VIEWERS_VIEW,
      PERMISSIONS.VIEWERS_NOTES_VIEW,
      PERMISSIONS.VIEWERS_NOTES_WRITE,
      PERMISSIONS.WATCHLIST_VIEW,
      PERMISSIONS.WATCHLIST_MANAGE,
    ],
  },
  {
    key: "viewer",
    name: "Betrachter",
    description: "Nur lesender Zugriff auf Dashboard und Channels",
    priority: 10,
    color: "#3b82f6",
    isSystem: true,
    permissions: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.CHANNELS_VIEW],
  },
];
