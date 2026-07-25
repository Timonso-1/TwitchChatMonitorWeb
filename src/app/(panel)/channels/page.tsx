import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChannelCreateDialog } from "./channel-create-dialog";
import { ChannelRowActions } from "./channel-row-actions";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { listChannels } from "@/lib/queries/channels";
import { formatDateTime, formatNumber, parsePositiveInt, parseSearchParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Channels" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.CHANNELS_VIEW);
  const params = await searchParams;

  const search = parseSearchParam(params.search);
  const statusParam = parseSearchParam(params.status);
  const status = statusParam === "active" || statusParam === "inactive" ? statusParam : "all";
  const page = parsePositiveInt(params.page, 1);

  const { items, total } = await listChannels({ search, status, page, pageSize: PAGE_SIZE });

  const canCreate = hasPermission(session.user.permissions, PERMISSIONS.CHANNELS_CREATE);
  const canUpdate = hasPermission(session.user.permissions, PERMISSIONS.CHANNELS_UPDATE);
  const canDelete = hasPermission(session.user.permissions, PERMISSIONS.CHANNELS_DELETE);

  return (
    <>
      <PageHeader
        title="Channels"
        description="Twitch-Channels, deren Chat vom Bot aufgezeichnet wird."
        actions={canCreate ? <ChannelCreateDialog /> : undefined}
      />

      <FilterBar action="/channels" hasActiveFilters={Boolean(search) || status !== "all"}>
        <FilterField label="Suche">
          <Input name="search" defaultValue={search ?? ""} placeholder="Name oder Broadcaster-ID" />
        </FilterField>
        <FilterField label="Status" className="w-full space-y-1.5 sm:w-40">
          <Select name="status" defaultValue={status}>
            <option value="all">Alle</option>
            <option value="active">Nur aktive</option>
            <option value="inactive">Nur inaktive</option>
          </Select>
        </FilterField>
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Broadcaster-ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Nachrichten</TableHead>
                <TableHead>Angelegt</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableEmpty colSpan={6}>Keine Channels gefunden.</TableEmpty>
              ) : (
                items.map((channel) => (
                  <TableRow key={channel.uuid}>
                    <TableCell>
                      <Link href={`/channels/${channel.uuid}`} className="font-medium hover:underline">
                        {channel.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[var(--color-muted-foreground)]">
                      {channel.broadcasterId}
                    </TableCell>
                    <TableCell>
                      <Badge variant={channel.active ? "success" : "muted"}>
                        {channel.active ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(channel.messageCount)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                      {formatDateTime(channel.createdAt)}
                      {channel.createdByName && <span className="block">von {channel.createdByName}</span>}
                    </TableCell>
                    <TableCell>
                      {(canUpdate || canDelete) && (
                        <ChannelRowActions
                          channel={{
                            uuid: channel.uuid,
                            name: channel.name,
                            broadcasterId: channel.broadcasterId,
                            active: channel.active,
                          }}
                          canUpdate={canUpdate}
                          canDelete={canDelete}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <Pagination
            basePath="/channels"
            params={{ search, status: status === "all" ? undefined : status }}
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
          />
        </CardContent>
      </Card>
    </>
  );
}
