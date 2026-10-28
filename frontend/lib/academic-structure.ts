/**
 * The academic structure of one institution as a tree.
 *
 * The API returns flat lists with parent ids (any shape of organisation: campuses and colleges
 * are optional, a class may hang off a year level or directly off a department). This module
 * turns them into one tree for the admin "Organization builder" and answers the questions the
 * screens ask: what can be added here, where is this node, which nodes match a search.
 *
 * Pure functions only: no React, no fetching. Types from structure-profile are imported as types
 * so this file stays directly runnable by the node test runner.
 */
import type { LevelKey } from "./structure-profile"

// ── API shapes (mirror backend app/schemas/academic_structure.py) ────────────────────────────

export interface StructureInstitutionDto {
  id: string
  name: string
  code: string
  timezone: string
  is_active: boolean
  settings: Record<string, unknown> | null
}
export interface StructureCampusDto {
  id: string
  name: string
  code: string
  is_active: boolean
}
export interface StructureCollegeDto {
  id: string
  campus_id: string | null
  name: string
  code: string
  is_active: boolean
}
export interface StructureDepartmentDto {
  id: string
  campus_id: string | null
  college_id: string | null
  name: string
  code: string
  is_active: boolean
  course_count: number
}
export interface StructureProgramDto {
  id: string
  department_id: string
  name: string
  code: string
  is_active: boolean
}
export interface StructureLevelDto {
  id: string
  option_id: string
  name: string
  code: string
  level: number | null
  is_active: boolean
}
export interface StructureClassDto {
  id: string
  class_group_id: string | null
  department_id: string | null
  name: string
  academic_year: string | null
  capacity: number | null
  location_type: string | null
  room: string | null
  is_active: boolean
  student_count: number
}
export interface AcademicStructure {
  institution: StructureInstitutionDto
  campuses: StructureCampusDto[]
  colleges: StructureCollegeDto[]
  departments: StructureDepartmentDto[]
  programs: StructureProgramDto[]
  levels: StructureLevelDto[]
  classes: StructureClassDto[]
}

// ── Tree ─────────────────────────────────────────────────────────────────────────────────────

export type NodeKind = "institution" | LevelKey

export interface TreeNode {
  /** Unique across the tree: `${kind}:${id}`. */
  key: string
  kind: NodeKind
  id: string
  name: string
  code: string | null
  isActive: boolean
  /** Short secondary text, e.g. "Level 6" or "40 seats". */
  detail: string
  /** Classes in this subtree (a class counts itself). */
  classes: number
  /** Active students in this subtree. */
  students: number
  children: TreeNode[]
  /** Level-specific details, present only on the kinds they belong to. */
  extra: NodeExtra
}

export interface NodeExtra {
  /** Year level number. */
  level?: number | null
  /** Class details. */
  capacity?: number | null
  room?: string | null
  locationType?: string | null
  academicYear?: string | null
  /** Department: courses that belong to it. */
  courses?: number
}

const KIND_RANK: Record<NodeKind, number> = {
  institution: 0,
  campus: 1,
  college: 2,
  department: 3,
  program: 4,
  year: 5,
  class: 6,
}

export const nodeKey = (kind: NodeKind, id: string): string => `${kind}:${id}`

function makeNode(
  kind: NodeKind,
  id: string,
  name: string,
  code: string | null,
  isActive: boolean,
  detail = "",
  own = { classes: 0, students: 0 },
  extra: NodeExtra = {},
): TreeNode {
  return { key: nodeKey(kind, id), kind, id, name, code, isActive, detail, children: [], extra, ...own }
}

const byName = (a: TreeNode, b: TreeNode): number => a.name.localeCompare(b.name, undefined, { numeric: true })

export function buildTree(structure: AcademicStructure): TreeNode {
  const { institution } = structure
  const root = makeNode("institution", institution.id, institution.name, institution.code, institution.is_active)

  const campuses = new Map(structure.campuses.map((c) => [c.id, makeNode("campus", c.id, c.name, c.code, c.is_active)]))
  const colleges = new Map(
    structure.colleges.map((c) => [c.id, makeNode("college", c.id, c.name, c.code, c.is_active)]),
  )
  const departments = new Map(
    structure.departments.map((d) => [
      d.id,
      makeNode(
        "department",
        d.id,
        d.name,
        d.code,
        d.is_active,
        d.course_count ? `${d.course_count} course${d.course_count === 1 ? "" : "s"}` : "",
        undefined,
        { courses: d.course_count },
      ),
    ]),
  )
  const programs = new Map(
    structure.programs.map((p) => [p.id, makeNode("program", p.id, p.name, p.code, p.is_active)]),
  )
  const years = new Map(
    structure.levels.map((l) => [
      l.id,
      makeNode("year", l.id, l.name, l.code, l.is_active, l.level != null ? `Level ${l.level}` : "", undefined, {
        level: l.level,
      }),
    ]),
  )

  // Nothing is ever dropped: a record whose parent is missing is shown under the institution.
  const attach = (child: TreeNode, parent: TreeNode | undefined) => (parent ?? root).children.push(child)

  campuses.forEach((n) => attach(n, undefined))
  structure.colleges.forEach((c) => attach(colleges.get(c.id)!, c.campus_id ? campuses.get(c.campus_id) : undefined))
  structure.departments.forEach((d) => {
    const parent = d.college_id ? colleges.get(d.college_id) : d.campus_id ? campuses.get(d.campus_id) : undefined
    attach(departments.get(d.id)!, parent)
  })
  structure.programs.forEach((p) => attach(programs.get(p.id)!, departments.get(p.department_id)))
  structure.levels.forEach((l) => attach(years.get(l.id)!, programs.get(l.option_id)))
  structure.classes.forEach((c) => {
    const detail = [c.capacity ? `${c.capacity} seats` : "", c.room ?? ""].filter(Boolean).join(" · ")
    const node = makeNode(
      "class",
      c.id,
      c.name,
      null,
      c.is_active,
      detail,
      { classes: 1, students: c.student_count },
      {
        capacity: c.capacity,
        room: c.room,
        locationType: c.location_type,
        academicYear: c.academic_year,
      },
    )
    const parent = c.class_group_id
      ? years.get(c.class_group_id)
      : c.department_id
        ? departments.get(c.department_id)
        : undefined
    attach(node, parent)
  })

  sortAndTotal(root)
  return root
}

