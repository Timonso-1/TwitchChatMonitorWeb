import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Eye, ShieldAlert, StickyNote } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RangeSelector } from "@/components/range-selector";
import { StatCard } from "@/components/stat-card";
import { TwitchProfileLink } from "@/components/twitch-profile-link";
import { ViewerAvatar } from "@/components/viewer-avatar";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getWatchboard } from "@/lib/queries/watchboard";
import { getCachedViewerAvatars } from "@/lib/twitch-api";
import { cn, formatNumber, formatRelative, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "Beobachtungsliste" };
export const dynamic = "force-dynamic";

const RANGE_OPTIONS = [
  { value: 7, label: "7 Tage" },
  { value: 30, label: "30 Tage" },
  { value: 90, label: "90 Tage" },
  { value: 365, label: "12 Monate" },
];

export default async function WatchboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.VIEWERS_NOTES_VIEW);
  const params = await searchParams;

  const rangeParam = Number(Array.isArray(params.range) ? params.range[0] : params.range);
  const range = RANGE_OPTIONS.find((option) => option.value === rangeParam)?.value ?? 30;
  const onlyCritical = (Array.isArray(params.critical) ? params.critical[0] : params.critical) === "1";

  const entries = await getWatchboard({ days: range, onlyCritical, limit: 50 });
  const avatars = await getCachedViewerAvatars(entries.map((entry) => entry.userId));

  const criticalCount = entries.filter((entry) => entry.criticalNotes > 0).length;
  const bannedCount = entries.filter((entry) => entry.banCount > 0).length;

  return (
    <>
      <PageHeader
        title="Beobachtungsliste"
        description="Chatter, zu denen Notizen vorliegen oder gegen die moderiert wurde."
        actions={
          <RangeSelector
            basePath="/watchboard"
            params={{ critical: onlyCritical ? "1" : undefined }}
            options={RANGE_OPTIONS}
            current={range}
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Auf der Liste" value={entries.length} icon={Eye} accent="brand" />
        <StatCard label="Mit kritischer Notiz" value={criticalCount} icon={AlertTriangle} accent="destructive" />
        <StatCard label="Gebannt im Zeitraum" value={bannedCount} icon={ShieldAlert} accent="warning" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={onlyCritical ? "default" : "outline"} size="sm" asChild>
          <Link href={`/watchboard?range=${range}${onlyCritical ? "" : "&critical=1"}`}>
            <AlertTriangle />
            {onlyCritical ? "Alle anzeigen" : "Nur kritische Notizen"}
          </Link>
        </Button>
      </div>

      {entries.length === 0 ? (
        <Alert variant="success" title="Nichts zu tun">
          Im gewählten Zeitraum gibt es keine auffälligen Chatter — weder Notizen noch Moderationsaktionen.
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Auffällige Chatter</CardTitle>
            <CardDescription>
              Sortiert nach Gewicht: kritische Notizen und Banns zählen am stärksten, Timeouts und Hinweise weniger.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-2">
            {entries.map((entry, index) => {
              const name = entry.displayName ?? entry.userName;
              const isSevere = entry.criticalNotes > 0 || entry.banCount > 0;

              return (
                <div
                  key={entry.userId}
                  className={cn(
                    "flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center",
                    isSevere
                      ? "border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_6%,transparent)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)]",
                  )}
                >
                  <span className="w-5 shrink-0 text-xs tabular-nums text-[var(--color-subtle)]">{index + 1}</span>

                  <ViewerAvatar name={name} imageUrl={avatars.get(entry.userId)?.profileImageUrl} size="md" />

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/viewers/${entry.userId}`} className="truncate font-medium hover:underline">
                        {name}
                      </Link>
                      <TwitchProfileLink login={entry.userName} size="sm" />

                      {entry.reasons.map((reason) => (
                        <Badge
                          key={reason}
                          variant={
                            reason.includes("kritisch") || reason.includes("gebannt") ? "destructive" : "warning"
                          }
                        >
                          {reason}
                        </Badge>
                      ))}
                    </div>

                    {entry.latestNote && (
                      <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                        <StickyNote className="mr-1 inline size-3" />„{truncate(entry.latestNote, 120)}“
                      </p>
                    )}

                    <p className="text-xs text-[var(--color-subtle)]">
                      {formatNumber(entry.messageCount)} Nachrichten · zuletzt gesehen{" "}
                      {formatRelative(entry.lastSeenAt)}
                      {entry.lastModerationAt && ` · letzte Maßnahme ${formatRelative(entry.lastModerationAt)}`}
                    </p>
                  </div>

                  <Button variant="outline" size="sm" asChild className="shrink-0">
                    <Link href={`/viewers/${entry.userId}?tab=notes`}>Notizen</Link>
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
