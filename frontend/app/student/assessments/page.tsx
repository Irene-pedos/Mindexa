// app/student/assessments/page.tsx
"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Lock,
  SearchIcon,
  ShieldAlert,
  TimerOff,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssessmentStartDialog } from "@/components/mindexa/student/assessment-start-dialog";
import { assessmentApi, type StudentAssessment } from "@/lib/api/assessment";
import { notificationApi } from "@/lib/api/notification";
import { errorMessage } from "@/lib/error-message";
import { getAssessmentCategory, getAssessmentProgressStatus, type AssessmentCategory } from "@/lib/grading-architecture";
import { blockedMessage, sortForTab, tabOf, type AssessmentTab } from "@/lib/student-assessments";
import { cn, formatAssessmentType } from "@/lib/utils";

const PAGE_SIZE = 8;

const TAB_META: Record<AssessmentTab, { label: string; icon: typeof Zap; empty: string }> = {
  active: { label: "Active", icon: Zap, empty: "Nothing to do right now. You are all caught up." },
  upcoming: { label: "Upcoming", icon: Calendar, empty: "No assessments are scheduled yet. Check back later." },
  submitted: { label: "Submitted", icon: CheckCircle2, empty: "You have not submitted any assessment yet." },
  missed: { label: "Missed", icon: TimerOff, empty: "You have not missed any assessment." },
  violations: { label: "Violations", icon: XCircle, empty: "No integrity violations recorded." },
};

const TYPE_FILTERS = [
  { value: "all", label: "All types" },
  { value: "CAT", label: "CAT" },
  { value: "FORMATIVE", label: "Formative / practice" },
  { value: "SUMMATIVE", label: "Summative" },
  { value: "HOMEWORK", label: "Homework" },
  { value: "GROUP_WORK", label: "Group work" },
  { value: "REASSESSMENT", label: "Reassessment" },
];

interface Row {
  assessment: StudentAssessment;
  category: AssessmentCategory;
  tab: AssessmentTab;
}

export default function StudentAssessmentsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <AssessmentsView />
    </Suspense>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-72 rounded-lg" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-32 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** A live "12m 05s" label that ticks once a second; the clock is read in the interval only. */
