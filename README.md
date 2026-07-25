# TwitchPanel

Admin-Panel für die Twitch-Chatdatenbank: Login mit Zwei-Faktor-Authentifizierung, Accountverwaltung,
Rollen mit feingranularen Berechtigungen, Audit-Log sowie Auswertungen der aufgezeichneten Chatdaten.

## Stack

| Bereich       | Technologie                                                  |
| ------------- | ------------------------------------------------------------ |
| Framework     | Next.js 15 (App Router, React 19, Server Actions)            |
| Sprache       | TypeScript (strict)                                          |
| Datenbank     | MySQL 8 via Drizzle ORM + mysql2                             |
| Styling       | Tailwind CSS v4, shadcn/ui-Komponenten (Radix UI)            |
| Diagramme     | Recharts (Area, Bar, Donut) mit Theme-Anbindung              |
| Passwörter    | Argon2id (`@node-rs/argon2`)                                 |
| 2FA           | TOTP (`otplib`), Secrets AES-256-GCM-verschlüsselt in der DB |
| Sessions      | Eigene DB-Sessions, HttpOnly-Cookie mit SHA-256-Token        |

## Einrichtung

### 1. Abhängigkeiten installieren

```bash
npm install
```

### 2. Konfiguration

```bash
cp .env.example .env
npm run genkeys   # gibt einen ENCRYPTION_KEY aus
```

Trage in der `.env` die Datenbankzugangsdaten und den erzeugten `ENCRYPTION_KEY` ein.

> **Wichtig:** Der `ENCRYPTION_KEY` verschlüsselt die TOTP-Secrets. Wird er geändert oder verloren,
> müssen alle Nutzer ihre Zwei-Faktor-Authentifizierung neu einrichten.

### 3. Datenbank vorbereiten

Die Twitch-Tabellen (`channels`, `events`, `messages`, `moderation_actions`, `users`) legt der Bot an.
Existieren sie noch nicht, kann `sql/002_twitch_schema_reference.sql` verwendet werden.

Die panel-eigenen Tabellen anlegen — die Dateien in dieser Reihenfolge einspielen:

1. `sql/001_admin_schema.sql` — Accounts, Rollen, Sessions, Audit-Log
2. `sql/003_viewer_notes.sql` — Zuschauer-Notizen und die zugehörigen Rechte

In HeidiSQL: Datenbank auswählen, **Datei → SQL-Datei öffnen**, dann **F9**.

Über die Kommandozeile (PowerShell):

```powershell
Get-Content sql\001_admin_schema.sql | mysql -u <user> -p <datenbank>
Get-Content sql\003_viewer_notes.sql | mysql -u <user> -p <datenbank>
```

Alternativ über Drizzle (gleicht das Schema aus dem Code mit der Datenbank ab, legt aber
keine Fremdschlüssel an und verteilt die neuen Rechte nicht):

```bash
npm run db:push
```

### Datenbank auf einem entfernten Host

Liegt MySQL auf einem Server ohne offenen Port 3306, wird ein SSH-Tunnel benötigt:

```powershell
ssh -L 13306:127.0.0.1:3306 <ssh-user>@<ssh-host> -N
```

Danach in der `.env` `DB_HOST=127.0.0.1` und `DB_PORT=13306` setzen. Der Tunnel muss
laufen, solange `npm run dev`, `npm run seed` oder `db:push` verwendet werden.

### 4. Rollen und ersten Superadmin anlegen

```bash
npm run seed
```

Das Skript legt die vier Systemrollen an und – sofern noch kein Account existiert – einen Superadmin
aus `SEED_ADMIN_EMAIL` / `SEED_ADMIN_USERNAME`. Bleibt `SEED_ADMIN_PASSWORD` leer, wird ein sicheres
Passwort erzeugt und einmalig auf der Konsole ausgegeben.

### 5. Starten

```bash
npm run dev
```

Beim ersten Login wirst du zur Passwortänderung und zur 2FA-Einrichtung geführt.

## Datenmodell

### Bestehende Twitch-Tabellen (nur lesend, ausgenommen `channels`)

- `channels` – überwachte Channels, UUID als Primärschlüssel
- `messages` – Chatverlauf inkl. Badges, Farben, Bits
- `events` – Subs, Gifts, Raids, Cheers, Follows
- `moderation_actions` – Bans, Timeouts, gelöschte Nachrichten
- `users` – Twitch-Zuschauer (im Code als `viewers` gemappt, um Verwechslung mit Panel-Accounts zu vermeiden)

