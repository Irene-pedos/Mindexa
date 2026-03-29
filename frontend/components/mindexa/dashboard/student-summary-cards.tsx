// components/mindexa/dashboard/student-summary-cards.tsx
"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Clock, Award, BookOpen } from "lucide-react"

const stats = [
  {
    title: "Upcoming Assessments",
    value: "4",
    description: "Next 14 days",
    icon: Calendar,
    trend: "+1 this week",
    color: "text-blue-600",
  },
  {
    title: "Due This Week",
    value: "2",
    description: "Assignments & Homework",
    icon: Clock,
    trend: "1 overdue",
    color: "text-amber-600",
  },
  {
    title: "Current GPA",
    value: "3.78",
    description: "Semester average",
    icon: Award,
    trend: "+0.12",
    color: "text-emerald-600",
  },
  {
    title: "Study Resources",
    value: "18",
    description: "Uploaded & linked",
    icon: BookOpen,
    trend: "3 new",
    color: "text-violet-600",
  },
]

export function StudentSummaryCards() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <Card key={i} className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>{stat.title}</CardDescription>
            <stat.icon className={`size-5 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold tabular-nums tracking-tighter">{stat.value}</div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{stat.description}</span>
              <span className="text-xs text-emerald-600 font-medium">{stat.trend}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}