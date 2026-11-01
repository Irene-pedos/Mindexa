"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, FileUp, Loader2, RotateCw, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  adminAcademicApi,
  type CalendarDraft,
  type CalendarDraftEvent,
  type CalendarEventKind,
  type CalendarPreview,
} from "@/lib/api/academic"
import { EVENT_KINDS, eventKind, formatPeriodDate } from "@/lib/academic-period"
import { errorMessage } from "@/lib/error-message"
import { cn } from "@/lib/utils"
import type { PeriodInstitution } from "./period-dialog"

interface CalendarImportDialogProps {
  open: boolean
  institutions: PeriodInstitution[]
  defaultInstitutionId: string
  onClose: () => void
  onImported: () => void
}

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp"

/** The dialog shell. The steps inside mount fresh each time it opens. */
export function CalendarImportDialog(props: CalendarImportDialogProps) {
  // While the AI is reading, saving, or a draft is being reviewed, a stray click outside the card
  // or the Escape key must not throw the work away: only the Cancel button closes it.
  const [locked, setLocked] = useState(false)
  const close = () => {
    setLocked(false)
    props.onClose()
  }
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && !locked && close()}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-4xl"
        showCloseButton={!locked}
        onInteractOutside={(e) => locked && e.preventDefault()}
        onEscapeKeyDown={(e) => locked && e.preventDefault()}
      >
        {props.open && (
          <ImportFlow
            {...props}
            onClose={close}
            onImported={() => {
              setLocked(false)
              props.onImported()
            }}
            onLock={setLocked}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Seconds from the server's "try again in about N seconds" message, if it gave one. */
const waitSeconds = (message: string): number | null => {
  const match = /about (\d+) seconds?/.exec(message)
  return match ? Number(match[1]) : null
}

function ImportFlow({
  institutions,
  defaultInstitutionId,
  onClose,
  onImported,
  onLock,
}: CalendarImportDialogProps & { onLock: (locked: boolean) => void }) {
  const [institutionId, setInstitutionId] = useState(defaultInstitutionId)
  const [file, setFile] = useState<File | null>(null)
  const [rotation, setRotation] = useState(0)
  const [preview, setPreview] = useState<CalendarPreview | null>(null)
  const [draft, setDraft] = useState<CalendarDraft | null>(null)
  const [busy, setBusy] = useState<"preview" | "read" | "save" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [onlyCheck, setOnlyCheck] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // A clock that only ticks while something is counting: the read's elapsed time or a rate-limit wait.
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const ticking = startedAt !== null || retryAt !== null
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [ticking])
  const clock = now || startedAt || retryAt || 0
  const elapsed = startedAt ? Math.max(0, Math.round((clock - startedAt) / 1000)) : 0
  const cooldown = retryAt ? Math.max(0, Math.ceil((retryAt - clock) / 1000)) : 0

  const loadPreview = async (next: File, angle: number) => {
    setBusy("preview")
    setError(null)
    try {
      setPreview(await adminAcademicApi.previewCalendarFile(next, angle))
    } catch (err) {
      setPreview(null)
      setError(errorMessage(err, "Could not open that file."))
    } finally {
      setBusy(null)
    }
  }

  const choose = (picked: File | undefined) => {
    if (!picked) return
    setFile(picked)
    setRotation(0)
    setDraft(null)
    void loadPreview(picked, 0)
  }

  const rotate = () => {
    if (!file) return
    const next = (rotation + 90) % 360
    setRotation(next)
    void loadPreview(file, next)
  }

  const read = async () => {
    if (!file || busy !== null) return
    setBusy("read")
    setError(null)
    setRetryAt(null)
    setNow(Date.now())
    setStartedAt(Date.now())
    onLock(true)
    try {
      setDraft(await adminAcademicApi.extractCalendarFile(file, rotation))
    } catch (err) {
      const message = errorMessage(err, "The AI could not read this file.")
      setError(message)
      const wait = waitSeconds(message)
      if (wait) {
        setNow(Date.now())
        setRetryAt(Date.now() + wait * 1000)
      }
      onLock(false)
    } finally {
      setStartedAt(null)
      setBusy(null)
    }
  }

  const save = async () => {
    if (!draft || !institutionId) return
    setBusy("save")
    setError(null)
    try {
      const result = await adminAcademicApi.applyCalendarDraft(institutionId, draft)
      toast.success(`${draft.year_name} saved with ${result.semester_ids.length} semesters and ${result.event_count} dates`)
      onImported()
    } catch (err) {
      setError(errorMessage(err, "Could not save the calendar."))
      setBusy(null)
    }
  }

  // ── draft editing ──
  const patchEvent = (index: number, patch: Partial<CalendarDraftEvent>) =>
    setDraft((d) => d && { ...d, events: d.events.map((e, i) => (i === index ? { ...e, ...patch, warning: patch.start_date || patch.end_date ? null : e.warning } : e)) })
  const removeEvent = (index: number) => setDraft((d) => d && { ...d, events: d.events.filter((_, i) => i !== index) })
  const renameSemester = (index: number, name: string) =>
    setDraft(
      (d) =>
        d && {
          ...d,
          semesters: d.semesters.map((s, i) => (i === index ? { ...s, name } : s)),
          events: d.events.map((e) => (e.semester === d.semesters[index].name ? { ...e, semester: name } : e)),
        },
    )
  const patchSemester = (index: number, patch: { start_date?: string; end_date?: string }) =>
    setDraft((d) => d && { ...d, semesters: d.semesters.map((s, i) => (i === index ? { ...s, ...patch } : s)) })

  const flagged = draft ? draft.events.filter((e) => e.warning).length : 0
  const rows = draft ? draft.events.map((event, index) => ({ event, index })).filter((r) => !onlyCheck || r.event.warning) : []
  const draftProblem = draft
    ? draft.year_end <= draft.year_start
      ? "The academic year must end after it starts."
      : draft.semesters.find((s) => s.end_date <= s.start_date)?.name
        ? `${draft.semesters.find((s) => s.end_date <= s.start_date)!.name} must end after it starts.`
        : draft.semesters.find((s) => s.start_date < draft.year_start || s.end_date > draft.year_end)?.name
          ? `${draft.semesters.find((s) => s.start_date < draft.year_start || s.end_date > draft.year_end)!.name} falls outside the academic year.`
          : null
    : null

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="size-4.5 text-primary" />
          Import an academic calendar
        </DialogTitle>
        <DialogDescription>
          Upload the registrar&apos;s calendar (PDF or a photo). The AI reads it into a draft: the academic year, its
          semesters and the key dates. You check it before anything is saved.
        </DialogDescription>
      </DialogHeader>

      {!draft ? (
        <div className="space-y-4">
          {institutions.length > 1 && (
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="import-institution">Institution</Label>
              <Select value={institutionId} onValueChange={(v) => v && setInstitutionId(v)}>
                <SelectTrigger id="import-institution">
                  <SelectValue />
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

          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                choose(e.dataTransfer.files[0])
              }}
              className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-muted/20 p-6 text-center transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <FileUp className="size-8 text-muted-foreground" />
              <span className="text-sm font-medium">{file ? file.name : "Choose or drop the calendar file"}</span>
              <span className="text-xs text-muted-foreground">PDF, PNG, JPG or WebP, up to 8 MB</span>
            </button>
            <input ref={input} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />

            <div className="flex min-h-56 flex-col rounded-xl border bg-card p-3">
              {busy === "preview" ? (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" /> Opening the file…
                </div>
              ) : preview ? (
                <>
                  <div className="relative flex-1 overflow-hidden rounded-lg border bg-muted/30">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a data URL returned by the preview call */}
                    <img
                      src={`data:image/jpeg;base64,${preview.image_base64}`}
                      alt="First page of the calendar"
                      className="mx-auto max-h-64 w-auto object-contain"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {preview.pages} page{preview.pages === 1 ? "" : "s"}
                      {preview.has_text_layer ? " · text found, no rotation needed" : " · scanned: make the text upright"}
                    </p>
                    {!preview.has_text_layer && (
                      <Button type="button" variant="outline" size="sm" onClick={rotate}>
                        <RotateCw className="mr-1.5 size-3.5" /> Rotate
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  A preview of the first page appears here. If the text is sideways, rotate it before reading.
                </div>
              )}
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {busy === "read" && (
            <div role="status" className="rounded-xl border border-primary/25 bg-primary/5 p-3.5">
              <div className="flex items-center gap-3">
                <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">The AI is reading your calendar… {elapsed}s</p>
                  <p className="text-xs text-muted-foreground">
                    This usually takes 10 to 60 seconds. Keep this window open; it closes by itself only when you press Cancel.
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/15">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {cooldown > 0
                ? "The AI service is limiting requests. You can try again when the timer ends."
                : "Nothing is saved until you approve the draft."}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => void read()} disabled={!preview || busy !== null || !institutionId || cooldown > 0}>
                {busy === "read" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                {cooldown > 0 ? `Try again in ${cooldown}s` : "Read calendar"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
              <AlertTriangle className="size-4" /> AI draft: check it before saving
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The AI can misread a digit or a row, especially on scans. Dates that disagree with their weekday are marked.
              Fix anything wrong below; you can also edit dates later from the period.
            </p>
            {draft.warnings.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-amber-800 dark:text-amber-300">
                {draft.warnings.slice(0, 6).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Academic year and semesters</h3>
            <div className="grid gap-2 rounded-xl border p-3 md:grid-cols-[minmax(0,1.4fr)_9rem_9rem]">
              <Input
                aria-label="Academic year name"
                value={draft.year_name}
                onChange={(e) => setDraft({ ...draft, year_name: e.target.value })}
                className="h-8 text-sm font-medium"
              />
              <Input aria-label="Year start" type="date" value={draft.year_start} onChange={(e) => setDraft({ ...draft, year_start: e.target.value })} className="h-8 text-xs" />
              <Input aria-label="Year end" type="date" value={draft.year_end} onChange={(e) => setDraft({ ...draft, year_end: e.target.value })} className="h-8 text-xs" />
              {draft.semesters.map((s, i) => (
                <div key={i} className="contents">
                  <Input
                    aria-label={`Semester ${i + 1} name`}
                    value={s.name}
                    onChange={(e) => renameSemester(i, e.target.value)}
                    className="h-8 pl-6 text-sm"
                  />
                  <Input aria-label={`${s.name} start`} type="date" value={s.start_date} onChange={(e) => patchSemester(i, { start_date: e.target.value })} className="h-8 text-xs" />
                  <Input aria-label={`${s.name} end`} type="date" value={s.end_date} onChange={(e) => patchSemester(i, { end_date: e.target.value })} className="h-8 text-xs" />
                </div>
              ))}
              {draft.semesters.length === 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 md:col-span-3">
                  No semester was found in the file. The dates below will be saved on the academic year; you can add
                  semesters afterwards.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Key dates <span className="font-normal text-muted-foreground">({draft.events.length})</span>
              </h3>
              {flagged > 0 && (
                <button
                  type="button"
                  onClick={() => setOnlyCheck((v) => !v)}
                  className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                >
                  {onlyCheck ? "Show all rows" : `Show the ${flagged} row${flagged === 1 ? "" : "s"} to check`}
                </button>
              )}
            </div>
            <ul className="max-h-[42vh] divide-y overflow-y-auto rounded-xl border">
              {rows.map(({ event, index }) => (
                <li key={index} className={cn("grid gap-2 p-2.5 md:grid-cols-[9.5rem_minmax(0,1fr)_8.5rem_8.5rem_6rem_2rem]", event.warning && "bg-amber-500/5")}>
                  <Select value={event.kind} onValueChange={(v) => v && patchEvent(index, { kind: v as CalendarEventKind })}>
                    <SelectTrigger className="h-8 text-xs" aria-label="Kind">
                      <span className={cn("mr-1 size-2 rounded-full", eventKind(event.kind).dot)} aria-hidden />
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
                  <div className="min-w-0">
                    <Input aria-label="Title" value={event.title} onChange={(e) => patchEvent(index, { title: e.target.value })} className="h-8 text-xs" />
                    {event.warning && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">{event.warning}</p>}
                    {event.semester && <p className="mt-0.5 text-[11px] text-muted-foreground">{event.semester}</p>}
                  </div>
                  <Input aria-label="First day" type="date" value={event.start_date} onChange={(e) => patchEvent(index, { start_date: e.target.value })} className="h-8 text-xs" />
                  <Input aria-label="Last day" type="date" value={event.end_date ?? ""} onChange={(e) => patchEvent(index, { end_date: e.target.value || null })} className="h-8 text-xs" />
                  <Input aria-label="Applies to" value={event.audience ?? ""} placeholder="Everyone" onChange={(e) => patchEvent(index, { audience: e.target.value || null })} className="h-8 text-xs" />
                  <Button variant="ghost" size="icon" aria-label={`Remove ${event.title}`} onClick={() => removeEvent(index)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
              {rows.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nothing to show.</li>}
            </ul>
            <p className="text-xs text-muted-foreground">
              Year {formatPeriodDate(draft.year_start)} to {formatPeriodDate(draft.year_end)}
              {draft.source && <Badge variant="outline" className="ml-2 px-1.5 py-0 text-[10px]">read by {draft.source}</Badge>}
            </p>
          </section>

          {(error || draftProblem) && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error ?? draftProblem}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(null)
                onLock(false)
              }}
              disabled={busy === "save"}
            >
              Back
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy === "save"}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={busy !== null || Boolean(draftProblem)}>
                {busy === "save" && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save calendar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
