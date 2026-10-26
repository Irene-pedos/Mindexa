// Run with: node --test lib/grading-guard.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";

const { evaluateGrade } = await import(
  new URL("./grading-guard.ts", import.meta.url).href
);

const codes = (input: Record<string, unknown>) =>
  evaluateGrade({ maxMarks: 10, ...input }).map((f: { code: string }) => f.code);

const longAnswer = Array.from({ length: 40 }, () => "word").join(" ");

test("no score entered produces no findings", () => {
  assert.deepEqual(codes({ scoreText: "" }), []);
});

test("out-of-range score is an error and stops other checks", () => {
  assert.deepEqual(codes({ scoreText: "12", answerText: "" }), ["SCORE_OUT_OF_RANGE"]);
  assert.deepEqual(codes({ scoreText: "-1" }), ["SCORE_OUT_OF_RANGE"]);
});

test("marks for an empty answer", () => {
  assert.ok(codes({ scoreText: "5", answerText: "No written response provided" }).includes("MARKS_FOR_EMPTY_ANSWER"));
  assert.ok(!codes({ scoreText: "0", answerText: "" }).includes("MARKS_FOR_EMPTY_ANSWER"));
});

test("zero for a long answer, full marks for a tiny one", () => {
  assert.ok(codes({ scoreText: "0", answerText: longAnswer }).includes("ZERO_FOR_LONG_ANSWER"));
  assert.ok(codes({ scoreText: "10", answerText: "yes" }).includes("FULL_MARKS_SHORT_ANSWER"));
  assert.ok(!codes({ scoreText: "10", answerText: longAnswer }).includes("FULL_MARKS_SHORT_ANSWER"));
});

test("file answers (no text) skip answer-length rules", () => {
  assert.deepEqual(codes({ scoreText: "10", answerText: null, feedback: "Good work overall." }), []);
});

test("rubric sum mismatch and criterion over max", () => {
  const rubricScores = [{ score: 3, max: 5 }, { score: 4, max: 3 }];
  const result = codes({ scoreText: "9", answerText: longAnswer, rubricScores });
  assert.ok(result.includes("RUBRIC_SUM_MISMATCH"));
  assert.ok(result.includes("RUBRIC_CRITERION_OVER_MAX"));
  assert.ok(!codes({ scoreText: "7", answerText: longAnswer, rubricScores: [{ score: 3, max: 5 }, { score: 4, max: 5 }] }).includes("RUBRIC_SUM_MISMATCH"));
});

test("AI deviation is a warning without feedback, info with it", () => {
  const base = { scoreText: "2", answerText: longAnswer, aiScore: 8, aiConfidence: 0.9 };
  const bare = evaluateGrade({ maxMarks: 10, ...base });
  assert.equal(bare.find((f: { code: string }) => f.code === "AI_DEVIATION")?.severity, "warning");
  const explained = evaluateGrade({ maxMarks: 10, ...base, feedback: "Misses the main argument about supply." });
  assert.equal(explained.find((f: { code: string }) => f.code === "AI_DEVIATION")?.severity, "info");
  assert.ok(!codes({ scoreText: "7", answerText: longAnswer, aiScore: 8 }).includes("AI_DEVIATION"));
});

test("feedback contradicting the score", () => {
  assert.ok(codes({ scoreText: "2", answerText: longAnswer, feedback: "Excellent answer, well done." }).includes("FEEDBACK_TOO_POSITIVE"));
  assert.ok(codes({ scoreText: "9", answerText: longAnswer, feedback: "This part is incorrect and missing detail." }).includes("FEEDBACK_TOO_NEGATIVE"));
  assert.ok(codes({ scoreText: "6", answerText: longAnswer, feedback: "Solid effort: 8/10." }).includes("FEEDBACK_SCORE_MISMATCH"));
  assert.ok(!codes({ scoreText: "8", answerText: longAnswer, feedback: "Solid effort: 8/10." }).includes("FEEDBACK_SCORE_MISMATCH"));
});

test("low score without feedback is an info nudge; errors sort first", () => {
  assert.ok(codes({ scoreText: "3", answerText: longAnswer }).includes("LOW_SCORE_NO_FEEDBACK"));
  const sorted = evaluateGrade({
    maxMarks: 10, scoreText: "5", answerText: "", rubricScores: [{ score: 1 }],
  }).map((f: { severity: string }) => f.severity);
  assert.deepEqual(sorted, [...sorted].sort((a, b) => ["error", "warning", "info"].indexOf(a) - ["error", "warning", "info"].indexOf(b)));
});

const { evaluateConsistency } = await import(
  new URL("./grading-guard.ts", import.meta.url).href
);

const peer = (similarity: number, score: number) => ({
  label: "Candidate-ABC123", similarity, score, max_score: 10,
});
const consCodes = (score: string, c: unknown) =>
  evaluateConsistency(score, 10, c).map((f: { code: string }) => f.code);

test("consistency: nothing without data", () => {
  assert.deepEqual(consCodes("5", null), []);
  assert.deepEqual(consCodes("5", { similar_answers: [], bias: null }), []);
});

test("consistency: similar answer scored very differently", () => {
  const c = { similar_answers: [peer(0.7, 9)], bias: null };
  assert.deepEqual(consCodes("4", c), ["SIMILAR_ANSWER_SCORED_DIFFERENTLY"]);
  assert.deepEqual(consCodes("8", c), []);
  assert.deepEqual(consCodes("", c), []);
});

test("consistency: near-duplicate warns even without a score", () => {
  assert.deepEqual(consCodes("", { similar_answers: [peer(0.95, 7)], bias: null }), ["NEAR_DUPLICATE_ANSWER"]);
});

test("consistency: grader drift needs a meaningful gap", () => {
  const drift = (mean: number) => ({ similar_answers: [], bias: { samples: 8, mean_diff_ratio: mean } });
  assert.deepEqual(consCodes("5", drift(-0.2)), ["GRADER_DRIFT"]);
  assert.deepEqual(consCodes("5", drift(0.2)), ["GRADER_DRIFT"]);
  assert.deepEqual(consCodes("5", drift(-0.05)), []);
});
