import type { Metadata } from "next";
import Link from "next/link";
import { Download, Sparkles, Zap } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { ListTrendHeader } from "@/components/list-trend-header";
import { EventBadge, SubTierBadge } from "@/components/twitch-badges";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { listChannelOptions } from "@/lib/queries/channels";
import { listEventTypes, listEvents } from "@/lib/queries/twitch";
import { TREND_RANGES, getEventTrend, normalizeTrendRange, rangeLabel } from "@/lib/queries/trends";
import { eventDetailText, eventTypeLabel } from "@/lib/twitch";
import { buildQueryString, formatDateTime, parsePositiveInt, parseSearchParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Events" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.EVENTS_VIEW);
  const params = await searchParams;

  const channelUuid = parseSearchParam(params.channel);
  const eventType = parseSearchParam(params.type);
  const user = parseSearchParam(params.user);
  const from = parseSearchParam(params.from);
  const to = parseSearchParam(params.to);
  const page = parsePositiveInt(params.page, 1);
  const range = normalizeTrendRange(params.range);
  const label = rangeLabel(range);

  const [channels, eventTypes, { items, total }, trend] = await Promise.all([
    listChannelOptions(),
    listEventTypes(),
    listEvents({ channelUuid, eventType, user, from, to, page, pageSize: PAGE_SIZE }),
    getEventTrend(range),
  ]);

  const activeFilters = { channel: channelUuid, type: eventType, user, from, to };
  const hasActiveFilters = Object.values(activeFilters).some(Boolean);
  const canExport = hasPermission(session.user.permissions, PERMISSIONS.EVENTS_EXPORT);

  return (
    <>
      <PageHeader
        title="Events"
        description="Subs, Gifts, Raids, Cheers und weitere Channel-Ereignisse."
        actions={
          canExport ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/events/export${buildQueryString(activeFilters)}`} prefetch={false}>
                <Download />
                CSV-Export
              </Link>
            </Button>
          ) : undefined
        }
      />

      <ListTrendHeader
        basePath="/events"
        params={activeFilters}
        rangeOptions={TREND_RANGES}
        range={range}
        rangeLabel={label}
        title="Event-Aufkommen"
        description="Aufgezeichnete Channel-Ereignisse pro Tag"
        points={trend.points}
        seriesLabel="Events"
        seriesColor="chart-4"
        currentValue={trend.current}
        previousValue={trend.previous}
        totalValue={trend.total}
        comparable={trend.comparable}
        currentLabel={`Events (${label})`}
        totalLabel="Events insgesamt"
        icon={Zap}
        totalIcon={Sparkles}
        accent="warning"
      />

      <FilterBar action="/events" hasActiveFilters={hasActiveFilters}>
        <FilterField label="Channel">
          <Select name="channel" defaultValue={channelUuid ?? ""}>
            <option value="">Alle Channels</option>
            {channels.map((channel) => (
              <option key={channel.uuid} value={channel.uuid}>
                {channel.name}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="Event-Typ">
          <Select name="type" defaultValue={eventType ?? ""}>
            <option value="">Alle Typen</option>
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {eventTypeLabel(type)}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="Nutzer">
          <Input name="user" defaultValue={user ?? ""} placeholder="Benutzername" />
        </FilterField>

        <FilterField label="Von" className="w-full space-y-1.5 sm:w-40">
          <Input type="date" name="from" defaultValue={from ?? ""} />
        </FilterField>

        <FilterField label="Bis" className="w-full space-y-1.5 sm:w-40">
          <Input type="date" name="to" defaultValue={to ?? ""} />
        </FilterField>

        <input type="hidden" name="range" value={range} />
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Zeit</TableHead>
                <TableHead className="w-32">Typ</TableHead>
                <TableHead className="w-32">Channel</TableHead>
                <TableHead className="w-40">Nutzer</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Nachricht</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableEmpty colSpan={6}>Keine Events gefunden.</TableEmpty>
              ) : (
                items.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-meta">
                      {formatDateTime(event.occurredAt)}
                    </TableCell>
                    <TableCell>
                      <EventBadge type={event.eventType} />
                    </TableCell>
                    <TableCell className="text-meta">{event.channelName}</TableCell>
                    <TableCell className="max-w-40 truncate font-medium">
                      {event.userId ? (
                        <Link href={`/viewers/${event.userId}`} className="hover:underline">
                          {event.userName ?? event.userId}
                        </Link>
                      ) : (
                        (event.userName ?? "—")
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SubTierBadge tier={event.subTier} />
                        <span className="text-[var(--color-muted-foreground)]">
                          {eventDetailText({
                            months: event.months,
                            giftCount: event.giftCount,
                            viewerCount: event.viewerCount,
                            giftedByName: event.giftedByName,
                          })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm">{event.message ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <Pagination
            basePath="/events"
            params={{ ...activeFilters, range }}
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
          />
        </CardContent>
      </Card>
    </>
  );
}
