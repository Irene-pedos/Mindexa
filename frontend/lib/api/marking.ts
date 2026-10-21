// frontend/lib/api/marking.ts
// AI grade sample check & bulk accept (spec §9.6): before bulk-accepting AI
// suggestions the lecturer verifies a random sample of them.
import { apiClient } from "./client";

export interface SampleCheckItem {
  review_id: string;
  response_id?: string | null;
  attempt_id: string;
  question_content?: string | null;
  student_answer?: string | null;
  ai_suggested_score?: number | null;
  max_score?: number | null;
  ai_feedback_draft?: string | null;
  decision: string;
}

export interface SampleCheck {
  id: string;
  assessment_id: string;
  lecturer_id: string;
  sample_size: number;
  sampled_review_ids: string[];
  checked_count: number;
  agreement_rate: number;
  status: "PENDING" | "VERIFIED" | string;
  created_at: string;
  updated_at: string;
  items: SampleCheckItem[];
  pending_review_count: number;
}

export interface SampleCheckVerification {
  review_id: string;
  agreed: boolean;
  lecturer_score?: number | null;
  lecturer_feedback?: string | null;
}

export interface BulkAcceptResult {
  assessment_id: string;
  accepted_count: number;
  sample_check_id: string;
  agreement_rate: number;
  status: string;
}

export const markingApi = {
  getLatestSampleCheck: (assessmentId: string): Promise<SampleCheck> =>
    apiClient(`/lecturer/assessments/${assessmentId}/grading/sample-check`),

  createSampleCheck: (assessmentId: string, sampleSize?: number): Promise<SampleCheck> =>
    apiClient(`/lecturer/assessments/${assessmentId}/grading/sample-check`, {
      method: "POST",
      body: JSON.stringify(sampleSize ? { sample_size: sampleSize } : {}),
    }),

  verifySampleCheck: (
    assessmentId: string,
    sampleCheckId: string,
    verifications: SampleCheckVerification[],
  ): Promise<SampleCheck> =>
    apiClient(
      `/lecturer/assessments/${assessmentId}/grading/sample-check/${sampleCheckId}/verify`,
      { method: "POST", body: JSON.stringify({ verifications }) },
    ),

  bulkAccept: (
    assessmentId: string,
    options: { override_low_agreement?: boolean; override_reason?: string } = {},
  ): Promise<BulkAcceptResult> =>
    apiClient(`/lecturer/assessments/${assessmentId}/grading/bulk-accept`, {
      method: "POST",
      body: JSON.stringify(options),
    }),
};

/** Default agreement threshold (backend SAMPLE_CHECK_AGREEMENT_THRESHOLD). */
export const SAMPLE_AGREEMENT_THRESHOLD = 0.8;
