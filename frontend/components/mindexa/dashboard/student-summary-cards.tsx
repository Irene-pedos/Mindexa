// components/mindexa/dashboard/student-summary-cards.tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
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
      title: "Assessments",
      value: summary?.active_assessments_count.value ?? 0,
      description: "Available now",
      icon: Calendar,
      color: "text-primary",
    },
    {
      title: "Completed",
      value: summary?.completed_assessments_count.value ?? 0,
      description: "Registry finalized",
      icon: Clock,
      color: "text-muted-foreground",
    },
    {
      title: "CGPA",
      value: (summary?.cgpa.value ?? 0).toFixed(2),
      description: "Academic average",
      icon: Award,
      color: "text-primary",
    },
    {
      title: "Performance",
      value: `${summary?.avg_performance_percent.value ?? 0}%`,
      description: "Success rate",
      icon: BookOpen,
      color: "text-primary",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <Card key={i} className="shadow-none border border-border/50 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate">{stat.title}</span>
            <stat.icon className={`size-3.5 ${stat.color} opacity-70`} />
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <div className="text-2xl font-bold tabular-nums tracking-tight text-foreground/90">
              {stat.value}
            </div>
            <div className="mt-0.5 text-[10px] font-medium text-muted-foreground truncate">
              {stat.description}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
