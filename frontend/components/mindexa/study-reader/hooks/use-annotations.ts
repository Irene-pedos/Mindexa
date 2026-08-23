// frontend/components/mindexa/study-reader/hooks/use-annotations.ts
"use client";

import { useState, useEffect, useCallback } from "react";
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
    async (id: string) => {
      const original = annotations.find((a) => a.id === id);
      if (!original) return;

      setAnnotations((prev) => prev.filter((a) => a.id !== id));

      try {
        await studyReaderApi.deleteAnnotation(id);
        toast.info("Highlight deleted");
      } catch {
        setAnnotations((prev) => [...prev, original]);
        toast.error("Failed to delete highlight");
      }
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
    async (id: string, payload: UpdateKeyPointPayload) => {
      const original = keyPoints.find((kp) => kp.id === id);
      if (!original) return;

      setKeyPoints((prev) =>
        prev.map((kp) => (kp.id === id ? { ...kp, ...payload, updated_at: new Date().toISOString() } : kp))
      );

      try {
        const updated = await studyReaderApi.updateKeyPoint(id, payload);
        setKeyPoints((prev) => prev.map((kp) => (kp.id === id ? updated : kp)));
      } catch {
        setKeyPoints((prev) => prev.map((kp) => (kp.id === id ? original : kp)));
        toast.error("Failed to update key point");
      }
    },
    [keyPoints]
  );

  const deleteKeyPoint = useCallback(
    async (id: string) => {
      const original = keyPoints.find((kp) => kp.id === id);
      if (!original) return;

      setKeyPoints((prev) => prev.filter((kp) => kp.id !== id));

      try {
        await studyReaderApi.deleteKeyPoint(id);
        toast.info("Key point removed");
      } catch {
        setKeyPoints((prev) => [...prev, original]);
        toast.error("Failed to remove key point");
      }
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
