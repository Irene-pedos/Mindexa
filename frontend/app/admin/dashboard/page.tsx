// app/admin/dashboard/page.tsx
"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Users, BookOpen, Shield, Activity, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"

const systemMetrics = [
  { label: "Total Students", value: "2,847", change: "+124 this week", icon: Users, color: "text-blue-600" },
  { label: "Active Courses", value: "87", change: "4 new", icon: BookOpen, color: "text-emerald-600" },
  { label: "Lecturers", value: "142", change: "2 pending approval", icon: Users, color: "text-violet-600" },
  { label: "Flagged Events", value: "19", change: "Today", icon: AlertTriangle, color: "text-red-600" },
]

const recentActivity = [
  { action: "New student registered", details: "ID: S3921 • Computer Science", time: "14 min ago" },
  { action: "Assessment published", details: "Database Systems CAT", time: "2 hours ago" },
  { action: "Integrity alert resolved", details: "Student S2847 – Tab switching", time: "Yesterday" },
]

export default function AdminDashboard() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Institutional Oversight</h1>
        <p className="text-muted-foreground mt-1">Platform-wide visibility and control</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {systemMetrics.map((m, i) => (
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
        {/* Platform Activity Chart */}
        <div className="lg:col-span-7">
          <ChartAreaInteractive />
        </div>

        {/* Quick Actions */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Platform Management</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Button asChild size="lg" className="h-20 flex-col gap-1">
              <Link href="/admin/users">Manage Users</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-20 flex-col gap-1">
              <Link href="/admin/courses">Courses & Classes</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-20 flex-col gap-1">
              <Link href="/admin/integrity">View Integrity Logs</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-20 flex-col gap-1">
              <Link href="/admin/analytics">Full Analytics</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Platform Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Platform Activity</CardTitle>
          <CardDescription>Last 24 hours across the entire institution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {recentActivity.map((activity, i) => (
              <div key={i} className="flex items-center gap-5 border-b last:border-0 pb-5">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Activity className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{activity.action}</div>
                  <div className="text-sm text-muted-foreground">{activity.details}</div>
                </div>
                <div className="text-xs text-muted-foreground">{activity.time}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* System Health */}
      <Card className="border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30">
        <CardContent className="p-6 flex items-center gap-4">
          <Shield className="size-8 text-emerald-600" />
          <div>
            <p className="font-medium">System Status: Healthy</p>
            <p className="text-sm text-muted-foreground">All services operational • Last backup: 2 hours ago • Zero critical alerts</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}