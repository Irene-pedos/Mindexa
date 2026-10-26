"use client";

import { useMemo } from "react";
import { ConversationList } from "@/components/mindexa/common/conversation-list";
import type { AISession } from "@/lib/lecturer-sessions";

interface SessionListProps {
  sessions: AISession[];
  currentSessionId: string | null;
  pinnedIds: ReadonlySet<string>;
  onOpen: (session: AISession) => void;
  onTogglePin: (sessionId: string, event: React.MouseEvent) => void;
  onDelete: (sessionId: string) => void;
  emptyText?: string;
}

/** Lecturer saved sessions, shown with the shared accessible conversation list. */
export function SessionList({
  sessions,
  currentSessionId,
  pinnedIds,
  onOpen,
  onTogglePin,
  onDelete,
  emptyText = "No saved sessions yet.",
}: SessionListProps) {
  const items = useMemo(
    () =>
      sessions.map((session) => ({
        id: session.id,
        title: session.title,
        meta: `${session.module} · ${new Date(session.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })}`,
      })),
    [sessions]
  );

  return (
    <ConversationList
      items={items}
      currentId={currentSessionId}
      pinnedIds={pinnedIds}
      onOpen={(id) => {
        const session = sessions.find((s) => s.id === id);
        if (session) onOpen(session);
      }}
      onTogglePin={onTogglePin}
      onDelete={onDelete}
      emptyText={emptyText}
    />
  );
}
