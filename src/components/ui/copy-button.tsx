"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { cn } from "@/lib/utils";

interface CopyButtonProps extends Omit<ButtonProps, "onClick" | "children"> {
  value: string;
  label?: string;
  /** Nur das Symbol zeigen – der Text steckt dann im Tooltip. */
  iconOnly?: boolean;
}

export function CopyButton({ value, label = "Kopieren", iconOnly, className, ...props }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard-API nicht verfügbar (z. B. ohne HTTPS) – still ignorieren.
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon" : "sm"}
      onClick={handleCopy}
      title={copied ? "Kopiert" : label}
      aria-label={label}
      className={cn(iconOnly && "size-8", className)}
      {...props}
    >
      {copied ? <Check /> : <Copy />}
      {!iconOnly && (copied ? "Kopiert" : label)}
    </Button>
  );
}
