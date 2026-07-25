import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-[var(--color-muted)]">
        <FileQuestion className="size-6 text-[var(--color-muted-foreground)]" />
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Seite nicht gefunden</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Die aufgerufene Seite existiert nicht oder wurde entfernt.
        </p>
      </div>

      <Button variant="outline" asChild>
        <Link href="/dashboard">Zum Dashboard</Link>
      </Button>
    </div>
  );
}
