"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Check, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { adminApi, type AdminCourseListItem, type UserResponse } from "@/lib/api/admin"
import {
  academicYearOf,
  adminAcademicApi,
  getAcademicPeriods,
  type AcademicPeriod,
  type TeachingAssignmentPayload,
} from "@/lib/api/academic"
import type { AcademicStructure } from "@/lib/academic-structure"
import {
  ROLE_LABELS,
  buildAssignments,
  classLabel,
  defaultPeriodId,
  type AssignmentRole,
  type PlanCourse,
} from "@/lib/assignment-plan"
import { useDebounce } from "@/hooks/use-debounce"
import { cn } from "@/lib/utils"
import { SearchSelect } from "../search-select"

export interface AssignmentDialogState {
  lecturerId?: string
  courseId?: string
}

interface AssignmentDialogProps {
  state: AssignmentDialogState | null
  lecturers: UserResponse[]
  onClose: () => void
  /** Called after the assignments were saved. */
  onCreated: (count: number) => Promise<void> | void
}

const lecturerName = (l: UserResponse) =>
  [l.profile?.first_name, l.profile?.last_name].filter(Boolean).join(" ") || l.email

/** The dialog shell. The form inside mounts fresh each time it opens. */
export function AssignmentDialog(props: AssignmentDialogProps) {
  return (
    <Dialog open={props.state !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {props.state && <AssignmentForm {...props} state={props.state} />}
      </DialogContent>
    </Dialog>
  )
}

function toPlanCourse(c: AdminCourseListItem): PlanCourse | null {
  return c.institution_id
    ? {
        id: c.id,
        code: c.code,
        title: c.title,
        institution_id: c.institution_id,
        department_ids: c.department_ids ?? [],
      }
    : null
}

function AssignmentForm({
  state,
  lecturers,
  onClose,
  onCreated,
}: AssignmentDialogProps & { state: AssignmentDialogState }) {
  const [lecturerId, setLecturerId] = useState(state.lecturerId ?? "")
  const [role, setRole] = useState<AssignmentRole>("MAIN_LECTURER")
  const [picked, setPicked] = useState<Map<string, PlanCourse>>(new Map())
  const [classIds, setClassIds] = useState<Set<string>>(new Set())
  const [periodId, setPeriodId] = useState("")

  const [courseQuery, setCourseQuery] = useState("")
  const debouncedQuery = useDebounce(courseQuery, 300)
  const [courseResults, setCourseResults] = useState<AdminCourseListItem[] | null>(null)
  const [alreadyTeaching, setAlreadyTeaching] = useState<Set<string>>(new Set())
  const [structure, setStructure] = useState<AcademicStructure | null>(null)
  const [periods, setPeriods] = useState<AcademicPeriod[]>([])

  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const latestCourses = useRef(0)

  const lockedInstitution = [...picked.values()][0]?.institution_id ?? null

  // course catalog (server-side search)
  useEffect(() => {
    const request = ++latestCourses.current
    adminApi
      .getCourses({ search: debouncedQuery, status: "active", pageSize: 30 })
      .then((res) => {
        if (request === latestCourses.current) setCourseResults(res.items)
      })
      .catch(() => {
        if (request === latestCourses.current) setCourseResults([])
      })
  }, [debouncedQuery])

  // a course chosen from a link elsewhere (e.g. "Assign a lecturer" on the Courses page)
  useEffect(() => {
    if (!state.courseId) return
    adminApi
      .getCourses({ pageSize: 100, status: "active" })
      .then((res) => {
        const found = res.items.find((c) => c.id === state.courseId)
        const plan = found && toPlanCourse(found)
        if (plan) setPicked(new Map([[plan.id, plan]]))
      })
      .catch(() => undefined)
    // only for the course the dialog was opened with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // courses this lecturer already teaches, so the list can say so
  useEffect(() => {
    if (!lecturerId) return
    adminAcademicApi
      .getLecturerAssignments(lecturerId)
      .then((list) => setAlreadyTeaching(new Set(list.map((a) => a.course_id))))
      .catch(() => setAlreadyTeaching(new Set()))
  }, [lecturerId])

  // classes and periods belong to the institution of the chosen courses
  useEffect(() => {
    if (!lockedInstitution) return
    Promise.all([adminAcademicApi.getStructure(lockedInstitution), getAcademicPeriods(lockedInstitution)])
      .then(([s, p]) => {
        setStructure(s)
        setPeriods(p)
        setPeriodId((current) => current || defaultPeriodId(p))
      })
      .catch(() => setServerError("Could not load the classes and periods of this institution."))
  }, [lockedInstitution])

  const toggleCourse = (course: AdminCourseListItem) => {
    const plan = toPlanCourse(course)
    if (!plan) return
    const next = new Map(picked)
    if (next.has(plan.id)) next.delete(plan.id)
    else next.set(plan.id, plan)
    setPicked(next)
    if (next.size === 0) {
      // nothing chosen any more: forget the institution-specific choices
      setStructure(null)
      setPeriods([])
      setPeriodId("")
      setClassIds(new Set())
    }
  }

  // classes offered to the chosen courses (those in a department that offers at least one of them)
  const classOptions = useMemo(() => {
    if (!structure) return []
    const departments = new Set([...picked.values()].flatMap((c) => c.department_ids))
    return structure.classes
      .filter((c) => c.is_active)
      .map((c) => ({
        id: c.id,
        label: classLabel(structure, c.id),
        department: c.department_id,
        group: c.class_group_id,
      }))
      .filter((c) => {
        const level = c.group ? structure.levels.find((l) => l.id === c.group) : undefined
        const program = level ? structure.programs.find((p) => p.id === level.option_id) : undefined
        const department = program?.department_id ?? c.department
        return department ? departments.has(department) : false
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
  }, [structure, picked])

  const period = periods.find((p) => p.id === periodId)
  const plan = useMemo(
    () =>
      lecturerId && period
        ? buildAssignments({
            lecturerId,
            courses: [...picked.values()],
            classIds: [...classIds].filter((id) => classOptions.some((c) => c.id === id)),
            periodId: period.id,
            academicYear: academicYearOf(period),
            role,
            structure,
          })
        : { assignments: [], problems: [] },
    [lecturerId, period, picked, classIds, role, structure, classOptions],
  )

  const errors = {
    lecturer: lecturerId ? null : "Choose the lecturer.",
    courses: picked.size > 0 ? null : "Choose at least one course.",
    period: periodId ? null : picked.size > 0 ? "Choose the academic period." : null,
    plan:
      picked.size > 0 && period && plan.assignments.length === 0 ? (plan.problems[0] ?? "Nothing to assign.") : null,
  }
  const invalid = Boolean(errors.lecturer || errors.courses || errors.period || errors.plan)

  const submit = async () => {
    setSubmitted(true)
    if (invalid) return
    setSaving(true)
    setServerError(null)
    try {
      await adminAcademicApi.assignLecturerBulk(plan.assignments as TeachingAssignmentPayload[])
      await onCreated(plan.assignments.length)
    } catch (err) {
      setServerError(err instanceof Error && err.message ? err.message : "Could not save the assignments.")
      setSaving(false)
    }
  }

  const count = plan.assignments.length

  return (
    <>
      <DialogHeader>
        <DialogTitle>Assign a lecturer</DialogTitle>
        <DialogDescription>
          Choose who teaches what. The department and programme are filled in from the course and class you pick.
        </DialogDescription>
      </DialogHeader>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="space-y-1.5">
            <Label htmlFor="assign-lecturer">Lecturer</Label>
            <SearchSelect
              id="assign-lecturer"
              value={lecturerId}
              onChange={setLecturerId}
              placeholder="Choose a lecturer"
              searchPlaceholder="Search by name or email"
              invalid={submitted && Boolean(errors.lecturer)}
              options={lecturers.map((l) => ({
                value: l.id,
                label: lecturerName(l),
                hint: l.profile?.staff_id ? `${l.profile.staff_id} · ${l.email}` : l.email,
              }))}
            />
            {submitted && errors.lecturer && <p className="text-xs text-destructive">{errors.lecturer}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assign-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AssignmentRole)}>
              <SelectTrigger id="assign-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABELS) as AssignmentRole[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Courses */}
        <fieldset className="space-y-2">
          <div className="flex items-center justify-between">
            <legend className="text-sm font-medium">Courses</legend>
            <span className="text-xs text-muted-foreground">{picked.size} selected</span>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={courseQuery}
              onChange={(e) => setCourseQuery(e.target.value)}
              placeholder="Search courses by code or title"
              aria-label="Search courses"
              className="h-8 pl-9"
            />
          </div>
          <ul className="max-h-52 divide-y overflow-y-auto rounded-xl border" aria-label="Courses">
            {courseResults === null ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">Loading courses…</li>
            ) : courseResults.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                No active course matches.{" "}
                <Link href="/admin/courses" className="font-medium text-primary hover:underline">
                  Create one
                </Link>
              </li>
            ) : (
              courseResults.map((course) => {
                const on = picked.has(course.id)
                const otherInstitution = Boolean(lockedInstitution && course.institution_id !== lockedInstitution)
                const noDepartment = (course.department_ids ?? []).length === 0
                const disabled = !on && (otherInstitution || noDepartment)
                return (
                  <li key={course.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={disabled}
                      onClick={() => toggleCourse(course)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                        on ? "bg-primary/5" : "hover:bg-muted/50",
                        disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          on ? "border-primary bg-primary text-primary-foreground" : "bg-background",
                        )}
                        aria-hidden
                      >
                        {on && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          <span className="mr-2 font-mono text-xs text-muted-foreground">{course.code}</span>
                          {course.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {noDepartment
                            ? "No department set. Add one on the Courses page first."
                            : otherInstitution
                              ? "Belongs to a different institution than the courses already chosen"
                              : [course.department_names?.join(", "), course.institution_name]
                                  .filter(Boolean)
                                  .join(" · ")}
                        </span>
                      </span>
                      {alreadyTeaching.has(course.id) && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          already teaches
                        </span>
                      )}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
          {submitted && errors.courses && <p className="text-xs text-destructive">{errors.courses}</p>}
        </fieldset>

        {/* Classes */}
        {picked.size > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Which classes?</legend>
            <p className="text-xs text-muted-foreground">
              {classIds.size === 0
                ? "Nothing selected: the lecturer teaches these courses to everyone in the department."
                : `${classIds.size} class${classIds.size === 1 ? "" : "es"} selected.`}
            </p>
            {classOptions.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                {structure ? "These courses have no classes yet." : "Loading classes…"}
              </p>
            ) : (
              <div
                role="group"
                aria-label="Classes"
                className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-xl border bg-muted/20 p-2"
              >
                {classOptions.map((c) => {
                  const on = classIds.has(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setClassIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(c.id)) next.delete(c.id)
                          else next.add(c.id)
                          return next
                        })
                      }
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>
            )}
          </fieldset>
        )}

        {/* Period */}
        {picked.size > 0 && (
          <div className="space-y-1.5 sm:max-w-xs">
            <Label htmlFor="assign-period">Academic period</Label>
            {/* always a string: a Select that starts without a value and gets one later keeps showing the placeholder */}
            {/* Radix reports "" while a value and its items arrive in the same render; ignore it */}
            <Select value={periodId} onValueChange={(v) => v && setPeriodId(v)}>
              <SelectTrigger id="assign-period" aria-invalid={submitted && Boolean(errors.period)}>
                <SelectValue placeholder="Choose period" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {submitted && errors.period && <p className="text-xs text-destructive">{errors.period}</p>}
          </div>
        )}

        {/* What will happen */}
        {picked.size > 0 && period && (
          <div
            className={cn(
              "rounded-xl border px-3 py-2.5 text-sm",
              count > 0 ? "border-primary/30 bg-primary/5" : "border-amber-500/30 bg-amber-500/10",
            )}
            aria-live="polite"
          >
            {count > 0 ? (
              <>
                This will create <strong>{count}</strong> assignment{count === 1 ? "" : "s"} for{" "}
                <strong>
                  {lecturers.find((l) => l.id === lecturerId)
                    ? lecturerName(lecturers.find((l) => l.id === lecturerId)!)
                    : "the lecturer"}
                </strong>
                .
              </>
            ) : (
              <>{plan.problems[0] ?? "Nothing to assign yet."}</>
            )}
            {count > 0 && plan.problems.length > 0 && (
              <ul className="mt-1.5 list-disc pl-5 text-xs text-amber-800 dark:text-amber-300">
                {plan.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {serverError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {serverError}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || (submitted && invalid)}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {count > 0 ? `Assign (${count})` : "Assign"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
