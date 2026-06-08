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
  BarChart3,
  Clock,
  LayoutDashboard,
  FileText,
  ArrowRight,
  GraduationCap
} from "lucide-react";
import Link from "next/link";
import {
  studentApi,
  StudentCourseListItem,
  StudentDashboardResponse,
} from "@/lib/api/student";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
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
      <div className="space-y-3 max-w-7xl mx-auto p-4">
        <Skeleton variant="title" className="h-6 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="media" className="h-14 w-full rounded-md" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="media" className="h-36 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const metrics = [
    { label: "Enrolled", value: workspaces.length, icon: GraduationCap, color: "text-primary" },
    { label: "Progression", value: `${avgProgress}%`, icon: BarChart3, color: "text-emerald-600" },
    { label: "Pending", value: dashboardData?.summary.active_assessments_count.value ?? 0, icon: Clock, color: "text-amber-600" },
    { label: "CGPA Index", value: (dashboardData?.summary.cgpa.value ?? 0).toFixed(2), icon: Award, color: "text-primary" },
  ];

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-4 pb-8">
      {/* Precision Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-3">
        <div className="space-y-0.5">
          <h1 className="text-lg font-bold tracking-tight text-foreground/90 uppercase">Modules</h1>
          <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Academic progression ledger.</p>
        </div>
        <Button variant="outline" size="sm" className="h-7 px-3 text-[10px] font-bold uppercase border-border/60" asChild>
          <Link href="/student/schedule">
            <Calendar className="mr-1.5 size-3 text-primary/70" /> Schedule
          </Link>
        </Button>
      </div>

      {/* Metrics - Ultra Compact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {metrics.map((stat, i) => (
          <div key={i} className="p-2.5 px-3 rounded-lg border border-border/50 bg-muted/5 flex items-center justify-between group hover:border-primary/20 transition-all">
            <div className="space-y-0">
              <p className="text-[9px] font-bold uppercase text-muted-foreground/60">{stat.label}</p>
              <p className={cn("text-base font-bold tabular-nums tracking-tighter", stat.color)}>{stat.value}</p>
            </div>
            <stat.icon className="size-3.5 opacity-20" />
          </div>
        ))}
      </div>

      {/* Modules Grid - High Density Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {workspaces.length === 0 ? (
          <div className="col-span-full py-16 text-center border border-dashed rounded-lg bg-muted/5 border-border/40">
            <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Registry Empty</p>
          </div>
        ) : (
          workspaces.map((ws) => (
            <Card key={ws.id} className="shadow-none border border-border/60 hover:border-primary/30 transition-all bg-card/50 rounded-lg overflow-hidden">
              <CardHeader className="p-3 border-b border-border/40 bg-muted/5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-bold truncate uppercase text-foreground/80">{ws.title}</CardTitle>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="h-3.5 px-1 text-[8px] font-bold bg-primary/5 border-primary/20 text-primary/70 uppercase rounded-sm">{ws.code}</Badge>
                      <span className="text-[9px] font-bold text-muted-foreground/50 uppercase">{ws.academic_year || "GLOBAL"}</span>
                    </div>
                  </div>
                  <BookOpen className="size-3.5 text-primary/40 shrink-0 mt-0.5" />
                </div>
              </CardHeader>

              <CardContent className="p-3 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-end text-[9px] font-bold uppercase tracking-tight">
                    <span className="text-muted-foreground/60">Module Saturation</span>
                    <span className="text-foreground/70">{ws.progress}%</span>
                  </div>
                  <div className="h-1 bg-muted/60 rounded-full overflow-hidden">
                    <div className="h-full bg-primary/60 transition-all duration-700" style={{ width: `${ws.progress}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/10">
                  <div className="min-w-0">
                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tighter opacity-60">Instructor</p>
                    <p className="text-[10px] font-semibold text-foreground/70 truncate">{ws.lecturer_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tighter opacity-60">Status</p>
                    <p className="text-[9px] font-bold text-emerald-600 uppercase">Operational</p>
                  </div>
                </div>

                <div className="flex gap-1.5 pt-1">
                  <Button asChild size="sm" className="flex-1 h-7 text-[10px] font-bold uppercase rounded-md bg-primary hover:bg-primary/90 shadow-none">
                    <Link href={`/student/courses/${ws.id}`}>Enter Portal</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md border-border/60 hover:bg-muted/50">
                    <Link href="/student/assessments" title="Evaluations"><FileText className="size-3 text-muted-foreground" /></Link>
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
