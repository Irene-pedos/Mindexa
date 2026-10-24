// frontend/lib/api/eligibility.ts
// Student-facing eligibility, retake and absence-excuse endpoints.
import { apiClient } from "./client";

export type RetakeStatus = "FLAGGED" | "PAYMENT_PENDING" | "PAID" | "ENROLLED" | "CANCELLED";
export type RetakeTrigger = "ENTRY_THRESHOLD_NOT_MET" | "SUMMATIVE_FAILED";
export type PaymentStatus = "PENDING" | "CONFIRMED" | "REJECTED";

export interface PaymentReference {
  id: string;
  external_reference?: string | null;
  amount_text?: string | null;
  status: PaymentStatus;
  notes?: string | null;
  created_at: string;
}

export interface RetakeRecord {
  id: string;
  course_id: string;
  course_code?: string | null;
  course_title?: string | null;
  from_period_name?: string | null;
  target_period_name?: string | null;
  trigger: RetakeTrigger;
  status: RetakeStatus;
  payment_reference?: PaymentReference | null;
  enrolled_at?: string | null;
  created_at: string;
}

export interface ReassessmentRequirement {
  id: string;
  status: string;
  original_percentage: number;
  source_assessment_title?: string | null;
  course_code?: string | null;
}

export interface StudentCourseEligibility {
  course_id: string;
  course_code: string;
  course_title: string;
  coursework_average?: number | null;
  pending_marks_count: number;
  has_coursework: boolean;
  summative_entry_eligible: boolean;
  summative_entry_reason: string;
  pending_reassessments: ReassessmentRequirement[];
  active_override: boolean;
  retake_status?: RetakeStatus | null;
}

export interface PaymentReferencePayload {
  external_reference?: string;
  amount_text?: string;
  notes?: string;
}

export type ExcuseStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "WITHDRAWN";

export interface AbsenceExcuse {
  id: string;
  assessment_id: string;
  course_id: string;
  reason: string;
  status: ExcuseStatus;
  decision_note?: string | null;
  decided_at?: string | null;
  created_at: string;
}

export const EXCUSE_REASON_MIN_LENGTH = 10;

export const eligibilityApi = {
  getCourseEligibility: (courseId: string): Promise<StudentCourseEligibility> =>
    apiClient(`/student/eligibility/courses/${courseId}`),

  listRetakes: (): Promise<RetakeRecord[]> => apiClient("/student/retakes"),

  attachRetakePayment: (retakeId: string, data: PaymentReferencePayload): Promise<RetakeRecord> =>
    apiClient(`/student/retakes/${retakeId}/payment-reference`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const excuseApi = {
  create: (data: { assessment_id: string; course_id: string; reason: string }): Promise<AbsenceExcuse> =>
    apiClient("/student/excuses", { method: "POST", body: JSON.stringify(data) }),

  listMine: async (): Promise<AbsenceExcuse[]> => {
    const res = await apiClient("/student/excuses");
    return (res as { items: AbsenceExcuse[] }).items ?? [];
  },

  withdraw: (excuseId: string): Promise<AbsenceExcuse> =>
    apiClient(`/student/excuses/${excuseId}/withdraw`, { method: "POST" }),
};
