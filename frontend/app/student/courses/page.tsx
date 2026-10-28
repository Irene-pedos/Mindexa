// app/student/courses/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  ChevronDown,
  GraduationCap,
  Search,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import {
  studentApi,
  type StudentCourseListItem,
  type StudentCourseStatus,
} from "@/lib/api/student";
import { errorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<StudentCourseStatus, { label: string; className: string }> = {
  ACTIVE: { label: "In progress", className: "text-emerald-700 bg-emerald-500/10 border-emerald-500/25 dark:text-emerald-400" },
  COMPLETED: { label: "Finished", className: "text-muted-foreground bg-muted border-border/60" },
  UPCOMING: { label: "Starts soon", className: "text-sky-700 bg-sky-500/10 border-sky-500/25 dark:text-sky-400" },
};

const NO_PERIOD = "No academic period";

type StatusFilter = "ALL" | StudentCourseStatus;

const statusOf = (course: StudentCourseListItem): StudentCourseStatus =>
  course.status in STATUS_STYLE ? (course.status as StudentCourseStatus) : "ACTIVE";

interface PeriodGroup {
  name: string;
  start: string | null;
  courses: StudentCourseListItem[];
}

/** Courses grouped by academic period, the newest period first and courses without one last. */
function groupByPeriod(courses: StudentCourseListItem[]): PeriodGroup[] {
  const map = new Map<string, PeriodGroup>();
  for (const course of courses) {
    const name = course.academic_year || NO_PERIOD;
    const group = map.get(name) ?? { name, start: course.period_start ?? null, courses: [] };
    group.courses.push(course);
    map.set(name, group);
  }
  return [...map.values()].sort((a, b) => {
    if (a.name === NO_PERIOD) return 1;
    if (b.name === NO_PERIOD) return -1;
    return (b.start ?? "").localeCompare(a.start ?? "") || a.name.localeCompare(b.name);
  });
}

export default function StudentCoursesPage() {
  const [courses, setCourses] = useState<StudentCourseListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  // Only groups the student opened or closed by hand; the rest follow the default (finished periods fold away).
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  // Bumped by "Try again" to run the load effect once more.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let live = true;
    studentApi
      .getWorkspaces()
      .then((list) => {
        if (!live) return;
        setCourses(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setError(errorMessage(err, "Unable to load your courses."));
        setCourses((current) => current ?? []);
      });
    return () => {
      live = false;
    };
  }, [reloadKey]);

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { ALL: 0, ACTIVE: 0, COMPLETED: 0, UPCOMING: 0 };
    for (const course of courses ?? []) {
      result.ALL += 1;
      result[statusOf(course)] += 1;
    }
    return result;
  }, [courses]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (courses ?? []).filter(
      (c) =>
        (statusFilter === "ALL" || statusOf(c) === statusFilter) &&
        (!q ||
          c.title?.toLowerCase().includes(q) ||
          c.code?.toLowerCase().includes(q) ||
          c.lecturer_name?.toLowerCase().includes(q)),
    );
  }, [courses, searchQuery, statusFilter]);

  const groups = useMemo(() => groupByPeriod(filtered), [filtered]);
  const periodCount = useMemo(() => groupByPeriod(courses ?? []).length, [courses]);
  const searching = Boolean(searchQuery.trim()) || statusFilter !== "ALL";

  const isOpen = (group: PeriodGroup): boolean => {
    if (searching) return true; // never hide a search hit inside a folded group
    const manual = toggled[group.name];
    if (manual !== undefined) return manual;
    return group.courses.some((c) => statusOf(c) !== "COMPLETED");
  };

  const loading = courses === null;

  return (
    <div className="w-full space-y-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="flex flex-col gap-3 border-b border-border/40 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <GraduationCap className="size-5 text-primary" />
            My Courses
          </h1>
          <p className="text-xs font-medium text-muted-foreground">
            {loading
              ? "Loading your courses…"
              : counts.ALL === 0
                ? "Courses appear here once your lecturer sets them up."
                : `${counts.ALL} course${counts.ALL === 1 ? "" : "s"} across ${periodCount} academic period${periodCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by course, code or lecturer"
            aria-label="Search your courses"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 border-border/60 bg-background pl-8 text-xs"
          />
        </div>
      </div>

      {counts.COMPLETED + counts.UPCOMING > 0 && (
        <div
          role="group"
          aria-label="Filter by status"
          className="flex w-fit max-w-full items-center overflow-x-auto rounded-lg border bg-muted/60 p-0.5"
        >
          {(["ALL", "ACTIVE", "UPCOMING", "COMPLETED"] as const)
            .filter((s) => s === "ALL" || counts[s] > 0)
            .map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={statusFilter === s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200",
                  statusFilter === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "ALL" ? "All" : STATUS_STYLE[s].label}
                <span className="text-[10px] tabular-nums opacity-70">{counts[s]}</span>
              </button>
            ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-60 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border-2 border-dashed border-destructive/30 bg-destructive/5 py-14 text-center">
          <BookOpen className="mx-auto mb-3 size-9 text-destructive/50" />
          <p className="text-xs font-medium text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3 text-xs" onClick={reload}>
            Try again
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mx-auto max-w-md rounded-xl border-2 border-dashed border-border/50 bg-muted/10 px-6 py-14 text-center">
          <BookOpen className="mx-auto mb-3 size-9 text-muted-foreground/40" />
          {searching ? (
            <>
              <p className="text-sm font-semibold text-foreground">No course matches</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 text-xs"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("ALL");
                }}
              >
                Clear search
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">You are not in any course yet</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                A course shows up once your lecturer sets it up for your class. If you expected one, check that your
                class is correct in your profile.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3 text-xs">
                <Link href="/student/profile">Open my profile</Link>
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const open = isOpen(group);
            return (
              <section key={group.name} className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setToggled((prev) => ({ ...prev, [group.name]: !open }))}
                  className="flex w-full items-center justify-between gap-2 border-b border-border/40 bg-muted/20 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Calendar className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-xs font-semibold text-foreground">{group.name}</span>
                    <Badge variant="secondary" className="h-4 shrink-0 bg-muted/60 px-1.5 text-[10px] font-semibold">
                      {group.courses.length} {group.courses.length === 1 ? "course" : "courses"}
                    </Badge>
                  </span>
                  <ChevronDown
                    className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
                  />
                </button>

                {open && (
                  <div className="grid grid-cols-1 gap-3 p-3.5 sm:grid-cols-2 xl:grid-cols-3">
                    {group.courses.map((course, index) => (
                      <CourseCard key={course.id} course={course} index={index} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, index }: { course: StudentCourseListItem; index: number }) {
  const status = STATUS_STYLE[statusOf(course)];
  return (
    <Link
      href={`/student/courses/${course.id}`}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:fill-mode-backwards"
    >
      {course.banner_image_url ? (
        <div className="relative h-24 w-full shrink-0 overflow-hidden border-b border-border/40">
          <div
            className="size-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
            style={{ backgroundImage: `url(${JSON.stringify(course.banner_image_url)})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        </div>
      ) : (
        <div className="flex h-24 w-full shrink-0 items-center justify-center border-b border-border/40 bg-gradient-to-br from-primary/10 via-muted/30 to-muted/60">
          <BookOpen className="size-8 text-primary/30" />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <Badge variant="outline" className="h-4 border-border/60 bg-muted/40 px-1.5 font-mono text-[10px]">
              {course.code}
            </Badge>
            <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
              {course.title}
            </h2>
          </div>
          <Badge variant="outline" className={cn("h-5 shrink-0 px-1.5 text-[10px] font-medium", status.className)}>
            {status.label}
          </Badge>
        </div>

        <div className="space-y-1 text-[11px] font-medium text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <GraduationCap className="size-3.5 shrink-0" />
            <span className="truncate">{course.lecturer_name}</span>
          </p>
          {course.class_name && (
            <p className="flex items-center gap-1.5">
              <Users className="size-3.5 shrink-0" />
              <span className="truncate">{course.class_name}</span>
            </p>
          )}
        </div>

        <div className="mt-auto space-y-1 pt-1">
          <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
            <span>Assessments completed</span>
            <span className="font-semibold tabular-nums text-foreground">{course.progress}%</span>
          </div>
          <Progress value={course.progress} className="h-1.5" />
        </div>

        <span className="flex items-center justify-end gap-1 text-xs font-semibold text-primary">
          Open course
          <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
