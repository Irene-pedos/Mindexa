// Run with: node --test lib/grading-architecture.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";

const { isQuestionAutoGraded, isOpenQuestionType } = await import(
  new URL("./grading-architecture.ts", import.meta.url).href
);

test("open-ended types are never auto-graded, even when grading_mode says AUTO", () => {
  for (const type of ["SHORT_ANSWER", "ESSAY", "CASE_STUDY", "COMPUTATIONAL"]) {
    assert.equal(isQuestionAutoGraded({ question_type: type, grading_mode: "AUTO" }), false, type);
    assert.equal(isOpenQuestionType({ question_type: type, grading_mode: "AUTO" }), true, type);
  }
});

test("closed types are auto-graded regardless of grading_mode", () => {
  for (const type of ["MCQ", "TRUE_FALSE", "MATCHING", "FILL_BLANK", "ORDERING"]) {
    assert.equal(isQuestionAutoGraded({ type, grading_mode: "MANUAL" }), true, type);
  }
});

test("grading_mode is only a fallback when the type is missing", () => {
  assert.equal(isQuestionAutoGraded({ grading_mode: "AUTO" }), true);
  assert.equal(isQuestionAutoGraded({ grading_mode: "MANUAL" }), false);
  assert.equal(isOpenQuestionType({ grading_mode: "SEMI" }), true);
  assert.equal(isQuestionAutoGraded({}), false);
});
