import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { RangeSelector } from "@/components/range-selector";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { DASHBOARD_PRESETS, rangeSentence, resolveRange } from "@/lib/range";
import { BotStatusBadge, BotStatusBadgeSkeleton } from "./bot-status-badge";
import { DashboardLead } from "./dashboard-lead";
import { DashboardSections } from "./dashboard-sections";
import { DashboardLeadSkeleton, DashboardSectionsSkeleton } from "./dashboard-skeletons";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
  const params = await searchParams;
  const range = resolveRange(params, { presets: DASHBOARD_PRESETS, fallbackDays: 7 });

  const permissions = session.user.permissions;
  const canSeeMessages = hasPermission(permissions, PERMISSIONS.MESSAGES_VIEW);
  const canSeeEvents = hasPermission(permissions, PERMISSIONS.EVENTS_VIEW);
  const canSeeModeration = hasPermission(permissions, PERMISSIONS.MODERATION_VIEW);
  const canSeeChannels = hasPermission(permissions, PERMISSIONS.CHANNELS_VIEW);
  const canSeeViewers = hasPermission(permissions, PERMISSIONS.VIEWERS_VIEW);

  const greeting = session.user.displayName ?? session.user.username;

  return (
    <>
      <PageHeader
        title={`Willkommen zurück, ${greeting}`}
        description={`Überblick über die Aktivit in ${rangeSentence(range)}.`}
        actions={
          <>
            <Suspense fallback={<BotStatusBadgeSkeleton />}>
              <BotStatusBadge />
            </Suspense>
            <RangeSelector basePath="/dashboard" presets={DASHBOARD_PRESETS} range={range} />
          </>
        }
      />

      <Suspense fallback={<DashboardLeadSkeleton />}>
        <DashboardLead
          range={range}
          canSeeMessages={canSeeMessages}
          canSeeEvents={canSeeEvents}
          canSeeModeration={canSeeModeration}
        />
      </Suspense>

      <Suspense fallback={<DashboardSectionsSkeleton />}>
        <DashboardSections
          range={range}
          canSeeChannels={canSeeChannels}
          canSeeEvents={canSeeEvents}
          canSeeModeration={canSeeModeration}
          canSeeViewers={canSeeViewers}
        />
      </Suspense>
    </>
  );
}
