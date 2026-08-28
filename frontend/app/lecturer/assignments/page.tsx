// app/lecturer/assignments/page.tsx
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
import {
  BookOpen,
  Calendar,
  Layers,
  Building2,
  Users,
  Search,
  Filter,
  Plus,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  RefreshCw,
  X,
  ArrowUpDown,
} from "lucide-react";
import Link from "next/link";
import { academicApi, TeachingAssignment } from "@/lib/api/academic";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notificationApi } from "@/lib/api/notification";

export default function LecturerAssignmentsPage() {
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [sortBy, setSortBy] = useState<string>("name_asc");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const loadAssignments = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await academicApi.getMyAssignments();
      setAssignments(Array.isArray(data) ? data : []);

      // Clear unread assignment notifications
      const notifRes = await notificationApi.getNotifications(true);
      if (notifRes && Array.isArray(notifRes.items)) {
        const assignmentNotifs = notifRes.items.filter(
          (n) => n.notification_type === "TEACHING_ASSIGNMENT_CREATED",
        );
        for (const notif of assignmentNotifs) {
          await notificationApi.markAsRead(notif.id);
        }
      }
    } catch (err) {
      console.error("Failed to load teaching assignments", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const filteredAndSortedAssignments = useMemo(() => {
    const result = assignments.filter((assignment) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (assignment.course_name || "").toLowerCase().includes(q) ||
        (assignment.course_code || "").toLowerCase().includes(q) ||
        (assignment.department_name || "").toLowerCase().includes(q) ||
        (assignment.institution_name || "").toLowerCase().includes(q) ||
        (assignment.class_section_name || "").toLowerCase().includes(q);

      const isActive = assignment.is_active !== false;
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
            ? isActive
            : !isActive;

      return matchesSearch && matchesStatus;
    });

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "name_asc":
          return (a.course_name || "").localeCompare(b.course_name || "");
        case "name_desc":
          return (b.course_name || "").localeCompare(a.course_name || "");
        case "code_asc":
          return (a.course_code || "").localeCompare(b.course_code || "");
        case "dept_asc":
          return (a.department_name || "").localeCompare(b.department_name || "");
        default:
          return 0;
      }
    });

    return result;
  }, [assignments, searchTerm, statusFilter, sortBy]);

  // Group assignments by Academic Year or Period
  const groupedAssignments = useMemo(() => {
    const groups: Record<string, TeachingAssignment[]> = {};
    filteredAndSortedAssignments.forEach((assignment) => {
      const key = assignment.academic_year || "Ongoing Semesters";
      if (!groups[key]) groups[key] = [];
      groups[key].push(assignment);
    });
    return groups;
  }, [filteredAndSortedAssignments]);

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const activeCount = assignments.filter((a) => a.is_active !== false).length;
  const archivedCount = assignments.filter((a) => a.is_active === false).length;

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
            <GraduationCap className="size-4.5 text-primary" />
            Teaching Assignments
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-normal">
            Registry of institutional course allocations, faculty deployments, and module responsibilities.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => loadAssignments(true)}
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
              <Plus className="size-3.5" /> Initialize Course
            </Link>
          </Button>
        </div>
      </div>

      {/* Search, Filter Tabs & Sort Controls */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 p-2.5 border border-border/50 bg-card/40 rounded-xl backdrop-blur-xs">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by course name, code, department, or section..."
            className="pl-8 pr-8 h-8 text-xs rounded-lg bg-background border-border/60"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 justify-between lg:justify-end flex-wrap">
          <Tabs
            value={statusFilter}
            onValueChange={setStatusFilter}
            className="w-auto"
          >
            <TabsList className="h-8 p-0.5 rounded-lg bg-muted/60">
              <TabsTrigger
                value="active"
                className="h-7 px-2.5 text-xs font-medium rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground"
              >
                Active ({activeCount})
              </TabsTrigger>
              <TabsTrigger
                value="archived"
                className="h-7 px-2.5 text-xs font-medium rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground"
              >
                Archived ({archivedCount})
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className="h-7 px-2.5 text-xs font-medium rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground"
              >
                All ({assignments.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0" />
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 text-xs rounded-lg bg-background border-border/60 w-[150px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent align="end" className="text-xs">
                <SelectItem value="name_asc">Course Name (A-Z)</SelectItem>
                <SelectItem value="name_desc">Course Name (Z-A)</SelectItem>
                <SelectItem value="code_asc">Course Code</SelectItem>
                <SelectItem value="dept_asc">Department (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-[11px] text-muted-foreground font-normal whitespace-nowrap pl-1">
            {filteredAndSortedAssignments.length} matching
          </div>
        </div>
      </div>

      {/* Collapsible Assignment Groups */}
      <div className="space-y-3.5">
        {filteredAndSortedAssignments.length === 0 ? (
          <Card className="border border-dashed border-border/60 bg-card/40 backdrop-blur-xs rounded-xl py-12 px-4 text-center">
            <CardContent className="space-y-2.5 max-w-md mx-auto p-0">
              <div className="size-10 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-center mx-auto text-muted-foreground">
                <Filter className="size-5 text-muted-foreground/60" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-xs font-semibold text-foreground">
                  {searchTerm ? "No Matching Assignments Found" : "No Teaching Assignments Found"}
                </h3>
                <p className="text-[11px] text-muted-foreground font-normal">
                  {searchTerm
                    ? "Try adjusting your search query or clear filters to view all allocated courses."
                    : "No institutional teaching assignments have been deployed for your faculty account yet."}
                </p>
              </div>
              {searchTerm ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchTerm("")}
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
                    <Plus className="size-3 mr-1" /> Initialize Course
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedAssignments).map(([groupName, items]) => {
            const isCollapsed = !!collapsedGroups[groupName];
            return (
              <div
                key={groupName}
                className="border border-border/50 rounded-xl overflow-hidden bg-card/40 backdrop-blur-xs transition-all"
              >
                {/* Collapsible Group Header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(groupName)}
                  className="w-full flex items-center justify-between p-2.5 sm:px-3.5 bg-muted/20 border-b border-border/30 transition-colors hover:bg-muted/40 text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {isCollapsed ? (
                      <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Academic Term: {groupName}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[9px] font-mono font-medium h-4 px-1.5 rounded-md"
                    >
                      {items.length} {items.length === 1 ? "Course" : "Courses"}
                    </Badge>
                  </div>
                </button>

                {/* Assignment Cards Grid */}
                {!isCollapsed && (
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 animate-in fade-in duration-150">
                    {items.map((assignment) => (
                      <Card
                        key={assignment.id}
                        className={cn(
                          "hover:border-primary/40 hover:shadow-xs transition-all duration-200 flex flex-col bg-card/60 rounded-xl overflow-hidden justify-between border-border/50 group",
                          assignment.is_active === false && "opacity-70 bg-muted/20",
                        )}
                      >
                        {/* Header: Title + Badges with robust wrapping */}
                        <CardHeader className="p-3 pb-2 border-b border-border/30 bg-muted/10">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="min-h-[2.25rem] flex items-start">
                                <CardTitle
                                  title={assignment.course_name}
                                  className="text-xs sm:text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug break-words"
                                >
                                  {assignment.course_name || "Unknown Module"}
                                </CardTitle>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1.5 font-mono text-[9px] font-medium text-muted-foreground flex-wrap">
                                <Badge
                                  variant="outline"
                                  className="h-4 px-1.5 text-[9px] font-mono font-semibold bg-primary/5 border-primary/20 text-primary shrink-0"
                                >
                                  {assignment.course_code || "N/A"}
                                </Badge>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-full h-4 px-1.5 text-[8px] font-medium uppercase border-none shrink-0",
                                assignment.is_active !== false
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {assignment.is_active !== false ? "Active" : "Archived"}
                            </Badge>
                          </div>
                        </CardHeader>

                        {/* Content: Metadata */}
                        <CardContent className="p-3 pt-2.5 flex-1 flex flex-col gap-2.5 justify-between">
                          <div className="space-y-1.5 text-[11px] text-muted-foreground font-normal">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-muted-foreground/80 truncate">
                                <Building2 className="size-3.5 text-muted-foreground/70 shrink-0" />
                                <span>Campus</span>
                              </span>
                              <span className="text-foreground/90 font-medium truncate text-right max-w-[120px]">
                                {assignment.institution_name || "Campus"}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-muted-foreground/80 truncate">
                                <Layers className="size-3.5 text-muted-foreground/70 shrink-0" />
                                <span>Department</span>
                              </span>
                              <span className="text-foreground/90 font-medium truncate text-right max-w-[120px]">
                                {assignment.department_name || "General"}
                                {assignment.class_section_name ? ` • ${assignment.class_section_name}` : ""}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <span className="flex items-center gap-1.5 text-muted-foreground/80 truncate">
                                <Users className="size-3.5 text-muted-foreground/70 shrink-0" />
                                <span>Role</span>
                              </span>
                              <span className="text-primary text-[10px] font-mono font-semibold uppercase tracking-wider shrink-0">
                                {(assignment.role || "LECTURER").replace(/_/g, " ")}
                              </span>
                            </div>
                          </div>

                          {/* Quick Action Button */}
                          <div className="pt-2 border-t border-border/30">
                            {assignment.is_active !== false ? (
                              <Button
                                asChild
                                size="sm"
                                className="w-full h-7.5 text-xs font-semibold rounded-lg shadow-2xs justify-between px-2.5 bg-primary hover:bg-primary/90 text-primary-foreground"
                              >
                                <Link href="/lecturer/courses/new">
                                  <span>Initialize Workspace</span>
                                  <ArrowRight className="size-3 opacity-80" />
                                </Link>
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled
                                className="w-full h-7.5 text-xs font-medium rounded-lg opacity-60"
                              >
                                Term Concluded
                              </Button>
                            )}
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
