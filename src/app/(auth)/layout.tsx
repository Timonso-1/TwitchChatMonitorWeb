/**
 * Rahmen für alle Auth-Seiten. Die Login-Seite füllt den Viewport selbst
 * (Split-Screen); die übrigen Seiten zentrieren sich über <AuthShell>.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-[var(--color-background)]">{children}</div>;
}
