"use client"

import { useState } from "react"
import { CalendarRange, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AcademicPeriodItem } from "@/lib/api/academic"
import {
  PERIOD_TYPES,
  durationLabel,
  hasErrors,
  suggestEndDate,
  suggestName,
  validatePeriod,
  type PeriodType,
} from "@/lib/academic-period"

export interface PeriodInstitution {
  id: string
  name: string
}

export type PeriodDialogState =
  | { mode: "create"; institutionId: string }
  | { mode: "edit"; period: AcademicPeriodItem }

export interface PeriodFormValues {
  institutionId: string
  name: string
  type: PeriodType
  start: string
  end: string
  active: boolean
}

interface PeriodDialogProps {
  state: PeriodDialogState | null
  institutions: PeriodInstitution[]
  /** Every period already loaded, used to warn about duplicate names and overlaps before saving. */
  periods: AcademicPeriodItem[]
  onClose: () => void
  onSubmit: (state: PeriodDialogState, values: PeriodFormValues) => Promise<void>
}

/** The dialog shell. The form inside mounts fresh each time it opens. */
export function PeriodDialog(props: PeriodDialogProps) {
  return (
    <Dialog open={props.state !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {props.state && <PeriodForm {...props} state={props.state} />}
      </DialogContent>
    </Dialog>
  )
}

function PeriodForm({
  state,
  institutions,
  periods,
  onClose,
  onSubmit,
}: PeriodDialogProps & { state: PeriodDialogState }) {
  const isCreate = state.mode === "create"
  const existing = state.mode === "edit" ? state.period : null

  const [institutionId, setInstitutionId] = useState(isCreate ? state.institutionId : existing!.institution_id)
  const [type, setType] = useState<PeriodType>((existing?.period_type as PeriodType | undefined) ?? "SEMESTER")
  const [start, setStart] = useState(existing?.start_date ?? "")
  const [typedEnd, setTypedEnd] = useState<string | null>(existing ? existing.end_date : null)
  const [typedName, setTypedName] = useState<string | null>(existing ? existing.name : null)
  const [active, setActive] = useState(existing?.is_active ?? true)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const siblings = periods.filter((p) => p.institution_id === institutionId)
  // Until the admin types their own, the end date and name follow the type and the start date.
  const end = typedEnd ?? suggestEndDate(type, start)
  const name = typedName ?? suggestName(type, start, siblings.map((p) => p.name))

  const errors = validatePeriod({ name, type, start, end }, siblings, existing?.id)
  const invalid = hasErrors(errors)
  const usage = existing ? existing.course_count + existing.assignment_count : 0
  const length = start && end && end > start ? durationLabel(start, end) : ""

  const submit = async () => {
    setSubmitted(true)
    if (invalid || !institutionId) return
    setSaving(true)
    setServerError(null)
    try {
      await onSubmit(state, { institutionId, name: name.trim(), type, start, end, active })
    } catch (err) {
      setServerError(err instanceof Error && err.message ? err.message : "Could not save. Please try again.")
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isCreate ? "New academic period" : "Edit academic period"}</DialogTitle>
        <DialogDescription>
          {isCreate
            ? "A period is a block of time such as a semester or a school year. Courses and teaching assignments are placed inside one."
            : usage > 0
              ? `Used by ${existing!.course_count} course${existing!.course_count === 1 ? "" : "s"} and ${existing!.assignment_count} assignment${existing!.assignment_count === 1 ? "" : "s"}. Changing its dates does not move them.`
              : "Nothing uses this period yet, so you can change it freely."}
        </DialogDescription>
      </DialogHeader>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {isCreate && institutions.length > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor="period-institution">Institution</Label>
            <Select value={institutionId} onValueChange={(v) => v && setInstitutionId(v)}>
              <SelectTrigger id="period-institution">
                <SelectValue placeholder="Choose an institution" />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="period-type">Kind of period</Label>
          <Select value={type} onValueChange={(v) => v && setType(v as PeriodType)}>
            <SelectTrigger id="period-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="period-start">First day</Label>
            <Input
              id="period-start"
              type="date"
              value={start}
              aria-invalid={submitted && Boolean(errors.start)}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="period-end">Last day</Label>
            <Input
              id="period-end"
              type="date"
              value={end}
              min={start || undefined}
              aria-invalid={submitted && Boolean(errors.end)}
              onChange={(e) => setTypedEnd(e.target.value)}
            />
          </div>
        </div>
        {submitted && (errors.start || errors.end) ? (
          <p className="-mt-2 text-xs text-destructive">{errors.start ?? errors.end}</p>
        ) : (
          <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="size-3.5" aria-hidden />
            {length
              ? `Runs for about ${length}. The last day is filled in for you and can be changed.`
              : "Pick the first day and the last day is filled in for you."}
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="period-name">Name</Label>
          <Input
            id="period-name"
            value={name}
            placeholder="e.g. Semester 1 2026"
            aria-invalid={submitted && Boolean(errors.name)}
            onChange={(e) => setTypedName(e.target.value)}
          />
          {submitted && errors.name ? (
            <p className="text-xs text-destructive">{errors.name}</p>
          ) : (
            <p className="text-xs text-muted-foreground">This is the name lecturers and students see on their courses.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/20 px-3.5 py-3">
          <div className="min-w-0">
            <Label htmlFor="period-active" className="text-sm font-medium">
              Open for use
            </Label>
            <p className="text-xs text-muted-foreground">
              Inactive periods stay in the records but are hidden from the course and assignment pickers.
            </p>
          </div>
          <Switch id="period-active" checked={active} onCheckedChange={setActive} />
        </div>

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
            {isCreate ? "Create period" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
