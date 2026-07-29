"use client";

import React, { useEffect, useState } from "react";
import { AISupportChat } from "@/components/mindexa/student/ai-support-chat";
import { StudyPlanDashboard } from "@/components/mindexa/study/study-plan-dashboard";
import { StudyPlanWizard } from "@/components/mindexa/study/study-plan-wizard";
import { SessionCompletionModal } from "@/components/mindexa/study/session-completion-modal";
import { PlanAdjustmentModal } from "@/components/mindexa/study/plan-adjustment-modal";
import { studyPlannerApi, StudyPlan, StudySession, StudyPlannerSummary } from "@/lib/api/study-planner";
import HeroUITabs from "@/components/ui/heroui-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import { Sparkles, Calendar as CalendarIcon, CheckCircle2, Clock, Plus, BookOpen, Layers, SlidersHorizontal, Award, Zap, Play } from "lucide-react";
import { format, parseISO } from "date-fns";
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
  const [initialAssessmentForWizard, setInitialAssessmentForWizard] = useState<string | undefined>(undefined);
  const [completeModalSession, setCompleteModalSession] = useState<StudySession | null>(null);
  const [adjustModalPlan, setAdjustModalPlan] = useState<StudyPlan | null>(null);

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
    setActiveTab(tab);
  };

  const handleOpenWizardWithAssessment = (assessmentId?: string) => {
    setInitialAssessmentForWizard(assessmentId);
    setWizardOpen(true);
  };

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto p-4 md:p-6 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/25 pb-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Sparkles className="size-5 text-primary shrink-0" /> AI Study Planner & Personal Academic Coach
          </h1>
          <p className="text-xs text-muted-foreground font-medium">
            AI-powered study scheduling, assessment readiness scoring, and intelligent academic tutoring.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => handleOpenWizardWithAssessment()}
            size="sm"
            className="h-9 px-3.5 rounded-xl text-xs font-bold uppercase tracking-wider gap-1.5 shadow-sm"
          >
            <Plus className="size-4" /> New Study Plan
          </Button>
        </div>
      </div>

      {/* HeroUITabs */}
      <HeroUITabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <HeroUITabs.ListContainer>
          <HeroUITabs.List aria-label="Study views">
            <HeroUITabs.Tab id="overview" className="text-xs font-medium px-2 pb-3 pt-1.5 transition-all">
              <span className="flex items-center gap-1.5">
                <Layers className="size-3.5" /> Planner Overview
              </span>
              <HeroUITabs.Indicator />
            </HeroUITabs.Tab>
            <HeroUITabs.Tab id="plans" className="text-xs font-medium px-2 pb-3 pt-1.5 transition-all">
              <span className="flex items-center gap-1.5">
                <BookOpen className="size-3.5" /> My Active Plans ({plans.length})
              </span>
              <HeroUITabs.Indicator />
            </HeroUITabs.Tab>
            <HeroUITabs.Tab id="tutor" className="text-xs font-medium px-2 pb-3 pt-1.5 transition-all">
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-primary" /> Study AI Tutor
                {selectedTopicContext && (
                  <Badge variant="outline" className="text-[8px] bg-primary/10 text-primary border-primary/20 flex items-center gap-1">
                    Topic: {selectedTopicContext}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTopicContext("");
                      }}
                      className="ml-0.5 hover:text-foreground font-bold text-xs"
                      title="Clear topic filter"
                    >
                      ×
                    </button>
                  </Badge>
                )}
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
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
                </div>
              </div>
            ) : (
              <StudyPlanDashboard
                summary={summary}
                onOpenWizard={handleOpenWizardWithAssessment}
                onOpenCompleteModal={(session) => setCompleteModalSession(session)}
                onOpenAdjustModal={(plan) => setAdjustModalPlan(plan)}
                onSelectTab={handleSelectTabWithTopic}
              />
            )}
          </div>
        )}

        {/* Tab 2: My Active Plans */}
        {activeTab === "plans" && (
          <div className="pt-4 space-y-4">
            {plans.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed rounded-2xl bg-muted/5 border-border/30 space-y-3">
                <BookOpen className="mx-auto size-8 text-muted-foreground/30" />
                <p className="text-xs font-semibold text-muted-foreground">You haven&apos;t created any study plans yet.</p>
                <Button onClick={() => handleOpenWizardWithAssessment()} size="sm" className="h-8 text-xs font-bold uppercase tracking-wider rounded-lg">
                  Create First Plan
                </Button>
              </div>
            ) : (
              plans.map((plan) => (
                <Card key={plan.id} className="rounded-2xl border border-border/45 bg-card/30 p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/30 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px] uppercase font-bold px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                          {plan.study_type}
                        </Badge>
                        <Badge variant="secondary" className="text-[9px] uppercase font-bold">
                          {plan.priority} Priority
                        </Badge>
                        {plan.auto_generated && (
                          <Badge variant="outline" className="text-[9px] uppercase font-bold bg-amber-500/10 text-amber-600 border-amber-500/20">
                            AI Generated
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[9px] uppercase font-bold bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          Readiness: {plan.readiness_score ?? 0}%
                        </Badge>
                      </div>
                      <h3 className="text-base font-bold text-foreground tracking-tight mt-1">
                        {plan.title}
                      </h3>
                      <p className="text-xs text-muted-foreground font-medium">
                        Goal: {plan.daily_goal} • Duration: {plan.session_duration_minutes} mins/session • Pace: {plan.preferred_difficulty || "Balanced"}
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAdjustModalPlan(plan)}
                      className="h-8 text-xs font-bold uppercase tracking-wider rounded-lg border-border/60 gap-1.5 self-start sm:self-auto"
                    >
                      <SlidersHorizontal className="size-3.5" /> Adjust Plan
                    </Button>
                  </div>

                  {/* Sessions timeline checklist */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-foreground">Scheduled Sessions & Checklists:</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {plan.sessions && plan.sessions.length > 0 ? (
                        plan.sessions.map((s) => (
                          <div
                            key={s.id}
                            className="flex items-center justify-between p-3 rounded-xl border border-border/30 bg-card/20 hover:bg-card/40 transition-colors"
                          >
                            <div className="space-y-0.5 flex-1 min-w-0 pr-2">
                              <div className="font-semibold text-xs text-foreground truncate">
                                {s.title}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-medium">
                                {format(parseISO(s.scheduled_start), "MMM d, HH:mm")} • {s.session_type}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {s.status === "COMPLETED" ? (
                                <Badge variant="outline" className="text-[9px] uppercase font-bold bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                  Completed
                                </Badge>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => router.push(`/student/study/session/${s.id}`)}
                                  className="h-7 text-[9px] font-bold uppercase tracking-wider rounded-lg bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 text-primary-foreground shadow-xs gap-1"
                                >
                                  <Play className="size-2.5 fill-white" /> Start Guided Session
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setCompleteModalSession(s)}
                                className="h-7 text-[9px] font-bold uppercase tracking-wider rounded-lg border-border/60 text-muted-foreground hover:text-foreground"
                              >
                                Self-Report
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-muted-foreground py-2">No sessions generated.</div>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Tab 3: Study AI Tutor */}
        {activeTab === "tutor" && (
          <div className="pt-4 h-[calc(100vh-220px)] min-h-[500px]">
            <AISupportChat initialTopicContext={selectedTopicContext} />
          </div>
        )}
      </HeroUITabs>

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
        onOpenChange={(open) => { if (!open) setCompleteModalSession(null); }}
        onCompleted={loadData}
      />

      <PlanAdjustmentModal
        plan={adjustModalPlan}
        open={!!adjustModalPlan}
        onOpenChange={(open) => { if (!open) setAdjustModalPlan(null); }}
        onAdjusted={loadData}
      />
    </div>
  );
}
