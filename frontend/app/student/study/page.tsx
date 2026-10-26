"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  Layers,
  ListChecks,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  studyPlannerApi,
  type StudyPlan,
  type StudyPlannerSummary,
  type StudySession,
} from "@/lib/api/study-planner";
import {
  categorizeSessions,
  filterSessions,
  type SessionFilter,
} from "@/lib/study-sessions";
import { StudyPlanDashboard } from "@/components/mindexa/study/study-plan-dashboard";
import { StudyPlanWizard } from "@/components/mindexa/study/study-plan-wizard";
import { PlanAdjustmentModal } from "@/components/mindexa/study/plan-adjustment-modal";
import { RescheduleModal } from "@/components/mindexa/study/reschedule-modal";
import { NextUpBanner } from "@/components/mindexa/study/next-up-banner";
import { PlanCard } from "@/components/mindexa/study/plan-card";
import { SessionAgenda } from "@/components/mindexa/study/session-agenda";
import { ContextualExplainer } from "@/components/mindexa/common/contextual-explainer";
import { HelpPopover } from "@/components/mindexa/common/help-popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SparklesIcon } from "@/components/ui/sparkles-icon";

const TAB_TRIGGER_CLASS =
  "text-xs font-semibold px-3 py-1 rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs gap-1.5 cursor-pointer";

type StudyTab = "overview" | "plans";

interface StudyData {
  summary: PromiseSettledResult<StudyPlannerSummary>;
  plans: PromiseSettledResult<StudyPlan[]>;
}

/** Each request settles independently so one failing endpoint never hides the other's data. */
async function fetchStudyData(): Promise<StudyData> {
  const [summary, plans] = await Promise.allSettled([
    studyPlannerApi.getSummary(),
    studyPlannerApi.listPlans(),
  ]);
  return { summary, plans };
}

