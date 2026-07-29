import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { RangeSelector } from "@/components/range-selector";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { ChatName } from "@/components/chat-name";
import { ClampedContent } from "@/components/clamped-content";
import { HighlightedMessage } from "@/components/highlighted-message";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PanelSurface } from "@/components/panel-surface";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { resolveChannelFilter } from "@/lib/channel-filter";
import { listChannelFilterOptions } from "@/lib/queries/channels";
import { findWatchHits, listWatchTerms } from "@/lib/queries/watchlist";
import { HITS_PRESETS, rangeParams, resolveRange } from "@/lib/range";
import { TERM_SEVERITIES, severityStyle } from "@/lib/watchlist";
import { formatDateTime, parsePositiveInt, parseSearchParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Wortfilter-Treffer" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function WatchHitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.WATCHLIST_VIEW);
  const params = await searchParams;

  const termParam = parseSearchParam(params.term);
  const termId = termParam ? Number(termParam) : undefined;
  const channelParam = parseSearchParam(params.channel);
  const severity = parseSearchParam(params.severity);
  const range = resolveRange(params, { presets: HITS_PRESETS, fallbackDays: 30 });
  const page = parsePositiveInt(params.page, 1);

  // Die Optionen müssen vor der Datenabfrage stehen: sie lösen die Twitch-ID aus
  // dem Parameter zu den UUIDs auf, über die gefiltert wird.
  const [allTerms, channels] = await Promise.all([listWatchTerms(), listChannelFilterOptions("messages")]);
  const channelFilter = resolveChannelFilter(channels, channelParam);

  // Nur aktive Begriffe werden ausgewertet – pausierte sollen keine Treffer erzeugen.
  const activeTerms = allTerms.filter((term) => term.active);

  const { hits, truncated } = await findWatchHits(activeTerms, {
    termId: Number.isFinite(termId) ? termId : undefined,
    channelUuids: channelFilter.uuids,
    severity,
    // days = 0 heisst "gesamter Zeitraum" – dann ohne Zeitfilter suchen.
    range: range.days === 0 ? undefined : range,
    page,
    pageSize: PAGE_SIZE,
  });

  const activeFilters = {
    term: termParam,
    channel: channelFilter.value,
    severity,
  };

  const hasActiveFilters = Object.values(activeFilters).some(Boolean);

  return (
    <>
      <PageHeader
        title="Wortfilter-Treffer"
        description="Nachrichten, die auf einen beobachteten Begriff passen."
        backHref="/watchlist"
        actions={
          <RangeSelector
            basePath="/watchlist/hits"
            params={activeFilters}
            presets={HITS_PRESETS}
            range={range}
          />
        }
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
              <Select name="channel" defaultValue={channelFilter.value ?? ""}>
                <option value="">Alle Channels</option>
                {channels.map((channel) => (
                  <option key={channel.twitchId} value={channel.twitchId}>
                    {channel.label}
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

            {/* Zeitraum liegt in der Kopfzeile – hier nur weitertragen. */}
            {Object.entries(rangeParams(range)).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
          </FilterBar>

          {truncated && (
            <Alert variant="info">
              Es wurden sehr viele passende Nachrichten gefunden. Angezeigt werden die neuesten — grenze den Zeitraum
              oder den Begriff ein, um ältere Treffer zu sehen.
            </Alert>
          )}

          <PanelSurface variant="flush">
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
                    <TableEmpty colSpan={5} title="Keine Treffer im gewählten Zeitraum" />
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
                            <ClampedContent lines={2}>
                              <HighlightedMessage content={hit.content} matches={hit.matches} />
                            </ClampedContent>
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
                params={{ ...activeFilters, ...rangeParams(range) }}
                page={page}
                pageSize={PAGE_SIZE}
                total={hits.length < PAGE_SIZE && page === 1 ? hits.length : page * PAGE_SIZE + 1}
                itemLabel="Treffern"
              />
          </PanelSurface>
        </>
      )}
    </>
  );
}
