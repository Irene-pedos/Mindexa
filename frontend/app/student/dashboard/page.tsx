// app/(student)/dashboard/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { studentApi, StudentDashboardResponse } from "@/lib/api/student"
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
import { Bell, MessageSquare, CheckCircle2 } from "lucide-react"

export default function StudentDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState<StudentDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDashboard() {
      try {
        const dashboardData = await studentApi.getDashboard()
        setData(dashboardData)
      } catch (err) {
        console.error("Failed to load dashboard data", err)
      } finally {
        setLoading(false)
      }
    }
    loadDashboard()
  }, [])

  const displayName = (user?.profile as any)?.first_name || (user?.profile as any)?.display_name || "Student"

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

      <QuickActions />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left column – Schedule & Activity */}
        <div className="xl:col-span-7 space-y-6">
          <UpcomingAssessments 
            activeAttempts={data?.active_attempts ?? []} 
            upcomingAssessments={data?.upcoming_assessments ?? []} 
          />
          <StudentCalendar />
          
          {/* Recent Notifications Card (Balancing the layout) */}
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="size-4 text-muted-foreground" />
                Recent Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                <div className="p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors">
                  <div className="mt-0.5 rounded-full p-1.5 bg-primary/10 text-primary">
                    <CheckCircle2 className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Database Systems Grade Published</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Your CAT 2 results are now available for review.</p>
                  </div>
                </div>
                <div className="p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors">
                  <div className="mt-0.5 rounded-full p-1.5 bg-secondary text-secondary-foreground">
                    <MessageSquare className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">New Discussion Reply</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Prof. Smith replied to your thread in Software Engineering.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column – Performance, Results & Study */}
        <div className="xl:col-span-5 space-y-6">
          <PerformanceChart />
          <RecentResults results={data?.recent_results ?? []} />
          <StudyResources />
          <AiStudyEntry />
        </div>
      </div>
    </div>
  )
}