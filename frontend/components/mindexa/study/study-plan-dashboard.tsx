"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Calendar as CalendarIcon,
  Clock,
  Sparkles,
  Flame,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  Plus,
  RefreshCcw,
  SlidersHorizontal,
  Play,
  Pause,
  StopCircle,
  AlertTriangle,
  Award,
  Zap,
  TrendingUp,
  FileText,
} from "lucide-react";
import {
  StudyPlan,
  StudySession,
  StudyPlannerSummary,
} from "@/lib/api/study-planner";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

import { useRouter } from "next/navigation";

interface StudyPlanDashboardProps {
  summary: StudyPlannerSummary | null;
  onOpenWizard: (assessmentId?: string) => void;
  onOpenCompleteModal: (session: StudySession) => void;
  onOpenAdjustModal: (plan: StudyPlan) => void;
  onSelectTab: (tab: string, contextTopic?: string) => void;
}

export function StudyPlanDashboard({
  summary,
  onOpenWizard,
  onOpenCompleteModal,
  onOpenAdjustModal,
  onSelectTab,
}: StudyPlanDashboardProps) {
  const router = useRouter();
  const activePlan = summary?.active_plan;
  const todaySession = summary?.today_session;
  const readinessScore = summary?.assessment_readiness_score ?? 0;
  const weakTopics = summary?.weak_topics || [];
  const proactive = summary?.proactive_suggestion;
  const conflicts = summary?.schedule_conflicts || [];
  const readinessTimeline = summary?.readiness_timeline || [];
  const materialCoverage = summary?.material_coverage || [];

  const totalSessions =
    activePlan?.sessions.length || summary?.total_sessions_count || 0;
  const completedSessions =
    activePlan?.sessions.filter((s) => s.status === "COMPLETED").length ||
    summary?.completed_sessions_count ||
    0;
  const progressPercent =
    totalSessions > 0
      ? Math.round((completedSessions / totalSessions) * 100)
      : 0;

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-300">
      {/* Proactive Study Plan Suggestion Banner */}
      {proactive && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-background shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary text-white shrink-0">
              <Sparkles className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-[9px] uppercase font-bold bg-primary/10 text-primary border-primary/20"
                >
                  New Assessment Published
                </Badge>
                <span className="text-xs font-bold text-foreground">
                  {proactive.title} ({proactive.course_code})
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Would you like AI to generate a targeted study plan to prepare
                for this assessment?
              </p>
            </div>
          </div>
          <Button
            onClick={() => onOpenWizard(proactive.id)}
            size="sm"
            className="h-9 px-4 text-xs font-bold uppercase tracking-wider rounded-xl shrink-0 shadow-sm gap-1.5"
          >
            <Zap className="size-3.5" /> 1-Click Generate Plan
          </Button>
        </div>
      )}

      {/* Top Banner Overview & Sticky Continue Bar */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-primary/5 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5"
              >
                <Sparkles className="size-3 mr-1" /> AI Personal Academic Coach
              </Badge>
              {summary && summary.streak_days > 0 && (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 flex items-center gap-1"
                >
                  <Flame className="size-3 text-amber-500" />{" "}
                  {summary.streak_days} Day Streak (Consistent Learner)
                </Badge>
              )}
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
              {activePlan
                ? activePlan.title
                : "AI Personal Study Operating System"}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
              {activePlan
                ? `Pace: ${activePlan.preferred_difficulty} • Daily Goal: ${activePlan.daily_goal}`
                : "Plan, organize, and track your study goals across all your assessments and courses."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {todaySession && (
              <Button
                onClick={() =>
                  router.push(`/student/study/session/${todaySession.id}`)
                }
                className="h-10 px-4 text-xs font-bold uppercase tracking-wider rounded-xl shadow-md gap-2 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 text-primary-foreground"
              >
                <Play className="size-3.5 fill-white" /> Start Guided Study
                Session
              </Button>
            )}
            <Button
              onClick={() => onOpenWizard()}
              variant="outline"
              className="h-10 px-4 text-xs font-bold uppercase tracking-wider rounded-xl border-border/60 gap-2 bg-background/80"
            >
              <Plus className="size-4" /> New Plan
            </Button>
          </div>
        </div>

        {/* Active Plan Progress Bar & Readiness Badge */}
        {activePlan && (
          <div className="mt-6 pt-5 border-t border-border/40 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-foreground flex items-center gap-2">
                <BookOpen className="size-3.5 text-primary" />
                Study Plan Progress
              </span>
              <span className="text-primary font-bold">
                {progressPercent}% ({completedSessions} / {totalSessions}{" "}
                Sessions)
              </span>
            </div>
            <Progress
              value={progressPercent}
              className="h-2.5 rounded-full bg-primary/10"
            />
          </div>
        )}
      </div>

      {/* Readiness Score & Timeline Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Assessment Readiness Score Widget & Timeline */}
        <Card className="lg:col-span-8 rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-primary flex items-center gap-2">
              <Award className="size-4 text-primary" /> Assessment Readiness
              Progress Timeline
            </div>
            <Badge
              variant="outline"
              className="text-[9px] uppercase font-bold bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
            >
              {readinessScore >= 80 ? "Strong Preparedness" : "Needs Review"}
            </Badge>
          </div>

          {readinessTimeline.length > 1 ? (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
              {readinessTimeline.map((pt, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-border/30 bg-card/40 text-center space-y-1"
                >
                  <span className="text-[10px] text-muted-foreground font-bold uppercase">
                    {pt.label}
                  </span>
                  <div className="text-xl font-bold text-foreground tabular-nums">
                    {pt.score}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 text-center space-y-1">
              <span className="text-[10px] text-primary font-bold uppercase tracking-wider block">
                Initial Readiness Baseline ({readinessScore}%)
              </span>
              <p className="text-xs text-muted-foreground font-medium">
                Complete study sessions & knowledge checks to build your multi-point readiness trend timeline.
              </p>
            </div>
          )}

          {weakTopics.length > 0 && (
            <div className="text-[11px] text-muted-foreground font-medium pt-1 flex items-center gap-2">
              <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
              <span>
                Recommended revision topics:{" "}
                <strong className="text-foreground">
                  {weakTopics.join(", ")}
                </strong>
              </span>
            </div>
          )}
        </Card>

        {/* Learning Material Coverage Tracker */}
        <Card className="lg:col-span-4 rounded-xl border border-border/40 bg-card/30 p-4 space-y-3 shadow-sm">
          <div className="text-xs font-bold text-foreground flex items-center gap-2">
            <FileText className="size-4 text-primary" /> Lecturer Material
            Coverage
          </div>
          <div className="space-y-2.5 pt-1">
            {materialCoverage.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-[11px] font-semibold">
                  <span className="text-foreground">
                    {item.course_code} - {item.course_title}
                  </span>
                  <span className="text-primary font-bold">
                    {item.covered_count}/{item.total_count} ({item.percentage}%)
                  </span>
                </div>
                <Progress
                  value={item.percentage}
                  className="h-2 rounded-full bg-primary/10"
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Main Grid: Live Session & Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Today's Featured Study Session Card */}
        <Card className="lg:col-span-6 rounded-xl border border-border/45 bg-card/30 overflow-hidden shadow-sm">
          <CardHeader className="bg-primary/5 border-b border-border/25 py-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
              <CalendarIcon className="size-4" /> Today&apos;s Focus Session
            </CardTitle>
            {activePlan && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenAdjustModal(activePlan)}
                className="h-7 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                <SlidersHorizontal className="size-3 mr-1" /> Adjust Plan
              </Button>
            )}
          </CardHeader>

          <CardContent className="p-5">
            {todaySession ? (
              <div className="space-y-6">
                {/* Schedule Conflict Warning Banner */}
                {summary?.schedule_conflicts &&
                  summary.schedule_conflicts.length > 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm animate-in fade-in duration-300">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-300 block">
                            Schedule Conflict Detected
                          </span>
                          {summary.schedule_conflicts.map((c, i) => (
                            <p
                              key={i}
                              className="text-xs text-foreground/90 font-medium"
                            >
                              <strong>{c.session_a_title}</strong> overlaps with{" "}
                              <strong>{c.session_b_title}</strong> (
                              {c.overlap_time}).
                            </p>
                          ))}
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Tip: Reschedule one session to a different time
                            (e.g. 20:00) or date to resolve the conflict without
                            affecting any other study plan.
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSelectTab("plans")}
                        className="text-xs font-bold border-amber-500/40 bg-background text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 shrink-0"
                      >
                        Reschedule Session
                      </Button>
                    </div>
                  )}

                {/* Hero OS Header & Coach Recommendation */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Badge
                      variant="outline"
                      className="text-[9px] uppercase font-bold px-2 py-0.5 bg-primary/10 text-primary border-primary/20 mb-2"
                    >
                      {todaySession.session_type} SESSION
                    </Badge>
                    <h3 className="text-base font-bold text-foreground tracking-tight">
                      {todaySession.title}
                    </h3>
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                      Topic:{" "}
                      <span className="text-foreground font-semibold">
                        {todaySession.topic}
                      </span>{" "}
                      &bull; {todaySession.duration_minutes} mins
                    </p>
                  </div>
                  <Badge
                    variant={
                      todaySession.status === "COMPLETED"
                        ? "outline"
                        : "default"
                    }
                    className={cn(
                      "text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0",
                      todaySession.status === "COMPLETED"
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        : "",
                    )}
                  >
                    {todaySession.status}
                  </Badge>
                </div>

                {/* Direct Action Launch Card */}
                <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-primary" /> Guided
                      Learning Workspace
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      Structured teaching, interactive practice, and evaluation.
                    </p>
                  </div>
                  {todaySession.status === "COMPLETED" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        router.push(`/student/study/session/${todaySession.id}`)
                      }
                      className="text-xs font-bold gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 shrink-0"
                    >
                      <CheckCircle2 className="size-3.5 text-emerald-500" />{" "}
                      Review Completed Session
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() =>
                        router.push(`/student/study/session/${todaySession.id}`)
                      }
                      className="text-xs font-bold gap-1.5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 text-primary-foreground shadow-sm shrink-0"
                    >
                      <Play className="size-3.5 fill-white" /> Start Studying
                    </Button>
                  )}
                </div>

                {/* Quick Action Controls */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => onOpenCompleteModal(todaySession)}
                    className="h-8 text-xs font-semibold rounded-lg gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <CheckCircle2 className="size-3.5" /> Self-Report Status
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center space-y-3">
                <CheckCircle2 className="mx-auto size-8 text-muted-foreground/30" />
                <p className="text-xs font-semibold text-muted-foreground">
                  No study session scheduled for today.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenWizard()}
                  className="h-8 text-xs font-semibold rounded-lg"
                >
                  Schedule a Session
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Next Upcoming Sessions Timeline & Habit Heatmap */}
        <Card className="lg:col-span-6 rounded-xl border border-border/45 bg-card/30 overflow-hidden shadow-sm">
          <CardHeader className="border-b border-border/25 py-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Clock className="size-4" /> Upcoming Session Timeline
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelectTab("plans")}
              className="h-7 text-[10px] font-bold uppercase tracking-wider text-primary"
            >
              View Full Plan →
            </Button>
          </CardHeader>

          <CardContent className="p-4 space-y-3">
            {/* Weekly Habit Heatmap */}
            <div className="p-3 rounded-xl border border-border/30 bg-muted/10 space-y-1.5">
              {(() => {
                const weeklyActivity = summary?.weekly_study_activity || [false, false, false, false, false, false, false];
                const activeDaysCount = weeklyActivity.filter(Boolean).length;

                return (
                  <>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                      <span>Weekly Study Habits Heatmap</span>
                      <span className="text-primary font-bold">
                        {activeDaysCount} Day{activeDaysCount === 1 ? "" : "s"} Active
                      </span>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                        (d, i) => {
                          const isActive = weeklyActivity[i] ?? false;
                          return (
                            <div key={d} className="space-y-1">
                              <span className="text-muted-foreground">{d}</span>
                              <div
                                className={cn(
                                  "h-5 rounded-md flex items-center justify-center font-bold text-[9px]",
                                  isActive
                                    ? "bg-primary text-white"
                                    : "bg-muted/30 text-muted-foreground/40",
                                )}
                              >
                                {isActive ? "✓" : "-"}
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            {activePlan?.sessions && activePlan.sessions.length > 0 ? (
              activePlan.sessions.slice(0, 3).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-card/20 hover:bg-card/40 transition-colors"
                >
                  <div className="space-y-0.5 flex-1 min-w-0 pr-3">
                    <div className="font-semibold text-xs text-foreground truncate flex items-center gap-2">
                      <span>{s.title}</span>
                      <Badge
                        variant="outline"
                        className="text-[8px] uppercase px-1.5 h-4"
                      >
                        {s.session_type}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-2">
                      <span>
                        {format(parseISO(s.scheduled_start), "MMM d • HH:mm")}
                      </span>
                      <span>•</span>
                      <span>{s.duration_minutes} min</span>
                    </div>
                  </div>
                  <Badge
                    variant={s.status === "COMPLETED" ? "outline" : "secondary"}
                    className={cn(
                      "text-[9px] uppercase font-bold shrink-0",
                      s.status === "COMPLETED"
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        : "",
                    )}
                  >
                    {s.status}
                  </Badge>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs font-medium text-muted-foreground">
                No active plan sessions available. Create a plan to start.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
