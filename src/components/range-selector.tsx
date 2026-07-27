import Link from "next/link";
import { CalendarRange, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CUSTOM_RANGE, type RangePreset, type ResolvedRange } from "@/lib/range";
import { buildQueryString, cn } from "@/lib/utils";

interface RangeSelectorProps {
  basePath: string;
  /** Weitere Query-Parameter, die erhalten bleiben (Filter, Tab, …). */
  params?: Record<string, string | number | undefined | null>;
  presets: readonly RangePreset[];
  range: ResolvedRange;
}

/**
 * Zeitraumwahl: Vorgaben als Links, freier Zeitraum als aufklappbares
 * GET-Formular. Beides funktioniert ohne JavaScript und hält den Zeitraum
 * in der URL, damit die Ansicht teilbar bleibt.
 *
 * Bewusst `<details>` statt eines Popover-Komponenten: das Aufklappen
 * braucht so keinen Client-Code und keinen Hydration-Umweg.
 */
export function RangeSelector({ basePath, params = {}, presets, range }: RangeSelectorProps) {
  // Filter etc. müssen das Formular als Hidden-Felder überleben, sonst wirft
  // ein Zeitraumwechsel sie weg.
  const carried = Object.entries(params).filter(
    ([key, value]) => value !== undefined && value !== null && value !== "" && key !== "range" && key !== "from" && key !== "to",
  );

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-0.5">
      {presets.map((preset) => {
        const active = !range.isCustom && range.key === preset.value;

        return (
          <Link
            key={preset.value}
            href={`${basePath}${buildQueryString({ ...params, range: preset.value, from: undefined, to: undefined })}`}
            aria-current={active ? "true" : undefined}
            className={cn(
              "rounded-[5px] px-2.5 py-1 text-xs transition-colors",
              active
                ? "bg-[var(--color-accent)] font-medium text-[var(--color-foreground)]"
                : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
            )}
          >
            {preset.label}
          </Link>
        );
      })}

      <details className="relative">
        <summary
          className={cn(
            "flex cursor-pointer list-none items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-xs transition-colors",
            "marker:content-none [&::-webkit-details-marker]:hidden",
            range.isCustom
              ? "bg-[var(--color-accent)] font-medium text-[var(--color-foreground)]"
              : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
          )}
          aria-current={range.isCustom ? "true" : undefined}
        >
          <CalendarRange className="size-3.5" />
          {range.isCustom ? range.label : "Zeitraum"}
        </summary>

        <form
          action={basePath}
          method="get"
          className="absolute right-0 z-20 mt-1.5 w-64 space-y-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-overlay"
        >
          <input type="hidden" name="range" value={CUSTOM_RANGE} />
          {carried.map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={String(value)} />
          ))}

          <p className="text-xs font-medium text-[var(--color-muted-foreground)]">Freier Zeitraum</p>

          <label className="block space-y-1">
            <span className="text-xs text-[var(--color-subtle)]">Von</span>
            <Input type="date" name="from" defaultValue={range.fromDate} max={range.toDate} />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-[var(--color-subtle)]">Bis</span>
            <Input type="date" name="to" defaultValue={range.toDate} />
          </label>

          <Button type="submit" size="sm" className="w-full">
            <Check />
            Anwenden
          </Button>
        </form>
      </details>
    </div>
  );
}
