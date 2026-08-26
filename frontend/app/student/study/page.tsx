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
} from "lucide-react";
import { ContextualExplainer } from "@/components/mindexa/common/contextual-explainer";
import { HelpPopover } from "@/components/mindexa/common/help-popover";
import { format, parseISO, isBefore } from "date-fns";
import { cn } from "@/lib/utils";

export default function StudentStudyPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [summary, setSummary] = useState<StudyPlannerSummary | null>(null);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [initialAssessmentForWizard, setInitialAssessmentForWizard] = useState<string | undefined>(undefined);
  const [completeModalSession, setCompleteModalSession] = useState<StudySession | null>(null);
  const [adjustModalPlan, setAdjustModalPlan] = useState<StudyPlan | null>(null);
  const [rescheduleSession, setRescheduleSession] = useState<StudySession | null>(null);

  // Collapsible section state
  const [nextExpanded, setNextExpanded] = useState(true);
  const [upcomingExpanded, setUpcomingExpanded] = useState(true);
  const [missedExpanded, setMissedExpanded] = useState(true);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<string>>(new Set());

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

  useEffect(() => { loadData(); }, []);

  const handleSelectTabWithTopic = (tab: string, topic?: string) => {
    if (tab === "tutor" || topic) {
      router.push(topic ? `/student/study/tutor?topic=${encodeURIComponent(topic)}` : "/student/study/tutor");
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
    const allSessions: StudySession[] = [];
    plans.forEach((p) => { if (p.sessions) allSessions.push(...p.sessions); });
    allSessions.sort(
      (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime(),
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
    const remainingUpcoming = pendingUpcoming.length > 0 ? pendingUpcoming.slice(1) : [];

    return { nextSession, upcoming: remainingUpcoming, completed, missedOrRescheduled };
  }, [plans]);

  return (
    <div data-tour="student-study" className="space-y-4 w-full mx-auto animate-in fade-in duration-300">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/20 pb-3">
        <div className="space-y-0.5 min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <SparklesIcon size={16} className="text-primary shrink-0" />
            Study Planner
          </h1>
          <p className="text-xs text-muted-foreground">
            AI-powered scheduling, readiness scoring, and academic tutoring.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpPopover topic="ai-study" variant="badge" label="Study Help" />
          <ContextualExplainer topic="ai-study-support" variant="pill" label="Guide" />
          <Button
            variant="ghost"
            onClick={() => router.push("/student/study/tutor")}
            size="sm"
            className="h-8 px-3 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Sparkles className="size-3.5" />
            AI Tutor
          </Button>
          <Button
            onClick={() => handleOpenWizardWithAssessment()}
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
          >
            <Plus className="size-3.5" /> New Plan
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="h-auto p-1">
          <TabsTrigger value="overview">
            <Layers className="size-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="plans">
            <ListChecks className="size-3.5" />
            Plans
            <span className="ml-1 opacity-60 font-normal">({plans.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="pt-3">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-32 w-full rounded-xl" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
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

        {/* Plans Tab */}
        {activeTab === "plans" && (
          <div className="pt-3 space-y-4">
            {plans.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-border/40 rounded-xl space-y-3">
                <BookOpen className="mx-auto size-7 text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground">No study plans yet.</p>
                <Button onClick={() => handleOpenWizardWithAssessment()} size="sm" variant="outline" className="h-7 text-xs">
                  Create first plan
                </Button>
              </div>
            ) : (
              <>
                {/* Next Session */}
                {categorizedSessions.nextSession && (
                  <CollapsibleSection
                    icon={<Sparkles className="size-3.5 text-primary" />}
                    label="Up next"
                    count={1}
                    expanded={nextExpanded}
                    onToggle={() => setNextExpanded(!nextExpanded)}
                    accent
                  >
                    <Card className="rounded-xl border border-border/50 bg-card shadow-none p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              <Clock className="size-2.5 mr-1 opacity-60" />
                              {format(parseISO(categorizedSessions.nextSession.scheduled_start), "EEE, MMM d 'at' HH:mm")}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {categorizedSessions.nextSession.duration_minutes}m
                            </span>
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            {categorizedSessions.nextSession.topic || categorizedSessions.nextSession.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRescheduleSession(categorizedSessions.nextSession)}
                            className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
                          >
                            <RotateCcw className="size-3 mr-1" /> Reschedule
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => router.push(`/student/study/session/${categorizedSessions.nextSession?.id}`)}
                            className="h-7 px-3 text-xs gap-1"
                          >
                            <Play className="size-3 fill-current" /> Start
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </CollapsibleSection>
                )}

                {/* Upcoming */}
                {categorizedSessions.upcoming.length > 0 && (
                  <CollapsibleSection
                    icon={<Clock className="size-3.5 text-muted-foreground" />}
                    label="Upcoming"
                    count={categorizedSessions.upcoming.length}
                    expanded={upcomingExpanded}
                    onToggle={() => setUpcomingExpanded(!upcomingExpanded)}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {categorizedSessions.upcoming.map((s) => (
                        <div
                          key={s.id}
                          className="p-3 rounded-lg border border-border/40 bg-card flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                        >
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">{s.title || s.topic}</p>
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <CalendarIcon className="size-2.5 shrink-0" />
                              {format(parseISO(s.scheduled_start), "MMM d, HH:mm")}
                              <span className="opacity-60">· {s.duration_minutes}m</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setRescheduleSession(s)}
                              className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                            >
                              Reschedule
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => router.push(`/student/study/session/${s.id}`)}
                              className="h-6 text-[11px] px-2 gap-1"
                            >
                              <Play className="size-2.5 fill-current" /> Start
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}

                {/* Missed */}
                {categorizedSessions.missedOrRescheduled.length > 0 && (
                  <CollapsibleSection
                    icon={<AlertTriangle className="size-3.5" />}
                    label="Missed"
                    count={categorizedSessions.missedOrRescheduled.length}
                    expanded={missedExpanded}
                    onToggle={() => setMissedExpanded(!missedExpanded)}
                    variant="warning"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {categorizedSessions.missedOrRescheduled.map((s) => (
                        <div
                          key={s.id}
                          className="p-3 rounded-lg border border-border/40 bg-muted/20 flex items-center justify-between gap-3"
                        >
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">{s.topic || s.title}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {format(parseISO(s.scheduled_start), "MMM d, HH:mm")}
                            </p>
                          </div>
                          <Button
                            size="sm" variant="outline"
                            onClick={() => setRescheduleSession(s)}
                            className="h-6 text-[11px] px-2 shrink-0 border-border/60"
                          >
                            Reschedule
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}

                {/* Completed */}
                {categorizedSessions.completed.length > 0 && (
                  <CollapsibleSection
                    icon={<CheckCircle2 className="size-3.5" />}
                    label="Completed"
                    count={categorizedSessions.completed.length}
                    expanded={completedExpanded}
                    onToggle={() => setCompletedExpanded(!completedExpanded)}
                    variant="success"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {categorizedSessions.completed.map((s) => (
                        <div
                          key={s.id}
                          className="p-3 rounded-lg border border-border/40 bg-muted/10 flex items-center justify-between gap-3"
                        >
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">{s.topic || s.title}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {s.knowledge_check_score
                                ? `Score: ${Math.round(s.knowledge_check_score)}%`
                                : "Completed"}
                            </p>
                          </div>
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => router.push(`/student/study/session/${s.id}`)}
                            className="h-6 text-[11px] px-2 shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            Review
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}

                {/* Active Plans */}
                <div className="pt-2 border-t border-border/20 space-y-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Active plans ({plans.length})
                  </p>
                  {plans.map((plan) => {
                    const isExpanded = expandedPlanIds.has(plan.id);
                    return (
                      <Card key={plan.id} className="rounded-xl border border-border/40 bg-card shadow-none overflow-hidden">
                        {/* Plan header */}
                        <div
                          onClick={() => togglePlanExpanded(plan.id)}
                          className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 text-left hover:bg-muted/20 transition-colors cursor-pointer"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="secondary" className="text-[10px] font-normal">{plan.study_type}</Badge>
                              <Badge variant="outline" className="text-[10px] font-normal border-border/60">{plan.priority} priority</Badge>
                              <Badge variant="outline" className="text-[10px] font-normal border-border/60">{plan.readiness_score ?? 0}% ready</Badge>
                            </div>
                            <p className="text-sm font-medium text-foreground">{plan.title}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {plan.daily_goal} · {plan.session_duration_minutes} min/session
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); setAdjustModalPlan(plan); }}
                              className="h-7 text-xs text-muted-foreground hover:text-foreground px-2 gap-1"
                            >
                              <SlidersHorizontal className="size-3" /> Adjust
                            </Button>
                            <div className="p-1 text-muted-foreground">
                              {isExpanded
                                ? <ChevronUp className="size-4" />
                                : <ChevronDown className="size-4" />}
                            </div>
                          </div>
                        </div>

                        {/* Plan sessions */}
                        {isExpanded && plan.sessions && plan.sessions.length > 0 && (
                          <div className="border-t border-border/30 p-4 space-y-2">
                            <p className="text-[11px] text-muted-foreground">
                              {plan.sessions.length} sessions
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                              {plan.sessions.map((s) => (
                                <div
                                  key={s.id}
                                  className="px-2.5 py-2 rounded-lg border border-border/30 bg-muted/10 flex items-center justify-between gap-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-medium text-foreground truncate">{s.topic || s.title}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {s.scheduled_start
                                        ? format(parseISO(s.scheduled_start), "MMM d, HH:mm")
                                        : "Unscheduled"} · {s.status.toLowerCase()}
                                    </p>
                                  </div>
                                  {s.status !== "COMPLETED" && (
                                    <Button
                                      variant="ghost" size="sm"
                                      onClick={() => setRescheduleSession(s)}
                                      className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground shrink-0"
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
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </Tabs>

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
      <RescheduleModal
        session={rescheduleSession}
        isOpen={!!rescheduleSession}
        onClose={() => setRescheduleSession(null)}
        onSessionUpdated={loadData}
      />
    </div>
  );
}

// ── CollapsibleSection ────────────────────────────────────────────────────────
interface CollapsibleSectionProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  accent?: boolean;
  variant?: "default" | "warning" | "success";
  children: React.ReactNode;
}

function CollapsibleSection({
  icon, label, count, expanded, onToggle, accent, variant = "default", children,
}: CollapsibleSectionProps) {
  return (
    <div className="space-y-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full group"
      >
        <div className={cn(
          "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider flex-1",
          variant === "warning" && "text-amber-500 dark:text-amber-400",
          variant === "success" && "text-emerald-600 dark:text-emerald-400",
          variant === "default" && !accent && "text-muted-foreground",
          accent && "text-primary",
        )}>
          {icon}
          {label}
          {count !== undefined && (
            <span className="text-muted-foreground font-normal normal-case tracking-normal">
              ({count})
            </span>
          )}
        </div>
        <div className="text-muted-foreground group-hover:text-foreground transition-colors">
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </div>
      </button>
      {expanded && children}
    </div>
  );
}
