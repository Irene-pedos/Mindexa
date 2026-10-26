// Run with: node --test lib/grading-session.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";

const s = await import(new URL("./grading-session.ts", import.meta.url).href);

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const draft = { score: "7", feedback: "Good", rubricScores: [{ score: 7 }], savedAt: Date.now() };

test("draft round-trips and is listed", () => {
  const st = memoryStorage();
  s.writeDraft(st, "sub-1", draft);
  assert.deepEqual(s.readDraft(st, "sub-1"), draft);
  assert.deepEqual(s.listDraftIds(st), ["sub-1"]);
});

test("old drafts expire and are removed", () => {
  const st = memoryStorage();
  s.writeDraft(st, "sub-1", { ...draft, savedAt: Date.now() - 15 * 24 * 60 * 60 * 1000 });
  assert.equal(s.readDraft(st, "sub-1"), null);
  assert.deepEqual(s.listDraftIds(st), []);
});

test("clearDraftIfSaved keeps text typed while the save was in flight", () => {
  const st = memoryStorage();
  s.writeDraft(st, "sub-1", draft);
  s.clearDraftIfSaved(st, "sub-1", { score: "7", feedback: "Goo" }); // older text saved
  assert.notEqual(s.readDraft(st, "sub-1"), null);
  s.clearDraftIfSaved(st, "sub-1", { score: " 7 ", feedback: "Good" });
  assert.equal(s.readDraft(st, "sub-1"), null);
});

test("draftDiffers compares against the server copy", () => {
  assert.equal(s.draftDiffers(draft, { score: "7", feedback: "Good" }), false);
  assert.equal(s.draftDiffers(draft, { score: "", feedback: "" }), true);
});

test("corrupt or unavailable storage never throws", () => {
  const st = memoryStorage();
  st.setItem("mindexa.grading.draft.v1:bad", "{not json");
  assert.equal(s.readDraft(st, "bad"), null);
  const broken = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
    key: () => { throw new Error("blocked"); },
    length: 1,
  };
  assert.doesNotThrow(() => s.writeDraft(broken, "x", draft));
  assert.equal(s.readDraft(broken, "x"), null);
  assert.deepEqual(s.listDraftIds(broken), []);
  assert.equal(s.readResumePoint(broken), null);
});

test("resume point round-trips and builds a URL", () => {
  const st = memoryStorage();
  const point = {
    assessmentId: "a1", assessmentTitle: "CAT 1", classId: "c1", className: "Year 2",
    attemptId: "t1", studentName: "Student", questionId: "q1", questionNumber: 3, updatedAt: 5,
  };
  s.writeResumePoint(st, point);
  assert.deepEqual(s.readResumePoint(st), point);
  assert.equal(
    s.resumeSearchParams(point).toString(),
    "assessment=a1&class=c1&attempt=t1&question=q1",
  );
  assert.equal(s.resumeSearchParams({ assessmentId: "a1" }).toString(), "assessment=a1");
  s.clearResumePoint(st);
  assert.equal(s.readResumePoint(st), null);
});

test("network failures are told apart from server answers", () => {
  assert.equal(s.isNetworkFailure(new Error("500"), false), true);
  assert.equal(s.isNetworkFailure(new TypeError("Failed to fetch"), true), true);
  assert.equal(s.isNetworkFailure(new Error("Network error"), true), true);
  assert.equal(s.isNetworkFailure(new Error("Score must be between 0 and 10"), true), false);
});

test("scoped storage keeps one user's data invisible to another", () => {
  const raw = memoryStorage();
  const alice = s.scopedStorage(raw, "alice");
  const bob = s.scopedStorage(raw, "bob");

  s.writeDraft(alice, "sub-1", draft);
  s.writeResumePoint(alice, {
    assessmentId: "a1", assessmentTitle: "CAT 1", classId: null, className: null,
    attemptId: null, studentName: null, questionId: null, questionNumber: null, updatedAt: 1,
  });

  assert.deepEqual(s.listDraftIds(alice), ["sub-1"]);
  assert.notEqual(s.readResumePoint(alice), null);
  // Bob, on the same browser, sees nothing of Alice's work
  assert.equal(s.readDraft(bob, "sub-1"), null);
  assert.deepEqual(s.listDraftIds(bob), []);
  assert.equal(s.readResumePoint(bob), null);

  // Clearing is per user too
  s.clearResumePoint(bob);
  assert.notEqual(s.readResumePoint(alice), null);
  s.clearResumePoint(alice);
  assert.equal(s.readResumePoint(alice), null);
});

test("legacy unscoped grading data is purged without touching scoped data or other keys", () => {
  const raw = memoryStorage();
  raw.setItem("mindexa.grading.draft.v1:old", "{}");
  raw.setItem("mindexa.grading.resume.v1", "{}");
  raw.setItem("theme", "dark");
  const alice = s.scopedStorage(raw, "alice");
  s.writeDraft(alice, "sub-1", draft);

  s.purgeLegacyGradingData(raw);

  assert.equal(raw.getItem("mindexa.grading.draft.v1:old"), null);
  assert.equal(raw.getItem("mindexa.grading.resume.v1"), null);
  assert.equal(raw.getItem("theme"), "dark");
  assert.notEqual(s.readDraft(alice, "sub-1"), null);
});
