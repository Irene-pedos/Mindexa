// components/mindexa/dashboard/upcoming-assessments.tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { assessmentApi } from "@/lib/api/assessment";
import { Skeleton } from "@/components/ui/skeleton";

import {
  StudentActiveAttempt,
  StudentUpcomingAssessment,
} from "@/lib/api/student";

export function UpcomingAssessments({
  activeAttempts,
  upcomingAssessments,
}: {
  activeAttempts: StudentActiveAttempt[];
  upcomingAssessments: StudentUpcomingAssessment[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Assessments</CardTitle>
            <CardDescription>Active and upcoming tasks</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/student/assessments">View all</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active Attempts Section */}
        {activeAttempts.length > 0 && (
          <div className="space-y-3 mb-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">
              In Progress
            </h4>
            {activeAttempts.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between rounded-lg border-2 border-primary/30 bg-primary/5 p-4 hover:bg-primary/10 transition-colors group"
              >
                <div className="space-y-1 pr-4">
                  <div className="font-semibold leading-tight flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                    {item.assessment_title}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-4">
                    <span className="flex items-center gap-1 uppercase font-bold text-xs">
                      RESUME ATTEMPT
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-3">
                  <Badge className="bg-primary">{item.status}</Badge>
                  <Button size="sm" asChild>
                    <Link
                      href={`/student/assessments/${item.assessment_id}/take`}
                    >
                      Resume <PlayCircle className="ml-2 size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming Section */}
        <div className="space-y-3">
          {activeAttempts.length > 0 && (
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Available
            </h4>
          )}
          {upcomingAssessments.length === 0 && activeAttempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No upcoming assessments found.
            </p>
          ) : (
            upcomingAssessments.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors group"
              >
                <div className="space-y-1 pr-4">
                  <div className="font-medium leading-tight">{item.title}</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-4" />{" "}
                      {item.window_start
                        ? new Date(item.window_start).toLocaleDateString()
                        : "Available"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-4" /> {item.duration_minutes || 90}{" "}
                      min
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-3">
                  <Badge
                    variant={item.type === "CAT" ? "default" : "secondary"}
                  >
                    {item.type}
                  </Badge>

                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                  >
                    <Link href={`/student/assessments/${item.id}/take`}>
                      Start
                    </Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
