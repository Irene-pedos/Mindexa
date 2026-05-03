// app/admin/dashboard/page.tsx
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
import { Users, BookOpen, Shield, Activity, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { adminApi, AdminDashboardResponse } from "@/lib/api/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
      label: "Total Students",
      value: data?.summary.total_students.toLocaleString() ?? "0",
      change: "",
      icon: Users,
    },
    {
      label: "Active Courses",
      value: data?.summary.active_courses.toLocaleString() ?? "0",
      change: "",
      icon: BookOpen,
    },
    {
      label: "Lecturers",
      value: data?.summary.total_lecturers.toLocaleString() ?? "0",
      change: "",
      icon: Users,
    },
    {
      label: "Flagged Events",
      value: data?.summary.flagged_events_today.toLocaleString() ?? "0",
      change: "Today",
      icon: AlertTriangle,
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Institutional Oversight
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Platform-wide visibility and control
          </p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {systemMetrics.map((m, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {m.label}
              </CardTitle>
              <m.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tracking-tight">
                {m.value}
              </div>
              {m.change && (
                <p className="text-xs text-muted-foreground mt-1">{m.change}</p>
              )}
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
        <Card className="lg:col-span-5 flex flex-col">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Platform Management</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-4 grid grid-cols-2 gap-3">
            <Button
              asChild
              variant="secondary"
              className="h-full min-h-24 flex-col gap-2 justify-center"
            >
              <Link href="/admin/users">
                <Users className="size-5" />
                <span>Manage Users</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-full min-h-24 flex-col gap-2 justify-center"
            >
              <Link href="/admin/courses">
                <BookOpen className="size-5 text-muted-foreground" />
                <span className="text-muted-foreground">Courses & Classes</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-full min-h-24 flex-col gap-2 justify-center"
            >
              <Link href="/admin/integrity">
                <AlertTriangle className="size-5 text-muted-foreground" />
                <span className="text-muted-foreground">Integrity Logs</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-full min-h-24 flex-col gap-2 justify-center"
            >
              <Link href="/admin/analytics">
                <Activity className="size-5 text-muted-foreground" />
                <span className="text-muted-foreground">Full Analytics</span>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Platform Activity */}
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">
              Recent Platform Activity
            </CardTitle>
            <CardDescription className="text-xs">
              Last 24 hours across the institution
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {data?.recent_activity.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6 text-center">
                  No recent activity recorded.
                </p>
              ) : (
                data?.recent_activity.map((activity, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="size-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                      <Activity className="size-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {activity.action}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {activity.details}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {activity.time}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">System Health</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "p-2 rounded-full",
                    data?.summary.system_status === "Healthy"
                      ? "bg-primary/10"
                      : "bg-destructive/10",
                  )}
                >
                  <Shield
                    className={cn(
                      "size-5",
                      data?.summary.system_status === "Healthy"
                        ? "text-primary"
                        : "text-destructive",
                    )}
                  />
                </div>
                <div>
                  <p className="font-medium text-sm">
                    Status: {data?.summary.system_status}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    All services operational • Zero critical alerts
                  </p>
                </div>
              </div>
              <Badge
                variant={
                  data?.summary.system_status === "Healthy"
                    ? "secondary"
                    : "destructive"
                }
              >
                {data?.summary.system_status === "Healthy" ? "Online" : "Issue"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
