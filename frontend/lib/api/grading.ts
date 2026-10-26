import { apiClient, buildQueryString } from "./client";

export interface RubricScoreInput {
  criterion_id?: string;
  score?: number;
  comment?: string;
}

export interface GradeSavePayload {
  /** Awarded score; `override_score` is accepted as an alias. */
  score?: number;
  override_score?: number;
  feedback?: string;
  internal_notes?: string;
  rubric_scores?: RubricScoreInput[];
  /** false = draft (never locks the grade). Defaults to true. */
  is_final?: boolean;
  /** true only when the lecturer explicitly accepts the AI suggestion. */
  accept_ai_suggestion?: boolean;
  review_started_at?: string;
  review_duration_seconds?: number;
}

export interface GradingActivity {
  latest_submission_at: string | null;
  submitted_count: number;
  pending_count: number;
}

export interface GradingOverview {
  assessments: (GradingActivity & { assessment_id: string; workspace_id: string | null })[];
  workspaces: (GradingActivity & { workspace_id: string })[];
}

export interface GradingConsistency {
  similar_answers: {
    attempt_id: string;
    label: string;
    similarity: number;
    score: number;
    max_score: number;
  }[];
  bias: { samples: number; mean_diff_ratio: number } | null;
}

export interface GradeCheck {
  verdict: "AGREE" | "REVIEW" | "DISAGREE";
  expected_min: number;
  expected_max: number;
  issues: { type: string; message: string; evidence_quote: string | null }[];
  suggested_feedback: string | null;
  confidence: number;
}

export interface AttemptReviewQuestion {
  question_id: string;
  response_id: string | null;
  number: number;
  question_text: string;
  score: number | null;
  max_score: number;
  is_final: boolean;
  status: "CHECKED" | "NOT_GRADED" | "SKIPPED" | "NOT_CHECKED";
  check: GradeCheck | null;
}

export interface AttemptReview {
  questions: AttemptReviewQuestion[];
  agree_count: number;
  review_count: number;
  disagree_count: number;
  not_graded_count: number;
  unreviewed_ai_question_ids: string[];
  overall_notes: string[];
  truncated: boolean;
}

export const gradingApi = {
  /** AI second-marker review of every saved open-ended grade in an attempt. */
  reviewAttempt: (attemptId: string): Promise<AttemptReview> =>
    apiClient(`/grading/attempt/${attemptId}/review-attempt`, { method: "POST" }),
  /** AI second-marker review of the grade as typed. Advisory; saves nothing. */
  reviewGrade: (
    responseId: string,
    body: { score: number; feedback?: string; rubric_scores?: unknown[] },
  ): Promise<GradeCheck> =>
    apiClient(`/grading/response/${responseId}/review-grade`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** Already-graded answers similar to this one, plus the lecturer's drift vs the AI. */
  getConsistency: (responseId: string): Promise<GradingConsistency> =>
    apiClient(`/grading/response/${responseId}/consistency`),
  /** Latest-submission activity per workspace/assessment, used to order the pickers. */
  getOverview: (): Promise<GradingOverview> => apiClient(`/grading/overview`),
  /** Re-queues submitted attempts that never reached the grading queue. */
  resyncAssessment: (
    assessmentId: string,
  ): Promise<{ checked: number; repaired: number }> =>
    apiClient(`/grading/assessment/${assessmentId}/resync`, { method: "POST" }),
  getGradingQueue: (params: Record<string, string | number | boolean>) =>
    apiClient(`/grading/queue${buildQueryString(params)}`),
  getGroupGradingQueue: (params: Record<string, string | number | boolean>) =>
    apiClient(`/grading/group-queue${buildQueryString(params)}`),
  getGroupSubmissionWorkspace: (submissionId: string) => apiClient(`/grading/group-submission/${submissionId}`),
  getGradeDetail: (responseId: string) => apiClient(`/grading/response/${responseId}`),
  saveGrade: (responseId: string, data: GradeSavePayload) => {
    const { accept_ai_suggestion, override_score, score, ...rest } = data;
    const value = score ?? override_score;
    const isFinal = rest.is_final ?? true;

    // /confirm-ai always locks the grade, so it is only used for an explicit,
    // final acceptance of the AI suggestion. Drafts and every other save go to
    // /manual, which honours is_final.
    if (accept_ai_suggestion === true && isFinal) {
      return apiClient(`/grading/confirm-ai`, {
        method: "POST",
        body: JSON.stringify({
          response_id: responseId,
          ...rest,
          accept_ai_suggestion: true,
          override_score: value,
        }),
      });
    }
    if (value === undefined) {
      return Promise.reject(new Error("A score is required to save a grade."));
    }
    return apiClient(`/grading/manual`, {
      method: "POST",
      body: JSON.stringify({
        response_id: responseId,
        ...rest,
        is_final: isFinal,
        score: value,
      }),
    });
  },
  getModerationStats: (questionId: string) => apiClient(`/grading/moderation/${questionId}`),
  moderateGrade: (data: Record<string, unknown>) => apiClient(`/grading/moderate`, {
    method: "POST",
    body: JSON.stringify(data)
  }),
  getAssessmentClassStats: (assessmentId: string) => 
    apiClient(`/grading/assessment/${assessmentId}/stats/classes`),
  getClassAiSummary: (assessmentId: string, classId: string) => 
    apiClient(`/grading/assessment/${assessmentId}/class/${classId}/ai-summary`),
  getAssessmentAnalytics: (assessmentId: string, classSectionId?: string, regenerate?: boolean) => {
    const params: Record<string, unknown> = {};
    if (classSectionId && classSectionId !== "all") {
      params.class_section_id = classSectionId;
    }
    if (regenerate) {
      params.regenerate = "true";
    }
    return apiClient(`/analytics/assessment/${assessmentId}/ai-insights${buildQueryString(params)}`);
  },
  verifyAttemptGrades: (attemptId: string) => 
    apiClient(`/grading/attempt/${attemptId}/verify`),
  suggestChanges: (responseId: string, feedback: string) => 
    apiClient(`/grading/response/${responseId}/suggest-changes`, {
      method: "POST",
      body: JSON.stringify({ feedback }),
    }),
};
