import type { Metadata } from "next";
import Link from "next/link";
import { Percent, Smile, Users } from "lucide-react";
import { AreaChart } from "@/components/charts";
import { ChartCard } from "@/components/chart-card";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { RangeSelector } from "@/components/range-selector";
import { StatCard } from "@/components/stat-card";
import { PanelSurface } from "@/components/panel-surface";
import { SectionHeader } from "@/components/section-header";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { resolveChannelFilter } from "@/lib/channel-filter";
import { listChannelFilterOptions } from "@/lib/queries/channels";
import { countMessagesForScope, getEmoteStats, getEmoteTimeline } from "@/lib/queries/emotes";
import { TREND_PRESETS, rangeParams, rangeSentence, resolveRange } from "@/lib/range";
import { emoteImageUrl } from "@/lib/twitch-tags";
import { formatNumber, formatRelative, parseSearchParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Emotes" };
export const dynamic = "force-dynamic";

export default async function EmotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.MESSAGES_VIEW);
  const params = await searchParams;

  const channelParam = parseSearchParam(params.channel);
  const range = resolveRange(params, { presets: TREND_PRESETS, fallbackDays: 30 });

  // Die Optionen müssen vor der Datenabfrage stehen: sie lösen die Twitch-ID aus
  // dem Parameter zu den UUIDs auf, über die gefiltert wird.
  const channels = await listChannelFilterOptions("messages");
  const channelFilter = resolveChannelFilter(channels, channelParam);
  const channelUuids = channelFilter.uuids;

  const [stats, timeline, totalMessages] = await Promise.all([
    getEmoteStats({ channelUuids, range, limit: 60 }),
    getEmoteTimeline({ channelUuids }, range),
    countMessagesForScope({ channelUuids, range }),
  ]);

  const share = totalMessages > 0 ? Math.round((stats.scanned / totalMessages) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Emotes"
        description="Welche Emotes im Chat verwendet werden — ausgewertet aus den Twitch-Tags der Nachrichten."
        actions={
          <RangeSelector
            basePath="/emotes"
            params={{ channel: channelFilter.value }}
            presets={TREND_PRESETS}
            range={range}
          />
        }
      />

      <FilterBar action="/emotes" hasActiveFilters={Boolean(channelFilter.value)}>
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

        {Object.entries(rangeParams(range)).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
      </FilterBar>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Emote-Verwendungen"
          value={stats.totalUses}
          hint={`${formatNumber(stats.emotes.length)} verschiedene Emotes`}
          icon={Smile}
          accent="brand"
        />
        <StatCard
          label="Nachrichten mit Emotes"
          value={stats.scanned}
          hint={`${share} % aller Nachrichten im Zeitraum`}
          icon={Percent}
          accent="success"
        />
        <StatCard
          label="Nachrichten gesamt"
          value={totalMessages}
          hint="Im gewählten Zeitraum"
          icon={Users}
        />
      </div>

      {stats.truncated && (
        <Alert variant="info" title="Stichprobe">
          Es wurden die neuesten 20.000 Nachrichten mit Emotes ausgewertet. Für ältere Daten den Zeitraum
          eingrenzen oder einen einzelnen Channel wählen — der Emote-Tag lässt sich nicht indizieren, deshalb
          arbeitet diese Auswertung mit einer Obergrenze.
        </Alert>
      )}

      <ChartCard
        title="Emote-Nutzung im Verlauf"
        description={`Verwendungen pro ${range.hourly ? "Stunde" : "Tag"} · ${range.label}`}
      >
        <AreaChart
          data={timeline}
          xKey="bucket"
          series={[{ key: "uses", label: "Emote-Verwendungen", color: "chart-2" }]}
          height={200}
          xFormat={range.hourly ? "time" : "date"}
          labelFormat={range.hourly ? "datetime" : "weekday-long"}
          xLabel={range.hourly ? "Uhrzeit" : "Datum"}
          yLabel="Verwendungen"
          emptyMessage={`Keine Emote-Nutzung in ${rangeSentence(range)}.`}
        />
      </ChartCard>

      <section className="space-y-4">
        <SectionHeader
          title="Häufigste Emotes"
          description="Sortiert nach Gesamtverwendungen im gewählten Zeitraum."
        />
        <PanelSurface variant="flush">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Emote</TableHead>
                <TableHead className="text-right">Verwendungen</TableHead>
                <TableHead className="text-right">Nachrichten</TableHead>
                <TableHead className="text-right">Chatter</TableHead>
                <TableHead>Zuletzt</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {stats.emotes.length === 0 ? (
                <TableEmpty
                  colSpan={6}
                  title="Keine Emote-Daten gefunden"
                  description="Prüfe, ob der Bot das Feld emotes befüllt."
                />
              ) : (
                stats.emotes.map((emote, index) => (
                  <TableRow key={emote.id}>
                    <TableCell className="text-xs tabular-nums text-[var(--color-subtle)]">{index + 1}</TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        {/* Twitch-CDN, deshalb bewusst ein natives img */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={emoteImageUrl(emote.id, "1.0")}
                          alt=""
                          aria-hidden
                          width={28}
                          height={28}
                          loading="lazy"
                          className="size-7 shrink-0 object-contain"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{emote.name}</p>
                          <p className="truncate font-mono text-xs text-[var(--color-subtle)]">{emote.id}</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="text-right tabular-nums">{formatNumber(emote.uses)}</TableCell>
                    <TableCell className="text-right tabular-nums text-[var(--color-muted-foreground)]">
                      {formatNumber(emote.messages)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[var(--color-muted-foreground)]">
                      {formatNumber(emote.users)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                      {formatRelative(emote.lastUsedAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </PanelSurface>
      </section>

      <p className="text-xs text-[var(--color-subtle)]">
        Die Emote-Namen werden aus dem Nachrichtentext geschnitten — Twitch überträgt im Tag nur IDs und
        Positionen. Bilder kommen direkt vom Twitch-CDN.
      </p>
    </>
  );
}
