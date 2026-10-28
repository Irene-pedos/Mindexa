// Run with: node --test lib/academic-structure.test.mts
import assert from "node:assert/strict"
import { test } from "node:test"

const base = (file: string) => new URL(file, import.meta.url).href
const S = await import(base("./academic-structure.ts"))
const P = await import(base("./structure-profile.ts"))

const institution = { id: "i1", name: "Rwanda Polytechnic", code: "RP", timezone: "Africa/Kigali", is_active: true, settings: {} }
const empty = { institution, campuses: [], colleges: [], departments: [], programs: [], levels: [], classes: [] }

const klass = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, class_group_id: null, department_id: null, academic_year: "2026", capacity: null,
  location_type: "PHYSICAL_ROOM", room: null, is_active: true, student_count: 0, ...extra,
})

const polytechnic = {
  ...empty,
  colleges: [{ id: "c1", campus_id: null, name: "RP Huye College", code: "RPH", is_active: true }],
  departments: [{ id: "d1", campus_id: null, college_id: "c1", name: "ICT", code: "ICT", is_active: true, course_count: 5 }],
  programs: [{ id: "p1", department_id: "d1", name: "Information Technology", code: "IT", is_active: true }],
  levels: [
    { id: "y2", option_id: "p1", name: "Level 7", code: "L7", level: 7, is_active: true },
    { id: "y1", option_id: "p1", name: "Level 6", code: "L6", level: 6, is_active: true },
  ],
  classes: [
    klass("s1", "Year 1", { class_group_id: "y1", capacity: 40, student_count: 3 }),
    klass("s2", "Year 2", { class_group_id: "y1", capacity: 20, student_count: 2 }),
    klass("s3", "Evening class", { department_id: "d1", student_count: 4 }),
  ],
}

test("a college-based structure builds the full chain, campus-less", () => {
  const tree = S.buildTree(polytechnic)
  assert.equal(tree.children.length, 1)
  const college = tree.children[0]
  assert.equal(college.kind, "college")
  const dept = college.children[0]
  assert.equal(dept.kind, "department")
  assert.equal(dept.detail, "5 courses")
  // under the department: the programme first, then the class that has no programme
  assert.deepEqual(dept.children.map((c: { kind: string }) => c.kind), ["program", "class"])
  const levels = dept.children[0].children
  assert.deepEqual(levels.map((l: { name: string }) => l.name), ["Level 6", "Level 7"]) // by level number
})

test("classes and students are totalled up the tree", () => {
  const tree = S.buildTree(polytechnic)
  assert.equal(tree.classes, 3)
  assert.equal(tree.students, 9)
  const dept = tree.children[0].children[0]
  assert.equal(dept.classes, 3)
  const program = dept.children[0]
  assert.equal(program.students, 5)
})

test("a flat school structure (department > class) works without any other level", () => {
  const school = {
    ...empty,
    departments: [{ id: "d1", campus_id: null, college_id: null, name: "Secondary", code: "SEC", is_active: true, course_count: 0 }],
    classes: [klass("s1", "Grade 8A", { department_id: "d1", student_count: 30 })],
  }
  const tree = S.buildTree(school)
  assert.deepEqual(tree.children.map((c: { kind: string }) => c.kind), ["department"])
  assert.equal(tree.children[0].children[0].name, "Grade 8A")
  assert.equal(tree.students, 30)
})

test("records with a missing parent are kept under the institution, never dropped", () => {
  const broken = { ...empty, classes: [klass("s1", "Lost", { class_group_id: "gone" })] }
  const tree = S.buildTree(broken)
  assert.equal(tree.children.length, 1)
  assert.equal(tree.children[0].name, "Lost")
})

test("inactive records stay in the tree so they can be re-activated", () => {
  const withInactive = {
    ...polytechnic,
    departments: [...polytechnic.departments, { id: "d2", campus_id: null, college_id: null, name: "Suspended dept", code: "SD", is_active: false, course_count: 0 }],
  }
  const tree = S.buildTree(withInactive)
  const suspended = S.indexTree(tree).get("department:d2")
  assert.equal(suspended.isActive, false)
})

test("pathTo gives the breadcrumb from the institution down", () => {
  const tree = S.buildTree(polytechnic)
  assert.deepEqual(S.pathTo(tree, "class:s1").map((n: { kind: string }) => n.kind), ["institution", "college", "department", "program", "year", "class"])
  assert.deepEqual(S.pathTo(tree, "class:nope"), [])
})

