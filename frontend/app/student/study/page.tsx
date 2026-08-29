"use client";

import React, { useEffect, useState, useMemo } from "react";
import { StudyPlanDashboard } from "@/components/mindexa/study/study-plan-dashboard";
import { StudyPlanWizard } from "@/components/mindexa/study/study-plan-wizard";
import { SessionCompletionModal } from "@/components/mindexa/study/session-completion-modal";
import { PlanAdjustmentModal } from "@/components/mindexa/study/plan-adjustment-modal";
import { RescheduleModal } from "@/components/mindexa/study/reschedule-modal";
import {
  studyPlannerApi,
  StudyPlan,
  StudySession,
  StudyPlannerSummary,
} from "@/lib/api/study-planner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useRouter } from "next/navigation";
import { SparklesIcon } from "@/components/ui/sparkles-icon";
import {
  Sparkles,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Plus,
  BookOpen,
  Layers,
  ListChecks,
  SlidersHorizontal,
  Play,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Target,
  Check,
} from "lucide-react";
import { ContextualExplainer } from "@/components/mindexa/common/contextual-explainer";
import { HelpPopover } from "@/components/mindexa/common/help-popover";
import { format, parseISO, isBefore, isToday, isTomorrow } from "date-fns";
import { cn } from "@/lib/utils";

