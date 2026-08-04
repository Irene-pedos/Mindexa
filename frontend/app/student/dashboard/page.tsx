// app/(student)/dashboard/page.tsx
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  studentApi,
  StudentDashboardResponse,
  StudentScheduleResponse,
  StudentResourceResponse,
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

import {
  getAssessmentCategory,
  getAssessmentProgressStatus,
  isHighSecurityAssessment,
} from "@/lib/grading-architecture";
import Link from "next/link";

interface PersonalResource extends StudentResourceResponse {
  title: string;
  file_url?: string;
  resource_type?: string;
  subject?: string;
}

const NOTIFICATION_ICON_MAP: Record<string, React.ReactNode> = {
  RESULT_RELEASED: <CheckCircle2 className="size-3.5 text-emerald-600" />,
  GRADE_RELEASED: <CheckCircle2 className="size-3.5 text-emerald-600" />,
  FEEDBACK_RELEASED: <MessageSquare className="size-3.5 text-primary" />,
  INTEGRITY_WARNING: <Bell className="size-3.5 text-destructive" />,
  INTEGRITY_ALERT: <ShieldAlert className="size-3.5 text-destructive" />,
  ASSESSMENT_SCHEDULED: <Clock className="size-3.5 text-amber-600" />,
  ASSESSMENT_REMINDER: <Clock className="size-3.5 text-amber-600" />,
  REASSESSMENT_ASSIGNED: <AlertTriangle className="size-3.5 text-amber-600" />,
  REVIEW_RESPONSE: <MessageSquare className="size-3.5 text-primary" />,
};

const getNotificationIcon = (type: string): React.ReactNode => {
  return (
    NOTIFICATION_ICON_MAP[type.toUpperCase()] ?? (
      <Info className="size-3.5 text-muted-foreground" />
    )
  );
};

const getTerminationLabel = (status: string, reason?: string): string => {
  if (reason) return reason;
  if (status === "AUTO_SUBMITTED")
    return "Attempt auto-submitted when time expired.";
  if (status === "TERMINATED")
    return "Attempt ended due to integrity protocol.";
  return "Attempt concluded.";
};

const getNotificationLink = (notification: {
  notification_type: string;
  action_url?: string | null | undefined;
  related_id?: string | null | undefined;
}): string => {
  if (notification.action_url) return notification.action_url;
  const type = notification.notification_type.toUpperCase();
  const id = notification.related_id;
  if ((type.includes("RESULT") || type.includes("GRADE")) && id)
    return `/student/results/${id}`;
  if (type.includes("ASSESSMENT") && id) return `/student/assessments/${id}`;
  if (type.includes("INTEGRITY") && id) return `/student/results/${id}`;
  if (type.includes("REASSESSMENT") && id) return `/student/assessments/${id}`;
  return "/student/notifications";
};

