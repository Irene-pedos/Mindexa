/**
 * Authoritative set of closed / auto-gradable question types matching backend QuestionType.is_auto_gradable.
 * Includes canonical backend enums and common aliases normalized by stripping spaces, hyphens, and underscores.
 */
export const CLOSED_QUESTION_TYPES = new Set([
  "mcq",
  "multiplechoice",
  "singleoption",
  "multioption",
  "multiselect",
  "checkbox",
  "truefalse",
  "matching",
  "matchpairs",
  "fillblank",
  "fillblanks",
  "ordering",
  "orderedlist",
]);

/**
 * Authoritative set of open-ended question types matching backend QuestionType.is_open_ended.
 */
export const OPEN_QUESTION_TYPES = new Set([
  "shortanswer",
  "essay",
  "casestudy",
  "computational",
  "practical",
]);

export function normalizeQuestionType(value?: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function isClosedQuestionType(value?: string | null): boolean {
  const normalized = normalizeQuestionType(value);
  return CLOSED_QUESTION_TYPES.has(normalized);
}

export function isTrueFalseType(value?: string | null): boolean {
  const normalized = normalizeQuestionType(value);
  return normalized === "truefalse" || normalized === "tf";
}

export function isMcqType(value?: string | null): boolean {
  const normalized = normalizeQuestionType(value);
  return (
    normalized === "mcq" ||
    normalized === "multiplechoice" ||
    normalized === "singleoption" ||
    normalized === "multioption" ||
    normalized === "multiselect" ||
    normalized === "checkbox"
  );
}

export function isMatchingType(value?: string | null): boolean {
  const normalized = normalizeQuestionType(value);
  return normalized === "matching" || normalized === "matchpairs";
}

export function isFillBlankType(value?: string | null): boolean {
  const normalized = normalizeQuestionType(value);
  return normalized === "fillblank" || normalized === "fillblanks";
}

export function isOrderingType(value?: string | null): boolean {
  const normalized = normalizeQuestionType(value);
  return normalized === "ordering" || normalized === "orderedlist";
}

export function isClosedChoiceType(value?: string | null): boolean {
  return isMcqType(value) || isTrueFalseType(value);
}

export function isOpenQuestionType(
  value?:
    | {
        type?: string | null;
        question_type?: string | null;
        grading_mode?: string | null;
      }
    | string
    | null,
): boolean {
  if (!value) return false;
  if (typeof value === "object") {
    if (value.grading_mode) {
      const mode = value.grading_mode.trim().toUpperCase();
      if (mode === "AUTO" || mode === "AUTOMATIC") return false;
      if (
        mode === "MANUAL" ||
        mode === "SEMI" ||
        mode === "AI_ASSISTED" ||
        mode === "RUBRIC"
      ) {
        return true;
      }
    }
    const typeStr = value.type ?? value.question_type;
    return isOpenQuestionType(typeStr);
  }
  const normalized = normalizeQuestionType(value);
  return OPEN_QUESTION_TYPES.has(normalized);
}

export const isOpenEnded = isOpenQuestionType;

/**
 * Single shared source of truth for whether a question is auto-graded.
 * Checks explicit grading_mode first, then defers to the authoritative QuestionType list.
 */
export function isQuestionAutoGraded(
  q?:
    | {
        type?: string | null;
        question_type?: string | null;
        grading_mode?: string | null;
      }
    | string
    | null,
): boolean {
  if (!q) return false;
  if (typeof q === "string") {
    return isClosedQuestionType(q);
  }
  if (q.grading_mode) {
    const mode = q.grading_mode.trim().toUpperCase();
    if (mode === "AUTO" || mode === "AUTOMATIC") return true;
    if (
      mode === "MANUAL" ||
      mode === "SEMI" ||
      mode === "AI_ASSISTED" ||
      mode === "RUBRIC"
    ) {
      return false;
    }
  }
  const typeStr = q.type ?? q.question_type;
  if (!typeStr) return false;
  return isClosedQuestionType(typeStr);
}

/**
 * User-friendly display label for any question type.
 */
export function getQuestionTypeLabel(value?: string | null): string {
  const normalized = normalizeQuestionType(value);
  if (
    normalized === "mcq" ||
    normalized === "multiplechoice" ||
    normalized === "singleoption" ||
    normalized === "multioption" ||
    normalized === "multiselect"
  ) {
    return "Multiple Choice";
  }
  if (normalized === "truefalse") return "True / False";
  if (normalized === "matching" || normalized === "matchpairs") return "Matching";
  if (normalized === "fillblank" || normalized === "fillblanks")
    return "Fill in the Blanks";
  if (normalized === "ordering" || normalized === "orderedlist") return "Ordering";
  if (normalized === "shortanswer") return "Short Answer";
  if (normalized === "essay") return "Essay";
  if (normalized === "computational") return "Computational";
  if (normalized === "casestudy") return "Case Study";
  return (value || "Question").replace(/_/g, " ");
}

export function summarizeQuestionMix(
  questions: Array<{ type?: string; question_type?: string; marks?: number }> = [],
) {
  const summary = {
    totalQuestions: questions.length,
    closedQuestions: 0,
    openQuestions: 0,
    closedMarks: 0,
    openMarks: 0,
    hasClosedQuestions: false,
    hasOpenQuestions: false,
    releaseMode: "immediate" as "immediate" | "manual",
    lecturerReviewRequired: false,
    rubricRequired: false,
  };

  for (const question of questions) {
    const type = question.type ?? question.question_type;
    const marks = Number(question.marks ?? 0);
    if (isOpenQuestionType(type)) {
      summary.openQuestions += 1;
      summary.openMarks += marks;
      continue;
    }
    summary.closedQuestions += 1;
    summary.closedMarks += marks;
  }

  summary.hasClosedQuestions = summary.closedQuestions > 0;
  summary.hasOpenQuestions = summary.openQuestions > 0;
  summary.lecturerReviewRequired = summary.hasOpenQuestions;
  summary.rubricRequired = summary.hasOpenQuestions;
  summary.releaseMode = summary.hasOpenQuestions ? "manual" : "immediate";
  return summary;
}

export function getAssessmentProgressStatus(assessment: {
  student_status?: string | null;
  status?: string | null;
  result_release_mode?: string | null;
}) {
  const studentStatus = (assessment.student_status || "").toUpperCase();
  const releaseMode = (assessment.result_release_mode || "").toLowerCase();

  if (studentStatus === "TERMINATED" || studentStatus === "AUTO_SUBMITTED") {
    return {
      label: "Terminated / Auto-Submitted",
      description: "This session ended automatically due to integrity violations or timeout.",
      tone: "destructive" as const,
    };
  }

  if (studentStatus === "GRADED" || studentStatus === "COMPLETED") {
    return {
      label: "Result Released",
      description: "Final marks are available in the results registry.",
      tone: "success" as const,
    };
  }

  if (studentStatus === "SUBMITTED") {
    if (releaseMode === "manual") {
      return {
        label: "Awaiting Lecturer Review",
        description: "Closed questions may be processed, but open responses require lecturer review.",
        tone: "warning" as const,
      };
    }
    return {
      label: "Submission Processing",
      description: "Your submission has been recorded and automatic grading is being finalized.",
      tone: "info" as const,
    };
  }

  return {
    label: "Assessment Available",
    description: "You can enter the assessment when the submission window is open.",
    tone: "default" as const,
  };
}

export function isHighSecurityAssessment(type?: string | null, isSupervised?: boolean): boolean {
  const t = normalizeQuestionType(type);
  const highSecurityTypes = new Set(["cat", "summative", "formative", "group_work", "group-work"]);
  return highSecurityTypes.has(t) || !!isSupervised;
}

export type AssessmentCategory = "ACTIVE" | "UPCOMING" | "SUBMITTED" | "MISSED" | "VIOLATION" | "GRADED" | "IN_PROGRESS";

export function getAssessmentCategory(assessment: {
  student_status?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  is_auto_submitted?: boolean;
}): AssessmentCategory {
  const status = (assessment.student_status || "").toUpperCase();
  const now = new Date();
  const start = assessment.window_start ? new Date(assessment.window_start) : null;
  const end = assessment.window_end ? new Date(assessment.window_end) : null;

  if (status === "TERMINATED" || status === "AUTO_SUBMITTED" || assessment.is_auto_submitted) {
    return "VIOLATION";
  }

  if (status === "GRADED") {
    return "GRADED";
  }

  if (status === "SUBMITTED" || status === "COMPLETED") {
    return "SUBMITTED";
  }

  if (end && now > end) {
    return "MISSED";
  }

  if (start && now < start) {
    return "UPCOMING";
  }
  
  if (status === "IN_PROGRESS") {
    return "IN_PROGRESS";
  }

  return "ACTIVE";
}

export function getResultLifecycleSummary(result: {
  graded_question_count?: number;
  total_question_count?: number;
  breakdowns?: Array<{ question_type?: string; grading_mode?: string; score?: number | null }>;
  student_status?: string | null;
  status?: string | null;
  is_auto_submitted?: boolean;
}) {
  const status = (result.student_status || result.status || "").toUpperCase();
  if (status === "TERMINATED" || status === "AUTO_SUBMITTED" || result.is_auto_submitted) {
    return {
      label: "Audit Required / Terminated",
      description: "This attempt was automatically submitted due to a security violation or timeout. Results are subject to institutional audit.",
      tone: "destructive" as const,
      autoGradedCount: 0,
      lecturerReviewedCount: 0,
      pendingReviewCount: 0,
      hasOpenReview: true,
    };
  }

  const totalQuestions = Number(result.total_question_count ?? result.breakdowns?.length ?? 0);
  const gradedQuestions = Number(result.graded_question_count ?? 0);
  const pendingReviewCount = Math.max(totalQuestions - gradedQuestions, 0);
  const breakdowns = result.breakdowns ?? [];

  let autoGradedCount = 0;
  let lecturerReviewedCount = 0;

  for (const item of breakdowns) {
    const gradingMode = (item.grading_mode || "").toLowerCase();
    if (gradingMode === "manual" || isOpenQuestionType(item.question_type)) {
      lecturerReviewedCount += 1;
    } else if (isClosedQuestionType(item.question_type) || gradingMode === "auto") {
      autoGradedCount += 1;
    }
  }

  const hasOpenReview = lecturerReviewedCount > 0 || pendingReviewCount > 0;

  if (pendingReviewCount > 0 && autoGradedCount > 0) {
    return {
      label: "Closed Questions Finalized, Open Review Pending",
      description:
        "Deterministic questions were graded automatically. Open responses remain under lecturer-controlled review.",
      tone: "warning" as const,
      autoGradedCount,
      lecturerReviewedCount,
      pendingReviewCount,
      hasOpenReview,
    };
  }

  if (pendingReviewCount > 0) {
    return {
      label: "Lecturer Review Pending",
      description:
        "This result still depends on lecturer review for open-ended responses before it can be finalized.",
      tone: "warning" as const,
      autoGradedCount,
      lecturerReviewedCount,
      pendingReviewCount,
      hasOpenReview,
    };
  }

  if (hasOpenReview) {
    return {
      label: "Lecturer Review Finalized",
      description:
        "Closed questions were processed automatically and open responses were finalized under lecturer oversight.",
      tone: "info" as const,
      autoGradedCount,
      lecturerReviewedCount,
      pendingReviewCount,
      hasOpenReview,
    };
  }

  return {
    label: "Automatically Finalized",
    description:
      "All questions in this result were deterministic and finalized through the automatic grading pipeline.",
    tone: "success" as const,
    autoGradedCount,
    lecturerReviewedCount,
    pendingReviewCount,
    hasOpenReview,
  };
}
