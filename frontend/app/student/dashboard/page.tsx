// app/(student)/dashboard/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  studentApi,
  StudentDashboardResponse,
  StudentScheduleResponse,
} from "@/lib/api/student";
import {
  notificationApi,
  NotificationListResponse,
} from "@/lib/api/notification";
import { QuickActions } from "@/components/mindexa/dashboard/quick-actions";
import { UpcomingAssessments } from "@/components/mindexa/dashboard/upcoming-assessments";
import { StudentCalendar } from "@/components/mindexa/dashboard/student-calendar";
import { RecentResults } from "@/components/mindexa/dashboard/recent-results";
import { StudyResources } from "@/components/mindexa/dashboard/study-resources";
import { AiStudyEntry } from "@/components/mindexa/dashboard/ai-study-entry";
import { PerformanceChart } from "@/components/mindexa/dashboard/performance-chart";
import { AcademicPlannerDropdown } from "@/components/mindexa/dashboard/academic-planner-dropdown";
import { Skeleton } from "@/components/ui/skeleton";
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
  Bell,
  MessageSquare,
  CheckCircle2,
  Info,
  Award,
  Clock,
  Activity,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Settings,
  Pin,
  Trash,
  BookOpen,
  LayoutDashboard,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu-v2";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { getAssessmentCategory, getAssessmentProgressStatus, isHighSecurityAssessment } from "@/lib/grading-architecture";
import Link from "next/link";

