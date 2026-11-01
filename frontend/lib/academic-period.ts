/**
 * Academic period helpers for the admin "Academic Periods" screen.
 *
 * Dates are plain "YYYY-MM-DD" strings end to end, so a period never shifts a day because of the
 * browser's timezone. The rules mirror the server's (end after start, unique name, no overlap
 * between periods of the same type) so the form can explain a problem before it is sent.
 */

export type PeriodType = "YEAR" | "SEMESTER" | "TRIMESTER" | "QUARTER"

export interface PeriodTypeInfo {
  value: PeriodType
  label: string
  months: number
}

export const PERIOD_TYPES: PeriodTypeInfo[] = [
  { value: "YEAR", label: "Academic year", months: 12 },
  { value: "SEMESTER", label: "Semester", months: 6 },
  { value: "TRIMESTER", label: "Trimester / term", months: 4 },
  { value: "QUARTER", label: "Quarter", months: 3 },
]

export const typeLabel = (value: string): string => PERIOD_TYPES.find((t) => t.value === value)?.label ?? value

export type PeriodState = "current" | "upcoming" | "past"

const ISO = /^\d{4}-\d{2}-\d{2}$/

const toUtc = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** Today as "YYYY-MM-DD" in the browser's own calendar. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

export function periodState(start: string, end: string, today: string = todayIso()): PeriodState {
  if (end < today) return "past"
  if (start > today) return "upcoming"
  return "current"
}

/** The day a period of `type` starting on `start` would normally finish (one day before the next one). */
export function suggestEndDate(type: PeriodType, start: string): string {
  if (!ISO.test(start)) return ""
  const months = PERIOD_TYPES.find((t) => t.value === type)?.months ?? 6
  const [y, m, d] = start.split("-").map(Number)
  const next = Date.UTC(y, m - 1 + months, d)
  // Jan 31 + 1 month would roll into March; clamp to the last day of the target month instead.
  const target = new Date(next)
  const clamped = target.getUTCDate() !== d ? Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), 0) : next
  return fromUtc(clamped - 86_400_000)
}

/**
 * A readable default name that does not collide with `taken` (compared ignoring case).
 * Names are unique per institution, so a semester carries its year: "Semester 1 2026-2027".
 */
export function suggestName(
  type: PeriodType,
  start: string,
  taken: Iterable<string> = [],
  yearName?: string | null,
): string {
  if (!ISO.test(start)) return ""
  const used = new Set(Array.from(taken, (n) => n.trim().toLowerCase()))
  const startYear = Number(start.slice(0, 4))
  if (type === "YEAR") {
    const endYear = Number(suggestEndDate("YEAR", start).slice(0, 4))
    return startYear === endYear ? `${startYear} Academic Year` : `${startYear}-${endYear} Academic Year`
  }
  const word = type === "SEMESTER" ? "Semester" : type === "TRIMESTER" ? "Term" : "Quarter"
  const suffix = yearName?.trim() || String(startYear)
  for (let n = 1; n < 10; n++) {
    const name = `${word} ${n} ${suffix}`
    if (!used.has(name.toLowerCase())) return name
  }
  return `${word} ${suffix}`
}

export interface PeriodLike {
  id: string
  name: string
  period_type: string
  start_date: string
  end_date: string
  is_active: boolean
  parent_id?: string | null
}

export interface PeriodDraft {
  name: string
  type: PeriodType
  start: string
  end: string
}

export interface PeriodErrors {
  name?: string
  start?: string
  end?: string
}

