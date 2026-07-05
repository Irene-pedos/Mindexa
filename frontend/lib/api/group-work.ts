// frontend/lib/api/group-work.ts
import { apiClient } from "./client";

export interface GroupMemberInput {
  student_id: string;
  group_role?: string;
  is_leader?: boolean;
}

export interface ManualGroupInput {
  name: string;
  max_members?: number;
  members: GroupMemberInput[];
}

export interface AutoGenerateGroupsRequest {
  max_group_size: number;
  allow_smaller_final_group: boolean;
  naming_pattern: string;
}

export interface GroupCsvRow {
  student_id: string;
  group_name: string;
  group_role?: string;
  is_leader?: boolean;
}

export interface SaveGroupAnswerRequest {
  answer_content?: any;
  notes_content?: any;
  change_source?: "manual_edit" | "autosave" | "paste" | "imported_note";
}

export interface ResolveGroupAppealRequest {
  approve: boolean;
  decision: string;
  feedback?: string;
}

export const groupWorkApi = {
  // LECTURER: GROUP MANAGEMENT
  autoGenerateGroups: (assessmentId: string, data: AutoGenerateGroupsRequest) =>
    apiClient(`/group-work/assessments/${assessmentId}/groups/auto-generate`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  importGroupsCsv: (assessmentId: string, rows: GroupCsvRow[]) =>
    apiClient(`/group-work/assessments/${assessmentId}/groups/import-csv`, {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),

  saveManualGroups: (assessmentId: string, groups: ManualGroupInput[]) =>
    apiClient(`/group-work/assessments/${assessmentId}/groups/save-manual`, {
      method: "POST",
      body: JSON.stringify({ groups }),
    }),

  getGroups: (assessmentId: string) =>
    apiClient(`/group-work/assessments/${assessmentId}/groups`),

  lockGroups: (assessmentId: string) =>
    apiClient(`/group-work/assessments/${assessmentId}/groups/lock`, {
      method: "POST",
    }),

  // LECTURER: WORKSPACE
  getSubmissionWorkspace: (submissionId: string) =>
    apiClient(`/group-work/submissions/${submissionId}/workspace`),

  // STUDENT: WORKSPACE
  getWorkspace: (assessmentId: string) =>
    apiClient(`/group-work/assessments/${assessmentId}/workspace`),

  saveAnswer: (assessmentId: string, submissionId: string, questionId: string, data: SaveGroupAnswerRequest) =>
    apiClient(`/group-work/submissions/${submissionId}/answers/${questionId}?assessment_id=${assessmentId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  addComment: (assessmentId: string, submissionId: string, data: { body: string; question_id?: string }) =>
    apiClient(`/group-work/submissions/${submissionId}/comments?assessment_id=${assessmentId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  requestApproval: (assessmentId: string, submissionId: string) =>
    apiClient(`/group-work/submissions/${submissionId}/request-approval?assessment_id=${assessmentId}`, {
      method: "POST",
    }),

  approveSubmission: (assessmentId: string, submissionId: string, data: { status: string; note?: string }) =>
    apiClient(`/group-work/submissions/${submissionId}/approve?assessment_id=${assessmentId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  submitGroupWork: (assessmentId: string, submissionId: string, data: { confirm: boolean }) =>
    apiClient(`/group-work/submissions/${submissionId}/submit?assessment_id=${assessmentId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // APPEALS
  createAppeal: (assessmentId: string, submissionId: string, data: { statement: string }) =>
    apiClient(`/group-work/submissions/${submissionId}/appeals?assessment_id=${assessmentId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  approveAppeal: (assessmentId: string, appealId: string, data: { approve: boolean; note?: string }) =>
    apiClient(`/group-work/appeals/${appealId}/approve?assessment_id=${assessmentId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
    
  resolveAppeal: (assessmentId: string, appealId: string, data: ResolveGroupAppealRequest) =>
    apiClient(`/group-work/appeals/${appealId}/resolve?assessment_id=${assessmentId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // LECTURER: GRADING & RESULTS
  gradeSubmission: (assessmentId: string, submissionId: string, data: { total_score: number; max_score: number; feedback?: string; member_overrides?: Record<string, number> }) =>
    apiClient(`/group-work/submissions/${submissionId}/grade?assessment_id=${assessmentId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  releaseResult: (assessmentId: string, submissionId: string) =>
    apiClient(`/group-work/submissions/${submissionId}/release-result?assessment_id=${assessmentId}`, {
      method: "POST",
    }),

  assignReassessment: (assessmentId: string, submissionId: string) =>
    apiClient(`/group-work/submissions/${submissionId}/assign-reassessment?assessment_id=${assessmentId}`, {
      method: "POST",
    }),
};