const isCriticalNotification = (type: string): boolean => {
  const t = type.toUpperCase();
  return (
    t.includes("INTEGRITY") ||
    t.includes("ALERT") ||
    t.includes("WARNING") ||
    t.includes("TERMINATED")
  );
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const router = useRouter();

  // Role guard — redirect if not a student
  useEffect(() => {
    if (user && user.role !== "STUDENT") {
      const redirectMap: Record<string, string> = {
        LECTURER: "/lecturer/dashboard",
        ADMIN: "/admin/dashboard",
      };
      window.location.replace(redirectMap[user.role] || "/");
    }
  }, [user]);

  const [data, setData] = useState<StudentDashboardResponse | null>(null);
  const [schedule, setSchedule] = useState<StudentScheduleResponse | null>(
    null,
  );
  const [notifications, setNotifications] =
    useState<NotificationListResponse | null>(null);
  const [resources, setResources] = useState<PersonalResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>(
    {},
  );
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      try {
        setSectionErrors({});
        const [dashRes, schedRes, notifRes, resRes] = await Promise.allSettled([
          studentApi.getDashboard(),
          studentApi.getSchedule(),
          // Note: API module does not support named params yet, using positional args
          notificationApi.getNotifications(false, 1, 5),
          studentApi.getPersonalResources(),
        ]);
        if (controller.signal.aborted) return;

        if (dashRes.status === "fulfilled") setData(dashRes.value);
        else
          setSectionErrors((prev) => ({
            ...prev,
            dashboard: dashRes.reason?.message || "Failed to load dashboard.",
          }));

        if (schedRes.status === "fulfilled") setSchedule(schedRes.value);
        else
          setSectionErrors((prev) => ({
            ...prev,
            schedule: "Failed to load schedule.",
          }));

        if (notifRes.status === "fulfilled") setNotifications(notifRes.value);
        else
          setSectionErrors((prev) => ({
            ...prev,
            notifications: "Failed to load notifications.",
          }));

        if (resRes.status === "fulfilled") {
          setResources(
            (resRes.value || []).map((r: any) => ({
              ...r,
              title: r.display_name || r.original_filename,
            })),
          );
        }
        // Resources failure is silent — non-critical
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadDashboard();
    return () => controller.abort();
  }, [retryKey]);

  const violations = useMemo(() => {
    if (!data) return [];
    return (data.active_attempts ?? []).filter(
      (a) => a.status === "TERMINATED" || a.status === "AUTO_SUBMITTED",
    );
  }, [data]);

  const displayName = user
    ? (user?.profile as { first_name?: string; display_name?: string })
        ?.first_name ||
      (user?.profile as { first_name?: string; display_name?: string })
        ?.display_name ||
      "Student"
    : null; // null = still loading

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

  const unreadCount = useMemo(
    () => (notifications?.items ?? []).filter((n) => !n.is_read).length,
    [notifications],
  );

  const dueTodayCount = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return (data?.upcoming_assessments ?? []).filter((a) => {
      const dateStr = a.window_end ?? "";
      const end = new Date(dateStr);
      return !isNaN(end.getTime()) && end >= startOfDay && end <= today;
    }).length;
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Header skeleton */}
        <div className="flex items-center justify-between px-1">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>

        {/* Metrics skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>

        {/* Quick actions skeleton */}
        <Skeleton className="h-16 w-full rounded-xl" />

        {/* Main content skeleton — mirrors lg:col-span-7 / lg:col-span-5 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-4">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
          <div className="lg:col-span-5 space-y-4">
            <Skeleton className="h-56 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (sectionErrors.dashboard && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 max-w-sm w-full">
          <AlertTriangle className="size-6 text-destructive mx-auto mb-3" />
          <p className="text-sm font-semibold text-destructive mb-1">
            Dashboard failed to load
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {sectionErrors.dashboard}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setRetryKey((k) => k + 1)}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Welcome Header with Planner Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-semibold ">
              {greeting},{" "}
              {displayName ? (
                <>{displayName}</>
              ) : (
                <Skeleton className="inline-block h-6 w-28 align-middle" />
              )}
            </h1>
            <p className="text-muted-foreground text-[12px] mt-0.5">
              {data?.current_academic_period
                ? `${data.current_academic_period} • Student portal for learning and do assessments`
                : "Student portal for learning and do assessments"}
            </p>
          </div>
        </div>

        <AcademicPlannerDropdown />
      </div>

      {/* Due Today banner if applicable */}
      {dueTodayCount > 0 && (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] text-amber-700">
          <AlertTriangle className="size-3.5 shrink-0" />
          <p className="text-xs font-semibold flex-1">
            {dueTodayCount} assessment{dueTodayCount > 1 ? "s" : ""} due today.{" "}
            <Link
              href="/student/assessments"
              className="underline underline-offset-2 font-bold"
            >
              View now →
            </Link>
          </p>
        </div>
      )}

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((stat, index) => (
          <Card key={index} className="rounded-xl shadow-none border">
            <CardHeader className="border-0 pb-0.5 pt-2.5 px-3">
              <CardTitle className="text-muted-foreground text-[9px] font-semibold uppercase tracking-wider">
                {stat.title}
              </CardTitle>
              <CardToolbar>
                <Button
                  variant="dim"
                  size="sm"
                  mode="icon"
                  className="-me-1 opacity-40 hover:opacity-100 h-6 w-6"
                  asChild
                >
                  <Link href="/student/results">
                    <MoreHorizontal className="size-3" />
                  </Link>
                </Button>
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

      <QuickActions />

      {violations.length > 0 && (
        <Card className="border-destructive/20 bg-destructive/[0.03] shadow-none rounded-xl overflow-hidden mb-4">
          <CardHeader className="py-3 px-5 border-b border-destructive/10 flex flex-row items-center gap-3">
            <ShieldAlert className="size-5 text-destructive" />
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-destructive">
              Integrity Protocol Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {violations.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between bg-background/60 p-3 rounded-lg border border-destructive/10"
              >
                <div className="space-y-1">
                  <p className="text-sm font-bold text-destructive">
                    {v.assessment_title}
                  </p>
                  <p className="text-[10px] text-destructive font-medium uppercase">
                    {getTerminationLabel(v.status, v.termination_reason)}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 text-[10px] font-bold uppercase"
                  asChild
                >
                  <Link href={`/student/results/${v.assessment_id ?? v.id}`}>
                    Review Audit
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left column – Schedule & Activity */}
        <div className="lg:col-span-7 space-y-4">
          <UpcomingAssessments
            activeAttempts={(data?.active_attempts ?? []).slice(0, 5)}
            upcomingAssessments={(data?.upcoming_assessments ?? []).slice(0, 5)}
          />
          {sectionErrors.schedule ? (
            <Card className="border-destructive/15 bg-destructive/[0.02] shadow-none rounded-xl">
              <CardContent className="py-6 text-center text-xs font-medium text-destructive">
                {sectionErrors.schedule}
              </CardContent>
            </Card>
          ) : (
            <StudentCalendar events={schedule?.events} />
          )}

          {/* Recent Notifications Card */}
          <Card className="shadow-none border rounded-xl overflow-hidden">
            <CardHeader className="py-2.5 px-4 border-b flex flex-row items-center justify-between space-y-0 bg-muted/5">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Bell className="size-3" />
                Notifications
                {unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center size-4 rounded-full bg-primary text-primary-foreground text-[8px] font-bold">
                    {unreadCount}
                  </span>
                )}
              </CardTitle>
              <Link
                href="/student/notifications"
                className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider hover:text-foreground transition-colors"
              >
                View All →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {sectionErrors.notifications ? (
                <div className="p-6 text-center text-xs font-medium text-destructive">
                  {sectionErrors.notifications}
                </div>
              ) : (
                <div className="divide-y divide-muted/20">
                  {notifications?.items && notifications.items.length > 0 ? (
                    notifications.items.map((notification) => (
                      <Link
                        key={notification.id}
                        href={getNotificationLink(notification)}
                        className={cn(
                          "p-3 flex items-start gap-3 hover:bg-muted/10 transition-colors block",
                          isCriticalNotification(
                            notification.notification_type,
                          ) &&
                            "border-l-2 border-destructive bg-destructive/[0.02]",
                        )}
                      >
                        <div
                          className={cn(
                            "mt-0.5 rounded-md p-1",
                            notification.is_read
                              ? "bg-muted text-muted-foreground"
                              : "bg-primary/5 text-primary",
                          )}
                        >
                          {getNotificationIcon(notification.notification_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              "text-xs",
                              notification.is_read
                                ? "font-medium text-muted-foreground"
                                : "font-semibold text-foreground/80",
                            )}
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
                      </Link>
                    ))
                  ) : (
                    <div className="p-8 text-center text-xs font-medium text-muted-foreground italic">
                      No active notifications.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column – Performance, Results & Study */}
        <div className="lg:col-span-5 space-y-4">
          <PerformanceChart data={data?.performance_trend} />
          <RecentResults results={data?.recent_results ?? []} />
          <StudyResources resources={resources} />
          <AiStudyEntry />
        </div>
      </div>
    </div>
  );
}
