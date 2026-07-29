import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXPORT_LIMIT } from "@/lib/csv";
import { formatNumber } from "@/lib/utils";

interface ExportButtonProps {
  href: string;
  /** Wie viele Zeilen der aktuelle Filter trifft. */
  total: number;
}

/**
 * CSV-Export mit ehrlicher Beschriftung.
 *
 * Der Export ist bei EXPORT_LIMIT Zeilen gekappt. Vorher stand das nur im
 * Audit-Log – wer mehr Treffer hatte, bekam eine unvollständige Datei und
 * konnte das nirgends erkennen. Trifft der Filter mehr, sagt der Button es
 * jetzt vorher, und der Dateiname der Antwort trägt es ebenfalls.
 */
export function ExportButton({ href, total }: ExportButtonProps) {
  const truncated = total > EXPORT_LIMIT;

  return (
    <Button variant="outline" size="sm" asChild>
      <Link
        href={href}
        prefetch={false}
        title={
          truncated
            ? `Der Filter trifft ${formatNumber(total)} Zeilen. Die Datei enthält die ${formatNumber(EXPORT_LIMIT)} neuesten.`
            : undefined
        }
      >
        <Download />
        {truncated ? `CSV-Export (max. ${formatNumber(EXPORT_LIMIT)})` : "CSV-Export"}
      </Link>
    </Button>
  );
}
