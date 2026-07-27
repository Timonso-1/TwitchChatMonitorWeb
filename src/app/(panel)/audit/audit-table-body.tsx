"use client";

import { useState } from "react";
import { AuditDetailDialog, type AuditRowEntry } from "@/components/audit/audit-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { TableBody, TableCell, TableEmpty, TableRow } from "@/components/ui/table";
import { truncate } from "@/lib/utils";

const ROW_HINT_ID = "audit-row-activation-hint";

export function AuditTableBody({ entries }: { entries: AuditRowEntry[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const rowHintId = ROW_HINT_ID;

  return (
    <>
      <TableBody>
        <TableRow className="sr-only">
          <TableCell id={rowHintId}>Enter öffnet die Details</TableCell>
        </TableRow>
        {entries.length === 0 ? (
          <TableEmpty colSpan={6} title="Keine Einträge gefunden" />
        ) : (
          entries.map((entry) => (
            <TableRow
              key={entry.id}
              tabIndex={0}
              aria-describedby={rowHintId}
              onClick={() => setSelectedId(entry.id)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setSelectedId(entry.id);
              }}
              className="cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)]"
            >
              <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                {entry.createdAt}
              </TableCell>
              <TableCell className="text-sm">
                {entry.actionLabel}
                <span className="block font-mono text-[0.65rem] text-[var(--color-muted-foreground)]">
                  {entry.action}
                </span>
              </TableCell>
              <TableCell className="max-w-36 truncate text-sm">{entry.actorName ?? "System"}</TableCell>
              <TableCell className="text-sm">
                {entry.targetLabel ?? entry.targetId ?? "—"}
                {entry.targetType && (
                  <span className="ml-1.5 text-xs text-[var(--color-muted-foreground)]">({entry.targetType})</span>
                )}
                {entry.note && (
                  <span className="block text-xs text-[var(--color-muted-foreground)]">
                    {truncate(entry.note, 90)}
                  </span>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs text-[var(--color-muted-foreground)]">
                {entry.ipAddress ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant={entry.outcome === "failure" ? "destructive" : "success"}>
                  {entry.outcome === "failure" ? "Fehler" : "OK"}
                </Badge>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>

      <AuditDetailDialog
        entry={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </>
  );
}
