/**
 * Rahmen für alle Auth-Seiten: zentriert den Inhalt, sonst nichts.
 * Breite und Kopfbereich bestimmt jede Seite selbst – die Login-Seite
 * ist zweispaltig, die übrigen nutzen die schmale <AuthShell>.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">{children}</div>
  );
}
