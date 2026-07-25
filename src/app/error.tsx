"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[panel]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-destructive)_15%,transparent)]">
        <AlertTriangle className="size-6 text-[var(--color-destructive)]" />
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Etwas ist schiefgelaufen</h1>
        <p className="max-w-md text-sm text-[var(--color-muted-foreground)]">
          Die Seite konnte nicht geladen werden. Prüfe die Serverlogs für Details.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-[var(--color-muted-foreground)]">Fehler-ID: {error.digest}</p>
        )}
      </div>

      <Button variant="outline" onClick={reset}>
        Erneut versuchen
      </Button>
    </div>
  );
}
