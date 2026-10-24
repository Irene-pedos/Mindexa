// Shared by the assessment wizard and the edit page: how a saved assessment (GET /assessments/{id})
// becomes editable questions and sections again, and how they are packed for the save endpoints.
// Keeping one copy means the two pages can no longer disagree about what "loading" or "saving" means.

export type DraftQuestionType =
  | "mcq"
  | "truefalse"
  | "shortanswer"
  | "essay"
  | "matching"
  | "fillblank"
  | "computational"
  | "ordering"
  | "casestudy";

export interface DraftOption {
  id?: string;
  option_text: string;
  option_text_right?: string;
  is_correct: boolean;
  order_index: number;
  match_key?: string;
}

export interface DraftQuestion {
  id: string;
  sectionId: string;
  groupId?: string;
  text: string;
  imageUrl?: string;
  type: DraftQuestionType;
  computationalType?: "decision" | "search" | "counting" | "optimization";
  caseStudyContext?: string;
  marks: number;
  options: DraftOption[];
  aiGenerated: boolean;
  is_required: boolean;
  wordLimit?: number;
  rubric?: string;
  solutionSteps?: string;
  tolerance?: number;
  shuffleOptions?: boolean;
  caseSensitive?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  question_table_context?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  questionTableContext?: any;
  requires_table_answer?: boolean;
  requiresTableAnswer?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answer_table_template?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answerTableTemplate?: any;
}

export interface DraftSection {
  id: string;
  section: string;
  topics: string;
  marks: number;
  questions: number;
  difficulty: "Easy" | "Medium" | "Hard";
  allowedTypes: DraftQuestionType[];
  difficultyDistribution?: { easy: number; medium: number; hard: number };
  aiPromptHint?: string;
  bloomLevel?: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
  per_group?: boolean;
}

const KNOWN_TYPES = new Set<string>([
  "mcq",
  "truefalse",
  "shortanswer",
  "essay",
  "matching",
  "fillblank",
  "computational",
  "ordering",
  "casestudy",
]);

/** "TRUE_FALSE", "true_false" and "truefalse" are all the same type. */
export function normalizeQuestionType(raw: string | null | undefined): DraftQuestionType {
  const norm = String(raw ?? "").toLowerCase().replaceAll("_", "");
  return (KNOWN_TYPES.has(norm) ? norm : "mcq") as DraftQuestionType;
}

export const toBackendType = (type: string): string => {
  if (type === "truefalse") return "true_false";
  if (type === "shortanswer") return "short_answer";
  if (type === "fillblank") return "fill_blank";
  if (type === "casestudy") return "case_study";
  return type;
};

export const isOpenEnded = (type: string): boolean => ["shortanswer", "essay", "computational"].includes(type);

// ─── Open-ended answers are stored as one text block in `question.explanation` ───────────────

export interface OpenEndedParts {
  modelAnswer: string;
  rubric: string;
  wordLimit: number;
  solutionSteps: string;
  tolerance: number;
}

export function parseOpenEnded(type: string, explanation: string | null | undefined): OpenEndedParts {
  const out: OpenEndedParts = { modelAnswer: explanation || "", rubric: "", wordLimit: 0, solutionSteps: "", tolerance: 0 };
  if (!explanation) return out;
  const text = explanation.replaceAll("\r\n", "\n").trim();

  if (type === "essay") {
    const model = text.match(/(?:Model Answer:|^)\s*([\s\S]*?)(?=\n+Rubric:|\n+Word Limit:|$)/i);
    const rubric = text.match(/\n+Rubric:\s*([\s\S]*?)(?=\n+Word Limit:|$)/i);
    const limit = text.match(/\n+Word Limit:\s*(\d+)/i);
    if (model) out.modelAnswer = model[1].trim();
    if (rubric) out.rubric = rubric[1].trim();
    if (limit) out.wordLimit = parseInt(limit[1], 10);
  } else if (type === "shortanswer") {
    const model = text.match(/(?:Model Answer:|^)\s*([\s\S]*?)(?=\n+Rubric:|$)/i);
    const rubric = text.match(/\n+Rubric:\s*([\s\S]*?)$/i);
    if (model) out.modelAnswer = model[1].trim();
    if (rubric) out.rubric = rubric[1].trim();
  } else if (type === "computational") {
    const steps = text.match(/(?:Solution Steps:|^)\s*([\s\S]*?)(?=\n+Numerical Answer:|\n+Tolerance:|$)/i);
    const answer = text.match(/\n+Numerical Answer:\s*([\s\S]*?)(?=\n+Tolerance:|$)/i);
    const tolerance = text.match(/\n+Tolerance:\s*([\d.]+)/i);
    if (steps) out.solutionSteps = steps[1].trim();
    if (answer) out.modelAnswer = answer[1].trim();
    if (tolerance) out.tolerance = parseFloat(tolerance[1]);
  }
  return out;
}

