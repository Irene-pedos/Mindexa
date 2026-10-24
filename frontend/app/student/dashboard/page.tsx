// app/(student)/dashboard/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import {
  studentApi,
  StudentDashboardResponse,
  StudentScheduleResponse,
  StudentResourceResponse,
} from "@/lib/api/student";
import { assessmentApi } from "@/lib/api/assessment";
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
import { NotificationsMenu, NotificationMenuItem } from "@/components/ui/notifications-menu";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  BookOpen,
  ShieldAlert,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { getAssessmentCategory } from "@/lib/grading-architecture";

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
  // There is no /student/assessments/{id} page: an assessment opens on its take
  // page, and the list is the safe fallback.
  if (type.includes("REASSESSMENT") && id) return `/student/assessments/${id}/take`;
  if (type.includes("ASSESSMENT") && id) return `/student/assessments/${id}/take`;
  if (type.includes("INTEGRITY") && id) return `/student/results/${id}`;
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
  const [schedule, setSchedule] = useState<StudentScheduleResponse | null>(null);
  const [notifications, setNotifications] = useState<NotificationListResponse | null>(null);
  const [resources, setResources] = useState<PersonalResource[]>([]);
  const [assessmentsList, setAssessmentsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      try {
        setSectionErrors({});
        const [dashRes, schedRes, notifRes, resRes, assessRes] = await Promise.allSettled([
          studentApi.getDashboard(),
          studentApi.getSchedule(),
          notificationApi.getNotifications(false, 1, 5),
          studentApi.getPersonalResources(),
          assessmentApi.getAssessments({ page_size: 100 }),
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
            }))
          );
        }

        if (assessRes.status === "fulfilled") {
          setAssessmentsList(assessRes.value.items || []);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadDashboard();
    return () => controller.abort();
  }, [retryKey]);

  // Compute exact counts matching @student/assessments page
  const assessmentCounts = useMemo(() => {
    let active = 0;
    let upcoming = 0;
    let submitted = 0;

    for (const a of assessmentsList) {
      const cat = getAssessmentCategory(a);
      if (cat === "ACTIVE" || cat === "IN_PROGRESS") {
        active++;
      } else if (cat === "UPCOMING") {
        upcoming++;
      } else if (cat === "SUBMITTED" || cat === "GRADED") {
        submitted++;
      }
    }

    return {
      active: active || (data?.summary.active_assessments_count.value ?? 0),
      upcoming,
      submitted: submitted || (data?.summary.completed_assessments_count.value ?? 0),
    };
  }, [assessmentsList, data]);

  const violations = useMemo(() => {
    if (!data) return [];
    return (data.active_attempts ?? []).filter(
      (a) => a.status === "TERMINATED" || a.status === "AUTO_SUBMITTED"
    );
  }, [data]);

  const displayName = user
    ? (user?.profile as { first_name?: string; display_name?: string })?.first_name ||
      (user?.profile as { first_name?: string; display_name?: string })?.display_name ||
      "Student"
    : null;

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
      value: assessmentCounts.active,
      delta: 0,
      positive: true,
      lastMonth: assessmentCounts.active,
      icon: Clock,
    },
    {
      title: "Submitted",
      value: assessmentCounts.submitted,
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
    [notifications]
  );

  const formattedNotifications: NotificationMenuItem[] = useMemo(() => {
    return (notifications?.items ?? []).map((n) => ({
      id: n.id,
      type: n.notification_type,
      title: n.title,
      body: n.body,
      content: n.body,
      isRead: n.is_read,
      actionUrl: getNotificationLink(n),
      timeAgo: formatDistanceToNow(new Date(n.created_at), { addSuffix: true }),
      timestamp: new Date(n.created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));
  }, [notifications]);

  const handleMarkAllNotificationsAsRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      setNotifications((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((n) => ({ ...n, is_read: true })),
            }
          : prev
      );
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark notifications as read");
    }
  };

  const handleMarkNotificationAsRead = async (id: string | number) => {
    try {
      await notificationApi.markAsRead(String(id));
      setNotifications((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((n) =>
                n.id === String(id) ? { ...n, is_read: true } : n
              ),
            }
          : prev
      );
    } catch (err) {
      console.error(err);
    }
  };

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
        <Skeleton className="h-14 w-full rounded-xl" />

        {/* Main content skeleton */}
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
    <div data-tour="student-dashboard" className="space-y-4">
      {/* Welcome Header with Academic Planner Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            {greeting},{" "}
            {displayName ? (
              <>{displayName}</>
            ) : (
              <Skeleton className="inline-block h-6 w-28 align-middle" />
            )}
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">
            {data?.current_academic_period
              ? `${data.current_academic_period} • Academic assessment and learning portal`
              : "Academic assessment and learning portal"}
          </p>
        </div>

        <AcademicPlannerDropdown />
      </div>

      {/* Due Today banner if applicable */}
      {dueTodayCount > 0 && (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-4 text-amber-600 shrink-0" />
          <p className="text-xs font-medium flex-1">
            <strong className="font-semibold">{dueTodayCount} assessment{dueTodayCount > 1 ? "s" : ""}</strong> due today.{" "}
            <Link
              href="/student/assessments"
              className="underline underline-offset-2 font-semibold hover:opacity-80"
            >
              View registry →
            </Link>
          </p>
        </div>
      )}

      {/* Metrics Overview */}
      <div data-tour="student-dashboard-metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((stat, index) => (
          <Card key={index} className="rounded-xl border border-border/60 bg-card shadow-2xs hover:border-border transition-colors">
            <CardHeader className="p-3.5 pb-1 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
                {stat.title}
              </CardTitle>
              <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <stat.icon className="size-3.5" />
              </div>
            </CardHeader>
            <CardContent className="p-3.5 pt-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-foreground tracking-tight tabular-nums">
                  {stat.format ? stat.format(stat.value) : formatNumber(stat.value)}
                  {stat.unit || ""}
                </span>
                {stat.delta !== 0 && (
                  <Badge
                    variant={stat.positive ? "outline" : "destructive"}
                    className={cn(
                      "rounded-full h-4 px-1.5 text-[9px] font-semibold",
                      stat.positive && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    )}
                  >
                    {stat.delta > 0 ? (
                      <ArrowUp className="size-2 mr-0.5" />
                    ) : (
                      <ArrowDown className="size-2 mr-0.5" />
                    )}
                    {Math.abs(stat.delta)}%
                  </Badge>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground border-t border-border/40 pt-1 flex justify-between items-center font-medium">
                <span>Previous Period</span>
                <span className="text-foreground/80 font-semibold">
                  {stat.format ? stat.format(stat.lastMonth) : formatNumber(stat.lastMonth)}
                  {stat.unit || ""}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <QuickActions />

      {violations.length > 0 && (
        <Card className="border-destructive/20 bg-destructive/5 shadow-2xs rounded-xl overflow-hidden mb-4">
          <CardHeader className="py-2.5 px-4 border-b border-destructive/15 flex flex-row items-center gap-2">
            <ShieldAlert className="size-4 text-destructive" />
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-destructive">
              Integrity Protocol Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {violations.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between bg-card p-3 rounded-lg border border-destructive/20"
              >
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-destructive">
                    {v.assessment_title}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-medium">
                    {getTerminationLabel(v.status, v.termination_reason)}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs font-semibold"
                  asChild
                >
                  <Link href={`/student/results/${v.id}`}>Review Audit</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left column – Assessment Command & Schedule */}
        <div className="lg:col-span-7 space-y-4">
          <UpcomingAssessments
            activeAttempts={data?.active_attempts ?? []}
            upcomingAssessments={data?.upcoming_assessments ?? []}
            submittedCount={assessmentCounts.submitted}
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

          {/* Recent Notifications Card (21st dev clean notification menu) */}
          {sectionErrors.notifications ? (
            <Card className="border-destructive/15 bg-destructive/[0.02] shadow-none rounded-xl">
              <CardContent className="py-6 text-center text-xs font-medium text-destructive">
                {sectionErrors.notifications}
              </CardContent>
            </Card>
          ) : (
            <NotificationsMenu
              notifications={formattedNotifications}
              title="Recent Notifications"
              onMarkAllAsRead={handleMarkAllNotificationsAsRead}
              onMarkAsRead={handleMarkNotificationAsRead}
              viewAllHref="/student/notifications"
            />
          )}
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
