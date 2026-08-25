// frontend/components/mindexa/study-reader/hooks/use-reader-progress.ts
"use client";

import { useState, useCallback, useEffect } from "react";
import { ReaderProgress, ReaderSourceKind, ZoomMode } from "../types";
import { studyReaderApi } from "@/lib/api/study-reader";

const STORAGE_PREFIX = "mindexa:reader:";

function getStorageKey(kind: ReaderSourceKind, id: string): string {
  return `${STORAGE_PREFIX}${kind}:${id}`;
}

export function getStoredProgress(
  kind: ReaderSourceKind,
  id: string,
): ReaderProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getStorageKey(kind, id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      page: typeof parsed.page === "number" ? Math.max(1, parsed.page) : 1,
      numPages: typeof parsed.numPages === "number" ? parsed.numPages : 1,
      zoom: typeof parsed.zoom === "number" ? parsed.zoom : 100,
      zoomMode: (parsed.zoomMode as ZoomMode) || "fit-width",
      rotation: typeof parsed.rotation === "number" ? parsed.rotation : 0,
      twoPageView: Boolean(parsed.twoPageView),
      lastReadAt: parsed.lastReadAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveStoredProgress(
  kind: ReaderSourceKind,
  id: string,
  updates: Partial<ReaderProgress>,
): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getStoredProgress(kind, id) || {
      page: 1,
      numPages: 1,
      zoom: 100,
      zoomMode: "fit-width" as ZoomMode,
      rotation: 0,
      twoPageView: false,
      lastReadAt: new Date().toISOString(),
    };

    const merged: ReaderProgress = {
      ...existing,
      ...updates,
      lastReadAt: new Date().toISOString(),
    };

    localStorage.setItem(getStorageKey(kind, id), JSON.stringify(merged));
  } catch {
    // Ignore quota or local storage errors
  }
}

export function clearStoredProgress(kind: ReaderSourceKind, id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(getStorageKey(kind, id));
  } catch {
    // Ignore
  }
}

export function useReaderProgress(
  kind: ReaderSourceKind,
  id: string,
  initialPageParam?: number | null,
) {
  const currentKey = `${kind}:${id}:${initialPageParam || "default"}`;
  const [prevKey, setPrevKey] = useState(currentKey);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [progress, setProgress] = useState<ReaderProgress>(() => {
    const stored = getStoredProgress(kind, id);
    const resolvedPage =
      typeof initialPageParam === "number" && initialPageParam >= 1
        ? initialPageParam
        : stored?.page || 1;

    return (
      stored
        ? { ...stored, page: resolvedPage }
        : {
            page: resolvedPage,
            numPages: 1,
            zoom: 100,
            zoomMode: "fit-width",
            rotation: 0,
            twoPageView: false,
            lastReadAt: new Date().toISOString(),
          }
    );
  });

  // Adjust state during render if kind or id changes (React recommended pattern)
  if (prevKey !== currentKey) {
    setPrevKey(currentKey);
    setIsLoaded(false);
    const stored = getStoredProgress(kind, id);
    const resolvedPage =
      typeof initialPageParam === "number" && initialPageParam >= 1
        ? initialPageParam
        : stored?.page || 1;

    setProgress(
      stored
        ? { ...stored, page: resolvedPage }
        : {
            page: resolvedPage,
            numPages: 1,
            zoom: 100,
            zoomMode: "fit-width",
            rotation: 0,
            twoPageView: false,
            lastReadAt: new Date().toISOString(),
          },
    );
  }

  // Fetch remote progress from server on mount for cross-device continuity
  useEffect(() => {
    let mounted = true;
    studyReaderApi
      .getProgress(kind, id)
      .then((remote: any) => {
        if (mounted && remote) {
          setProgress((prev) => {
            const resolvedPage =
              typeof initialPageParam === "number" && initialPageParam >= 1
                ? initialPageParam
                : typeof remote.last_page === "number"
                  ? Math.max(1, remote.last_page)
                  : prev.page;
            const serverZoom =
              typeof remote.last_scale === "number"
                ? remote.last_scale
                : prev.zoom;
            const serverRotation =
              typeof remote.rotation === "number"
                ? remote.rotation
                : prev.rotation;
            const serverZoomMode =
              (remote.zoom_mode as ZoomMode) || prev.zoomMode;
            const serverTwoPage =
              remote.two_page_view !== undefined
                ? Boolean(remote.two_page_view)
                : prev.twoPageView;

            const reconciled: ReaderProgress = {
              ...prev,
              page: resolvedPage,
              zoom: serverZoom,
              zoomMode: serverZoomMode,
              rotation: serverRotation,
              twoPageView: serverTwoPage,
              lastReadAt: remote.updated_at || new Date().toISOString(),
            };

            saveStoredProgress(kind, id, reconciled);
            return reconciled;
          });
        }
      })
      .catch(() => {
        // Fallback gracefully to localStorage state if offline or network error
      })
      .finally(() => {
        if (mounted) {
          setIsLoaded(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [kind, id, initialPageParam]);

  const updateProgress = useCallback(
    (updates: Partial<ReaderProgress>) => {
      setProgress((prev) => {
        const next = {
          ...prev,
          ...updates,
          lastReadAt: new Date().toISOString(),
        };
        saveStoredProgress(kind, id, next);
        return next;
      });
    },
    [kind, id],
  );

  const clear = useCallback(() => {
    clearStoredProgress(kind, id);
    setProgress({
      page: 1,
      numPages: 1,
      zoom: 100,
      zoomMode: "fit-width",
      rotation: 0,
      twoPageView: false,
      lastReadAt: new Date().toISOString(),
    });
  }, [kind, id]);

  return {
    progress,
    updateProgress,
    clearProgress: clear,
    isLoaded,
  };
}

