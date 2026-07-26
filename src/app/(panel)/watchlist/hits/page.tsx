import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { ChatName } from "@/components/chat-name";
import { HighlightedMessage } from "@/components/highlighted-message";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listChannelOptions } from "@/lib/queries/channels";
import { findWatchHits, listWatchTerms } from "@/lib/queries/watchlist";
import { TERM_SEVERITIES, severityStyle } from "@/lib/watchlist";
import { formatDateTime, parsePositiveInt, parseSearchParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Wortfilter-Treffer" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const RANGE_OPTIONS = [
  { value: "7", label: "7 Tage" },
  { value: "30", label: "30 Tage" },
  { value: "90", label: "90 Tage" },
  { value: "", label: "Gesamter Zeitraum" },
];

export default async function WatchHitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.WATCHLIST_VIEW);
  const params = await searchParams;

  const termParam = parseSearchParam(params.term);
  const termId = termParam ? Number(termParam) : undefined;
  const channelUuid = parseSearchParam(params.channel);
  const severity = parseSearchParam(params.severity);
  const daysParam = parseSearchParam(params.days);
  const days = daysParam ? Number(daysParam) : 30;
  const page = parsePositiveInt(params.page, 1);

  const [allTerms, channels] = await Promise.all([listWatchTerms(), listChannelOptions()]);

  // Nur aktive Begriffe werden ausgewertet – pausierte sollen keine Treffer erzeugen.
  const activeTerms = allTerms.filter((term) => term.active);

  const { hits, truncated } = await findWatchHits(activeTerms, {
    termId: Number.isFinite(termId) ? termId : undefined,
    channelUuid,
    severity,
    days: Number.isFinite(days) && days > 0 ? days : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const activeFilters = {
    term: termParam,
    channel: channelUuid,
    severity,
    days: daysParam,
  };

  const hasActiveFilters = Object.values(activeFilters).some(Boolean);

  return (
    <>
      <PageHeader
        title="Wortfilter-Treffer"
        description="Nachrichten, die auf einen beobachteten Begriff passen."
        backHref="/watchlist"
      />

      {activeTerms.length === 0 ? (
        <Alert variant="warning" title="Keine aktiven Begriffe">
          Lege zuerst einen Begriff an oder aktiviere einen pausierten.{" "}
          <Link href="/watchlist" className="underline">
            Zur Verwaltung
          </Link>
        </Alert>
      ) : (
        <>
          <FilterBar action="/watchlist/hits" hasActiveFilters={hasActiveFilters}>
            <FilterField label="Begriff">
              <Select name="term" defaultValue={termParam ?? ""}>
                <option value="">Alle Begriffe</option>
                {activeTerms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.term}
                  </option>
                ))}
              </Select>
            </FilterField>

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

            <FilterField label="Stufe" className="w-full space-y-1.5 sm:w-40">
              <Select name="severity" defaultValue={severity ?? ""}>
                <option value="">Alle Stufen</option>
                {TERM_SEVERITIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </FilterField>

            <FilterField label="Zeitraum" className="w-full space-y-1.5 sm:w-44">
              <Select name="days" defaultValue={daysParam ?? "30"}>
                {RANGE_OPTIONS.map((entry) => (
                  <option key={entry.label} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </FilterField>
          </FilterBar>

          {truncated && (
            <Alert variant="info">
              Es wurden sehr viele passende Nachrichten gefunden. Angezeigt werden die neuesten — grenze den Zeitraum
              oder den Begriff ein, um ältere Treffer zu sehen.
            </Alert>
          )}

          <Card>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Zeit</TableHead>
                    <TableHead className="w-28">Channel</TableHead>
                    <TableHead className="w-40">Nutzer</TableHead>
                    <TableHead>Nachricht</TableHead>
                    <TableHead className="w-32">Begriffe</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {hits.length === 0 ? (
                    <TableEmpty colSpan={5}>Keine Treffer im gewählten Zeitraum.</TableEmpty>
                  ) : (
                    hits.map((hit) => {
                      // Mehrfache Treffer desselben Begriffs nur einmal auflisten.
                      const uniqueTerms = [...new Map(hit.matches.map((m) => [m.termId, m])).values()];

                      return (
                        <TableRow key={hit.id}>
                          <TableCell className="whitespace-nowrap text-meta">
                            {formatDateTime(hit.receivedAt)}
                          </TableCell>

                          <TableCell className="text-meta">
                            {hit.channelName}
                          </TableCell>

                          <TableCell>
                            <Link href={`/viewers/${hit.userId}`} className="truncate hover:underline">
                              <ChatName color={hit.color} className="font-medium">
                                {hit.displayName ?? hit.userName}
                              </ChatName>
                            </Link>
                          </TableCell>

                          <TableCell className="max-w-xl">
                            <HighlightedMessage content={hit.content} matches={hit.matches} />
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {uniqueTerms.map((match) => (
                                <Badge key={match.termId} variant={severityStyle(match.severity).badge}>
                                  {match.term}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              <Pagination
                basePath="/watchlist/hits"
                params={activeFilters}
                page={page}
                pageSize={PAGE_SIZE}
                total={hits.length < PAGE_SIZE && page === 1 ? hits.length : page * PAGE_SIZE + 1}
                itemLabel="Treffern"
              />
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
