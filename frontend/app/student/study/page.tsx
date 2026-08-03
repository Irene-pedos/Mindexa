"use client";

import React, { useEffect, useState, useMemo } from "react";
import { AISupportChat } from "@/components/mindexa/student/ai-support-chat";
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
import HeroUITabs from "@/components/ui/heroui-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Plus,
  BookOpen,
  Layers,
  SlidersHorizontal,
  Play,
  X,
  AlertTriangle,
  RotateCcw,
  Bot,
} from "lucide-react";
import { format, parseISO, isBefore } from "date-fns";
import { cn } from "@/lib/utils";

export default function StudentStudyPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [selectedTopicContext, setSelectedTopicContext] = useState<string>("");
  const [summary, setSummary] = useState<StudyPlannerSummary | null>(null);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [initialAssessmentForWizard, setInitialAssessmentForWizard] = useState<
    string | undefined
  >(undefined);
  const [completeModalSession, setCompleteModalSession] =
    useState<StudySession | null>(null);
  const [adjustModalPlan, setAdjustModalPlan] = useState<StudyPlan | null>(
    null,
  );
  const [rescheduleSession, setRescheduleSession] =
    useState<StudySession | null>(null);
  const [aiTutorModalOpen, setAiTutorModalOpen] = useState(false);

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
    if (topic) setSelectedTopicContext(topic);
    if (tab === "tutor") {
      setAiTutorModalOpen(true);
    } else {
      setActiveTab(tab);
    }
  };

  const handleOpenWizardWithAssessment = (assessmentId?: string) => {
    setInitialAssessmentForWizard(assessmentId);
    setWizardOpen(true);
  };

  // Process and categorize all sessions across active plans
  const categorizedSessions = useMemo(() => {
    const allSessions: StudySession[] = [];
    plans.forEach((p) => {
      if (p.sessions) {
        allSessions.push(...p.sessions);
      }
    });

    // Sort by scheduled_start ascending
    allSessions.sort(
      (a, b) =>
        new Date(a.scheduled_start).getTime() -
        new Date(b.scheduled_start).getTime(),
    );

    const now = new Date();

    const completed: StudySession[] = [];
    const missedOrRescheduled: StudySession[] = [];
    const pendingUpcoming: StudySession[] = [];

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

    const nextSession = pendingUpcoming.length > 0 ? pendingUpcoming[0] : null;
    const remainingUpcoming =
      pendingUpcoming.length > 0 ? pendingUpcoming.slice(1) : [];

    return {
      nextSession,
      upcoming: remainingUpcoming,
      completed,
      missedOrRescheduled,
    };
  }, [plans]);

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto p-4 md:p-6 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/25 pb-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Sparkles className="size-5 text-primary shrink-0" /> AI Study
            Planner & Personal Academic Coach
          </h1>
          <p className="text-xs text-muted-foreground font-medium">
            AI-powered study scheduling, assessment readiness scoring, and
            intelligent academic tutoring.
          </p>
        </div>

        {/* Action Controls: AI Tutor & New Study Plan */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => setAiTutorModalOpen(true)}
            size="sm"
            className="h-9 px-3.5 rounded-xl text-xs font-bold gap-2 border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary shadow-xs transition-all"
          >
            <Bot className="size-4 text-primary animate-pulse" />
            <span>Study AI Tutor</span>
            {selectedTopicContext && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0.2">
                Topic Filter
              </Badge>
            )}
          </Button>

          <Button
            onClick={() => handleOpenWizardWithAssessment()}
            size="sm"
            className="h-9 px-4 rounded-xl text-xs font-bold uppercase tracking-wider gap-1.5 shadow-sm bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 text-primary-foreground"
          >
            <Plus className="size-4" /> New Study Plan
          </Button>
        </div>
      </div>

      {/* HeroUITabs */}
      <HeroUITabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <HeroUITabs.ListContainer>
          <HeroUITabs.List aria-label="Study views">
            <HeroUITabs.Tab
              id="overview"
              className="text-xs font-medium px-2 pb-3 pt-1.5 transition-all"
            >
              <span className="flex items-center gap-1.5">
                <Layers className="size-3.5" /> Planner Overview
              </span>
              <HeroUITabs.Indicator />
            </HeroUITabs.Tab>
            <HeroUITabs.Tab
              id="plans"
              className="text-xs font-medium px-2 pb-3 pt-1.5 transition-all"
            >
              <span className="flex items-center gap-1.5">
                <BookOpen className="size-3.5" /> My Active Plans (
                {plans.length})
              </span>
              <HeroUITabs.Indicator />
            </HeroUITabs.Tab>
          </HeroUITabs.List>
        </HeroUITabs.ListContainer>

        {/* Tab 1: Planner Overview */}
        {activeTab === "overview" && (
          <div className="pt-4">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-44 w-full rounded-2xl" />
                <div className="grid grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-xl" />
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

        {/* Tab 2: Reorganized Active Plans & Grouped Sessions */}
        {activeTab === "plans" && (
          <div className="pt-4 space-y-6">
            {plans.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed rounded-2xl bg-muted/5 border-border/30 space-y-3">
                <BookOpen className="mx-auto size-8 text-muted-foreground/30" />
                <p className="text-xs font-semibold text-muted-foreground">
                  You haven&apos;t created any study plans yet.
                </p>
                <Button
                  onClick={() => handleOpenWizardWithAssessment()}
                  size="sm"
                  className="h-8 text-xs font-bold uppercase tracking-wider rounded-lg"
                >
                  Create First Plan
                </Button>
              </div>
            ) : (
              <>
                {/* 1. Next Session (Hero Highlight Card) */}
                {categorizedSessions.nextSession && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                      <Sparkles className="size-4" /> Next Up Guided Session
                    </h3>
                    <Card className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5 md:p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] font-bold border-primary/30 text-primary bg-primary/10"
                          >
                            Next Up
                          </Badge>
                          <Badge
                            variant="secondary"
                            className="text-[10px] font-medium"
                          >
                            <Clock className="size-3 mr-1" />
                            {format(
                              parseISO(
                                categorizedSessions.nextSession.scheduled_start,
                              ),
                              "EEEE, MMM d 'at' HH:mm",
                            )}
                          </Badge>
                        </div>
                        <h4 className="text-lg font-extrabold text-foreground">
                          {categorizedSessions.nextSession.topic ||
                            categorizedSessions.nextSession.title}
                        </h4>
                        <p className="text-xs text-muted-foreground font-medium">
                          Duration:{" "}
                          {categorizedSessions.nextSession.duration_minutes}{" "}
                          minutes • Guided Lesson & Knowledge Check
                        </p>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setRescheduleSession(
                              categorizedSessions.nextSession,
                            )
                          }
                          className="h-9 text-xs font-semibold rounded-xl border-border/60"
                        >
                          <RotateCcw className="size-3.5 mr-1" /> Reschedule
                        </Button>

                        <Button
                          size="sm"
                          onClick={() =>
                            router.push(
                              `/student/study/session/${categorizedSessions.nextSession?.id}`,
                            )
                          }
                          className="h-9 px-4 text-xs font-bold rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 text-primary-foreground shadow-md gap-1.5"
                        >
                          <Play className="size-3.5 fill-white" /> Start Guided
                          Session
                        </Button>
                      </div>
                    </Card>
                  </div>
                )}

                {/* 2. Upcoming Sessions Section */}
                {categorizedSessions.upcoming.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <Clock className="size-4 text-muted-foreground" />{" "}
                      Upcoming Sessions ({categorizedSessions.upcoming.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {categorizedSessions.upcoming.map((s) => (
                        <div
                          key={s.id}
                          className="p-4 rounded-xl border border-border/60 bg-card/60 hover:bg-card transition-all flex items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="font-semibold text-xs text-foreground truncate">
                              {s.title || s.topic}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-2 flex-wrap">
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="size-3" />
                                {format(
                                  parseISO(s.scheduled_start),
                                  "MMM d, HH:mm",
                                )}{" "}
                                ({s.duration_minutes}m)
                              </span>
                              {s.source_material_ids && s.source_material_ids.length > 0 && (
                                <Badge variant="secondary" className="text-[9px] font-semibold bg-muted text-muted-foreground gap-1 px-1.5 py-0">
                                  📄 {s.source_material_ids.length} materials
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRescheduleSession(s)}
                              className="h-8 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                            >
                              Reschedule
                            </Button>

                            <Button
                              size="sm"
                              onClick={() =>
                                router.push(`/student/study/session/${s.id}`)
                              }
                              className="h-8 text-[11px] font-bold rounded-lg gap-1"
                            >
                              <Play className="size-3 fill-white" /> Start
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Missed or Rescheduled Sessions Section */}
                {categorizedSessions.missedOrRescheduled.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="size-4" /> Missed / Rescheduled
                      ({categorizedSessions.missedOrRescheduled.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {categorizedSessions.missedOrRescheduled.map((s) => (
                        <div
                          key={s.id}
                          className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-center justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="font-semibold text-xs text-foreground truncate">
                              {s.topic || s.title}
                            </div>
                            <div className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                              Originally:{" "}
                              {format(
                                parseISO(s.scheduled_start),
                                "MMM d, HH:mm",
                              )}
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRescheduleSession(s)}
                            className="h-8 text-[11px] font-semibold border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                          >
                            Reschedule Now
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Completed Sessions Section */}
                {categorizedSessions.completed.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="size-4" /> Completed Sessions (
                      {categorizedSessions.completed.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {categorizedSessions.completed.map((s) => (
                        <div
                          key={s.id}
                          className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="font-semibold text-xs text-foreground truncate">
                              {s.topic || s.title}
                            </div>
                            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                              Completed • Score:{" "}
                              {s.knowledge_check_score
                                ? `${Math.round(s.knowledge_check_score)}%`
                                : "Completed"}
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              router.push(`/student/study/session/${s.id}`)
                            }
                            className="h-8 text-[11px] font-semibold border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                          >
                            Review Lesson
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active Plans List Overview */}
                <div className="pt-6 border-t border-border/50 space-y-4">
                  <h3 className="text-sm font-bold text-foreground">
                    Active Study Plans ({plans.length})
                  </h3>
                  {plans.map((plan) => (
                    <Card
                      key={plan.id}
                      className="rounded-2xl border border-border/60 bg-card p-5 space-y-4 shadow-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="text-[9px] uppercase font-bold px-2 py-0.5 bg-primary/10 text-primary border-primary/20"
                            >
                              {plan.study_type}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="text-[9px] uppercase font-bold"
                            >
                              {plan.priority} Priority
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-[9px] uppercase font-bold bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            >
                              Readiness: {plan.readiness_score ?? 0}%
                            </Badge>
                          </div>
                          <h4 className="text-base font-bold text-foreground tracking-tight mt-1">
                            {plan.title}
                          </h4>
                          <p className="text-xs text-muted-foreground font-medium">
                            Goal: {plan.daily_goal} • Duration:{" "}
                            {plan.session_duration_minutes} mins/session
                          </p>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAdjustModalPlan(plan)}
                          className="h-8 text-xs font-semibold rounded-lg border-border/60 gap-1.5 self-start sm:self-auto"
                        >
                          <SlidersHorizontal className="size-3.5" /> Adjust Plan
                        </Button>
                      </div>

                      {plan.sessions && plan.sessions.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                            Plan Sessions ({plan.sessions.length})
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                            {plan.sessions.map((s) => (
                              <div
                                key={s.id}
                                className="p-2.5 rounded-xl border border-border/50 bg-muted/20 flex items-center justify-between text-xs gap-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-foreground truncate">
                                    {s.topic || s.title}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {s.scheduled_start
                                      ? format(
                                          parseISO(s.scheduled_start),
                                          "MMM d, HH:mm",
                                        )
                                      : "Unscheduled"}{" "}
                                    • {s.status}
                                  </div>
                                </div>
                                {s.status !== "COMPLETED" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setRescheduleSession(s)}
                                    className="h-7 text-[10px] px-2 font-semibold text-primary hover:bg-primary/10 shrink-0"
                                  >
                                    Reschedule
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </HeroUITabs>

      {/* Full-Screen Distraction-Free AI Tutor Modal */}
      <Dialog open={aiTutorModalOpen} onOpenChange={setAiTutorModalOpen}>
        <DialogContent className="max-w-5xl w-[95vw] h-[85vh] p-0 rounded-2xl border-border/80 bg-background overflow-hidden flex flex-col">
          <DialogHeader className="p-4 border-b border-border/60 bg-muted/30 flex flex-row items-center justify-between space-y-0 shrink-0">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Bot className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                  Study AI Tutor & Academic Coach
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Ask questions, request explanations, or practice concepts.
                </p>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-hidden p-4">
            <AISupportChat initialTopicContext={selectedTopicContext} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Modals */}
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
