import * as React from "react";
import { cn } from "@/lib/utils";

const fieldClasses = [
  "w-full rounded-md border border-[var(--color-input)] bg-[var(--color-surface)] text-sm",
  "transition-colors duration-150",
  "placeholder:text-[var(--color-subtle)]",
  "focus-visible:outline-none focus-visible:border-[var(--color-border-strong)] focus-visible:ring-1 focus-visible:ring-[var(--color-ring)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-[invalid=true]:border-[var(--color-destructive)]",
].join(" ");

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(fieldClasses, "h-9 px-3 py-1", "file:border-0 file:bg-transparent file:text-sm file:font-medium", className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldClasses, "min-h-20 px-3 py-2 leading-relaxed", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export { Input, Textarea, fieldClasses };
