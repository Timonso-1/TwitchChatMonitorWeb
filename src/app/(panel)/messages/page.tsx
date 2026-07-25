import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { ChatRoleBadges } from "@/components/twitch-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { listChannelOptions } from "@/lib/queries/channels";
import { listMessages } from "@/lib/queries/twitch";
import { buildQueryString, formatDateTime, formatNumber, parsePositiveInt, parseSearchParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Nachrichten" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const ROLES = [
  { value: "all", label: "Alle" },
  { value: "mod", label: "Moderatoren" },
  { value: "subscriber", label: "Subscriber" },
  { value: "vip", label: "VIPs" },
  { value: "broadcaster", label: "Broadcaster" },
  { value: "first", label: "Erste Nachricht" },
] as const;

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.MESSAGES_VIEW);
  const params = await searchParams;

  const channelUuid = parseSearchParam(params.channel);
  const user = parseSearchParam(params.user);
  const content = parseSearchParam(params.content);
  const from = parseSearchParam(params.from);
  const to = parseSearchParam(params.to);
  const roleParam = parseSearchParam(params.role);
  const role = (ROLES.find((entry) => entry.value === roleParam)?.value ?? "all") as
    | "all"
    | "mod"
    | "subscriber"
    | "vip"
    | "broadcaster"
    | "first";
  const page = parsePositiveInt(params.page, 1);

  const [channels, { items, total }] = await Promise.all([
    listChannelOptions(),
    listMessages({ channelUuid, user, content, role, from, to, page, pageSize: PAGE_SIZE }),
  ]);

  const activeFilters = { channel: channelUuid, user, content, role: role === "all" ? undefined : role, from, to };
  const hasActiveFilters = Object.values(activeFilters).some(Boolean);
  const canExport = hasPermission(session.user.permissions, PERMISSIONS.MESSAGES_EXPORT);

  return (
    <>
      <PageHeader
        title="Nachrichten"
        description="Durchsuche den aufgezeichneten Chatverlauf aller Channels."
        actions={
          canExport ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/messages/export${buildQueryString(activeFilters)}`} prefetch={false}>
                <Download />
                CSV-Export
              </Link>
            </Button>
          ) : undefined
        }
      />

      <FilterBar action="/messages" hasActiveFilters={hasActiveFilters}>
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

        <FilterField label="Nutzer">
          <Input name="user" defaultValue={user ?? ""} placeholder="Benutzername" />
        </FilterField>

        <FilterField label="Inhalt">
          <Input name="content" defaultValue={content ?? ""} placeholder="Textsuche" />
        </FilterField>

        <FilterField label="Rolle" className="w-full space-y-1.5 sm:w-44">
          <Select name="role" defaultValue={role}>
            {ROLES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="Von" className="w-full space-y-1.5 sm:w-40">
          <Input type="date" name="from" defaultValue={from ?? ""} />
        </FilterField>

        <FilterField label="Bis" className="w-full space-y-1.5 sm:w-40">
          <Input type="date" name="to" defaultValue={to ?? ""} />
        </FilterField>
      </FilterBar>

      <Card>
        <CardContent className="p-0">
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
                <TableEmpty colSpan={4}>Keine Nachrichten gefunden.</TableEmpty>
              ) : (
                items.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                      {formatDateTime(message.receivedAt)}
                    </TableCell>
                    <TableCell className="text-xs text-[var(--color-muted-foreground)]">
                      {message.channelName}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Link
                          href={`/viewers/${message.userId}`}
                          className="max-w-32 truncate font-medium hover:underline"
                          style={message.color ? { color: message.color } : undefined}
                        >
                          {message.displayName ?? message.userName}
                        </Link>
                        <ChatRoleBadges
                          isBroadcaster={message.isBroadcaster}
                          isMod={message.isMod}
                          isVip={message.isVip}
                          isSubscriber={message.isSubscriber}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xl">
                      <span className={message.isAction ? "italic text-[var(--color-brand)]" : undefined}>
                        {message.content}
                      </span>
                      <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                        {message.bits > 0 && <Badge variant="success">{formatNumber(message.bits)} Bits</Badge>}
                        {message.isFirstMessage && <Badge variant="warning">Erste Nachricht</Badge>}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <Pagination
            basePath="/messages"
            params={activeFilters}
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
          />
        </CardContent>
      </Card>
    </>
  );
}
