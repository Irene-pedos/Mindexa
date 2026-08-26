// app/student/courses/page.tsx
"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen,
  Search,
  GraduationCap,
  ChevronDown,
  ChevronRight,
  Calendar,
  Layers,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { studentApi, StudentCourseListItem } from "@/lib/api/student";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  COMPLETED: "text-primary bg-primary/10 border-primary/20",
  INACTIVE: "text-muted-foreground bg-muted border-border/60",
};

function statusLabel(s: string) {
  if (s === "ACTIVE") return "Active";
  if (s === "COMPLETED") return "Completed";
  return s ?? "Active";
}

export default function StudentCoursesPage() {
  const [workspaces, setWorkspaces] = useState<StudentCourseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedYears, setCollapsedYears] = useState<Record<string, boolean>>({});

  const loadWorkspaces = async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkspaces(await studentApi.getWorkspaces());
    } catch (err) {
      console.error(err);
      setError("Unable to load your enrolled courses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter(
      (w) =>
        w.title?.toLowerCase().includes(q) || w.code?.toLowerCase().includes(q)
    );
  }, [workspaces, searchQuery]);

  const grouped = useMemo(() => {
    const map: Record<string, StudentCourseListItem[]> = {};
    filtered.forEach((ws) => {
      const key = ws.academic_year || "Ongoing Academic Period";
      if (!map[key]) map[key] = [];
      map[key].push(ws);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const toggleYear = (year: string) =>
    setCollapsedYears((prev) => ({ ...prev, [year]: !prev[year] }));

  if (loading) {
    return (
      <div className="w-full space-y-4 animate-pulse">
        <div className="flex justify-between items-center border-b pb-3">
          <Skeleton className="h-6 w-44 rounded-md" />
          <Skeleton className="h-8 w-52 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="space-y-0.5">
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GraduationCap className="size-5 text-primary" />
            My Courses
          </h1>
          <p className="text-xs text-muted-foreground font-medium">
            {filtered.length} enrolled course{filtered.length !== 1 ? "s" : ""} across academic periods
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search courses or codes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs bg-background border-border/60"
          />
        </div>
      </div>

      {error ? (
        <div className="py-16 text-center border-2 border-dashed rounded-xl border-destructive/30 bg-destructive/5">
          <BookOpen className="size-9 mx-auto mb-3 text-destructive/50" />
          <p className="text-xs font-medium text-destructive">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 text-xs"
            onClick={loadWorkspaces}
          >
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed rounded-xl border-border/50 bg-muted/10">
          <BookOpen className="size-9 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-xs font-semibold text-foreground">
            No courses found
          </p>
          {searchQuery && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Try adjusting your search query
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([year, courses]) => {
            const isCollapsed = !!collapsedYears[year];
            return (
              <div
                key={year}
                className="border border-border/60 rounded-2xl overflow-hidden bg-card/40 shadow-2xs"
              >
                <button
                  type="button"
                  onClick={() => toggleYear(year)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/20 border-b border-border/40 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    )}
                    <Calendar className="size-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Academic Period: {year}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-semibold h-4 px-1.5 bg-muted/60"
                    >
                      {courses.length} {courses.length === 1 ? "course" : "courses"}
                    </Badge>
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in fade-in duration-150">
                    {courses.map((ws) => (
                      <Card
                        key={ws.id}
                        className="group flex flex-col overflow-hidden hover:border-primary/40 hover:shadow-xs transition-all duration-200 border-border/60 rounded-xl bg-card"
                      >
                        {/* Course Banner: Image or Book Placeholder */}
                        {ws.banner_image_url ? (
                          <div
                            className="h-24 w-full bg-cover bg-center shrink-0 border-b border-border/40 relative overflow-hidden group-hover:scale-[1.01] transition-transform duration-300"
                            style={{
                              backgroundImage: `url(${ws.banner_image_url})`,
                            }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                          </div>
                        ) : (
                          <div className="h-24 w-full bg-gradient-to-br from-primary/10 via-muted/30 to-muted/60 flex items-center justify-center shrink-0 border-b border-border/40">
                            <BookOpen className="size-8 text-primary/30" />
                          </div>
                        )}

                        <CardHeader className="p-3.5 pb-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 space-y-1">
                              <Badge
                                variant="outline"
                                className="text-[10px] font-mono px-1.5 h-4 border-border/60 bg-muted/40"
                              >
                                {ws.code}
                              </Badge>
                              <CardTitle className="text-xs sm:text-sm font-semibold leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                                {ws.title}
                              </CardTitle>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] h-4.5 px-1.5 shrink-0 font-medium capitalize",
                                STATUS_COLORS[ws.status] ?? STATUS_COLORS.INACTIVE
                              )}
                            >
                              {statusLabel(ws.status)}
                            </Badge>
                          </div>
                        </CardHeader>

                        <CardContent className="p-3.5 pt-1.5 flex flex-col gap-2.5 flex-1">
                          {ws.lecturer_name && (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-medium">
                              <GraduationCap className="size-3.5 shrink-0 text-muted-foreground/80" />
                              <span className="truncate">{ws.lecturer_name}</span>
                            </p>
                          )}

                          <div className="space-y-1 mt-auto pt-1">
                            <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
                              <span>Course Progress</span>
                              <span className="text-foreground font-semibold">
                                {ws.progress}%
                              </span>
                            </div>
                            <Progress value={ws.progress} className="h-1.5" />
                          </div>

                          <Button
                            asChild
                            size="sm"
                            className="w-full h-8 text-xs font-semibold rounded-lg shadow-2xs mt-2"
                          >
                            <Link href={`/student/courses/${ws.id}`}>
                              View Course <ArrowRight className="size-3 ml-1" />
                            </Link>
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
