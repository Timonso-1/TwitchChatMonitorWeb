import type { Metadata } from "next";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { permissionLabel } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Kein Zugriff" };

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ permission?: string }>;
}) {
  const { permission } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-destructive)_15%,transparent)]">
        <ShieldX className="size-6 text-[var(--color-destructive)]" />
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Kein Zugriff</h1>
        <p className="max-w-md text-sm text-[var(--color-muted-foreground)]">
          Deinem Account fehlt die nötige Berechtigung für diesen Bereich.
          {permission && (
            <>
              {" "}
              Erforderlich: <span className="font-medium text-[var(--color-foreground)]">{permissionLabel(permission)}</span>
            </>
          )}
        </p>
      </div>

      <Button variant="outline" asChild>
        <Link href="/dashboard">Zurück zum Dashboard</Link>
      </Button>
    </div>
  );
}
