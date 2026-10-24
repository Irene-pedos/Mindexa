// frontend/lib/api/exam-office.ts
import { apiClient, getToken, resolveApiUrl } from "./client";

export interface ExamOfficeQueueItem {
  assessment_id: string;
  title: string;
  status: string;
  course_id: string;
  seal?: {
    id: string;
    verification_code: string;
    sealed_at: string;
    is_active: boolean;
  } | null;
  print_job?: {
    id: string;
    copies_total: number;
    spare_percent: number;
    status: string;
    enrolled_count: number;
    printed_at?: string | null;
  } | null;
}

export interface SealAssessmentResponse {
  assessment_id: string;
  seal_id: string;
  verification_code: string;
  status: string;
  copies_total: number;
  print_job_id: string;
}

export interface RevokeSealResponse {
  assessment_id: string;
  seal_id: string;
  revoked_at: string;
  revoke_reason: string;
  status: string;
}

export interface PrintJob {
  id: string;
  assessment_id: string;
  seal_id: string;
  enrolled_count: number;
  spare_percent: number;
  copies_total: number;
  status: string;
  handled_by_id?: string | null;
  printed_at?: string | null;
  stored_at?: string | null;
  distributed_at?: string | null;
  notes?: string | null;
  created_at: string;
}

export type ExamDocumentType = "paper" | "marking-scheme" | "moderation-form";

/** Print job lifecycle, in order (backend PrintJobStatus). */
export const PRINT_JOB_FLOW = ["REQUESTED", "PRINTED", "STORED", "DISTRIBUTED"] as const;

export const examOfficeApi = {
  getExamOfficeQueue: (status?: string): Promise<ExamOfficeQueueItem[]> => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return apiClient(`/exam-office/queue${query}`);
  },

  sealAssessment: (
    assessmentId: string,
    data?: { spare_percent?: number; notes?: string }
  ): Promise<SealAssessmentResponse> =>
    apiClient(`/exam-office/assessments/${assessmentId}/seal`, {
      method: "POST",
      body: JSON.stringify({
        spare_percent: data?.spare_percent ?? 5,
        notes: data?.notes || null,
      }),
    }),

  revokeSeal: (
    assessmentId: string,
    reason: string
  ): Promise<RevokeSealResponse> =>
    apiClient(`/exam-office/assessments/${assessmentId}/seal/revoke`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  /**
   * Download a generated DOCX (paper, marking scheme or moderation form).
   * The endpoint needs the bearer token, so this fetches a blob rather than
   * linking to the URL.
   */
  downloadDocument: async (
    assessmentId: string,
    documentType: ExamDocumentType,
    fallbackName: string,
  ): Promise<void> => {
    const token = getToken();
    if (!token) throw new Error("Authentication required");

    const response = await fetch(
      `${resolveApiUrl()}/assessments/${assessmentId}/documents/${documentType}`,
      { headers: { Authorization: `Bearer ${token}` }, credentials: "include" },
    );
    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body?.detail?.message || body?.detail || body?.message || "";
      } catch {
        // not JSON
      }
      throw new Error(typeof detail === "string" && detail ? detail : "Could not download the document");
    }

    const disposition = response.headers.get("Content-Disposition") || "";
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    const filename = match?.[1] || fallbackName;

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  updatePrintJob: (
    jobId: string,
    data: { status: string; notes?: string }
  ): Promise<PrintJob> =>
    apiClient(`/exam-office/print-jobs/${jobId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  verifyPublicSeal: (verificationCode: string) =>
    apiClient(`/public/verify-seal/${encodeURIComponent(verificationCode)}`, { requireAuth: false }),
};
