"use client";

import {
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronUp,
  Play,
  SlidersHorizontal,
} from "lucide-react";
import type { StudyPlan, StudySession } from "@/lib/api/study-planner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatSessionRelativeTime } from "@/lib/date-utils";
import { planProgress, sessionLabel } from "@/lib/study-sessions";
import { cn } from "@/lib/utils";

interface PlanCardProps {
  plan: StudyPlan;
  expanded: boolean;
  onToggleExpanded: (planId: string) => void;
  onAdjust: (plan: StudyPlan) => void;
  onReschedule: (session: StudySession) => void;
  onStart: (session: StudySession) => void;
}

export function PlanCard({ plan, expanded, onToggleExpanded, onAdjust, onReschedule, onStart }: PlanCardProps) {
  const { completed, total, percent } = planProgress(plan);
  const sessions = plan.sessions ?? [];
  const panelId = `plan-sessions-${plan.id}`;

  return (
    <Card className="rounded-xl border border-border/50 bg-card shadow-2xs hover:border-primary/30 transition-all overflow-hidden flex flex-col justify-between">
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge
                variant="secondary"
                className="text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 py-0 px-1.5"
              >
                {plan.study_type}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-semibold border-border/60 py-0 px-1.5",
                  plan.priority === "High" &&
                    "text-amber-600 dark:text-amber-400 bg-amber-500/5 border-amber-500/30",
                )}
              >
                {plan.priority}
              </Badge>
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">{plan.title}</h3>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAdjust(plan)}
            aria-label={`Adjust plan ${plan.title}`}
            className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground rounded-md gap-1 shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="size-2.5" aria-hidden /> Adjust
          </Button>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Progress</span>
            <span className="font-semibold text-foreground font-mono">
              {completed}/{total} ({percent}%)
            </span>
          </div>
          <Progress value={percent} className="h-1" aria-label={`${plan.title} progress`} />
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground pt-0.5 border-t border-border/30">
          <span className="truncate">{plan.daily_goal}</span>
          <span className="font-mono text-foreground font-medium shrink-0">
            {plan.session_duration_minutes}m/session
          </span>
        </div>
      </div>

      <div className="px-3.5 py-1.5 bg-muted/20 border-t border-border/30 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onToggleExpanded(plan.id)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>{expanded ? "Hide Sessions" : "View Sessions"}</span>
          {expanded ? (
            <ChevronUp className="size-3" aria-hidden />
          ) : (
            <ChevronDown className="size-3" aria-hidden />
          )}
        </button>
        <span className="text-[10px] text-muted-foreground">{total} Modules</span>
      </div>

      {expanded && sessions.length > 0 && (
        <div id={panelId} className="p-3 border-t border-border/30 bg-muted/10 space-y-1.5 max-h-48 overflow-y-auto">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="p-2 rounded-lg border border-border/40 bg-background flex items-center justify-between gap-2 text-xs"
            >
              <div className="space-y-0.5 min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-foreground truncate">{sessionLabel(s)}</p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <CalendarIcon className="size-2" aria-hidden />
                  {s.scheduled_start ? formatSessionRelativeTime(s.scheduled_start) : "Unscheduled"}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {s.status === "COMPLETED" ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-semibold border-emerald-500/30 text-emerald-600 bg-emerald-500/5 px-1.5 py-0"
                  >
                    <Check className="size-2 mr-0.5" aria-hidden /> Done
                  </Badge>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onReschedule(s)}
                      className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Reschedule
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onStart(s)}
                      className="h-5 text-[10px] px-2 gap-0.5 font-bold cursor-pointer"
                    >
                      <Play className="size-2 fill-current" aria-hidden /> Start
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
}