export default function StudentStudyPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [summary, setSummary] = useState<StudyPlannerSummary | null>(null);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [initialAssessmentForWizard, setInitialAssessmentForWizard] = useState<
    string | undefined
  >(undefined);
  const [completeModalSession, setCompleteModalSession] =
    useState<StudySession | null>(null);
  const [adjustModalPlan, setAdjustModalPlan] = useState<StudyPlan | null>(null);
  const [rescheduleSession, setRescheduleSession] =
    useState<StudySession | null>(null);

  // Filter state for plans tab
  const [sessionFilter, setSessionFilter] = useState<
    "upcoming" | "missed" | "completed" | "all"
  >("upcoming");
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<string>>(
    new Set(),
  );

  async function loadData() {
    try {
      const [sumData, plansData] = await Promise.all([
        studyPlannerApi.getSummary().catch(() => null),
        studyPlannerApi.listPlans().catch(() => []),
      ]);
      setSummary(sumData);
      setPlans(plansData || []);
    } catch (err) {
      console.error("Failed to load study planner data", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectTabWithTopic = (tab: string, topic?: string) => {
    if (tab === "tutor" || topic) {
      router.push(
        topic
          ? `/student/study/tutor?topic=${encodeURIComponent(topic)}`
          : "/student/study/tutor",
      );
    } else {
      setActiveTab(tab);
    }
  };

  const handleOpenWizardWithAssessment = (assessmentId?: string) => {
    setInitialAssessmentForWizard(assessmentId);
    setWizardOpen(true);
  };

  const togglePlanExpanded = (planId: string) => {
    setExpandedPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  const categorizedSessions = useMemo(() => {
    const allSessions: (StudySession & { planTitle?: string })[] = [];
    plans.forEach((p) => {
      if (p.sessions) {
        p.sessions.forEach((s) => {
          allSessions.push({ ...s, planTitle: p.title });
        });
      }
    });

    allSessions.sort(
      (a, b) =>
        new Date(a.scheduled_start).getTime() -
        new Date(b.scheduled_start).getTime(),
    );

    const now = new Date();
    const completed: (StudySession & { planTitle?: string })[] = [];
    const missedOrRescheduled: (StudySession & { planTitle?: string })[] = [];
    const pendingUpcoming: (StudySession & { planTitle?: string })[] = [];

    allSessions.forEach((s) => {
      if (s.status === "COMPLETED") {
        completed.push(s);
      } else if (s.status === "MISSED" || s.status === "SKIPPED") {
        missedOrRescheduled.push(s);
      } else {
        const start = new Date(s.scheduled_start);
        if (isBefore(start, now) && s.status !== "IN_PROGRESS") {
          missedOrRescheduled.push(s);
        } else {
          pendingUpcoming.push(s);
        }
      }
    });

    const nextSession =
      pendingUpcoming.length > 0 ? pendingUpcoming[0] : null;
    const remainingUpcoming =
      pendingUpcoming.length > 0 ? pendingUpcoming.slice(1) : [];

    return {
      all: allSessions,
      nextSession,
      upcoming: remainingUpcoming,
      completed,
      missedOrRescheduled,
    };
  }, [plans]);

  const filteredSessions = useMemo(() => {
    if (sessionFilter === "upcoming") {
      return categorizedSessions.nextSession
        ? [categorizedSessions.nextSession, ...categorizedSessions.upcoming]
        : categorizedSessions.upcoming;
    } else if (sessionFilter === "missed") {
      return categorizedSessions.missedOrRescheduled;
    } else if (sessionFilter === "completed") {
      return categorizedSessions.completed;
    }
    return categorizedSessions.all;
  }, [sessionFilter, categorizedSessions]);

  const formatSessionTime = (dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      if (isToday(d)) {
        return `Today at ${format(d, "HH:mm")}`;
      }
      if (isTomorrow(d)) {
        return `Tomorrow at ${format(d, "HH:mm")}`;
      }
      return format(d, "EEE, MMM d · HH:mm");
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      data-tour="student-study"
      className="space-y-4 w-full mx-auto animate-in fade-in duration-200 pb-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-border/30 pb-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <SparklesIcon size={16} className="text-primary shrink-0" />
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
              Study Planner
            </h1>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Curriculum schedules, active recall coaching, and assessment readiness.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <HelpPopover topic="ai-study" variant="badge" label="Study Help" />
          <ContextualExplainer
            topic="ai-study-support"
            variant="pill"
            label="Guide"
          />
          <Button
            variant="ghost"
            onClick={() => router.push("/student/study/tutor")}
            size="sm"
            className="h-7.5 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Sparkles className="size-3 text-primary" />
            AI Tutor
          </Button>
          <Button
            onClick={() => handleOpenWizardWithAssessment()}
            size="sm"
            className="h-7.5 px-3 text-xs font-semibold gap-1.5 rounded-lg shadow-2xs cursor-pointer"
          >
            <Plus className="size-3" /> New Plan
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full space-y-3"
      >
        <TabsList className="h-8.5 p-0.5 bg-muted/50 rounded-lg border border-border/60">
          <TabsTrigger
            value="overview"
            className="text-xs font-semibold px-3 py-1 rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs gap-1.5 cursor-pointer"
          >
            <Layers className="size-3 text-primary" />
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="plans"
            className="text-xs font-semibold px-3 py-1 rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs gap-1.5 cursor-pointer"
          >
            <ListChecks className="size-3 text-primary" />
            Plans & Schedule
            <Badge
              variant="secondary"
              className="ml-1 text-[9px] font-bold px-1 py-0 bg-primary/10 text-primary border-primary/20"
            >
              {plans.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab Content */}
        {activeTab === "overview" && (
          <div className="space-y-3">
            {loading ? (
              <div className="space-y-2.5">
                <Skeleton className="h-28 w-full rounded-xl" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              </div>
            ) : (
              <StudyPlanDashboard
                summary={summary}
                onOpenWizard={handleOpenWizardWithAssessment}
                onOpenCompleteModal={(session) =>
                  setCompleteModalSession(session)
                }
                onOpenAdjustModal={(plan) => setAdjustModalPlan(plan)}
                onSelectTab={handleSelectTabWithTopic}
              />
            )}
          </div>
        )}

        {/* Plans Tab Content */}
        {activeTab === "plans" && (
          <div className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-xl" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <Skeleton className="h-24 rounded-lg" />
                  <Skeleton className="h-24 rounded-lg" />
                </div>
              </div>
            ) : plans.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-border/60 rounded-xl p-6 space-y-3 bg-muted/5 max-w-md mx-auto">
                <BookOpen className="size-6 text-muted-foreground/30 mx-auto" />
                <div className="space-y-0.5">
                  <h3 className="text-xs font-bold text-foreground">
                    No active study plans yet
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Build a study schedule synchronized with your syllabus.
                  </p>
                </div>
                <Button
                  onClick={() => handleOpenWizardWithAssessment()}
                  size="sm"
                  className="h-7.5 px-3 text-xs font-semibold rounded-lg shadow-2xs gap-1.5 cursor-pointer"
                >
                  <Sparkles className="size-3" />
                  Create AI Study Plan
                </Button>
              </div>
            ) : (
              <>
                {/* Spotlight "Next Up" Banner */}
                {categorizedSessions.nextSession && (
                  <div className="rounded-xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-card p-3.5 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="secondary"
                          className="text-[9px] font-bold uppercase tracking-wider bg-primary text-primary-foreground border-none px-1.5 py-0"
                        >
                          Up Next
                        </Badge>
                        <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                          <Clock className="size-2.5 text-primary" />
                          {formatSessionTime(
                            categorizedSessions.nextSession.scheduled_start,
                          )}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] font-semibold border-primary/30 text-primary bg-background/80 px-1.5 py-0"
                      >
                        {categorizedSessions.nextSession.duration_minutes}m
                      </Badge>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="space-y-0.2 min-w-0">
                        <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">
                          {categorizedSessions.nextSession.topic ||
                            categorizedSessions.nextSession.title}
                        </h3>
                        <p className="text-[10px] text-muted-foreground truncate">
                          Plan:{" "}
                          <span className="font-semibold text-foreground/80">
                            {categorizedSessions.nextSession.planTitle ||
                              "Active Plan"}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setRescheduleSession(
                              categorizedSessions.nextSession,
                            )
                          }
                          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <RotateCcw className="size-2.5 mr-1" /> Reschedule
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            router.push(
                              `/student/study/session/${categorizedSessions.nextSession?.id}`,
                            )
                          }
                          className="h-7 px-3 text-xs font-bold rounded-lg shadow-2xs gap-1 cursor-pointer"
                        >
                          <Play className="size-2.5 fill-current" /> Start Lesson
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Active Plans Gallery */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <BookOpen className="size-3 text-primary" /> Active Plans ({plans.length})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {plans.map((plan) => {
                      const isExpanded = expandedPlanIds.has(plan.id);
                      const planTotalSessions = plan.sessions?.length || 0;
                      const planCompletedSessions =
                        plan.sessions?.filter((s) => s.status === "COMPLETED")
                          .length || 0;
                      const planPct =
                        planTotalSessions > 0
                          ? Math.round(
                              (planCompletedSessions / planTotalSessions) * 100,
                            )
                          : 0;

                      return (
                        <Card
                          key={plan.id}
                          className="rounded-xl border border-border/50 bg-card shadow-2xs hover:border-primary/30 transition-all overflow-hidden flex flex-col justify-between"
                        >
                          <div className="p-3.5 space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge
                                    variant="secondary"
                                    className="text-[9px] font-semibold bg-primary/10 text-primary border border-primary/20 py-0 px-1.5"
                                  >
                                    {plan.study_type}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[9px] font-semibold border-border/60 py-0 px-1.5",
                                      plan.priority === "High" &&
                                        "text-amber-600 dark:text-amber-400 bg-amber-500/5 border-amber-500/30",
                                    )}
                                  >
                                    {plan.priority}
                                  </Badge>
                                </div>
                                <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">
                                  {plan.title}
                                </h3>
                              </div>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setAdjustModalPlan(plan)}
                                className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground rounded-md gap-1 shrink-0"
                              >
                                <SlidersHorizontal className="size-2.5" /> Adjust
                              </Button>
                            </div>

                            {/* Mini progress */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>Progress</span>
                                <span className="font-semibold text-foreground font-mono">
                                  {planCompletedSessions}/{planTotalSessions} ({planPct}%)
                                </span>
                              </div>
                              <Progress value={planPct} className="h-1" />
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5 border-t border-border/30">
                              <span className="truncate max-w-[200px]">
                                {plan.daily_goal}
                              </span>
                              <span className="font-mono text-foreground font-medium shrink-0">
                                {plan.session_duration_minutes}m/session
                              </span>
                            </div>
                          </div>

                          {/* Plan Expand Footer */}
                          <div className="px-3.5 py-1.5 bg-muted/20 border-t border-border/30 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => togglePlanExpanded(plan.id)}
                              className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <span>
                                {isExpanded ? "Hide Sessions" : "View Sessions"}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="size-3" />
                              ) : (
                                <ChevronDown className="size-3" />
                              )}
                            </button>

                            <span className="text-[10px] text-muted-foreground">
                              {planTotalSessions} Modules
                            </span>
                          </div>

                          {/* Expanded Sessions Drawer */}
                          {isExpanded && plan.sessions && plan.sessions.length > 0 && (
                            <div className="p-3 border-t border-border/30 bg-muted/10 space-y-1.5 max-h-48 overflow-y-auto">
                              {plan.sessions.map((s) => (
                                <div
                                  key={s.id}
                                  className="p-2 rounded-lg border border-border/40 bg-background flex items-center justify-between gap-2 text-xs"
                                >
                                  <div className="space-y-0.2 min-w-0 flex-1">
                                    <p className="text-[11px] font-semibold text-foreground truncate">
                                      {s.topic || s.title}
                                    </p>
                                    <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                                      <CalendarIcon className="size-2" />
                                      {s.scheduled_start
                                        ? formatSessionTime(s.scheduled_start)
                                        : "Unscheduled"}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    {s.status === "COMPLETED" ? (
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] font-semibold border-emerald-500/30 text-emerald-600 bg-emerald-500/5 px-1.5 py-0"
                                      >
                                        <Check className="size-2 mr-0.5" /> Done
                                      </Badge>
                                    ) : (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            setRescheduleSession(s)
                                          }
                                          className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground"
                                        >
                                          Reschedule
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() =>
                                            router.push(
                                              `/student/study/session/${s.id}`,
                                            )
                                          }
                                          className="h-5 text-[10px] px-2 gap-0.5 font-bold"
                                        >
                                          <Play className="size-2 fill-current" /> Start
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {/* Session Timeline & Filter Tabs */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between gap-2 border-b border-border/30 pb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Clock className="size-3 text-primary" /> Session Agenda
                    </span>

                    {/* Compact Filter Pills */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSessionFilter("upcoming")}
                        className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-semibold border transition-all cursor-pointer",
                          sessionFilter === "upcoming"
                            ? "border-primary bg-primary/10 text-primary font-bold shadow-2xs"
                            : "border-border/60 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Upcoming (
                        {categorizedSessions.upcoming.length +
                          (categorizedSessions.nextSession ? 1 : 0)}
                        )
                      </button>

                      <button
                        type="button"
                        onClick={() => setSessionFilter("missed")}
                        className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-semibold border transition-all cursor-pointer",
                          sessionFilter === "missed"
                            ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-bold shadow-2xs"
                            : "border-border/60 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Missed ({categorizedSessions.missedOrRescheduled.length})
                      </button>

                      <button
                        type="button"
                        onClick={() => setSessionFilter("completed")}
                        className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-semibold border transition-all cursor-pointer",
                          sessionFilter === "completed"
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold shadow-2xs"
                            : "border-border/60 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Completed ({categorizedSessions.completed.length})
                      </button>
                    </div>
                  </div>

                  {/* Sessions Grid */}
                  {filteredSessions.length === 0 ? (
                    <div className="py-8 text-center border border-dashed border-border/40 rounded-xl space-y-1 bg-muted/5">
                      <p className="text-[11px] text-muted-foreground">
                        No sessions in this category.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {filteredSessions.map((session) => {
                        const isCompleted = session.status === "COMPLETED";
                        const isMissed =
                          session.status === "MISSED" ||
                          session.status === "SKIPPED" ||
                          (isBefore(new Date(session.scheduled_start), new Date()) &&
                            session.status !== "IN_PROGRESS");

                        return (
                          <div
                            key={session.id}
                            className={cn(
                              "p-3 rounded-xl border bg-card shadow-2xs space-y-2 flex flex-col justify-between hover:border-primary/30 transition-all",
                              isCompleted
                                ? "border-emerald-500/25 bg-emerald-500/5"
                                : isMissed
                                  ? "border-amber-500/25 bg-amber-500/5"
                                  : "border-border/50",
                            )}
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-[10px]">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] font-semibold px-1.5 py-0",
                                    isCompleted &&
                                      "border-emerald-500/30 text-emerald-600 bg-emerald-500/10",
                                    isMissed &&
                                      !isCompleted &&
                                      "border-amber-500/30 text-amber-700 bg-amber-500/10",
                                    !isCompleted &&
                                      !isMissed &&
                                      "border-primary/20 text-primary bg-primary/5",
                                  )}
                                >
                                  {isCompleted
                                    ? "Completed"
                                    : isMissed
                                      ? "Overdue"
                                      : "Scheduled"}
                                </Badge>
                                <span className="font-mono text-muted-foreground">
                                  {session.duration_minutes}m
                                </span>
                              </div>

                              <div className="space-y-0.2">
                                <h4 className="text-xs font-bold text-foreground truncate">
                                  {session.topic || session.title}
                                </h4>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {session.planTitle || "Study Plan"}
                                </p>
                              </div>

                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <CalendarIcon className="size-2.5 text-primary shrink-0" />
                                <span>
                                  {session.scheduled_start
                                    ? formatSessionTime(session.scheduled_start)
                                    : "Unscheduled"}
                                </span>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="pt-1.5 border-t border-border/30 flex items-center justify-between">
                              {isCompleted ? (
                                <div className="flex items-center justify-between w-full">
                                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    {session.knowledge_check_score !== undefined &&
                                    session.knowledge_check_score !== null
                                      ? `Score: ${Math.round(session.knowledge_check_score)}%`
                                      : "Reviewed"}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      router.push(
                                        `/student/study/session/${session.id}`,
                                      )
                                    }
                                    className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground cursor-pointer"
                                  >
                                    Review
                                  </Button>
                                </div>
                              ) : isMissed ? (
                                <div className="flex items-center justify-between w-full">
                                  <span className="text-[9px] text-amber-700 dark:text-amber-300">
                                    Reschedule needed
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setRescheduleSession(session)}
                                    className="h-6 text-[10px] px-2 rounded-md border-amber-500/40 text-amber-800 dark:text-amber-200 hover:bg-amber-500/10 cursor-pointer"
                                  >
                                    <RotateCcw className="size-2.5 mr-1" /> Reschedule
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between w-full">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setRescheduleSession(session)}
                                    className="h-6 text-[10px] px-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                                  >
                                    Reschedule
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      router.push(
                                        `/student/study/session/${session.id}`,
                                      )
                                    }
                                    className="h-6 text-[10px] px-2.5 font-bold rounded-md gap-1 cursor-pointer"
                                  >
                                    <Play className="size-2 fill-current" /> Start
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Tabs>

      {/* Modals & Dialogs */}
      <StudyPlanWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSuccess={loadData}
        initialAssessmentId={initialAssessmentForWizard}
      />
      <SessionCompletionModal
        session={completeModalSession}
        open={!!completeModalSession}
        onOpenChange={(open) => {
          if (!open) setCompleteModalSession(null);
        }}
        onCompleted={loadData}
      />
      <PlanAdjustmentModal
        plan={adjustModalPlan}
        open={!!adjustModalPlan}
        onOpenChange={(open) => {
          if (!open) setAdjustModalPlan(null);
        }}
        onAdjusted={loadData}
      />
      <RescheduleModal
        session={rescheduleSession}
        isOpen={!!rescheduleSession}
        onClose={() => setRescheduleSession(null)}
        onSessionUpdated={loadData}
      />
    </div>
  );
}
