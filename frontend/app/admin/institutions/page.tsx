"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowUpDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  Globe,
  GraduationCap,
  Library,
  Loader2,
  MoreVertical,
  Network,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { adminApi } from "@/lib/api/admin"
import { adminAcademicApi, type InstitutionOverview } from "@/lib/api/academic"
import { errorMessage } from "@/lib/error-message"
import { cn } from "@/lib/utils"
import { PRESETS, presetProfile, profileToSettings, readProfile } from "@/lib/structure-profile"
import { timezoneLabel } from "@/lib/timezones"
import {
  InstitutionDialog,
  type InstitutionDialogState,
  type InstitutionFormValues,
  type InstitutionRecord,
} from "@/components/mindexa/admin/institutions/institution-dialog"

const PAGE_SIZE = 10
type StatusFilter = "all" | "active" | "suspended"

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default function InstitutionsPage() {
  const router = useRouter()
  const [institutions, setInstitutions] = useState<InstitutionRecord[] | null>(null)
  const [overview, setOverview] = useState<Map<string, InstitutionOverview>>(new Map())
  const [loadError, setLoadError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [sortAsc, setSortAsc] = useState(true)
  const [page, setPage] = useState(1)

  const [dialog, setDialog] = useState<InstitutionDialogState | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<InstitutionRecord | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    const [list, counts] = await Promise.allSettled([
      adminApi.getInstitutions(),
      adminAcademicApi.getStructureOverview(),
    ])
    if (list.status === "fulfilled") setInstitutions(list.value as InstitutionRecord[])
    else {
      setInstitutions((prev) => prev ?? [])
      setLoadError(errorMessage(list.reason, "Could not load institutions."))
    }
    // counts are a nicety: the page still works without them
    if (counts.status === "fulfilled") setOverview(new Map(counts.value.map((c) => [c.institution_id, c])))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // ── derived ─────────────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (institutions ?? [])
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q))
      .filter((i) => (status === "all" ? true : status === "active" ? i.is_active : !i.is_active))
      .sort((a, b) => a.name.localeCompare(b.name) * (sortAsc ? 1 : -1))
  }, [institutions, search, status, sortAsc])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totals = useMemo(() => {
    const active = (institutions ?? []).filter((i) => i.is_active)
    const sum = (key: keyof Omit<InstitutionOverview, "institution_id">) =>
      active.reduce((acc, i) => acc + (overview.get(i.id)?.[key] ?? 0), 0)
    return {
      active: active.length,
      suspended: (institutions ?? []).length - active.length,
      departments: sum("departments"),
      classes: sum("classes"),
      students: sum("students"),
    }
  }, [institutions, overview])

  // ── actions ─────────────────────────────────────────────────────────────────
  const submit = async (state: InstitutionDialogState, v: InstitutionFormValues) => {
    if (state.mode === "create") {
      const created = (await adminApi.createInstitution({
        name: v.name.trim(),
        code: v.code,
        timezone: v.timezone,
        ...(v.logo ? { logo_url: v.logo } : {}),
        ...(v.type !== "later" ? { settings: profileToSettings(presetProfile(v.type)) } : {}),
      })) as { id: string }
      toast.success(`${v.name.trim()} registered`, {
        action: {
          label: "Organize it",
          onClick: () => router.push(`/admin/academic/structure?institution=${created.id}`),
        },
      })
    } else {
      await adminApi.updateInstitution(state.institution.id, {
        name: v.name.trim(),
        timezone: v.timezone,
        ...(v.logo !== undefined ? { logo_url: v.logo } : {}),
      })
      toast.success("Institution updated")
    }
    setDialog(null)
    await load()
  }

  const applyActive = async (inst: InstitutionRecord, active: boolean) => {
    setBusyId(inst.id)
    try {
      await adminApi.updateInstitution(inst.id, { is_active: active })
      toast.success(`${inst.name} ${active ? "reactivated" : "suspended"}`)
      await load()
    } catch (err) {
      toast.error(errorMessage(err, `Could not ${active ? "reactivate" : "suspend"} ${inst.name}.`))
    } finally {
      setBusyId(null)
    }
  }

  const takenCodes = useMemo(() => (institutions ?? []).map((i) => i.code), [institutions])

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Institutions</h1>
          <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
            The universities, colleges, schools and centres on the platform. Each one has its own structure, courses and
            people.
          </p>
        </div>
        <Button className="self-start" onClick={() => setDialog({ mode: "create" })}>
          <Plus className="mr-1.5 size-4" />
          Register institution
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

      {/* Real figures across the active institutions */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={Building2}
          label="Institutions"
          value={institutions ? totals.active : null}
          note={totals.suspended ? `${totals.suspended} suspended` : "all active"}
        />
        <Kpi
          icon={Library}
          label="Departments"
          value={institutions ? totals.departments : null}
          note="across active institutions"
        />
        <Kpi icon={GraduationCap} label="Classes" value={institutions ? totals.classes : null} note="student groups" />
        <Kpi icon={Users} label="Students" value={institutions ? totals.students : null} note="enrolled" />
      </dl>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-col gap-3 border-b bg-muted/20 p-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or code"
              aria-label="Search institutions"
              className="h-8 pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <div
            role="group"
            aria-label="Filter by status"
            className="flex w-fit items-center rounded-lg border bg-muted/60 p-0.5"
          >
            {(["all", "active", "suspended"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => {
                  setStatus(s)
                  setPage(1)
                }}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                  status === s
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/20">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-10 pl-4">
                  <button
                    type="button"
                    onClick={() => setSortAsc((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-semibold"
                    aria-label="Sort by name"
                  >
                    Institution <ArrowUpDown className="size-3 text-muted-foreground" />
                  </button>
                </TableHead>
                <TableHead className="h-10 text-xs font-semibold">Structure</TableHead>
                <TableHead className="h-10 text-xs font-semibold">What is in it</TableHead>
                <TableHead className="h-10 text-xs font-semibold">Timezone</TableHead>
                <TableHead className="h-10 text-xs font-semibold">Status</TableHead>
                <TableHead className="h-10 pr-4 text-right text-xs font-semibold">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {institutions === null ? (
                [1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6} className="px-4">
                      <Skeleton className="h-9 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center">
                    {institutions.length === 0 ? (
                      <div className="mx-auto max-w-sm space-y-2">
                        <Building2 className="mx-auto size-7 text-muted-foreground" />
                        <p className="text-sm font-medium">No institutions yet</p>
                        <p className="text-xs text-muted-foreground">
                          Register your first institution to start organizing departments, classes and courses.
                        </p>
                        <Button onClick={() => setDialog({ mode: "create" })}>
                          <Plus className="mr-1.5 size-4" />
                          Register institution
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No institution matches your search.</p>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((inst) => {
                  const counts = overview.get(inst.id)
                  const profile = readProfile(inst.settings)
                  const preset = profile ? PRESETS.find((p) => p.key === profile.preset)?.title : null
                  return (
                    <TableRow key={inst.id} className={cn("h-16", !inst.is_active && "opacity-70")}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <div className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/50">
                            {inst.logo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element -- stored as a data URL
                              <img src={inst.logo_url} alt="" className="size-full object-cover" />
                            ) : (
                              <Building2 className="size-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold leading-tight">{inst.name}</p>
                            <Badge variant="outline" className="mt-0.5 font-mono text-[10px]">
                              {inst.code}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {preset ? (
                          <span className="text-sm">{preset}</span>
                        ) : (
                          <Link
                            href={`/admin/academic/structure?institution=${inst.id}`}
                            className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
                          >
                            Not set up yet
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {counts
                          ? counts.departments + counts.classes + counts.students === 0
                            ? "Empty"
                            : [
                                plural(counts.departments, "department"),
                                plural(counts.classes, "class", "classes"),
                                plural(counts.students, "student"),
                              ].join(" · ")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Globe className="size-3.5 shrink-0" />
                          {timezoneLabel(inst.timezone)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span
                            className={cn("size-2 rounded-full", inst.is_active ? "bg-emerald-500" : "bg-amber-500")}
                            aria-hidden
                          />
                          {inst.is_active ? "Active" : "Suspended"}
                        </span>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="outline" asChild className="hidden sm:inline-flex">
                            <Link href={`/admin/academic/structure?institution=${inst.id}`}>
                              <Network className="mr-1.5 size-3.5" />
                              Structure
                            </Link>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Actions for ${inst.name}`}
                                disabled={busyId === inst.id}
                              >
                                {busyId === inst.id ? <Loader2 className="animate-spin" /> : <MoreVertical />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/academic/structure?institution=${inst.id}`}>
                                  <Network className="mr-2 size-3.5" /> Open structure
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDialog({ mode: "edit", institution: inst })}>
                                <Pencil className="mr-2 size-3.5" /> Edit details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {inst.is_active ? (
                                <DropdownMenuItem
                                  className="text-amber-700 focus:text-amber-700 dark:text-amber-400"
                                  onClick={() => setConfirmToggle(inst)}
                                >
                                  <PowerOff className="mr-2 size-3.5" /> Suspend
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="text-emerald-700 focus:text-emerald-700 dark:text-emerald-400"
                                  onClick={() => void applyActive(inst, true)}
                                >
                                  <Power className="mr-2 size-3.5" /> Reactivate
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between border-t bg-muted/10 px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            {rows.length === 0
              ? "No institutions"
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, rows.length)} of ${rows.length}`}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="px-1 tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next page"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>

      <InstitutionDialog
        state={dialog}
        takenCodes={dialog?.mode === "edit" ? [] : takenCodes}
        onClose={() => setDialog(null)}
        onSubmit={submit}
      />

      <AlertDialog open={confirmToggle !== null} onOpenChange={(open) => !open && setConfirmToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend {confirmToggle?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will stop appearing when choosing an institution (new courses, teaching assignments, structure). Its
              data is kept, and you can reactivate it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep active</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const inst = confirmToggle
                setConfirmToggle(null)
                if (inst) void applyActive(inst, false)
              }}
            >
              Suspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon
  label: string
  value: number | null
  note: string
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-card p-4">
      <div className="space-y-0.5">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="text-2xl font-semibold tabular-nums tracking-tight">
          {value === null ? <Skeleton className="h-8 w-12" /> : value}
        </dd>
        <p className="text-[11px] text-muted-foreground">{note}</p>
      </div>
      <span className="flex size-9 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
        <Icon className="size-4" />
      </span>
    </div>
  )
}
