// app/(student)/courses/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Users,
  Calendar,
  Award,
  ChevronRight,
  BarChart3,
  Clock,
  LayoutDashboard,
  FileText,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import {
  studentApi,
  StudentCourseListItem,
  StudentDashboardResponse,
} from "@/lib/api/student";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function StudentWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<StudentCourseListItem[]>([]);
  const [dashboardData, setDashboardData] =
    useState<StudentDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [wsData, dashData] = await Promise.all([
          studentApi.getWorkspaces(),
          studentApi.getDashboard(),
        ]);
        setWorkspaces(wsData);
        setDashboardData(dashData);
      } catch (err) {
        console.error("Failed to load workspaces or dashboard data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const avgProgress =
    workspaces.length > 0
      ? Math.round(
          workspaces.reduce((acc, curr) => acc + curr.progress, 0) /
            workspaces.length,
        )
      : 0;

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto p-4">
        <div className="space-y-1">
          <Skeleton variant="title" className="h-8 w-48" />
          <Skeleton variant="title" className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="media" className="h-20 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="media" className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const metrics = [
    {
      label: "Active Modules",
      value: workspaces.length,
      icon: BookOpen,
      color: "text-primary",
    },
    {
      label: "Avg. Progress",
      value: `${avgProgress}%`,
      icon: BarChart3,
      color: "text-emerald-600",
    },
    {
      label: "Tasks Pending",
      value: dashboardData?.summary.active_assessments_count.value ?? 0,
      icon: Clock,
      color: "text-amber-600",
    },
    {
      label: "Current CGPA",
      value: (dashboardData?.summary.cgpa.value ?? 0).toFixed(2),
      icon: Award,
      color: "text-primary",
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground/90">
            Course Modules
          </h1>
          <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-widest">
            Current operational enrollment and academic progress tracking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[11px] font-semibold uppercase tracking-tight"
            asChild
          >
            <Link href="/student/schedule">
              <Calendar className="mr-1.5 size-3 text-primary" />
              Full Schedule
            </Link>
          </Button>
        </div>
      </div>

      {/* Semester Overview - High Density Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {metrics.map((stat, i) => (
          <Card
            key={i}
            className="shadow-none border border-border/50 bg-muted/5 hover:border-primary/10 transition-all"
          >
            <CardContent className="p-3.5 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {stat.label}
                </p>
                <p
                  className={cn(
                    "text-xl font-semibold tabular-nums tracking-tight",
                    stat.color,
                  )}
                >
                  {stat.value}
                </p>
              </div>
              <stat.icon className="size-4 opacity-30" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workspaces.length === 0 ? (
          <div className="col-span-full py-16 text-center border-2 border-dashed rounded-2xl bg-muted/5">
            <div className="size-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="size-6 text-muted-foreground/40" />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
              No active module enrollments found.
            </p>
          </div>
        ) : (
          workspaces.map((ws) => (
            <Card
              key={ws.id}
              className="shadow-none border hover:border-primary/20 transition-all group overflow-hidden"
            >
              <CardHeader className="pb-3 px-5 pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/5 flex items-center justify-center border border-primary/10 shrink-0">
                      <BookOpen className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold tracking-tight line-clamp-2 leading-snug min-h-[2.2rem] flex items-center">
                        {ws.title}
                      </CardTitle>
                      <CardDescription className="text-[11px] font-medium uppercase opacity-60 mt-0.5">
                        {ws.code} • {ws.academic_year}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="px-5 pb-4 space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Module Progress
                    </span>
                    <span className="text-[11px] font-bold tabular-nums">
                      {ws.progress}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${ws.progress}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 py-0.5">
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-tight flex items-center gap-1.5">
                      <Calendar className="size-3.5" /> Schedule
                    </div>
                    <div className="text-xs font-medium text-foreground/80">
                      Mon/Wed 09:00
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-tight flex items-center gap-1.5">
                      <Users className="size-3.5" /> Instructor
                    </div>
                    <div className="text-xs font-medium text-foreground/80 truncate">
                      {ws.lecturer_name}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    asChild
                    size="sm"
                    className="w-full h-9 text-[11px] font-semibold rounded-lg shadow-none justify-between px-4"
                  >
                    <Link href={`/student/courses/${ws.id}`}>
                      <div className="flex items-center gap-2">
                        <LayoutDashboard className="size-4" />
                        Enter Portal
                      </div>
                      <ArrowRight className="size-4 opacity-40" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-full h-9 text-[11px] font-semibold rounded-lg hover:bg-muted/50 justify-start px-4"
                  >
                    <Link
                      href="/student/assessments"
                      className="flex items-center gap-2"
                    >
                      <FileText className="size-4 text-muted-foreground" />
                      Evaluations
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
