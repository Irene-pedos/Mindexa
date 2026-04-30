// components/mindexa/dashboard/student-summary-cards.tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar, Clock, Award, BookOpen } from "lucide-react";

import { StudentDashboardSummary } from "@/lib/api/student";

export function StudentSummaryCards({
  summary,
}: {
  summary?: StudentDashboardSummary;
}) {
  const stats = [
    {
      title: "Upcoming Assessments",
      value: summary?.active_assessments_count ?? "0",
      description: "Available now",
      icon: Calendar,
      trend: "",
      color: "text-blue-600",
    },
    {
      title: "Pending Results",
      value: summary?.pending_results_count ?? "0",
      description: "Assessments taken",
      icon: Clock,
      trend: "",
      color: "text-amber-600",
    },
    {
      title: "Current GPA",
      value: summary?.cgpa?.toFixed(2) ?? "0.00",
      description: "Semester average",
      icon: Award,
      trend: "",
      color: "text-emerald-600",
    },
    {
      title: "Credits Earned",
      value: summary?.total_credits ?? "0",
      description: "Total progress",
      icon: BookOpen,
      trend: "",
      color: "text-violet-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <Card key={i} className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>{stat.title}</CardDescription>
            <stat.icon className={`size-5 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold tabular-nums tracking-tighter">
              {stat.value}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{stat.description}</span>
              {stat.trend && (
                <span className="text-xs text-emerald-600 font-medium">
                  {stat.trend}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
