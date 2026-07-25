import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquare, ShieldAlert, Users, Zap } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardField, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getChannelDetail } from "@/lib/queries/channels";
import { formatDateTime, formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uuid: string }>;
}): Promise<Metadata> {
  const { uuid } = await params;
  const channel = await getChannelDetail(uuid);
  return { title: channel ? channel.name : "Channel" };
}

export default async function ChannelDetailPage({ params }: { params: Promise<{ uuid: string }> }) {
  const session = await requirePermission(PERMISSIONS.CHANNELS_VIEW);
  const { uuid } = await params;

  const channel = await getChannelDetail(uuid);
  if (!channel) notFound();

  const permissions = session.user.permissions;

  return (
    <>
      <PageHeader
        title={channel.name}
        description={`Broadcaster-ID ${channel.broadcasterId}`}
        backHref="/channels"
        actions={<Badge variant={channel.active ? "success" : "muted"}>{channel.active ? "Aktiv" : "Inaktiv"}</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Nachrichten" value={channel.messageCount} icon={MessageSquare} />
        <StatCard label="Events" value={channel.eventCount} icon={Zap} accent="warning" />
        <StatCard label="Moderationsaktionen" value={channel.moderationCount} icon={ShieldAlert} accent="destructive" />
        <StatCard label="Verschiedene Chatter" value={channel.uniqueChatters} icon={Users} accent="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stammdaten</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <CardField label="UUID">
              <span className="font-mono text-xs">{channel.uuid}</span>
            </CardField>
            <CardField label="Broadcaster-ID">
              <span className="font-mono text-xs">{channel.broadcasterId}</span>
            </CardField>
            <CardField label="Angelegt">{formatDateTime(channel.createdAt)}</CardField>
            <CardField label="Zuletzt geändert">{formatDateTime(channel.updatedAt)}</CardField>
            <CardField label="Angelegt von">{channel.createdByName ?? "—"}</CardField>
            <CardField label="Letzte Nachricht">
              {channel.lastMessageAt ? formatRelative(channel.lastMessageAt) : "—"}
            </CardField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weiterführende Ansichten</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {hasPermission(permissions, PERMISSIONS.MESSAGES_VIEW) && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/messages?channel=${channel.uuid}`}>
                  <MessageSquare />
                  Nachrichten
                </Link>
              </Button>
            )}
            {hasPermission(permissions, PERMISSIONS.EVENTS_VIEW) && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/events?channel=${channel.uuid}`}>
                  <Zap />
                  Events
                </Link>
              </Button>
            )}
            {hasPermission(permissions, PERMISSIONS.MODERATION_VIEW) && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/moderation?channel=${channel.uuid}`}>
                  <ShieldAlert />
                  Moderation
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
