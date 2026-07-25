import Link from "next/link";
import { buildQueryString, cn } from "@/lib/utils";

interface RangeSelectorProps {
  basePath: string;
  /** Weitere Query-Parameter, die erhalten bleiben. */
  params?: Record<string, string | number | undefined | null>;
  options: ReadonlyArray<{ value: number; label: string }>;
  current: number;
  /** Name des Query-Parameters. */
  paramName?: string;
}

/**
 * Zeitraumwahl als Links – funktioniert ohne JavaScript und
 * haelt den gewaehlten Zeitraum in der URL.
 */
export function RangeSelector({
  basePath,
  params = {},
  options,
  current,
  paramName = "range",
}: RangeSelectorProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-0.5">
      {options.map((option) => {
        const active = option.value === current;

        return (
          <Link
            key={option.value}
            href={`${basePath}${buildQueryString({ ...params, [paramName]: option.value })}`}
            aria-current={active ? "true" : undefined}
            className={cn(
              "rounded-[5px] px-2.5 py-1 text-xs transition-colors",
              active
                ? "bg-[var(--color-accent)] font-medium text-[var(--color-foreground)]"
                : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
