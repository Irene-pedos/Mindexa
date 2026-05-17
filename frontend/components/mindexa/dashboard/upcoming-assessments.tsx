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
import { Calendar, Clock, PlayCircle, CheckCircle2 } from "lucide-react";
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
  const now = new Date();

  const availableNow = upcomingAssessments.filter(a => 
    !a.window_start || new Date(a.window_start) <= now
  );

  const upcomingSoon = upcomingAssessments.filter(a => 
    a.window_start && new Date(a.window_start) > now
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Assessments</CardTitle>
            <CardDescription>Your current and upcoming academic tasks</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/student/assessments">View all</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 1. In Progress Section */}
        {activeAttempts.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              In Progress
            </h4>
            {activeAttempts.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between rounded-xl border-2 border-primary/20 bg-primary/5 p-4 hover:bg-primary/10 transition-all group shadow-sm"
              >
                <div className="space-y-1 pr-4">
                  <div className="font-bold text-base leading-tight">
                    {item.assessment_title}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-4">
                     <span className="flex items-center gap-1 font-medium text-primary">
                        {item.status === 'PAUSED' ? 'Paused - Ready to resume' : 'Active session'}
                     </span>
                     {item.course_code && (
                       <span className="font-mono bg-primary/10 px-1.5 py-0.5 rounded text-[10px]">
                         {item.course_code}
                       </span>
                     )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-3">
                  <Button size="sm" className="rounded-full px-4" asChild>
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

        {/* 2. Available Section */}
        {availableNow.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 flex items-center gap-2">
              <CheckCircle2 className="size-3" />
              Available Now
            </h4>
            {availableNow.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between rounded-xl border p-4 hover:border-emerald-500/50 hover:bg-emerald-50/30 transition-all group"
              >
                <div className="space-y-1 pr-4">
                  <div className="font-semibold leading-tight">{item.title}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" /> {item.duration_minutes || 90} min
                    </span>
                    {item.course_code && (
                       <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                         {item.course_code}
                       </span>
                    )}
                    <Badge variant="outline" className="text-[9px] h-4 uppercase font-bold">
                      {item.type}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="rounded-full px-5 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-all"
                  >
                    <Link href={`/student/assessments/${item.id}/take`}>
                      Start
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 3. Upcoming Soon Section */}
        {upcomingSoon.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Calendar className="size-3" />
              Coming Soon
            </h4>
            {upcomingSoon.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between rounded-xl border border-dashed p-4 bg-muted/20 opacity-80"
              >
                <div className="space-y-1 pr-4">
                  <div className="font-medium text-sm leading-tight text-muted-foreground">{item.title}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />{" "}
                      {item.window_start
                        ? new Date(item.window_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : "TBD"}
                    </span>
                    {item.course_code && (
                       <span className="font-mono bg-muted/50 px-1.5 py-0.5 rounded text-[10px]">
                         {item.course_code}
                       </span>
                    )}
                  </div>
                </div>

                <Badge variant="secondary" className="text-[9px] uppercase">
                  {item.type}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {activeAttempts.length === 0 && availableNow.length === 0 && upcomingSoon.length === 0 && (
           <div className="py-8 text-center">
             <p className="text-sm text-muted-foreground">No assessments scheduled at this time.</p>
           </div>
        )}
      </CardContent>
    </Card>
  );
}
