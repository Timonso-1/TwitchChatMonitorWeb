"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

/**
 * Passwortfeld mit Umschalter für die Sichtbarkeit.
 * Der Umschalter ist bewusst kein `<button>` im Formularfluss mit
 * Standardtyp – ohne `type="button"` würde ein Klick das Formular absenden.
 */
export function PasswordInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
      />

      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        tabIndex={-1}
        aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
        title={visible ? "Passwort verbergen" : "Passwort anzeigen"}
        className="absolute right-0 top-0 flex h-9 w-10 items-center justify-center text-[var(--color-subtle)] transition-colors hover:text-[var(--color-foreground)]"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
