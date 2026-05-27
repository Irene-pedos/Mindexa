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
import { Calendar, Clock, PlayCircle, CheckCircle2, AlertTriangle, History, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { assessmentApi } from "@/lib/api/assessment";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { getAssessmentCategory, getAssessmentProgressStatus } from "@/lib/grading-architecture";

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

  // 1. In Progress
  const inProgress = activeAttempts.filter(a => a.status === 'IN_PROGRESS' || a.status === 'PAUSED');

  // 2. Available (Open but not started)
  const available = upcomingAssessments.filter(a => {
    const isStarted = (!a.window_start || new Date(a.window_start) <= now);
    const isNotEnded = (!a.window_end || new Date(a.window_end) >= now);
    const hasNoAttempt = !activeAttempts.some(att => att.assessment_id === a.id);
    return isStarted && isNotEnded && hasNoAttempt;
  });

  // 3. Upcoming
  const upcoming = upcomingAssessments.filter(a => 
    a.window_start && new Date(a.window_start) > now
  );

  // 4. Violations / Auto-Submitted
  const violations = activeAttempts.filter(a => a.status === 'TERMINATED' || a.status === 'AUTO_SUBMITTED');

  // 5. Missed
  const missed = upcomingAssessments.filter(a => {
    const hasEnded = a.window_end && new Date(a.window_end) < now;
    const noAttempt = !activeAttempts.some(att => att.assessment_id === a.id);
    return hasEnded && noAttempt;
  });

  return (
    <Card className="shadow-none border rounded-xl overflow-hidden">
      <CardHeader className="py-2.5 px-4 bg-muted/5 border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
               <History className="size-3" /> Assessment Command
            </CardTitle>
          </div>
          <Button variant="ghost" size="sm" className="h-6 text-[9px] font-bold uppercase px-2 rounded-lg" asChild>
            <Link href="/student/assessments">View Registry</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3 space-y-5">
        {/* Violations / Alerts */}
        {violations.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[9px] font-bold uppercase tracking-widest text-red-600 flex items-center gap-1.5 px-1">
              <ShieldAlert className="size-3" /> Integrity Violations
            </h4>
            {violations.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/50 p-2.5 transition-all group"
              >
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="font-bold text-xs truncate text-red-800">
                    {item.assessment_title}
                  </div>
                  <div className="text-[9px] text-red-600/70 font-bold uppercase tracking-tighter">
                     Session Terminated • Pending Review
                  </div>
                </div>
                <Button variant="destructive" size="sm" className="h-7 px-3 text-[9px] font-bold uppercase rounded-lg shadow-none" asChild>
                  <Link href={`/student/results/${item.id}`}>Audit</Link>
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* 1. In Progress Section */}
        {inProgress.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[9px] font-bold uppercase tracking-widest text-primary flex items-center gap-1.5 px-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
              </span>
              In Progress
            </h4>
            {inProgress.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border bg-primary/5 p-2.5 hover:bg-primary/10 transition-all group"
              >
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="font-semibold text-xs truncate text-foreground/80">
                    {item.assessment_title}
                  </div>
                  <div className="text-[9px] text-muted-foreground flex items-center gap-2 font-medium">
                     <span className="font-bold text-primary uppercase text-[8px]">
                        {item.status === 'PAUSED' ? 'Paused' : 'Active Session'}
                     </span>
                     {item.course_code && (
                       <span className="opacity-60 uppercase tracking-tighter">
                         {item.course_code}
                       </span>
                     )}
                  </div>
                </div>

                <div className="flex shrink-0">
                  <Button size="sm" className="h-7 px-3 text-[9px] font-bold uppercase rounded-lg shadow-none" asChild>
                    <Link
                      href={
                        (item.assessment_type || '').toLowerCase().includes('group')
                          ? `/student/group-work/${item.assessment_id}`
                          : `/student/assessments/${item.assessment_id}/take`
                      }
                    >
                      Resume
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 2. Available Section */}
        {available.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 flex items-center gap-1 px-1">
              <CheckCircle2 className="size-3" />
              Open Sessions
            </h4>
            {available.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border p-2.5 hover:bg-muted/30 transition-all group"
              >
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="font-semibold text-xs truncate text-foreground/80">{item.title}</div>
                  <div className="text-[9px] text-muted-foreground flex items-center gap-2 font-medium">
                    <span className="flex items-center gap-1 uppercase tracking-tighter">
                      <Clock className="size-2.5" /> {item.duration_minutes || 90}m
                    </span>
                    <Badge variant="outline" className="text-[7px] h-3.5 px-1 uppercase font-bold tracking-tight opacity-70 rounded-md">
                      {item.type}
                    </Badge>
                  </div>
                </div>

                <div className="flex shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-[9px] font-bold uppercase rounded-lg border-muted/60"
                    asChild
                  >
                    <Link href={`/student/assessments/${item.id}/take`}>
                      Enter
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 3. Upcoming Soon Section */}
        {upcoming.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1 px-1">
              <Calendar className="size-3" />
              Scheduled
            </h4>
            {upcoming.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-dashed p-2.5 bg-muted/5 opacity-70"
              >
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="font-medium text-xs truncate text-muted-foreground/80">{item.title}</div>
                  <div className="text-[8px] text-muted-foreground flex items-center gap-2 font-semibold uppercase tracking-tight">
                    <span className="flex items-center gap-1">
                      <Clock className="size-2.5" />
                      {item.window_start
                        ? new Date(item.window_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : "TBD"}
                    </span>
                  </div>
                </div>

                <Badge variant="secondary" className="text-[7px] h-3.5 px-1 uppercase opacity-50 rounded-md">
                  {item.type}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* 5. Missed / Closed Section */}
        {missed.length > 0 && (
          <div className="space-y-2">
             <h4 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 flex items-center gap-1 px-1">
              <AlertTriangle className="size-3" /> Missed / Expired
            </h4>
            {missed.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border p-2.5 opacity-40 grayscale bg-muted/20"
              >
                 <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="font-medium text-xs truncate text-muted-foreground/80">{item.title}</div>
                  <div className="text-[7px] text-muted-foreground uppercase font-bold tracking-widest">
                     Window Closed
                  </div>
                </div>
                <Badge variant="outline" className="text-[7px] h-3.5 px-1 uppercase font-bold tracking-tight rounded-md">
                  {item.type}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {inProgress.length === 0 && available.length === 0 && upcoming.length === 0 && violations.length === 0 && missed.length === 0 && (
           <div className="py-10 text-center bg-muted/5 rounded-xl border border-dashed border-muted/30">
             <div className="size-8 rounded-full bg-muted/20 flex items-center justify-center mx-auto mb-2">
                <Clock className="size-4 text-muted-foreground/30" />
             </div>
             <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-[0.2em]">No activities found.</p>
           </div>
        )}
      </CardContent>
    </Card>
  );
}
