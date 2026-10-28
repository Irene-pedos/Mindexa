// app/lecturer/assignments/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BookCheck,
  Building2,
  CheckCircle2,
  Clock,
  FolderOpen,
  GraduationCap,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { academicApi, TeachingAssignment } from "@/lib/api/academic";
import { notificationApi } from "@/lib/api/notification";

type Filter = "all" | "setup" | "ready";

const ROLE_LABELS: Record<string, string> = {
  MAIN_LECTURER: "Main Lecturer",
  ASSISTANT_LECTURER: "Assistant Lecturer",
  CO_LECTURER: "Co-Lecturer",
  SUPERVISOR: "Supervisor",
  REVIEWER: "Reviewer",
  GUEST_LECTURER: "Guest Lecturer",
};

function placement(a: TeachingAssignment): string {
  return [
    a.department_name,
    a.option_name,
    a.class_group_name,
    a.class_section_name,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function LecturerAssignmentsPage() {
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await academicApi.getMyAssignments();
      setAssignments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load teaching assignments.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    notificationApi
      .getNotifications(true)
      .then((res) =>
        Promise.all(
          (res?.items ?? [])
            .filter((n) => n.notification_type === "TEACHING_ASSIGNMENT_CREATED")
            .map((n) => notificationApi.markAsRead(n.id)),
        ),
      )
      .catch(() => undefined);
  }, [load]);

  const counts = useMemo(
    () => ({
      all: assignments.length,
      setup: assignments.filter((a) => !a.workspace_id).length,
      ready: assignments.filter((a) => a.workspace_id).length,
    }),
    [assignments],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assignments.filter((a) => {
      if (filter === "setup" && a.workspace_id) return false;
      if (filter === "ready" && !a.workspace_id) return false;
      if (!q) return true;
      return [
        a.course_name,
        a.course_code,
        a.institution_name,
        a.department_name,
        a.option_name,
        placement(a),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [assignments, filter, search]);

  const groups = useMemo(() => {
    const map = new Map<string, TeachingAssignment[]>();
    for (const a of visible) {
      const key = a.academic_period_name || a.academic_year || "Current Academic Session";
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()];
  }, [visible]);

  return (
    <div className="w-full max-w-full min-w-0 space-y-5 transition-all duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
              Teaching Assignments
            </h1>
            <Badge
              variant="outline"
              className="text-xs font-semibold px-2 py-0.5 rounded-full border-border/70 bg-card text-muted-foreground"
            >
              {assignments.length}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            Courses allocated to you by your institution. Set up a course workspace to manage handouts and quizzes.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => load(true)}
          disabled={refreshing}
          className="h-8.5 px-3 rounded-lg text-xs font-medium border-border/70 bg-card hover:bg-muted/50 text-foreground shrink-0 self-start sm:self-auto"
        >
          <RefreshCw
            className={`mr-1.5 size-3.5 ${refreshing ? "animate-spin text-primary" : "text-muted-foreground"}`}
          />
          Refresh
        </Button>
      </div>

      {/* KPI Overview Metrics */}
      {!loading && assignments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full min-w-0">
          <div className="p-3.5 rounded-xl border border-border/60 bg-card shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Total Allocated</span>
              <GraduationCap className="size-4 text-primary" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
              {counts.all}
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-border/60 bg-card shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Active Workspaces</span>
              <BookCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
              {counts.ready}
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl border border-border/60 bg-card shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Pending Setup</span>
              <Clock className="size-4 text-amber-500" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
              {counts.setup}
            </p>
          </div>
        </div>
      )}

      {/* Tabs Filter & Search Bar */}
      {assignments.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full min-w-0">
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
            className="w-auto"
          >
            <TabsList className="h-8.5 p-0.5 bg-muted/60 border border-border/50 rounded-lg">
              <TabsTrigger value="all" className="text-xs font-medium px-3 h-7.5 rounded-md">
                All ({counts.all})
              </TabsTrigger>
              <TabsTrigger value="setup" className="text-xs font-medium px-3 h-7.5 rounded-md">
                To Set Up ({counts.setup})
              </TabsTrigger>
              <TabsTrigger value="ready" className="text-xs font-medium px-3 h-7.5 rounded-md">
                Ready ({counts.ready})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search course, code, or program..."
              className="pl-8 h-8.5 text-xs rounded-lg border-border/70 bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/20"
            />
          </div>
        </div>
      )}

      {/* Feed Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 w-full min-w-0">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl border border-border/40" />
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
                {assignments.length === 0
                  ? "No teaching assignments allocated"
                  : "No assignments match your search"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {assignments.length === 0
                  ? "Your academic dean or institution administrator allocates courses to you. Once assigned, they will show up here."
                  : "Try clearing your search term or selecting another filter tab."}
              </p>
            </div>
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

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 w-full min-w-0">
                {items.map((a) => (
                  <AssignmentCard key={a.id} assignment={a} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({ assignment: a }: { assignment: TeachingAssignment }) {
  const ready = Boolean(a.workspace_id);
  const location = placement(a);

  return (
    <Card className="rounded-xl border border-border/70 bg-card hover:border-primary/40 hover:shadow-xs transition-all flex flex-col justify-between overflow-hidden min-w-0 group">
      <CardContent className="p-4 flex flex-col h-full gap-3">
        {/* Header: Course Code & Ready Tag */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <span className="font-mono text-[11px] font-semibold text-primary block truncate">
              {a.course_code ?? "Module Allocation"}
            </span>
            <h3
              className="text-sm font-bold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors"
              title={a.course_name}
            >
              {a.course_name ?? "Course Attachment Pending"}
            </h3>
          </div>

          {ready ? (
            <Badge
              variant="secondary"
              className="text-[10px] font-semibold gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0"
            >
              <CheckCircle2 className="size-3" />
              Ready
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0"
            >
              To Set Up
            </Badge>
          )}
        </div>

        {/* Institution & Cohort Placement */}
        <div className="space-y-1.5 text-xs text-muted-foreground pt-1 border-t border-border/40">
          <div className="flex items-center gap-1.5 truncate">
            <Building2 className="size-3 text-muted-foreground shrink-0" />
            <span className="truncate">{a.institution_name || "Institution Assigned"}</span>
          </div>

          {location && (
            <div className="flex items-center gap-1.5 truncate">
              <Layers className="size-3 text-muted-foreground shrink-0" />
              <span className="truncate" title={location}>
                {location}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 truncate">
            <Users className="size-3 text-muted-foreground shrink-0" />
            <span className="font-medium text-foreground">
              {ROLE_LABELS[a.role] ?? a.role}
            </span>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="mt-auto pt-2 border-t border-border/40">
          {ready ? (
            <Button
              asChild
              size="sm"
              className="w-full h-8 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all shadow-none"
            >
              <Link href={`/lecturer/courses/${a.workspace_id}`}>
                Open Course Workspace
                <ArrowRight className="ml-1.5 size-3" />
              </Link>
            </Button>
          ) : a.course_id ? (
            <Button
              asChild
              size="sm"
              className="w-full h-8 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-xs"
            >
              <Link href={`/lecturer/courses/new?assignment=${a.id}`}>
                <Plus className="mr-1 size-3.5" />
                Set Up Course
              </Link>
            </Button>
          ) : (
            <p className="rounded-lg bg-muted/40 border border-border/40 px-2.5 py-1.5 text-[11px] text-muted-foreground text-center">
              Awaiting administrator course attachment
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
