"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { academicApi, getAcademicPeriods, type AcademicDepartment, type AcademicPeriod } from "@/lib/api/academic"
import { validateName } from "@/lib/academic-structure"
import { cn } from "@/lib/utils"

export type CourseLanguage = "EN" | "RW" | "FR" | "SW"

/** The course as the edit form needs it (from GET /admin/courses/{id}). */
export interface CourseDetail {
  id: string
  code: string
  title: string
  description: string | null
  credit_hours: number | null
  language: CourseLanguage
  institution_id: string
  academic_period_id: string | null
  academic_year: string
  department_ids: string[]
}

export interface CourseFormValues {
  title: string
  code: string
  credits: string
  description: string
  language: CourseLanguage
  institutionId: string
  periodId: string
  departmentIds: string[]
}

export type CourseDialogState = { mode: "create" } | { mode: "edit"; course: CourseDetail }

interface InstitutionOption {
  id: string
  name: string
  code: string
}

interface CourseDialogProps {
  state: CourseDialogState | null
  institutions: InstitutionOption[]
  onClose: () => void
  onSubmit: (state: CourseDialogState, values: CourseFormValues, periodName: string) => Promise<void>
}

export const LANGUAGES: { value: CourseLanguage; label: string; note: string }[] = [
  { value: "EN", label: "English", note: "Full AI tutoring and grading" },
  { value: "FR", label: "French", note: "Full AI support" },
  { value: "SW", label: "Swahili", note: "Full AI support" },
  { value: "RW", label: "Kinyarwanda", note: "AI is switched off for this course" },
]

