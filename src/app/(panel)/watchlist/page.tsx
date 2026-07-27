import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Filter, ListFilter, Radar } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RangeSelector } from "@/components/range-selector";
import { StatCard } from "@/components/stat-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PanelSurface } from "@/components/panel-surface";
import { SectionHeader } from "@/components/section-header";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WatchTermDialog } from "./watch-term-dialog";
import { WatchTermActions } from "./watch-term-actions";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { listChannelOptions } from "@/lib/queries/channels";
import { getActiveWatchTerms, getTermStats, listWatchTerms } from "@/lib/queries/watchlist";
import { HITS_PRESETS, resolveRange } from "@/lib/range";
import { MATCH_TYPES, severityStyle } from "@/lib/watchlist";
import { formatNumber, formatRelative } from "@/lib/utils";

export const metadata: Metadata = { title: "Wortfilter" };
export const dynamic = "force-dynamic";

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.WATCHLIST_VIEW);
  const canManage = hasPermission(session.user.permissions, PERMISSIONS.WATCHLIST_MANAGE);
  const params = await searchParams;
  const range = resolveRange(params, { presets: HITS_PRESETS, fallbackDays: 30 });

  const [terms, channels, activeTerms] = await Promise.all([
    listWatchTerms(),
    listChannelOptions(),
    getActiveWatchTerms(),
  ]);

  const stats = await getTermStats(activeTerms, range);
  const statsById = new Map(stats.map((entry) => [entry.termId, entry]));

  const activeCount = terms.filter((term) => term.active).length;
  const criticalCount = terms.filter((term) => term.severity === "critical" && term.active).length;
  const hitsTotal = stats.reduce((sum, entry) => sum + entry.hits, 0);

  const channelNames = new Map(channels.map((channel) => [channel.uuid, channel.name]));

  return (
    <>
      <PageHeader
        title="Wortfilter"
        description="Begriffe, die im Chat beobachtet werden. Treffer werden überall im Panel hervorgehoben."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RangeSelector basePath="/watchlist" presets={HITS_PRESETS} range={range} />
            {canManage && <WatchTermDialog mode="create" channels={channels} />}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Aktive Begriffe" value={activeCount} hint={`${terms.length} insgesamt`} icon={Radar} accent="brand" />
        <StatCard label="Davon kritisch" value={criticalCount} icon={AlertTriangle} accent="destructive" />
        <StatCard
          label={`Treffer (${range.label})`}
          value={hitsTotal}
          hint="Grobe Vorauswahl, ohne Wortgrenzen"
          icon={Filter}
          accent="warning"
        />
      </div>

      {terms.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/watchlist/hits">
              <ListFilter />
              Alle Treffer ansehen
            </Link>
          </Button>
        </div>
      )}

      <section className="space-y-4">
        <SectionHeader
          title="Beobachtete Begriffe"
          description="Trefferzahlen beziehen sich auf die letzten 30 Tage und sind eine Obergrenze — die genaue Prüfung mit Wortgrenzen findet erst in der Trefferliste statt."
        />
        <PanelSurface variant="flush">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Begriff</TableHead>
                <TableHead>Trefferart</TableHead>
                <TableHead>Stufe</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Treffer (30 T.)</TableHead>
                <TableHead>Zuletzt</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {terms.length === 0 ? (
                <TableEmpty
                  colSpan={7}
                  title="Noch keine Begriffe hinterlegt"
                  description="Lege einen an, um auffällige Nachrichten automatisch hervorzuheben."
                />
              ) : (
                terms.map((term) => {
                  const stat = statsById.get(term.id);
                  const style = severityStyle(term.severity);
                  const matchLabel = MATCH_TYPES.find((entry) => entry.value === term.matchType)?.label ?? term.matchType;

                  return (
                    <TableRow key={term.id} className={!term.active ? "opacity-55" : undefined}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 font-mono text-xs">
                            {term.term}
                          </code>
                          {!term.active && <Badge variant="muted">Pausiert</Badge>}
                          {term.caseSensitive && <Badge variant="outline">Groß-/Kleinschreibung</Badge>}
                        </div>
                        {term.note && (
                          <p className="pt-0.5 text-xs text-[var(--color-muted-foreground)]">{term.note}</p>
                        )}
                      </TableCell>

                      <TableCell className="text-xs text-[var(--color-muted-foreground)]">{matchLabel}</TableCell>

                      <TableCell>
                        <Badge variant={style.badge}>{style.label}</Badge>
                      </TableCell>

                      <TableCell className="text-xs text-[var(--color-muted-foreground)]">
                        {term.channelUuid ? (channelNames.get(term.channelUuid) ?? "Unbekannt") : "Alle"}
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        {stat ? (
                          stat.hits > 0 ? (
                            <Link href={`/watchlist/hits?term=${term.id}`} className="hover:underline">
                              {formatNumber(stat.hits)}
                            </Link>
                          ) : (
                            <span className="text-[var(--color-subtle)]">0</span>
                          )
                        ) : (
                          <span className="text-[var(--color-subtle)]">—</span>
                        )}
                      </TableCell>

                      <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                        {stat?.lastHitAt ? formatRelative(stat.lastHitAt) : "—"}
                      </TableCell>

                      <TableCell>
                        {canManage && <WatchTermActions term={term} channels={channels} />}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </PanelSurface>
      </section>

      <Alert variant="info" title="Hinweis zur Genauigkeit">
        Die Vorauswahl in der Datenbank arbeitet mit einfacher Textsuche. Ob ein Treffer wirklich zählt — etwa bei
        „ganzes Wort“ oder einem regulären Ausdruck — entscheidet das Panel erst danach. Deshalb können die Zahlen
        hier höher liegen als die tatsächliche Trefferzahl.
      </Alert>
    </>
  );
}
