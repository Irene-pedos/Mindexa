// frontend/lib/api/moderation.ts
import { apiClient } from "./client";

export interface ModeratorQueueItem {
  review_id: string;
  assessment_id: string;
  assessment_title: string;
  round_no: number;
  review_status: string;
  assessment_status: string;
  reviewer_id?: string | null;
  started_at?: string | null;
  claimed_at?: string | null;
}

export interface ModerationComment {
  id: string;
  review_id: string;
  target_type: "ASSESSMENT" | "SECTION" | "QUESTION";
  target_id?: string | null;
  category: "GENERAL" | "SYLLABUS_ALIGNMENT" | "DIFFICULTY" | "CLARITY" | "MARKING_SCHEME";
  comment: string;
  resolved: boolean;
  resolved_at?: string | null;
  created_at: string;
}

export interface ChecklistItem {
  code: string;
  severity: string;
  passed: boolean;
  message: string;
  details?: Record<string, any>;
}

export interface ChecklistResult {
  items: ChecklistItem[];
  has_blocking_failures: boolean;
  warnings_count: number;
}

export interface ModerationOverview {
  assessment_id: string;
  status: string;
  latest_version_no: number;
  rounds: Array<{
    id: string;
    round_no: number;
    reviewer_id?: string | null;
    status: string;
    decision_note?: string | null;
    started_at: string;
    claimed_at?: string | null;
    decided_at?: string | null;
    checklist_result?: {
      items?: ChecklistItem[];
      has_blocking_failures?: boolean;
      warnings_count?: number;
    } | null;
    comments?: ModerationComment[];
  }>;
}

export const moderationApi = {
  getModeratorQueue: (status?: string): Promise<ModeratorQueueItem[]> => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return apiClient(`/moderator/queue${query}`);
  },

  claimReview: (reviewId: string) =>
    apiClient(`/moderator/reviews/${reviewId}/claim`, { method: "POST" }),

  addComment: (
    reviewId: string,
    data: {
      category: "GENERAL" | "SYLLABUS_ALIGNMENT" | "DIFFICULTY" | "CLARITY" | "MARKING_SCHEME";
      comment: string;
      target_type?: "ASSESSMENT" | "SECTION" | "QUESTION";
      target_id?: string;
    }
  ): Promise<ModerationComment> =>
    apiClient(`/moderator/reviews/${reviewId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        target_type: data.target_type || "ASSESSMENT",
        target_id: data.target_id || null,
        category: data.category,
        comment: data.comment,
      }),
    }),

  requestChanges: (reviewId: string, decisionNote: string) =>
    apiClient(`/moderator/reviews/${reviewId}/request-changes`, {
      method: "POST",
      body: JSON.stringify({ decision_note: decisionNote }),
    }),

  approveReview: (
    reviewId: string,
    decisionNote?: string,
    acknowledgeWarnings: boolean = true
  ) =>
    apiClient(`/moderator/reviews/${reviewId}/approve`, {
      method: "POST",
      body: JSON.stringify({
        decision_note: decisionNote || null,
        acknowledge_warnings: acknowledgeWarnings,
      }),
    }),

  getAssessmentModeration: (assessmentId: string): Promise<ModerationOverview> =>
    apiClient(`/lecturer/assessments/${assessmentId}/moderation`),

  runChecklist: (assessmentId: string, runAi: boolean = false) =>
    apiClient(`/lecturer/assessments/${assessmentId}/moderation/checklist`, {
      method: "POST",
      body: JSON.stringify({ run_ai_review: runAi }),
    }),

  submitForModeration: (assessmentId: string, runAi: boolean = false) =>
    apiClient(`/lecturer/assessments/${assessmentId}/moderation/submit`, {
      method: "POST",
      body: JSON.stringify({ run_ai_review: runAi }),
    }),

  resubmitForModeration: (
    assessmentId: string,
    reason?: string,
    runAi: boolean = false
  ) =>
    apiClient(`/lecturer/assessments/${assessmentId}/moderation/resubmit`, {
      method: "POST",
      body: JSON.stringify({ reason: reason || null, run_ai_review: runAi }),
    }),

  resolveComment: (commentId: string) =>
    apiClient(`/lecturer/moderation/comments/${commentId}/resolve`, {
      method: "POST",
    }),
};
