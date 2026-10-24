// Run with: node --test lib/assessment-draft.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";

const draft = await import(new URL("./assessment-draft.ts", import.meta.url).href);
const { mapSavedQuestions, mapSavedSections, questionsToPayload, sectionsToPayload, parseOpenEnded, packOpenEnded, passingPercentOf, modeFromSaved } =
  draft;

const link = (order_index: number, question: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  order_index,
  assessment_section_id: "sec-1",
  marks_override: 2,
  is_required: false,
  added_via: "MANUAL_WRITE",
  question: { options: [], ...question },
  ...extra,
});

test("questions come back in saved order, whatever order the API lists them in", () => {
  const out = mapSavedQuestions({
    assessment_questions: [
      link(2, { id: "c", question_type: "MCQ", content: "third" }),
      link(0, { id: "a", question_type: "MCQ", content: "first" }),
      link(1, { id: "b", question_type: "MCQ", content: "second" }),
    ],
  });
  assert.deepEqual(out.map((q: { id: string }) => q.id), ["a", "b", "c"]);
});

test("open-ended answers unpack into answer, rubric, word limit, steps and tolerance", () => {
  const essay = parseOpenEnded("essay", "Model Answer: Fluid grids\n\nRubric: Structure 5\n\nWord Limit: 300 words");
  assert.deepEqual(essay, { modelAnswer: "Fluid grids", rubric: "Structure 5", wordLimit: 300, solutionSteps: "", tolerance: 0 });
  const comp = parseOpenEnded("computational", "Solution Steps: add\n\nNumerical Answer: 4\n\nTolerance: 0.5");
  assert.equal(comp.modelAnswer, "4");
  assert.equal(comp.solutionSteps, "add");
  assert.equal(comp.tolerance, 0.5);
  assert.equal(parseOpenEnded("shortanswer", "Just an answer").modelAnswer, "Just an answer");
});

test("pack then unpack returns exactly what the lecturer typed", () => {
  for (const q of [
    { type: "essay", options: [{ option_text: "Answer", is_correct: true, order_index: 0 }], rubric: "R", wordLimit: 250 },
    { type: "shortanswer", options: [{ option_text: "Answer", is_correct: true, order_index: 0 }], rubric: "R" },
    { type: "computational", options: [{ option_text: "42", is_correct: true, order_index: 0 }], solutionSteps: "S", tolerance: 0.1 },
  ]) {
    const back = parseOpenEnded(q.type, packOpenEnded(q));
    assert.equal(back.modelAnswer, q.options[0].option_text);
    assert.equal(back.rubric, q.rubric ?? "");
    assert.equal(back.wordLimit, (q as { wordLimit?: number }).wordLimit ?? 0);
    assert.equal(back.solutionSteps, (q as { solutionSteps?: string }).solutionSteps ?? "");
  }
});

test("a case study keeps its scenario, sub-questions, their marks and guidance, and the AI flag", () => {
  const [q] = mapSavedQuestions({
    assessment_questions: [
      link(
        0,
        {
          id: "cs",
          question_type: "CASE_STUDY",
          content: "Analyze",
          case_study_context: "A bakery site…",
          options: [
            { id: "o2", content: "Justify", match_key: "4", match_value: "Because", order_index: 1, is_correct: true },
            { id: "o1", content: "Outline", match_key: "6", match_value: "Steps…", order_index: 0, is_correct: true },
          ],
        },
        { added_via: "AI_GENERATED_ACCEPTED", group_id: "g1" },
      ),
    ],
  });
  assert.equal(q.type, "casestudy");
  assert.equal(q.caseStudyContext, "A bakery site…");
  assert.equal(q.aiGenerated, true);
  assert.equal(q.groupId, "g1");
  assert.deepEqual(
    q.options.map((o: { option_text: string; match_key: string; option_text_right: string }) => [o.option_text, o.match_key, o.option_text_right]),
    [["Outline", "6", "Steps…"], ["Justify", "4", "Because"]],
  );
});

test("matching pairs, MCQ correctness and fill-blank answers survive loading and saving", () => {
  const saved = mapSavedQuestions({
    assessment_questions: [
      link(0, {
        id: "m", question_type: "MATCHING", content: "Match",
        options: [{ content: "h1", match_key: "h1", match_value: "Heading", order_index: 0, is_correct: true }],
      }),
      link(1, {
        id: "q", question_type: "MCQ", content: "Pick", options: [
          { content: "A", is_correct: true, order_index: 0 },
          { content: "B", is_correct: false, order_index: 1 },
        ],
      }),
    ],
  });
  const payload = questionsToPayload(saved);
  assert.equal(payload[0].type, "matching");
  assert.deepEqual(payload[0].options[0], { option_text: "h1", option_text_right: "Heading", is_correct: true, order_index: 0, match_key: "h1" });
  assert.deepEqual(payload[1].options.map((o: { is_correct: boolean }) => o.is_correct), [true, false]);
  assert.equal(payload[0].marks, 2);
});

test("an open-ended question is packed back into one text block when saved", () => {
  const [q] = mapSavedQuestions({
    assessment_questions: [
      link(0, { id: "e", question_type: "ESSAY", content: "Discuss", explanation: "Model Answer: A\n\nRubric: B\n\nWord Limit: 100 words" }),
    ],
  });
  assert.equal(q.wordLimit, 100);
  const [p] = questionsToPayload([q]);
  assert.equal(p.type, "essay");
  assert.equal(p.options[0].option_text, "Model Answer: A\n\nRubric: B\n\nWord Limit: 100 words");
});

test("sections keep order, hints, difficulty mix, bloom level and per-group", () => {
  const sections = mapSavedSections({
    sections: [
      { id: "b", title: "B", order_index: 1, allocated_marks: 9, question_count_target: 3, allowed_question_types: { types: ["TRUE_FALSE"], difficulty: "hard", bloom_level: "apply", per_group: true } },
      { id: "a", title: "A", order_index: 0, allocated_marks: 3, question_count_target: 2, ai_generation_prompt_hint: "simple", difficulty_distribution: { easy: 2, medium: 0, hard: 0 } },
    ],
  });
  assert.deepEqual(sections.map((s: { id: string }) => s.id), ["a", "b"]);
  assert.equal(sections[0].aiPromptHint, "simple");
  assert.deepEqual(sections[0].difficultyDistribution, { easy: 2, medium: 0, hard: 0 });
  assert.equal(sections[1].difficulty, "Hard");
  assert.deepEqual(sections[1].allowedTypes, ["truefalse"]);
  assert.equal(sections[1].per_group, true);
  const payload = sectionsToPayload(sections);
  assert.deepEqual(payload[0].difficultyDistribution, { easy: 2, medium: 0, hard: 0 });
  assert.deepEqual(payload[1].allowedTypes, ["true_false"]);
  assert.equal(payload[1].bloomLevel, "apply");
});

test("passing percent and mode are restored from the saved numbers", () => {
  assert.equal(passingPercentOf(100, 50), 50);
  assert.equal(passingPercentOf(0, 50), 70);
  assert.equal(modeFromSaved({ assessment_type: "FORMATIVE", integrity_monitoring_enabled: false }), "Practice");
  assert.equal(modeFromSaved({ assessment_type: "FORMATIVE", integrity_monitoring_enabled: true }), "Formative");
  assert.equal(modeFromSaved({ assessment_type: "GROUP_WORK" }), "Groupwork");
  assert.equal(modeFromSaved({ assessment_type: "SUMMATIVE" }), "Summative");
});
