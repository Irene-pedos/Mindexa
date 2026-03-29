// app/admin/analytics/page.tsx
"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartBarMultiple } from "@/components/chart-bar-multiple" // We'll use your provided chart
import { TrendingUp, Users, BookOpen, Shield } from "lucide-react"

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Platform Analytics</h1>
        <p className="text-muted-foreground mt-1">Institution-wide usage, performance, and integrity insights</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardDescription>Total Active Users</CardDescription>
            <Users className="size-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold tabular-nums">3,284</div>
            <p className="text-xs text-emerald-600 mt-1">↑ 8.2% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardDescription>Assessments Conducted</CardDescription>
            <BookOpen className="size-5 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold tabular-nums">142</div>
            <p className="text-xs text-emerald-600 mt-1">This semester</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardDescription>Integrity Violations</CardDescription>
            <Shield className="size-5 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold tabular-nums text-red-600">47</div>
            <p className="text-xs text-muted-foreground mt-1">-12% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardDescription>Avg. Session Duration</CardDescription>
            <TrendingUp className="size-5 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold tabular-nums">47 min</div>
            <p className="text-xs text-muted-foreground mt-1">Across all assessments</p>
          </CardContent>
        </Card>
      </div>

      {/* Your Bar Chart */}
      <ChartBarMultiple />

      <Card>
        <CardHeader>
          <CardTitle>Key Insights</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 rounded-xl bg-muted p-5">
              Highest usage period: <strong>March 2026</strong> (mid-semester assessments)
            </div>
            <div className="flex-1 rounded-xl bg-muted p-5">
              Most flagged assessments: <strong>Database Systems CAT</strong> (12 events)
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}