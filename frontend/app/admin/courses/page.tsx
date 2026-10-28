"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  BookOpen,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileEdit,
  Globe,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { adminApi, type AdminCourseListItem, type AdminCourseSummary } from "@/lib/api/admin"
import { errorMessage } from "@/lib/error-message"
import { cn } from "@/lib/utils"
import { useDebounce } from "@/hooks/use-debounce"
import {
  CourseDialog,
  LANGUAGES,
  type CourseDetail,
  type CourseDialogState,
  type CourseFormValues,
} from "@/components/mindexa/admin/courses/course-dialog"

const PAGE_SIZE = 10
type StatusFilter = "all" | "active" | "suspended"
type LanguageFilter = "all" | "EN" | "RW" | "FR" | "SW"

interface InstitutionOption {
  id: string
  name: string
  code: string
  is_active: boolean
}

const EMPTY_SUMMARY: AdminCourseSummary = { total: 0, active: 0, suspended: 0, ai_restricted: 0, unassigned: 0 }

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<AdminCourseListItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<AdminCourseSummary>(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)
  const [status, setStatus] = useState<StatusFilter>("all")
  const [language, setLanguage] = useState<LanguageFilter>("all")
  const [institutionId, setInstitutionId] = useState<string>("all")
  const [page, setPage] = useState(1)

  const [institutions, setInstitutions] = useState<InstitutionOption[]>([])
  const [dialog, setDialog] = useState<CourseDialogState | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<AdminCourseListItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const latest = useRef(0)

  const load = useCallback(async () => {
    const request = ++latest.current
    setLoading(true)
    setLoadError(null)
    try {
      const data = await adminApi.getCourses({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch,
        status: status === "all" ? undefined : status,
        language: language === "all" ? undefined : language,
        institutionId: institutionId === "all" ? undefined : institutionId,
      })
      if (request !== latest.current) return
      setCourses(data.items)
      setTotal(data.total)
      setSummary(data.summary)
    } catch (err) {
      if (request === latest.current) setLoadError(errorMessage(err, "Could not load the course catalog."))
    } finally {
      if (request === latest.current) setLoading(false)
    }
  }, [page, debouncedSearch, status, language, institutionId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    adminApi
      .getInstitutions()
      .then((list: InstitutionOption[]) => setInstitutions(list.filter((i) => i.is_active)))
      .catch(() => toast.error("Could not load institutions."))
  }, [])

  const filtersActive =
    Boolean(debouncedSearch.trim()) || status !== "all" || language !== "all" || institutionId !== "all"
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const resetFilters = () => {
    setSearch("")
    setStatus("all")
    setLanguage("all")
    setInstitutionId("all")
    setPage(1)
  }

  // ── actions ─────────────────────────────────────────────────────────────────
  const openEdit = async (course: AdminCourseListItem) => {
    setBusyId(course.id)
    try {
      const detail = (await adminApi.getCourse(course.id)) as CourseDetail
      setDialog({ mode: "edit", course: detail })
    } catch (err) {
      toast.error(errorMessage(err, "Could not load this course."))
    } finally {
      setBusyId(null)
    }
  }

  const submit = async (state: CourseDialogState, v: CourseFormValues, periodName: string) => {
    const common = {
      title: v.title.trim(),
      code: v.code,
      credit_hours: Number.parseInt(v.credits, 10),
      description: v.description.trim() || undefined,
      language: v.language,
      academic_period_id: v.periodId,
      academic_year: periodName,
      department_ids: v.departmentIds,
    }
    if (state.mode === "create") {
      await adminApi.createCourse({ ...common, institution_id: v.institutionId })
      toast.success(`${v.title.trim()} created`)
    } else {
      await adminApi.updateCourse(state.course.id, { ...common, description: v.description.trim() })
      toast.success("Course updated")
    }
    setDialog(null)
    await load()
  }

  const applyActive = async (course: AdminCourseListItem, active: boolean) => {
    setBusyId(course.id)
    try {
      await adminApi.updateCourse(course.id, { is_active: active })
      toast.success(`${course.code} ${active ? "reactivated" : "suspended"}`)
      await load()
    } catch (err) {
      toast.error(errorMessage(err, `Could not ${active ? "reactivate" : "suspend"} ${course.code}.`))
    } finally {
      setBusyId(null)
    }
  }

  const syncLanguage = async (course: AdminCourseListItem) => {
    setBusyId(course.id)
    try {
      const res = await adminApi.syncCourseWorkspaceLanguage(course.id)
      toast.success(
        `Language applied: ${res.updated_workspaces} class workspace${res.updated_workspaces === 1 ? "" : "s"} and ${res.updated_draft_assessments} draft assessment${res.updated_draft_assessments === 1 ? "" : "s"} updated.`,
      )
    } catch (err) {
      toast.error(errorMessage(err, "Could not apply the language to existing classes."))
    } finally {
      setBusyId(null)
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Courses</h1>
          <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
            The official catalog. Each course belongs to departments and has a language, which also decides whether AI
            tools are available for it.
          </p>
        </div>
        <Button className="self-start" onClick={() => setDialog({ mode: "create" })}>
          <Plus className="mr-1.5 size-4" />
          Create course
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
        <Kpi
          icon={BookOpen}
          label="Courses"
          value={courses ? summary.total : null}
          note={summary.suspended ? `${summary.suspended} suspended` : "all active"}
        />
        <Kpi icon={CheckCircle2} label="Active" value={courses ? summary.active : null} note="open for teaching" />
        <Kpi
          icon={UserX}
          label="Without a lecturer"
          value={courses ? summary.unassigned : null}
          note={summary.unassigned ? "needs an assignment" : "all assigned"}
          warn={summary.unassigned > 0}
        />
        <Kpi
          icon={Globe}
          label="AI switched off"
          value={courses ? summary.ai_restricted : null}
          note="Kinyarwanda courses"
        />
      </dl>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-col gap-3 border-b bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by code or title"
              aria-label="Search courses"
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
              className="flex items-center rounded-lg border bg-muted/60 p-0.5"
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
            <Select
              value={language}
              onValueChange={(v) => {
                setLanguage(v as LanguageFilter)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-8 w-36" aria-label="Filter by language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">All languages</SelectItem>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {institutions.length > 1 && (
              <Select
                value={institutionId}
                onValueChange={(v) => {
                  setInstitutionId(v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-8 w-48" aria-label="Filter by institution">
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

        <div className={cn("overflow-x-auto transition-opacity", loading && courses && "opacity-60")}>
          <Table>
            <TableHeader className="bg-muted/20">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-10 pl-4 text-xs font-semibold">Course</TableHead>
                <TableHead className="h-10 text-xs font-semibold">Department</TableHead>
                <TableHead className="h-10 text-xs font-semibold">Language</TableHead>
                <TableHead className="h-10 text-xs font-semibold">Lecturer</TableHead>
                <TableHead className="h-10 text-center text-xs font-semibold">Students</TableHead>
                <TableHead className="h-10 text-xs font-semibold">Status</TableHead>
                <TableHead className="h-10 pr-4 text-right text-xs font-semibold">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses === null ? (
                [1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7} className="px-4">
                      <Skeleton className="h-9 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : courses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-40 text-center">
                    {filtersActive ? (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">No course matches your filters.</p>
                        <Button variant="outline" onClick={resetFilters}>
                          Clear filters
                        </Button>
                      </div>
                    ) : (
                      <div className="mx-auto max-w-sm space-y-2">
                        <BookOpen className="mx-auto size-7 text-muted-foreground" />
                        <p className="text-sm font-medium">No courses yet</p>
                        <p className="text-xs text-muted-foreground">
                          Create the first course, then assign a lecturer to it.
                        </p>
                        <Button onClick={() => setDialog({ mode: "create" })}>
                          <Plus className="mr-1.5 size-4" />
                          Create course
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                courses.map((course) => {
                  const assigned = course.lecturer_name && course.lecturer_name !== "Not Assigned"
                  const suspended = course.status === "Suspended"
                  return (
                    <TableRow key={course.id} className={cn("h-16", suspended && "opacity-70")}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="shrink-0 font-mono text-xs font-semibold">
                            {course.code}
                          </Badge>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => void openEdit(course)}
                              className="block max-w-[18rem] truncate text-left text-sm font-semibold leading-tight hover:underline"
                            >
                              {course.title}
                            </button>
                            <p className="text-xs text-muted-foreground">
                              {[course.academic_year, course.credit_hours ? `${course.credit_hours} credits` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[14rem]">
                        {course.department_names && course.department_names.length > 0 ? (
                          <span className="block truncate text-sm" title={course.department_names.join(", ")}>
                            {course.department_names.join(", ")}
                          </span>
                        ) : (
                          <span className="text-sm text-amber-700 dark:text-amber-400">None set</span>
                        )}
                        {institutions.length > 1 && course.institution_name && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {course.institution_name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            course.language === "RW"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground",
                          )}
                          title={course.language === "RW" ? "AI tools are switched off for this course" : undefined}
                        >
                          {course.language ?? "EN"}
                          {course.language === "RW" && <span className="ml-1 font-normal">· no AI</span>}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {assigned ? (
                          <span className="text-sm">{course.lecturer_name}</span>
                        ) : (
                          <Link
                            href={`/admin/academic/assignments?new=1&course_id=${course.id}`}
                            className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
                          >
                            Assign a lecturer
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
                          <Users className="size-3" />
                          {course.student_count}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span
                            className={cn("size-2 rounded-full", suspended ? "bg-amber-500" : "bg-emerald-500")}
                            aria-hidden
                          />
                          {course.status}
                        </span>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${course.code}`}
                              disabled={busyId === course.id}
                            >
                              {busyId === course.id ? <Loader2 className="animate-spin" /> : <MoreVertical />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuItem onClick={() => void openEdit(course)}>
                              <FileEdit className="mr-2 size-3.5" /> Edit details
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/academic/assignments?new=1&course_id=${course.id}`}>
                                <Users className="mr-2 size-3.5" /> Assign a lecturer
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void syncLanguage(course)}>
                              <RefreshCw className="mr-2 size-3.5" /> Apply language to existing classes
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {suspended ? (
                              <DropdownMenuItem
                                className="text-emerald-700 focus:text-emerald-700 dark:text-emerald-400"
                                onClick={() => void applyActive(course, true)}
                              >
                                <CheckCircle2 className="mr-2 size-3.5" /> Reactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setConfirmToggle(course)}
                              >
                                <Ban className="mr-2 size-3.5" /> Suspend
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
            {total === 0
              ? "No courses"
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}${filtersActive ? " matching" : ""}`}
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

      <CourseDialog state={dialog} institutions={institutions} onClose={() => setDialog(null)} onSubmit={submit} />

      <AlertDialog open={confirmToggle !== null} onOpenChange={(open) => !open && setConfirmToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend {confirmToggle?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle?.title} will be marked as suspended in the catalog. Nothing is deleted, existing results
              stay intact, and you can reactivate it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep active</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const course = confirmToggle
                setConfirmToggle(null)
                if (course) void applyActive(course, false)
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
