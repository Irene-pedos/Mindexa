"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeRemoveItem, safeSetItem } from "@/lib/safe-storage";

interface Options {
  /** localStorage key remembering the choice between visits. */
  storageKey: string;
  /** Query parameter that can preselect (and, with `writeUrl`, reflects) the choice. */
  urlParam?: string;
  writeUrl?: boolean;
  /** Takes priority over the URL and storage (for example a prop from the parent page). */
  initial?: string | null;
  /** Reject stored or URL values that are no longer valid. */
  isValid?: (value: string) => boolean;
}

/**
 * A single string choice (a tab, a selected course...) restored from, in order, an explicit
 * `initial`, the URL, then localStorage. Storage is read after mount so the first render matches
 * the server render. Changes are written back to storage and optionally the URL.
 */
export function usePersistedChoice({
  storageKey,
  urlParam,
  writeUrl = false,
  initial = null,
  isValid,
}: Options) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromUrl = urlParam ? searchParams.get(urlParam) : null;
  const accepted = (v: string | null) => (v && (!isValid || isValid(v)) ? v : null);

  const [value, setValue] = useState<string | null>(() => accepted(initial) ?? accepted(fromUrl));

  useEffect(() => {
    if (value) return;
    try {
      const saved = accepted(localStorage.getItem(storageKey));
      if (saved) setValue(saved);
    } catch {
      // storage unavailable: keep the default
    }
    // Restore once, after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = useCallback(
    (next: string | null) => {
      setValue(next);
      if (next) safeSetItem(storageKey, next);
      else safeRemoveItem(storageKey);

      if (urlParam && writeUrl) {
        const params = new URLSearchParams(window.location.search);
        if (next) params.set(urlParam, next);
        else params.delete(urlParam);
        router.replace(`?${params.toString()}`);
      }
    },
    [storageKey, urlParam, writeUrl, router]
  );

  return [value, set] as const;
}
