// Run with: node --test lib/academic-period.test.mts
import assert from "node:assert/strict"
import { test } from "node:test"

const P = await import(new URL("./academic-period.ts", import.meta.url).href)

const period = (id: string, name: string, type: string, start: string, end: string, active = true) => ({
  id,
  name,
  period_type: type,
  start_date: start,
  end_date: end,
  is_active: active,
})

test("periodState compares plain dates", () => {
  assert.equal(P.periodState("2026-09-01", "2027-01-31", "2026-10-28"), "current")
  assert.equal(P.periodState("2026-09-01", "2027-01-31", "2026-08-31"), "upcoming")
  assert.equal(P.periodState("2026-09-01", "2027-01-31", "2027-02-01"), "past")
  assert.equal(P.periodState("2026-09-01", "2027-01-31", "2027-01-31"), "current")
})

test("suggestEndDate ends the day before the next period would start", () => {
  assert.equal(P.suggestEndDate("SEMESTER", "2026-09-01"), "2027-02-28")
  assert.equal(P.suggestEndDate("YEAR", "2026-09-01"), "2027-08-31")
  assert.equal(P.suggestEndDate("QUARTER", "2026-01-01"), "2026-03-31")
  assert.equal(P.suggestEndDate("SEMESTER", "bad"), "")
})

test("suggestEndDate clamps month ends instead of rolling over", () => {
  assert.equal(P.suggestEndDate("QUARTER", "2026-11-30"), "2027-02-27")
  assert.equal(P.suggestEndDate("TRIMESTER", "2026-10-31"), "2027-02-27")
})

test("suggestName skips names already used", () => {
  assert.equal(P.suggestName("SEMESTER", "2026-09-01"), "Semester 1 2026")
  assert.equal(P.suggestName("SEMESTER", "2026-09-01", ["semester 1 2026"]), "Semester 2 2026")
  assert.equal(P.suggestName("YEAR", "2026-09-01"), "2026-2027 Academic Year")
  assert.equal(P.suggestName("YEAR", "2026-01-01"), "2026 Academic Year")
})

test("validatePeriod explains each problem", () => {
  const others = [period("a", "Semester 1 2026", "SEMESTER", "2026-09-01", "2027-02-28")]
  const ok = { name: "Semester 2 2026", type: "SEMESTER", start: "2027-03-01", end: "2027-08-31" }
  assert.deepEqual(P.validatePeriod(ok, others), {})

  assert.ok(P.validatePeriod({ ...ok, name: " " }, others).name)
  assert.ok(P.validatePeriod({ ...ok, name: "semester 1 2026" }, others).name)
  assert.ok(P.validatePeriod({ ...ok, end: "2027-03-01" }, others).end)
  assert.ok(P.validatePeriod({ ...ok, start: "" }, others).start)
})

test("same-type overlap is an error, a year around a semester is not", () => {
  const others = [period("a", "Semester 1 2026", "SEMESTER", "2026-09-01", "2027-02-28")]
  const clash = { name: "Semester X", type: "SEMESTER", start: "2027-02-01", end: "2027-06-30" }
  assert.match(P.validatePeriod(clash, others).start ?? "", /overlap "Semester 1 2026"/)

  const year = { name: "2026-2027", type: "YEAR", start: "2026-09-01", end: "2027-08-31" }
  assert.deepEqual(P.validatePeriod(year, others), {})
})

test("editing a period ignores itself and inactive periods", () => {
  const others = [
    period("a", "Semester 1", "SEMESTER", "2026-09-01", "2027-02-28"),
    period("b", "Old", "SEMESTER", "2027-01-01", "2027-06-30", false),
  ]
  const draft = { name: "Semester 1", type: "SEMESTER", start: "2026-09-01", end: "2027-02-28" }
  assert.deepEqual(P.validatePeriod(draft, others, "a"), {})
})

test("durationLabel and daysFrom", () => {
  assert.equal(P.durationLabel("2026-09-01", "2027-02-28"), "6 months")
  assert.equal(P.durationLabel("2026-09-01", "2026-09-10"), "10 days")
  assert.equal(P.daysFrom("2026-10-28", "2026-11-05"), 8)
})
