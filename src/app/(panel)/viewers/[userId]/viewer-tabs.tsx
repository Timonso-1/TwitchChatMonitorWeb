"use client";

import * as React from "react";
import { BarChart3, MessageSquare, ShieldAlert, StickyNote, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ViewerTabsProps {
  overview: React.ReactNode;
  messages: React.ReactNode | null;
  events: React.ReactNode | null;
  moderation: React.ReactNode | null;
  notes: React.ReactNode | null;
  counts: {
    messages: number;
    events: number;
    moderation: number;
    notes: number;
  };
}

/**
 * Reiter-Navigation des Chatter-Profils.
 * Die Inhalte werden serverseitig gerendert und hier nur eingehaengt.
 */
export function ViewerTabs({ overview, messages, events, moderation, notes, counts }: ViewerTabsProps) {
  const tabs = [
    { value: "overview", label: "Überblick", icon: BarChart3, content: overview, count: null as number | null },
    { value: "messages", label: "Nachrichten", icon: MessageSquare, content: messages, count: counts.messages },
    { value: "events", label: "Events", icon: Zap, content: events, count: counts.events },
    { value: "moderation", label: "Moderation", icon: ShieldAlert, content: moderation, count: counts.moderation },
    { value: "notes", label: "Notizen", icon: StickyNote, content: notes, count: counts.notes },
  ].filter((tab) => tab.content !== null);

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="w-full justify-start sm:w-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <TabsTrigger key={tab.value} value={tab.value}>
              <Icon />
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <Badge variant="muted" className="ml-0.5 px-1 py-0 text-[0.65rem]">
                  {tab.count}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