export default function StudentDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<StudentDashboardResponse | null>(null);
  const [schedule, setSchedule] = useState<StudentScheduleResponse | null>(
    null,
  );
  const [notifications, setNotifications] =
    useState<NotificationListResponse | null>(null);
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoadError(null);
        const [dashboardData, scheduleData, notificationData, resourcesData] =
          await Promise.all([
            studentApi.getDashboard(),
            studentApi.getSchedule(),
            notificationApi.getNotifications(false, 1, 5), // Get latest 5
            studentApi.getPersonalResources(),
          ]);
        setData(dashboardData);
        setSchedule(scheduleData);
        setNotifications(notificationData);
        setResources(resourcesData);
      } catch (err: any) {
        setLoadError(err.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const violations = useMemo(() => {
    if (!data) return [];
    return data.active_attempts.filter(a => a.status === 'TERMINATED' || a.status === 'AUTO_SUBMITTED');
  }, [data]);

  const displayName =
    (user?.profile as any)?.first_name ||
    (user?.profile as any)?.display_name ||
    "Student";

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const metrics = [
    {
      title: "Current CGPA",
      value: data?.summary.cgpa.value ?? 0,
      delta: data?.summary.cgpa.delta ?? 0,
      positive: data?.summary.cgpa.positive ?? true,
      lastMonth: data?.summary.cgpa.last_month ?? 0,
      icon: Award,
      format: (n: number) => n.toFixed(2),
    },
    {
      title: "Active Tasks",
      value: data?.summary.active_assessments_count.value ?? 0,
      delta: data?.summary.active_assessments_count.delta ?? 0,
      positive: data?.summary.active_assessments_count.positive ?? true,
      lastMonth: data?.summary.active_assessments_count.last_month ?? 0,
      icon: Clock,
    },
    {
      title: "Completed",
      value: data?.summary.completed_assessments_count.value ?? 0,
      delta: data?.summary.completed_assessments_count.delta ?? 0,
      positive: data?.summary.completed_assessments_count.positive ?? true,
      lastMonth: data?.summary.completed_assessments_count.last_month ?? 0,
      icon: CheckCircle2,
    },
    {
      title: "Avg Performance",
      value: data?.summary.avg_performance_percent.value ?? 0,
      delta: data?.summary.avg_performance_percent.delta ?? 0,
      positive: data?.summary.avg_performance_percent.positive ?? true,
      lastMonth: data?.summary.avg_performance_percent.last_month ?? 0,
      icon: Activity,
      unit: "%",
    },
  ];

  function formatNumber(n: number) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return n.toLocaleString();
    return n.toString();
  }

  const getNotificationIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes("result") || t.includes("grade") || t.includes("complete")) {
      return <CheckCircle2 className="size-3.5" />;
    }
    if (
      t.includes("discussion") ||
      t.includes("reply") ||
      t.includes("feedback")
    ) {
      return <MessageSquare className="size-3.5" />;
    }
    if (
      t.includes("integrity") ||
      t.includes("alert") ||
      t.includes("warning")
    ) {
      return <Bell className="size-3.5 text-destructive" />;
    }
    return <Info className="size-3.5" />;
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-4">
      {/* Welcome Header with Planner Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {greeting}, {displayName} 👋
            </h1>
            <p className="text-muted-foreground text-[9px] font-semibold uppercase tracking-widest mt-0.5">
              Student Command Center • Registry Active
            </p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="dim"
                size="sm"
                mode="icon"
                className="size-7 rounded-full opacity-40 hover:opacity-100 mt-1"
              >
                <Info className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-80 p-4">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Mindexa grades closed questions automatically and routes open
                responses through lecturer-controlled review. Result release may
                therefore happen in stages when an assessment contains essays,
                short answers, case studies, or computational reasoning.
              </p>
            </PopoverContent>
          </Popover>
        </div>

        <AcademicPlannerDropdown />
      </div>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((stat, index) => (
          <Card key={index} className="rounded-xl shadow-none border">
            <CardHeader className="border-0 pb-0.5 pt-2.5 px-3">
              <CardTitle className="text-muted-foreground text-[9px] font-semibold uppercase tracking-wider">
                {stat.title}
              </CardTitle>
              <CardToolbar>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="dim"
                      size="sm"
                      mode="icon"
                      className="-me-1 opacity-40 hover:opacity-100 h-6 w-6"
                    >
                      <MoreHorizontal className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    side="bottom"
                    className="rounded-lg"
                  >
                    <DropdownMenuItem className="text-[10px] font-medium">
                      <Settings className="size-3" />
                      Detail View
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-[10px] font-medium">
                      <Pin className="size-3" /> Pin Metric
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      className="text-[10px] font-medium"
                    >
                      <Trash className="size-3" />
                      Dismiss
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardToolbar>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 px-3 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-primary tracking-tight tabular-nums">
                  {stat.format
                    ? stat.format(stat.value)
                    : formatNumber(stat.value)}
                  {stat.unit || ""}
                </span>
                {stat.delta !== 0 && (
                  <Badge
                    variant={stat.positive ? "success" : "destructive"}
                    appearance="light"
                    className="rounded-full h-3.5 px-1.5 text-[8px] font-semibold"
                  >
                    {stat.delta > 0 ? (
                      <ArrowUp className="size-2" />
                    ) : (
                      <ArrowDown className="size-2" />
                    )}
                    {Math.abs(stat.delta)}%
                  </Badge>
                )}
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5 border-t border-muted/10 pt-1 flex justify-between items-center uppercase font-medium tracking-wide">
                <span>Prev. Period</span>
                <span className="text-foreground/70">
                  {stat.format
                    ? stat.format(stat.lastMonth)
                    : formatNumber(stat.lastMonth)}
                  {stat.unit || ""}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loadError ? (
        <Card className="border-destructive/10 bg-destructive/5 shadow-none rounded-lg">
          <CardContent className="py-2 px-3 text-[10px] font-medium text-destructive">
            {loadError}
          </CardContent>
        </Card>
      ) : null}

      <QuickActions />

      {violations.length > 0 && (
        <Card className="border-red-200 bg-red-50/50 shadow-none rounded-xl overflow-hidden mb-4">
          <CardHeader className="py-3 px-5 border-b border-red-100 flex flex-row items-center gap-3">
             <ShieldAlert className="size-5 text-red-600" />
             <CardTitle className="text-xs font-bold uppercase tracking-widest text-red-700">Integrity Protocol Alerts</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
             {violations.map(v => (
               <div key={v.id} className="flex items-center justify-between bg-white/60 p-3 rounded-lg border border-red-100">
                  <div className="space-y-1">
                     <p className="text-sm font-bold text-red-800">{v.assessment_title}</p>
                     <p className="text-[10px] text-red-600 font-medium uppercase">Session Terminated due to security breach</p>
                  </div>
                  <Button variant="destructive" size="sm" className="h-8 text-[10px] font-bold uppercase" asChild>
                     <Link href={`/student/results/${v.id}`}>Review Audit</Link>
                  </Button>
               </div>
             ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Left column – Schedule & Activity */}
        <div className="xl:col-span-7 space-y-4">
          <UpcomingAssessments
            activeAttempts={data?.active_attempts ?? []}
            upcomingAssessments={data?.upcoming_assessments ?? []}
          />
          <StudentCalendar events={schedule?.events} />

          {/* Recent Notifications Card */}
          <Card className="shadow-none border rounded-xl overflow-hidden">
            <CardHeader className="py-2.5 px-4 border-b flex flex-row items-center justify-between space-y-0 bg-muted/5">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Bell className="size-3" />
                Recent Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-muted/20">
                {notifications?.items && notifications.items.length > 0 ? (
                  notifications.items.map((notification) => (
                    <div
                      key={notification.id}
                      className="p-3 flex items-start gap-3 hover:bg-muted/10 transition-colors"
                    >
                      <div
                        className={`mt-0.5 rounded-md p-1 ${notification.is_read ? "bg-muted text-muted-foreground" : "bg-primary/5 text-primary"}`}
                      >
                        {getNotificationIcon(notification.notification_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-xs ${notification.is_read ? "font-medium text-muted-foreground" : "font-semibold text-foreground/80"}`}
                        >
                          {notification.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                          {notification.body}
                        </p>
                        <p className="text-[8px] text-muted-foreground mt-1 font-semibold uppercase tracking-tight">
                          {formatDistanceToNow(
                            new Date(notification.created_at),
                            { addSuffix: true },
                          )}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs font-medium text-muted-foreground italic">
                    No active notifications.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column – Performance, Results & Study */}
        <div className="xl:col-span-5 space-y-4">
          <PerformanceChart data={data?.performance_trend} />
          <RecentResults results={data?.recent_results ?? []} />
          <StudyResources resources={resources} />
          <AiStudyEntry />
        </div>
      </div>
    </div>
  );
}
