// frontend/lib/api/approval-policy.ts
// Institution-level assessment rules: whether moderation is required and how strictly each
// automatic pre-moderation check applies. Admin only (backend: /admin/approval-policies).
import { apiClient } from "./client";

export type AssessmentTypeKey =
  | "SUMMATIVE"
  | "CAT"
  | "FORMATIVE"
  | "HOMEWORK"
  | "GROUP_WORK"
  | "REASSESSMENT";

/** BLOCKING = required (the author cannot submit; a moderator may waive it with a reason). */
export type RuleMode = "BLOCKING" | "WARNING" | "OFF";

export type RuleCode = "MARKS_TOTAL" | "MARKS_DISTRIBUTION" | "STRUCTURE" | "QUESTIONS_COMPLETE";

export interface StructureRule {
  mode: RuleMode;
  /** null = any number of sections is fine */
  expected_sections: number | null;
  section_a_closed: boolean;
  section_c_open: boolean;
  choice_pools: boolean;
}

export interface ComplianceRules {
  MARKS_TOTAL: { mode: RuleMode };
  MARKS_DISTRIBUTION: { mode: RuleMode };
  STRUCTURE: StructureRule;
  QUESTIONS_COMPLETE: { mode: RuleMode };
}

export interface ApprovalPolicy {
  id: string;
  institution_id: string;
  assessment_type: AssessmentTypeKey;
  requires_moderation: boolean;
  enforce_structure_template: boolean;
  /** null = this institution sets no fixed total marks */
  summative_total_marks: number | null;
  sealing_warning_days: number | null;
  compliance_rules: ComplianceRules;
  is_active: boolean;
  institution_name?: string | null;
}

export interface ApprovalPolicyUpdate {
  requires_moderation?: boolean;
  /** Send null to clear the fixed total; omit to leave it unchanged. */
  summative_total_marks?: number | null;
  sealing_warning_days?: number;
  compliance_rules?: Partial<{
    [K in RuleCode]: K extends "STRUCTURE" ? Partial<StructureRule> : { mode: RuleMode };
  }>;
}

export const RULE_INFO: Record<RuleCode, { title: string; help: string }> = {
  MARKS_TOTAL: {
    title: "Fixed total marks",
    help: "The paper's marks must add up to the institution's fixed total (set above).",
  },
  MARKS_DISTRIBUTION: {
    title: "Marks distribution",
    help: "No section has zero marks, and choice sections (answer N of M) have equal marks per question.",
  },
  STRUCTURE: {
    title: "Section structure",
    help: "The paper follows your section layout (number of sections, which are closed or open, choice sections).",
  },
  QUESTIONS_COMPLETE: {
    title: "Questions complete",
    help: "Every question has a stem, marks and, for closed questions, a marked correct answer.",
  },
};

export const MODE_INFO: Record<RuleMode, { label: string; help: string }> = {
  BLOCKING: {
    label: "Required",
    help: "The author cannot submit until it passes. A moderator can still approve by giving a reason.",
  },
  WARNING: { label: "Advisory", help: "Shown to the author and moderator; never stops anyone." },
  OFF: { label: "Not checked", help: "Ignored for this institution." },
};

export const approvalPolicyApi = {
  list: (institutionId: string): Promise<ApprovalPolicy[]> =>
    apiClient(`/admin/approval-policies?institution_id=${encodeURIComponent(institutionId)}`),

  update: (id: string, body: ApprovalPolicyUpdate): Promise<ApprovalPolicy> =>
    apiClient(`/admin/approval-policies/${id}`, { method: "PUT", body: JSON.stringify(body) }),
};
