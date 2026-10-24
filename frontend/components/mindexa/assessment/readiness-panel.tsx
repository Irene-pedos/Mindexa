"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { lecturerAiApi, type PaperFinding } from "@/lib/api/lecturer-ai";
import type { IssueSeverity, PaperIssue, ReadinessResult } from "@/lib/assessment-readiness";
import type { NavigatorQuestion, NavigatorSection } from "./question-navigator";

export interface ChecklistItemView {
  code: string;
  passed: boolean;
  severity: string;
  message: string;
}

const SEVERITY_ORDER: IssueSeverity[] = ["blocking", "warning", "suggestion"];

const DOT: Record<IssueSeverity, string> = {
  blocking: "bg-red-500",
  warning: "bg-amber-500",
  suggestion: "bg-sky-500",
};

/** Compact status button for the wizard header. */
export function ReadinessChip({ result, onClick }: { result: ReadinessResult; onClick: () => void }) {
  const { blocking, warnings } = result.summary;
  const ready = blocking === 0 && warnings === 0;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-8 gap-1.5 text-xs",
        blocking > 0 && "border-red-500/40 text-red-700 dark:text-red-300",
        blocking === 0 && warnings > 0 && "border-amber-500/40 text-amber-700 dark:text-amber-300",
        ready && "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
      )}
    >
      {ready ? <CheckCircle2 className="size-3.5" /> : <ClipboardCheck className="size-3.5" />}
      {ready ? "Ready to submit" : blocking > 0 ? `${blocking} to fix` : `${warnings} to review`}
    </Button>
  );
}

