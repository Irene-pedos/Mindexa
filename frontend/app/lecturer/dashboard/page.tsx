// app/lecturer/dashboard/page.tsx
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
import {
  AlertTriangle,
  Users,
  Clock,
  CheckCircle,
  Eye,
  Plus,
  ArrowRight,
  BookOpen,
  GraduationCap,
  BrainCircuit,
  ShieldCheck,
  ChevronRight,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
  Settings,
  Pin,
  Share2,
  Trash,
  TriangleAlert,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { lecturerApi, LecturerDashboardResponse } from "@/lib/api/lecturer";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu-v2";

export default function LecturerDashboard() {
  const [data, setData] = useState<LecturerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const dashboardData = await lecturerApi.getDashboard();
        setData(dashboardData);
      } catch (err) {
        console.error("Failed to load lecturer dashboard", err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const metrics = [
    {
      title: "Active Classes",
      value:
        (data?.summary.active_classes_count as any)?.value ??
        data?.summary.active_classes_count ??
        0,
      delta: (data?.summary.active_classes_count as any)?.delta ?? 0,
      positive: (data?.summary.active_classes_count as any)?.positive ?? true,
      lastMonth: (data?.summary.active_classes_count as any)?.last_month ?? 0,
      icon: Users,
    },
    {
      title: "Assessments",
      value:
        (data?.summary.upcoming_assessments_count as any)?.value ??
        data?.summary.upcoming_assessments_count ??
        0,
      delta: (data?.summary.upcoming_assessments_count as any)?.delta ?? 0,
      positive:
        (data?.summary.upcoming_assessments_count as any)?.positive ?? true,
      lastMonth:
        (data?.summary.upcoming_assessments_count as any)?.last_month ?? 0,
      icon: Clock,
    },
    {
      title: "Pending Grading",
      value:
        (data?.summary.pending_grading_count as any)?.value ??
        data?.summary.pending_grading_count ??
        0,
      delta: (data?.summary.pending_grading_count as any)?.delta ?? 0,
      positive: (data?.summary.pending_grading_count as any)?.positive ?? true,
      lastMonth: (data?.summary.pending_grading_count as any)?.last_month ?? 0,
      icon: CheckCircle,
    },
    {
      title: "Integrity Flags",
      value:
        (data?.summary.flagged_events_count as any)?.value ??
        data?.summary.flagged_events_count ??
        0,
      delta: (data?.summary.flagged_events_count as any)?.delta ?? 0,
      positive: (data?.summary.flagged_events_count as any)?.positive ?? true,
      lastMonth: (data?.summary.flagged_events_count as any)?.last_month ?? 0,
      icon: AlertTriangle,
    },
  ];

  function formatNumber(n: number) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return n.toLocaleString();
    return n.toString();
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto p-4">
        <div className="space-y-1">
          <Skeleton variant="title" className="h-8 w-48" />
          <Skeleton variant="title" className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton variant="media" className="h-[350px] w-full" />
      </div>
    );
  }

  return (
    <div data-tour="lecturer-dashboard" className="space-y-8 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Lecturer Command Center
          </h1>
          <p className="text-muted-foreground text-[13px]">
            Institutional Oversight • Professional Analytics
          </p>
        </div>
      </div>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((stat, index) => (
          <Card key={index} className="rounded-xl shadow-none">
            <CardHeader className="border-0 pb-1 pt-3 px-4">
              <CardTitle className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">
                {stat.title}
              </CardTitle>
              <CardToolbar>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="dim"
                      size="sm"
                      mode="icon"
                      className="-me-1.5 opacity-40 hover:opacity-100"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="bottom">
                    <DropdownMenuItem className="text-xs">
                      <Settings className="size-3.5" />
                      View Analytics
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs">
                      <Pin className="size-3.5" /> Pin to Home
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" className="text-xs">
                      <Trash className="size-3.5" />
                      Dismiss
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
                  <Badge
                    variant={stat.positive ? "success" : "destructive"}
                    appearance="light"
                    className="rounded-full h-4 px-1.5 text-[9px] font-bold"
                  >
                    {stat.delta > 0 ? (
                      <ArrowUp className="size-2.5" />
                    ) : (
                      <ArrowDown className="size-2.5" />
                    )}
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
        {/* Quick Registry Links */}
        <Card className="lg:col-span-4 shadow-none border rounded-xl overflow-hidden">
          <CardHeader className="py-3 px-5 border-b bg-muted/5">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Workflow Shortcuts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-1.5">
            {[
              {
                label: "Draft Assessment",
                href: "/lecturer/assessments/new",
                icon: Plus,
                variant: "primary" as const,
              },
              {
                label: "Manage Registry",
                href: "/lecturer/assessments",
                icon: BookOpen,
                variant: "outline" as const,
              },
              {
                label: "Question Bank",
                href: "/lecturer/question-bank",
                icon: GraduationCap,
                variant: "outline" as const,
              },
              {
                label: "Grading Desk",
                href: "/lecturer/grading",
                icon: CheckCircle,
                variant: "outline" as const,
              },
              {
                label: "AI Faculty Assistant",
                href: "/lecturer/ai-assistant",
                icon: BrainCircuit,
                variant: "outline" as const,
              },
              {
                label: "Live Supervision",
                href: "/lecturer/supervision",
                icon: ShieldCheck,
                variant: "outline" as const,
              },
            ].map((action, idx) => (
              <Button
                key={idx}
                asChild
                variant={action.variant}
                size="sm"
                className="w-full justify-between h-9 px-4 text-xs font-semibold rounded-lg"
              >
                <Link href={action.href}>
                  <div className="flex items-center gap-2">
                    <action.icon className="size-3.5" />
                    {action.label}
                  </div>
                  <ChevronRight className="size-3 opacity-30" />
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>

        {/* Analytics Chart */}
        <div className="lg:col-span-8">
          <ChartAreaInteractive
            title="Institutional Activity"
            description="Submission volume and automated review distribution"
            data={data?.chart_data || []}
            config={{
              manual: { label: "Standard", color: "var(--primary)" },
              ai: { label: "AI Processed", color: "#8b5cf6" },
            }}
            areaKeys={[
              {
                key: "manual",
                fill: "var(--primary)",
                stroke: "var(--primary)",
              },
              { key: "ai", fill: "#8b5cf6", stroke: "#8b5cf6" },
            ]}
          />
        </div>
      </div>

      {/* Active Workspaces Section (Moved below Shortcuts/Chart) */}
      <div className="space-y-4 px-1">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Active Teaching Workspaces
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] font-bold uppercase tracking-wider text-primary"
            asChild
          >
            <Link href="/lecturer/courses">View All Workspaces</Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(data as any)?.workspaces?.length === 0 ? (
            <Card className="col-span-full border-dashed bg-muted/5 py-12">
              <CardContent className="text-center">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                  No operational workspaces initialized.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 h-8 text-[10px] font-bold uppercase"
                  asChild
                >
                  <Link href="/lecturer/courses/new">Open Registry</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            (data as any)?.workspaces?.slice(0, 3).map((ws: any) => (
              <Card
                key={ws.id}
                className="shadow-none border rounded-xl overflow-hidden group hover:border-primary/20 transition-all"
              >
                <CardHeader className="pb-3 pt-4 px-5">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-bold truncate group-hover:text-primary transition-colors uppercase tracking-tight">
                        {ws.title}
                      </CardTitle>
                      <CardDescription className="text-[10px] font-mono mt-0.5 opacity-60">
                        {ws.code} • {ws.academic_year}
                      </CardDescription>
                    </div>
                    <Badge
                      appearance="light"
                      className="h-4.5 px-1.5 text-[9px] font-bold uppercase rounded-full"
                    >
                      {ws.class_name}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-4 space-y-4">
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase text-muted-foreground/80 tracking-tight">
                    <span className="flex items-center gap-1.5">
                      <Users className="size-3" /> Students
                    </span>
                    <span className="text-foreground tabular-nums">
                      {ws.student_count}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] font-bold uppercase tracking-tighter text-muted-foreground/60">
                      <span>Class Average</span>
                      <span>{ws.performance_avg}%</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${ws.performance_avg}%` }}
                      />
                    </div>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    className="w-full h-8 text-[10px] font-bold uppercase tracking-wider rounded-lg"
                  >
                    <Link href={`/lecturer/courses/${ws.id}`}>
                      Manage Workspace
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Pending Audit Queue */}
        <Card className="lg:col-span-4 shadow-none border rounded-xl overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between py-3 px-5 border-b bg-muted/5">
            <div>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Audit Queue
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] font-bold uppercase rounded-full"
              asChild
            >
              <Link href="/lecturer/grading">Detailed View</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-3">
            <div className="space-y-1.5">
              {data?.pending_queue.length === 0 ? (
                <div className="py-10 text-center border border-dashed rounded-xl bg-muted/5">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-tight">
                    Registry clear. No items pending.
                  </p>
                </div>
              ) : (
                data?.pending_queue.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-xl border p-3 hover:bg-muted/30 transition-all group"
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="font-semibold text-xs truncate text-foreground/90">
                        {item.assessment_title}
                      </div>
                      <div className="text-[9px] text-muted-foreground font-bold uppercase mt-0.5 tracking-tight">
                        {item.type}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          item.urgency === "high" ? "destructive" : "secondary"
                        }
                        appearance="light"
                        className="text-[9px] h-4 px-1.5 font-bold uppercase tracking-tight rounded-full"
                      >
                        {item.count} items
                      </Badge>
                      <Button
                        size="sm"
                        className="h-7 px-3 text-[10px] font-bold uppercase rounded-full shadow-sm"
                        asChild
                      >
                        <Link href="/lecturer/grading">Audit</Link>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Integrity Monitor */}
        <Card className="lg:col-span-4 shadow-none border rounded-xl overflow-hidden">
          <CardHeader className="py-3 px-5 border-b bg-muted/5">
            <CardTitle className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Eye className="size-3.5 text-primary" /> Integrity Watch
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="space-y-2">
              {data?.recent_alerts.length === 0 ? (
                <div className="py-10 text-center border border-dashed rounded-xl bg-muted/5">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-tight">
                    No violations reported in 24h.
                  </p>
                </div>
              ) : (
                data?.recent_alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={cn(
                      "rounded-xl border p-3 transition-all",
                      alert.severity === "high"
                        ? "bg-red-50/30 border-red-100"
                        : "bg-muted/30 border-transparent",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        className={cn(
                          "size-3.5 mt-0.5",
                          alert.severity === "high"
                            ? "text-red-600"
                            : "text-amber-600",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[11px] truncate text-foreground/90 uppercase tracking-tight">
                          {alert.student_name}
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-0.5 font-medium italic">
                          {alert.event_type.replace(/_/g, " ")} detected.
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="text-[9px] font-bold bg-background border px-1.5 py-0.5 rounded-full uppercase text-muted-foreground">
                            Risk {alert.risk_score}%
                          </div>
                          <span className="text-[9px] text-muted-foreground font-medium">
                            {new Date(alert.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 rounded-full hover:bg-background"
                        asChild
                      >
                        <Link href="/lecturer/supervision">
                          <ArrowRight className="size-3" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Registry Log */}
        <Card className="lg:col-span-4 shadow-none border rounded-xl overflow-hidden">
          <CardHeader className="py-3 px-5 border-b bg-muted/5">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Historical Submissions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-muted/30">
              {data?.recent_submissions.length === 0 ? (
                <p className="text-xs text-muted-foreground p-10 text-center font-medium italic">
                  Log currently empty.
                </p>
              ) : (
                data?.recent_submissions.map((sub, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-foreground/90 uppercase tracking-tight">
                        {sub.student_name}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 font-medium line-clamp-1 italic">
                        Finalized: {sub.assessment_title}
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-4">
                      <Badge
                        variant="outline"
                        className="text-[9px] font-bold uppercase tracking-wider h-4.5 px-2 rounded-full"
                      >
                        {sub.status}
                      </Badge>
                      <div className="text-[9px] text-muted-foreground font-bold tabular-nums">
                        {new Date(sub.submitted_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
