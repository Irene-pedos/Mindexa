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
  ReaderLearningUnitItem,
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

export interface ReaderMetadata {
  id: string;
  kind: ReaderSourceKind;
  title: string;
  extension: string;
  mime_type: string;
  page_count?: number | null;
  processing_status: string;
  workspace_id?: string | null;
  course_code?: string | null;
  course_title?: string | null;
  version: number;
  is_current: boolean;
  latest_material_id?: string | null;
}

export const studyReaderApi = {
  getMetadata: async (kind: ReaderSourceKind, id: string): Promise<ReaderMetadata> => {
    return apiClient(`/student/reader/${kind}/${id}`);
  },

  getLearningUnits: async (
    kind: ReaderSourceKind,
    id: string
  ): Promise<ReaderLearningUnitItem[]> => {
    return apiClient(`/student/reader/${kind}/${id}/learning-units`);
  },

  getProgress: async (kind: ReaderSourceKind, id: string) => {
    return apiClient(`/student/reader/${kind}/${id}/progress`);
  },

  saveProgress: async (
    kind: ReaderSourceKind,
    id: string,
    data: {
      last_page: number;
      last_scale?: number;
      rotation?: number;
      zoom_mode?: string;
      two_page_view?: boolean;
      furthest_page_reached?: number;
      page_count_seen?: number;
    }
  ) => {
    return apiClient(`/student/reader/${kind}/${id}/progress`, {
      method: "PUT",
      body: JSON.stringify({
        last_page: data.last_page,
        last_scale: data.last_scale ?? 100.0,
        rotation: data.rotation ?? 0,
        zoom_mode: data.zoom_mode ?? "fit-width",
        two_page_view: Boolean(data.two_page_view),
        furthest_page_reached: data.furthest_page_reached ?? data.page_count_seen ?? data.last_page,
        page_count_seen: data.page_count_seen ?? data.furthest_page_reached ?? data.last_page,
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
