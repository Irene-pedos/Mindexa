import { apiClient } from "./client";

export type PendingMarksBehavior = "BLOCK" | "MANUAL_REVIEW" | "EXCLUDE";
export type NoCourseworkBehavior = "MANUAL_REVIEW" | "BLOCK" | "ALLOW";
export type ReassessmentBlockScope = "COURSE" | "ALL_COURSES";
export type FormativeScope = "PER_FORMATIVE";

export interface EligibilityPolicy {
  id: string;
  institution_id: string;
  department_id?: string | null;
  formative_exempt_pct: number;
  summative_entry_pct: number;
  summative_pass_pct: number;
  formative_scope: FormativeScope;
  reassessment_block_scope: ReassessmentBlockScope;
  pending_marks_behavior: PendingMarksBehavior;
  no_coursework_behavior: NoCourseworkBehavior;
  allow_hod_override: boolean;
}

export type EligibilityPolicyUpdate = Partial<
  Omit<EligibilityPolicy, "id" | "institution_id" | "department_id">
>;

export const eligibilityPolicyApi = {
  get: (institutionId: string): Promise<EligibilityPolicy> =>
    apiClient(`/admin/eligibility-policy?institution_id=${encodeURIComponent(institutionId)}`),

  update: (institutionId: string, body: EligibilityPolicyUpdate): Promise<EligibilityPolicy> =>
    apiClient(`/admin/eligibility-policy?institution_id=${encodeURIComponent(institutionId)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};
