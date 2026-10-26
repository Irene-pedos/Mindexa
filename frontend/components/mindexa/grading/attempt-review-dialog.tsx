"use client";

import { Loader2, ScanSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AttemptReview, AttemptReviewQuestion } from "@/lib/api/grading";

const VERDICT_STYLE = {
  AGREE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  REVIEW: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  DISAGREE: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
} as const;

const VERDICT_LABEL = {
  AGREE: "Consistent",
  REVIEW: "Look again",
  DISAGREE: "Likely mis-marked",
} as const;

function statusLabel(q: AttemptReviewQuestion): string {
  switch (q.status) {
    case "NOT_GRADED":
      return "Not graded yet";
    case "SKIPPED":
      return "Student skipped";
    case "NOT_CHECKED":
      return "Not checked";
    default:
      return "";
  }
}

interface AttemptReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  review: AttemptReview | null;
  onRun: () => void;
  onGoToQuestion: (questionId: string) => void;
}

/**
 * AI second-marker review of a whole attempt, run before the lecturer finalizes.
 * Works from saved grades and is advisory only.
 */
export function AttemptReviewDialog({
  open,
  onOpenChange,
  loading,
  review,
  onRun,
  onGoToQuestion,
}: AttemptReviewDialogProps) {
  const needsAttention =
    review && (review.review_count > 0 || review.disagree_count > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ScanSearch className="size-4 text-primary" /> AI review of this attempt
          </DialogTitle>
          <DialogDescription className="text-xs">
            A second marker looks over your saved grades for every written answer.
            Ungraded answers are listed but not reviewed. It is advice only — you decide.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
          {loading && (
            <div className="flex items-center gap-2 py-8 justify-center text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Reviewing every answer…
            </div>
          )}

          {!loading && !review && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Save your grades first — the review uses what is saved. Then run it.
            </p>
          )}

          {!loading && review && (
            <>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className={VERDICT_STYLE.AGREE}>
                  {review.agree_count} consistent
                </Badge>
                <Badge variant="outline" className={VERDICT_STYLE.REVIEW}>
                  {review.review_count} to look at
                </Badge>
                <Badge variant="outline" className={VERDICT_STYLE.DISAGREE}>
                  {review.disagree_count} likely mis-marked
                </Badge>
                {review.not_graded_count > 0 && (
                  <Badge variant="outline">{review.not_graded_count} not graded</Badge>
                )}
              </div>

              {review.unreviewed_ai_question_ids.length > 0 && (
                <p className="text-xs rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5 text-amber-900 dark:text-amber-200">
                  {review.unreviewed_ai_question_ids.length} AI grade
                  {review.unreviewed_ai_question_ids.length === 1 ? " was" : "s were"} accepted
                  without a recorded review and will block release until you review{" "}
                  {review.unreviewed_ai_question_ids.length === 1 ? "it" : "them"}.
                </p>
              )}

              {review.overall_notes.map((note, i) => (
                <p key={i} className="text-xs rounded-xl border border-border/50 bg-muted/20 p-2.5">
                  {note}
                </p>
              ))}

              {!needsAttention && review.agree_count > 0 && (
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                  Nothing stood out in the answers that were reviewed.
                </p>
              )}

              <ul className="space-y-2">
                {review.questions.map((q) => (
                  <li
                    key={q.question_id}
                    className="rounded-xl border border-border/50 bg-card/60 p-2.5 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">
                          Question {q.number}
                          <span className="ml-2 font-mono font-normal text-muted-foreground">
                            {q.score ?? "—"} / {q.max_score}
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {q.question_text}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {q.check ? (
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", VERDICT_STYLE[q.check.verdict])}
                          >
                            {VERDICT_LABEL[q.check.verdict]}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            {statusLabel(q)}
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => {
                            onGoToQuestion(q.question_id);
                            onOpenChange(false);
                          }}
                        >
                          Open
                        </Button>
                      </div>
                    </div>

                    {q.check && q.check.verdict !== "AGREE" && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-mono text-muted-foreground">
                          AI range: {q.check.expected_min}–{q.check.expected_max}
                        </p>
                        {q.check.issues.map((issue, i) => (
                          <div key={i}>
                            <p className="text-[11px] leading-snug">{issue.message}</p>
                            {issue.evidence_quote && (
                              <blockquote className="text-[10px] italic border-l-2 border-border pl-2 text-muted-foreground">
                                “{issue.evidence_quote}”
                              </blockquote>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {review.truncated && (
                <p className="text-[10px] text-muted-foreground">
                  Some answers were not reviewed (the review covers up to 12 answers at a time).
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button size="sm" onClick={onRun} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="size-3 animate-spin" /> : <ScanSearch className="size-3" />}
            {review ? "Run again" : "Run review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
