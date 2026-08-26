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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Plus,
  BookOpen,
  FileText,
  Layers,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Search,
  X,
  School,
  RefreshCw,
  ArrowUpRight,
  ArrowUpDown,
} from "lucide-react";
import Link from "next/link";
import { lecturerApi, WorkspaceListItem } from "@/lib/api/lecturer";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function LecturerWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("name_asc");
  const [collapsedYears, setCollapsedYears] = useState<Record<string, boolean>>({});

  const loadWorkspaces = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await lecturerApi.getWorkspaces();
      setWorkspaces(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load workspaces", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // Filter and sort workspaces
  const processedWorkspaces = useMemo(() => {
    let result = [...workspaces];

    // Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (ws) =>
          ws.title?.toLowerCase().includes(q) ||
          ws.code?.toLowerCase().includes(q) ||
          ws.class_name?.toLowerCase().includes(q) ||
          ws.academic_year?.toLowerCase().includes(q),
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "name_asc":
          return (a.title || "").localeCompare(b.title || "");
        case "name_desc":
          return (b.title || "").localeCompare(a.title || "");
        case "code_asc":
          return (a.code || "").localeCompare(b.code || "");
        case "students_desc":
          return (b.student_count || 0) - (a.student_count || 0);
        case "students_asc":
          return (a.student_count || 0) - (b.student_count || 0);
        case "performance_desc":
          return (b.performance_avg || 0) - (a.performance_avg || 0);
        case "performance_asc":
          return (a.performance_avg || 0) - (b.performance_avg || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [workspaces, searchQuery, sortBy]);

  // Group workspaces by Academic Year
  const groupedWorkspaces = useMemo(() => {
    const groups: Record<string, WorkspaceListItem[]> = {};
    processedWorkspaces.forEach((ws) => {
      const key = ws.academic_year || "Ongoing Semesters";
      if (!groups[key]) groups[key] = [];
      groups[key].push(ws);
    });
    return groups;
  }, [processedWorkspaces]);

  const toggleYear = (yearName: string) => {
    setCollapsedYears((prev) => ({
      ...prev,
      [yearName]: !prev[yearName],
    }));
  };

  if (loading) {
    return (
      <div className="w-full max-w-full 2xl:max-w-[1800px] mx-auto min-w-0 space-y-4 p-1 sm:p-2 lg:p-3 transition-all duration-300 font-sans">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
          <div className="space-y-1">
            <Skeleton className="h-6 w-48 rounded-lg" />
            <Skeleton className="h-3.5 w-72 rounded-lg" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-32 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-3.5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full 2xl:max-w-[1800px] mx-auto min-w-0 space-y-4 sm:space-y-5 p-1 sm:p-2 lg:p-3 transition-all duration-300 font-sans pb-12">
      {/* Compact Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-border/40 pb-3">
        <div>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <School className="size-4.5 text-primary" />
            Academic Teaching Workspaces
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-normal">
            Manage course environments, cohort metrics, and curriculum configurations.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => loadWorkspaces(true)}
            className="h-7.5 px-2.5 text-xs font-medium rounded-lg border-border/60 hover:bg-muted/50 gap-1.5 shadow-2xs"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin text-primary")} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>
          <Button
            size="sm"
            asChild
            className="h-7.5 px-3 text-xs font-semibold rounded-lg shadow-2xs bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
          >
            <Link href="/lecturer/courses/new">
              <Plus className="size-3.5" /> Initialize Workspace
            </Link>
          </Button>
        </div>
      </div>

      {/* Filter, Search & Sort Control Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-2.5 border border-border/50 bg-card/40 rounded-xl backdrop-blur-xs">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by course name, code, cohort, or academic period..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-8 h-8 text-xs rounded-lg bg-background border-border/60"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 justify-between sm:justify-end flex-wrap">
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0" />
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 text-xs rounded-lg bg-background border-border/60 w-[170px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent align="end" className="text-xs">
                <SelectItem value="name_asc">Course Name (A-Z)</SelectItem>
                <SelectItem value="name_desc">Course Name (Z-A)</SelectItem>
                <SelectItem value="code_asc">Course Code</SelectItem>
                <SelectItem value="students_desc">Most Students</SelectItem>
                <SelectItem value="students_asc">Fewest Students</SelectItem>
                <SelectItem value="performance_desc">Highest Performance</SelectItem>
                <SelectItem value="performance_asc">Lowest Performance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-[11px] text-muted-foreground font-normal whitespace-nowrap pl-1">
            {processedWorkspaces.length} of {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Grouped & Collapsible Academic Workspaces */}
      <div className="space-y-3.5">
        {processedWorkspaces.length === 0 ? (
          <Card className="border border-dashed border-border/60 bg-card/40 backdrop-blur-xs rounded-xl py-12 px-4 text-center">
            <CardContent className="space-y-2.5 max-w-md mx-auto p-0">
              <div className="size-10 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-center mx-auto text-muted-foreground">
                <Layers className="size-5 text-muted-foreground/60" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-xs font-semibold text-foreground">
                  {searchQuery ? "No Matching Workspaces Found" : "No Active Teaching Workspaces"}
                </h3>
                <p className="text-[11px] text-muted-foreground font-normal">
                  {searchQuery
                    ? "Try adjusting your search keywords or reset sorting to view all courses."
                    : "Initialize your academic courses to assign assessments and track student cohort progress."}
                </p>
              </div>
              {searchQuery ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchQuery("")}
                  className="mt-2 h-7.5 text-xs font-medium rounded-lg"
                >
                  Clear Search
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7.5 text-xs font-medium rounded-lg"
                  asChild
                >
                  <Link href="/lecturer/courses/new">
                    <Plus className="size-3 mr-1" /> Initialize Workspace
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedWorkspaces).map(([year, list]) => {
            const isCollapsed = !!collapsedYears[year];
            return (
              <div
                key={year}
                className="border border-border/50 rounded-xl overflow-hidden bg-card/40 backdrop-blur-xs transition-all"
              >
                {/* Collapsible Year Header */}
                <button
                  type="button"
                  onClick={() => toggleYear(year)}
                  className="w-full flex items-center justify-between p-2.5 sm:px-3.5 bg-muted/20 border-b border-border/30 transition-colors hover:bg-muted/40 text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {isCollapsed ? (
                      <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Academic Period: {year}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[9px] font-mono font-medium h-4 px-1.5 rounded-md"
                    >
                      {list.length} {list.length === 1 ? "Course" : "Courses"}
                    </Badge>
                  </div>
                </button>

                {/* Course Cards Grid */}
                {!isCollapsed && (
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 animate-in fade-in duration-150">
                    {list.map((ws) => (
                      <Card
                        key={ws.id}
                        className="hover:border-primary/40 hover:shadow-xs transition-all duration-200 flex flex-col bg-card/60 rounded-xl overflow-hidden justify-between border-border/50 group"
                      >
                        {/* Header: Title + Badges with robust wrapping */}
                        <CardHeader className="p-3 pb-2 border-b border-border/30 bg-muted/10">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="min-h-[2.25rem] flex items-start">
                                <CardTitle
                                  title={ws.title}
                                  className="text-xs sm:text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug break-words"
                                >
                                  {ws.title}
                                </CardTitle>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1.5 font-mono text-[9px] font-medium text-muted-foreground flex-wrap">
                                <Badge
                                  variant="outline"
                                  className="h-4 px-1.5 text-[9px] font-mono font-semibold bg-primary/5 border-primary/20 text-primary shrink-0"
                                >
                                  {ws.code || "N/A"}
                                </Badge>
                                {ws.class_name && (
                                  <span className="truncate text-[10px] text-muted-foreground">
                                    • {ws.class_name}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className="rounded-full h-4 px-1.5 text-[8px] font-medium uppercase border-none shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            >
                              Active
                            </Badge>
                          </div>
                        </CardHeader>

                        {/* Content: Metadata & Metrics */}
                        <CardContent className="p-3 pt-2.5 flex-1 flex flex-col gap-2.5 justify-between">
                          <div className="space-y-1.5 text-[11px] text-muted-foreground font-normal">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-muted-foreground/80 truncate">
                                <Users className="size-3.5 text-muted-foreground/70 shrink-0" />
                                <span>Students Enrolled</span>
                              </span>
                              <span className="text-foreground font-mono font-semibold shrink-0">
                                {ws.student_count ?? 0}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-muted-foreground/80 truncate">
                                <BookOpen className="size-3.5 text-muted-foreground/70 shrink-0" />
                                <span>Cohort</span>
                              </span>
                              <span className="text-foreground font-medium truncate text-right max-w-[120px]">
                                {ws.class_name || "General"}
                              </span>
                            </div>

                            <div className="space-y-1 pt-0.5">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="flex items-center gap-1 text-muted-foreground/80">
                                  <TrendingUp className="size-3 text-muted-foreground/70" />
                                  <span>Class Average</span>
                                </span>
                                <span
                                  className={cn(
                                    "font-mono font-semibold",
                                    (ws.performance_avg ?? 0) >= 50
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-amber-600 dark:text-amber-400",
                                  )}
                                >
                                  {ws.performance_avg ?? 0}%
                                </span>
                              </div>
                              <Progress
                                value={ws.performance_avg ?? 0}
                                className="h-1 bg-muted/60"
                              />
                            </div>
                          </div>

                          {/* Quick Action Buttons */}
                          <div className="flex gap-1.5 pt-2 border-t border-border/30">
                            <Button
                              asChild
                              size="sm"
                              className="flex-1 h-7.5 text-xs font-semibold rounded-lg shadow-2xs bg-primary hover:bg-primary/90 text-primary-foreground gap-1 px-2"
                            >
                              <Link href={`/lecturer/courses/${ws.id}`}>
                                <span>Manage</span>
                                <ArrowUpRight className="size-3" />
                              </Link>
                            </Button>
                            <Button
                              variant="outline"
                              asChild
                              size="sm"
                              className="h-7.5 w-7.5 p-0 rounded-lg border-border/60 hover:bg-muted/50 shrink-0"
                              title="Assessments List"
                            >
                              <Link href={`/lecturer/assessments`}>
                                <FileText className="size-3.5 text-muted-foreground" />
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
