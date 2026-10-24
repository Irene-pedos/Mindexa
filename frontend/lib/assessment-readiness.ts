// lib/assessment-readiness.ts
// Pure completeness checks for a draft assessment, used by the wizard's question navigator,
// per-question issue chips and the pre-submit readiness panel. No imports on purpose: it is
// unit-tested directly with `node --test` (see assessment-readiness.test.mts).
//
// Severity:
//   blocking   - the paper cannot be submitted/published like this (no answer key, empty stem...)
//   warning    - a moderator would likely object (no model answer, section short of questions...)
//   suggestion - could be better (few distractors, AI draft not yet reviewed)

export type IssueSeverity = "blocking" | "warning" | "suggestion";

/** Actions the AI question assistant can perform (mirrors the backend `EnhanceAction`). */
export type EnhanceAction =
  | "improve_wording"
  | "add_explanation"
  | "add_distractors"
  | "complete_missing"
  | "add_sub_questions"
  | "make_easier"
  | "make_harder"
  | "fix_ambiguity";

export interface ReadinessOption {
  option_text: string;
  option_text_right?: string;
  is_correct: boolean;
  match_key?: string;
}

export interface ReadinessQuestion {
  id: string;
  sectionId: string;
  text: string;
  type: string;
  marks: number;
  options: ReadinessOption[];
  aiGenerated?: boolean;
  caseStudyContext?: string;
  solutionSteps?: string;
}

export interface ReadinessSection {
  id: string;
  section: string;
  marks: number;
  questions: number;
}

export interface QuestionIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  /** The AI assistant can propose a fix for this issue. */
  aiFixable: boolean;
  /** Which AI action fixes it (when aiFixable). */
  fix?: EnhanceAction;
}

export interface PaperIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  sectionId?: string;
  /** Number of questions that would fix it (e.g. "generate 2 more"). */
  missingCount?: number;
}

export type QuestionStatus = "ready" | "review" | "needs_work";

export interface ReadinessResult {
  perQuestion: Record<string, QuestionIssue[]>;
  status: Record<string, QuestionStatus>;
  paper: PaperIssue[];
  summary: {
    total: number;
    ready: number;
    needsWork: number;
    review: number;
    blocking: number;
    warnings: number;
    suggestions: number;
    aiUnreviewed: number;
  };
}

const norm = (t: string): string => (t || "").toLowerCase().replace(/[^a-z]/g, "");
const filled = (s: string | undefined | null): boolean => !!s && s.trim().length > 0;

/** Questions whose answer lives in a model-answer field instead of options. */
const OPEN_ENDED = new Set(["shortanswer", "essay", "computational"]);

