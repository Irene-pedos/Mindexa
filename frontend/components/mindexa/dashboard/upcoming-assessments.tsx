// components/mindexa/dashboard/upcoming-assessments.tsx
"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  PlayCircle,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { cn, formatAssessmentType } from "@/lib/utils";
import {
  StudentActiveAttempt,
  StudentUpcomingAssessment,
} from "@/lib/api/student";

interface UpcomingAssessmentsProps {
  activeAttempts: StudentActiveAttempt[];
  upcomingAssessments: StudentUpcomingAssessment[];
  submittedCount?: number;
}

export function UpcomingAssessments({
  activeAttempts = [],
  upcomingAssessments = [],
  submittedCount,
}: UpcomingAssessmentsProps) {
  const [currentTimestamp, setCurrentTimestamp] = React.useState<number>(0);

  React.useEffect(() => {
    setCurrentTimestamp(Date.now());
  }, [activeAttempts, upcomingAssessments]);

  const inProgress = useMemo(
    () => activeAttempts.filter((a) => a.status === "IN_PROGRESS" || a.status === "PAUSED"),
    [activeAttempts]
  );

  const violations = useMemo(
    () => activeAttempts.filter((a) => a.status === "TERMINATED" || a.status === "AUTO_SUBMITTED"),
    [activeAttempts]
  );

  const availableOpen = useMemo(() => {
    if (!currentTimestamp) return [];
    return upcomingAssessments.filter((a) => {
      const isStarted = !a.window_start || new Date(a.window_start).getTime() <= currentTimestamp;
      const isNotEnded = !a.window_end || new Date(a.window_end).getTime() >= currentTimestamp;
      const hasNoAttempt = !activeAttempts.some((att) => att.assessment_id === a.id);
      return isStarted && isNotEnded && hasNoAttempt;
    });
  }, [upcomingAssessments, activeAttempts, currentTimestamp]);

  const upcomingScheduled = useMemo(() => {
    if (!currentTimestamp) return [];
    return upcomingAssessments.filter(
      (a) => a.window_start && new Date(a.window_start).getTime() > currentTimestamp
    );
  }, [upcomingAssessments, currentTimestamp]);

  const activeTotalCount = inProgress.length + availableOpen.length;
  const upcomingTotalCount = upcomingScheduled.length;

  // Build Top 3 Priority queue:
  // 1. In progress
  // 2. Open now
  // 3. Upcoming soon
  // 4. Violations
  const priorityItems = useMemo(() => {
    const queue: Array<{
      id: string;
      title: string;
      type: string;
      courseCode?: string | null;
      courseName?: string | null;
      statusKind: "in_progress" | "open" | "upcoming" | "violation";
      actionUrl: string;
      actionLabel: string;
      metaText: string;
      statusTone: "primary" | "emerald" | "amber" | "destructive";
    }> = [];

    // 1. In Progress
    inProgress.forEach((item) => {
      queue.push({
        id: item.id,
        title: item.assessment_title,
        type: item.assessment_type || "Assessment",
        courseCode: item.course_code,
        courseName: item.course_name,
        statusKind: "in_progress",
        actionUrl: (item.assessment_type || "").toLowerCase().includes("group")
          ? `/student/group-work/${item.assessment_id}`
          : `/student/assessments/${item.assessment_id}/take`,
        actionLabel: item.status === "PAUSED" ? "Resume" : "Continue",
        metaText: item.status === "PAUSED" ? "Session paused" : "Session in progress",
        statusTone: "primary",
      });
    });

    // 2. Open Now
    availableOpen.forEach((item) => {
      queue.push({
        id: item.id,
        title: item.title,
        type: item.type || "Assessment",
        courseCode: item.course_code,
        courseName: item.course_name,
        statusKind: "open",
        actionUrl: `/student/assessments/${item.id}/take`,
        actionLabel: "Start",
        metaText: item.duration_minutes ? `${item.duration_minutes} min duration` : "Open window",
        statusTone: "emerald",
      });
    });

    // 3. Upcoming Scheduled
    upcomingScheduled.forEach((item) => {
      queue.push({
        id: item.id,
        title: item.title,
        type: item.type || "Assessment",
        courseCode: item.course_code,
        courseName: item.course_name,
        statusKind: "upcoming",
        actionUrl: "/student/assessments",
        actionLabel: "View",
        metaText: item.window_start
          ? `Starts ${new Date(item.window_start).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : "Scheduled soon",
        statusTone: "amber",
      });
    });

    // 4. Violations
    violations.forEach((item) => {
      queue.push({
        id: item.id,
        title: item.assessment_title,
        type: item.assessment_type || "Assessment",
        courseCode: item.course_code,
        courseName: item.course_name,
        statusKind: "violation",
        actionUrl: `/student/results/${item.id}`,
        actionLabel: "Review Audit",
        metaText: "Session terminated • Audit required",
        statusTone: "destructive",
      });
    });

    // Return only top 3 items
    return queue.slice(0, 3);
  }, [inProgress, availableOpen, upcomingScheduled, violations]);

  return (
    <Card className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
      <CardHeader className="py-3 px-4 bg-muted/20 border-b border-border/40 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <Layers className="size-3.5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xs font-semibold text-foreground tracking-tight">
              Assessment Command
            </CardTitle>
          </div>
        </div>

        {/* Counts summary chip */}
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[11px] font-medium px-2 py-0.5 rounded-md border-border/60 bg-background text-muted-foreground">
            <span className={cn("font-semibold mr-1", activeTotalCount > 0 ? "text-primary" : "text-foreground")}>
              {activeTotalCount} Active
            </span>
            &bull;
            <span className="ml-1 font-medium text-muted-foreground">
              {upcomingTotalCount} Upcoming
            </span>
            {submittedCount !== undefined && submittedCount > 0 && (
              <>
                <span className="mx-1 text-muted-foreground/50">&bull;</span>
                <span className="font-medium text-muted-foreground">
                  {submittedCount} Submitted
                </span>
              </>
            )}
          </Badge>
          <Button variant="ghost" size="sm" className="h-7 text-xs font-medium px-2 text-primary hover:text-primary gap-1" asChild>
            <Link href="/student/assessments">
              Registry <ArrowRight className="size-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4 space-y-2.5">
        {priorityItems.length > 0 ? (
          <div className="space-y-2">
            {priorityItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-background/80 hover:bg-muted/30 transition-colors gap-3 group"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {item.courseCode && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {item.courseCode}
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                        item.statusTone === "primary" && "bg-primary/10 text-primary border-primary/20",
                        item.statusTone === "emerald" && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                        item.statusTone === "amber" && "bg-amber-500/10 text-amber-600 border-amber-500/20",
                        item.statusTone === "destructive" && "bg-destructive/10 text-destructive border-destructive/20"
                      )}
                    >
                      {item.type}
                    </Badge>
                  </div>

                  <div className="text-xs sm:text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {item.title}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="size-3 text-muted-foreground/70 shrink-0" />
                    <span className="truncate">{item.metaText}</span>
                  </div>
                </div>

                <div className="shrink-0">
                  {item.statusKind === "in_progress" ? (
                    <Button size="sm" className="h-8 text-xs font-semibold px-3.5 rounded-lg shadow-xs" asChild>
                      <Link href={item.actionUrl}>{item.actionLabel}</Link>
                    </Button>
                  ) : item.statusKind === "open" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs font-semibold px-3.5 rounded-lg border-primary/30 text-primary hover:bg-primary/10"
                      asChild
                    >
                      <Link href={item.actionUrl}>{item.actionLabel}</Link>
                    </Button>
                  ) : item.statusKind === "violation" ? (
                    <Button size="sm" variant="destructive" className="h-8 text-xs font-semibold px-3 rounded-lg" asChild>
                      <Link href={item.actionUrl}>{item.actionLabel}</Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-8 text-xs font-medium px-3 rounded-lg text-muted-foreground hover:text-foreground" asChild>
                      <Link href={item.actionUrl}>{item.actionLabel}</Link>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 px-4 text-center rounded-xl border border-dashed border-border/70 bg-muted/10 space-y-2.5">
            <div className="size-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle2 className="size-4.5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-semibold text-foreground">
                All Assessments Up to Date
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                You have no active assessments or upcoming deadlines right now. All previous assessments are recorded in your registry.
              </p>
            </div>
            <div className="pt-1">
              <Button asChild variant="outline" size="sm" className="h-7.5 text-xs font-medium rounded-lg border-border/70">
                <Link href="/student/assessments">View Assessment Registry</Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
