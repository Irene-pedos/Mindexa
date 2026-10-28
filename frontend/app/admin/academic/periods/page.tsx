"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileEdit,
  Loader2,
  MoreVertical,
  Plus,
  Power,
  PowerOff,
  Search,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { adminAcademicApi, type AcademicPeriodItem } from "@/lib/api/academic"
import { adminApi } from "@/lib/api/admin"
import { errorMessage } from "@/lib/error-message"
import {
  daysFrom,
  durationLabel,
  formatPeriodDate,
  periodState,
  todayIso,
  typeLabel,
  type PeriodState,
} from "@/lib/academic-period"
import { cn } from "@/lib/utils"
import {
  PeriodDialog,
  type PeriodDialogState,
  type PeriodFormValues,
  type PeriodInstitution,
} from "@/components/mindexa/admin/periods/period-dialog"

const PAGE_SIZE = 8

type StateFilter = "all" | PeriodState | "inactive"

const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "current", label: "Current" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "inactive", label: "Inactive" },
]

/** What an admin should see for a period: running, coming, finished, or switched off. */
function displayState(period: AcademicPeriodItem, today: string): PeriodState | "inactive" {
  return period.is_active ? periodState(period.start_date, period.end_date, today) : "inactive"
}

const STATE_STYLE: Record<PeriodState | "inactive", { dot: string; text: string; label: string }> = {
  current: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", label: "Current" },
  upcoming: { dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-400", label: "Upcoming" },
  past: { dot: "bg-muted-foreground/50", text: "text-muted-foreground", label: "Finished" },
  inactive: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", label: "Inactive" },
}

function timing(period: AcademicPeriodItem, today: string): string {
  const state = displayState(period, today)
  if (state === "current") {
    const left = daysFrom(today, period.end_date)
    return left === 0 ? "Ends today" : `Ends in ${left} day${left === 1 ? "" : "s"}`
  }
  if (state === "upcoming") {
    const wait = daysFrom(today, period.start_date)
    return `Starts in ${wait} day${wait === 1 ? "" : "s"}`
  }
  return ""
}

export default function AcademicPeriodsPage() {
  const [periods, setPeriods] = useState<AcademicPeriodItem[] | null>(null)
  const [institutions, setInstitutions] = useState<PeriodInstitution[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [institutionId, setInstitutionId] = useState("all")
  const [stateFilter, setStateFilter] = useState<StateFilter>("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const [dialog, setDialog] = useState<PeriodDialogState | null>(null)
  const [confirmClose, setConfirmClose] = useState<AcademicPeriodItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // "today" is read once per mount so the labels do not flicker during a render pass
  const [today] = useState(() => todayIso())

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [rows, insts] = await Promise.all([adminAcademicApi.getAcademicPeriods(), adminApi.getInstitutions()])
      setPeriods(rows)
      setInstitutions(
        (insts as (PeriodInstitution & { is_active: boolean })[]).filter((i) => i.is_active),
      )
    } catch (err) {
      setLoadError(errorMessage(err, "Could not load the academic periods."))
      setPeriods((current) => current ?? [])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const institutionName = useMemo(() => new Map(institutions.map((i) => [i.id, i.name])), [institutions])
  const many = institutions.length > 1

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (periods ?? []).filter(
      (p) =>
        (institutionId === "all" || p.institution_id === institutionId) &&
        (stateFilter === "all" || displayState(p, today) === stateFilter) &&
        (!q || p.name.toLowerCase().includes(q)),
    )
  }, [periods, institutionId, stateFilter, search, today])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const rows = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const filtersActive = Boolean(search.trim()) || stateFilter !== "all" || institutionId !== "all"

  const counts = useMemo(() => {
    const result: Record<StateFilter, number> = { all: 0, current: 0, upcoming: 0, past: 0, inactive: 0 }
    for (const p of periods ?? []) {
      if (institutionId !== "all" && p.institution_id !== institutionId) continue
      result.all += 1
      result[displayState(p, today)] += 1
    }
    return result
  }, [periods, institutionId, today])

  /** For each institution in view: the period running today, or nothing. */
  const running = useMemo(() => {
    return institutions
      .filter((i) => institutionId === "all" || i.id === institutionId)
      .map((inst) => {
        const live = (periods ?? [])
          .filter((p) => p.institution_id === inst.id && displayState(p, today) === "current")
          .sort((a, b) => a.start_date.localeCompare(b.start_date))
        return { inst, live }
      })
  }, [institutions, institutionId, periods, today])

  const resetFilters = () => {
    setSearch("")
    setStateFilter("all")
    setInstitutionId("all")
    setPage(1)
  }

  const openCreate = () => {
    const fallback = institutionId !== "all" ? institutionId : (institutions[0]?.id ?? "")
    if (!fallback) {
      toast.error("Register an institution first, then add its periods.")
      return
    }
    setDialog({ mode: "create", institutionId: fallback })
  }

  const submit = async (state: PeriodDialogState, v: PeriodFormValues) => {
    const body = {
      name: v.name,
      period_type: v.type,
      start_date: v.start,
      end_date: v.end,
      is_active: v.active,
    }
    if (state.mode === "create") {
      await adminAcademicApi.createAcademicPeriod({ ...body, institution_id: v.institutionId })
      toast.success(`${v.name} created`)
    } else {
      await adminAcademicApi.updateAcademicPeriod(state.period.id, body)
      toast.success("Period updated")
    }
    setDialog(null)
    await load()
  }

  const applyActive = async (period: AcademicPeriodItem, active: boolean) => {
    setBusyId(period.id)
    try {
      await adminAcademicApi.updateAcademicPeriod(period.id, { is_active: active })
      toast.success(`${period.name} ${active ? "is open for use again" : "is now inactive"}`)
      await load()
    } catch (err) {
      toast.error(errorMessage(err, `Could not ${active ? "reopen" : "close"} ${period.name}.`))
    } finally {
      setBusyId(null)
    }
  }

  const loading = periods === null

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Academic Periods</h1>
          <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
            The calendar every course and teaching assignment is placed in: academic years, semesters, terms or quarters.
          </p>
        </div>
        <Button className="self-start" onClick={openCreate}>
          <Plus className="mr-1.5 size-4" />
          New period
        </Button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <span>{loadError}</span>
          <Button variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}

      {/* What is running right now, per institution */}
      <section aria-label="Running now" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loading
          ? [1, 2, 3].slice(0, 2).map((i) => <Skeleton key={i} className="h-[4.5rem] rounded-2xl" />)
          : running.map(({ inst, live }) => (
              <div
                key={inst.id}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border bg-card p-3.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300",
                  live.length === 0 && "border-amber-500/40",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    live.length ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                  )}
                >
                  {live.length ? <CalendarClock className="size-4.5" /> : <AlertTriangle className="size-4.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-muted-foreground">{inst.name}</p>
                  {live.length ? (
                    <>
                      <p className="truncate text-sm font-semibold">{live.map((p) => p.name).join(" · ")}</p>
                      <p className="text-xs text-muted-foreground">{timing(live[0], today)}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold">No period is running today</p>
                      <button
                        type="button"
                        onClick={() => setDialog({ mode: "create", institutionId: inst.id })}
                        className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                      >
                        Add one
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
      </section>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-col gap-3 border-b bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name"
              aria-label="Search periods"
              className="h-8 pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Filter by status"
              className="flex max-w-full items-center overflow-x-auto rounded-lg border bg-muted/60 p-0.5"
            >
              {STATE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={stateFilter === f.value}
                  onClick={() => {
                    setStateFilter(f.value)
                    setPage(1)
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200",
                    stateFilter === f.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                  <span className="tabular-nums text-[10px] opacity-70">{counts[f.value]}</span>
                </button>
              ))}
            </div>
            {many && (
              <Select
                value={institutionId}
                onValueChange={(v) => {
                  if (!v) return
                  setInstitutionId(v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-8 w-full sm:w-52" aria-label="Filter by institution">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="all">All institutions</SelectItem>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div
          className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_2.5rem] gap-4 border-b bg-muted/10 px-4 py-2 text-xs font-semibold text-muted-foreground md:grid"
          aria-hidden
        >
          <span>Period</span>
          <span>Dates</span>
          <span>Status</span>
          <span>In use</span>
          <span />
        </div>

        <ul className={cn("divide-y transition-opacity duration-200", loading && "opacity-60")}>
          {loading ? (
            [1, 2, 3, 4].map((i) => (
              <li key={i} className="px-4 py-3.5">
                <Skeleton className="h-10 w-full" />
              </li>
            ))
          ) : rows.length === 0 ? (
            <li className="px-4 py-14 text-center">
              {filtersActive ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">No period matches your filters.</p>
                  <Button variant="outline" onClick={resetFilters}>
                    Clear filters
                  </Button>
                </div>
              ) : (
                <div className="mx-auto max-w-sm space-y-2">
                  <CalendarDays className="mx-auto size-7 text-muted-foreground" />
                  <p className="text-sm font-medium">No academic periods yet</p>
                  <p className="text-xs text-muted-foreground">
                    Create the first period, for example a semester, so courses and assignments have a place in the calendar.
                  </p>
                  <Button onClick={openCreate}>
                    <Plus className="mr-1.5 size-4" />
                    New period
                  </Button>
                </div>
              )}
            </li>
          ) : (
            rows.map((period, index) => {
              const state = displayState(period, today)
              const style = STATE_STYLE[state]
              const hint = timing(period, today)
              const inUse = period.course_count + period.assignment_count > 0
              return (
                <li
                  key={period.id}
                  style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/20 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:fill-mode-backwards",
                    "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_2.5rem]",
                    state === "past" && "opacity-75",
                  )}
                >
                  <div className="order-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: "edit", period })}
                      className="block max-w-full truncate text-left text-sm font-semibold leading-tight hover:underline"
                    >
                      {period.name}
                    </button>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium">
                        {typeLabel(period.period_type)}
                      </Badge>
                      {many && <span className="truncate">{institutionName.get(period.institution_id)}</span>}
                    </p>
                  </div>

                  <div className="order-3 col-span-2 text-xs text-muted-foreground md:order-2 md:col-span-1 md:text-sm">
                    <span className="text-foreground">
                      {formatPeriodDate(period.start_date)} – {formatPeriodDate(period.end_date)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {durationLabel(period.start_date, period.end_date)}
                    </span>
                  </div>

                  <div className="order-4 col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 md:order-3 md:col-span-1 md:block">
                    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", style.text)}>
                      <span className={cn("size-2 rounded-full", style.dot)} aria-hidden />
                      {style.label}
                    </span>
                    {hint && <span className="text-xs text-muted-foreground md:block">{hint}</span>}
                  </div>

                  <div className="hidden text-sm md:order-4 md:block">
                    {inUse ? (
                      <span className="text-muted-foreground">
                        {period.course_count} course{period.course_count === 1 ? "" : "s"}
                        <span className="block text-xs">
                          {period.assignment_count} assignment{period.assignment_count === 1 ? "" : "s"}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not used yet</span>
                    )}
                  </div>

                  <div className="order-2 text-right md:order-5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${period.name}`}
                          disabled={busyId === period.id}
                        >
                          {busyId === period.id ? <Loader2 className="animate-spin" /> : <MoreVertical />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={() => setDialog({ mode: "edit", period })}>
                          <FileEdit className="mr-2 size-3.5" /> Edit period
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {period.is_active ? (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => (inUse ? setConfirmClose(period) : void applyActive(period, false))}
                          >
                            <PowerOff className="mr-2 size-3.5" /> Close for use
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="text-emerald-700 focus:text-emerald-700 dark:text-emerald-400"
                            onClick={() => void applyActive(period, true)}
                          >
                            <Power className="mr-2 size-3.5" /> Reopen
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              )
            })
          )}
        </ul>

        <div className="flex items-center justify-between border-t bg-muted/10 px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            {visible.length === 0
              ? "No periods"
              : `Showing ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, visible.length)} of ${visible.length}${filtersActive ? " matching" : ""}`}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous page"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="px-1 tabular-nums">
              {safePage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next page"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>

      <PeriodDialog
        state={dialog}
        institutions={institutions}
        periods={periods ?? []}
        onClose={() => setDialog(null)}
        onSubmit={submit}
      />

      <AlertDialog open={confirmClose !== null} onOpenChange={(open) => !open && setConfirmClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {confirmClose?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It is used by {confirmClose?.course_count} course{confirmClose?.course_count === 1 ? "" : "s"} and{" "}
              {confirmClose?.assignment_count} assignment{confirmClose?.assignment_count === 1 ? "" : "s"}. They keep
              working and nothing is deleted; the period just stops appearing when new courses or assignments are created.
              You can reopen it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it open</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const period = confirmClose
                setConfirmClose(null)
                if (period) void applyActive(period, false)
              }}
            >
              <CheckCircle2 className="mr-1.5 size-4" />
              Close period
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
