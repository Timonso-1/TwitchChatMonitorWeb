import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare, MessagesSquare } from "lucide-react";
import { ExportButton } from "@/components/export-button";
import { PageHeader } from "@/components/page-header";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { ChatName } from "@/components/chat-name";
import { ListTrendHeader } from "@/components/list-trend-header";
import { MessageCell } from "@/components/message-cell";
import { ChatBadges } from "@/components/chat-badges";
import { ViewerAvatar } from "@/components/viewer-avatar";
import { PanelSurface } from "@/components/panel-surface";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { resolveChannelFilter } from "@/lib/channel-filter";
import { listChannelFilterOptions } from "@/lib/queries/channels";
import { getMessageContext, listMessages } from "@/lib/queries/twitch";
import { getMessageTrend } from "@/lib/queries/trends";
import { TREND_PRESETS, rangeParams, resolveRange } from "@/lib/range";
import { MESSAGE_ROLE_GROUPS, normalizeRoleFilter } from "@/lib/twitch-tags";
import { getCachedBadgeSets, getCachedViewerAvatars } from "@/lib/twitch-api";
import { buildQueryString, formatDateTime, parsePositiveInt, parseSearchParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Nachrichten" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.MESSAGES_VIEW);
  const params = await searchParams;

  const channelParam = parseSearchParam(params.channel);
  const user = parseSearchParam(params.user);
  const content = parseSearchParam(params.content);
  const role = normalizeRoleFilter(params.role);
  const page = parsePositiveInt(params.page, 1);
  const range = resolveRange(params, { presets: TREND_PRESETS, fallbackDays: 30 });

  // Die Optionen müssen vor der Datenabfrage stehen: sie lösen die Twitch-ID aus
  // dem Parameter zu den UUIDs auf, über die gefiltert wird.
  const channels = await listChannelFilterOptions("messages");
  const channelFilter = resolveChannelFilter(channels, channelParam);

  const [{ items, total }, trend] = await Promise.all([
    listMessages({
      channelUuids: channelFilter.uuids,
      user,
      content,
      role,
      from: range.fromDate,
      to: range.toDate,
      page,
      pageSize: PAGE_SIZE,
    }),
    getMessageTrend(range),
  ]);

  const [avatars, context, badgeSets] = await Promise.all([
    getCachedViewerAvatars(items.map((message) => message.userId)),
    getMessageContext(items),
    getCachedBadgeSets(items.map((message) => message.channelId)),
  ]);

  const label = range.label;
  const activeFilters = { channel: channelFilter.value, user, content, role: role === "all" ? undefined : role };
  const hasActiveFilters = Object.values(activeFilters).some(Boolean);
  const canExport = hasPermission(session.user.permissions, PERMISSIONS.MESSAGES_EXPORT);

  /** Zeitraum + Filter, wie sie Links und Formulare weitertragen müssen. */
  const linkParams = { ...activeFilters, ...rangeParams(range) };

  return (
    <>
      <PageHeader
        title="Nachrichten"
        description="Durchsuche den aufgezeichneten Chatverlauf aller Channels."
        actions={
          canExport ? (
            <ExportButton
              href={`/messages/export${buildQueryString({ ...activeFilters, from: range.fromDate, to: range.toDate })}`}
              total={total}
            />
          ) : undefined
        }
      />

      <ListTrendHeader
        basePath="/messages"
        params={activeFilters}
        presets={TREND_PRESETS}
        range={range}
        title="Nachrichtenaufkommen"
        description="Aufgezeichnete Chatnachrichten pro Tag"
        points={trend.points}
        seriesLabel="Nachrichten"
        seriesColor="chart-2"
        currentValue={trend.current}
        previousValue={trend.previous}
        totalValue={trend.total}
        comparable={trend.comparable}
        currentLabel={`Nachrichten (${label})`}
        totalLabel="Nachrichten insgesamt"
        icon={MessageSquare}
        totalIcon={MessagesSquare}
      />

      <FilterBar action="/messages" hasActiveFilters={hasActiveFilters}>
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

        <FilterField label="Nutzer">
          <Input name="user" defaultValue={user ?? ""} placeholder="Benutzername" />
        </FilterField>

        <FilterField label="Inhalt">
          <Input name="content" defaultValue={content ?? ""} placeholder="Textsuche" />
        </FilterField>

        <FilterField label="Rolle / Abzeichen" className="w-full space-y-1.5 sm:w-48">
          <Select name="role" defaultValue={role}>
            <option value="all">Alle</option>
            {MESSAGE_ROLE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </FilterField>

        {/* Der Zeitraum steuert Diagramm und Tabelle – er muss das Filtern überleben. */}
        {Object.entries(rangeParams(range)).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
      </FilterBar>

      <PanelSurface variant="flush">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Zeit</TableHead>
                <TableHead className="w-32">Channel</TableHead>
                <TableHead className="w-48">Nutzer</TableHead>
                <TableHead>Nachricht</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableEmpty colSpan={4} title="Keine Nachrichten gefunden" />
              ) : (
                items.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell className="whitespace-nowrap text-meta">
                      {formatDateTime(message.receivedAt)}
                    </TableCell>
                    <TableCell className="text-meta">
                      {message.channelName}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ViewerAvatar
                          name={message.displayName ?? message.userName}
                          imageUrl={avatars.get(message.userId)?.profileImageUrl}
                          color={message.color}
                          size="sm"
                        />

                        <div className="flex min-w-0 flex-wrap items-center gap-1">
                          <ChatBadges
                            badges={message.badges}
                            badgeInfo={message.badgeInfo}
                            set={badgeSets.get(message.channelId)}
                            isBroadcaster={message.isBroadcaster}
                            isMod={message.isMod}
                            isVip={message.isVip}
                            isSubscriber={message.isSubscriber}
                          />
                          <Link href={`/viewers/${message.userId}`} className="max-w-28 truncate hover:underline">
                            <ChatName color={message.color} className="font-medium">
                              {message.displayName ?? message.userName}
                            </ChatName>
                          </Link>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xl">
                      <MessageCell
                        messageId={message.messageId}
                        content={message.content}
                        emotes={message.emotes}
                        badgeInfo={message.badgeInfo}
                        isAction={message.isAction}
                        bits={message.bits}
                        isFirstMessage={message.isFirstMessage}
                        isDeleted={context.deletedIds.has(message.messageId)}
                        replyTo={
                          message.replyToMessageId
                            ? (context.replyTargets.get(message.replyToMessageId) ?? null)
                            : null
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <Pagination
            basePath="/messages"
            params={linkParams}
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
          />
      </PanelSurface>
    </>
  );
}
