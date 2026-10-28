// app/lecturer/courses/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  FilePlus2,
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
import { lecturerApi, WorkspaceListItem } from "@/lib/api/lecturer";

export default function LecturerCoursesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matching = workspaces.filter(
      (w) =>
        !q ||
        [w.title, w.code, w.class_name, w.academic_year]
          .join(" ")
          .toLowerCase()
          .includes(q),
    );
    const map = new Map<string, WorkspaceListItem[]>();
    for (const w of matching) {
      const key = w.academic_year || "No period";
      map.set(key, [...(map.get(key) ?? []), w]);
    }
    return [...map.entries()];
  }, [workspaces, search]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">My Courses</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Each course you have set up, with its class list, handouts and
            assessments.
          </p>
        </div>
        <div className="flex gap-2">
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
          <Button asChild size="sm">
            <Link href="/lecturer/courses/new">
              <Plus className="mr-1.5 size-3.5" /> Set up a course
            </Link>
          </Button>
        </div>
      </header>

      {workspaces.length > 0 && (
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, code or class"
            className="pl-8"
          />
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
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
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Layers className="size-8 text-muted-foreground/60" />
            <p className="max-w-sm text-sm text-muted-foreground">
              {workspaces.length === 0
                ? "You haven't set up any course yet. Start from the courses your administrator assigned to you."
                : "No course matches your search."}
            </p>
            {workspaces.length === 0 && (
              <Button asChild size="sm">
                <Link href="/lecturer/assignments">View my assignments</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        groups.map(([period, items]) => (
          <section key={period} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {period}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((w) => (
                <CourseCard key={w.id} workspace={w} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function CourseCard({ workspace: w }: { workspace: WorkspaceListItem }) {
  const active = (w.status ?? "ACTIVE").toUpperCase() === "ACTIVE";
  return (
    <Card className="flex flex-col">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted-foreground">
              {w.code}
              {w.class_name && w.class_name !== "GLOBAL"
                ? ` · ${w.class_name}`
                : ""}
            </p>
            <h3 className="line-clamp-2 text-base font-semibold" title={w.title}>
              {w.title}
            </h3>
          </div>
          {!active && (
            <Badge variant="outline" className="shrink-0">
              {w.status.toLowerCase()}
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5" />
            {w.student_count} student{w.student_count === 1 ? "" : "s"}
          </span>
          <span>
            Average{" "}
            <span className="font-semibold text-foreground">
              {w.performance_avg > 0 ? `${w.performance_avg}%` : "—"}
            </span>
          </span>
        </div>

        <div className="mt-auto flex gap-2 pt-1">
          <Button asChild size="sm" className="flex-1">
            <Link href={`/lecturer/courses/${w.id}`}>
              Open <ArrowRight className="ml-1.5 size-3.5" />
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
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
