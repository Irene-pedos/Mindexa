"use client";

import { CheckCircle2, Clock, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface GenerationProgressProps {
  elapsedSeconds: number;
  bloomLevel: string;
  count: number;
  onCancel: () => void;
}

/** Shown while the background worker drafts the batch. */
export function GenerationProgress({ elapsedSeconds, bloomLevel, count, onCancel }: GenerationProgressProps) {
  return (
    <Card
      role="status"
      aria-live="polite"
      className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border/70 bg-card p-6 text-center shadow-xs sm:p-7"
    >
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-2xs">
        <Layers className="size-6 animate-pulse" />
      </div>

      <div className="space-y-1.5">
        <h3 className="text-base font-bold text-foreground">Formulating Candidate Assessment Items</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Retrieving syllabus handouts and calibrating distractors.
        </p>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/60 px-3 py-1 font-mono text-[11px] text-muted-foreground">
          <Clock className="size-3 animate-spin text-primary" />
          <span>Elapsed: {elapsedSeconds}s (~20–30s typical)</span>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-border/50 bg-muted/25 p-3.5 text-left text-xs">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
          <span>Course context and syllabus indexed</span>
        </div>
        <div className="flex items-center gap-2 font-medium text-foreground">
          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
          <span>Bloom&apos;s level ({bloomLevel}) alignment verified</span>
        </div>
        <div className="flex items-center gap-2 font-semibold text-primary">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
          <span>Drafting {count} candidate items &amp; rubrics...</span>
        </div>
      </div>

      <div className="pt-1">
        <Button variant="outline" size="sm" onClick={onCancel} className="h-8 cursor-pointer rounded-lg px-3.5 text-xs">
          Cancel &amp; Adjust Blueprint
        </Button>
      </div>
    </Card>
  );
}
