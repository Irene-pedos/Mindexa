// frontend/app/lecturer/grading/types.ts
// All domain types for the grading page and its sub-components.
// Previously these were defined inline in page.tsx.

export interface GradingQueueItem {
  id: string;
  student_id: string;
  student_name: string;
  assessment_title: string;
  assessment_id: string;
  question_id: string;
  question_title: string;
  question_type: string;
  attempt_id: string;
  response_id: string;
  status:
    | "PENDING"
    | "AI_SUGGESTED"
    | "COMPLETED"
    | "UNDER_REVIEW"
    | "PENDING_RELEASE"
    | "RELEASED";
  submitted_at: string | null;
  student_answer: string | null;
  ai_suggested_score: number | null;
  ai_confidence: number | null;
  ai_grading_basis?: string | null;
  max_score?: number;
  ai_feedback_draft: string | null;
  score: number | null;
  feedback: string | null;
  is_flagged: boolean;
  integrity_risk_score: number;
  class_section_id: string;
  institution_name?: string;
  workspace_title?: string;
  /** Name of the lecturer the attempt is currently assigned to, if any. */
  assigned_to_name?: string | null;
}

export interface AttemptDetail {
  id: string;
  attempt_number: number;
  status:
    | "IN_PROGRESS"
    | "SUBMITTED"
    | "AUTO_SUBMITTED"
    | "GRADED"
    | "RELEASED";
  time_taken_seconds: number | null;
  integrity_risk_score: number;
  tab_switch_count: number;
  fullscreen_exit_count: number;
  copy_attempt_count: number;
  reconnect_count: number;
  total_integrity_warnings: number;
  warning_count: number;
  questions: AttemptQuestion[];
  integrity_hold: boolean;
  integrity_hold_reason: string | null;
}

export interface RubricLevel {
  id: string;
  title: string;
  description: string | null;
  marks: number;
  order_index: number;
}

export interface RubricCriterion {
  id: string;
  title: string;
  description: string | null;
  max_marks: number;
  order_index: number;
  levels: RubricLevel[];
}

export interface Rubric {
  id: string;
  title: string;
  criteria: RubricCriterion[];
}

export interface SubQuestion {
  id: string;
  text: string;
  marks: number;
  ai_score?: number | null;
  score?: number | null;
  student_answer?: string | null;
}

export interface AttemptQuestion {
  id: string;
  type: string;
  question_type?: string;
  text?: string;
  content?: string;
  marks: number;
  grading_mode?: string;
  caseStudyContext?: string;
  rubric?: Rubric;
  sub_questions?: SubQuestion[];
}

export interface RubricCriteria {
  id: string;
  label: string;
  max_score: number;
  descriptor?: string;
}

export interface RubricScore {
  criteria_id: string;
  score: number;
}

export interface SubmissionRecord {
  id: string;
  question_id: string;
  answer_text: string | null;
  answer_type: "TEXT" | "FILE" | "CHOICE" | "MATCH" | "ORDER";
  file_url: string | null;
  score: number | null;
  override_score: number | null;
  ai_suggested_score: number | null;
  ai_grading_basis?: string | null;
  ai_feedback_draft: string | null;
  ai_rationale?: string | null;
  ai_confidence?: number | null;
  ai_feedback_strengths?: string[] | null;
  ai_feedback_improvements?: string[] | null;
  ai_feedback_suggestions?: string[] | null;
  feedback: string | null;
  is_final: boolean;
}

export interface ClassStatRecord {
  class_id: string;
  class_name: string;
  workspace_title: string;
  total_students: number;
  submitted_count: number;
  not_submitted_count: number;
  pending_review_count: number;
  reviewed_count: number;
  released_count: number;
  latest_submission_at: string | null;
}

export interface ClassAiSummary {
  ai_generated_at: string;
  average_score: number;
  pass_rate: number;
  strong_topics: string[];
  weak_topics: string[];
  students_needing_attention: { name: string; reason: string }[];
  common_mistakes: string[];
  total_ai_graded?: number;
  pending_ai_grading?: number;
  total_ai_tokens?: number;
  total_ai_cost?: number;
  estimated_remaining_seconds?: number;
}

export interface AuditLog {
  id: string;
  change_type: string;
  created_at: string;
  created_by_id: string | null;
  created_by_name?: string | null;
  new_value: {
    override_score?: number;
    score?: number;
    feedback?: string;
    max_attempts?: number;
    passing_marks?: number;
  } | null;
  previous_value: Record<string, unknown> | null;
}

export interface AssessmentSummary {
  id: string;
  title: string;
  assessment_type: string;
  total_marks: number;
  grading_mode: string;
  window_end: string | null;
  passing_marks?: number;
  max_attempts?: number;
  is_group_assessment?: boolean;
  individual_member_scoring?: boolean;
  individual_weighting_enabled?: boolean;
  teaching_workspace_id?: string;
}

export interface QuestionSummary {
  id: string;
  question_id?: string;
  question?: {
    content?: string;
    question_type?: string;
    title?: string;
  };
}

export interface ValidationErrorDetail {
  student_id: string;
  student_name: string;
  reason_code: "UNGRADED_QUESTIONS" | "INTEGRITY_HOLD";
  count?: number;
  message: string;
}

export interface ReleaseValidationState {
  valid: boolean;
  errors: ValidationErrorDetail[];
  gradedCount: number;
  totalCount: number;
}

export interface BatchGradeItemState {
  score: string;
  feedback: string;
}

export interface AnalyticsData {
  class_average: number;
  highest_score: number;
  lowest_score: number;
  pass_rate: number;
  total_submissions: number;
  pending_submissions: number;
  released_submissions: number;
  integrity_issues_count: number;
  ai_coverage?: number;
  grade_distribution: Record<string, number>;
  question_difficulty: Array<{
    question_title: string;
    question_type: string;
    average_score: number;
    max_score: number;
    difficulty: "Easy" | "Medium" | "Hard";
  }>;
  ai_narrative: string | null;
  weak_topics?: string[];
  insights?: string[];
  recommended_interventions?: string[];
}

/** Represents a recently visited grading session stored in localStorage. */
export interface GradingHistoryItem {
  workspace: { id: string; title: string; institution_name: string };
  assessment: { id: string; title: string; assessment_type: string };
  classSection: { class_id: string; class_name: string; workspace_title: string };
}

/** AI grading details fetched for the batch review modal. */
export interface BatchReviewDetails {
  ai_grading_basis?: string | null;
  ai_feedback_draft?: string | null;
  ai_rationale?: string | null;
  rubric_scores?: Array<{
    criterion: string;
    marks_awarded: number;
    notes: string;
  }> | null;
}
