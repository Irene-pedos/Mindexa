// frontend/lib/api/assessment.ts
import { apiClient } from "./client";

export interface AssessmentConfig {
  title: string;
  description?: string;
  instructions?: string;
  assessment_type: string;
  teaching_workspace_id?: string;
  total_marks: number;
  passing_marks?: number;
  duration_minutes?: number;
  window_start?: string;
  window_end?: string;
  grading_mode: string;
  result_release_mode: string;
  is_password_protected?: boolean;
  access_password?: string;
  
  // Security & Environment Fields
  is_supervised?: boolean;
  fullscreen_required?: boolean;
  allow_resume?: boolean;
  ai_assistance_allowed?: boolean;
  is_open_book?: boolean;
  integrity_monitoring_enabled?: boolean;
  integrity_profile_id?: string;

  // Group Work Fields
  is_group_assessment?: boolean;
  max_group_size?: number;
  group_assignment_mode?: "MANUAL" | "AUTOMATIC";
  question_distribution_mode?: "SHARED" | "PER_GROUP";
  require_all_member_approval?: boolean;
  require_all_member_participation?: boolean;
  appeal_window_days?: number;
}

/** One row of the student's assessment list (`GET /assessments` as a student). */
export interface StudentAssessment {
  id: string;
  title: string;
  assessment_type: string;
  status: string;
  total_marks: number;
  duration_minutes: number | null;
  window_start: string | null;
  window_end: string | null;
  max_attempts: number;
  attempts_used: number;
  result_release_mode?: string | null;
  is_group_assessment: boolean;
  teaching_workspace_id?: string | null;
  course_name?: string | null;
  course_code?: string | null;
  subject?: string | null;
  student_status?: string | null;
  student_attempt_id?: string | null;
  student_attempt_expires_at?: string | null;
  is_password_protected: boolean;
  ai_assistance_allowed: boolean;
  is_open_book: boolean;
  late_submission_allowed: boolean;
  is_supervised: boolean;
  integrity_monitoring_enabled: boolean;
  fullscreen_required: boolean;
  allow_resume: boolean;
  /** Set when an eligibility rule currently stops this student from starting. */
  blocked_reason?: string | null;
}

export interface StudentAssessmentPage {
  items: StudentAssessment[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
}

export interface MarksSummary {
  assessment_id: string;
  required_marks: number;
  max_possible_score: number;
  configured_total_marks: number;
  /** What the institution requires a SUMMATIVE paper to total; null when no policy applies */
  policy_total: number | null;
  /** Whether the institution requires (BLOCKING), advises (WARNING) or ignores (OFF) that total */
  policy_total_mode?: "BLOCKING" | "WARNING" | "OFF";
  is_summative: boolean;
  is_valid_structure: boolean;
  hard_violations: Array<{ code: string; message: string; is_blocking: boolean }>;
  soft_warnings: Array<{ code: string; message: string; is_blocking: boolean }>;
}

export const assessmentApi = {
  getAssessments: (params?: Record<string, any>) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, value.toString());
        }
      });
    }
    const queryString = query.toString();
    return apiClient(queryString ? `/assessments?${queryString}` : "/assessments");
  },
  
  /** Every assessment the signed-in student can see, fetched page by page (the server caps a page at 100). */
  getAllStudentAssessments: async (): Promise<StudentAssessment[]> => {
    const items: StudentAssessment[] = [];
    for (let page = 1; page <= 10; page++) {
      const data: StudentAssessmentPage = await apiClient(`/assessments?page=${page}&page_size=100`);
      items.push(...data.items);
      if (!data.has_next) break;
    }
    return items;
  },

  getAssessmentById: (id: string) => apiClient(`/assessments/${id}`),
  
  getAssessmentQuestions: (id: string) => apiClient(`/assessments/${id}/questions`),

  /** Required marks vs the institution's policy total, available before submitting. */
  getMarksSummary: (id: string): Promise<MarksSummary> =>
    apiClient(`/assessments/${id}/marks-summary`),
  
  createAssessment: (data: AssessmentConfig) => 
    apiClient("/assessments", { 
      method: "POST", 
      body: JSON.stringify(data) 
    }),
    
  updateAssessment: (id: string, data: Partial<AssessmentConfig> & { draft_step?: number }) => 
    apiClient(`/assessments/${id}`, { 
      method: "PUT", 
      body: JSON.stringify(data) 
    }),
    
  deleteAssessment: (id: string) => 
    apiClient(`/assessments/${id}`, { method: "DELETE" }),
    
  /**
   * Publish. The server answers 200 even when publishing is refused: check
   * `validation_passed` / `errors` — a resolved call does not mean "published".
   */
  finalizeAssessment: (id: string): Promise<FinalizeResult> =>
    apiClient(`/assessments/${id}/finalize`, { method: "POST" }),

  /** Audited edit of an approved / sealed / published assessment (reason ≥ 10 chars). */
  postApprovalEdit: (id: string, data: PostApprovalEditPayload) =>
    apiClient(`/lecturer/assessments/${id}/post-approval-edit`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export interface FinalizeResult {
  id: string;
  title: string;
  status: string;
  is_finalized: boolean;
  finalized_at: string | null;
  validation_passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface PostApprovalEditPayload {
  reason: string;
  reprint_required?: boolean;
  title?: string;
  instructions?: string;
  duration_minutes?: number;
  window_start?: string;
  window_end?: string;
  notice_banner?: string;
}

/** Statuses in which the full authoring wizard may change content. */
export const EDITABLE_STATUSES = ["DRAFT", "CHANGES_REQUESTED"] as const;
/** Statuses that need the audited post-approval edit instead. */
export const POST_APPROVAL_STATUSES = ["APPROVED", "SEALED", "PUBLISHED"] as const;
