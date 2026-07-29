"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Clock, Calendar, RefreshCcw, Loader2 } from "lucide-react";
import { studyPlannerApi, StudyPlan } from "@/lib/api/study-planner";
import { toast } from "sonner";

interface PlanAdjustmentModalProps {
  plan: StudyPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdjusted: () => void;
}

export function PlanAdjustmentModal({ plan, open, onOpenChange, onAdjusted }: PlanAdjustmentModalProps) {
  const [loading, setLoading] = useState(false);

  if (!plan) return null;

  const handleAction = async (action: "reduce_duration" | "shift_weekends" | "rebalance_topics") => {
    setLoading(true);
    try {
      await studyPlannerApi.adjustPlan(plan.id, action);
      toast.success("Study plan optimized and updated!");
      onAdjusted();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to adjust study plan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 rounded-2xl border border-border bg-card">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            AI Adaptive Plan Optimizer
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Current plan: <span className="font-semibold text-foreground">{plan.title}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-2">
          <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-1">
            <p className="text-xs font-bold text-amber-600">Workload Detection</p>
            <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
              Your current schedule might feel demanding. Choose how AI should re-balance your study sessions:
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => handleAction("reduce_duration")}
              disabled={loading}
              className="w-full p-3.5 rounded-xl border border-border/40 hover:border-primary/40 bg-card/30 hover:bg-card/60 transition-all text-left flex items-start gap-3 group"
            >
              <div className="mt-0.5 p-2 rounded-lg bg-primary/10 text-primary">
                <Clock className="size-4" />
              </div>
              <div className="space-y-0.5 flex-1">
                <div className="text-xs font-bold text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
                  Reduce Session Duration
                  <Badge variant="outline" className="text-[9px]">Recommended</Badge>
                </div>
                <div className="text-[11px] text-muted-foreground font-medium">
                  Shorten future daily sessions from {plan.session_duration_minutes}m to {Math.max(30, plan.session_duration_minutes - 30)}m for easier completion.
                </div>
              </div>
            </button>

            <button
              onClick={() => handleAction("shift_weekends")}
              disabled={loading}
              className="w-full p-3.5 rounded-xl border border-border/40 hover:border-primary/40 bg-card/30 hover:bg-card/60 transition-all text-left flex items-start gap-3 group"
            >
              <div className="mt-0.5 p-2 rounded-lg bg-primary/10 text-primary">
                <Calendar className="size-4" />
              </div>
              <div className="space-y-0.5 flex-1">
                <div className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                  Move Sessions to Weekends
                </div>
                <div className="text-[11px] text-muted-foreground font-medium">
                  Shift heavy study topics to Saturday & Sunday when you have more free time.
                </div>
              </div>
            </button>

            <button
              onClick={() => handleAction("rebalance_topics")}
              disabled={loading}
              className="w-full p-3.5 rounded-xl border border-border/40 hover:border-primary/40 bg-card/30 hover:bg-card/60 transition-all text-left flex items-start gap-3 group"
            >
              <div className="mt-0.5 p-2 rounded-lg bg-primary/10 text-primary">
                <RefreshCcw className="size-4" />
              </div>
              <div className="space-y-0.5 flex-1">
                <div className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                  Re-balance Remaining Topics
                </div>
                <div className="text-[11px] text-muted-foreground font-medium">
                  Evenly re-distribute remaining uncompleted topics up until the target date.
                </div>
              </div>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
