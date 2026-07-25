"use client";

import { Download } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";

export function RecoveryCodeList({ codes }: { codes: string[] }) {
  const asText = codes.join("\n");

  function handleDownload() {
    const content = [
      "TwitchPanel – Recovery-Codes",
      `Erstellt am: ${new Date().toLocaleString("de-DE")}`,
      "",
      "Jeder Code funktioniert genau einmal.",
      "",
      ...codes,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "twitchpanel-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <Alert variant="warning">
        Diese Codes werden nur einmal angezeigt. Bewahre sie getrennt von deinem Passwortmanager-Login auf.
      </Alert>

      <ul className="grid grid-cols-2 gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] p-3">
        {codes.map((code) => (
          <li key={code} className="text-center font-mono text-sm tracking-wide">
            {code}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <CopyButton value={asText} label="Alle kopieren" className="flex-1" />
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={handleDownload}>
          <Download />
          Herunterladen
        </Button>
      </div>
    </div>
  );
}