function sortAndTotal(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (KIND_RANK[a.kind] !== KIND_RANK[b.kind]) return KIND_RANK[a.kind] - KIND_RANK[b.kind]
    if (a.kind === "year" && b.kind === "year") {
      const levelOf = (n: TreeNode) => Number(/Level (\d+)/.exec(n.detail)?.[1] ?? Number.MAX_SAFE_INTEGER)
      return levelOf(a) - levelOf(b) || byName(a, b)
    }
    return byName(a, b)
  })
  for (const child of node.children) {
    sortAndTotal(child)
    node.classes += child.classes
    node.students += child.students
  }
}

// ── Lookups ──────────────────────────────────────────────────────────────────────────────────

export function indexTree(root: TreeNode): Map<string, TreeNode> {
  const index = new Map<string, TreeNode>()
  const walk = (n: TreeNode) => {
    index.set(n.key, n)
    n.children.forEach(walk)
  }
  walk(root)
  return index
}

/** Nodes from the root down to `key` (inclusive); empty when the key is not in the tree. */
export function pathTo(root: TreeNode, key: string): TreeNode[] {
  if (root.key === key) return [root]
  for (const child of root.children) {
    const sub = pathTo(child, key)
    if (sub.length) return [root, ...sub]
  }
  return []
}

export function countKinds(root: TreeNode, activeOnly = false): Record<NodeKind, number> {
  const counts: Record<NodeKind, number> = {
    institution: 0,
    campus: 0,
    college: 0,
    department: 0,
    program: 0,
    year: 0,
    class: 0,
  }
  const walk = (n: TreeNode) => {
    if (!activeOnly || n.isActive) counts[n.kind] += 1
    n.children.forEach(walk)
  }
  walk(root)
  return counts
}

/** Active nodes below `node` (what suspending it would leave reachable from elsewhere). */
export function activeDescendants(node: TreeNode): number {
  let n = 0
  const walk = (c: TreeNode) => {
    if (c.isActive) n += 1
    c.children.forEach(walk)
  }
  node.children.forEach(walk)
  return n
}

// ── What can be added where ─────────────────────────────────────────────────────────────────

export type EnabledLevels = Record<LevelKey, boolean>

/**
 * Kinds that can be created directly under a node, given the levels the institution uses.
 * A year level lives under a programme, and a class under a year level or a department.
 */
export function allowedChildKinds(kind: NodeKind, enabled: EnabledLevels): LevelKey[] {
  switch (kind) {
    case "institution":
      return (["campus", "college", "department"] as LevelKey[]).filter((k) => enabled[k])
    case "campus":
      return (["college", "department"] as LevelKey[]).filter((k) => enabled[k])
    case "college":
      return ["department"]
    case "department":
      return (["program", "class"] as LevelKey[]).filter((k) => enabled[k])
    case "program":
      return enabled.year ? ["year"] : []
    case "year":
      return ["class"]
    case "class":
      return []
  }
}

// ── Search ───────────────────────────────────────────────────────────────────────────────────

/** Keys to show for a query (matches and the ancestors that lead to them) and keys to expand. */
export function searchTree(root: TreeNode, query: string): { visible: Set<string>; expand: Set<string> } | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const visible = new Set<string>()
  const expand = new Set<string>()
  const walk = (n: TreeNode): boolean => {
    const self = n.name.toLowerCase().includes(q) || (n.code ?? "").toLowerCase().includes(q)
    let below = false
    for (const c of n.children) below = walk(c) || below
    if (self || below) visible.add(n.key)
    if (below) expand.add(n.key)
    return self || below
  }
  walk(root)
  return { visible, expand }
}

// ── Form helpers ─────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set(["of", "and", "the", "for", "in", "to", "&"])

/** A short code from a name ("Faculty of Engineering" -> "FE"), made unique among `taken`. */
export function suggestCode(name: string, taken: Iterable<string> = []): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const meaningful = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()))
  let base: string
  if (meaningful.length >= 2) base = meaningful.map((w) => (/^\d+$/.test(w) ? w : w[0])).join("")
  else base = (meaningful[0] ?? "").slice(0, 4)
  base = base.toUpperCase().slice(0, 16)
  if (base.length < 2) base = (base + "XX").slice(0, 2)

  const used = new Set([...taken].map((c) => c.toUpperCase()))
  let candidate = base
  for (let i = 2; used.has(candidate); i++) candidate = `${base}${i}`.slice(0, 20)
  return candidate
}

export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,19}$/

export function validateCode(raw: string, taken: Iterable<string>): string | null {
  const code = raw.trim().toUpperCase()
  if (!code) return "A code is required."
  if (!CODE_PATTERN.test(code)) return "Use 2–20 letters, digits, '-' or '_'."
  if ([...taken].some((t) => t.toUpperCase() === code)) return "Another item here already uses this code."
  return null
}

export function validateName(raw: string, min = 2): string | null {
  const name = raw.trim()
  if (!name) return "A name is required."
  if (name.length < min) return `Use at least ${min} characters.`
  if (name.length > 255) return "Use at most 255 characters."
  return null
}
