// lib/question-ai-mapping.ts
// Converts between the wizard's in-editor question shape and the AI assistant's
// `QuestionSnapshot`. Pure and import-free so it is unit-tested with `node --test`.
//
// How the wizard stores each type (see mapCandidateToQuestion in components/mindexa/assessment/assessment-wizard.tsx):
//   mcq / truefalse / ordering / fillblank : options[].option_text + is_correct
//   matching                               : option_text (left) + option_text_right (right)
//   shortanswer / essay / computational    : options[0].option_text is the model answer
//   casestudy                              : caseStudyContext = scenario; each option is a
//                                            sub-question (option_text), its guidance
//                                            (option_text_right) and marks (match_key)

export interface WizardOption {
  id?: string;
  option_text: string;
  option_text_right?: string;
  is_correct: boolean;
  order_index: number;
  match_key?: string;
}

export interface WizardQuestionLike {
  id: string;
  type: string;
  text: string;
  marks: number;
  options: WizardOption[];
  caseStudyContext?: string;
}

export interface SnapshotOptionLike {
  text: string;
  explanation?: string | null;
  is_correct: boolean;
  match_key?: string | null;
}

export interface QuestionSnapshotLike {
  id?: string | null;
  type: string;
  text: string;
  marks?: number | null;
  options: SnapshotOptionLike[];
  case_study_context?: string | null;
  explanation?: string | null;
  difficulty?: string | null;
  section?: string | null;
}

const norm = (t: string): string => (t || "").toLowerCase().replace(/[^a-z]/g, "");
const OPEN_ENDED = new Set(["shortanswer", "essay", "computational"]);

export function toSnapshot(
  q: WizardQuestionLike,
  extra: { section?: string; difficulty?: string } = {},
): QuestionSnapshotLike {
  const type = norm(q.type);
  const base: QuestionSnapshotLike = {
    id: q.id,
    type: q.type,
    text: q.text || "",
    marks: q.marks,
    options: [],
    difficulty: extra.difficulty ?? null,
    section: extra.section ?? null,
  };
  if (OPEN_ENDED.has(type)) {
    return { ...base, explanation: q.options[0]?.option_text ?? "" };
  }
  if (type === "casestudy") {
    return {
      ...base,
      case_study_context: q.caseStudyContext ?? "",
      options: q.options.map((o) => ({
        text: o.option_text,
        explanation: o.option_text_right ?? "",
        is_correct: true,
        match_key: o.match_key ?? "5",
      })),
    };
  }
  if (type === "matching") {
    return {
      ...base,
      options: q.options.map((o) => ({ text: o.option_text, explanation: o.option_text_right ?? "", is_correct: true })),
    };
  }
  return { ...base, options: q.options.map((o) => ({ text: o.option_text, is_correct: o.is_correct })) };
}

/** Returns a copy of `q` with the AI proposal applied. The input is never mutated. */
export function applySnapshot<Q extends WizardQuestionLike>(q: Q, snap: QuestionSnapshotLike): Q {
  const type = norm(q.type);
  const next: Q = { ...q };

  if (OPEN_ENDED.has(type)) {
    if (snap.text?.trim()) next.text = snap.text.trim();
    if (snap.explanation?.trim()) {
      next.options = [{ option_text: snap.explanation.trim(), is_correct: true, order_index: 0 }];
    }
    return next;
  }

  if (type === "casestudy") {
    // The stem of a case study is fixed boilerplate; the scenario lives in caseStudyContext.
    if (snap.case_study_context?.trim()) next.caseStudyContext = snap.case_study_context.trim();
    if (snap.options.length > 0) {
      next.options = snap.options.map((o, idx) => ({
        option_text: o.text,
        option_text_right: o.explanation ?? "",
        is_correct: true,
        order_index: idx,
        match_key: String(o.match_key ?? "5"),
      }));
      next.marks = next.options.reduce((sum, o) => sum + (parseInt(o.match_key || "0", 10) || 0), 0) || next.marks;
    }
    return next;
  }

  if (snap.text?.trim()) next.text = snap.text.trim();
  if (snap.options.length > 0) {
    next.options = snap.options.map((o, idx) => ({
      option_text: o.text,
      ...(type === "matching" ? { option_text_right: o.explanation ?? "" } : {}),
      is_correct: type === "matching" ? true : o.is_correct,
      order_index: idx,
    }));
  }
  return next;
}
