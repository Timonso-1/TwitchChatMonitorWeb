import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldClasses } from "./input";

/**
 * Bewusst ein natives <select>: es funktioniert ohne JavaScript und
 * lässt sich damit direkt in serverseitigen GET-Formularen verwenden.
 */
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select ref={ref} className={cn(fieldClasses, "h-9 appearance-none pl-3 pr-8", className)} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]"
        aria-hidden
      />
    </div>
  ),
);
Select.displayName = "Select";

export { Select };
