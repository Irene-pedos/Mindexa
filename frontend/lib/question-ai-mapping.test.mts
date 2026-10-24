// Run with: node --test lib/question-ai-mapping.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";

const { toSnapshot, applySnapshot } = await import(new URL("./question-ai-mapping.ts", import.meta.url).href);

const opt = (option_text: string, is_correct = false, extra: Record<string, unknown> = {}) => ({
  option_text,
  is_correct,
  order_index: 0,
  ...extra,
});

test("open-ended: the model answer travels as `explanation` and comes back into option 0", () => {
  const q = { id: "q", type: "shortanswer", text: "Define closure.", marks: 2, options: [opt("old answer", true)] };
  const snap = toSnapshot(q);
  assert.equal(snap.explanation, "old answer");
  assert.deepEqual(snap.options, []);

  const next = applySnapshot(q, { ...snap, explanation: "A function with its scope." });
  assert.equal(next.options[0].option_text, "A function with its scope.");
  assert.equal(q.options[0].option_text, "old answer", "input is not mutated");
});

test("an empty AI explanation never wipes an existing model answer", () => {
  const q = { id: "q", type: "essay", text: "Discuss.", marks: 10, options: [opt("kept", true)] };
  const next = applySnapshot(q, { ...toSnapshot(q), explanation: "  " });
  assert.equal(next.options[0].option_text, "kept");
});

test("case study: scenario, parts, guidance and marks round-trip; marks are re-summed", () => {
  const q = {
    id: "c",
    type: "casestudy",
    text: "Analyze the following case scenario and answer the sub-questions below.",
    marks: 10,
    caseStudyContext: "Old scenario",
    options: [],
  };
  const snap = toSnapshot(q);
  assert.equal(snap.case_study_context, "Old scenario");

  const next = applySnapshot(q, {
    ...snap,
    case_study_context: "A shop's site is slow.",
    options: [
      { text: "Find the bottleneck", explanation: "Queries", is_correct: true, match_key: "4" },
      { text: "Propose a fix", explanation: "Index", is_correct: true, match_key: "6" },
    ],
  });
  assert.equal(next.caseStudyContext, "A shop's site is slow.");
  assert.equal(next.options.length, 2);
  assert.equal(next.options[1].option_text_right, "Index");
  assert.equal(next.marks, 10);
  assert.equal(next.text, q.text, "the fixed case-study stem is kept");
});

test("matching keeps both sides; MCQ keeps correctness", () => {
  const m = { id: "m", type: "matching", text: "Match them.", marks: 4, options: [opt("HTML", true, { option_text_right: "structure" })] };
  assert.equal(toSnapshot(m).options[0].explanation, "structure");
  const back = applySnapshot(m, { ...toSnapshot(m), options: [{ text: "CSS", explanation: "style", is_correct: false }] });
  assert.equal(back.options[0].option_text_right, "style");
  assert.equal(back.options[0].is_correct, true, "matching pairs are always correct");

  const mcq = { id: "x", type: "mcq", text: "Pick one.", marks: 1, options: [opt("a", true)] };
  const withMore = applySnapshot(mcq, {
    ...toSnapshot(mcq),
    options: [
      { text: "a", is_correct: true },
      { text: "b", is_correct: false },
    ],
  });
  assert.deepEqual(
    withMore.options.map((o: { option_text: string; is_correct: boolean }) => [o.option_text, o.is_correct]),
    [["a", true], ["b", false]],
  );
});
