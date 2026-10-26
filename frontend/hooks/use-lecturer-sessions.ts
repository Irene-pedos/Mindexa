"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import { toast } from "sonner";
import {
  PINNED_STORAGE_KEY,
  SESSIONS_STORAGE_KEY,
  parseStoredPins,
  parseStoredSessions,
  removeSession,
  orderSessions,
  sessionTitle,
  togglePinned,
  unpin,
  upsertSession,
  type AIModule,
  type AISession,
  type ChatMessage,
} from "@/lib/lecturer-sessions";
import { safeSetItem } from "@/lib/safe-storage";

interface UseLecturerSessionsOptions {
  /** The conversation currently on screen; loaded sessions replace it. */
  setHistory: (history: ChatMessage[]) => void;
  activeTab: AIModule;
  selectedWorkspaceId: string;
  setActiveTab: (tab: AIModule) => void;
  setSelectedWorkspaceId: (id: string) => void;
}

/**
 * Saved conversations of the lecturer assistant: the list, which one is open, pinning, and
 * deletion. Persists to localStorage (best-effort) and restores after mount, so the first render
 * matches the server. The pure rules live in lib/lecturer-sessions.ts.
 */
export function useLecturerSessions({
  setHistory,
  activeTab,
  selectedWorkspaceId,
  setActiveTab,
  setSelectedWorkspaceId,
}: UseLecturerSessionsOptions) {
  const [sessions, setSessions] = useState<AISession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [pinnedSessionIds, setPinnedSessionIds] = useState<ReadonlySet<string>>(() => new Set());
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  // Restore after mount (storage doesn't exist on the server render, so reading it during the
  // first render would not match the server HTML).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    try {
      const restored = parseStoredSessions(localStorage.getItem(SESSIONS_STORAGE_KEY));
      setSessions(restored);
      // Write back the cleaned list so legacy module names and junk entries don't linger.
      if (restored.length > 0) safeSetItem(SESSIONS_STORAGE_KEY, JSON.stringify(restored));
      setPinnedSessionIds(parseStoredPins(localStorage.getItem(PINNED_STORAGE_KEY)));
    } catch {
      // storage unavailable: start empty
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persistSessions = useCallback((next: AISession[]) => {
    safeSetItem(SESSIONS_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const persistPins = useCallback((next: ReadonlySet<string>) => {
    safeSetItem(PINNED_STORAGE_KEY, JSON.stringify(Array.from(next)));
  }, []);

  /** Save (or update) the open conversation as a session. No-op while it is empty. */
  const saveCurrentSession = useCallback(
    (history: ChatMessage[], customTitle?: string) => {
      if (history.length === 0) return;

      const session: AISession = {
        id: currentSessionId || crypto.randomUUID(),
        title: sessionTitle(history, activeTab, customTitle),
        module: activeTab,
        workspaceId: selectedWorkspaceId,
        history,
        created_at: new Date().toISOString(),
      };

      setSessions((prev) => {
        const next = upsertSession(prev, session);
        persistSessions(next);
        return next;
      });
      if (!currentSessionId) setCurrentSessionId(session.id);
    },
    [activeTab, currentSessionId, selectedWorkspaceId, persistSessions]
  );

  const startNewSession = useCallback(
    (tab?: AIModule) => {
      setCurrentSessionId(null);
      setHistory([]);
      if (tab) setActiveTab(tab);
      toast.success("Started a new session.");
    },
    [setHistory, setActiveTab]
  );

  const loadSession = useCallback(
    (session: AISession) => {
      setCurrentSessionId(session.id);
      setActiveTab(session.module);
      if (session.workspaceId) setSelectedWorkspaceId(session.workspaceId);
      setHistory(session.history || []);
      toast.info(`Loaded session: ${session.title}`);
    },
    [setActiveTab, setSelectedWorkspaceId, setHistory]
  );

  const togglePinSession = useCallback(
    (sessionId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      setPinnedSessionIds((prev) => {
        const { next, isPinned } = togglePinned(prev, sessionId);
        toast[isPinned ? "success" : "info"](isPinned ? "Session pinned to top." : "Session unpinned.");
        persistPins(next);
        return next;
      });
    },
    [persistPins]
  );

  const confirmDeleteSession = useCallback(() => {
    if (!sessionToDelete) return;
    const id = sessionToDelete;
    setSessions((prev) => {
      const next = removeSession(prev, id);
      persistSessions(next);
      return next;
    });
    // Don't leave the deleted session's id behind in the pinned set.
    setPinnedSessionIds((prev) => {
      const next = unpin(prev, id);
      if (next !== prev) persistPins(next);
      return next;
    });
    if (currentSessionId === id) startNewSession();
    setSessionToDelete(null);
    toast.success("Session deleted successfully.");
  }, [sessionToDelete, currentSessionId, startNewSession, persistSessions, persistPins]);

  const sortedSessions = useMemo(() => orderSessions(sessions, pinnedSessionIds), [sessions, pinnedSessionIds]);

  return {
    sortedSessions,
    currentSessionId,
    pinnedSessionIds,
    sessionToDelete,
    setSessionToDelete,
    saveCurrentSession,
    startNewSession,
    loadSession,
    togglePinSession,
    confirmDeleteSession,
  };
}
