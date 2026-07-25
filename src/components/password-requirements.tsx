import { PASSWORD_REQUIREMENTS } from "@/lib/auth/password-policy";

export function PasswordRequirements() {
  return (
    <ul className="space-y-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
      {PASSWORD_REQUIREMENTS.map((requirement) => (
        <li key={requirement} className="flex items-center gap-2">
          <span className="size-1 rounded-full bg-[var(--color-muted-foreground)]" />
          {requirement}
        </li>
      ))}
    </ul>
  );
}
