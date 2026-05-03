// app/(student)/dashboard/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { studentApi, StudentDashboardResponse, StudentScheduleResponse } from "@/lib/api/student"
import { notificationApi, NotificationListResponse } from "@/lib/api/notification"
import { StudentSummaryCards } from "@/components/mindexa/dashboard/student-summary-cards"
import { QuickActions } from "@/components/mindexa/dashboard/quick-actions"
import { UpcomingAssessments } from "@/components/mindexa/dashboard/upcoming-assessments"
import { StudentCalendar } from "@/components/mindexa/dashboard/student-calendar"
import { RecentResults } from "@/components/mindexa/dashboard/recent-results"
import { StudyResources } from "@/components/mindexa/dashboard/study-resources"
import { AiStudyEntry } from "@/components/mindexa/dashboard/ai-study-entry"
import { PerformanceChart } from "@/components/mindexa/dashboard/performance-chart"
import { AcademicPlannerDropdown } from "@/components/mindexa/dashboard/academic-planner-dropdown"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Bell, MessageSquare, CheckCircle2, Info } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

export default function StudentDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState<StudentDashboardResponse | null>(null)
  const [schedule, setSchedule] = useState<StudentScheduleResponse | null>(null)
  const [notifications, setNotifications] = useState<NotificationListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoadError(null)
        const [dashboardData, scheduleData, notificationData] = await Promise.all([
          studentApi.getDashboard(),
          studentApi.getSchedule(),
          notificationApi.getNotifications(false, 1, 5) // Get latest 5
        ])
        setData(dashboardData)
        setSchedule(scheduleData)
        setNotifications(notificationData)
      } catch (err: any) {
        setLoadError(err.message || "Failed to load dashboard data")
      } finally {
        setLoading(false)
      }
    }
    loadDashboard()
  }, [])

  const displayName = (user?.profile as any)?.first_name || (user?.profile as any)?.display_name || "Student"

  const getNotificationIcon = (type: string) => {
    const t = type.toLowerCase()
    if (t.includes("result") || t.includes("grade") || t.includes("complete")) {
      return <CheckCircle2 className="size-4" />
    }
    if (t.includes("discussion") || t.includes("reply") || t.includes("feedback")) {
      return <MessageSquare className="size-4" />
    }
    if (t.includes("integrity") || t.includes("alert") || t.includes("warning")) {
      return <Bell className="size-4 text-destructive" />
    }
    return <Info className="size-4" />
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header with Planner Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
             Good afternoon, {displayName} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Here’s what’s happening in your academic workspace today.
          </p>
        </div>

        {/* Academic Planner Dropdown Button */}
        <AcademicPlannerDropdown />
      </div>

      <StudentSummaryCards summary={data?.summary} />

      {loadError ? (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="pt-6 text-sm text-destructive">
            {loadError}
          </CardContent>
        </Card>
      ) : null}

      <QuickActions />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left column – Schedule & Activity */}
        <div className="xl:col-span-7 space-y-6">
          <UpcomingAssessments 
            activeAttempts={data?.active_attempts ?? []} 
            upcomingAssessments={data?.upcoming_assessments ?? []} 
          />
          <StudentCalendar events={schedule?.events} />

          {/* Recent Notifications Card */}
          <Card>
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="size-4 text-muted-foreground" />
                Recent Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {notifications?.items && notifications.items.length > 0 ? (
                  notifications.items.map((notification) => (
                    <div key={notification.id} className="p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors">
                      <div className={`mt-0.5 rounded-full p-1.5 ${notification.is_read ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                        {getNotificationIcon(notification.notification_type)}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm ${notification.is_read ? 'font-normal text-muted-foreground' : 'font-medium'}`}>
                          {notification.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{notification.body}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No new notifications.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column – Performance, Results & Study */}
        <div className="xl:col-span-5 space-y-6">
          <PerformanceChart data={data?.performance_trend} />
          <RecentResults results={data?.recent_results ?? []} />
          <StudyResources />
          <AiStudyEntry />
        </div>
      </div>
    </div>
  )
}