export function packOpenEnded(
  q: Pick<DraftQuestion, "type" | "options" | "rubric" | "wordLimit" | "solutionSteps" | "tolerance">,
): string {
  const answer = q.options?.[0]?.option_text || "";
  if (q.type === "essay") return `Model Answer: ${answer}\n\nRubric: ${q.rubric || ""}\n\nWord Limit: ${q.wordLimit || 0} words`;
  if (q.type === "shortanswer") return `Model Answer: ${answer}\n\nRubric: ${q.rubric || ""}`;
  if (q.type === "computational")
    return `Solution Steps: ${q.solutionSteps || ""}\n\nNumerical Answer: ${answer}\n\nTolerance: ${q.tolerance || 0}`;
  return answer;
}

// ─── Saved assessment → editable state ───────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const byOrder = (a: any, b: any) => (a?.order_index ?? 0) - (b?.order_index ?? 0);

export function mapSavedQuestions(data: any): DraftQuestion[] {
  const links: any[] = [...(data?.assessment_questions ?? [])].filter((aq) => aq?.question).sort(byOrder);
  return links.map((aq) => {
    const q = aq.question;
    const type = normalizeQuestionType(q.question_type);
    const rawOptions: any[] = [...(q.options ?? [])].sort(byOrder);
    const open = isOpenEnded(type);
    const parsed = open
      ? parseOpenEnded(type, q.explanation || rawOptions[0]?.option_text || rawOptions[0]?.content || "")
      : null;
    const tableContext = q.question_table_context ?? q.questionTableContext;
    const tableTemplate = q.answer_table_template ?? q.answerTableTemplate;
    const needsTable = !!(q.requires_table_answer || q.requiresTableAnswer);

    return {
      id: q.id,
      sectionId: aq.assessment_section_id ?? aq.section_id ?? "",
      groupId: aq.group_id ?? undefined,
      text: q.content ?? "",
      imageUrl: q.image_url ?? undefined,
      type,
      marks: aq.marks_override || aq.marks || q.marks || q.suggested_marks || 0,
      options: parsed
        ? [
            {
              id: rawOptions[0]?.id,
              option_text: parsed.modelAnswer,
              option_text_right: "",
              is_correct: true,
              order_index: 0,
            },
          ]
        : rawOptions.map((o, idx) => ({
            id: o.id,
            option_text: o.option_text || o.content || "",
            option_text_right: o.option_text_right || o.match_value || "",
            is_correct: type === "casestudy" ? true : !!o.is_correct,
            order_index: o.order_index ?? idx,
            match_key: o.match_key ?? undefined,
          })),
      rubric: parsed?.rubric || undefined,
      wordLimit: parsed?.wordLimit || undefined,
      solutionSteps: parsed?.solutionSteps || undefined,
      tolerance: parsed?.tolerance || undefined,
      computationalType: q.computational_type ?? undefined,
      caseStudyContext: q.case_study_context ?? undefined,
      aiGenerated: String(aq.added_via ?? "").toUpperCase().startsWith("AI_GENERATED"),
      is_required: aq.is_required ?? false,
      question_table_context: tableContext,
      questionTableContext: tableContext,
      requires_table_answer: needsTable,
      requiresTableAnswer: needsTable,
      answer_table_template: tableTemplate,
      answerTableTemplate: tableTemplate,
    } as DraftQuestion;
  });
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function mapSavedSections(data: any): DraftSection[] {
  const sections: any[] = [...(data?.sections ?? [])].sort(byOrder);
  return sections.map((s) => {
    const allowed = s.allowed_question_types;
    return {
      id: s.id,
      section: s.title,
      topics: s.description || "",
      marks: s.allocated_marks || 0,
      questions: s.question_count_target || 0,
      difficulty: capitalise(allowed?.difficulty || s.difficulty || "Medium") as DraftSection["difficulty"],
      allowedTypes: ((allowed?.types as string[] | undefined) ?? ["mcq"]).map((t) => normalizeQuestionType(t)),
      aiPromptHint: s.ai_generation_prompt_hint || "",
      difficultyDistribution: s.difficulty_distribution || undefined,
      bloomLevel: allowed?.bloom_level || allowed?.bloomLevel || s.bloom_level || s.bloomLevel || "understand",
      per_group: allowed?.per_group || false,
    } as DraftSection;
  });
}

/** Passing mark as a percentage of the total (the editor works in percent, the API in marks). */
export function passingPercentOf(totalMarks: number | null | undefined, passingMarks: number | null | undefined): number {
  const total = Number(totalMarks) || 0;
  const passing = Number(passingMarks);
  if (total <= 0 || !Number.isFinite(passing) || passing <= 0) return 70;
  return Math.min(100, Math.max(1, Math.round((passing * 100) / total)));
}

/** The wizard's "mode" is richer than the stored assessment_type (Practice is Formative without monitoring). */
export function modeFromSaved(data: any): string {
  const type: string | undefined = data?.assessment_type;
  if (type === "GROUP_WORK") return "Groupwork";
  if (!type || type === "CAT") return "CAT";
  if (type === "FORMATIVE") return data.integrity_monitoring_enabled === false ? "Practice" : "Formative";
  const normalised = capitalise(type);
  return ["Practice", "Formative", "Homework", "Summative", "Reassessment"].includes(normalised) ? normalised : type;
}

// ─── Editable state → save payload ───────────────────────────────────────────────────────────

export function questionsToPayload(questions: DraftQuestion[]) {
  return questions.map((q) => {
    let options = (q.options || []).map((opt) => ({
      option_text: opt.option_text,
      option_text_right: opt.option_text_right,
      is_correct: opt.is_correct,
      order_index: opt.order_index,
      match_key: opt.match_key,
    }));

    if (isOpenEnded(q.type)) {
      options = [{ option_text: packOpenEnded(q), option_text_right: "", is_correct: true, order_index: 0, match_key: undefined }];
    } else if (q.type === "casestudy") {
      options = (q.options || []).map((opt) => ({
        option_text: opt.option_text,
        option_text_right: opt.option_text_right || "",
        is_correct: true,
        order_index: opt.order_index,
        match_key: opt.match_key,
      }));
    }

    return {
      id: q.id,
      sectionId: q.sectionId,
      groupId: q.groupId,
      text: q.text,
      type: toBackendType(q.type),
      marks: q.marks,
      options,
      aiGenerated: q.aiGenerated,
      imageUrl: q.imageUrl,
      computationalType: q.computationalType,
      caseStudyContext: q.caseStudyContext,
      is_required: q.is_required,
      question_table_context: q.question_table_context || q.questionTableContext,
      requires_table_answer: !!(q.requires_table_answer || q.requiresTableAnswer),
      answer_table_template: q.answer_table_template || q.answerTableTemplate,
    };
  });
}

export function sectionsToPayload(sections: DraftSection[]) {
  return sections.map((b) => ({
    id: b.id,
    section: b.section,
    topics: b.topics,
    marks: b.marks,
    questions: b.questions,
    difficulty: b.difficulty,
    allowedTypes: b.allowedTypes.map((t) => toBackendType(t)),
    aiPromptHint: b.aiPromptHint,
    difficultyDistribution: b.difficultyDistribution,
    bloomLevel: b.bloomLevel,
    per_group: b.per_group || false,
  }));
}
