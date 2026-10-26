"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { parseStoredPins, togglePinned, unpin } from "@/lib/lecturer-sessions";
import { safeSetItem } from "@/lib/safe-storage";

/**
 * A set of pinned item ids remembered in localStorage (best-effort). Restored after mount so the
 * first render matches the server render.
 */
export function usePinnedIds(storageKey: string, noun = "Conversation") {
  const [pinnedIds, setPinnedIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    try {
      setPinnedIds(parseStoredPins(localStorage.getItem(storageKey)));
    } catch {
      // storage unavailable: nothing is pinned
    }
  }, [storageKey]);

  const persist = useCallback(
    (next: ReadonlySet<string>) => safeSetItem(storageKey, JSON.stringify(Array.from(next))),
    [storageKey]
  );

  const toggle = useCallback(
    (id: string) => {
      const { next, isPinned } = togglePinned(pinnedIds, id);
      setPinnedIds(next);
      persist(next);
      if (isPinned) toast.success(`${noun} pinned to top.`);
      else toast.info(`${noun} unpinned.`);
    },
    [pinnedIds, persist, noun]
  );

  /** Forget a deleted item's id so it does not linger in storage. */
  const remove = useCallback(
    (id: string) => {
      const next = unpin(pinnedIds, id);
      if (next === pinnedIds) return;
      setPinnedIds(next);
      persist(next);
    },
    [pinnedIds, persist]
  );

  return { pinnedIds, toggle, remove };
}
