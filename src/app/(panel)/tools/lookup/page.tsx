import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink, Hash, Search, User } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TwitchProfileLink } from "@/components/twitch-profile-link";
import { ViewerAvatar } from "@/components/viewer-avatar";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Textarea } from "@/components/ui/input";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getKnownViewerIds } from "@/lib/queries/viewer-profile";
import { isTwitchApiConfigured, lookupTwitchUsers, type LookupDirection } from "@/lib/twitch-api";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Name-/ID-Konverter" };
export const dynamic = "force-dynamic";

const MAX_QUERIES = 100;

const DIRECTIONS: Array<{
  value: LookupDirection;
  label: string;
  inputLabel: string;
  placeholder: string;
  hint: string;
}> = [
  {
    value: "name-to-id",
    label: "Name → ID",
    inputLabel: "Benutzername",
    placeholder: "timonso\nbeispielkanal\nhttps://twitch.tv/noch_einer",
    hint: "Twitch-Links und ein führendes @ werden automatisch entfernt.",
  },
  {
    value: "id-to-name",
    label: "ID → Name",
    inputLabel: "User-ID",
    placeholder: "123456789\n987654321",
    hint: "Nur Ziffern – alles andere wird herausgefiltert.",
  },
];

function normalizeDirection(value: unknown): LookupDirection {
  return value === "id-to-name" ? "id-to-name" : "name-to-id";
}

export default async function LookupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.VIEWERS_VIEW);
  const params = await searchParams;

  const direction = normalizeDirection(params.dir);
  const config = DIRECTIONS.find((entry) => entry.value === direction) ?? DIRECTIONS[0];
  const raw = typeof params.q === "string" ? params.q : "";

  const queries = raw
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, MAX_QUERIES);

  const configured = isTwitchApiConfigured();
  const results = queries.length > 0 && configured ? await lookupTwitchUsers(queries, direction) : [];

  const knownIds = await getKnownViewerIds(
    results.filter((entry) => entry.userId).map((entry) => entry.userId as string),
  );

  const foundCount = results.filter((entry) => entry.found).length;
  const toIds = direction === "name-to-id";

  return (
    <>
      <PageHeader
        title="Name-/ID-Konverter"
        description="Twitch-Benutzernamen in User-IDs umwandeln – und umgekehrt."
      />

      {!configured && (
        <Alert variant="warning" title="Twitch-Zugangsdaten fehlen">
          Für die Abfrage werden <code className="font-mono text-xs">TWITCH_CLIENT_ID</code> und{" "}
          <code className="font-mono text-xs">TWITCH_CLIENT_SECRET</code> in der{" "}
          <code className="font-mono text-xs">.env</code> benötigt.
        </Alert>
      )}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Richtung wählen</CardTitle>
              <CardDescription>Was hast du – und was brauchst du?</CardDescription>
            </div>

            {/* Richtungswahl als Links: bleibt teilbar und funktioniert ohne JavaScript. */}
            <div className="flex items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-0.5">
              {DIRECTIONS.map((entry) => (
                <Link
                  key={entry.value}
                  href={`/tools/lookup?dir=${entry.value}`}
                  aria-current={entry.value === direction ? "true" : undefined}
                  className={cn(
                    "rounded-[5px] px-3 py-1.5 text-sm transition-colors",
                    entry.value === direction
                      ? "bg-[var(--color-accent)] font-medium text-[var(--color-foreground)]"
                      : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
                  )}
                >
                  {entry.label}
                </Link>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form action="/tools/lookup" method="get" className="space-y-3">
            <input type="hidden" name="dir" value={direction} />

            <div className="space-y-1.5">
              <label htmlFor="lookup-input" className="flex items-center gap-1.5 text-sm font-medium">
                {toIds ? <User className="size-3.5" /> : <Hash className="size-3.5" />}
                {config.inputLabel}
                <span className="font-normal text-[var(--color-muted-foreground)]">
                  — einer pro Zeile, max. {MAX_QUERIES}
                </span>
              </label>

              <Textarea
                id="lookup-input"
                name="q"
                defaultValue={raw}
                rows={4}
                placeholder={config.placeholder}
                className="font-mono text-sm"
                autoFocus
              />

              <p className="text-xs text-[var(--color-subtle)]">{config.hint}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!configured}>
                <Search />
                {toIds ? "IDs ermitteln" : "Namen ermitteln"}
              </Button>
              {raw && (
                <Button type="button" variant="ghost" asChild>
                  <Link href={`/tools/lookup?dir=${direction}`}>Zurücksetzen</Link>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ergebnis</CardTitle>
            <CardDescription>
              {foundCount} von {results.length} Einträgen gefunden.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-2">
            {results.map((entry) => {
              const isKnown = entry.userId ? knownIds.has(entry.userId) : false;
              const output = toIds ? entry.userId : entry.login;

              return (
                <div
                  key={entry.query}
                  className={cn(
                    "flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center",
                    entry.found
                      ? "border-[var(--color-border)] bg-[var(--color-surface)]"
                      : "border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_6%,transparent)]",
                  )}
                >
                  {/* Eingabe */}
                  <div className="min-w-0 sm:w-52">
                    <p className="text-xs text-[var(--color-subtle)]">{config.inputLabel}</p>
                    <p className="truncate font-mono text-sm">{entry.query}</p>
                  </div>

                  <ArrowRight className="hidden size-4 shrink-0 text-[var(--color-subtle)] sm:block" />

                  {/* Ergebnis */}
                  {entry.found ? (
                    <>
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <ViewerAvatar
                          name={entry.displayName ?? entry.login ?? entry.query}
                          imageUrl={entry.profileImageUrl}
                          size="md"
                        />

                        <div className="min-w-0">
                          <p className="text-xs text-[var(--color-subtle)]">{toIds ? "User-ID" : "Benutzername"}</p>
                          <p className="truncate font-mono text-sm font-medium">{output}</p>
                        </div>

                        <div className="hidden min-w-0 sm:block">
                          <p className="text-xs text-[var(--color-subtle)]">Anzeigename</p>
                          <p className="truncate text-sm">{entry.displayName}</p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {entry.broadcasterType && (
                          <Badge variant="primary">
                            {entry.broadcasterType === "partner"
                              ? "Partner"
                              : entry.broadcasterType === "affiliate"
                                ? "Affiliate"
                                : entry.broadcasterType}
                          </Badge>
                        )}

                        {entry.createdAt && (
                          <span className="hidden text-xs text-[var(--color-subtle)] lg:inline">
                            seit {formatDate(entry.createdAt)}
                          </span>
                        )}

                        {output && (
                          <CopyButton
                            value={output}
                            label={toIds ? "User-ID kopieren" : "Benutzername kopieren"}
                            iconOnly
                          />
                        )}
                        {entry.login && <TwitchProfileLink login={entry.login} />}

                        {isKnown && entry.userId ? (
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/viewers/${entry.userId}`}>
                              <ExternalLink />
                              Panel-Profil
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-[var(--color-subtle)]">Nicht in der Chatdatenbank</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1">
                      <Badge variant="destructive">Kein Twitch-Account gefunden</Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
