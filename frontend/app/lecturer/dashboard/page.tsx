// app/lecturer/dashboard/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Clock,
  CheckCircle,
  CheckCircle2,
  Eye,
  Plus,
  ArrowRight,
  BookOpen,
  GraduationCap,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Layers,
  School,
  BarChart3,
  Inbox,
  History,
  FileText,
  ArrowUpRight,
  Shield,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import {
  lecturerApi,
  LecturerDashboardResponse,
  WorkspaceListItem,
} from "@/lib/api/lecturer";
import { cn } from "@/lib/utils";

export default function LecturerDashboard() {
  const [data, setData] = useState<LecturerDashboardResponse | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [dashboardData, workspacesData] = await Promise.all([
        lecturerApi.getDashboard().catch(() => null),
        lecturerApi.getWorkspaces(1, 8).catch(() => []),
      ]);

      if (dashboardData) setData(dashboardData);
      if (Array.isArray(workspacesData)) setWorkspaces(workspacesData);
    } catch (err) {
      console.error("Failed to load lecturer dashboard", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  function formatNumber(n: number) {
    if (!n || isNaN(n)) return "0";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return n.toLocaleString();
    return n.toString();
  }

  const activeClassesVal =
    (data?.summary.active_classes_count as any)?.value ??
    (typeof data?.summary.active_classes_count === "number"
      ? data.summary.active_classes_count
      : workspaces.length);

  const upcomingAssessmentsVal =
    (data?.summary.upcoming_assessments_count as any)?.value ??
    (typeof data?.summary.upcoming_assessments_count === "number"
      ? data.summary.upcoming_assessments_count
      : 0);

  const pendingGradingVal =
    (data?.summary.pending_grading_count as any)?.value ??
    (typeof data?.summary.pending_grading_count === "number"
      ? data.summary.pending_grading_count
      : 0);

  const flaggedEventsVal =
    (data?.summary.flagged_events_count as any)?.value ??
    (typeof data?.summary.flagged_events_count === "number"
      ? data.summary.flagged_events_count
      : 0);

  const metrics = [
    {
      title: "Active Workspaces",
      value: activeClassesVal,
      delta: (data?.summary.active_classes_count as any)?.delta ?? 0,
      positive: (data?.summary.active_classes_count as any)?.positive ?? true,
      lastMonth: (data?.summary.active_classes_count as any)?.last_month ?? 0,
      icon: School,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-500/10 border-blue-500/20",
      href: "/lecturer/courses",
      actionText: "Manage Courses",
    },
    {
      title: "Active Assessments",
      value: upcomingAssessmentsVal,
      delta: (data?.summary.upcoming_assessments_count as any)?.delta ?? 0,
      positive: (data?.summary.upcoming_assessments_count as any)?.positive ?? true,
      lastMonth: (data?.summary.upcoming_assessments_count as any)?.last_month ?? 0,
      icon: BookOpen,
      color: "text-violet-600 dark:text-violet-400",
      bgColor: "bg-violet-500/10 border-violet-500/20",
      href: "/lecturer/assessments",
      actionText: "Registry Hub",
    },
    {
      title: "Pending Review Queue",
      value: pendingGradingVal,
      delta: (data?.summary.pending_grading_count as any)?.delta ?? 0,
      positive: pendingGradingVal === 0,
      lastMonth: (data?.summary.pending_grading_count as any)?.last_month ?? 0,
      icon: CheckCircle2,
      color: pendingGradingVal > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
      bgColor: pendingGradingVal > 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20",
      href: "/lecturer/grading",
      actionText: pendingGradingVal > 0 ? "Open SpeedGrader" : "Queue Clean",
    },
    {
      title: "Integrity Telemetry (24h)",
      value: flaggedEventsVal,
      delta: (data?.summary.flagged_events_count as any)?.delta ?? 0,
      positive: flaggedEventsVal === 0,
      lastMonth: (data?.summary.flagged_events_count as any)?.last_month ?? 0,
      icon: ShieldAlert,
      color: flaggedEventsVal > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
      bgColor: flaggedEventsVal > 0 ? "bg-rose-500/10 border-rose-500/20" : "bg-emerald-500/10 border-emerald-500/20",
      href: "/lecturer/supervision",
      actionText: flaggedEventsVal > 0 ? "Review Alerts" : "Secure Status",
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6 w-full max-w-full 2xl:max-w-[1800px] mx-auto min-w-0 p-1 sm:p-2 transition-all duration-300 font-sans">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
          <div className="space-y-1">
            <Skeleton className="h-8 w-60 rounded-xl" />
            <Skeleton className="h-4 w-96 rounded-xl" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-36 rounded-xl" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          <Skeleton className="lg:col-span-4 xl:col-span-3 h-80 rounded-2xl" />
          <Skeleton className="lg:col-span-8 xl:col-span-9 h-80 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const pendingQueue = Array.isArray(data?.pending_queue) ? data.pending_queue : [];
  const recentAlerts = Array.isArray(data?.recent_alerts) ? data.recent_alerts : [];
  const recentSubmissions = Array.isArray(data?.recent_submissions) ? data.recent_submissions : [];
  const chartData = Array.isArray(data?.chart_data) ? data.chart_data : [];
  const activeWorkspacesList = workspaces.length > 0 ? workspaces : ((data as any)?.workspaces || []);

  const totalSubmissionsInChart = chartData.reduce(
    (acc, curr) => acc + (curr.manual || 0) + (curr.ai || 0),
    0,
  );

  return (
    <div
      data-tour="lecturer-dashboard"
      className="space-y-6 sm:space-y-8 w-full max-w-full 2xl:max-w-[1800px] mx-auto min-w-0 pb-12 transition-all duration-300 font-sans"
    >
      {/* Header & Global Control Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Lecturer Command Center
            </h1>
            <Badge
              variant="outline"
              className="text-[10px] font-mono font-medium bg-primary/5 text-primary border-primary/20 rounded-full h-5 px-2"
            >
              Academic Term 2025/2026
            </Badge>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              Telemetry Live
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground font-normal">
            Institutional oversight, real-time assessment workflows, and AI grading operations.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => loadDashboard(true)}
            className="h-8 px-3 text-xs font-medium rounded-xl border-border/60 hover:bg-muted/50 gap-1.5 shadow-2xs"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin text-primary")} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>
          <Button
            size="sm"
            asChild
            className="h-8 px-3.5 text-xs font-semibold rounded-xl shadow-2xs bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
          >
            <Link href="/lecturer/assessments/new">
              <Plus className="size-3.5" />
              <span>Create Assessment</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Metrics Overview Grid */}
      <div
        data-tour="lecturer-dashboard-metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4"
      >
        {metrics.map((stat, index) => {
          const IconComponent = stat.icon;
          return (
            <Card
              key={index}
              className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xs shadow-2xs hover:border-primary/30 transition-all duration-200 overflow-hidden flex flex-col justify-between"
            >
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between border-none">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {stat.title}
                </span>
                <div
                  className={cn(
                    "size-8 rounded-xl flex items-center justify-center border",
                    stat.bgColor,
                    stat.color,
                  )}
                >
                  <IconComponent className="size-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
                    {formatNumber(stat.value)}
                  </span>
                  {stat.delta !== 0 ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full h-5 px-1.5 text-[10px] font-medium font-mono gap-0.5",
                        stat.positive
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-600 border-rose-500/20",
                      )}
                    >
                      {stat.delta > 0 ? (
                        <ArrowUp className="size-2.5" />
                      ) : (
                        <ArrowDown className="size-2.5" />
                      )}
                      {Math.abs(stat.delta)}%
                    </Badge>
                  ) : (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      Current
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground font-normal">
                    {stat.lastMonth > 0 ? `Prev: ${formatNumber(stat.lastMonth)}` : "Live Status"}
                  </span>
                  <Link
                    href={stat.href}
                    className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-0.5"
                  >
                    <span>{stat.actionText}</span>
                    <ChevronRight className="size-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Middle Grid: Workflow Shortcuts + Interactive Institutional Activity Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Quick Registry Links (Workflow Shortcuts - preserved) */}
        <Card className="lg:col-span-4 xl:col-span-3 border border-border/50 bg-card/60 backdrop-blur-xs shadow-2xs rounded-2xl overflow-hidden flex flex-col justify-between">
          <CardHeader className="py-3.5 px-4 sm:px-5 border-b border-border/30 bg-muted/10">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Sparkles className="size-3.5 text-primary" />
              Workflow Shortcuts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2 flex-1 flex flex-col justify-between">
            {[
              {
                label: "Draft Assessment",
                href: "/lecturer/assessments/new",
                icon: Plus,
                variant: "default" as const,
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
                icon: Sparkles,
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
                className="w-full justify-between h-9 px-3.5 text-xs font-semibold rounded-xl"
              >
                <Link href={action.href}>
                  <div className="flex items-center gap-2">
                    <action.icon className="size-3.5" />
                    {action.label}
                  </div>
                  <ChevronRight className="size-3 opacity-40" />
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>

        {/* Analytics Chart */}
        <div className="lg:col-span-8 xl:col-span-9 min-w-0">
          {chartData.length === 0 || totalSubmissionsInChart === 0 ? (
            <Card className="border border-border/50 bg-card/60 backdrop-blur-xs shadow-2xs rounded-2xl p-6 h-full flex flex-col items-center justify-center text-center">
              <div className="size-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3">
                <BarChart3 className="size-6" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                No Submission Activity Recorded (30 Days)
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Visual telemetry and AI-assisted grading volume will automatically chart here once students submit attempts.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 h-8 text-xs font-medium rounded-xl"
                asChild
              >
                <Link href="/lecturer/assessments/new">
                  <Plus className="size-3 mr-1" /> Launch New Assessment
                </Link>
              </Button>
            </Card>
          ) : (
            <ChartAreaInteractive
              title="Institutional Activity & Grading Volume"
              description="Daily submission distribution and AI-assisted automated review volume"
              data={chartData}
              config={{
                manual: { label: "Manual Review", color: "var(--primary)" },
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
          )}
        </div>
      </div>

      {/* Active Teaching Workspaces Section */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <School className="size-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Active Teaching Workspaces
            </h2>
            {activeWorkspacesList.length > 0 && (
              <Badge
                variant="secondary"
                className="text-[10px] font-mono font-medium h-4.5 px-2 rounded-full"
              >
                {activeWorkspacesList.length}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs font-semibold text-primary hover:text-primary/80 gap-1"
            asChild
          >
            <Link href="/lecturer/courses">
              <span>View All Workspaces</span>
              <ChevronRight className="size-3.5" />
            </Link>
          </Button>
        </div>

        {activeWorkspacesList.length === 0 ? (
          <Card className="border border-dashed border-border/60 bg-card/40 backdrop-blur-xs rounded-2xl py-12 px-4 text-center">
            <CardContent className="space-y-3 max-w-md mx-auto p-0">
              <div className="size-12 rounded-2xl bg-muted/40 border border-border/50 flex items-center justify-center mx-auto text-muted-foreground">
                <Layers className="size-6 text-muted-foreground/60" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  No Active Teaching Workspaces
                </h3>
                <p className="text-xs text-muted-foreground font-normal">
                  You do not have any operational course workspaces configured for this term.
                </p>
              </div>
              <Button
                size="sm"
                className="h-8 px-4 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shadow-2xs mt-2"
                asChild
              >
                <Link href="/lecturer/courses/new">
                  <Plus className="size-3.5" /> Initialize Workspace
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
            {activeWorkspacesList.slice(0, 4).map((ws: any) => (
              <Card
                key={ws.id}
                className="border border-border/50 bg-card/60 backdrop-blur-xs shadow-2xs hover:border-primary/30 transition-all rounded-2xl overflow-hidden flex flex-col justify-between group"
              >
                <CardHeader className="pb-2.5 px-4 pt-3.5 border-b border-border/30 bg-muted/10">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-xs sm:text-sm font-bold truncate group-hover:text-primary transition-colors text-foreground">
                        {ws.title}
                      </CardTitle>
                      <div className="flex items-center gap-1.5 mt-1 font-mono text-[9px] font-medium text-muted-foreground">
                        <Badge
                          variant="outline"
                          className="h-4 px-1.5 text-[9px] font-mono font-semibold bg-primary/5 border-primary/20 text-primary"
                        >
                          {ws.code || "N/A"}
                        </Badge>
                        <span>•</span>
                        <span className="truncate">{ws.academic_year || "Term"}</span>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="h-4.5 px-2 text-[9px] font-medium uppercase rounded-full shrink-0 bg-primary/5 text-primary border-primary/20"
                    >
                      {ws.class_name || "Section"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[11px]">
                        <Users className="size-3.5 text-muted-foreground/70" />
                        <span>Enrolled Students</span>
                      </span>
                      <span className="font-mono font-bold text-foreground">
                        {ws.student_count ?? 0}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-medium">
                        <span>Class Average</span>
                        <span
                          className={cn(
                            "font-mono font-bold",
                            (ws.performance_avg ?? 0) >= 50
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400",
                          )}
                        >
                          {ws.performance_avg ?? 0}%
                        </span>
                      </div>
                      <Progress
                        value={ws.performance_avg ?? 0}
                        className="h-1 bg-muted/60"
                      />
                    </div>
                  </div>

                  <Button
                    asChild
                    size="sm"
                    className="w-full h-8 text-xs font-semibold rounded-xl bg-muted/50 hover:bg-primary hover:text-primary-foreground text-foreground transition-colors border border-border/50 gap-1"
                  >
                    <Link href={`/lecturer/courses/${ws.id}`}>
                      <span>Manage Workspace</span>
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Row: Audit Queue + Integrity Watch + Historical Submissions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Card 1: Grading Audit Queue */}
        <Card className="border border-border/50 bg-card/60 backdrop-blur-xs shadow-2xs rounded-2xl overflow-hidden flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4 sm:px-5 border-b border-border/30 bg-muted/10">
            <div className="flex items-center gap-2">
              <Clock className="size-3.5 text-amber-500" />
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Grading Queue
              </CardTitle>
              {pendingQueue.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[9px] font-mono font-medium bg-amber-500/10 text-amber-600 border-amber-500/20 h-4 px-1.5 rounded-full"
                >
                  {pendingQueue.length}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs font-semibold text-primary hover:text-primary/80"
              asChild
            >
              <Link href="/lecturer/grading">Detailed View →</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-3 flex-1 flex flex-col justify-center">
            {pendingQueue.length === 0 ? (
              <div className="py-8 px-3 text-center space-y-2 bg-muted/5 rounded-xl border border-dashed border-border/40">
                <div className="size-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4.5" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">
                    Grading Queue Clear
                  </p>
                  <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                    All student assessment submissions have been evaluated.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] font-medium rounded-xl mt-1"
                  asChild
                >
                  <Link href="/lecturer/grading">View Graded Archive</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingQueue.map((item, i) => (
                  <div
                    key={item.id || i}
                    className="flex items-center justify-between rounded-xl border border-border/40 p-3 hover:bg-muted/30 transition-all group"
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="font-semibold text-xs truncate text-foreground group-hover:text-primary transition-colors">
                        {item.assessment_title}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-medium mt-0.5 flex items-center gap-1.5">
                        <FileText className="size-3 text-muted-foreground/60" />
                        <span>{item.type || "Manual Review"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] h-4.5 px-2 font-mono font-semibold rounded-full",
                          item.urgency === "high"
                            ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/20",
                        )}
                      >
                        {item.count} awaiting
                      </Badge>
                      <Button
                        size="sm"
                        className="h-7 px-2.5 text-xs font-medium rounded-xl shadow-2xs"
                        asChild
                      >
                        <Link href="/lecturer/grading">Grade</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Integrity Watch */}
        <Card className="border border-border/50 bg-card/60 backdrop-blur-xs shadow-2xs rounded-2xl overflow-hidden flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4 sm:px-5 border-b border-border/30 bg-muted/10">
            <div className="flex items-center gap-2">
              <Eye className="size-3.5 text-primary" />
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Integrity Watch
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs font-semibold text-primary hover:text-primary/80"
              asChild
            >
              <Link href="/lecturer/supervision">Live Hub →</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-3 flex-1 flex flex-col justify-center">
            {recentAlerts.length === 0 ? (
              <div className="py-8 px-3 text-center space-y-2 bg-muted/5 rounded-xl border border-dashed border-border/40">
                <div className="size-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="size-4.5" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">
                    Zero Violations Detected
                  </p>
                  <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                    All proctored sessions in the last 24 hours operate under normal integrity parameters.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] font-medium rounded-xl mt-1"
                  asChild
                >
                  <Link href="/lecturer/supervision">Open Live Supervision</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={cn(
                      "rounded-xl border p-3 transition-all",
                      alert.severity === "high"
                        ? "bg-rose-500/5 border-rose-500/20"
                        : "bg-muted/20 border-border/40",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle
                        className={cn(
                          "size-3.5 mt-0.5 shrink-0",
                          alert.severity === "high"
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-amber-600 dark:text-amber-400",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs truncate text-foreground">
                          {alert.student_name}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                          {alert.event_type.replace(/_/g, " ")}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge
                            variant="outline"
                            className="text-[9px] font-mono font-semibold px-1.5 py-0 rounded-md bg-background border-border/60"
                          >
                            Risk {alert.risk_score}%
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">
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
                        className="h-7 w-7 p-0 rounded-full hover:bg-background"
                        asChild
                      >
                        <Link href="/lecturer/supervision">
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Historical / Recent Submissions */}
        <Card className="border border-border/50 bg-card/60 backdrop-blur-xs shadow-2xs rounded-2xl overflow-hidden flex flex-col justify-between md:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4 sm:px-5 border-b border-border/30 bg-muted/10">
            <div className="flex items-center gap-2">
              <History className="size-3.5 text-primary" />
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Recent Submissions
              </CardTitle>
            </div>
            {recentSubmissions.length > 0 && (
              <Badge
                variant="secondary"
                className="text-[9px] font-mono font-medium h-4.5 px-2 rounded-full"
              >
                {recentSubmissions.length} logged
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col justify-center">
            {recentSubmissions.length === 0 ? (
              <div className="py-8 px-4 text-center space-y-2 bg-muted/5 m-3 rounded-xl border border-dashed border-border/40">
                <div className="size-9 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-center mx-auto text-muted-foreground">
                  <Inbox className="size-4.5 text-muted-foreground/60" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">
                    No Submissions Logged Yet
                  </p>
                  <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                    Student submissions across all active courses will stream in automatically.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] font-medium rounded-xl mt-1"
                  asChild
                >
                  <Link href="/lecturer/assessments">Explore Assessments</Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {recentSubmissions.slice(0, 5).map((sub, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 px-4 hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="font-semibold text-xs text-foreground truncate">
                        {sub.student_name}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate font-normal">
                        {sub.assessment_title}
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] font-semibold uppercase tracking-wider h-4.5 px-2 rounded-full",
                          sub.status === "COMPLETED" || sub.status === "GRADED"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            : "bg-primary/5 text-primary border-primary/20",
                        )}
                      >
                        {sub.status}
                      </Badge>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {new Date(sub.submitted_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

