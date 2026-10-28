// app/lecturer/assignments/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Layers,
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
  MAIN_LECTURER: "Main lecturer",
  ASSISTANT_LECTURER: "Assistant lecturer",
  CO_LECTURER: "Co-lecturer",
  SUPERVISOR: "Supervisor",
  REVIEWER: "Reviewer",
  GUEST_LECTURER: "Guest lecturer",
};

/** Where the assignment sits in the organisation, e.g. "Computing · BSc IT · Year 2 · Section A". */
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
        err instanceof Error ? err.message : "Could not load your assignments.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Opening this page counts as seeing the "new assignment" notifications.
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
        placement(a),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [assignments, filter, search]);

  const groups = useMemo(() => {
    const map = new Map<string, TeachingAssignment[]>();
    for (const a of visible) {
      const key = a.academic_period_name || a.academic_year || "No period";
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()];
  }, [visible]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            My Assignments
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Courses your administrator has assigned to you. Set up a course once
            to get its class list, handouts and assessments in one place.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load(true)}
          disabled={refreshing}
        >
          <RefreshCw
            className={`mr-1.5 size-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </header>

      {counts.setup > 0 && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-sm">
            <span className="font-semibold">{counts.setup}</span>{" "}
            {counts.setup === 1 ? "assignment is" : "assignments are"} waiting
            to be set up.
          </p>
          <Button size="sm" variant="secondary" onClick={() => setFilter("setup")}>
            Show them
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            <TabsTrigger value="setup">To set up ({counts.setup})</TabsTrigger>
            <TabsTrigger value="ready">Ready ({counts.ready})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search course, code or class"
            className="pl-8"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={() => load()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {assignments.length === 0
              ? "You have no teaching assignments yet. Your administrator assigns courses to you, and they will show up here."
              : "No assignments match your search."}
          </CardContent>
        </Card>
      ) : (
        groups.map(([period, items]) => (
          <section key={period} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {period}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((a) => (
                <AssignmentCard key={a.id} assignment={a} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function AssignmentCard({ assignment: a }: { assignment: TeachingAssignment }) {
  const ready = Boolean(a.workspace_id);
  return (
    <Card className="flex flex-col">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted-foreground">
              {a.course_code ?? "No course"}
            </p>
            <h3 className="truncate text-base font-semibold">
              {a.course_name ?? "Course not attached yet"}
            </h3>
          </div>
          {ready ? (
            <Badge variant="secondary" className="shrink-0 gap-1">
              <CheckCircle2 className="size-3 text-emerald-600" /> Ready
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0">
              To set up
            </Badge>
          )}
        </div>

        <dl className="space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Building2 className="size-3.5 shrink-0" />
            <span className="truncate">{a.institution_name}</span>
          </div>
          {placement(a) && (
            <div className="flex items-center gap-2">
              <Layers className="size-3.5 shrink-0" />
              <span className="truncate">{placement(a)}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Users className="size-3.5 shrink-0" />
            <span>{ROLE_LABELS[a.role] ?? a.role}</span>
          </div>
        </dl>

        <div className="mt-auto pt-1">
          {ready ? (
            <Button asChild size="sm" className="w-full">
              <Link href={`/lecturer/courses/${a.workspace_id}`}>
                Open course <ArrowRight className="ml-1.5 size-3.5" />
              </Link>
            </Button>
          ) : a.course_id ? (
            <Button asChild size="sm" variant="secondary" className="w-full">
              <Link href={`/lecturer/courses/new?assignment=${a.id}`}>
                Set up course <ArrowRight className="ml-1.5 size-3.5" />
              </Link>
            </Button>
          ) : (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Waiting for your administrator to attach a course.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
