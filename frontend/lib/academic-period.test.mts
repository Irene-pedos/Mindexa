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

const sem = (id: string, name: string, start: string, end: string, parent: string | null, active = true) => ({
  id,
  name,
  period_type: parent ? "SEMESTER" : "YEAR",
  start_date: start,
  end_date: end,
  is_active: active,
  parent_id: parent,
})

const RP = [
  sem("y", "2026-2027", "2026-08-17", "2027-07-27", null),
  sem("s2", "Semester 2 2026-2027", "2027-01-04", "2027-06-04", "y"),
  sem("s1", "Semester 1 2026-2027", "2026-09-01", "2026-12-18", "y"),
  sem("old", "2025-2026", "2025-08-18", "2026-07-20", null),
]

test("groupByYear nests semesters in date order, newest year first", () => {
  const groups = P.groupByYear(RP)
  assert.deepEqual(groups.map((g: { year: { id: string } }) => g.year.id), ["y", "old"])
  assert.deepEqual(groups[0].children.map((c: { id: string }) => c.id), ["s1", "s2"])
})

test("a semester whose year is missing stands alone", () => {
  const groups = P.groupByYear([RP[1]])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].year.id, "s2")
})

test("pickerGroups hides a year that has semesters and keeps a bare year", () => {
  const groups = P.pickerGroups(RP)
  assert.deepEqual(groups[0], { label: null, items: [{ id: "old", label: "2025-2026" }] })
  assert.equal(groups[1].label, "2026-2027")
  assert.deepEqual(groups[1].items.map((i: { id: string }) => i.id), ["s1", "s2"])
})

test("defaultPickerId prefers the running semester", () => {
  assert.equal(P.defaultPickerId(RP, "2026-10-28"), "s1")
  assert.equal(P.defaultPickerId(RP, "2027-02-01"), "s2")
  // Between semesters (the December holiday): the most recent period that has started or the latest one.
  assert.ok(["s1", "s2"].includes(P.defaultPickerId(RP, "2026-12-25")))
})

test("a semester must stay inside its year", () => {
  const year = RP[0]
  const inside = { name: "Term 3 2026-2027", type: "SEMESTER", start: "2027-02-01", end: "2027-05-01" }
  assert.deepEqual(P.validatePeriod(inside, [], undefined, year), {})
  const outside = { ...inside, end: "2027-09-01" }
  assert.match(P.validatePeriod(outside, [], undefined, year).start ?? "", /inside 2026-2027/)
})

test("suggestName carries the year for a semester", () => {
  assert.equal(P.suggestName("SEMESTER", "2026-09-01", [], "2026-2027"), "Semester 1 2026-2027")
  assert.equal(P.suggestName("SEMESTER", "2026-09-01", ["Semester 1 2026-2027"], "2026-2027"), "Semester 2 2026-2027")
})

test("eventKind falls back to Other and formatDateRange collapses one day", () => {
  assert.equal(P.eventKind("HOLIDAY").label, "Holiday / break")
  assert.equal(P.eventKind("???").value, "OTHER")
  assert.equal(P.formatDateRange("2026-08-17", "2026-08-17"), "17 Aug 2026")
  assert.equal(P.formatDateRange("2026-08-17", "2026-08-21"), "17 Aug 2026 – 21 Aug 2026")
})
