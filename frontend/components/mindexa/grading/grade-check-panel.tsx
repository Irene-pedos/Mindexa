"use client";

import { Loader2, ScanSearch, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GradeCheck } from "@/lib/api/grading";

const VERDICT: Record<GradeCheck["verdict"], { label: string; box: string }> = {
  AGREE: {
    label: "Looks consistent",
    box: "border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200",
  },
  REVIEW: {
    label: "Worth a second look",
    box: "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200",
  },
  DISAGREE: {
    label: "Likely mis-marked",
    box: "border-rose-500/30 bg-rose-500/5 text-rose-900 dark:text-rose-200",
  },
};

interface GradeCheckPanelProps {
  result: GradeCheck | null;
  /** The grade was edited after this check ran. */
  stale: boolean;
  loading: boolean;
  canRun: boolean;
  onRun: () => void;
  onUseFeedback: (feedback: string) => void;
}

/** On-demand AI second-marker review shown under the score box. Advisory only. */
export function GradeCheckPanel({
  result,
  stale,
  loading,
  canRun,
  onRun,
  onUseFeedback,
}: GradeCheckPanelProps) {
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canRun || loading}
        onClick={onRun}
        className="h-7 text-xs font-medium rounded-xl gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
      >
        {loading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <ScanSearch className="size-3" />
        )}
        {result ? "Check again" : "Ask AI to check my grade"}
      </Button>

      {result && (
        <div
          className={cn(
            "rounded-xl border p-2.5 space-y-2 transition-opacity",
            VERDICT[result.verdict].box,
            stale && "opacity-60",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-[11px] font-semibold flex items-center gap-1">
              <Sparkles className="size-3" />
              {VERDICT[result.verdict].label}
            </span>
            <span className="text-[10px] font-mono">
              AI range: {result.expected_min}–{result.expected_max}
            </span>
          </div>

          {stale && (
            <p className="text-[10px] font-medium">
              You changed the grade after this check. Check again for an up-to-date review.
            </p>
          )}

          {result.issues.length === 0 && result.verdict === "AGREE" && (
            <p className="text-[11px]">The second marker found nothing to flag.</p>
          )}

          {result.issues.map((issue, i) => (
            <div key={i} className="space-y-0.5">
              <p className="text-[11px] leading-snug">{issue.message}</p>
              {issue.evidence_quote && (
                <blockquote className="text-[10px] italic leading-snug border-l-2 border-current/30 pl-2 opacity-80">
                  “{issue.evidence_quote}”
                </blockquote>
              )}
            </div>
          ))}

          {result.suggested_feedback && (
            <div className="space-y-1 border-t border-current/20 pt-2">
              <p className="text-[10px] font-semibold">Suggested feedback wording</p>
              <p className="text-[11px] leading-snug">{result.suggested_feedback}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={stale}
                onClick={() => onUseFeedback(result.suggested_feedback as string)}
                className="h-6 px-2 text-[10px] font-medium rounded-lg"
              >
                Use this feedback
              </Button>
            </div>
          )}

          <p className="text-[9px] opacity-70">
            AI second opinion — it can be wrong. You decide the final grade.
          </p>
        </div>
      )}
    </div>
  );
}
