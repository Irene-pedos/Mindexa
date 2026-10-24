"use client";

import { Info, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ReadinessResult } from "@/lib/assessment-readiness";
import { ReadinessChip } from "./readiness-panel";

type Tone = "good" | "warn" | "bad" | "neutral";

const TONE_BAR: Record<Tone, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  neutral: "bg-primary",
};
const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
  neutral: "text-muted-foreground",
};

function Meter({
  label,
  value,
  planned,
  hint,
  tone,
}: {
  label: string;
  value: number;
  planned: number;
  hint: string;
  tone: Tone;
}) {
  const pct = planned > 0 ? Math.min(100, Math.round((value / planned) * 100)) : value > 0 ? 100 : 0;
  return (
    <div className="w-full min-w-[9.5rem] sm:w-44">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <span className={cn("text-[11px] font-medium", TONE_TEXT[tone])}>{hint}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-xl font-bold tabular-nums leading-none">{value}</span>
        <span className="text-xs tabular-nums text-muted-foreground">/ {planned}</span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={planned}
        aria-valuenow={value}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500", TONE_BAR[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * The sticky strip above the question list: how many questions and marks the paper has against
 * the plan, whether it is ready to submit, and the grading mix.
 */
export function AuthoringStatusBar({
  questionCount,
  plannedQuestions,
  marks,
  plannedMarks,
  closedCount,
  openCount,
  readiness,
  onOpenReadiness,
  onOpenNavigator,
}: {
  questionCount: number;
  plannedQuestions: number;
  marks: number;
  plannedMarks: number;
  closedCount: number;
  openCount: number;
  readiness: ReadinessResult;
  onOpenReadiness: () => void;
  onOpenNavigator: () => void;
}) {
  const questionTone: Tone = questionCount === plannedQuestions ? "good" : questionCount > plannedQuestions ? "neutral" : "warn";
  const questionHint =
    questionCount === plannedQuestions
      ? "complete"
      : questionCount < plannedQuestions
        ? `${plannedQuestions - questionCount} to add`
        : `${questionCount - plannedQuestions} extra`;

  const marksTone: Tone = marks === plannedMarks ? "good" : marks > plannedMarks ? "bad" : "warn";
  const marksHint = marks === plannedMarks ? "balanced" : marks > plannedMarks ? `${marks - plannedMarks} over` : `${plannedMarks - marks} short`;

  return (
    <div className="sticky top-14 z-30 rounded-xl border bg-background/90 px-4 py-3 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <Meter label="Questions" value={questionCount} planned={plannedQuestions} hint={questionHint} tone={questionTone} />
        <Meter label="Marks" value={marks} planned={plannedMarks} hint={marksHint} tone={marksTone} />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs lg:hidden" onClick={onOpenNavigator}>
            <ListChecks className="size-3.5" /> Questions
          </Button>
          <ReadinessChip result={readiness} onClick={onOpenReadiness} />
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" aria-label="How this paper is graded">
                <Info className="size-3.5" />
                <span className="hidden sm:inline">Grading</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3 rounded-xl p-4">
              <div>
                <h4 className="text-sm font-semibold">How this paper is graded</h4>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Closed questions are marked automatically. Open questions wait for you in the grading queue.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border bg-emerald-500/5 p-3">
                  <div className="text-[11px] text-muted-foreground">Auto-marked</div>
                  <div className="text-2xl font-bold tabular-nums text-emerald-600">{closedCount}</div>
                </div>
                <div className="rounded-lg border bg-amber-500/5 p-3">
                  <div className="text-[11px] text-muted-foreground">Needs marking</div>
                  <div className="text-2xl font-bold tabular-nums text-amber-600">{openCount}</div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
