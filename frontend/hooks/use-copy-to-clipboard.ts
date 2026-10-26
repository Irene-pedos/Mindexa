"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Copy text and remember which control did it for a moment, so that control can show "Copied".
 * Reports failure instead of claiming success (the clipboard API is missing on insecure origins
 * and when permission is denied).
 */
export function useCopyToClipboard(resetAfterMs = 2000) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback(
    async (text: string, id: string, successMessage = "Copied to clipboard!") => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        toast.error("Couldn't copy to the clipboard.");
        return false;
      }
      setCopiedId(id);
      toast.success(successMessage);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiedId(null), resetAfterMs);
      return true;
    },
    [resetAfterMs]
  );

  return { copiedId, copy };
}