function CountdownBadge({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = new Date(expiresAt).getTime() - now;
  if (diff <= 0) {
    return (
      <Badge variant="destructive" className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
        Time is up
      </Badge>
    );
  }
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const secs = Math.floor((diff % 60_000) / 1000);
  return (
    <Badge
      variant="outline"
      className="flex items-center gap-1 border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-600"
    >
      <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
      {hours > 0 ? `${hours}h ` : ""}
      {mins}m {String(secs).padStart(2, "0")}s
    </Badge>
  );
}

function AssessmentsView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [assessments, setAssessments] = useState<StudentAssessment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());

  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [courseFilter, setCourseFilter] = useState(() => searchParams.get("course") ?? "all");
  const [tab, setTab] = useState<AssessmentTab | null>(null);
  const [visitedTabs, setVisitedTabs] = useState<AssessmentTab[]>([]);
  const [page, setPage] = useState(1);
  const [starting, setStarting] = useState<StudentAssessment | null>(null);

  // Bumped by "Try again" to run the load effect once more.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let live = true;
    Promise.all([
      assessmentApi.getAllStudentAssessments(),
      notificationApi.getNotifications(true).catch(() => null),
    ])
      .then(([list, notifications]) => {
        if (!live) return;
        setAssessments(list);
        setError(null);
        setUnreadIds(new Set((notifications?.items ?? []).map((n) => n.related_id).filter((id): id is string => Boolean(id))));
      })
      .catch((err: unknown) => {
        if (!live) return;
        setError(errorMessage(err, "Could not load your assessments."));
        setAssessments((current) => current ?? []);
      });
    return () => {
      live = false;
    };
  }, [reloadKey]);

  const courses = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assessments ?? []) {
      if (a.teaching_workspace_id && !map.has(a.teaching_workspace_id)) {
        map.set(a.teaching_workspace_id, [a.course_code, a.course_name].filter(Boolean).join(" · ") || "Course");
      }
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [assessments]);

  // A course link from the course page can name a course the student no longer has: treat it as "all".
  const activeCourse = courses.some((c) => c.id === courseFilter) ? courseFilter : "all";

  const rows = useMemo<Row[]>(
    () =>
      (assessments ?? []).map((assessment) => {
        const category = getAssessmentCategory(assessment);
        return { assessment, category, tab: tabOf(category) };
      }),
    [assessments],
  );

  const inScope = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return rows.filter(
      ({ assessment: a }) =>
        (activeCourse === "all" || a.teaching_workspace_id === activeCourse) &&
        (filterType === "all" || a.assessment_type?.toUpperCase() === filterType) &&
        (!q ||
          a.title.toLowerCase().includes(q) ||
          a.course_code?.toLowerCase().includes(q) ||
          a.course_name?.toLowerCase().includes(q)),
    );
  }, [rows, activeCourse, filterType, searchTerm]);

  const counts = useMemo(() => {
    const result: Record<AssessmentTab, number> = { active: 0, upcoming: 0, submitted: 0, missed: 0, violations: 0 };
    for (const row of inScope) result[row.tab] += 1;
    return result;
  }, [inScope]);

  const hasUnread = useCallback(
    (t: AssessmentTab) =>
      !visitedTabs.includes(t) &&
      inScope.some(
        ({ assessment: a, tab: rowTab }) =>
          rowTab === t && (unreadIds.has(a.id) || (a.student_attempt_id ? unreadIds.has(a.student_attempt_id) : false)),
      ),
    [inScope, unreadIds, visitedTabs],
  );

  // Open on the first tab that has something; the student's own choice wins afterwards.
  const currentTab: AssessmentTab =
    tab ?? (counts.active > 0 ? "active" : counts.upcoming > 0 ? "upcoming" : counts.submitted > 0 ? "submitted" : "active");

  const shown = useMemo(
    () =>
      sortForTab(
        currentTab,
        inScope.filter((r) => r.tab === currentTab).map((r) => r.assessment),
      ),
    [inScope, currentTab],
  );
  const categoryById = useMemo(() => new Map(rows.map((r) => [r.assessment.id, r.category])), [rows]);

  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = shown.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const filtersActive = Boolean(searchTerm.trim()) || filterType !== "all" || activeCourse !== "all";
  const loading = assessments === null;

  const startAssessment = (a: StudentAssessment) => {
    setStarting(null);
    router.push(`/student/assessments/${a.id}/take`);
  };

  const openAssessment = (a: StudentAssessment) => {
    if (a.assessment_type?.toUpperCase() === "GROUP_WORK") router.push(`/student/group-work/${a.id}`);
    else setStarting(a);
  };

  return (
    <div data-tour="student-assessments" className="mx-auto w-full space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="flex flex-col gap-3 border-b border-border/25 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-0.5 lg:max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">My Assessments</h1>
          <p className="text-xs font-medium text-muted-foreground">
            Tests, homework and practice for your courses: what to do now, what is coming and what you have finished.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap">
          <div className="relative w-full sm:w-56">
            <SearchIcon className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              placeholder="Search assessments"
              aria-label="Search assessments"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="h-8.5 rounded-lg border-border/60 bg-background/50 pl-9 text-xs"
            />
          </div>
          {courses.length > 1 && (
            <Select
              value={activeCourse}
              onValueChange={(v) => {
                if (!v) return;
                setCourseFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filter by course" className="h-8.5 w-full rounded-lg border-border/60 bg-background/50 text-xs sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all" className="text-xs">All courses</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select
            value={filterType}
            onValueChange={(v) => {
              if (!v) return;
              setFilterType(v);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Filter by type" className="h-8.5 w-full rounded-lg border-border/60 bg-background/50 text-xs sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {TYPE_FILTERS.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs
        value={currentTab}
        onValueChange={(v) => {
          const next = v as AssessmentTab;
          setTab(next);
          setPage(1);
          setVisitedTabs((prev) => (prev.includes(next) ? prev : [...prev, next]));
        }}
        className="w-full"
      >
        <TabsList className="h-auto w-full flex-wrap justify-start p-1 sm:w-fit">
          {(Object.keys(TAB_META) as AssessmentTab[]).map((t) => {
            const Icon = TAB_META[t].icon;
            return (
              <TabsTrigger
                key={t}
                value={t}
                className={cn("relative gap-1.5", t === "violations" && "data-[state=active]:bg-destructive")}
              >
                <Icon className="size-3.5" />
                {TAB_META[t].label}
                <span className="text-[10px] font-normal tabular-nums opacity-70">{counts[t]}</span>
                {hasUnread(t) && (
                  <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-red-400 motion-safe:animate-pulse" aria-label="New" />
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="space-y-3">
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <div role="alert" className="rounded-xl border-2 border-dashed border-destructive/30 bg-destructive/5 py-12 text-center">
            <p className="text-xs font-medium text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border/30 bg-muted/5 py-14 text-center">
            <p className="text-xs font-semibold text-muted-foreground">
              {filtersActive ? "No assessment matches your filters in this tab." : TAB_META[currentTab].empty}
            </p>
            {filtersActive && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs"
                onClick={() => {
                  setSearchTerm("");
                  setFilterType("all");
                  setCourseFilter("all");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          visible.map((assessment, index) => (
            <AssessmentCard
              key={assessment.id}
              assessment={assessment}
              category={categoryById.get(assessment.id) ?? "ACTIVE"}
              index={index}
              onOpen={openAssessment}
            />
          ))
        )}
      </div>

      {shown.length > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-border/20 pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, shown.length)} of {shown.length}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              <ChevronLeft />
            </Button>
            <span className="px-1 text-xs tabular-nums text-muted-foreground">
              {safePage} / {totalPages}
            </span>
            <Button variant="outline" size="icon" aria-label="Next page" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-xl border border-warning/15 bg-warning/5 p-3.5">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-warning">Supervised assessments are monitored</p>
          <p className="max-w-4xl text-[11px] font-medium leading-relaxed text-muted-foreground">
            Where an assessment is monitored, switching tabs or applications is recorded as a violation and repeated
            violations submit your work automatically. The rules for each assessment are shown before you start.
          </p>
        </div>
      </div>

      <AssessmentStartDialog
        assessment={starting}
        resuming={starting?.student_status === "IN_PROGRESS"}
        onClose={() => setStarting(null)}
        onStart={startAssessment}
      />
    </div>
  );
}

interface StatusInfo {
  label: string;
  className: string;
  icon: React.ReactNode;
  available: boolean;
}

function statusInfo(a: StudentAssessment, category: AssessmentCategory): StatusInfo {
  if (category === "VIOLATION") {
    return {
      label: "Ended by violation",
      className: "border-destructive/20 bg-destructive/10 text-destructive",
      icon: <ShieldAlert className="size-3 shrink-0" />,
      available: false,
    };
  }
  if (category === "SUBMITTED" || category === "GRADED") {
    const progress = getAssessmentProgressStatus(a);
    return {
      label: progress.label,
      className:
        progress.tone === "success"
          ? "border-success/20 bg-success/10 text-success"
          : progress.tone === "warning"
            ? "border-warning/15 bg-warning/10 text-warning"
            : "border-primary/20 bg-primary/10 text-primary",
      icon: progress.tone === "success" ? <CheckCircle2 className="size-3 shrink-0" /> : <Clock className="size-3 shrink-0" />,
      available: false,
    };
  }
  if (category === "MISSED") {
    return {
      label: "Missed",
      className: "border-muted-foreground/35 bg-muted text-muted-foreground",
      icon: <TimerOff className="size-3 shrink-0" />,
      available: false,
    };
  }
  if (category === "UPCOMING") {
    return {
      label: a.window_start ? `Opens ${format(new Date(a.window_start), "MMM d, HH:mm")}` : "Not open yet",
      className: "border-transparent bg-secondary text-secondary-foreground",
      icon: <Calendar className="size-3 shrink-0" />,
      available: false,
    };
  }
  if (a.blocked_reason) {
    return {
      label: "Not eligible",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      icon: <Lock className="size-3 shrink-0" />,
      available: false,
    };
  }
  return category === "IN_PROGRESS"
    ? {
        label: "In progress",
        className: "border-primary bg-primary text-primary-foreground",
        icon: <span className="size-1.5 shrink-0 rounded-full bg-primary-foreground motion-safe:animate-pulse" />,
        available: true,
      }
    : {
        label: "Open now",
        className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        icon: <span className="size-1.5 shrink-0 rounded-full bg-emerald-500 motion-safe:animate-pulse" />,
        available: true,
      };
}

function windowText(a: StudentAssessment, category: AssessmentCategory): string {
  const fmt = (iso: string) => format(new Date(iso), "MMM d, HH:mm");
  if (category === "UPCOMING" && a.window_start) return `Opens ${fmt(a.window_start)}`;
  if ((category === "ACTIVE" || category === "IN_PROGRESS") && a.window_end) return `Closes ${fmt(a.window_end)}`;
  if (a.window_start && a.window_end) return `${fmt(a.window_start)} → ${fmt(a.window_end)}`;
  if (a.window_end) return `Closed ${fmt(a.window_end)}`;
  return "No fixed window";
}

function AssessmentCard({
  assessment,
  category,
  index,
  onOpen,
}: {
  assessment: StudentAssessment;
  category: AssessmentCategory;
  index: number;
  onOpen: (a: StudentAssessment) => void;
}) {
  const status = statusInfo(assessment, category);
  const finished = category === "SUBMITTED" || category === "GRADED" || category === "VIOLATION";
  const left = Math.max(0, assessment.max_attempts - assessment.attempts_used);
  const typeLabel = formatAssessmentType(assessment.assessment_type, {
    integrity_monitoring_enabled: assessment.integrity_monitoring_enabled,
    is_supervised: assessment.is_supervised,
    allow_resume: assessment.allow_resume,
  });

  return (
    <Card
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className={cn(
        "overflow-hidden rounded-xl border border-border/45 bg-card/30 shadow-sm transition-all duration-200 hover:border-primary/25 hover:bg-card/50 hover:shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:fill-mode-backwards",
        category === "VIOLATION" && "border-destructive/30 bg-destructive/5 hover:border-destructive/50",
      )}
    >
      <div className="flex flex-col md:flex-row">
        <div className="min-w-0 flex-1 space-y-3 px-4 py-3.5 sm:px-5">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold leading-snug tracking-tight text-foreground">{assessment.title}</h3>
                {category === "IN_PROGRESS" && assessment.student_attempt_expires_at && (
                  <CountdownBadge expiresAt={assessment.student_attempt_expires_at} />
                )}
                {assessment.is_supervised && (
                  <Badge variant="outline" className="h-4.5 gap-1 border-primary/20 bg-primary/5 px-1.5 text-[9px] font-bold uppercase text-primary">
                    <Lock className="size-2.5" /> Supervised
                  </Badge>
                )}
                {assessment.is_password_protected && (
                  <Badge variant="outline" className="h-4.5 gap-1 border-warning/15 bg-warning/5 px-1.5 text-[9px] font-semibold text-warning">
                    <Lock className="size-2.5" /> Password
                  </Badge>
                )}
                {assessment.is_group_assessment && (
                  <Badge variant="outline" className="h-4.5 gap-1 px-1.5 text-[9px] font-semibold">
                    <Users className="size-2.5" /> Group
                  </Badge>
                )}
              </div>
              <p className="flex flex-wrap items-center gap-x-2 text-xs font-medium text-muted-foreground">
                <BookOpen className="size-3.5 opacity-70" />
                <span>{[assessment.course_code, assessment.course_name ?? assessment.subject].filter(Boolean).join(" · ") || "Course not set"}</span>
                <span className="text-muted-foreground/30">•</span>
                <span>{typeLabel}</span>
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn("inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-none", status.className)}
            >
              {status.icon}
              {status.label}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs font-medium text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <span className="flex items-center gap-2">
              <Calendar className="size-3.5 shrink-0 opacity-60" />
              {windowText(assessment, category)}
            </span>
            <span className="flex items-center gap-2">
              <Clock className="size-3.5 shrink-0 opacity-60" />
              {assessment.duration_minutes ? `${assessment.duration_minutes} min` : "No time limit"}
            </span>
            <span className="flex items-center gap-2">
              <History className="size-3.5 shrink-0 opacity-60" />
              {assessment.attempts_used} of {assessment.max_attempts} attempt{assessment.max_attempts === 1 ? "" : "s"} used
              {!finished && left > 0 ? ` (${left} left)` : ""}
            </span>
            <span className="flex items-center gap-2">
              <BookOpen className="size-3.5 shrink-0 opacity-60" />
              {assessment.is_open_book ? "Open book" : "Closed book"} · {assessment.ai_assistance_allowed ? "AI allowed" : "No AI"}
            </span>
          </div>

          {assessment.blocked_reason && !finished && (
            <p className="flex items-start gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              <Lock className="mt-0.5 size-3 shrink-0" />
              {blockedMessage(assessment.blocked_reason)}
            </p>
          )}
          {!finished && category !== "MISSED" && (
            <p className="text-[11px] font-medium text-muted-foreground/80">
              {assessment.late_submission_allowed ? "Late submissions are accepted." : "Submissions after the window closes are not accepted."}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3.5 border-t border-border/40 bg-muted/20 p-4 md:min-w-[10rem] md:flex-col md:justify-center md:border-l md:border-t-0">
          <div className="text-center">
            <div className="text-sm font-semibold tabular-nums text-foreground">{assessment.total_marks} marks</div>
            <div className="text-[11px] font-medium text-muted-foreground/75">Total</div>
          </div>

          {finished ? (
            assessment.student_attempt_id ? (
              <Button variant="outline" size="sm" asChild className="h-8 w-full max-w-40 rounded-lg border-border/60 px-4 text-xs font-semibold md:max-w-none">
                <Link href={`/student/results/${assessment.student_attempt_id}`} className="flex items-center justify-center gap-1">
                  {category === "VIOLATION" ? "See what happened" : "View result"} <ArrowRight className="size-3" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled className="h-8 w-full max-w-40 rounded-lg px-4 text-xs font-semibold md:max-w-none">
                Result pending
              </Button>
            )
          ) : (
            <Button
              size="sm"
              disabled={!status.available}
              variant={status.available ? "default" : "secondary"}
              onClick={() => onOpen(assessment)}
              className="h-8 w-full max-w-40 rounded-lg px-4 text-xs font-semibold shadow-none transition-all md:max-w-none"
            >
              {status.available ? (category === "IN_PROGRESS" ? "Resume" : "Start") : category === "UPCOMING" ? "Not open yet" : assessment.blocked_reason ? "Not eligible" : "Closed"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
