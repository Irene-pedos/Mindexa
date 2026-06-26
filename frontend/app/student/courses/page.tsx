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
import { Progress } from "@/components/ui/progress";
import {
  BookOpen,
  Calendar,
  Award,
  BarChart3,
  Clock,
  FileText,
  GraduationCap
} from "lucide-react";
import Link from "next/link";
import {
  studentApi,
  StudentCourseListItem,
  StudentDashboardResponse,
} from "@/lib/api/student";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 opacity-60" />
          </div>
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const metrics = [
    { label: "Enrolled Courses", value: workspaces.length, icon: GraduationCap, color: "text-primary" },
    { label: "Average Progress", value: `${avgProgress}%`, icon: BarChart3, color: "text-emerald-600" },
    { label: "Pending Assessments", value: dashboardData?.summary.active_assessments_count.value ?? 0, icon: Clock, color: "text-amber-600" },
    { label: "Current CGPA", value: (dashboardData?.summary.cgpa.value ?? 0).toFixed(2), icon: Award, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Courses</h1>
          <p className="text-muted-foreground mt-1">Overview of your enrolled academic modules and study progress</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/student/schedule">
            <Calendar className="mr-2 size-4 text-muted-foreground" /> View Schedule
          </Link>
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((stat, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", stat.color)}>{stat.value}</p>
              </div>
              <stat.icon className="size-5 text-muted-foreground opacity-70" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workspaces.length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed rounded-xl">
            <BookOpen className="size-12 text-muted-foreground mx-auto mb-4 opacity-20" />
            <p className="text-muted-foreground">No enrolled courses found.</p>
          </div>
        ) : (
          workspaces.map((ws) => (
            <Card key={ws.id} className="flex flex-col hover:bg-muted/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <CardTitle className="text-base font-semibold truncate">{ws.title}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] font-medium px-1.5 h-5">{ws.code}</Badge>
                      <span className="text-xs text-muted-foreground">{ws.academic_year || "Global"}</span>
                    </div>
                  </div>
                  <BookOpen className="size-5 text-muted-foreground opacity-60 shrink-0 mt-0.5" />
                </div>
              </CardHeader>

              <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>Course Progress</span>
                    <span className="font-semibold text-foreground">{ws.progress}%</span>
                  </div>
                  <Progress value={ws.progress} className="h-1.5" />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs">
                  <div>
                    <p className="text-muted-foreground">Instructor</p>
                    <p className="font-medium truncate">{ws.lecturer_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground">Status</p>
                    <p className={`font-medium ${
                      ws.status === 'ACTIVE' ? 'text-emerald-600' :
                      ws.status === 'COMPLETED' ? 'text-blue-600' :
                      'text-muted-foreground'
                    }`}>
                      {ws.status === 'ACTIVE' ? 'Active' : ws.status === 'COMPLETED' ? 'Completed' : ws.status || 'Active'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 mt-auto">
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/student/courses/${ws.id}`}>View Course</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="w-9 h-9 p-0">
                    <Link href="/student/assessments" title="Assessments">
                      <FileText className="size-4 text-muted-foreground" />
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
