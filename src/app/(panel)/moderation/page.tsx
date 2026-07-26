import type { Metadata } from "next";
import Link from "next/link";
import { Download, Gavel, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { ListTrendHeader } from "@/components/list-trend-header";
import { ModerationBadge } from "@/components/twitch-badges";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { listChannelOptions } from "@/lib/queries/channels";
import { listModerationActionTypes, listModerationActions } from "@/lib/queries/twitch";
import { TREND_RANGES, getModerationTrend, normalizeTrendRange, rangeLabel } from "@/lib/queries/trends";
import { formatDuration, moderationActionLabel } from "@/lib/twitch";
import { buildQueryString, formatDateTime, parsePositiveInt, parseSearchParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Moderation" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.MODERATION_VIEW);
  const params = await searchParams;

  const channelUuid = parseSearchParam(params.channel);
  const action = parseSearchParam(params.action);
  const target = parseSearchParam(params.target);
  const from = parseSearchParam(params.from);
  const to = parseSearchParam(params.to);
  const page = parsePositiveInt(params.page, 1);
  const range = normalizeTrendRange(params.range);
  const label = rangeLabel(range);

  const [channels, actionTypes, { items, total }, trend] = await Promise.all([
    listChannelOptions(),
    listModerationActionTypes(),
    listModerationActions({ channelUuid, action, target, from, to, page, pageSize: PAGE_SIZE }),
    getModerationTrend(range),
  ]);

  const activeFilters = { channel: channelUuid, action, target, from, to };
  const hasActiveFilters = Object.values(activeFilters).some(Boolean);
  const canExport = hasPermission(session.user.permissions, PERMISSIONS.MODERATION_EXPORT);

  return (
    <>
      <PageHeader
        title="Moderation"
        description="Banns, Timeouts, gelöschte Nachrichten und weitere Moderationsaktionen."
        actions={
          canExport ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/moderation/export${buildQueryString(activeFilters)}`} prefetch={false}>
                <Download />
                CSV-Export
              </Link>
            </Button>
          ) : undefined
        }
      />

      <ListTrendHeader
        basePath="/moderation"
        params={activeFilters}
        rangeOptions={TREND_RANGES}
        range={range}
        rangeLabel={label}
        title="Moderationsaufkommen"
        description="Durchgeführte Maßnahmen pro Tag"
        points={trend.points}
        seriesLabel="Aktionen"
        seriesColor="chart-4"
        currentValue={trend.current}
        previousValue={trend.previous}
        totalValue={trend.total}
        comparable={trend.comparable}
        currentLabel={`Aktionen (${label})`}
        totalLabel="Aktionen insgesamt"
        icon={ShieldAlert}
        totalIcon={Gavel}
        accent="destructive"
      />

      <FilterBar action="/moderation" hasActiveFilters={hasActiveFilters}>
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

        <FilterField label="Aktion">
          <Select name="action" defaultValue={action ?? ""}>
            <option value="">Alle Aktionen</option>
            {actionTypes.map((type) => (
              <option key={type} value={type}>
                {moderationActionLabel(type)}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="Betroffener Nutzer">
          <Input name="target" defaultValue={target ?? ""} placeholder="Benutzername" />
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
                <TableHead className="w-36">Aktion</TableHead>
                <TableHead className="w-32">Channel</TableHead>
                <TableHead className="w-40">Betroffen</TableHead>
                <TableHead className="w-24">Dauer</TableHead>
                <TableHead>Grund</TableHead>
                <TableHead>Gelöschte Nachricht</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableEmpty colSpan={7}>Keine Moderationsaktionen gefunden.</TableEmpty>
              ) : (
                items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-meta">
                      {formatDateTime(entry.occurredAt)}
                    </TableCell>
                    <TableCell>
                      <ModerationBadge action={entry.action} />
                    </TableCell>
                    <TableCell className="text-meta">{entry.channelName}</TableCell>
                    <TableCell className="max-w-40 truncate font-medium">
                      {entry.targetUserId ? (
                        <Link href={`/viewers/${entry.targetUserId}`} className="hover:underline">
                          {entry.targetUserName ?? entry.targetUserId}
                        </Link>
                      ) : (
                        (entry.targetUserName ?? "—")
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{formatDuration(entry.durationSeconds)}</TableCell>
                    <TableCell className="max-w-64 truncate text-sm">{entry.reason ?? "—"}</TableCell>
                    <TableCell className="max-w-md truncate text-sm text-[var(--color-muted-foreground)]">
                      {entry.deletedMessageContent ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <Pagination
            basePath="/moderation"
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
