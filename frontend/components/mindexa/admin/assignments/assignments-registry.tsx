"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  BookX,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { adminApi, type UserResponse } from "@/lib/api/admin"
import { adminAcademicApi, type TeachingAssignment } from "@/lib/api/academic"
import { ROLE_LABELS, type AssignmentRole } from "@/lib/assignment-plan"
import { errorMessage } from "@/lib/error-message"
import { cn } from "@/lib/utils"
import { AssignmentDialog, type AssignmentDialogState } from "./assignment-dialog"

const PAGE_SIZE = 10

const nameOf = (l: UserResponse | undefined) =>
  l ? [l.profile?.first_name, l.profile?.last_name].filter(Boolean).join(" ") || l.email : "Unknown lecturer"

export function AssignmentsRegistry() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [assignments, setAssignments] = useState<TeachingAssignment[] | null>(null)
  const [lecturers, setLecturers] = useState<UserResponse[]>([])
  const [uncovered, setUncovered] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [lecturerFilter, setLecturerFilter] = useState("all")
  const [periodFilter, setPeriodFilter] = useState("all")
  const [page, setPage] = useState(1)

  const [dialog, setDialog] = useState<AssignmentDialogState | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<TeachingAssignment | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    const [list, people, courses] = await Promise.allSettled([
      adminAcademicApi.getLecturerAssignments(),
      adminApi.getLecturers(),
      adminApi.getCourses({ pageSize: 1, status: "active" }),
    ])
    if (list.status === "fulfilled") setAssignments(list.value)
    else {
      setAssignments((prev) => prev ?? [])
      setLoadError(errorMessage(list.reason, "Could not load the teaching assignments."))
    }
    if (people.status === "fulfilled") setLecturers(people.value)
    if (courses.status === "fulfilled") setUncovered(courses.value.summary.unassigned)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // links from other pages: ?new=1&lecturer_id=...&course_id=...
  const [linkHandled, setLinkHandled] = useState(false)
  useEffect(() => {
    if (linkHandled || searchParams.get("new") !== "1") return
    setLinkHandled(true)
    setDialog({
      lecturerId: searchParams.get("lecturer_id") ?? undefined,
      courseId: searchParams.get("course_id") ?? undefined,
    })
    router.replace(pathname, { scroll: false })
  }, [linkHandled, searchParams, router, pathname])

  const lecturerById = useMemo(() => new Map(lecturers.map((l) => [l.id, l])), [lecturers])

  const periods = useMemo(
    () =>
      [...new Set((assignments ?? []).map((a) => a.academic_year).filter((y): y is string => Boolean(y)))]
        .sort()
        .reverse(),
    [assignments],
  )

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (assignments ?? [])
      .filter((a) => lecturerFilter === "all" || a.lecturer_id === lecturerFilter)
      .filter((a) => periodFilter === "all" || a.academic_year === periodFilter)
      .filter((a) => {
        if (!q) return true
        const hay = `${nameOf(lecturerById.get(a.lecturer_id))} ${a.course_name ?? ""} ${a.course_code ?? ""} ${a.department_name ?? ""}`
        return hay.toLowerCase().includes(q)
      })
      .sort(
        (a, b) =>
          nameOf(lecturerById.get(a.lecturer_id)).localeCompare(nameOf(lecturerById.get(b.lecturer_id))) ||
          (a.course_code ?? "").localeCompare(b.course_code ?? ""),
      )
  }, [assignments, lecturerFilter, periodFilter, search, lecturerById])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const filtersActive = Boolean(search.trim()) || lecturerFilter !== "all" || periodFilter !== "all"

  const teaching = useMemo(() => new Set((assignments ?? []).map((a) => a.lecturer_id)), [assignments])
  const idleLecturers = lecturers.filter((l) => !teaching.has(l.id)).length

  const remove = async (a: TeachingAssignment) => {
    setRemovingId(a.id)
    try {
      await adminAcademicApi.removeAssignment(a.id)
      toast.success(`${a.course_code ?? "Assignment"} removed from ${nameOf(lecturerById.get(a.lecturer_id))}`)
      await load()
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove the assignment."))
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Teaching Assignments</h1>
          <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
            Who teaches what. A lecturer sees a course, its classes and its students only once they are assigned to it.
          </p>
        </div>
        <Button className="self-start" onClick={() => setDialog({})}>
          <Plus className="mr-1.5 size-4" />
          Assign a lecturer
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

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Users} label="Assignments" value={assignments ? assignments.length : null} note="active" />
        <Kpi
          icon={UserCheck}
          label="Lecturers teaching"
          value={assignments ? teaching.size : null}
          note={`of ${lecturers.length}`}
        />
        <Kpi
          icon={UserX}
          label="Lecturers without courses"
          value={assignments ? idleLecturers : null}
          note="nothing assigned yet"
          warn={idleLecturers > 0}
        />
        <Kpi
          icon={BookX}
          label="Courses without a lecturer"
          value={uncovered}
          note="need an assignment"
          warn={(uncovered ?? 0) > 0}
        />
      </dl>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-col gap-3 border-b bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by lecturer, course or department"
              aria-label="Search assignments"
              className="h-8 pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={lecturerFilter}
              onValueChange={(v) => {
                setLecturerFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-8 w-48" aria-label="Filter by lecturer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">All lecturers</SelectItem>
                {lecturers.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {nameOf(l)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {periods.length > 1 && (
              <Select
                value={periodFilter}
                onValueChange={(v) => {
                  setPeriodFilter(v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-8 w-36" aria-label="Filter by period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="all">All periods</SelectItem>
                  {periods.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/20">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-10 pl-4 text-xs font-semibold">Lecturer</TableHead>
                <TableHead className="h-10 text-xs font-semibold">Course</TableHead>
                <TableHead className="h-10 text-xs font-semibold">Teaches</TableHead>
                <TableHead className="h-10 text-xs font-semibold">Role</TableHead>
                <TableHead className="h-10 text-xs font-semibold">Period</TableHead>
                <TableHead className="h-10 pr-4 text-right text-xs font-semibold">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments === null ? (
                [1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6} className="px-4">
                      <Skeleton className="h-9 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center">
                    {filtersActive ? (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">No assignment matches your filters.</p>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSearch("")
                            setLecturerFilter("all")
                            setPeriodFilter("all")
                          }}
                        >
                          Clear filters
                        </Button>
                      </div>
                    ) : (
                      <div className="mx-auto max-w-sm space-y-2">
                        <Users className="mx-auto size-7 text-muted-foreground" />
                        <p className="text-sm font-medium">No assignments yet</p>
                        <p className="text-xs text-muted-foreground">
                          Assign a lecturer to a course so they can start teaching it.
                        </p>
                        <Button onClick={() => setDialog({})}>
                          <Plus className="mr-1.5 size-4" />
                          Assign a lecturer
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((a) => {
                  const lecturer = lecturerById.get(a.lecturer_id)
                  const name = nameOf(lecturer)
                  return (
                    <TableRow key={a.id} className="h-16">
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {name[0]?.toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold leading-tight">{name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {lecturer?.profile?.staff_id ?? lecturer?.email ?? ""}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {a.course_code && (
                            <Badge variant="outline" className="shrink-0 font-mono text-[11px]">
                              {a.course_code}
                            </Badge>
                          )}
                          <span className="max-w-[16rem] truncate text-sm">{a.course_name ?? "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[16rem]">
                        {a.class_section_name ? (
                          <>
                            <span className="block truncate text-sm">
                              {[a.option_name, a.class_group_name, a.class_section_name].filter(Boolean).join(" › ")}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">{a.department_name}</span>
                          </>
                        ) : (
                          <>
                            <span className="block truncate text-sm text-muted-foreground">Everyone in</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {a.department_name ?? "the department"}
                            </span>
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-normal">
                          {ROLE_LABELS[a.role as AssignmentRole] ?? a.role.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.academic_year}</TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${a.course_code ?? "assignment"} from ${name}`}
                          title="Remove assignment"
                          disabled={removingId === a.id}
                          onClick={() => setConfirmRemove(a)}
                          className="hover:bg-destructive/10 hover:text-destructive"
                        >
                          {removingId === a.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                        </Button>
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
              ? "No assignments"
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

      <AssignmentDialog
        state={dialog}
        lecturers={lecturers}
        onClose={() => setDialog(null)}
        onCreated={async (count) => {
          toast.success(`${count} assignment${count === 1 ? "" : "s"} created. The lecturer has been notified.`)
          setDialog(null)
          await load()
        }}
      />

      <AlertDialog open={confirmRemove !== null} onOpenChange={(open) => !open && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {confirmRemove?.course_code ?? "this assignment"} from{" "}
              {nameOf(lecturerById.get(confirmRemove?.lecturer_id ?? ""))}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer see this course or its students. Assessments and results already created are kept. You
              can assign them again later.{" "}
              <Link href="/admin/courses" className="font-medium text-primary hover:underline">
                Manage courses
              </Link>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep assignment</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const a = confirmRemove
                setConfirmRemove(null)
                if (a) void remove(a)
              }}
            >
              Remove
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
  warn = false,
}: {
  icon: LucideIcon
  label: string
  value: number | null
  note: string
  warn?: boolean
}) {
  return (
    <div
      className={cn("flex items-center justify-between rounded-2xl border bg-card p-4", warn && "border-amber-500/40")}
    >
      <div className="space-y-0.5">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="text-2xl font-semibold tabular-nums tracking-tight">
          {value === null ? <Skeleton className="h-8 w-12" /> : value}
        </dd>
        <p className={cn("text-[11px]", warn ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
          {note}
        </p>
      </div>
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground",
          warn && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        )}
      >
        <Icon className="size-4" />
      </span>
    </div>
  )
}