### Panel-Tabellen (Präfix `admin_`)

| Tabelle                  | Zweck                                                        |
| ------------------------ | ------------------------------------------------------------ |
| `admin_users`            | Panel-Accounts, Passwort-Hash, verschlüsseltes TOTP-Secret   |
| `admin_roles`            | Rollen mit Priorität und Farbe                               |
| `admin_role_permissions` | Rechte je Rolle                                              |
| `admin_user_roles`       | Rollenzuweisungen                                            |
| `admin_sessions`         | Aktive Sitzungen (ID = SHA-256 des Cookie-Tokens)            |
| `admin_recovery_codes`   | Einmal verwendbare 2FA-Wiederherstellungscodes               |
| `admin_viewer_notes`     | Interne Notizen zu Twitch-Zuschauern                         |
| `admin_audit_log`        | Protokoll aller sicherheitsrelevanten Vorgänge               |

### Twitch-Rohwerte

Twitch liefert Abo-Stufen als `1000`, `2000`, `3000` bzw. `Prime` (IRC-Tag `msg-param-sub-plan`,
EventSub-Feld `tier`). Diese Werte stehen so in der Datenbank und werden erst bei der Anzeige
über `src/lib/twitch.ts` auf **Tier 1**, **Tier 2**, **Tier 3** und **Prime** abgebildet. Dort liegen
auch die Beschriftungen für Event-Typen und Moderationsaktionen — beim Ergänzen neuer Twitch-Events
gehört das Label in diese Datei, nicht in die Seiten.

## Rollen und Berechtigungen

Rechte haben das Format `<bereich>.<aktion>` und sind in `src/lib/auth/permissions.ts` definiert.
`*` bedeutet Vollzugriff und ist Superadmins vorbehalten.

Jede Rolle hat eine **Priorität** (0–100). Sie verhindert Rechte-Eskalation:

- Rollen mit einer Priorität ≥ der eigenen können weder vergeben noch bearbeitet werden.
- Accounts, deren höchste Rollenpriorität ≥ der eigenen ist, können nicht geändert oder gelöscht werden.
- Superadmins (Wildcard-Recht) sind von diesen Einschränkungen ausgenommen.

Standardrollen aus dem Seed:

| Rolle         | Priorität | Umfang                                                        |
| ------------- | --------- | ------------------------------------------------------------- |
| Superadmin    | 100       | Vollzugriff (`*`)                                             |
| Administrator | 80        | Channels, Accounts, Rollen (lesend), Audit, Notizen komplett  |
| Moderator     | 50        | Chat-, Event- und Moderationsdaten, Notizen lesen + schreiben |
| Betrachter    | 10        | Dashboard und Channels                                        |

Notizen sind über drei eigene Rechte geregelt: `viewers.notes_view`, `viewers.notes_write` und
`viewers.notes_delete`. Eigene Notizen darf jeder mit Schreibrecht bearbeiten und löschen —
fremde nur mit `viewers.notes_delete`.

Abhängige Rechte werden serverseitig automatisch ergänzt: Wer `channels.create` erhält, bekommt
implizit auch `channels.view`.

## Sicherheitsmerkmale

- **Passwörter**: Argon2id (19 MiB, t=2, p=1), Mindestrichtlinie mit 12 Zeichen und vier Zeichenklassen
- **Brute-Force-Schutz**: Sperre nach `MAX_LOGIN_ATTEMPTS` Fehlversuchen für `LOCKOUT_MINUTES` Minuten
- **User-Enumeration**: Unbekannte Accounts durchlaufen einen echten Argon2-Vergleich (konstante Laufzeit)
- **Sessions**: Im Cookie liegt nur ein Zufallstoken, in der Datenbank dessen SHA-256-Hash
- **2FA**: TOTP mit ±30 s Toleranz, Secret AES-256-GCM-verschlüsselt, 10 Recovery-Codes (SHA-256-gehasht)
- **Setup-Schutz**: Das TOTP-Secret wandert verschlüsselt durch das Formular; Manipulation scheitert am GCM-Auth-Tag
- **Session-Invalidierung**: Passwortwechsel, Deaktivierung, 2FA-Reset und Passwort-Reset beenden Sitzungen
- **Audit-Log**: Jede sicherheitsrelevante Aktion inkl. IP, User-Agent und Vorher/Nachher-Werten
- **CSV-Export**: Formel-Injection-Schutz durch Maskierung führender `=`, `+`, `-`, `@`

