"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "./button";

interface CopyButtonProps extends Omit<ButtonProps, "onClick"> {
  value: string;
  label?: string;
}

export function CopyButton({ value, label = "Kopieren", ...props }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard-API nicht verfuegbar (z. B. ohne HTTPS) — still ignorieren.
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} {...props}>
      {copied ? <Check /> : <Copy />}
      {copied ? "Kopiert" : label}
    </Button>
  );
}
