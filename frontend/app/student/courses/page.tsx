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
      <div className="space-y-6 w-full mx-auto animate-in fade-in duration-300">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 opacity-60" />
          </div>
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 w-full mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/25 pb-3">
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <GraduationCap className="size-4.5 text-primary" /> My Enrolled Courses
          </h1>
          <p className="text-xs text-muted-foreground font-medium">Overview of your enrolled academic modules and study progress</p>
        </div>
        <Button variant="outline" size="sm" asChild className="h-8.5 px-3.5 rounded-lg border-border/60 text-xs font-semibold">
          <Link href="/student/schedule">
            <Calendar className="mr-1.5 size-3.5 text-muted-foreground" /> View Schedule
          </Link>
        </Button>
      </div>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workspaces.length === 0 ? (
          <div className="col-span-full py-16 text-center border-2 border-dashed rounded-xl bg-muted/5 border-border/30">
            <BookOpen className="size-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-xs font-semibold text-muted-foreground">No enrolled courses found.</p>
          </div>
        ) : (
          workspaces.map((ws) => (
            <Card key={ws.id} className="flex flex-col bg-card hover:border-primary/20 shadow-xs transition-all duration-200 rounded-xl border border-border/60 overflow-hidden">
              <CardHeader className="pb-1.5 pt-3.5 px-4">
                <div className="flex items-start justify-between gap-3 min-w-0 w-full">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <CardTitle className="text-base font-semibold block truncate text-foreground w-full" title={ws.title}>
                      {ws.title}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] font-semibold px-1.5 h-5">{ws.code}</Badge>
                      <span className="text-xs text-muted-foreground font-medium">{ws.academic_year || "Global"}</span>
                    </div>
                  </div>
                  <BookOpen className="size-5 text-muted-foreground opacity-60 shrink-0 mt-0.5" />
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pb-3.5 px-4 flex-1 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs text-muted-foreground font-medium">
                    <span>Course Progress</span>
                    <span className="font-semibold text-foreground">{ws.progress}%</span>
                  </div>
                  <Progress value={ws.progress} className="h-1.5" />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40 text-xs font-medium">
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Instructor</p>
                    <p className="font-medium text-foreground/80 truncate mt-0.5" title={ws.lecturer_name}>{ws.lecturer_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Status</p>
                    <p className={cn(
                      "font-semibold mt-0.5",
                      ws.status === 'ACTIVE' ? 'text-success' :
                      ws.status === 'COMPLETED' ? 'text-primary' :
                      'text-muted-foreground'
                    )}>
                      {ws.status === 'ACTIVE' ? 'Active' : ws.status === 'COMPLETED' ? 'Completed' : ws.status || 'Active'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 mt-auto">
                  <Button asChild size="sm" className="flex-1 h-8 text-xs font-semibold rounded-lg shadow-none">
                    <Link href={`/student/courses/${ws.id}`}>View Course</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="w-8 h-8 p-0 rounded-lg border-border/60">
                    <Link href="/student/assessments" title="Assessments">
                      <FileText className="size-3.5 text-muted-foreground" />
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
