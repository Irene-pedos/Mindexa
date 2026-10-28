/**
 * Turning what an administrator picked (a lecturer, some courses, optionally some classes) into
 * the teaching assignments to create.
 *
 * Everything the server needs besides those picks (institution, department, programme) is derived
 * here, so the form only asks for what a person actually decides. Pure functions, no React.
 */
import type { AcademicStructure } from "./academic-structure"

export type AssignmentRole =
  "MAIN_LECTURER" | "ASSISTANT_LECTURER" | "CO_LECTURER" | "SUPERVISOR" | "REVIEWER" | "GUEST_LECTURER"

export const ROLE_LABELS: Record<AssignmentRole, string> = {
  MAIN_LECTURER: "Main lecturer",
  ASSISTANT_LECTURER: "Assistant lecturer",
  CO_LECTURER: "Co-lecturer",
  SUPERVISOR: "Supervisor",
  REVIEWER: "Reviewer",
  GUEST_LECTURER: "Guest lecturer",
}

export interface PlanCourse {
  id: string
  code: string
  title: string
  institution_id: string
  department_ids: string[]
}

export interface PlannedAssignment {
  lecturer_id: string
  institution_id: string
  department_id: string
  option_id: string | null
  course_id: string
  class_section_id: string | null
  academic_period_id: string
  academic_year: string
  role: AssignmentRole
}

export interface PlanInput {
  lecturerId: string
  courses: PlanCourse[]
  /** Classes to teach; empty means the whole department. */
  classIds: string[]
  periodId: string
  academicYear: string
  role: AssignmentRole
  structure: AcademicStructure | null
}

export interface PlanResult {
  assignments: PlannedAssignment[]
  /** Things that could not be planned, in words an administrator can act on. */
  problems: string[]
}

/** The department a class belongs to: directly, or through its year level and programme. */
export function classDepartmentId(structure: AcademicStructure, classId: string): string | null {
  const cls = structure.classes.find((c) => c.id === classId)
  if (!cls) return null
  if (cls.class_group_id) {
    const level = structure.levels.find((l) => l.id === cls.class_group_id)
    const program = level && structure.programs.find((p) => p.id === level.option_id)
    if (program) return program.department_id
  }
  return cls.department_id
}

/** The programme a class sits under, when it has a year level. */
function classProgramId(structure: AcademicStructure, classId: string): string | null {
  const cls = structure.classes.find((c) => c.id === classId)
  const level = cls?.class_group_id ? structure.levels.find((l) => l.id === cls.class_group_id) : undefined
  return level?.option_id ?? null
}

/** "Information Technology › Level 6 › Year 1" for a class, as far as its place is known. */
export function classLabel(structure: AcademicStructure, classId: string): string {
  const cls = structure.classes.find((c) => c.id === classId)
  if (!cls) return "Unknown class"
  const level = cls.class_group_id ? structure.levels.find((l) => l.id === cls.class_group_id) : undefined
  const program = level ? structure.programs.find((p) => p.id === level.option_id) : undefined
  return [program?.name, level?.name, cls.name].filter(Boolean).join(" › ")
}

export function buildAssignments(input: PlanInput): PlanResult {
  const { lecturerId, courses, classIds, periodId, academicYear, role, structure } = input
  const assignments: PlannedAssignment[] = []
  const problems: string[] = []

  const base = { lecturer_id: lecturerId, academic_period_id: periodId, academic_year: academicYear, role }

  for (const course of courses) {
    if (course.department_ids.length === 0) {
      problems.push(`${course.code} has no department yet. Set one on the Courses page first.`)
      continue
    }

    if (classIds.length === 0) {
      assignments.push({
        ...base,
        institution_id: course.institution_id,
        department_id: course.department_ids[0],
        option_id: null,
        course_id: course.id,
        class_section_id: null,
      })
      continue
    }

    let matched = 0
    for (const classId of classIds) {
      const department = structure ? classDepartmentId(structure, classId) : null
      if (!structure || !department || !course.department_ids.includes(department)) continue
      matched += 1
      assignments.push({
        ...base,
        institution_id: course.institution_id,
        department_id: department,
        option_id: classProgramId(structure, classId),
        course_id: course.id,
        class_section_id: classId,
      })
    }
    if (matched === 0) problems.push(`${course.code} is not offered to any of the chosen classes.`)
  }

  return { assignments, problems }
}

/** The period that contains today, else the most recent one, else nothing. */
export function defaultPeriodId(
  periods: { id: string; start_date: string; end_date: string }[],
  today: Date = new Date(),
): string {
  if (periods.length === 0) return ""
  const now = today.getTime()
  const current = periods.find((p) => new Date(p.start_date).getTime() <= now && now <= new Date(p.end_date).getTime())
  if (current) return current.id
  return [...periods].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0].id
}
