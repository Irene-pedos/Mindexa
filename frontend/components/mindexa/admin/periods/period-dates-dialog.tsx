"use client"

import { useCallback, useEffect, useState } from "react"
import { CalendarPlus, Loader2, Pencil, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  adminAcademicApi,
  type AcademicPeriodItem,
  type CalendarEvent,
  type CalendarEventKind,
} from "@/lib/api/academic"
import { EVENT_KINDS, eventKind, formatDateRange, formatPeriodDate } from "@/lib/academic-period"
import { errorMessage } from "@/lib/error-message"
import { cn } from "@/lib/utils"

interface PeriodDatesDialogProps {
  period: AcademicPeriodItem | null
  onClose: () => void
  /** Called after any change so the page can refresh its counts. */
  onChanged: () => void
}

/** The dialog shell. The content mounts fresh each time it opens. */
export function PeriodDatesDialog({ period, onClose, onChanged }: PeriodDatesDialogProps) {
  return (
    <Dialog open={period !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {period && <DatesBody period={period} onChanged={onChanged} />}
      </DialogContent>
    </Dialog>
  )
}

interface Draft {
  id: string | null
  kind: CalendarEventKind
  title: string
  start: string
  end: string
  audience: string
}

const emptyDraft = (period: AcademicPeriodItem): Draft => ({
  id: null,
  kind: "OTHER",
  title: "",
  start: period.start_date,
  end: "",
  audience: "",
})

function DatesBody({ period, onChanged }: { period: AcademicPeriodItem; onChanged: () => void }) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    adminAcademicApi
      .getPeriodEvents(period.id)
      .then((rows) => live && setEvents(rows))
      .catch((err: unknown) => {
        if (!live) return
        setEvents((current) => current ?? [])
        setError(errorMessage(err, "Could not load the dates."))
      })
    return () => {
      live = false
    }
  }, [period.id, reloadKey])

  const refresh = useCallback(() => {
    setReloadKey((k) => k + 1)
    onChanged()
  }, [onChanged])

  const save = async () => {
    if (!draft) return
    const title = draft.title.trim()
    if (title.length < 2) return setError("Give the date a title of at least 2 characters.")
    if (!draft.start) return setError("Pick the first day.")
    if (draft.end && draft.end < draft.start) return setError("The last day cannot be before the first day.")
    setSaving(true)
    setError(null)
    try {
      const body = {
        kind: draft.kind,
        title,
        start_date: draft.start,
        end_date: draft.end || null,
        audience: draft.audience.trim() || null,
      }
      if (draft.id) await adminAcademicApi.updatePeriodEvent(draft.id, body)
      else await adminAcademicApi.createPeriodEvent(period.id, body)
      setDraft(null)
      refresh()
    } catch (err) {
      setError(errorMessage(err, "Could not save this date."))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (event: CalendarEvent) => {
    setBusyId(event.id)
    try {
      await adminAcademicApi.deletePeriodEvent(event.id)
      toast.success("Date removed")
      refresh()
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove this date."))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Key dates · {period.name}</DialogTitle>
        <DialogDescription>
          {formatPeriodDate(period.start_date)} to {formatPeriodDate(period.end_date)}. Registration, holidays, special
          exams, results and appeals: whatever the registrar&apos;s calendar lists for this period.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        {draft ? (
          <form
            className="space-y-3 rounded-xl border bg-muted/20 p-3.5"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="ev-kind">Kind</Label>
                <Select value={draft.kind} onValueChange={(v) => v && setDraft({ ...draft, kind: v as CalendarEventKind })}>
                  <SelectTrigger id="ev-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-title">Title</Label>
                <Input
                  id="ev-title"
                  autoFocus
                  value={draft.title}
                  placeholder="e.g. Special exams"
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="ev-start">First day</Label>
                <Input
                  id="ev-start"
                  type="date"
                  value={draft.start}
                  min={period.start_date}
                  max={period.end_date}
                  onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-end">Last day (optional)</Label>
                <Input
                  id="ev-end"
                  type="date"
                  value={draft.end}
                  min={draft.start || period.start_date}
                  max={period.end_date}
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-audience">Applies to</Label>
                <Input
                  id="ev-audience"
                  value={draft.audience}
                  placeholder="Everyone"
                  onChange={(e) => setDraft({ ...draft, audience: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => (setDraft(null), setError(null))} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving && <Loader2 className="mr-2 size-3.5 animate-spin" />}
                {draft.id ? "Save date" : "Add date"}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setDraft(emptyDraft(period))}>
            <CalendarPlus className="mr-1.5 size-4" />
            Add a date
          </Button>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <ul className="divide-y overflow-hidden rounded-xl border">
          {events === null ? (
            [1, 2, 3].map((i) => (
              <li key={i} className="p-3">
                <Skeleton className="h-8 w-full" />
              </li>
            ))
          ) : events.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              No dates yet. Add them one by one, or import the whole calendar from the Academic Periods page.
            </li>
          ) : (
            events.map((event) => {
              const kind = eventKind(event.kind)
              return (
                <li key={event.id} className="flex items-start gap-3 px-3.5 py-2.5">
                  <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", kind.dot)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{event.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatDateRange(event.start_date, event.end_date)}</span>
                      <span aria-hidden>·</span>
                      <span>{kind.label}</span>
                      {event.audience && (
                        <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px]">
                          <Users className="size-2.5" /> {event.audience}
                        </Badge>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${event.title}`}
                      onClick={() =>
                        setDraft({
                          id: event.id,
                          kind: event.kind,
                          title: event.title,
                          start: event.start_date,
                          end: event.end_date === event.start_date ? "" : event.end_date,
                          audience: event.audience ?? "",
                        })
                      }
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${event.title}`}
                      disabled={busyId === event.id}
                      onClick={() => void remove(event)}
                    >
                      {busyId === event.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    </Button>
                  </div>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </>
  )
}
