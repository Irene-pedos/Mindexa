// frontend/components/mindexa/study-reader/hooks/use-reader-progress.ts
"use client";

import { useState, useCallback } from "react";
import { ReaderProgress, ReaderSourceKind, ZoomMode } from "../types";

const STORAGE_PREFIX = "mindexa:reader:";

function getStorageKey(kind: ReaderSourceKind, id: string): string {
  return `${STORAGE_PREFIX}${kind}:${id}`;
}

export function getStoredProgress(kind: ReaderSourceKind, id: string): ReaderProgress | null {
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
  updates: Partial<ReaderProgress>
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

export function useReaderProgress(kind: ReaderSourceKind, id: string) {
  const currentKey = `${kind}:${id}`;
  const [prevKey, setPrevKey] = useState(currentKey);
  const [progress, setProgress] = useState<ReaderProgress>(() => {
    return (
      getStoredProgress(kind, id) || {
        page: 1,
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
    setProgress(
      getStoredProgress(kind, id) || {
        page: 1,
        numPages: 1,
        zoom: 100,
        zoomMode: "fit-width",
        rotation: 0,
        twoPageView: false,
        lastReadAt: new Date().toISOString(),
      }
    );
  }

  const isLoaded = true;

  const updateProgress = useCallback(
    (updates: Partial<ReaderProgress>) => {
      setProgress((prev) => {
        const next = { ...prev, ...updates, lastReadAt: new Date().toISOString() };
        saveStoredProgress(kind, id, next);
        return next;
      });
    },
    [kind, id]
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