## Projektstruktur

```
src/
├── app/
│   ├── (auth)/              Login, 2FA-Bestätigung, 2FA-Setup, Passwortwechsel
│   ├── (panel)/             Geschützter Bereich mit Sidebar
│   │   ├── dashboard/
│   │   ├── channels/        Liste, Detail, CRUD
│   │   ├── messages/        Suche + CSV-Export (Route Handler)
│   │   ├── events/
│   │   ├── moderation/
│   │   ├── viewers/         Liste und Chatter-Profil (Notizen, Verläufe)
│   │   ├── accounts/        Liste, Detail, Sicherheitsaktionen
│   │   ├── roles/           Rollen-Editor mit Rechte-Matrix
│   │   ├── audit/
│   │   └── profile/
│   ├── forbidden/
│   ├── error.tsx
│   └── not-found.tsx
├── components/
│   ├── charts/              Area-, Bar- und Donut-Chart auf Recharts-Basis
│   ├── ui/                  Basiskomponenten (Button, Card, Table, Tabs …)
│   └── app-shell.tsx        Seitenleiste, Kopfzeile, Account-Menü
├── lib/
│   ├── actions/             Server Actions (auth, accounts, roles, channels, notes)
│   ├── auth/                Session, Passwort, TOTP, Rechte, Guards
│   ├── db/                  Drizzle-Client und Schema
│   ├── queries/             Lesende Datenbankzugriffe
│   └── twitch.ts            Tier-Mapping und Beschriftungen der Twitch-Rohwerte
└── middleware.ts            Vorfilter auf Cookie-Präsenz
```

### Autorisierung im Code

- **Seiten**: `requirePermission(PERMISSIONS.X)` – leitet bei fehlendem Recht auf `/forbidden` um
- **Server Actions**: `assertPermission(PERMISSIONS.X)` – wirft `AuthorizationError`, wird als Formularfehler angezeigt
- **Middleware**: prüft nur, ob ein Session-Cookie existiert (die Edge-Runtime hat keinen DB-Zugriff);
  die eigentliche Prüfung erfolgt immer serverseitig

## Skripte

| Befehl               | Beschreibung                                    |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Entwicklungsserver                              |
| `npm run build`      | Produktions-Build                               |
| `npm run start`      | Produktionsserver                               |
| `npm run typecheck`  | TypeScript ohne Emit prüfen                     |
| `npm run genkeys`    | `ENCRYPTION_KEY` erzeugen                       |
| `npm run seed`       | Rollen und ersten Superadmin anlegen            |
| `npm run db:push`    | Schema mit der Datenbank abgleichen             |
| `npm run db:studio`  | Drizzle Studio öffnen                           |

## Erscheinungsbild

Das Panel unterstützt Hell, Dunkel und System. Die Wahl liegt im Cookie `tp_theme`, damit
der Server sie schon beim ersten Rendern kennt — dadurch blitzt beim Laden kein falsches
Theme auf. Bei „System“ ergänzt ein kleines Inline-Skript die Klasse vor dem ersten Paint.

Alle Farben sind CSS-Variablen in `src/app/globals.css`, definiert auf `:root`/`.dark` und
`.light`. Komponenten referenzieren ausschließlich diese Variablen — eine neue Farbe gehört
dort hinein, nicht als Tailwind-Klasse in die Seite. Die Diagrammfarben liegen unter
`--color-chart-1` bis `--color-chart-5`.

Umschalten lässt sich das Theme im Account-Menü am Fuß der Seitenleiste sowie unter
*Profil & Sicherheit*.

## Betrieb

- Hinter einem Reverse Proxy müssen `X-Forwarded-For` bzw. `X-Real-IP` durchgereicht werden,
  damit IP-Adressen im Audit-Log korrekt sind.
- `secure`-Cookies werden nur bei `NODE_ENV=production` gesetzt – im Produktivbetrieb ist HTTPS Pflicht.
- Abgelaufene Sessions werden bei jedem Login opportunistisch aufgeräumt.
- `ENFORCE_2FA=true` (Standard) zwingt jeden Account zur 2FA-Einrichtung vor der ersten Nutzung.