export function ReadinessPanel({
  open,
  onOpenChange,
  result,
  sections,
  questions,
  isSummative,
  hasDraft,
  onGoToQuestion,
  onGenerateForSection,
  buildReviewRequest,
  checklist,
  checklistLoading,
  checklistError,
  onRunChecklist,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: ReadinessResult;
  sections: NavigatorSection[];
  questions: NavigatorQuestion[];
  isSummative: boolean;
  /** The draft has been saved, so the server-side moderation pre-check can run. */
  hasDraft: boolean;
  onGoToQuestion: (id: string) => void;
  onGenerateForSection: (sectionId: string, count: number) => void;
  buildReviewRequest: () => Parameters<typeof lecturerAiApi.reviewPaper>[0];
  checklist: ChecklistItemView[] | null;
  checklistLoading: boolean;
  checklistError: string | null;
  onRunChecklist: () => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<{ summary: string; findings: PaperFinding[] } | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const label = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sections) {
      questions.filter((q) => q.sectionId === s.id).forEach((q, i) => map.set(q.id, `${s.section} · Q${i + 1}`));
    }
    return map;
  }, [sections, questions]);

  const problemQuestions = questions.filter((q) => (result.perQuestion[q.id] ?? []).some((i) => i.severity !== "suggestion"));

  const runReview = async () => {
    setReviewing(true);
    setReviewError(null);
    try {
      setReview(await lecturerAiApi.reviewPaper(buildReviewRequest()));
    } catch (err) {
      setReviewError(err instanceof Error && err.message ? err.message : "The AI review could not run.");
    } finally {
      setReviewing(false);
    }
  };

  const paperIssues = [...result.paper].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <ClipboardCheck className="size-5 text-primary" /> Before you submit
          </SheetTitle>
          <SheetDescription>
            {result.summary.blocking === 0 && result.summary.warnings === 0
              ? "Nothing is blocking this paper."
              : `${result.summary.blocking} must be fixed, ${result.summary.warnings} worth a look.`}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 p-5 text-sm">
            <section aria-labelledby="paper-checks">
              <h3 id="paper-checks" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                The paper as a whole
              </h3>
              {paperIssues.length === 0 ? (
                <p className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="size-4" /> Marks, sections and question counts all match the plan.
                </p>
              ) : (
                <ul className="space-y-2">
                  {paperIssues.map((p: PaperIssue) => (
                    <li key={`${p.code}-${p.sectionId ?? ""}`} className="flex items-start gap-2">
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[p.severity])} />
                      <span className="min-w-0 flex-1">{p.message}</span>
                      {p.code === "SECTION_SHORT" && p.sectionId && p.missingCount ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 gap-1 text-xs"
                          onClick={() => onGenerateForSection(p.sectionId as string, p.missingCount as number)}
                        >
                          <Sparkles className="size-3" /> Generate {p.missingCount}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="question-checks">
              <h3 id="question-checks" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Questions that need attention ({problemQuestions.length})
              </h3>
              {problemQuestions.length === 0 ? (
                <p className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="size-4" /> Every question is complete.
                </p>
              ) : (
                <ul className="space-y-2">
                  {problemQuestions.map((q) => (
                    <li key={q.id} className="rounded-lg border p-2.5">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{label.get(q.id)}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            onOpenChange(false);
                            onGoToQuestion(q.id);
                          }}
                        >
                          Go to question
                        </Button>
                      </div>
                      <ul className="space-y-0.5 text-xs text-muted-foreground">
                        {(result.perQuestion[q.id] ?? [])
                          .filter((i) => i.severity !== "suggestion")
                          .map((i) => (
                            <li key={i.code} className="flex items-start gap-1.5">
                              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DOT[i.severity])} />
                              {i.message}
                            </li>
                          ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {isSummative && (
              <section aria-labelledby="moderation-checks">
                <h3 id="moderation-checks" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Moderation pre-check
                </h3>
                <p className="mb-2 text-xs text-muted-foreground">
                  The same automatic checks the moderator will run, so you can fix them first.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!hasDraft || checklistLoading}
                  onClick={onRunChecklist}
                  className="h-8 gap-1.5 text-xs"
                >
                  {checklistLoading ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                  {checklist ? "Run again" : "Run pre-check"}
                </Button>
                {!hasDraft && <p className="mt-1.5 text-xs text-muted-foreground">Save the draft first.</p>}
                {checklistError && <p className="mt-2 text-xs text-red-600">{checklistError}</p>}
                {checklist && (
                  <ul className="mt-3 space-y-1.5">
                    {checklist.map((c) => (
                      <li key={c.code} className="flex items-start gap-2 text-xs">
                        {c.passed ? (
                          <CheckCircle2 className="mt-px size-3.5 shrink-0 text-emerald-600" />
                        ) : (
                          <AlertTriangle
                            className={cn("mt-px size-3.5 shrink-0", c.severity === "BLOCKING" ? "text-red-600" : "text-amber-600")}
                          />
                        )}
                        <span className={cn(!c.passed && c.severity === "BLOCKING" && "font-medium")}>{c.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <section aria-labelledby="ai-review">
              <h3 id="ai-review" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                AI review of the whole paper
              </h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Looks for topic gaps, uneven difficulty, duplicates and unclear wording. Suggestions only.
              </p>
              <Button
                type="button"
                size="sm"
                disabled={reviewing || questions.length === 0}
                onClick={runReview}
                className="h-8 gap-1.5 bg-violet-600 text-xs text-white hover:bg-violet-700"
              >
                {reviewing ? <Loader2 className="size-3.5 animate-spin" /> : review ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />}
                {reviewing ? "Reviewing…" : review ? "Review again" : "Review my paper"}
              </Button>
              {reviewError && (
                <p className="mt-2 flex items-center gap-2 text-xs text-red-600">
                  {reviewError}
                  <button type="button" className="underline" onClick={runReview}>
                    Retry
                  </button>
                </p>
              )}
              {review && (
                <div className="mt-3 space-y-2">
                  {review.summary && <p className="text-xs">{review.summary}</p>}
                  {review.findings.length === 0 ? (
                    <p className="flex items-center gap-2 text-xs text-emerald-600">
                      <CheckCircle2 className="size-3.5" /> The AI found nothing to flag.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {review.findings.map((f, i) => (
                        <li key={`${f.code}-${i}`} className="flex items-start gap-2 rounded-lg border p-2.5 text-xs">
                          <Badge variant={f.severity === "warning" ? "destructive" : "secondary"} className="shrink-0 text-[10px]">
                            {f.severity === "warning" ? "Likely objection" : "Idea"}
                          </Badge>
                          <span className="min-w-0 flex-1">
                            {f.message}
                            {f.section ? <span className="text-muted-foreground"> ({f.section})</span> : null}
                          </span>
                          {f.question_id && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 shrink-0 px-2 text-xs"
                              onClick={() => {
                                onOpenChange(false);
                                onGoToQuestion(f.question_id as string);
                              }}
                            >
                              Go
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
