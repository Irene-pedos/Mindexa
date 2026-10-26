"use client";

import { useState } from "react";
import { BookOpen, CheckCheck, CheckCircle2, ChevronDown, ChevronUp, Edit3, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { renderRichMathText } from "@/components/mindexa/common/math-renderer";
import type { AIGeneratedQuestionResponse } from "@/lib/api/ai-generation";
import { cn } from "@/lib/utils";

const DIFFICULTY_STYLE: Record<string, string> = {
  hard: "text-rose-700 border-rose-300 dark:border-rose-900 bg-rose-500/10",
  medium: "text-amber-700 border-amber-300 dark:border-amber-900 bg-amber-500/10",
  easy: "text-emerald-700 border-emerald-300 dark:border-emerald-900 bg-emerald-500/10",
};

interface CandidateCardProps {
  question: AIGeneratedQuestionResponse;
  index: number;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}

function CandidateCard({ question, index, busy, onApprove, onReject, onEdit }: CandidateCardProps) {
  const [showRationale, setShowRationale] = useState(false);

  return (
    <Card className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xs transition-all hover:border-border/90">
      <CardHeader className="border-b border-border/50 bg-muted/20 px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="h-4.5 border-primary/30 bg-primary/5 px-2 py-0 text-[10px] font-bold text-primary">
              #{index + 1}
            </Badge>
            <Badge variant="secondary" className="h-4.5 px-1.5 py-0 text-[10px] font-semibold uppercase">
              {question.question_type?.replace("_", " ")}
            </Badge>
            {question.bloom_level && (
              <Badge variant="outline" className="h-4.5 px-1.5 py-0 text-[10px] capitalize text-muted-foreground">
                {question.bloom_level}
              </Badge>
            )}
            {question.difficulty && (
              <Badge
                variant="outline"
                className={cn(
                  "h-4.5 px-1.5 py-0 text-[10px] font-medium capitalize",
                  DIFFICULTY_STYLE[question.difficulty] ?? DIFFICULTY_STYLE.easy
                )}
              >
                {question.difficulty}
              </Badge>
            )}
          </div>
          <Badge
            variant="outline"
            className="h-4.5 border-amber-500/30 bg-amber-500/10 px-2 py-0 text-[10px] text-amber-700 dark:text-amber-400"
          >
            Pending Sign-off
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-3.5 sm:p-4">
        <div className="text-xs font-medium leading-relaxed text-foreground sm:text-sm">
          {question.parsed_question_text
            ? renderRichMathText(question.parsed_question_text)
            : "⚠️ Could not parse question text."}
        </div>

        {question._options && question._options.length > 0 && (
          <div className="space-y-1.5 pt-0.5">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Answer Options &amp; Key:
            </span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {question._options.map((option, optionIndex) => (
                <div
                  key={optionIndex}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border p-2.5 text-xs transition-all",
                    option.is_correct
                      ? "border-emerald-500/50 bg-emerald-500/[0.06] font-medium text-foreground shadow-2xs"
                      : "border-border/60 bg-muted/15 text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                      option.is_correct ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  <div className="flex-1 pt-0.5 text-xs leading-snug">{renderRichMathText(option.text)}</div>
                  {option.is_correct && (
                    <Badge className="h-4 shrink-0 bg-emerald-600 px-1.5 py-0 text-[10px] font-bold text-white">
                      Correct Key
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {question.parsed_explanation && (
          <div className="pt-0.5">
            <Collapsible open={showRationale} onOpenChange={setShowRationale}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  <BookOpen className="size-3.5" />
                  <span>{showRationale ? "Hide" : "View"} Model Answer &amp; Rubric</span>
                  {showRationale ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="space-y-1 rounded-lg border border-border/60 bg-muted/25 p-3 text-xs leading-relaxed text-foreground/90">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Model Answer Rationale:
                  </span>
                  <div>{renderRichMathText(question.parsed_explanation)}</div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-2 border-t border-border/50 bg-muted/15 px-4 py-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={onReject}
          disabled={busy}
          className="h-8 cursor-pointer rounded-lg border-border/70 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10"
        >
          <XCircle className="mr-1 size-3.5" />
          <span>Reject</span>
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            disabled={busy}
            className="h-8 cursor-pointer rounded-lg border-border/70 px-3 text-xs font-semibold hover:bg-muted/50"
          >
            <Edit3 className="mr-1 size-3.5" />
            <span>Edit</span>
          </Button>
          <Button
            size="sm"
            onClick={onApprove}
            disabled={busy}
            className="h-8 cursor-pointer rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700"
          >
            {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : <CheckCircle2 className="mr-1 size-3" />}
            <span>Approve &amp; Store</span>
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

interface ReviewQueueProps {
  candidates: AIGeneratedQuestionResponse[];
  /** Where approved questions go ("Question Bank" or the draft's title). */
  targetName: string;
  progress: { total: number; reviewed: number; percent: number };
  /** Id of the candidate being saved, or "ALL" during a bulk action. */
  reviewingId: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onEdit: (question: AIGeneratedQuestionResponse) => void;
}

/** Stage 3: every candidate waits here for an explicit human decision. */
export function ReviewQueue({
  candidates,
  targetName,
  progress,
  reviewingId,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
  onEdit,
}: ReviewQueueProps) {
  return (
    <div className="space-y-3.5">
      <Card className="space-y-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs sm:p-4">
        <div className="flex flex-col items-start justify-between gap-2.5 sm:flex-row sm:items-center">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">Candidate Item Audit Queue</h3>
              <Badge
                variant="outline"
                className="h-4.5 border-amber-500/40 bg-amber-500/10 px-2 py-0 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
              >
                {candidates.length} Pending Approval
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Target: <strong className="text-foreground">{targetName}</strong>
            </p>
          </div>

          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={onRejectAll}
              disabled={!!reviewingId}
              className="h-8 cursor-pointer rounded-lg border-border/70 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10"
            >
              <XCircle className="mr-1 size-3.5" />
              <span>Reject All</span>
            </Button>
            <Button
              size="sm"
              onClick={onApproveAll}
              disabled={!!reviewingId}
              className="h-8 cursor-pointer rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700"
            >
              {reviewingId === "ALL" ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : (
                <CheckCheck className="mr-1 size-3" />
              )}
              <span>Approve All</span>
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2.5 border-t border-border/50 pt-1.5">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-label="Review progress"
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {progress.reviewed}/{progress.total} ({progress.percent}%)
          </span>
        </div>
      </Card>

      <div className="space-y-3">
        {candidates.map((question, index) => (
          <CandidateCard
            key={question.id}
            question={question}
            index={index}
            busy={reviewingId === question.id}
            onApprove={() => onApprove(question.id)}
            onReject={() => onReject(question.id)}
            onEdit={() => onEdit(question)}
          />
        ))}
      </div>
    </div>
  );
}
