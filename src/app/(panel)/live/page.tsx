import type { Metadata } from "next";
import Link from "next/link";
import { Radar } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { LiveChat } from "./live-chat";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { resolveChannelFilter } from "@/lib/channel-filter";
import { listChannelFilterOptions } from "@/lib/queries/channels";
import { parseSearchParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Live-Chat" };
export const dynamic = "force-dynamic";

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.CHAT_LIVE);
  const params = await searchParams;

  // Wie auf den Listenseiten aus den Daten, damit ein geloeschter Channel
  // waehlbar bleibt. Der Verlauf beim Erstabruf ist dort weiterhin sichtbar –
  // neue Nachrichten kommen naturgemaess keine mehr dazu.
  const channels = await listChannelFilterOptions("messages");
  const initialChannel = resolveChannelFilter(channels, parseSearchParam(params.channel)).value;

  const canManageWatchlist = hasPermission(session.user.permissions, PERMISSIONS.WATCHLIST_VIEW);

  return (
    <>
      <PageHeader
        title="Live-Chat"
        description="Der laufende Chat, automatisch aktualisiert. Treffer des Wortfilters werden hervorgehoben."
        actions={
          canManageWatchlist ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/watchlist">
                <Radar />
                Wortfilter
              </Link>
            </Button>
          ) : undefined
        }
      />

      <LiveChat channels={channels} initialChannel={initialChannel} />
    </>
  );
}
