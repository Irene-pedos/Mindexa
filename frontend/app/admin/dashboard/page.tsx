// app/admin/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardToolbar,
} from "@/components/ui/card-v2";
import { Badge } from "@/components/ui/badge-v2";
import { Button } from "@/components/ui/button-v2";
import { Users, BookOpen, Shield, Activity, AlertTriangle, MoreHorizontal, ArrowUp, ArrowDown, Settings, Pin, Share2, Trash, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { adminApi, AdminDashboardResponse } from "@/lib/api/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu-v2";

export default function AdminDashboard() {
  const [data, setData] = useState<AdminDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const dashboardData = await adminApi.getDashboard();
        setData(dashboardData);
      } catch (err) {
        console.error("Failed to load admin dashboard", err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const systemMetrics = [
    {
      title: "Total Students",
      value: (data?.summary.total_students as any)?.value ?? data?.summary.total_students ?? 0,
      delta: (data?.summary.total_students as any)?.delta ?? 0,
      positive: (data?.summary.total_students as any)?.positive ?? true,
      lastMonth: (data?.summary.total_students as any)?.last_month ?? 0,
      icon: Users,
    },
    {
      title: "Active Courses",
      value: (data?.summary.active_courses as any)?.value ?? data?.summary.active_courses ?? 0,
      delta: (data?.summary.active_courses as any)?.delta ?? 0,
      positive: (data?.summary.active_courses as any)?.positive ?? true,
      lastMonth: (data?.summary.active_courses as any)?.last_month ?? 0,
      icon: BookOpen,
    },
    {
      title: "Total Lecturers",
      value: (data?.summary.total_lecturers as any)?.value ?? data?.summary.total_lecturers ?? 0,
      delta: (data?.summary.total_lecturers as any)?.delta ?? 0,
      positive: (data?.summary.total_lecturers as any)?.positive ?? true,
      lastMonth: (data?.summary.total_lecturers as any)?.last_month ?? 0,
      icon: Users,
    },
    {
      title: "Flagged Events",
      value: (data?.summary.flagged_events_today as any)?.value ?? data?.summary.flagged_events_today ?? 0,
      delta: (data?.summary.flagged_events_today as any)?.delta ?? 0,
      positive: (data?.summary.flagged_events_today as any)?.positive ?? true,
      lastMonth: (data?.summary.flagged_events_today as any)?.last_month ?? 0,
      icon: AlertTriangle,
    },
  ];

  function formatNumber(n: number) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return n.toLocaleString();
    return n.toString();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Institutional Oversight
          </h1>
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Platform-wide visibility and control
          </p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {systemMetrics.map((stat, index) => (
          <Card key={index} className="rounded-xl">
            <CardHeader className="border-0 pb-1 pt-3 px-4">
              <CardTitle className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">{stat.title}</CardTitle>
              <CardToolbar>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="dim" size="sm" mode="icon" className="-me-1.5 opacity-40 hover:opacity-100">
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="bottom">
                    <DropdownMenuItem className="text-xs">
                      <Settings className="size-3.5" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs">
                      <Pin className="size-3.5" /> Pin to Top
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" className="text-xs">
                      <Trash className="size-3.5" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardToolbar>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-0 px-4 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-primary tracking-tight tabular-nums">
                  {formatNumber(stat.value)}
                </span>
                {stat.delta !== 0 && (
                  <Badge variant={stat.positive ? 'success' : 'destructive'} appearance="light" className="rounded-full h-4 px-1.5 text-[9px] font-bold">
                    {stat.delta > 0 ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />}
                    {Math.abs(stat.delta)}%
                  </Badge>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 border-t border-muted/20 pt-1.5 flex justify-between items-center uppercase font-bold tracking-wider">
                <span>Prev. Period</span>
                <span className="text-foreground">
                  {formatNumber(stat.lastMonth)}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Platform Activity Chart */}
        <div className="lg:col-span-7">
          <ChartAreaInteractive
            title="Platform Activity"
            description="Institutional oversight: Submissions and Security Alerts"
            data={data?.chart_data || []}
            config={{
              submissions: { label: "Submissions", color: "var(--primary)" },
              alerts: { label: "Security Alerts", color: "#ef4444" },
            }}
            areaKeys={[
              { key: "submissions", fill: "var(--primary)", stroke: "var(--primary)" },
              { key: "alerts", fill: "#ef4444", stroke: "#ef4444" },
            ]}
          />
        </div>

        {/* Quick Actions */}
        <Card className="lg:col-span-5 flex flex-col rounded-xl">
          <CardHeader className="border-b py-3 px-5 bg-muted/5">
            <CardTitle className="text-xs font-bold uppercase tracking-wider">Platform Management</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-3 grid grid-cols-2 gap-2">
            <Button
              asChild
              variant="secondary"
              className="h-full min-h-20 flex-col gap-1.5 justify-center rounded-xl text-xs"
            >
              <Link href="/admin/users">
                <Users className="size-4" />
                <span>Manage Users</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-full min-h-20 flex-col gap-1.5 justify-center rounded-xl text-xs"
            >
              <Link href="/admin/courses">
                <BookOpen className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Courses & Classes</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-full min-h-20 flex-col gap-1.5 justify-center rounded-xl text-xs"
            >
              <Link href="/admin/integrity">
                <AlertTriangle className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Integrity Logs</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-full min-h-20 flex-col gap-1.5 justify-center rounded-xl text-xs"
            >
              <Link href="/admin/analytics">
                <Activity className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Full Analytics</span>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Platform Activity */}
        <Card className="rounded-xl overflow-hidden">
          <CardHeader className="border-b py-3 px-5 bg-muted/5">
            <CardTitle className="text-xs font-bold uppercase tracking-wider">
              Recent Activity
            </CardTitle>
            <CardDescription className="text-[10px]">
              Last 24 hours across the institution
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-muted/30">
              {data?.recent_activity.length === 0 ? (
                <p className="text-xs text-muted-foreground p-6 text-center italic">
                  No recent activity recorded.
                </p>
              ) : (
                data?.recent_activity.map((activity, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3.5 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="size-8 rounded-full bg-primary/5 flex items-center justify-center shrink-0 border border-primary/10">
                        <Activity className="size-3.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                        <div className="font-semibold text-xs truncate">
                            {activity.action}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                            {activity.details}
                        </div>
                        </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground shrink-0 font-medium ml-4">
                      {activity.time}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* System Health */}
        <Card className="rounded-xl overflow-hidden">
          <CardHeader className="border-b py-3 px-5 bg-muted/5">
            <CardTitle className="text-xs font-bold uppercase tracking-wider">Infrastructure Status</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/5 border-muted/20">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "p-2 rounded-full",
                    data?.summary.system_status === "Healthy"
                      ? "bg-emerald-50"
                      : "bg-destructive/10",
                  )}
                >
                  <Shield
                    className={cn(
                      "size-4",
                      data?.summary.system_status === "Healthy"
                        ? "text-emerald-600"
                        : "text-destructive",
                    )}
                  />
                </div>
                <div>
                  <p className="font-bold text-xs">
                    Status: {data?.summary.system_status}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                    All services operational • Integrity Lock active
                  </p>
                </div>
              </div>
              <Badge
                variant={
                  data?.summary.system_status === "Healthy"
                    ? "success"
                    : "destructive"
                }
                appearance="light"
                className="rounded-full h-5 text-[9px] font-bold"
              >
                {data?.summary.system_status === "Healthy" ? "ONLINE" : "ISSUE"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
