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
} from "lucide-react";
import Link from "next/link";
import { academicApi, TeachingAssignment } from "@/lib/api/academic";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notificationApi } from "@/lib/api/notification";

export default function LecturerAssignmentsPage() {
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

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

  const activeCount = assignments.filter((a) => a.is_active !== false).length;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 p-6">
        <div className="space-y-1">
          <Skeleton className="h-8 w-48 rounded-md" />
          <Skeleton className="h-4 w-72 rounded-md" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground/90 flex items-center gap-2">
            Official Assignments
          </h1>
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-widest mt-0.5">
            Institutional Registry of your teaching responsibilities
          </p>
        </div>
        <Button
          size="sm"
          asChild
          className="h-9 px-5 font-semibold text-[10px] uppercase tracking-widest rounded-lg shadow-none"
        >
          <Link href="/lecturer/courses/new">
            <Plus className="mr-1.5 size-3.5" /> Initialize Workspace
          </Link>
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-muted/20 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Filter by course name or code..."
              className="pl-9 h-9 text-xs rounded-xl border-muted/30 bg-muted/5 focus:bg-background transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <Tabs
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="w-full md:w-auto"
        >
          <TabsList className="bg-muted/10 p-1 rounded-xl h-9 border border-muted/20 shadow-none">
            <TabsTrigger
              value="active"
              className="text-[10px] font-semibold uppercase tracking-widest px-4 h-7"
            >
              Active ({activeCount})
            </TabsTrigger>
            <TabsTrigger
              value="archived"
              className="text-[10px] font-semibold uppercase tracking-widest px-4 h-7"
            >
              Past
            </TabsTrigger>
            <TabsTrigger
              value="all"
              className="text-[10px] font-semibold uppercase tracking-widest px-4 h-7"
            >
              All Time
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAssignments.length === 0 ? (
          <Card className="col-span-full border-dashed bg-muted/5 rounded-2xl border-muted/20 shadow-none">
            <CardContent className="py-24 text-center">
              <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4 text-muted-foreground/30 border border-muted/40">
                <Filter className="size-6" />
              </div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                No assignments found.
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1.5">
                Adjust your filters or contact the institutional admin for
                deployment.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredAssignments.map((assignment) => (
            <Card
              key={assignment.id}
              className={cn(
                "hover:border-primary/20 transition-all group overflow-hidden shadow-none border rounded-2xl flex flex-col",
                assignment.is_active === false
                  ? "bg-muted/5 opacity-80"
                  : "bg-white",
              )}
            >
              <CardHeader
                className={cn(
                  "pb-3 px-5 pt-4 border-b border-muted/10",
                  assignment.is_active !== false
                    ? "bg-primary/[0.02]"
                    : "bg-transparent",
                )}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-semibold truncate leading-tight text-foreground/90 group-hover:text-primary transition-colors">
                      {assignment.course_name || "Unknown Module"}
                    </CardTitle>
                    <CardDescription className="font-mono text-[10px] font-bold text-primary/60 mt-1 flex items-center gap-1.5 uppercase tracking-wider">
                      <Badge
                        variant="outline"
                        className="h-4 px-1.5 text-[8px] bg-primary/5 border-primary/20"
                      >
                        {assignment.course_code || "N/A"}
                      </Badge>
                      {assignment.academic_year || "Unknown Period"}
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full h-5 px-2.5 text-[9px] font-semibold uppercase border-none shrink-0",
                      assignment.is_active !== false
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {assignment.is_active !== false ? "Active" : "Archived"}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-5 pt-4 flex-1 flex flex-col space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5">
                    <Building2 className="size-3.5 text-muted-foreground/60 mt-0.5" />
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Institution
                      </p>
                      <p className="text-xs font-medium text-foreground/80 truncate">
                        {assignment.institution_name || "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Layers className="size-3.5 text-muted-foreground/60 mt-0.5" />
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Department & Target
                      </p>
                      <p className="text-xs font-medium text-foreground/80 truncate">
                        {assignment.department_name || "Global Department"}
                        {assignment.class_section_name
                          ? ` • ${assignment.class_section_name}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Users className="size-3.5 text-muted-foreground/60 mt-0.5" />
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Designated Role
                      </p>
                      <p className="text-xs font-medium text-primary uppercase tracking-tight">
                        {assignment.role.replace("_", " ")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-auto">
                  {assignment.is_active !== false ? (
                    <Button
                      asChild
                      size="sm"
                      className="w-full h-9 text-[10px] font-semibold uppercase tracking-widest rounded-lg shadow-none justify-between px-4 bg-primary hover:bg-primary/90"
                    >
                      <Link href="/lecturer/courses/new">
                        Initialize Workspace
                        <ArrowRight className="size-3.5 opacity-60" />
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled
                      className="w-full h-9 text-[10px] font-semibold uppercase tracking-widest rounded-lg shadow-none px-4"
                    >
                      Archived Assignment
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
