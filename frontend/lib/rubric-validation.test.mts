// Run with: node --test lib/rubric-validation.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";

const { rubricProblems } = await import(new URL("./rubric-validation.ts", import.meta.url).href);

const good = [
  { title: "Correctness", max_marks: 6, levels: [{ label: "Full", marks: 6 }, { label: "None", marks: 0 }] },
  { title: "Clarity", max_marks: 4, levels: [{ label: "Full", marks: 4 }, { label: "None", marks: 0 }] },
];

test("a balanced, well-formed rubric has no problems", () => {
  assert.deepEqual(rubricProblems(good, 10), []);
});

test("an empty rubric is rejected", () => {
  assert.deepEqual(rubricProblems([], 10), ["Add at least one criterion."]);
});

test("criteria that do not add up to the question marks are reported", () => {
  const problems = rubricProblems(good, 12);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /add up to 10 marks, but the question is worth 12/);
});

test("a level worth more than its criterion is reported with names", () => {
  const bad = [{ title: "Depth", max_marks: 3, levels: [{ label: "Excellent", marks: 5 }] }];
  const problems = rubricProblems(bad, 3);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"Depth".*"Excellent".*5.*maximum of 3/);
});

test("a blank criterion name is reported", () => {
  const unnamed = [{ title: "  ", max_marks: 5, levels: [] }];
  assert.ok(rubricProblems(unnamed, 5).includes("Criterion #1 needs a name."));
});