test("what can be added depends on the levels an institution uses", () => {
  const all = P.presetProfile("university").enabled
  const school = P.presetProfile("school").enabled
  assert.deepEqual(S.allowedChildKinds("institution", all), ["campus", "college", "department"])
  assert.deepEqual(S.allowedChildKinds("institution", school), ["department"])
  assert.deepEqual(S.allowedChildKinds("department", all), ["program", "class"])
  assert.deepEqual(S.allowedChildKinds("department", school), ["class"])
  assert.deepEqual(S.allowedChildKinds("program", school), [])
  assert.deepEqual(S.allowedChildKinds("year", all), ["class"])
  assert.deepEqual(S.allowedChildKinds("class", all), [])
})

test("search shows matches with the ancestors that lead to them", () => {
  const tree = S.buildTree(polytechnic)
  const result = S.searchTree(tree, "evening")
  assert.ok(result.visible.has("class:s3"))
  assert.ok(result.visible.has("department:d1"))
  assert.ok(result.visible.has("college:c1"))
  assert.ok(!result.visible.has("class:s1"))
  assert.ok(result.expand.has("department:d1"))
  assert.equal(S.searchTree(tree, "   "), null)
  assert.ok(S.searchTree(tree, "ict").visible.has("department:d1")) // matches the code too
})

test("code suggestions are short, readable and unique", () => {
  assert.equal(S.suggestCode("Faculty of Engineering"), "FE")
  assert.equal(S.suggestCode("Law"), "LAW")
  assert.equal(S.suggestCode("Information Communication and Technology"), "ICT")
  assert.equal(S.suggestCode("Law", ["LAW"]), "LAW2")
  assert.equal(S.suggestCode("Law", ["law", "LAW2"]), "LAW3")
  assert.equal(S.suggestCode("X"), "XX")
})

test("code and name validation explain what is wrong", () => {
  assert.equal(S.validateCode("ict", ["ICT"]), "Another item here already uses this code.")
  assert.equal(S.validateCode("", []), "A code is required.")
  assert.match(S.validateCode("a", []), /2–20/)
  assert.match(S.validateCode("bad code!", []), /2–20/)
  assert.equal(S.validateCode("ok-1", ["ICT"]), null)
  assert.equal(S.validateName("  "), "A name is required.")
  assert.equal(S.validateName("Law"), null)
})

test("suspending warns about the active items below", () => {
  const tree = S.buildTree(polytechnic)
  const dept = tree.children[0].children[0]
  assert.equal(S.activeDescendants(dept), 6) // programme, 2 levels, 3 classes
})

// ── structure profile ──────────────────────────────────────────────────────────────────────

test("an institution that has not chosen yet gets every level and the standard names", () => {
  assert.equal(P.readProfile({}), null)
  const profile = P.profileOrDefault({})
  assert.ok(Object.values(profile.enabled).every(Boolean))
  assert.equal(profile.labels.class.singular, "Class")
})

test("a saved profile round-trips through settings", () => {
  const school = P.presetProfile("school")
  const restored = P.readProfile(P.profileToSettings(school))
  assert.deepEqual(restored.enabled, school.enabled)
  assert.equal(restored.labels.department.singular, "Division")
  assert.equal(restored.preset, "school")
})

test("invalid saved data falls back instead of breaking the page", () => {
  const messy = {
    structure_profile: {
      preset: "nonsense",
      labels: { class: { singular: "", plural: "x" }, department: { singular: "Faculty", plural: "Faculties" } },
      enabled: { department: false, class: false, campus: "yes" },
    },
  }
  const profile = P.readProfile(messy)
  assert.equal(profile.labels.class.singular, "Class") // blank label ignored
  assert.equal(profile.labels.department.singular, "Faculty")
  assert.equal(profile.enabled.department, true) // required levels cannot be switched off
  assert.equal(profile.enabled.class, true)
  assert.equal(profile.enabled.campus, true) // non-boolean ignored
})

test("a year level cannot be on without programmes", () => {
  const profile = P.normalizeProfile({ ...P.presetProfile("custom"), enabled: { ...P.presetProfile("custom").enabled, program: false, year: true } })
  assert.equal(profile.enabled.year, false)
})
