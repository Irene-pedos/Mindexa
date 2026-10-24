// Run with: node --test lib/moderation-feedback.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";

const { buildFeedbackFromChecks, mergeFeedback, FEEDBACK_HEADER } = await import(
  new URL("./moderation-feedback.ts", import.meta.url).href
);

const structure = {
  code: "STRUCTURE",
  severity: "WARNING",
  passed: false,
  message:
    "Section A should be CLOSED questions, found MIXED.; Section 'Section B' should have more questions than required (found pool_size=2, questions_to_answer=None).",
};
const marks = { code: "MARKS_TOTAL", severity: "BLOCKING", passed: false, message: "Marks total 70 does not match 100." };
const ok = { code: "QUESTIONS_COMPLETE", severity: "BLOCKING", passed: true, message: "All good." };

test("passing checks produce no feedback", () => {
  assert.equal(buildFeedbackFromChecks([ok]), "");
});

test("required problems come first and each reported problem is its own bullet", () => {
  const text = buildFeedbackFromChecks([structure, marks, ok]);
  const lines = text.split("\n").filter((l: string) => l.startsWith("- "));
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^- \[Marks total\] Marks total 70/);
  assert.match(lines[1], /\[Structure\] \(advisory\) Section A should be CLOSED/);
  assert.ok(text.endsWith("Additional comments from the moderator:\n"));
});

test("merging keeps what the moderator typed and never duplicates the list", () => {
  const typed = "Also check question 4.";
  const once = mergeFeedback(typed, [marks]);
  assert.ok(once.includes(typed) && once.includes(FEEDBACK_HEADER));
  assert.equal(mergeFeedback(once, [marks]), once);
  assert.equal(mergeFeedback("", [ok]), "");
});
