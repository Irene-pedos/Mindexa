// app/(student)/dashboard/page.tsx
import { StudentSummaryCards } from "@/components/mindexa/dashboard/student-summary-cards"
import { QuickActions } from "@/components/mindexa/dashboard/quick-actions"
import { UpcomingAssessments } from "@/components/mindexa/dashboard/upcoming-assessments"
import { StudentCalendar } from "@/components/mindexa/dashboard/student-calendar"
import { RecentResults } from "@/components/mindexa/dashboard/recent-results"
import { StudyResources } from "@/components/mindexa/dashboard/study-resources"
import { AiStudyEntry } from "@/components/mindexa/dashboard/ai-study-entry"
import { PerformanceChart } from "@/components/mindexa/dashboard/performance-chart"
import { AcademicPlannerDropdown } from "@/components/mindexa/dashboard/academic-planner-dropdown"

export default function StudentDashboard() {
  return (
    <div className="space-y-8 pb-8">
      {/* Welcome Header with Planner Button */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Good afternoon, Alex 👋</h1>
          <p className="text-muted-foreground mt-1">
            Here’s what’s happening in your academic workspace today.
          </p>
        </div>

        {/* Academic Planner Dropdown Button */}
        <AcademicPlannerDropdown />
      </div>

      <StudentSummaryCards />

      <QuickActions />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left column – Schedule & Activity */}
        <div className="xl:col-span-7 space-y-6">
          <UpcomingAssessments />
          <StudentCalendar />
        </div>

        {/* Right column – Performance, Results & Study */}
        <div className="xl:col-span-5 space-y-6">
          <PerformanceChart />
          <RecentResults />
          <StudyResources />
          <AiStudyEntry />
        </div>
      </div>
    </div>
  )
}