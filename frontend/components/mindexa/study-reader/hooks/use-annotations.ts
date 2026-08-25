// frontend/components/mindexa/study-reader/hooks/use-annotations.ts
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  AnnotationColor,
  KeyPointConfidence,
  KeyPointTag,
  ReaderSource,
  SelectionRangeInfo,
  StudentAnnotation,
  StudentKeyPoint,
} from "../types";
import {
  CreateAnnotationPayload,
  CreateKeyPointPayload,
  studyReaderApi,
  UpdateAnnotationPayload,
  UpdateKeyPointPayload,
} from "@/lib/api/study-reader";
import { toast } from "sonner";

export function useAnnotations(source: ReaderSource) {
  const [annotations, setAnnotations] = useState<StudentAnnotation[]>([]);
  const [keyPoints, setKeyPoints] = useState<StudentKeyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState<SelectionRangeInfo | null>(null);

  // Pending delete timers ref: ID -> NodeJS.Timeout
  const pendingAnnotationDeletionsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pendingKeyPointDeletionsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Cleanup on unmount: flush pending deletions immediately to the server
  useEffect(() => {
    const pendingAnns = pendingAnnotationDeletionsRef.current;
    const pendingKps = pendingKeyPointDeletionsRef.current;
    return () => {
      pendingAnns.forEach((timer, id) => {
        clearTimeout(timer);
        studyReaderApi.deleteAnnotation(id).catch(() => {});
      });
      pendingKps.forEach((timer, id) => {
        clearTimeout(timer);
        studyReaderApi.deleteKeyPoint(id).catch(() => {});
      });
    };
  }, []);

  // Load annotations & key points from server
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [anns, kps] = await Promise.all([
        studyReaderApi.getAnnotations(source.kind, source.id).catch(() => []),
        studyReaderApi.getKeyPoints(source.kind, source.id).catch(() => []),
      ]);
      setAnnotations(anns || []);
      setKeyPoints(kps || []);
    } catch {
      // Graceful fallback for offline / mock
    } finally {
      setLoading(false);
    }
  }, [source.kind, source.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Annotations CRUD ──────────────────────────────────────────────────────

  const addAnnotation = useCallback(
    async (payload: CreateAnnotationPayload): Promise<StudentAnnotation | null> => {
      const tempId = `temp-${Date.now()}`;
      const optimisticAnnotation: StudentAnnotation = {
        id: tempId,
        source_kind: source.kind,
        source_id: source.id,
        page_number: payload.page_number,
        color: payload.color,
        selected_text: payload.selected_text,
        rects: payload.rects,
        note_text: payload.note_text,
        created_at: new Date().toISOString(),
      };

      setAnnotations((prev) => [...prev, optimisticAnnotation]);
      setSelectedRange(null);

      try {
        const saved = await studyReaderApi.createAnnotation(source.kind, source.id, payload);
        setAnnotations((prev) => prev.map((a) => (a.id === tempId ? saved : a)));
        toast.success("Highlight saved");
        return saved;
      } catch (err: any) {
        setAnnotations((prev) => prev.filter((a) => a.id !== tempId));
        toast.error(err.message || "Failed to save highlight");
        return null;
      }
    },
    [source.kind, source.id]
  );

  const updateAnnotation = useCallback(
    async (id: string, payload: UpdateAnnotationPayload) => {
      const original = annotations.find((a) => a.id === id);
      if (!original) return;

      setAnnotations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...payload, updated_at: new Date().toISOString() } : a))
      );

      try {
        const updated = await studyReaderApi.updateAnnotation(id, payload);
        setAnnotations((prev) => prev.map((a) => (a.id === id ? updated : a)));
        toast.success("Annotation updated");
      } catch {
        setAnnotations((prev) => prev.map((a) => (a.id === id ? original : a)));
        toast.error("Failed to update annotation");
      }
    },
    [annotations]
  );

  const deleteAnnotation = useCallback(
    (id: string) => {
      const original = annotations.find((a) => a.id === id);
      if (!original) return;

      // Optimistically remove from UI
      setAnnotations((prev) => prev.filter((a) => a.id !== id));

      // Cancel any existing timer for this ID
      const existingTimer = pendingAnnotationDeletionsRef.current.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Schedule network deletion after 5 seconds
      const timer = setTimeout(async () => {
        pendingAnnotationDeletionsRef.current.delete(id);
        try {
          await studyReaderApi.deleteAnnotation(id);
        } catch {
          setAnnotations((prev) => (prev.some((a) => a.id === id) ? prev : [...prev, original]));
          toast.error("Failed to delete highlight on server");
        }
      }, 5000);

      pendingAnnotationDeletionsRef.current.set(id, timer);

      // Toast with Undo action
      toast("Highlight deleted", {
        description: original.note_text ? `Note: "${original.note_text.slice(0, 35)}..."` : undefined,
        action: {
          label: "Undo",
          onClick: () => {
            const pending = pendingAnnotationDeletionsRef.current.get(id);
            if (pending) {
              clearTimeout(pending);
              pendingAnnotationDeletionsRef.current.delete(id);
            }
            setAnnotations((prev) => (prev.some((a) => a.id === id) ? prev : [...prev, original]));
            toast.success("Highlight restored");
          },
        },
        duration: 5000,
      });
    },
    [annotations]
  );

  // ── Key Points CRUD ───────────────────────────────────────────────────────

  const addKeyPoint = useCallback(
    async (payload: CreateKeyPointPayload): Promise<StudentKeyPoint | null> => {
      const tempId = `temp-kp-${Date.now()}`;
      const optimisticKeyPoint: StudentKeyPoint = {
        id: tempId,
        source_kind: source.kind,
        source_id: source.id,
        title: payload.title,
        quote: payload.quote,
        page_number: payload.page_number,
        tag: payload.tag || "other",
        confidence: payload.confidence || "got_it",
        annotation_id: payload.annotation_id,
        created_at: new Date().toISOString(),
      };

      setKeyPoints((prev) => [optimisticKeyPoint, ...prev]);

      try {
        const saved = await studyReaderApi.createKeyPoint(source.kind, source.id, payload);
        setKeyPoints((prev) => prev.map((kp) => (kp.id === tempId ? saved : kp)));
        toast.success("Key point added");
        return saved;
      } catch (err: any) {
        setKeyPoints((prev) => prev.filter((kp) => kp.id !== tempId));
        toast.error(err.message || "Failed to add key point");
        return null;
      }
    },
    [source.kind, source.id]
  );

  const updateKeyPoint = useCallback(
    async (
      id: string,
      payload: UpdateKeyPointPayload,
    ): Promise<StudentKeyPoint | null> => {
      const original = keyPoints.find((kp) => kp.id === id);
      if (!original) return null;

      setKeyPoints((prev) =>
        prev.map((kp) =>
          kp.id === id
            ? { ...kp, ...payload, updated_at: new Date().toISOString() }
            : kp,
        ),
      );

      try {
        const updated = await studyReaderApi.updateKeyPoint(id, payload);
        setKeyPoints((prev) =>
          prev.map((kp) => (kp.id === id ? updated : kp)),
        );
        return updated;
      } catch {
        setKeyPoints((prev) =>
          prev.map((kp) => (kp.id === id ? original : kp)),
        );
        toast.error("Failed to update key point");
        return null;
      }
    },
    [keyPoints],
  );

  const deleteKeyPoint = useCallback(
    (id: string) => {
      const original = keyPoints.find((kp) => kp.id === id);
      if (!original) return;

      // Optimistically remove from UI
      setKeyPoints((prev) => prev.filter((kp) => kp.id !== id));

      // Cancel any existing timer for this ID
      const existingTimer = pendingKeyPointDeletionsRef.current.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Schedule network deletion after 5 seconds
      const timer = setTimeout(async () => {
        pendingKeyPointDeletionsRef.current.delete(id);
        try {
          await studyReaderApi.deleteKeyPoint(id);
        } catch {
          setKeyPoints((prev) => (prev.some((kp) => kp.id === id) ? prev : [original, ...prev]));
          toast.error("Failed to remove key point on server");
        }
      }, 5000);

      pendingKeyPointDeletionsRef.current.set(id, timer);

      // Toast with Undo action
      toast("Key point removed", {
        description: `"${original.title.slice(0, 35)}..."`,
        action: {
          label: "Undo",
          onClick: () => {
            const pending = pendingKeyPointDeletionsRef.current.get(id);
            if (pending) {
              clearTimeout(pending);
              pendingKeyPointDeletionsRef.current.delete(id);
            }
            setKeyPoints((prev) => (prev.some((kp) => kp.id === id) ? prev : [original, ...prev]));
            toast.success("Key point restored");
          },
        },
        duration: 5000,
      });
    },
    [keyPoints]
  );

  // ── Exports & Skim ────────────────────────────────────────────────────────

  const exportRevisionSheet = useCallback(async () => {
    try {
      return await studyReaderApi.exportRevisionSheet(source.kind, source.id);
    } catch {
      toast.error("Failed to generate revision sheet");
      return null;
    }
  }, [source.kind, source.id]);

  const skimDocument = useCallback(async () => {
    try {
      return await studyReaderApi.skimDocument(source.kind, source.id);
    } catch {
      toast.error("Failed to generate document skim");
      return null;
    }
  }, [source.kind, source.id]);

  const clearSelection = useCallback(() => {
    setSelectedRange(null);
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges();
    }
  }, []);

  return {
    annotations,
    keyPoints,
    loading,
    selectedRange,
    setSelectedRange,
    clearSelection,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    addKeyPoint,
    updateKeyPoint,
    deleteKeyPoint,
    exportRevisionSheet,
    skimDocument,
    reload: loadData,
  };
}