function LoadingSkeleton({ variant }: { variant: StudyTab }) {
  if (variant === "overview") {
    return (
      <div className="space-y-2.5" aria-busy="true" aria-label="Loading study overview">
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading study plans">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="py-10 text-center border border-dashed border-destructive/30 rounded-xl p-6 space-y-3 bg-destructive/5 max-w-md mx-auto"
    >
      <AlertTriangle className="size-6 text-destructive/70 mx-auto" aria-hidden />
      <div className="space-y-0.5">
        <h3 className="text-xs font-bold text-foreground">We couldn&apos;t load your study planner</h3>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Check your connection and try again. Your plans are safe.
        </p>
      </div>
      <Button
        onClick={onRetry}
        size="sm"
        variant="outline"
        className="h-7.5 px-3 text-xs font-semibold rounded-lg gap-1.5 cursor-pointer"
      >
        <RefreshCw className="size-3" aria-hidden /> Try again
      </Button>
    </div>
  );
}

export default function StudentStudyPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StudyTab>("overview");
  const [summary, setSummary] = useState<StudyPlannerSummary | null>(null);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [initialAssessmentId, setInitialAssessmentId] = useState<string | undefined>(undefined);
  const [adjustModalPlan, setAdjustModalPlan] = useState<StudyPlan | null>(null);
  const [rescheduleSession, setRescheduleSession] = useState<StudySession | null>(null);

  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("upcoming");
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<string>>(new Set());

  const applyResult = useCallback((result: StudyData) => {
    if (result.summary.status === "fulfilled") setSummary(result.summary.value);
    if (result.plans.status === "fulfilled") setPlans(result.plans.value ?? []);

    const failures = [result.summary, result.plans].filter((r) => r.status === "rejected").length;
    setLoadFailed(failures === 2);
    if (failures === 1) {
      toast.warning("Some study data could not be refreshed. Showing the last loaded version.");
    }
    setLoading(false);
  }, []);

  /** Re-fetches without blanking the page; passed to modals so they can refresh after a change. */
  const loadData = useCallback(async () => applyResult(await fetchStudyData()), [applyResult]);

  useEffect(() => {
    let cancelled = false;
    void fetchStudyData().then((result) => {
      if (!cancelled) applyResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyResult]);

  const retry = useCallback(() => {
    setLoading(true);
    void loadData();
  }, [loadData]);

  const openWizard = useCallback((assessmentId?: string) => {
    setInitialAssessmentId(assessmentId);
    setWizardOpen(true);
  }, []);

  const handleSelectTab = useCallback(
    (tab: string, topic?: string) => {
      if (tab === "tutor" || topic) {
        router.push(
          topic ? `/student/study/tutor?topic=${encodeURIComponent(topic)}` : "/student/study/tutor",
        );
      } else if (tab === "overview" || tab === "plans") {
        setActiveTab(tab);
      }
    },
    [router],
  );

  const openSession = useCallback(
    (session: Pick<StudySession, "id">) => router.push(`/student/study/session/${session.id}`),
    [router],
  );

  const togglePlanExpanded = useCallback((planId: string) => {
    setExpandedPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }, []);

  const categorized = useMemo(() => categorizeSessions(plans), [plans]);
  const visibleSessions = useMemo(
    () => filterSessions(categorized, sessionFilter),
    [categorized, sessionFilter],
  );

  return (
    <div
      data-tour="student-study"
      className="space-y-4 w-full mx-auto animate-in fade-in duration-200 pb-6"
    >
      <header className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-border/30 pb-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <SparklesIcon size={16} className="text-primary shrink-0" />
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-foreground">Study Planner</h1>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Curriculum schedules, active recall coaching, and assessment readiness.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <HelpPopover topic="ai-study" variant="badge" label="Study Help" />
          <ContextualExplainer topic="ai-study-support" variant="pill" label="Guide" />
          <Button
            variant="ghost"
            onClick={() => router.push("/student/study/tutor")}
            size="sm"
            className="h-7.5 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Sparkles className="size-3 text-primary" aria-hidden />
            AI Tutor
          </Button>
          <Button
            onClick={() => openWizard()}
            size="sm"
            className="h-7.5 px-3 text-xs font-semibold gap-1.5 rounded-lg shadow-2xs cursor-pointer"
          >
            <Plus className="size-3" aria-hidden /> New Plan
          </Button>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as StudyTab)}
        className="w-full space-y-3"
      >
        <TabsList className="h-8.5 p-0.5 bg-muted/50 rounded-lg border border-border/60">
          <TabsTrigger value="overview" className={TAB_TRIGGER_CLASS}>
            <Layers className="size-3 text-primary" aria-hidden />
            Overview
          </TabsTrigger>
          <TabsTrigger value="plans" className={TAB_TRIGGER_CLASS}>
            <ListChecks className="size-3 text-primary" aria-hidden />
            Plans & Schedule
            <Badge
              variant="secondary"
              className="ml-1 text-[10px] font-bold px-1 py-0 bg-primary/10 text-primary border-primary/20"
            >
              {plans.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {activeTab === "overview" && (
          <div className="space-y-3">
            {loading ? (
              <LoadingSkeleton variant="overview" />
            ) : loadFailed ? (
              <LoadError onRetry={retry} />
            ) : (
              <StudyPlanDashboard
                summary={summary}
                onOpenWizard={openWizard}
                onOpenAdjustModal={setAdjustModalPlan}
                onSelectTab={handleSelectTab}
              />
            )}
          </div>
        )}

        {activeTab === "plans" && (
          <div className="space-y-4">
            {loading ? (
              <LoadingSkeleton variant="plans" />
            ) : loadFailed ? (
              <LoadError onRetry={retry} />
            ) : plans.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-border/60 rounded-xl p-6 space-y-3 bg-muted/5 max-w-md mx-auto">
                <BookOpen className="size-6 text-muted-foreground/30 mx-auto" aria-hidden />
                <div className="space-y-0.5">
                  <h3 className="text-xs font-bold text-foreground">No active study plans yet</h3>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Build a study schedule synchronized with your syllabus.
                  </p>
                </div>
                <Button
                  onClick={() => openWizard()}
                  size="sm"
                  className="h-7.5 px-3 text-xs font-semibold rounded-lg shadow-2xs gap-1.5 cursor-pointer"
                >
                  <Sparkles className="size-3" aria-hidden />
                  Create AI Study Plan
                </Button>
              </div>
            ) : (
              <>
                {categorized.nextSession && (
                  <NextUpBanner
                    session={categorized.nextSession}
                    onStart={openSession}
                    onReschedule={setRescheduleSession}
                  />
                )}

                <section className="space-y-2" aria-label="Active plans">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <BookOpen className="size-3 text-primary" aria-hidden /> Active Plans ({plans.length})
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {plans.map((plan) => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        expanded={expandedPlanIds.has(plan.id)}
                        onToggleExpanded={togglePlanExpanded}
                        onAdjust={setAdjustModalPlan}
                        onReschedule={setRescheduleSession}
                        onStart={openSession}
                      />
                    ))}
                  </div>
                </section>

                <SessionAgenda
                  categorized={categorized}
                  sessions={visibleSessions}
                  filter={sessionFilter}
                  onFilterChange={setSessionFilter}
                  onReschedule={setRescheduleSession}
                  onOpen={openSession}
                />
              </>
            )}
          </div>
        )}
      </Tabs>

      <StudyPlanWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSuccess={loadData}
        initialAssessmentId={initialAssessmentId}
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
