import type { Metadata } from "next";
import Link from "next/link";
import { Repeat2, StickyNote, UserPlus, Users } from "lucide-react";
import { ChartCard } from "@/components/chart-card";
import { ComposedChart } from "@/components/charts";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { RangeSelector } from "@/components/range-selector";
import { StatCard } from "@/components/stat-card";
import { TwitchProfileLink } from "@/components/twitch-profile-link";
import { ViewerAvatar } from "@/components/viewer-avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { listViewers } from "@/lib/queries/twitch";
import { countNotesForViewers } from "@/lib/queries/viewer-profile";
import {
  TREND_RANGES,
  getReturningViewers,
  getViewerTrend,
  normalizeTrendRange,
  rangeLabel,
} from "@/lib/queries/trends";
import { getCachedViewerAvatars } from "@/lib/twitch-api";
import { formatDateTime, formatNumber, formatRelative, parsePositiveInt, parseSearchParam, percentChange } from "@/lib/utils";

export const metadata: Metadata = { title: "Zuschauer" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const SORT_OPTIONS = [
  { value: "messages", label: "Meiste Nachrichten" },
  { value: "recent", label: "Zuletzt gesehen" },
  { value: "first", label: "Am längsten dabei" },
  { value: "name", label: "Name (A–Z)" },
] as const;

export default async function ViewersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.VIEWERS_VIEW);
  const params = await searchParams;

  const search = parseSearchParam(params.search);
  const sortParam = parseSearchParam(params.sort);
  const sort = (SORT_OPTIONS.find((entry) => entry.value === sortParam)?.value ?? "messages") as
    | "messages"
    | "recent"
    | "first"
    | "name";
  const page = parsePositiveInt(params.page, 1);
  const range = normalizeTrendRange(params.range);
  const label = rangeLabel(range);

  const [{ items, total }, trend, returning] = await Promise.all([
    listViewers({ search, sort, page, pageSize: PAGE_SIZE }),
    getViewerTrend(range),
    getReturningViewers(range),
  ]);

  const canViewNotes = hasPermission(session.user.permissions, PERMISSIONS.VIEWERS_NOTES_VIEW);
  const userIds = items.map((viewer) => viewer.userId);

  const [noteCounts, avatars] = await Promise.all([
    canViewNotes ? countNotesForViewers(userIds) : Promise.resolve(new Map<string, number>()),
    getCachedViewerAvatars(userIds),
  ]);

  // Ohne vollstaendige Vorperiode waere ein Prozentwert irrefuehrend –
  // er wuerde fehlende Aufzeichnung als Wachstum ausweisen.
  const growth = trend.comparable ? percentChange(trend.current, trend.previous) : null;

  // Filter im Zeitraum-Link erhalten, damit die Tabelle nicht zurückspringt.
  const filterParams = {
    search,
    sort: sort === "messages" ? undefined : sort,
  };

  return (
    <>
      <PageHeader title="Zuschauer" description="Alle im Chat erfassten Twitch-Nutzer und ihre Aktivität." />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <ChartCard
          title="Zuschauerentwicklung"
          description={`Bekannte Zuschauer insgesamt und Neuzugänge pro Tag · ${label}`}
          actions={
            <RangeSelector
              basePath="/viewers"
              params={filterParams}
              options={TREND_RANGES}
              current={range}
            />
          }
        >
          <ComposedChart
            data={trend.points}
            xKey="bucket"
            areaSeries={{ key: "total", label: "Zuschauer insgesamt", color: "chart-1", unit: "Gesamt" }}
            lineSeries={{ key: "value", label: "Neu an diesem Tag", color: "chart-2", unit: "Neu/Tag" }}
            height={300}
            xFormat="date"
            labelFormat="weekday-long"
            xLabel="Datum"
            emptyMessage="Keine Zuschauerdaten im gewählten Zeitraum."
          />
        </ChartCard>

        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <StatCard
            label={`Neue Zuschauer (${label})`}
            value={trend.current}
            hint={
              trend.comparable
                ? growth === null
                  ? "Zu wenig Vergleichsdaten für einen Trend"
                  : undefined
                : trend.earliestRecord
                  ? `Aufzeichnung erst seit ${formatDateTime(trend.earliestRecord)}`
                  : undefined
            }
            icon={UserPlus}
            accent="brand"
            size="large"
            trend={growth}
            trendLabel={`Vergleich mit den vorherigen ${label.toLowerCase()}`}
          />
          <StatCard
            label={`Wiederkehrende (${label})`}
            value={returning}
            hint="Bereits vorher bekannt, im Zeitraum aktiv"
            icon={Repeat2}
            accent="success"
            size="large"
          />
          <StatCard
            label="Zuschauer insgesamt"
            value={trend.total}
            icon={Users}
            size="large"
          />
        </div>
      </div>

      <FilterBar action="/viewers" hasActiveFilters={Boolean(search) || sort !== "messages"}>
        <FilterField label="Suche">
          <Input name="search" defaultValue={search ?? ""} placeholder="Name oder User-ID" />
        </FilterField>

        <FilterField label="Sortierung" className="w-full space-y-1.5 sm:w-52">
          <Select name="sort" defaultValue={sort}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterField>

        {/* Zeitraum beim Filtern beibehalten */}
        <input type="hidden" name="range" value={range} />
      </FilterBar>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zuschauer</TableHead>
                <TableHead>Twitch-User-ID</TableHead>
                <TableHead className="text-right">Nachrichten</TableHead>
                <TableHead>Erstmals gesehen</TableHead>
                <TableHead>Zuletzt gesehen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableEmpty colSpan={5}>Keine Zuschauer gefunden.</TableEmpty>
              ) : (
                items.map((viewer) => {
                  const notes = noteCounts.get(viewer.userId) ?? 0;
                  const avatar = avatars.get(viewer.userId);
                  const name = viewer.displayName ?? viewer.userName;

                  return (
                    <TableRow key={viewer.userId}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <ViewerAvatar name={name} imageUrl={avatar?.profileImageUrl} size="md" />

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Link href={`/viewers/${viewer.userId}`} className="truncate font-medium hover:underline">
                                {name}
                              </Link>
                              <TwitchProfileLink login={viewer.userName} size="sm" />
                              {notes > 0 && (
                                <Badge variant="info" title={`${notes} Notiz(en)`}>
                                  <StickyNote className="size-3" />
                                  {notes}
                                </Badge>
                              )}
                            </div>
                            {viewer.displayName && viewer.displayName !== viewer.userName && (
                              <span className="block truncate text-xs text-[var(--color-muted-foreground)]">
                                @{viewer.userName}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-meta-mono">
                        {viewer.userId}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(viewer.messageCount)}</TableCell>
                      <TableCell className="whitespace-nowrap text-meta">
                        {formatDateTime(viewer.firstSeenAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-meta">
                        {formatRelative(viewer.lastSeenAt)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <Pagination
            basePath="/viewers"
            params={{ ...filterParams, range }}
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            itemLabel="Zuschauern"
          />
        </CardContent>
      </Card>
    </>
  );
}
