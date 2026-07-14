// app/lecturer/courses/page.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  Plus,
  BookOpen,
  FileText,
  Layers,
  ChevronDown,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { lecturerApi, WorkspaceListItem } from "@/lib/api/lecturer";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function LecturerWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedYears, setCollapsedYears] = useState<Record<string, boolean>>({});

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const data = await lecturerApi.getWorkspaces();
      setWorkspaces(data);
    } catch (err) {
      console.error("Failed to load workspaces", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // Group workspaces by Academic Year for easy collapsible management
  const groupedWorkspaces = useMemo(() => {
    const groups: Record<string, WorkspaceListItem[]> = {};
    workspaces.forEach((ws) => {
      const key = ws.academic_year || "Ongoing Semesters";
      if (!groups[key]) groups[key] = [];
      groups[key].push(ws);
    });
    return groups;
  }, [workspaces]);

  const toggleYear = (yearName: string) => {
    setCollapsedYears((prev) => ({
      ...prev,
      [yearName]: !prev[yearName],
    }));
  };

  if (loading) {
    return (
      <div className="w-full space-y-3.5 p-1 md:p-2 animate-pulse">
        <div className="flex justify-between items-center pb-2 border-b">
          <div className="space-y-1">
            <Skeleton className="h-7 w-48 rounded-md" />
            <Skeleton className="h-4 w-72 rounded-md" />
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Academic Workspaces
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
            Manage your active academic courses, students, and curriculum metrics.
          </p>
        </div>
        <Button
          size="sm"
          asChild
          className="h-8 px-4 font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-none text-white"
        >
          <Link href="/lecturer/courses/new">
            <Plus className="mr-1.5 size-3.5" /> Initialize Workspace
          </Link>
        </Button>
      </div>

      {/* Grouped & Collapsible Academic Workspaces */}
      <div className="space-y-4">
        {workspaces.length === 0 ? (
          <div className="py-16 text-center bg-zinc-50/50 border border-dashed rounded-xl">
            <Layers className="size-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              No active workspaces found
            </p>
          </div>
        ) : (
          Object.entries(groupedWorkspaces).map(([year, list]) => {
            const isCollapsed = !!collapsedYears[year];
            return (
              <div key={year} className="border border-zinc-150 rounded-xl overflow-hidden bg-white/40">
                {/* Year Header trigger */}
                <button
                  type="button"
                  onClick={() => toggleYear(year)}
                  className="w-full flex items-center justify-between p-3 bg-zinc-50 border-b border-zinc-150 transition-colors hover:bg-zinc-100/70"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                    <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                      Academic Period: {year}
                    </span>
                    <Badge variant="secondary" className="text-[9px] font-bold h-4 px-1.5 bg-zinc-200/60">
                      {list.length} {list.length === 1 ? "Course" : "Courses"}
                    </Badge>
                  </div>
                </button>

                {/* Course list under selected Year */}
                {!isCollapsed && (
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-150">
                    {list.map((ws) => (
                      <Card
                        key={ws.id}
                        className="hover:border-primary/30 transition-all duration-200 flex flex-col bg-white shadow-sm rounded-xl overflow-hidden"
                      >
                        <CardHeader className="pb-2.5 px-4 pt-3.5 border-b border-zinc-100 bg-zinc-50/30">
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <CardTitle className="text-xs font-bold truncate leading-snug text-zinc-900 group-hover:text-primary transition-colors">
                                {ws.title}
                              </CardTitle>
                              <div className="flex items-center gap-1.5 mt-1 font-mono text-[9px] font-bold text-zinc-500 uppercase tracking-wide">
                                <Badge
                                  variant="outline"
                                  className="h-4.5 px-1.5 text-[8px] font-bold bg-primary/5 border-primary/20 text-primary"
                                >
                                  {ws.code || "N/A"}
                                </Badge>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className="rounded-full h-4.5 px-2 text-[8px] font-bold uppercase border-none shrink-0 bg-emerald-50 text-emerald-600"
                            >
                              Active
                            </Badge>
                          </div>
                        </CardHeader>

                        <CardContent className="p-4 flex-1 flex flex-col gap-3 justify-between">
                          {/* Inline Metadata rows */}
                          <div className="space-y-1.5 text-xs text-zinc-600 font-medium">
                            <div className="flex items-center gap-2">
                              <Users className="size-3.5 text-muted-foreground shrink-0" />
                              <span>{ws.student_count} Students Enrolled</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <BookOpen className="size-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">Cohort: {ws.class_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <TrendingUp className="size-3.5 text-muted-foreground shrink-0" />
                              <div className="flex-1 flex items-center justify-between text-[11px]">
                                <span>Performance Avg</span>
                                <span className={cn("font-bold", ws.performance_avg >= 50 ? "text-emerald-600" : "text-amber-600")}>
                                  {ws.performance_avg}%
                                </span>
                              </div>
                            </div>
                            <Progress value={ws.performance_avg} className="h-1 bg-zinc-100" />
                          </div>

                          {/* Quick Links actions */}
                          <div className="flex gap-2 pt-2">
                            <Button
                              asChild
                              size="sm"
                              className="flex-1 h-8 text-[9px] font-bold uppercase tracking-wider rounded-lg shadow-none bg-primary hover:bg-primary/95 text-white"
                            >
                              <Link href={`/lecturer/courses/${ws.id}`}>View Workspace</Link>
                            </Button>
                            <Button
                              variant="outline"
                              asChild
                              size="sm"
                              className="w-8.5 h-8 p-0 border-zinc-200 bg-white"
                            >
                              <Link href={`/lecturer/assessments`} title="Assessments List">
                                <FileText className="size-3.5 text-zinc-500" />
                              </Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
