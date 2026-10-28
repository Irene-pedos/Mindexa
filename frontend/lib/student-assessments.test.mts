// Run with: node --test lib/student-assessments.test.mts
import assert from "node:assert/strict"
import { test } from "node:test"

const S = await import(new URL("./student-assessments.ts", import.meta.url).href)

const base = {
  id: "a",
  title: "T",
  assessment_type: "CAT",
  status: "PUBLISHED",
  total_marks: 20,
  duration_minutes: 60,
  window_start: null,
  window_end: null,
  max_attempts: 2,
  attempts_used: 0,
  is_group_assessment: false,
  is_password_protected: false,
  ai_assistance_allowed: false,
  is_open_book: false,
  late_submission_allowed: false,
  is_supervised: false,
  integrity_monitoring_enabled: true,
  fullscreen_required: true,
  allow_resume: true,
}

test("tabOf groups the categories", () => {
  assert.equal(S.tabOf("IN_PROGRESS"), "active")
  assert.equal(S.tabOf("ACTIVE"), "active")
  assert.equal(S.tabOf("GRADED"), "submitted")
  assert.equal(S.tabOf("SUBMITTED"), "submitted")
  assert.equal(S.tabOf("VIOLATION"), "violations")
  assert.equal(S.tabOf("MISSED"), "missed")
  assert.equal(S.tabOf("UPCOMING"), "upcoming")
})

test("active tab puts a running attempt first, then the soonest deadline", () => {
  const items = [
    { ...base, id: "late", window_end: "2026-12-01T10:00:00Z" },
    { ...base, id: "soon", window_end: "2026-11-01T10:00:00Z" },
    { ...base, id: "running", student_status: "IN_PROGRESS", window_end: "2026-12-30T10:00:00Z" },
    { ...base, id: "open" },
  ]
  assert.deepEqual(
    S.sortForTab("active", items).map((a: { id: string }) => a.id),
    ["running", "soon", "late", "open"],
  )
})

test("upcoming tab is soonest first, finished tabs newest first", () => {
  const up = [
    { ...base, id: "b", window_start: "2026-12-01T10:00:00Z" },
    { ...base, id: "a", window_start: "2026-11-01T10:00:00Z" },
  ]
  assert.deepEqual(S.sortForTab("upcoming", up).map((a: { id: string }) => a.id), ["a", "b"])
  const done = [
    { ...base, id: "old", window_end: "2026-01-01T10:00:00Z" },
    { ...base, id: "new", window_end: "2026-06-01T10:00:00Z" },
  ]
  assert.deepEqual(S.sortForTab("submitted", done).map((a: { id: string }) => a.id), ["new", "old"])
})

test("sessionKind tells homework, practice and monitored sittings apart", () => {
  assert.equal(S.sessionKind({ assessment_type: "HOMEWORK", integrity_monitoring_enabled: true }), "homework")
  assert.equal(S.sessionKind({ assessment_type: "FORMATIVE", integrity_monitoring_enabled: false }), "practice")
  assert.equal(S.sessionKind({ assessment_type: "FORMATIVE", integrity_monitoring_enabled: true }), "exam")
  assert.equal(S.sessionKind({ assessment_type: "SUMMATIVE", integrity_monitoring_enabled: false }), "exam")
})

test("startRules only states what the assessment is really set to", () => {
  const rules = S.startRules({ ...base, ai_assistance_allowed: false, is_open_book: false })
  const byId = Object.fromEntries(rules.map((r: { id: string }) => [r.id, r]))
  assert.equal(byId.ai.title, "No AI assistance")
  assert.equal(byId.materials.title, "Closed book")
  assert.match(byId.monitoring.title, /Fullscreen/)
  assert.equal(byId.password, undefined)

  const open = S.startRules({
    ...base,
    ai_assistance_allowed: true,
    is_open_book: true,
    integrity_monitoring_enabled: false,
    allow_resume: false,
    is_password_protected: true,
  })
  const o = Object.fromEntries(open.map((r: { id: string }) => [r.id, r]))
  assert.equal(o.ai.title, "AI study assistant available")
  assert.equal(o.monitoring.title, "No integrity monitoring")
  assert.equal(o.resume.title, "No pausing")
  assert.ok(o.password)
})

test("attempt wording follows the attempts left", () => {
  const first = S.startRules({ ...base, max_attempts: 1, attempts_used: 0 }).find((r: { id: string }) => r.id === "attempts")
  assert.equal(first.title, "Attempt 1 of 1")
  assert.match(first.text, /last attempt/)
  const second = S.startRules({ ...base, max_attempts: 3, attempts_used: 1 }).find((r: { id: string }) => r.id === "attempts")
  assert.equal(second.title, "Attempt 2 of 3")
  assert.match(second.text, /2 attempts remain/)
})
