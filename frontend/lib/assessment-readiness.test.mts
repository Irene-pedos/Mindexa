// Run with: node --test lib/assessment-readiness.test.mts
// (Node 24 runs TypeScript directly; no test framework is installed in this project.)
import assert from "node:assert/strict";
import { test } from "node:test";

// Dynamic import keeps `tsc` from resolving the .ts extension (tsconfig has no allowImportingTsExtensions).
const mod = await import(new URL("./assessment-readiness.ts", import.meta.url).href);
const { analyzeQuestion, analyzePaper, nextUnfinished, statusOf } = mod;

const opt = (text: string, is_correct = false, extra: Record<string, unknown> = {}) => ({
  option_text: text,
  is_correct,
  ...extra,
});
const q = (over: Record<string, unknown> = {}) => ({
  id: "q1",
  sectionId: "s1",
  text: "What does HTML stand for in web development?",
  type: "mcq",
  marks: 2,
  options: [opt("HyperText Markup Language", true), opt("A"), opt("B"), opt("C")],
  ...over,
});
type Issue = { code: string; severity?: string; fix?: string };
const codes = (issues: Array<{ code: string }>) => issues.map((i) => i.code).sort();

test("a complete MCQ has no issues", () => {
  assert.deepEqual(analyzeQuestion(q()), []);
});

test("MCQ without a correct answer or enough options is blocking", () => {
  assert.deepEqual(codes(analyzeQuestion(q({ options: [opt("A"), opt("B"), opt("C"), opt("D")] }))), ["NO_CORRECT"]);
  const few = analyzeQuestion(q({ options: [opt("only one", true)] }));
  assert.ok(few.some((i: Issue) => i.code === "FEW_OPTIONS" && i.severity === "blocking" && i.fix === "add_distractors"));
});

test("a case study with no sub-questions is blocking and AI-fixable", () => {
  const issues = analyzeQuestion(q({ type: "casestudy", text: "", caseStudyContext: "A shop is slow.", options: [] }));
  const missing = issues.find((i: Issue) => i.code === "NO_SUB_QUESTIONS");
  assert.ok(missing);
  assert.equal(missing.severity, "blocking");
  assert.equal(missing.fix, "add_sub_questions");
  assert.ok(!issues.some((i: Issue) => i.code === "EMPTY_STEM"), "case studies keep their text in the scenario");
});

test("a complete case study passes; missing guidance only warns", () => {
  const parts = [
    opt("Find the bottleneck", true, { match_key: "4", option_text_right: "Slow queries" }),
    opt("Propose a fix", true, { match_key: "6", option_text_right: "" }),
  ];
  const issues = analyzeQuestion(q({ type: "casestudy", caseStudyContext: "Scenario", marks: 10, options: parts }));
  assert.deepEqual(codes(issues), ["SUB_NO_GUIDANCE"]);
  assert.equal(statusOf(issues), "review");
});

test("open-ended questions warn when the model answer is missing", () => {
  const issues = analyzeQuestion(q({ type: "shortanswer", options: [] }));
  assert.deepEqual(codes(issues), ["NO_MODEL_ANSWER"]);
  assert.equal(issues[0].fix, "add_explanation");
});

test("fill-in-the-blank needs a marker and an answer per blank", () => {
  assert.deepEqual(codes(analyzeQuestion(q({ type: "fillblank", text: "HTML stands for HyperText Markup Language", options: [] }))), ["NO_BLANK"]);
  const two = analyzeQuestion(q({ type: "fillblank", text: "[blank] is the structure and [blank] the style", options: [opt("HTML", true)] }));
  assert.deepEqual(codes(two), ["BLANK_ANSWERS"]);
});

test("matching needs complete pairs", () => {
  const issues = analyzeQuestion(
    q({ type: "matching", options: [opt("HTML", true, { option_text_right: "structure" }), opt("CSS", true, { option_text_right: "" })] }),
  );
  assert.deepEqual(codes(issues), ["INCOMPLETE_PAIRS"]);
});

test("paper: marks vs blueprint, summative policy total and short sections", () => {
  const sections = [{ id: "s1", section: "Section A", marks: 50, questions: 5 }];
  const result = analyzePaper({
    questions: [q({ marks: 10 }), q({ id: "q2", marks: 10 })],
    sections,
    blueprintTotal: 50,
    policyTotal: 100,
    isSummative: true,
  });
  const paper = codes(result.paper);
  assert.ok(paper.includes("MARKS_MISMATCH"));
  assert.ok(paper.includes("POLICY_TOTAL"));
  const short = result.paper.find((p: { code: string }) => p.code === "SECTION_SHORT");
  assert.equal(short.missingCount, 3);
  assert.equal(short.sectionId, "s1");
  assert.ok(result.summary.blocking >= 2);
});

test("policy total is only checked for summative papers", () => {
  const result = analyzePaper({
    questions: [q({ marks: 10 })],
    sections: [],
    blueprintTotal: 10,
    policyTotal: 100,
    isSummative: false,
  });
  assert.equal(result.paper.length, 0);
});

test("AI drafts count as unreviewed until the lecturer has seen them", () => {
  const input = { questions: [q({ aiGenerated: true })], sections: [], blueprintTotal: 2 };
  assert.equal(analyzePaper(input).summary.aiUnreviewed, 1);
  assert.equal(analyzePaper({ ...input, reviewedIds: new Set(["q1"]) }).summary.aiUnreviewed, 0);
});

test("nextUnfinished walks forward, wraps, and returns null when everything is ready", () => {
  const qs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const status = { a: "needs_work", b: "ready", c: "review" };
  assert.equal(nextUnfinished(qs, status, "a"), "c");
  assert.equal(nextUnfinished(qs, status, "c"), "a");
  assert.equal(nextUnfinished(qs, { a: "ready", b: "ready", c: "ready" }, "a"), null);
});


test("the institution decides how strictly the policy total applies", () => {
  const base = { questions: [q({ marks: 10 })], sections: [], blueprintTotal: 10, policyTotal: 100, isSummative: true };
  const find = (r: { paper: Array<{ code: string; severity: string }> }) => r.paper.find((p) => p.code === "POLICY_TOTAL");

  assert.equal(find(analyzePaper({ ...base, policyTotalMode: "BLOCKING" }))?.severity, "blocking");
  assert.equal(find(analyzePaper(base))?.severity, "blocking", "required unless the institution says otherwise");
  assert.equal(find(analyzePaper({ ...base, policyTotalMode: "WARNING" }))?.severity, "warning");
  assert.equal(find(analyzePaper({ ...base, policyTotalMode: "OFF" })), undefined);
  assert.equal(analyzePaper({ ...base, policyTotalMode: "WARNING" }).summary.blocking, 0, "advice does not block submitting");
});