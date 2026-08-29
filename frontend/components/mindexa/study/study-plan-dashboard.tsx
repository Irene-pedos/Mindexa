"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  Plus,
  SlidersHorizontal,
  Play,
  AlertTriangle,
  Award,
  Zap,
  FileText,
  ChevronDown,
  ChevronUp,
  TrendingUp,
} from "lucide-react";
import {
  StudyPlan,
  StudySession,
  StudyPlannerSummary,
  LearningUnit,
  studyPlannerApi,
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

  const [learningUnits, setLearningUnits] = useState<LearningUnit[]>([]);
  const [timelineExpanded, setTimelineExpanded] = useState(true);
  const [coverageExpanded, setCoverageExpanded] = useState(false);
  const [habitsExpanded, setHabitsExpanded] = useState(true);
  const [upcomingExpanded, setUpcomingExpanded] = useState(true);

  useEffect(() => {
    const wsId = activePlan?.teaching_workspace_id || activePlan?.course_id;
    if (wsId) {
      studyPlannerApi
        .getLearningUnits(wsId)
        .then(setLearningUnits)
        .catch(() => setLearningUnits([]));
    }
  }, [activePlan?.teaching_workspace_id, activePlan?.course_id]);

  const totalSessions =
    activePlan?.sessions?.length ?? summary?.total_sessions_count ?? 0;
  const completedSessions =
    activePlan?.sessions?.filter((s) => s.status === "COMPLETED").length ??
    summary?.completed_sessions_count ??
    0;
  const progressPercent =
    totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

  // No data state
  if (!summary && !activePlan) {
    return (
      <div className="py-14 text-center space-y-3 border border-dashed border-border/40 rounded-xl">
        <BookOpen className="mx-auto size-7 text-muted-foreground/20" />
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">No active study plan</p>
          <p className="text-[11px] text-muted-foreground/60">
            Create a plan to track progress and get AI coaching.
          </p>
        </div>
        <Button size="sm" onClick={() => onOpenWizard()} className="h-8 text-xs gap-1.5">
          <Plus className="size-3.5" /> Create Study Plan
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full animate-in fade-in duration-300">

      {/* Proactive Suggestion Banner */}
      {proactive && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-border/50 bg-muted/20">
          <div className="flex items-start gap-2.5">
            <Sparkles className="size-3.5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-foreground">
                New assessment: <span className="text-primary">{proactive.title}</span>{" "}
                <span className="text-muted-foreground">({proactive.course_code})</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Would you like AI to generate a targeted study plan?
              </p>
            </div>
          </div>
          <Button
            onClick={() => onOpenWizard(proactive.id)}
            size="sm"
            className="h-7 text-xs gap-1.5 shrink-0"
          >
            <Zap className="size-3" /> Generate Plan
          </Button>
        </div>
      )}

      {/* Overview Banner */}
      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {summary && summary.streak_days > 0 && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Flame className="size-3 text-amber-500" />
                  {summary.streak_days} day streak
                </div>
              )}
              {readinessScore > 0 && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Award className="size-3" />
                  {readinessScore}% readiness
                </div>
              )}
            </div>
            <h2 className="text-sm font-semibold text-foreground tracking-tight">
              {activePlan ? activePlan.title : "AI Personal Study OS"}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {activePlan
                ? `${activePlan.preferred_difficulty} pace · ${activePlan.daily_goal}`
                : "Plan, organize, and track your study goals across all courses."}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {todaySession && (
              <Button
                onClick={() => router.push(`/student/study/session/${todaySession.id}`)}
                size="sm"
                className="h-8 text-xs gap-1.5"
              >
                <Play className="size-3 fill-current" /> Start Session
              </Button>
            )}
            <Button
              onClick={() => onOpenWizard()}
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 border-border/60"
            >
              <Plus className="size-3.5" /> New Plan
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        {activePlan && (
          <div className="space-y-1.5 pt-1 border-t border-border/30">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <BookOpen className="size-3" /> Plan progress
              </span>
              <span className="font-medium text-foreground">
                {completedSessions}/{totalSessions} sessions · {progressPercent}%
              </span>
            </div>
            <Progress value={progressPercent} className="h-1.5 rounded-full" />
          </div>
        )}
      </div>

      {/* Conflict Warning */}
      {conflicts.length > 0 && (
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Schedule conflict detected</p>
              {conflicts.map((c, i) => (
                <p key={i} className="text-[11px] text-muted-foreground">
                  <span className="font-medium">{c.session_a_title}</span> overlaps with{" "}
                  <span className="font-medium">{c.session_b_title}</span> ({c.overlap_time})
                </p>
              ))}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSelectTab("plans")}
            className="h-7 text-xs border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 shrink-0"
          >
            Resolve
          </Button>
        </div>
      )}

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Today's Session Card */}
        <Card className="rounded-xl border border-border/50 shadow-none overflow-hidden">
          <CardHeader className="px-4 py-3 border-b border-border/40 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <CalendarIcon className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">Today&apos;s Session</span>
            </div>
            {activePlan && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenAdjustModal(activePlan)}
                className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground gap-1"
              >
                <SlidersHorizontal className="size-3" /> Adjust
              </Button>
            )}
          </CardHeader>

          <CardContent className="p-4">
            {todaySession ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <Badge variant="secondary" className="text-[9px] uppercase font-medium mb-1">
                        {todaySession.session_type}
                      </Badge>
                      <p className="text-sm font-medium text-foreground leading-snug">
                        {todaySession.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Topic: {todaySession.topic} · {todaySession.duration_minutes}m
                        {todaySession.source_material_ids && todaySession.source_material_ids.length > 0 && (
                          <span className="ml-1">· <FileText className="inline size-2.5" /> {todaySession.source_material_ids.length} materials</span>
                        )}
                      </p>
                    </div>
                    <Badge
                      variant={todaySession.status === "COMPLETED" ? "outline" : "secondary"}
                      className={cn(
                        "text-[9px] uppercase shrink-0",
                        todaySession.status === "COMPLETED" && "text-emerald-600 border-emerald-500/30"
                      )}
                    >
                      {todaySession.status}
                    </Badge>
                  </div>
                </div>

                {/* Session CTA */}
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-medium text-foreground">Guided Learning Workspace</p>
                    <p className="text-[10px] text-muted-foreground">Structured teaching · practice · evaluation</p>
                  </div>
                  {todaySession.status === "COMPLETED" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/student/study/session/${todaySession.id}`)}
                      className="h-7 text-[11px] gap-1 border-border/60 shrink-0"
                    >
                      <CheckCircle2 className="size-3" /> Review
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => router.push(`/student/study/session/${todaySession.id}`)}
                      className="h-7 text-[11px] gap-1 shrink-0"
                    >
                      <Play className="size-3 fill-current" /> Start
                    </Button>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenCompleteModal(todaySession)}
                    className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground gap-1"
                  >
                    <CheckCircle2 className="size-3" /> Self-report status
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center space-y-2">
                <CheckCircle2 className="mx-auto size-7 text-muted-foreground/20" />
                <p className="text-[11px] text-muted-foreground">No session scheduled for today.</p>
                <Button variant="outline" size="sm" onClick={() => onOpenWizard()} className="h-7 text-xs">
                  Schedule a session
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column: Timeline + Habits */}
        <div className="space-y-3">

          {/* Readiness Timeline — collapsible */}
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <button
              onClick={() => setTimelineExpanded(!timelineExpanded)}
              className="w-full flex items-center justify-between px-4 py-3 border-b border-border/40 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Award className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Readiness Timeline</span>
                <Badge variant="outline" className={cn(
                  "text-[9px] font-medium border-border/60",
                  readinessScore >= 80 ? "text-emerald-600" : "text-muted-foreground"
                )}>
                  {readinessScore}%
                </Badge>
              </div>
              {timelineExpanded
                ? <ChevronUp className="size-3.5 text-muted-foreground" />
                : <ChevronDown className="size-3.5 text-muted-foreground" />}
            </button>
            {timelineExpanded && (
              <div className="p-4 space-y-3">
                {readinessTimeline.length > 1 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {readinessTimeline.map((pt, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg border border-border/40 bg-muted/10 text-center space-y-0.5">
                        <span className="text-[10px] text-muted-foreground">{pt.label}</span>
                        <div className="text-base font-semibold text-foreground tabular-nums">{pt.score}%</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-border/40 bg-muted/10 text-center space-y-1">
                    <p className="text-[11px] font-medium text-foreground">Baseline: {readinessScore}%</p>
                    <p className="text-[10px] text-muted-foreground">
                      Complete sessions to build your readiness trend.
                    </p>
                  </div>
                )}
                {weakTopics.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="size-3 text-amber-500 shrink-0" />
                      <span>Revision Needed:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {weakTopics.map((topic, tIdx) => (
                        <button
                          key={tIdx}
                          type="button"
                          onClick={() =>
                            router.push(
                              `/student/study/tutor?topic=${encodeURIComponent(topic)}`
                            )
                          }
                          className="px-2 py-0.5 text-[10px] font-medium rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 hover:bg-amber-500/20 transition-colors text-left flex items-center gap-1"
                          title={`Study ${topic} with AI Tutor`}
                        >
                          <Sparkles className="size-2.5 text-primary shrink-0" />
                          <span>{topic}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Weekly Habits — collapsible */}
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <button
              onClick={() => setHabitsExpanded(!habitsExpanded)}
              className="w-full flex items-center justify-between px-4 py-3 border-b border-border/40 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Weekly Study Habits</span>
              </div>
              {habitsExpanded
                ? <ChevronUp className="size-3.5 text-muted-foreground" />
                : <ChevronDown className="size-3.5 text-muted-foreground" />}
            </button>
            {habitsExpanded && (() => {
              const weeklyActivity = summary?.weekly_study_activity || Array(7).fill(false);
              const activeDays = weeklyActivity.filter(Boolean).length;
              return (
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">This week</span>
                    <span className="font-medium text-foreground">{activeDays}/7 days active</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => {
                      const isActive = weeklyActivity[i] ?? false;
                      return (
                        <div key={i} className="space-y-1">
                          <span className="text-[10px] text-muted-foreground">{d}</span>
                          <div className={cn(
                            "h-4 rounded-sm flex items-center justify-center text-[9px] font-medium",
                            isActive ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground/40"
                          )}>
                            {isActive ? "✓" : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Upcoming Sessions — collapsible */}
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <div className="w-full flex items-center justify-between px-4 py-3 border-b border-border/40 hover:bg-muted/30 transition-colors">
              <button
                type="button"
                onClick={() => setUpcomingExpanded(!upcomingExpanded)}
                className="flex items-center gap-2 flex-1 text-left cursor-pointer"
              >
                <Clock className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Upcoming Sessions</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectTab("plans")}
                  className="text-[11px] text-primary hover:underline cursor-pointer"
                >
                  View all
                </button>
                <button
                  type="button"
                  onClick={() => setUpcomingExpanded(!upcomingExpanded)}
                  className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                >
                  {upcomingExpanded
                    ? <ChevronUp className="size-3.5" />
                    : <ChevronDown className="size-3.5" />}
                </button>
              </div>
            </div>
            {upcomingExpanded && (
              <div className="p-3 space-y-1.5">
                {activePlan?.sessions && activePlan.sessions.length > 0 ? (
                  activePlan.sessions.slice(0, 4).map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-muted/10 hover:bg-muted/30 transition-colors"
                    >
                      <div className="space-y-0.5 flex-1 min-w-0 pr-3">
                        <p className="text-[11px] font-medium text-foreground truncate">{s.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(parseISO(s.scheduled_start), "MMM d · HH:mm")} · {s.duration_minutes}m
                        </p>
                      </div>
                      <Badge
                        variant={s.status === "COMPLETED" ? "outline" : "secondary"}
                        className={cn(
                          "text-[9px] uppercase shrink-0",
                          s.status === "COMPLETED" && "text-emerald-600 border-emerald-500/30"
                        )}
                      >
                        {s.status}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="py-5 text-center text-[11px] text-muted-foreground">
                    No upcoming sessions. Create a plan to start.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Material Coverage — collapsible */}
          {materialCoverage.length > 0 && (
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <button
                onClick={() => setCoverageExpanded(!coverageExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 border-b border-border/40 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Material Coverage</span>
                </div>
                {coverageExpanded
                  ? <ChevronUp className="size-3.5 text-muted-foreground" />
                  : <ChevronDown className="size-3.5 text-muted-foreground" />}
              </button>
              {coverageExpanded && (
                <div className="p-4 space-y-3">
                  {materialCoverage.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-foreground font-medium truncate pr-2">
                          {item.course_code} — {item.course_title}
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {item.covered_count}/{item.total_count} ({item.percentage}%)
                        </span>
                      </div>
                      <Progress value={item.percentage} className="h-1.5 rounded-full" />
                    </div>
                  ))}

                  {/* Learning Unit Sequence */}
                  {learningUnits.length > 0 && (
                    <div className="pt-2 border-t border-border/30 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <BookOpen className="size-3" /> Learning units
                        </span>
                        <span className="font-medium text-foreground">
                          {learningUnits.filter((u) => u.status === "COMPLETED").length}/{learningUnits.length} done
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {learningUnits.map((lu) => (
                          <div
                            key={lu.id}
                            title={`LU ${lu.order_index}: ${lu.title} (${lu.status})`}
                            className={cn(
                              "size-2.5 rounded-full shrink-0 transition-transform hover:scale-125 cursor-pointer",
                              lu.status === "COMPLETED" ? "bg-primary" :
                              lu.status === "NEEDS_REVIEW" ? "bg-amber-400" :
                              lu.status === "IN_PROGRESS" ? "bg-primary/50" :
                              "bg-muted border border-border/60"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
