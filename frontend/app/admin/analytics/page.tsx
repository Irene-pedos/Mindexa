// app/admin/analytics/page.tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartBarMultiple } from "@/components/chart-bar-multiple"; // We'll use your provided chart
import { ChartLineMultiple } from "@/components/chart-line-multiple";
import { TrendingUp, Users, BookOpen, Shield } from "lucide-react";

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Platform Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Institution-wide usage, performance, and integrity insights
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Active Users
            </CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">3,284</div>
            <p className="text-xs text-muted-foreground mt-1">
              ↑ 8.2% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Assessments Conducted
            </CardTitle>
            <BookOpen className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">142</div>
            <p className="text-xs text-muted-foreground mt-1">This semester</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Integrity Violations
            </CardTitle>
            <Shield className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">47</div>
            <p className="text-xs text-muted-foreground mt-1">
              -12% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg. Session Duration
            </CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">47 min</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all assessments
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartBarMultiple />
        <ChartLineMultiple />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Key Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg bg-muted p-4 text-sm">
              Highest usage period: <strong>March 2026</strong> (mid-semester
              assessments)
            </div>
            <div className="rounded-lg bg-muted p-4 text-sm">
              Most flagged assessments: <strong>Database Systems CAT</strong>{" "}
              (12 events)
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
