// frontend/lib/api/exam-office.ts
import { apiClient } from "./client";

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

  getPrintableUrl: (assessmentId: string): string => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
    return `${baseUrl}/exam-office/assessments/${assessmentId}/printable`;
  },

  getPrintJob: (jobId: string): Promise<PrintJob> =>
    apiClient(`/exam-office/print-jobs/${jobId}`),

  updatePrintJob: (
    jobId: string,
    data: { status: string; notes?: string }
  ): Promise<PrintJob> =>
    apiClient(`/exam-office/print-jobs/${jobId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  verifyPublicSeal: (verificationCode: string) =>
    apiClient(`/public/seals/verify/${encodeURIComponent(verificationCode)}`),
};
