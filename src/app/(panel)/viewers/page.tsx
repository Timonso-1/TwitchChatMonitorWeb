import type { Metadata } from "next";
import Link from "next/link";
import { StickyNote } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FilterBar, FilterField } from "@/components/filter-bar";
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
import { formatDateTime, formatNumber, formatRelative, parsePositiveInt, parseSearchParam } from "@/lib/utils";

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

  const { items, total } = await listViewers({ search, sort, page, pageSize: PAGE_SIZE });

  const canViewNotes = hasPermission(session.user.permissions, PERMISSIONS.VIEWERS_NOTES_VIEW);
  const noteCounts = canViewNotes
    ? await countNotesForViewers(items.map((viewer) => viewer.userId))
    : new Map<string, number>();

  return (
    <>
      <PageHeader
        title="Zuschauer"
        description="Alle im Chat erfassten Twitch-Nutzer mit ihrer Aktivität."
      />

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
      </FilterBar>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nutzer</TableHead>
                <TableHead>User-ID</TableHead>
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

                  return (
                    <TableRow key={viewer.userId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link href={`/viewers/${viewer.userId}`} className="font-medium hover:underline">
                            {viewer.displayName ?? viewer.userName}
                          </Link>
                          {notes > 0 && (
                            <Badge variant="info" title={`${notes} Notiz(en)`}>
                              <StickyNote className="size-3" />
                              {notes}
                            </Badge>
                          )}
                        </div>
                        {viewer.displayName && viewer.displayName !== viewer.userName && (
                          <span className="block text-xs text-[var(--color-muted-foreground)]">{viewer.userName}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[var(--color-muted-foreground)]">
                        {viewer.userId}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(viewer.messageCount)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                        {formatDateTime(viewer.firstSeenAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
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
            params={{ search, sort: sort === "messages" ? undefined : sort }}
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
          />
        </CardContent>
      </Card>
    </>
  );
}