export function analyzeQuestion(q: ReadinessQuestion): QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  const type = norm(q.type);
  const add = (i: QuestionIssue) => issues.push(i);

  if (!filled(q.text) && type !== "casestudy") {
    add({ code: "EMPTY_STEM", severity: "blocking", message: "The question text is empty.", aiFixable: true, fix: "complete_missing" });
  } else if (type !== "casestudy" && q.text.trim().length < 12) {
    add({ code: "SHORT_STEM", severity: "warning", message: "The question text is very short and may be unclear.", aiFixable: true, fix: "improve_wording" });
  }
  if (!(q.marks > 0)) {
    add({ code: "NO_MARKS", severity: "blocking", message: "This question has no marks.", aiFixable: false });
  }

  const withText = q.options.filter((o) => filled(o.option_text));

  if (type === "mcq") {
    if (withText.length < 2) {
      add({ code: "FEW_OPTIONS", severity: "blocking", message: "Needs at least 2 answer options.", aiFixable: true, fix: "add_distractors" });
    } else {
      if (q.options.some((o) => !filled(o.option_text))) {
        add({ code: "EMPTY_OPTION", severity: "blocking", message: "An answer option is empty.", aiFixable: true, fix: "complete_missing" });
      }
      const correct = q.options.filter((o) => o.is_correct && filled(o.option_text)).length;
      if (correct === 0) {
        add({ code: "NO_CORRECT", severity: "blocking", message: "No correct answer is marked.", aiFixable: true, fix: "complete_missing" });
      }
      if (withText.length < 4) {
        add({ code: "FEW_DISTRACTORS", severity: "suggestion", message: "Fewer than 4 options; add plausible wrong answers.", aiFixable: true, fix: "add_distractors" });
      }
    }
  } else if (type === "truefalse") {
    const correct = q.options.filter((o) => o.is_correct).length;
    if (q.options.length !== 2 || correct !== 1) {
      add({ code: "TF_KEY", severity: "blocking", message: "True/False needs exactly two options with one marked correct.", aiFixable: true, fix: "complete_missing" });
    }
  } else if (OPEN_ENDED.has(type)) {
    const modelAnswer = q.options[0]?.option_text;
    if (!filled(modelAnswer) && !(type === "computational" && filled(q.solutionSteps))) {
      add({ code: "NO_MODEL_ANSWER", severity: "warning", message: "No model answer or marking guidance for the marker.", aiFixable: true, fix: "add_explanation" });
    }
  } else if (type === "matching") {
    const complete = q.options.filter((o) => filled(o.option_text) && filled(o.option_text_right));
    if (complete.length < 2 || complete.length !== q.options.length) {
      add({ code: "INCOMPLETE_PAIRS", severity: "blocking", message: "Matching needs at least 2 complete pairs (both sides filled).", aiFixable: true, fix: "complete_missing" });
    }
  } else if (type === "fillblank") {
    const blanks = (q.text.match(/\[blank\]/gi) || []).length;
    if (blanks === 0) {
      add({ code: "NO_BLANK", severity: "blocking", message: "Add a [blank] marker where the answer goes.", aiFixable: true, fix: "complete_missing" });
    } else if (q.options.filter((o) => o.is_correct && filled(o.option_text)).length < blanks) {
      add({ code: "BLANK_ANSWERS", severity: "blocking", message: `Provide a correct answer for each of the ${blanks} blank(s).`, aiFixable: true, fix: "complete_missing" });
    }
  } else if (type === "ordering") {
    if (withText.length < 2 || withText.length !== q.options.length) {
      add({ code: "FEW_ITEMS", severity: "blocking", message: "Ordering needs at least 2 filled items in the correct order.", aiFixable: true, fix: "complete_missing" });
    }
  } else if (type === "casestudy") {
    if (!filled(q.caseStudyContext)) {
      add({ code: "NO_SCENARIO", severity: "blocking", message: "The case-study scenario is empty.", aiFixable: true, fix: "complete_missing" });
    }
    if (withText.length < 2) {
      add({ code: "NO_SUB_QUESTIONS", severity: "blocking", message: "A case study needs at least 2 sub-questions.", aiFixable: true, fix: "add_sub_questions" });
    } else {
      if (q.options.some((o) => !(parseFloat(o.match_key || "0") > 0))) {
        add({ code: "SUB_NO_MARKS", severity: "blocking", message: "Every sub-question needs marks.", aiFixable: false });
      }
      if (q.options.some((o) => !filled(o.option_text_right))) {
        add({ code: "SUB_NO_GUIDANCE", severity: "warning", message: "Some sub-questions have no answer guidance.", aiFixable: true, fix: "complete_missing" });
      }
    }
  }
  return issues;
}

export function statusOf(issues: QuestionIssue[]): QuestionStatus {
  if (issues.some((i) => i.severity === "blocking")) return "needs_work";
  if (issues.some((i) => i.severity === "warning")) return "review";
  return "ready";
}

export interface AnalyzeInput {
  questions: ReadinessQuestion[];
  sections: ReadinessSection[];
  /** Marks the blueprint says the paper should total. */
  blueprintTotal: number;
  /** Institution policy total for SUMMATIVE papers, when known. */
  policyTotal?: number | null;
  /** How strictly the institution applies that total; required unless the institution says otherwise. */
  policyTotalMode?: "BLOCKING" | "WARNING" | "OFF";
  isSummative?: boolean;
  /** Question ids the lecturer has already looked at (AI drafts start unreviewed). */
  reviewedIds?: ReadonlySet<string>;
}

