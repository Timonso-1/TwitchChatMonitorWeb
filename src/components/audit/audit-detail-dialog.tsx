"use client";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { AuditDetail, DiffField } from "@/lib/audit-diff";
import { permissionLabel } from "@/lib/auth/permissions";

/** Ein Audit-Eintrag, aufbereitet für Tabellenzeile und Dialog. */
export interface AuditRowEntry {
  id: number;
  action: string;
  actionLabel: string;
  createdAt: string;
  actorName: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  note: string | null;
  outcome: string;
  detail: AuditDetail;
}

export function AuditDetailDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: AuditRowEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {entry.actionLabel}
            <Badge variant={entry.outcome === "failure" ? "destructive" : "success"}>
              {entry.outcome === "failure" ? "Fehler" : "OK"}
            </Badge>
          </DialogTitle>
          <DialogDescription className="font-mono text-[0.65rem]">{entry.action}</DialogDescription>
        </DialogHeader>

        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
          <MetaRow label="Zeitpunkt" value={entry.createdAt} />
          <MetaRow label="Akteur" value={entry.actorName ?? "System"} />
          <MetaRow
            label="Ziel"
            value={
              entry.targetLabel || entry.targetId
                ? `${entry.targetLabel ?? entry.targetId}${entry.targetType ? ` (${entry.targetType})` : ""}`
                : null
            }
          />
          <MetaRow label="IP-Adresse" value={entry.ipAddress} mono />
          <MetaRow label="User-Agent" value={entry.userAgent} mono />
          <MetaRow label="Notiz" value={entry.note} />
        </dl>

        <AuditDetailBody detail={entry.detail} />
      </DialogContent>
    </Dialog>
  );
}

function MetaRow({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;

  return (
    <>
      <dt className="text-xs text-[var(--color-muted-foreground)] sm:pt-0.5">{label}</dt>
      <dd className={mono ? "break-all font-mono text-xs" : "break-words"}>{value}</dd>
    </>
  );
}

function AuditDetailBody({ detail }: { detail: AuditDetail }) {
  if (detail.kind === "none") {
    return (
      <p className="border-t border-[var(--color-border)] pt-4 text-sm text-[var(--color-muted-foreground)]">
        Keine weiteren Details protokolliert.
      </p>
    );
  }

  if (detail.kind === "properties") {
    return (
      <dl className="grid gap-x-4 gap-y-2 border-t border-[var(--color-border)] pt-4 text-sm sm:grid-cols-[8rem_1fr]">
        {detail.entries.map((entry) => (
          <MetaRow key={entry.key} label={entry.label} value={entry.value} />
        ))}
      </dl>
    );
  }

  return (
    <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
      {detail.fields.map((field) => (
        <DiffFieldView key={field.key} field={field} />
      ))}
    </div>
  );
}

function DiffFieldView({ field }: { field: DiffField }) {
  if (field.type === "scalar") {
    return (
      <div className="space-y-1">
        <p className="text-xs text-[var(--color-muted-foreground)]">{field.label}</p>
        <p className="text-sm">
          <span className="text-[var(--color-muted-foreground)] line-through">{field.before ?? "—"}</span>
          <span className="mx-2 text-[var(--color-muted-foreground)]">→</span>
          <span>{field.after ?? "—"}</span>
        </p>
      </div>
    );
  }

  const isPermissionList = field.key === "permissions";
  const label = (value: string) => (isPermissionList ? permissionLabel(value) : value);

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-[var(--color-muted-foreground)]">
        {field.label}
        {field.unchanged.length > 0 && (
          <span className="ml-2">({field.unchanged.length} unverändert)</span>
        )}
      </p>

      <ul className="space-y-1">
        {field.added.map((value) => (
          <li key={`add-${value}`} className="flex gap-2 text-sm">
            <span className="select-none font-mono text-[var(--color-success)]">+</span>
            <span>
              {label(value)}
              {isPermissionList && (
                <span className="block font-mono text-[0.65rem] text-[var(--color-muted-foreground)]">{value}</span>
              )}
            </span>
          </li>
        ))}
        {field.removed.map((value) => (
          <li key={`remove-${value}`} className="flex gap-2 text-sm">
            <span className="select-none font-mono text-[var(--color-destructive)]">−</span>
            <span className="text-[var(--color-muted-foreground)]">
              {label(value)}
              {isPermissionList && <span className="block font-mono text-[0.65rem]">{value}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