/** The dialog shell. The form inside mounts fresh each time it opens. */
export function CourseDialog(props: CourseDialogProps) {
  return (
    <Dialog open={props.state !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {props.state && <CourseForm {...props} state={props.state} />}
      </DialogContent>
    </Dialog>
  )
}

function CourseForm({ state, institutions, onClose, onSubmit }: CourseDialogProps & { state: CourseDialogState }) {
  const isCreate = state.mode === "create"
  const course = state.mode === "edit" ? state.course : null

  const [values, setValues] = useState<CourseFormValues>({
    title: course?.title ?? "",
    code: course?.code ?? "",
    credits: course?.credit_hours ? String(course.credit_hours) : "3",
    description: course?.description ?? "",
    language: course?.language ?? "EN",
    institutionId: course?.institution_id ?? (institutions.length === 1 ? institutions[0].id : ""),
    periodId: course?.academic_period_id ?? "",
    departmentIds: course?.department_ids ?? [],
  })
  const [periods, setPeriods] = useState<AcademicPeriod[]>([])
  const [departments, setDepartments] = useState<AcademicDepartment[]>([])
  const [loadingScope, setLoadingScope] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const latestScope = useRef(0)

  const set = (patch: Partial<CourseFormValues>) => setValues((v) => ({ ...v, ...patch }))

  /** Periods and departments belong to an institution, so they load when it is chosen. */
  const loadScope = async (institutionId: string) => {
    const request = ++latestScope.current
    setLoadingScope(true)
    try {
      const [p, d] = await Promise.all([
        getAcademicPeriods(institutionId),
        academicApi.getDepartments({ institution_id: institutionId }),
      ])
      if (request !== latestScope.current) return
      setPeriods(p)
      setDepartments(d)
    } catch {
      if (request === latestScope.current) setServerError("Could not load this institution's periods and departments.")
    } finally {
      if (request === latestScope.current) setLoadingScope(false)
    }
  }

  const initialInstitution = useRef(values.institutionId)
  useEffect(() => {
    if (initialInstitution.current) void loadScope(initialInstitution.current)
    // runs once for the institution the form opened with
  }, [])

  const onInstitution = (id: string) => {
    set({ institutionId: id, periodId: "", departmentIds: [] })
    setPeriods([])
    setDepartments([])
    void loadScope(id)
  }

  const toggleDepartment = (id: string) =>
    set({
      departmentIds: values.departmentIds.includes(id)
        ? values.departmentIds.filter((d) => d !== id)
        : [...values.departmentIds, id],
    })

  const credits = Number.parseInt(values.credits, 10)
  const errors = {
    title: validateName(values.title),
    code: !values.code.trim()
      ? "A code is required."
      : values.code.trim().length < 2
        ? "Use at least 2 characters."
        : null,
    institution: isCreate && !values.institutionId ? "Choose the institution that offers this course." : null,
    period: !values.periodId ? "Choose the academic period." : null,
    credits: Number.isFinite(credits) && credits >= 1 && credits <= 30 ? null : "Credits must be between 1 and 30.",
    departments:
      values.departmentIds.length === 0 && departments.length > 0
        ? "Choose at least one department, so moderation and exams reach the right people."
        : null,
  }
  const invalid = Object.values(errors).some(Boolean)
  const period = periods.find((p) => p.id === values.periodId)
  const restricted = values.language === "RW"

  const submit = async () => {
    setSubmitted(true)
    if (invalid || !period) return
    setSaving(true)
    setServerError(null)
    try {
      await onSubmit(state, { ...values, code: values.code.trim().toUpperCase() }, period.name)
    } catch (err) {
      setServerError(err instanceof Error && err.message ? err.message : "Could not save. Please try again.")
      setSaving(false)
    }
  }

  const institutionName = institutions.find((i) => i.id === values.institutionId)?.name

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isCreate ? "Create a course" : `Edit ${course?.code}`}</DialogTitle>
        <DialogDescription>
          {isCreate
            ? "Add a course to the official catalog. Lecturers are assigned to it afterwards in Teaching Assignments."
            : "Update the course details. Changing the language does not reach existing classes until you apply it from the course menu."}
        </DialogDescription>
      </DialogHeader>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <Field id="course-title" label="Course title" error={submitted ? errors.title : null}>
            <Input
              id="course-title"
              autoFocus
              value={values.title}
              placeholder="e.g. Distributed Systems"
              aria-invalid={submitted && Boolean(errors.title)}
              onChange={(e) => set({ title: e.target.value })}
            />
          </Field>
          <Field id="course-code" label="Code" error={submitted ? errors.code : null}>
            <Input
              id="course-code"
              value={values.code}
              className="font-mono uppercase"
              placeholder="e.g. CS401"
              aria-invalid={submitted && Boolean(errors.code)}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="course-institution" label="Institution" error={submitted ? errors.institution : null}>
            {isCreate ? (
              <Select value={values.institutionId} onValueChange={onInstitution}>
                <SelectTrigger id="course-institution" aria-invalid={submitted && Boolean(errors.institution)}>
                  <SelectValue placeholder="Choose institution" />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="flex h-8 items-center text-sm">{institutionName ?? "—"}</p>
            )}
          </Field>
          <Field id="course-period" label="Academic period" error={submitted ? errors.period : null}>
            <Select
              value={values.periodId}
              // Radix reports "" while a value and its items arrive in the same render (editing a course
              // loads its periods after opening); ignore it so the saved period is not wiped
              onValueChange={(id) => id && set({ periodId: id })}
              disabled={!values.institutionId || loadingScope}
            >
              <SelectTrigger id="course-period" aria-invalid={submitted && Boolean(errors.period)}>
                <SelectValue placeholder={values.institutionId ? "Choose period" : "Choose an institution first"} />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field
          id="course-departments"
          label="Departments"
          error={submitted ? errors.departments : null}
          hint={
            departments.length === 0 && values.institutionId && !loadingScope
              ? "This institution has no departments yet. Add them in Academic Structure."
              : undefined
          }
        >
          {loadingScope ? (
            <p className="text-sm text-muted-foreground">Loading departments…</p>
          ) : departments.length > 0 ? (
            <div
              id="course-departments"
              role="group"
              aria-label="Departments"
              className="flex flex-wrap gap-1.5 rounded-xl border bg-muted/20 p-2"
            >
              {departments.map((d) => {
                const on = values.departmentIds.includes(d.id)
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDepartment(d.id)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {d.name}
                  </button>
                )
              })}
            </div>
          ) : null}
        </Field>

        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <Field id="course-credits" label="Credits" error={submitted ? errors.credits : null}>
            <Input
              id="course-credits"
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              value={values.credits}
              aria-invalid={submitted && Boolean(errors.credits)}
              onChange={(e) => set({ credits: e.target.value })}
            />
          </Field>
          <Field id="course-language" label="Language and AI policy">
            <Select value={values.language} onValueChange={(v) => set({ language: v as CourseLanguage })}>
              <SelectTrigger id="course-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label} — {l.note}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {restricted && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            AI question generation, automated grading and AI explanations are not available for Kinyarwanda courses.
          </p>
        )}

        <Field id="course-description" label="Description (optional)">
          <Textarea
            id="course-description"
            value={values.description}
            placeholder="What the course covers and its learning outcomes"
            className="min-h-16"
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>

        {serverError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {serverError}
          </p>
        )}

        <DialogFooter className="gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || (submitted && invalid)}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isCreate ? "Create course" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  error?: string | null
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