export function analyzePaper(input: AnalyzeInput): ReadinessResult {
  const { questions, sections, blueprintTotal, policyTotal, policyTotalMode = "BLOCKING", isSummative, reviewedIds } = input;
  const perQuestion: Record<string, QuestionIssue[]> = {};
  const status: Record<string, QuestionStatus> = {};
  let aiUnreviewed = 0;

  for (const q of questions) {
    const issues = analyzeQuestion(q);
    if (q.aiGenerated && !reviewedIds?.has(q.id)) {
      aiUnreviewed += 1;
      issues.push({ code: "AI_UNREVIEWED", severity: "suggestion", message: "AI-generated: read it through before relying on it.", aiFixable: false });
    }
    perQuestion[q.id] = issues;
    status[q.id] = statusOf(issues);
  }

  const paper: PaperIssue[] = [];
  const currentMarks = questions.reduce((sum, q) => sum + (q.marks || 0), 0);

  if (questions.length === 0) {
    paper.push({ code: "NO_QUESTIONS", severity: "blocking", message: "The paper has no questions yet." });
  } else if (currentMarks !== blueprintTotal) {
    const diff = blueprintTotal - currentMarks;
    paper.push({
      code: "MARKS_MISMATCH",
      severity: "blocking",
      message:
        diff > 0
          ? `Questions add up to ${currentMarks} marks; the blueprint expects ${blueprintTotal} (${diff} short).`
          : `Questions add up to ${currentMarks} marks; the blueprint expects ${blueprintTotal} (${-diff} over).`,
    });
  }

  if (
    isSummative &&
    policyTotalMode !== "OFF" &&
    policyTotal != null &&
    policyTotal > 0 &&
    currentMarks !== policyTotal
  ) {
    const required = policyTotalMode === "BLOCKING";
    paper.push({
      code: "POLICY_TOTAL",
      severity: required ? "blocking" : "warning",
      message: required
        ? `Summative papers must total ${policyTotal} marks (institution policy). This paper totals ${currentMarks}, so it cannot be submitted.`
        : `Your institution expects summative papers to total ${policyTotal} marks; this one totals ${currentMarks}. The moderator will see this as a warning.`,
    });
  }

  for (const s of sections) {
    const inSection = questions.filter((q) => q.sectionId === s.id);
    const marks = inSection.reduce((sum, q) => sum + (q.marks || 0), 0);
    if (s.questions > 0 && inSection.length < s.questions) {
      const missing = s.questions - inSection.length;
      paper.push({
        code: "SECTION_SHORT",
        severity: inSection.length === 0 ? "blocking" : "warning",
        message: `${s.section} has ${inSection.length} of ${s.questions} planned questions.`,
        sectionId: s.id,
        missingCount: missing,
      });
    } else if (s.questions > 0 && inSection.length > s.questions) {
      paper.push({
        code: "SECTION_OVER",
        severity: "suggestion",
        message: `${s.section} has ${inSection.length} questions; ${s.questions} were planned.`,
        sectionId: s.id,
      });
    }
    if (s.marks > 0 && inSection.length > 0 && marks !== s.marks) {
      paper.push({
        code: "SECTION_MARKS",
        severity: "warning",
        message: `${s.section} questions add up to ${marks} marks; the blueprint planned ${s.marks}.`,
        sectionId: s.id,
      });
    }
  }

  const all = [...Object.values(perQuestion).flat(), ...paper];
  const count = (sev: IssueSeverity) => all.filter((i) => i.severity === sev).length;
  const statuses = Object.values(status);
  return {
    perQuestion,
    status,
    paper,
    summary: {
      total: questions.length,
      ready: statuses.filter((s) => s === "ready").length,
      needsWork: statuses.filter((s) => s === "needs_work").length,
      review: statuses.filter((s) => s === "review").length,
      blocking: count("blocking"),
      warnings: count("warning"),
      suggestions: count("suggestion"),
      aiUnreviewed,
    },
  };
}

/** The next question (after `currentId`, wrapping) that is not ready, in paper order. */
export function nextUnfinished(
  questions: ReadonlyArray<{ id: string }>,
  status: Record<string, QuestionStatus>,
  currentId?: string | null,
): string | null {
  if (questions.length === 0) return null;
  const start = currentId ? questions.findIndex((q) => q.id === currentId) : -1;
  for (let step = 1; step <= questions.length; step += 1) {
    const q = questions[(start + step) % questions.length];
    if (status[q.id] && status[q.id] !== "ready") return q.id;
  }
  return null;
}
