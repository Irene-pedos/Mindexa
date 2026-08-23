// frontend/lib/api/study-reader.ts
import { apiClient } from "./client";
import {
  AnnotationColor,
  ExamLensResponse,
  FocusResponse,
  KeyPointConfidence,
  KeyPointTag,
  NormalizedRect,
  PageCheckAnswerItem,
  PageCheckResponse,
  PageCheckSubmitResponse,
  ReaderSourceKind,
  RevisionSheetExport,
  SkimResponse,
  StudentAnnotation,
  StudentKeyPoint,
} from "@/components/mindexa/study-reader/types";

export interface CreateAnnotationPayload {
  page_number: number;
  color: AnnotationColor;
  selected_text: string;
  rects: NormalizedRect[];
  note_text?: string | null;
}

export interface UpdateAnnotationPayload {
  color?: AnnotationColor;
  note_text?: string | null;
}

export interface CreateKeyPointPayload {
  title: string;
  quote?: string | null;
  page_number: number;
  tag?: KeyPointTag;
  confidence?: KeyPointConfidence;
  annotation_id?: string | null;
  next_review_at?: string | null;
}

export interface UpdateKeyPointPayload {
  title?: string;
  quote?: string | null;
  page_number?: number;
  tag?: KeyPointTag;
  confidence?: KeyPointConfidence;
  next_review_at?: string | null;
}

export interface AskAIReaderPayload {
  question: string;
  conversation_history?: Array<{ role: string; content: string }>;
  selected_resource_id?: string;
  teaching_workspace_id?: string;
  current_page?: number;
  selected_text?: string;
  thinking_mode?: boolean;
  deep_search_mode?: boolean;
}

export interface AskAIReaderResponse {
  explanation: string;
  citations: Array<{
    resource_id?: string;
    source_name?: string;
    page_number?: number;
    chunk_index?: number;
    score?: number;
    matched_text?: string;
  }>;
  fallback_used: boolean;
  model?: string;
  provider?: string;
}

export const studyReaderApi = {
  getMetadata: async (kind: ReaderSourceKind, id: string) => {
    return apiClient(`/student/reader/${kind}/${id}`);
  },

  getProgress: async (kind: ReaderSourceKind, id: string) => {
    return apiClient(`/student/reader/${kind}/${id}/progress`);
  },

  saveProgress: async (
    kind: ReaderSourceKind,
    id: string,
    data: { last_page: number; last_scale?: number; page_count_seen?: number }
  ) => {
    return apiClient(`/student/reader/${kind}/${id}/progress`, {
      method: "PUT",
      body: JSON.stringify({
        last_page: data.last_page,
        last_scale: data.last_scale ?? 100.0,
        page_count_seen: data.page_count_seen ?? 1,
      }),
    });
  },

  getAnnotations: async (
    kind: ReaderSourceKind,
    id: string
  ): Promise<StudentAnnotation[]> => {
    return apiClient(`/student/reader/${kind}/${id}/annotations`);
  },

  createAnnotation: async (
    kind: ReaderSourceKind,
    id: string,
    payload: CreateAnnotationPayload
  ): Promise<StudentAnnotation> => {
    return apiClient(`/student/reader/${kind}/${id}/annotations`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateAnnotation: async (
    annotationId: string,
    payload: UpdateAnnotationPayload
  ): Promise<StudentAnnotation> => {
    return apiClient(`/student/reader/annotations/${annotationId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deleteAnnotation: async (annotationId: string): Promise<void> => {
    return apiClient(`/student/reader/annotations/${annotationId}`, {
      method: "DELETE",
    });
  },

  getKeyPoints: async (
    kind: ReaderSourceKind,
    id: string
  ): Promise<StudentKeyPoint[]> => {
    return apiClient(`/student/reader/${kind}/${id}/key-points`);
  },

  createKeyPoint: async (
    kind: ReaderSourceKind,
    id: string,
    payload: CreateKeyPointPayload
  ): Promise<StudentKeyPoint> => {
    return apiClient(`/student/reader/${kind}/${id}/key-points`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateKeyPoint: async (
    keyPointId: string,
    payload: UpdateKeyPointPayload
  ): Promise<StudentKeyPoint> => {
    return apiClient(`/student/reader/key-points/${keyPointId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deleteKeyPoint: async (keyPointId: string): Promise<void> => {
    return apiClient(`/student/reader/key-points/${keyPointId}`, {
      method: "DELETE",
    });
  },

  exportRevisionSheet: async (
    kind: ReaderSourceKind,
    id: string
  ): Promise<RevisionSheetExport> => {
    return apiClient(`/student/reader/${kind}/${id}/export`);
  },

  skimDocument: async (
    kind: ReaderSourceKind,
    id: string
  ): Promise<SkimResponse> => {
    return apiClient(`/student/reader/${kind}/${id}/skim`, {
      method: "POST",
    });
  },

  askAI: async (payload: AskAIReaderPayload): Promise<AskAIReaderResponse> => {
    return apiClient("/student/ai/support", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ── Phase 3: Focus & Weakness Engine ─────────────────────────────────────

  getFocus: async (
    kind: ReaderSourceKind,
    id: string
  ): Promise<FocusResponse> => {
    return apiClient(`/student/reader/${kind}/${id}/focus`);
  },

  generatePageCheck: async (
    kind: ReaderSourceKind,
    id: string,
    payload: { page_number: number; selected_text?: string }
  ): Promise<PageCheckResponse> => {
    return apiClient(`/student/reader/${kind}/${id}/page-check`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  submitPageCheck: async (
    kind: ReaderSourceKind,
    id: string,
    payload: { page_number: number; answers: PageCheckAnswerItem[] }
  ): Promise<PageCheckSubmitResponse> => {
    return apiClient(`/student/reader/${kind}/${id}/page-check/submit`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getExamLens: async (
    kind: ReaderSourceKind,
    id: string,
    assessmentId: string
  ): Promise<ExamLensResponse> => {
    return apiClient(
      `/student/reader/${kind}/${id}/exam-lens?assessment_id=${assessmentId}`
    );
  },
};
