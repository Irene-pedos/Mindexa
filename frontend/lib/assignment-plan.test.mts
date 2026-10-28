// Run with: node --test lib/assignment-plan.test.mts
import assert from "node:assert/strict"
import { test } from "node:test"

const P = await import(new URL("./assignment-plan.ts", import.meta.url).href)

const structure = {
  institution: { id: "i1", name: "RP", code: "RP", timezone: "UTC", is_active: true, settings: {} },
  campuses: [],
  colleges: [],
  departments: [
    { id: "d1", campus_id: null, college_id: null, name: "ICT", code: "ICT", is_active: true, course_count: 2 },
    { id: "d2", campus_id: null, college_id: null, name: "Law", code: "LAW", is_active: true, course_count: 1 },
  ],
  programs: [{ id: "p1", department_id: "d1", name: "Information Technology", code: "IT", is_active: true }],
  levels: [{ id: "y1", option_id: "p1", name: "Level 6", code: "L6", level: 6, is_active: true }],
  classes: [
    { id: "c1", class_group_id: "y1", department_id: "d1", name: "Year 1", academic_year: "2026", capacity: 40, location_type: "PHYSICAL_ROOM", room: null, is_active: true, student_count: 0 },
    { id: "c2", class_group_id: null, department_id: "d1", name: "Evening", academic_year: "2026", capacity: null, location_type: "PHYSICAL_ROOM", room: null, is_active: true, student_count: 0 },
    { id: "c3", class_group_id: null, department_id: "d2", name: "Law A", academic_year: "2026", capacity: null, location_type: "PHYSICAL_ROOM", room: null, is_active: true, student_count: 0 },
  ],
}

const course = (id: string, departments: string[]) => ({ id, code: id.toUpperCase(), title: id, institution_id: "i1", department_ids: departments })
const base = { lecturerId: "L1", periodId: "per1", academicYear: "2026/2027", role: "MAIN_LECTURER", structure }

test("no class chosen: one department-wide assignment per course", () => {
  const { assignments, problems } = P.buildAssignments({ ...base, courses: [course("a", ["d1"]), course("b", ["d1"])], classIds: [] })
  assert.equal(assignments.length, 2)
  assert.deepEqual(problems, [])
  assert.equal(assignments[0].department_id, "d1")
  assert.equal(assignments[0].class_section_id, null)
  assert.equal(assignments[0].option_id, null)
  assert.equal(assignments[0].lecturer_id, "L1")
  assert.equal(assignments[0].academic_year, "2026/2027")
})

test("classes chosen: one assignment per course and class, with the programme filled in", () => {
  const { assignments } = P.buildAssignments({ ...base, courses: [course("a", ["d1"])], classIds: ["c1", "c2"] })
  assert.equal(assignments.length, 2)
  const year1 = assignments.find((a: { class_section_id: string }) => a.class_section_id === "c1")
  assert.equal(year1.option_id, "p1") // from its year level
  assert.equal(year1.department_id, "d1")
  const evening = assignments.find((a: { class_section_id: string }) => a.class_section_id === "c2")
  assert.equal(evening.option_id, null) // directly under the department
})

test("a class from a department that does not offer the course is skipped, and said so", () => {
  const { assignments, problems } = P.buildAssignments({ ...base, courses: [course("a", ["d1"])], classIds: ["c3"] })
  assert.equal(assignments.length, 0)
  assert.match(problems[0], /A is not offered to any of the chosen classes/)
})

test("a mix of matching and non-matching classes keeps the matches", () => {
  const { assignments, problems } = P.buildAssignments({ ...base, courses: [course("a", ["d1"])], classIds: ["c1", "c3"] })
  assert.equal(assignments.length, 1)
  assert.deepEqual(problems, [])
})

test("a course with no department cannot be planned", () => {
  const { assignments, problems } = P.buildAssignments({ ...base, courses: [course("a", [])], classIds: [] })
  assert.equal(assignments.length, 0)
  assert.match(problems[0], /no department/)
})

test("a course offered by several departments uses the department of the chosen class", () => {
  const { assignments } = P.buildAssignments({ ...base, courses: [course("a", ["d1", "d2"])], classIds: ["c3"] })
  assert.equal(assignments[0].department_id, "d2")
})

test("class labels show the path through programme and year level", () => {
  assert.equal(P.classLabel(structure, "c1"), "Information Technology › Level 6 › Year 1")
  assert.equal(P.classLabel(structure, "c2"), "Evening")
  assert.equal(P.classLabel(structure, "nope"), "Unknown class")
  assert.equal(P.classDepartmentId(structure, "c1"), "d1")
  assert.equal(P.classDepartmentId(structure, "c3"), "d2")
})

test("the default period is the one containing today, else the latest", () => {
  const periods = [
    { id: "old", start_date: "2024-08-01", end_date: "2025-08-01" },
    { id: "now", start_date: "2026-08-01", end_date: "2027-08-01" },
    { id: "next", start_date: "2027-08-02", end_date: "2028-08-01" },
  ]
  assert.equal(P.defaultPeriodId(periods, new Date("2026-10-27")), "now")
  assert.equal(P.defaultPeriodId(periods, new Date("2030-01-01")), "next")
  assert.equal(P.defaultPeriodId([], new Date()), "")
})
