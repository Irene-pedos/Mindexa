"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Clock,
  Calendar,
  RefreshCcw,
  Loader2,
  SlidersHorizontal,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { studyPlannerApi, StudyPlan } from "@/lib/api/study-planner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PlanAdjustmentModalProps {
  plan: StudyPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdjusted: () => void;
}

export function PlanAdjustmentModal({
  plan,
  open,
  onOpenChange,
  onAdjusted,
}: PlanAdjustmentModalProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  if (!plan) return null;

  const handleAction = async (
    action: "reduce_duration" | "shift_weekends" | "rebalance_topics",
  ) => {
    setLoadingAction(action);
    try {
      await studyPlannerApi.adjustPlan(plan.id, action);
      toast.success("Study plan pacing re-balanced successfully!");
      onAdjusted();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to adjust study plan");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] sm:max-w-lg max-h-[85vh] overflow-y-auto p-5 sm:p-6 rounded-2xl border border-border/80 bg-card shadow-2xl space-y-4 focus:outline-hidden">
        <DialogHeader className="space-y-1.5 text-left">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="size-4" />
            </div>
            <DialogTitle className="text-base font-bold text-foreground">
              Adjust Plan Schedule
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Target plan:{" "}
            <span className="font-semibold text-foreground">{plan.title}</span>{" "}
            ({plan.session_duration_minutes}m sessions)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-1">
            <p className="text-xs font-bold text-primary flex items-center gap-1.5">
              <Sparkles className="size-3.5" /> Adaptive Schedule Tuning
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              If your current workload is demanding, select an automated strategy
              below to re-balance your upcoming sessions without losing curriculum
              coverage:
            </p>
          </div>

          <div className="space-y-2.5">
            {/* Action 1: Reduce Duration */}
            <div
              onClick={() =>
                !loadingAction && handleAction("reduce_duration")
              }
              className={cn(
                "p-3.5 rounded-xl border border-border/60 hover:border-primary/40 bg-background hover:bg-muted/30 transition-all text-left flex items-start gap-3 group cursor-pointer",
                loadingAction === "reduce_duration" && "opacity-70 pointer-events-none",
              )}
            >
              <div className="mt-0.5 size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                {loadingAction === "reduce_duration" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Clock className="size-4" />
                )}
              </div>
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                    Reduce Daily Session Length
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[9px] font-semibold bg-primary/10 border-primary/20 text-primary"
                  >
                    Recommended
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Shorten future daily sessions from {plan.session_duration_minutes}
                  m to {Math.max(30, plan.session_duration_minutes - 30)}m for
                  higher completion consistency.
                </p>
              </div>
            </div>

            {/* Action 2: Shift to Weekends */}
            <div
              onClick={() =>
                !loadingAction && handleAction("shift_weekends")
              }
              className={cn(
                "p-3.5 rounded-xl border border-border/60 hover:border-primary/40 bg-background hover:bg-muted/30 transition-all text-left flex items-start gap-3 group cursor-pointer",
                loadingAction === "shift_weekends" && "opacity-70 pointer-events-none",
              )}
            >
              <div className="mt-0.5 size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                {loadingAction === "shift_weekends" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Calendar className="size-4" />
                )}
              </div>
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                    Shift Heavy Sessions to Weekends
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Move longer practice modules to Saturday & Sunday to ease weekday
                  homework load.
                </p>
              </div>
            </div>

            {/* Action 3: Rebalance Topics */}
            <div
              onClick={() =>
                !loadingAction && handleAction("rebalance_topics")
              }
              className={cn(
                "p-3.5 rounded-xl border border-border/60 hover:border-primary/40 bg-background hover:bg-muted/30 transition-all text-left flex items-start gap-3 group cursor-pointer",
                loadingAction === "rebalance_topics" && "opacity-70 pointer-events-none",
              )}
            >
              <div className="mt-0.5 size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                {loadingAction === "rebalance_topics" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCcw className="size-4" />
                )}
              </div>
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                    Re-Distribute Remaining Modules
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Evenly spread remaining uncompleted topics across all days before
                  the target assessment.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8.5 px-4 text-xs rounded-xl border-border/70 cursor-pointer"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
