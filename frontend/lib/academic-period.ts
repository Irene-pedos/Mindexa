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

/** A readable default name that does not collide with `taken` (compared ignoring case). */
export function suggestName(type: PeriodType, start: string, taken: Iterable<string> = []): string {
  if (!ISO.test(start)) return ""
  const used = new Set(Array.from(taken, (n) => n.trim().toLowerCase()))
  const startYear = Number(start.slice(0, 4))
  if (type === "YEAR") {
    const endYear = Number(suggestEndDate("YEAR", start).slice(0, 4))
    return startYear === endYear ? `${startYear} Academic Year` : `${startYear}-${endYear} Academic Year`
  }
  const word = type === "SEMESTER" ? "Semester" : type === "TRIMESTER" ? "Term" : "Quarter"
  for (let n = 1; n < 10; n++) {
    const name = `${word} ${n} ${startYear}`
    if (!used.has(name.toLowerCase())) return name
  }
  return `${word} ${startYear}`
}

export interface PeriodLike {
  id: string
  name: string
  period_type: string
  start_date: string
  end_date: string
  is_active: boolean
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

export function validatePeriod(draft: PeriodDraft, others: PeriodLike[], selfId?: string): PeriodErrors {
  const errors: PeriodErrors = {}
  const name = draft.name.trim()
  if (name.length < 2) errors.name = "Give the period a name of at least 2 characters."
  else if (name.length > 255) errors.name = "Keep the name under 255 characters."
  else if (others.some((p) => p.id !== selfId && p.name.trim().toLowerCase() === name.toLowerCase()))
    errors.name = "Another period of this institution already has this name."

  if (!ISO.test(draft.start)) errors.start = "Pick the first day of the period."
  if (!ISO.test(draft.end)) errors.end = "Pick the last day of the period."
  else if (ISO.test(draft.start) && draft.end <= draft.start) errors.end = "The end date must be after the start date."

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

/** Days until a period starts or ends, for the "ends in 12 days" hint. Negative when already past. */
export function daysFrom(today: string, target: string): number {
  return Math.round((toUtc(target) - toUtc(today)) / 86_400_000)
}
