// app/lecturer/courses/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  FilePlus2,
  FolderOpen,
  GraduationCap,
  Plus,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lecturerApi, WorkspaceListItem } from "@/lib/api/lecturer";

type StatusFilter = "ALL" | "ACTIVE" | "ARCHIVED";

export default function LecturerCoursesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await lecturerApi.getWorkspaces(1, 100);
      setWorkspaces(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load your courses.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Overall metrics
  const stats = useMemo(() => {
    const active = workspaces.filter(
      (w) => (w.status ?? "ACTIVE").toUpperCase() === "ACTIVE",
    );
    const totalStudents = workspaces.reduce(
      (acc, w) => acc + (w.student_count || 0),
      0,
    );
    const scoredCourses = workspaces.filter((w) => w.performance_avg > 0);
    const avgScore =
      scoredCourses.length > 0
        ? scoredCourses.reduce((acc, w) => acc + w.performance_avg, 0) /
          scoredCourses.length
        : 0;

    return {
      totalCourses: workspaces.length,
      activeCourses: active.length,
      archivedCourses: workspaces.length - active.length,
      totalStudents,
      avgScore: avgScore.toFixed(1),
    };
  }, [workspaces]);

  // Filtered & grouped courses
  const filteredWorkspaces = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workspaces.filter((w) => {
      const status = (w.status ?? "ACTIVE").toUpperCase();
      if (statusFilter === "ACTIVE" && status !== "ACTIVE") return false;
      if (statusFilter === "ARCHIVED" && status !== "ARCHIVED") return false;
      if (!q) return true;
      return [w.title, w.code, w.class_name, w.academic_year, w.institution_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [workspaces, search, statusFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, WorkspaceListItem[]>();
    for (const w of filteredWorkspaces) {
      const key = w.academic_year || "Current Academic Session";
      map.set(key, [...(map.get(key) ?? []), w]);
    }
    return [...map.entries()];
  }, [filteredWorkspaces]);

  return (
    <div className="w-full max-w-full min-w-0 space-y-5 transition-all duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
              My Courses
            </h1>
            <Badge
              variant="outline"
              className="text-xs font-semibold px-2 py-0.5 rounded-full border-border/70 bg-card text-muted-foreground"
            >
              {workspaces.length}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            Manage your teaching workspaces, cohorts, handouts, and student assessments.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing}
            className="h-8.5 px-3 rounded-lg text-xs font-medium border-border/70 bg-card hover:bg-muted/50 text-foreground"
          >
            <RefreshCw
              className={`mr-1.5 size-3.5 ${refreshing ? "animate-spin text-primary" : "text-muted-foreground"}`}
            />
            Refresh
          </Button>
          <Button
            asChild
            size="sm"
            className="h-8.5 px-3.5 rounded-lg text-xs font-semibold shadow-xs text-primary-foreground bg-primary hover:bg-primary/90"
          >
            <Link href="/lecturer/courses/new">
              <Plus className="mr-1.5 size-3.5" />
              Set Up Course
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Overview Metrics (Clean & Compact) */}
      {!loading && workspaces.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full min-w-0">
          <div className="p-3.5 rounded-xl border border-border/60 bg-card shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Active Courses</span>
              <BookOpen className="size-4 text-primary" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
              {stats.activeCourses}
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-border/60 bg-card shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Enrolled Students</span>
              <Users className="size-4 text-primary" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
              {stats.totalStudents}
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl border border-border/60 bg-card shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Class Average</span>
              <TrendingUp className="size-4 text-primary" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
              {Number(stats.avgScore) > 0 ? `${stats.avgScore}%` : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      {workspaces.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full min-w-0">
          <Tabs
            value={statusFilter}
            onValueChange={(val) => setStatusFilter(val as StatusFilter)}
            className="w-auto"
          >
            <TabsList className="h-8.5 p-0.5 bg-muted/60 border border-border/50 rounded-lg">
              <TabsTrigger value="ALL" className="text-xs font-medium px-3 h-7.5 rounded-md">
                All ({workspaces.length})
              </TabsTrigger>
              <TabsTrigger value="ACTIVE" className="text-xs font-medium px-3 h-7.5 rounded-md">
                Active ({stats.activeCourses})
              </TabsTrigger>
              {stats.archivedCourses > 0 && (
                <TabsTrigger value="ARCHIVED" className="text-xs font-medium px-3 h-7.5 rounded-md">
                  Archived ({stats.archivedCourses})
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by title, code or class..."
              className="pl-8 h-8.5 text-xs rounded-lg border-border/70 bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/20"
            />
          </div>
        </div>
      )}

      {/* Content Feed */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 w-full min-w-0">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl border border-border/40" />
          ))}
        </div>
      ) : error ? (
        <Card className="border-destructive/30 bg-destructive/5 rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <p className="text-xs sm:text-sm text-foreground font-medium">{error}</p>
            <Button size="sm" variant="outline" onClick={() => load()} className="text-xs h-8 rounded-lg">
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card className="rounded-2xl border border-border/60 bg-card shadow-2xs">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="size-12 rounded-2xl bg-muted/40 border border-border/60 flex items-center justify-center text-muted-foreground">
              <FolderOpen className="size-6" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-sm font-semibold text-foreground">
                {workspaces.length === 0 ? "No courses set up yet" : "No matching courses found"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {workspaces.length === 0
                  ? "Start by setting up a course from the teaching assignments allocated to you by your department."
                  : "Try clearing your search keyword or switching the status filter."}
              </p>
            </div>
            {workspaces.length === 0 && (
              <Button asChild size="sm" className="h-8 text-xs font-semibold rounded-lg mt-1">
                <Link href="/lecturer/assignments">View Teaching Assignments</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 w-full min-w-0">
          {groups.map(([period, items]) => (
            <section key={period} className="space-y-3 w-full min-w-0">
              <div className="flex items-center gap-2 border-b border-border/30 pb-1.5">
                <GraduationCap className="size-3.5 text-primary" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {period}
                </h2>
                <span className="text-[11px] text-muted-foreground/75 font-normal">
                  ({items.length} {items.length === 1 ? "course" : "courses"})
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 w-full min-w-0">
                {items.map((w) => (
                  <CourseCard key={w.id} workspace={w} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({ workspace: w }: { workspace: WorkspaceListItem }) {
  const active = (w.status ?? "ACTIVE").toUpperCase() === "ACTIVE";

  return (
    <Card className="rounded-xl border border-border/70 bg-card hover:border-primary/40 hover:shadow-xs transition-all flex flex-col justify-between overflow-hidden group min-w-0">
      <CardContent className="p-4 flex flex-col h-full gap-3">
        {/* Top Header: Code & Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <span className="font-mono text-[11px] font-semibold text-primary block truncate">
              {w.code}
              {w.class_name && w.class_name !== "GLOBAL" ? ` · ${w.class_name}` : ""}
            </span>
            <h3
              className="text-sm font-bold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors"
              title={w.title}
            >
              {w.title}
            </h3>
          </div>
          {!active && (
            <Badge
              variant="outline"
              className="text-[9px] uppercase font-semibold text-muted-foreground border-border/60 shrink-0"
            >
              {w.status.toLowerCase()}
            </Badge>
          )}
        </div>

        {/* Course Attributes */}
        <div className="pt-2 border-t border-border/40 grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-auto">
          <div className="flex items-center gap-1.5 truncate">
            <Users className="size-3 text-muted-foreground shrink-0" />
            <span className="truncate">
              {w.student_count} student{w.student_count === 1 ? "" : "s"}
            </span>
          </div>

          <div className="flex items-center justify-end gap-1 font-medium">
            <span className="text-[11px] text-muted-foreground font-normal">Average:</span>
            <span className="font-semibold text-foreground tabular-nums">
              {w.performance_avg > 0 ? `${w.performance_avg.toFixed(0)}%` : "—"}
            </span>
          </div>
        </div>

        {/* Action Row */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/40">
          <Button
            asChild
            size="sm"
            className="flex-1 h-8 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all shadow-none"
          >
            <Link href={`/lecturer/courses/${w.id}`}>
              Enter Course
              <ArrowRight className="ml-1 size-3" />
            </Link>
          </Button>

          <Button
            asChild
            size="sm"
            variant="outline"
            className="size-8 p-0 shrink-0 rounded-lg border-border/70 text-muted-foreground hover:text-foreground"
            title="Create an assessment for this course"
          >
            <Link href={`/lecturer/assessments/new?workspace=${w.id}`}>
              <FilePlus2 className="size-3.5" />
              <span className="sr-only">New assessment</span>
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