const fmt = (iso: string): string =>
  new Date(toUtc(iso)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

/** The first other active period of the same type whose dates share a day with the draft. */
export function findOverlap(draft: PeriodDraft, others: PeriodLike[], selfId?: string): PeriodLike | null {
  if (!ISO.test(draft.start) || !ISO.test(draft.end)) return null
  return (
    others.find(
      (p) =>
        p.id !== selfId &&
        p.is_active &&
        p.period_type === draft.type &&
        draft.start <= p.end_date &&
        p.start_date <= draft.end,
    ) ?? null
  )
}

export function validatePeriod(
  draft: PeriodDraft,
  others: PeriodLike[],
  selfId?: string,
  /** The academic year the period will sit in, when it has one. */
  parent?: PeriodLike | null,
): PeriodErrors {
  const errors: PeriodErrors = {}
  const name = draft.name.trim()
  if (name.length < 2) errors.name = "Give the period a name of at least 2 characters."
  else if (name.length > 255) errors.name = "Keep the name under 255 characters."
  else if (others.some((p) => p.id !== selfId && p.name.trim().toLowerCase() === name.toLowerCase()))
    errors.name = "Another period of this institution already has this name."

  if (!ISO.test(draft.start)) errors.start = "Pick the first day of the period."
  if (!ISO.test(draft.end)) errors.end = "Pick the last day of the period."
  else if (ISO.test(draft.start) && draft.end <= draft.start) errors.end = "The end date must be after the start date."

  if (parent && draft.type !== "YEAR" && ISO.test(draft.start) && ISO.test(draft.end)) {
    if (draft.start < parent.start_date || draft.end > parent.end_date)
      errors.start = `The dates must stay inside ${parent.name} (${fmt(parent.start_date)} to ${fmt(parent.end_date)}).`
  }

  if (!errors.end && !errors.start) {
    const clash = findOverlap(draft, others, selfId)
    if (clash)
      errors.start = `These dates overlap "${clash.name}" (${fmt(clash.start_date)} to ${fmt(clash.end_date)}).`
  }
  return errors
}

export const hasErrors = (errors: PeriodErrors): boolean => Object.keys(errors).length > 0

/** "3 months", "10 months", "45 days" for the length of a period. */
export function durationLabel(start: string, end: string): string {
  if (!ISO.test(start) || !ISO.test(end)) return ""
  const days = Math.round((toUtc(end) - toUtc(start)) / 86_400_000) + 1
  if (days < 45) return `${days} day${days === 1 ? "" : "s"}`
  const months = Math.round(days / 30.44)
  return `${months} month${months === 1 ? "" : "s"}`
}

export const formatPeriodDate = fmt

// ── hierarchy: an academic year contains its semesters ───────────────────────

export interface YearGroup<T extends PeriodLike> {
  year: T
  children: T[]
}

/**
 * Academic years (newest first) with their semesters in date order. A period whose year is
 * missing or filtered out stands alone as a group of its own.
 */
export function groupByYear<T extends PeriodLike>(periods: T[]): YearGroup<T>[] {
  const ids = new Set(periods.map((p) => p.id))
  const children = new Map<string, T[]>()
  for (const p of periods) {
    if (p.parent_id && ids.has(p.parent_id)) {
      children.set(p.parent_id, [...(children.get(p.parent_id) ?? []), p])
    }
  }
  return periods
    .filter((p) => !p.parent_id || !ids.has(p.parent_id))
    .map((year) => ({
      year,
      children: (children.get(year.id) ?? []).sort((a, b) => a.start_date.localeCompare(b.start_date)),
    }))
    .sort((a, b) => b.year.start_date.localeCompare(a.year.start_date) || a.year.name.localeCompare(b.year.name))
}

export interface PickerGroup {
  label: string | null
  items: { id: string; label: string }[]
}

/**
 * What a course or assignment can be placed in: each semester under its year's heading, and a
 * year only when it has no semesters (placing a course in a year that has semesters is ambiguous).
 */
export function pickerGroups(periods: PeriodLike[]): PickerGroup[] {
  const groups: PickerGroup[] = []
  const standalone: PickerGroup = { label: null, items: [] }
  for (const { year, children } of groupByYear(periods)) {
    if (children.length === 0) standalone.items.push({ id: year.id, label: year.name })
    else groups.push({ label: year.name, items: children.map((c) => ({ id: c.id, label: c.name })) })
  }
  return standalone.items.length ? [standalone, ...groups] : groups
}

/** The semester (or standalone period) running today, else the most recent one. */
export function defaultPickerId(periods: PeriodLike[], today: string = todayIso()): string {
  const leaves = pickerGroups(periods).flatMap((g) => g.items.map((i) => i.id))
  const byId = new Map(periods.map((p) => [p.id, p]))
  const candidates = leaves.map((id) => byId.get(id)!).filter(Boolean)
  const running = candidates.find((p) => p.start_date <= today && today <= p.end_date)
  if (running) return running.id
  return [...candidates].sort((a, b) => b.start_date.localeCompare(a.start_date))[0]?.id ?? ""
}

// ── dated items of a period ───────────────────────────────────────────────────

export interface EventKindInfo {
  value: string
  label: string
  /** Tailwind classes for the small dot / chip that marks the kind. */
  dot: string
}

export const EVENT_KINDS: EventKindInfo[] = [
  { value: "REGISTRATION", label: "Registration", dot: "bg-sky-500" },
  { value: "HOLIDAY", label: "Holiday / break", dot: "bg-amber-500" },
  { value: "EXAM_PERIOD", label: "Exams", dot: "bg-rose-500" },
  { value: "MARKS_DEADLINE", label: "Marks / report deadline", dot: "bg-orange-500" },
  { value: "DELIBERATION", label: "Board / council meeting", dot: "bg-violet-500" },
  { value: "RESULTS_PUBLICATION", label: "Results published", dot: "bg-emerald-500" },
  { value: "APPEAL_WINDOW", label: "Appeals", dot: "bg-fuchsia-500" },
  { value: "REASSESSMENT_WINDOW", label: "Reassessment", dot: "bg-pink-500" },
  { value: "PLACEMENT", label: "Industrial attachment", dot: "bg-teal-500" },
  { value: "DEFENSE", label: "Defence / presentation", dot: "bg-indigo-500" },
  { value: "OTHER", label: "Other", dot: "bg-muted-foreground" },
]

export const eventKind = (value: string): EventKindInfo =>
  EVENT_KINDS.find((k) => k.value === value) ?? EVENT_KINDS[EVENT_KINDS.length - 1]

/** "17 Aug 2026 – 11 Sep 2026", or a single date when the item is one day. */
export function formatDateRange(start: string, end?: string | null): string {
  return !end || end === start ? fmt(start) : `${fmt(start)} – ${fmt(end)}`
}

/** Days until a period starts or ends, for the "ends in 12 days" hint. Negative when already past. */
export function daysFrom(today: string, target: string): number {
  return Math.round((toUtc(target) - toUtc(today)) / 86_400_000)
}
