import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ClipboardList, Clock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { StatCard } from "@/components/stat-card";
import { PanelSurface } from "@/components/panel-surface";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { auditActionLabel } from "@/lib/audit";
import { getAuditStats, listAuditActions, listAuditEntries } from "@/lib/queries/accounts";
import { formatDateTime, formatRelative, parsePositiveInt, parseSearchParam } from "@/lib/utils";
import { AuditTableBody } from "./audit-table-body";
import type { AuditRowEntry } from "@/components/audit/audit-detail-dialog";
import { normalizeAuditDetail } from "@/lib/audit-diff";

export const metadata: Metadata = { title: "Audit-Log" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const ROW_HINT_ID = "audit-row-activation-hint";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const params = await searchParams;

  const actor = parseSearchParam(params.actor);
  const action = parseSearchParam(params.action);
  const outcomeParam = parseSearchParam(params.outcome);
  const outcome = outcomeParam === "success" || outcomeParam === "failure" ? outcomeParam : "all";
  const page = parsePositiveInt(params.page, 1);

  const [actions, { items, total }, stats] = await Promise.all([
    listAuditActions(),
    listAuditEntries({ actor, action, outcome, page, pageSize: PAGE_SIZE }),
    getAuditStats(),
  ]);

  const activeFilters = { actor, action, outcome: outcome === "all" ? undefined : outcome };

  const entries: AuditRowEntry[] = items.map((entry) => ({
    id: entry.id,
    action: entry.action,
    actionLabel: auditActionLabel(entry.action),
    createdAt: formatDateTime(entry.createdAt),
    actorName: entry.actorName,
    targetType: entry.targetType,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    note: entry.note,
    outcome: entry.outcome,
    detail: normalizeAuditDetail(entry.metadata),
  }));

  return (
    <>
      <PageHeader
        title="Audit-Log"
        description="Lückenlose Protokollierung aller sicherheitsrelevanten Vorgänge im Panel."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Einträge gesamt" value={stats.total} icon={ClipboardList} accent="brand" />
        <Link href="/audit?outcome=failure">
          <StatCard
            label="Fehlschläge (24 Std.)"
            value={stats.failures24h}
            icon={AlertTriangle}
            accent={stats.failures24h > 0 ? "destructive" : "neutral"}
            className="transition-colors hover:border-[var(--color-border-strong)]"
          />
        </Link>
        <StatCard
          label="Letzter Eintrag"
          value={stats.lastEntryAt ? formatRelative(stats.lastEntryAt) : "—"}
          icon={Clock}
        />
      </div>

      <FilterBar action="/audit" hasActiveFilters={Object.values(activeFilters).some(Boolean)}>
        <FilterField label="Akteur">
          <Input name="actor" defaultValue={actor ?? ""} placeholder="Benutzername" />
        </FilterField>

        <FilterField label="Aktion">
          <Select name="action" defaultValue={action ?? ""}>
            <option value="">Alle Aktionen</option>
            {actions.map((entry) => (
              <option key={entry} value={entry}>
                {auditActionLabel(entry)}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="Ergebnis" className="w-full space-y-1.5 sm:w-40">
          <Select name="outcome" defaultValue={outcome}>
            <option value="all">Alle</option>
            <option value="success">Erfolgreich</option>
            <option value="failure">Fehlgeschlagen</option>
          </Select>
        </FilterField>
      </FilterBar>

      <PanelSurface variant="flush">
          {entries.length > 0 && (
            <p id={ROW_HINT_ID} className="sr-only">
              Enter oder Leertaste öffnet die Details
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Zeit</TableHead>
                <TableHead className="w-52">Aktion</TableHead>
                <TableHead className="w-36">Akteur</TableHead>
                <TableHead>Ziel</TableHead>
                <TableHead className="w-32">IP</TableHead>
                <TableHead className="w-28">Ergebnis</TableHead>
              </TableRow>
            </TableHeader>
            <AuditTableBody entries={entries} rowHintId={ROW_HINT_ID} />
          </Table>

          <Pagination basePath="/audit" params={activeFilters} page={page} pageSize={PAGE_SIZE} total={total} />
      </PanelSurface>
    </>
  );
}
