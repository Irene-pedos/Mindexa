// app/lecturer/dashboard/page.tsx
"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Users, Clock, CheckCircle, Eye, Plus } from "lucide-react"
import Link from "next/link"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"

const metrics = [
  { label: "Active Classes", value: "4", change: "+1 this week", icon: Users, color: "text-blue-600" },
  { label: "Upcoming Assessments", value: "7", change: "3 this week", icon: Clock, color: "text-amber-600" },
  { label: "Pending Grading", value: "23", change: "12 AI suggestions", icon: CheckCircle, color: "text-emerald-600" },
  { label: "Flagged Integrity Events", value: "3", change: "Today", icon: AlertTriangle, color: "text-red-600" },
]

const pendingQueue = [
  { title: "Database Systems CAT – 18 submissions awaiting review", type: "Manual Grading", count: 18, urgency: "high" },
  { title: "AI Suggested Grades – Algorithms Quiz (12 students)", type: "AI Review", count: 12, urgency: "medium" },
  { title: "Suspicious Activity Reports – 2 students", type: "Integrity Flag", count: 2, urgency: "high" },
  { title: "Reassessment Requests", type: "Appeal Review", count: 3, urgency: "low" },
]

const recentSubmissions = [
  { student: "Jordan Lee", assessment: "Database Systems CAT", time: "14 min ago", status: "Submitted" },
  { student: "Taylor Kim", assessment: "Algorithms Quiz", time: "47 min ago", status: "Submitted" },
]

export default function LecturerDashboard() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Lecturer Command Center</h1>
        <p className="text-muted-foreground mt-1">Powerful oversight • Efficient grading • Real-time control</p>
      </div>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((m, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardDescription>{m.label}</CardDescription>
              <m.icon className={`size-5 ${m.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold tabular-nums tracking-tighter">{m.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{m.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Quick Actions */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common lecturer workflows</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Button asChild size="lg" className="h-20 flex-col gap-1 font-medium">
              <Link href="/lecturer/assessments/new">
                <Plus className="size-5" /> Create Assessment
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-20 flex-col gap-1">
              <Link href="/lecturer/assessments">Manage Assessments</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-20 flex-col gap-1">
              <Link href="/lecturer/question-bank">Question Bank</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-20 flex-col gap-1">
              <Link href="/lecturer/grading">Grading Queue</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-20 flex-col gap-1">
              <Link href="/lecturer/ai-assistant">AI Assistant</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-20 flex-col gap-1">
              <Link href="/lecturer/supervision">Live Supervision</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Submission Trends Chart */}
        <div className="lg:col-span-7">
          <ChartAreaInteractive />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Pending Review Queue */}
        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Pending Review Queue</CardTitle>
              <CardDescription>Items requiring your immediate attention</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/lecturer/grading">View Full Queue</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingQueue.map((item, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border p-5 hover:bg-muted/50 transition-all">
                <div className="flex-1">
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-muted-foreground">{item.type}</div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant={item.urgency === "high" ? "destructive" : item.urgency === "medium" ? "default" : "secondary"}>
                    {item.count}
                  </Badge>
                  <Button size="sm">Review Now</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Live Supervision Alerts */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="size-5" /> Live Supervision Alerts
            </CardTitle>
            <CardDescription>Real-time suspicious behavior (last 30 minutes)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-5">
              <div className="flex items-start gap-4">
                <AlertTriangle className="size-6 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium">S3921 – Jordan Lee</div>
                  <div className="text-sm">Tab switching detected 3 times during Database CAT</div>
                  <div className="text-xs text-muted-foreground mt-2">14:32 • Risk Score: 85%</div>
                </div>
                <Button size="sm" variant="destructive">View Log</Button>
              </div>
            </div>

            <div className="rounded-xl border p-5">
              <div className="flex items-start gap-4">
                <AlertTriangle className="size-6 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium">S2847 – Taylor Kim</div>
                  <div className="text-sm">Extended inactivity (4.5 min) in Algorithms Quiz</div>
                  <div className="text-xs text-muted-foreground mt-2">14:15 • Risk Score: 62%</div>
                </div>
                <Button size="sm" variant="outline">Dismiss</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Submissions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Submissions</CardTitle>
          <CardDescription>Last hour across all active assessments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentSubmissions.map((sub, i) => (
              <div key={i} className="flex items-center justify-between border-b last:border-0 pb-4">
                <div>
                  <div className="font-medium">{sub.student}</div>
                  <div className="text-sm text-muted-foreground">{sub.assessment}</div>
                </div>
                <div className="text-right">
                  <Badge variant="outline">{sub.status}</Badge>
                  <div className="text-xs text-muted-foreground mt-1">{sub.time}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}