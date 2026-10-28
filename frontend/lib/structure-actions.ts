/**
 * Create / edit / suspend operations for the academic structure, mapped from a tree node to the
 * right endpoint and payload. Kept apart from the components so the mapping is in one place.
 */
import { adminAcademicApi } from "@/lib/api/academic"
import type { TreeNode } from "@/lib/academic-structure"
import type { LevelKey } from "@/lib/structure-profile"

/** What the add / edit form collects. Everything is text until it is turned into a payload. */
export interface EntityFormValues {
  name: string
  code: string
  /** Year level number, e.g. "6". */
  level: string
  capacity: string
  room: string
  locationType: string
}

export const EMPTY_FORM: EntityFormValues = {
  name: "",
  code: "",
  level: "",
  capacity: "",
  room: "",
  locationType: "PHYSICAL_ROOM",
}

/** Path segment of each level under /admin/academic/. */
const SEGMENT: Record<LevelKey, string> = {
  campus: "campuses",
  college: "colleges",
  department: "departments",
  program: "options",
  year: "class-groups",
  class: "sections",
}

const toInt = (text: string): number | null => {
  const n = Number.parseInt(text, 10)
  return Number.isFinite(n) ? n : null
}

export function createPayload(
  kind: LevelKey,
  parent: TreeNode,
  institutionId: string,
  values: EntityFormValues,
): Record<string, unknown> {
  const name = values.name.trim()
  const code = values.code.trim().toUpperCase()

  switch (kind) {
    case "campus":
      return { institution_id: institutionId, name, code }
    case "college":
      return {
        institution_id: institutionId,
        campus_id: parent.kind === "campus" ? parent.id : null,
        name,
        code,
      }
    case "department":
      return {
        institution_id: institutionId,
        // a college implies its campus; the server fills that in
        campus_id: parent.kind === "campus" ? parent.id : null,
        college_id: parent.kind === "college" ? parent.id : null,
        name,
        code,
      }
    case "program":
      return { department_id: parent.id, name, code }
    case "year":
      return { option_id: parent.id, name, code, level: toInt(values.level) }
    case "class": {
      const capacity = toInt(values.capacity)
      return {
        name,
        class_group_id: parent.kind === "year" ? parent.id : null,
        department_id: parent.kind === "department" ? parent.id : null,
        ...(capacity && capacity > 0 ? { capacity } : {}),
        location_type: values.locationType || "PHYSICAL_ROOM",
        ...(values.room.trim() ? { room: values.room.trim() } : {}),
      }
    }
  }
}

export function createEntity(
  kind: LevelKey,
  parent: TreeNode,
  institutionId: string,
  values: EntityFormValues,
): Promise<unknown> {
  const payload = createPayload(kind, parent, institutionId, values)
  switch (kind) {
    case "campus":
      return adminAcademicApi.createCampus(payload)
    case "college":
      return adminAcademicApi.createCollege(payload)
    case "department":
      return adminAcademicApi.createDepartment(payload)
    case "program":
      return adminAcademicApi.createOption(payload)
    case "year":
      return adminAcademicApi.createClassGroup(payload)
    case "class":
      return adminAcademicApi.createSection(payload)
  }
}

/** Only fields the server accepts for each level (codes and parents are not editable). */
export function updatePayload(kind: LevelKey, values: EntityFormValues): Record<string, unknown> {
  const name = values.name.trim()
  switch (kind) {
    case "year":
      return { name, level: toInt(values.level) }
    case "class":
      return {
        name,
        capacity: toInt(values.capacity),
        room: values.room.trim() || null,
        location_type: values.locationType || "PHYSICAL_ROOM",
      }
    default:
      return { name }
  }
}

export function updateEntity(kind: LevelKey, id: string, values: EntityFormValues): Promise<unknown> {
  return adminAcademicApi.updateEntity(SEGMENT[kind], id, updatePayload(kind, values))
}

export function setEntityActive(kind: LevelKey, id: string, isActive: boolean): Promise<unknown> {
  return adminAcademicApi.updateEntity(SEGMENT[kind], id, { is_active: isActive })
}
