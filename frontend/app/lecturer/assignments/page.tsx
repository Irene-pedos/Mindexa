"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
} from "lucide-react";
import Link from "next/link";
import { academicApi, TeachingAssignment } from "@/lib/api/academic";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notificationApi } from "@/lib/api/notification";

export default function LecturerAssignmentsPage() {
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await academicApi.getMyAssignments();
      setAssignments(data);

      // Clear unread assignment notifications
      const notifRes = await notificationApi.getNotifications(true);
      const assignmentNotifs = notifRes.items.filter(
        (n) => n.notification_type === "TEACHING_ASSIGNMENT_CREATED",
      );
      for (const notif of assignmentNotifs) {
        await notificationApi.markAsRead(notif.id);
      }
    } catch (err) {
      console.error("Failed to load teaching assignments", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      const matchesSearch =
        (assignment.course_name || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        (assignment.course_code || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase());

      const isActive = assignment.is_active !== false;
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
            ? isActive
            : !isActive;

      return matchesSearch && matchesStatus;
    });
  }, [assignments, searchTerm, statusFilter]);

  // Group assignments by Academic Year or Period
  const groupedAssignments = useMemo(() => {
    const groups: Record<string, TeachingAssignment[]> = {};
    filteredAssignments.forEach((assignment) => {
      const key = assignment.academic_year || "Ongoing Semesters";
      if (!groups[key]) groups[key] = [];
      groups[key].push(assignment);
    });
    return groups;
  }, [filteredAssignments]);

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const activeCount = assignments.filter((a) => a.is_active !== false).length;

  if (loading) {
    return (
      <div className="w-full space-y-3.5 p-1 md:p-2">
        <div className="space-y-1">
          <Skeleton className="h-7 w-48 rounded-md" />
          <Skeleton className="h-4 w-72 rounded-md" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-200">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Teaching Assignments
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
            Registry of institutional assignments and module deployments.
          </p>
        </div>
        <Button
          size="sm"
          asChild
          className="h-8 px-4 font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-none text-white"
        >
          <Link href="/lecturer/courses/new">
            <Plus className="mr-1.5 size-3.5" /> New Course
          </Link>
        </Button>
      </div>

      {/* Filter and Tabs bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-1.5 border-b border-zinc-100">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by code or course..."
            className="pl-9 h-8.5 text-xs rounded-lg border-zinc-200 bg-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <Tabs
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="w-full md:w-auto"
        >
          <TabsList className="bg-zinc-100 p-1 rounded-lg h-8.5 border shadow-none">
            <TabsTrigger
              value="active"
              className="text-[10px] font-bold uppercase tracking-wider px-3.5 h-6.5 data-[state=active]:bg-white data-[state=active]:text-primary"
            >
              Active ({activeCount})
            </TabsTrigger>
            <TabsTrigger
              value="archived"
              className="text-[10px] font-bold uppercase tracking-wider px-3.5 h-6.5 data-[state=active]:bg-white data-[state=active]:text-primary"
            >
              Past
            </TabsTrigger>
            <TabsTrigger
              value="all"
              className="text-[10px] font-bold uppercase tracking-wider px-3.5 h-6.5 data-[state=active]:bg-white data-[state=active]:text-primary"
            >
              All Time
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Collapsible Assignment Groups */}
      <div className="space-y-4">
        {filteredAssignments.length === 0 ? (
          <Card className="border-dashed bg-zinc-50/50 rounded-xl border-zinc-200/80 shadow-none">
            <CardContent className="py-16 text-center">
              <div className="size-10 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-3 text-muted-foreground/45 border border-zinc-200">
                <Filter className="size-4.5" />
              </div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                No teaching assignments found.
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1 font-medium">
                Adjust search keywords or contact institutional admin for deployment.
              </p>
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedAssignments).map(([groupName, items]) => {
            const isCollapsed = !!collapsedGroups[groupName];
            return (
              <div key={groupName} className="border border-zinc-150 rounded-xl overflow-hidden bg-white/40">
                {/* Collapsible Group Header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(groupName)}
                  className="w-full flex items-center justify-between p-3.5 bg-zinc-50 border-b border-zinc-150 transition-colors hover:bg-zinc-100/70"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                    <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                      {groupName}
                    </span>
                    <Badge variant="secondary" className="text-[9px] font-bold h-4 px-1.5 bg-zinc-200/60">
                      {items.length} {items.length === 1 ? "Assignment" : "Assignments"}
                    </Badge>
                  </div>
                </button>

                {/* Group Content Grid */}
                {!isCollapsed && (
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-150">
                    {items.map((assignment) => (
                      <Card
                        key={assignment.id}
                        className={cn(
                          "hover:border-primary/30 transition-all duration-200 group overflow-hidden shadow-none border rounded-xl flex flex-col bg-white",
                          assignment.is_active === false && "opacity-75 bg-zinc-50/50"
                        )}
                      >
                        <CardHeader className="pb-2.5 px-4 pt-3.5 border-b border-zinc-100 bg-zinc-50/30">
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <CardTitle className="text-xs font-bold truncate leading-snug text-zinc-900 group-hover:text-primary transition-colors">
                                {assignment.course_name || "Unknown Module"}
                              </CardTitle>
                              <div className="flex items-center gap-1.5 mt-1 font-mono text-[9px] font-bold text-zinc-500 uppercase tracking-wide">
                                <Badge
                                  variant="outline"
                                  className="h-4.5 px-1.5 text-[8px] font-bold bg-primary/5 border-primary/20 text-primary"
                                >
                                  {assignment.course_code || "N/A"}
                                </Badge>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-full h-4.5 px-2 text-[8px] font-bold uppercase border-none shrink-0",
                                assignment.is_active !== false
                                  ? "bg-emerald-50 text-emerald-600"
                                  : "bg-zinc-100 text-zinc-500"
                              )}
                            >
                              {assignment.is_active !== false ? "Active" : "Archived"}
                            </Badge>
                          </div>
                        </CardHeader>

                        <CardContent className="p-4 flex-1 flex flex-col gap-3 justify-between">
                          <div className="space-y-1.5 text-xs text-zinc-600 font-medium">
                            <div className="flex items-center gap-2">
                              <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{assignment.institution_name || "N/A"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Layers className="size-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">
                                {assignment.department_name || "Global Dept"}
                                {assignment.class_section_name ? ` • ${assignment.class_section_name}` : ""}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="size-3.5 text-muted-foreground shrink-0" />
                              <span className="text-primary text-[10px] font-bold uppercase tracking-wider">
                                {assignment.role.replace("_", " ")}
                              </span>
                            </div>
                          </div>

                          <div className="pt-2">
                            {assignment.is_active !== false ? (
                              <Button
                                asChild
                                size="sm"
                                className="w-full h-7.5 text-[9px] font-bold uppercase tracking-wider rounded-lg shadow-none justify-between px-3 bg-primary hover:bg-primary/95 text-white"
                              >
                                <Link href="/lecturer/courses/new">
                                  Initialize
                                  <ArrowRight className="size-3 opacity-80" />
                                </Link>
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled
                                className="w-full h-7.5 text-[9px] font-bold uppercase tracking-wider rounded-lg shadow-none px-3 bg-zinc-100 text-zinc-400"
                              >
                                Archived
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
