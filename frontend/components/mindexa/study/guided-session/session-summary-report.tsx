"use client";

import React from "react";
import {
  Trophy,
  Target,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  CalendarClock,
  FileText,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";
import { StudySession, KnowledgeCheckReport } from "@/lib/api/study-planner";

interface SessionSummaryReportProps {
  session: StudySession;
  report?: KnowledgeCheckReport | null;
  onReturnToPlanner: () => void;
  /** Reopen the lesson from the first section so the student can revise. */
  onReviewLesson?: () => void;
  /** Ask the AI to mark written answers in a report that predates AI marking. */
  onGetWrittenFeedback?: () => void;
  gettingWrittenFeedback?: boolean;
}

export function SessionSummaryReport({
  session,
  report,
  onReturnToPlanner,
  onReviewLesson,
  onGetWrittenFeedback,
  gettingWrittenFeedback = false,
}: SessionSummaryReportProps) {
  const activeReport = report || session.knowledge_check_report;
  const hasKnowledgeCheck = Boolean(activeReport && typeof activeReport.score_percentage === "number");

  const plannedMinutes =
    session.lesson_plan_json?.estimated_duration_minutes ?? session.duration_minutes;

  const sections = session.lesson_sections_json || [];
  const attempts = session.guided_practice_attempts_json || [];
  const practiceCorrect = attempts.filter((a) => a.is_correct).length;
  const practicedSections = new Set(attempts.map((a) => a.section_index));

  const gradedQuestions = hasKnowledgeCheck ? activeReport?.question_grades || [] : [];
  const questionText = (id: string, fallbackIndex: number) =>
    session.quiz_questions?.find((q) => q.id === id)?.question_text ||
    `Question ${fallbackIndex + 1}`;
  const isUnanswered = (answer?: string) =>
    !answer || answer.trim() === "" || answer === "No answer provided";

  // Written answers that were never marked for meaning (graded before AI marking existed, or
  // while it was unavailable) have no real feedback yet.
  const writtenNeedingFeedback = gradedQuestions.filter((g) => {
    const type = session.quiz_questions
      ?.find((q) => q.id === g.question_id)
      ?.question_type?.toUpperCase();
    return (
      (type === "SHORT_ANSWER" || type === "OPEN_QUESTION") &&
      !isUnanswered(g.student_answer) &&
      g.graded_by !== "ai"
    );
  });

  const weakConcepts = activeReport?.weak_concepts ?? [];
  const missedQuestions = gradedQuestions.filter((g) => !g.is_correct);
  const recommendedMaterials = activeReport?.recommended_materials ?? [];
  const review = activeReport?.review ?? null;
  const reviewDate = review?.scheduled_start ? new Date(review.scheduled_start) : null;
  const needsAttention =
    weakConcepts.length > 0 ||
    (activeReport?.recommendations?.length ?? 0) > 0 ||
    recommendedMaterials.length > 0 ||
    review !== null;

  const reflections = Object.entries(session.section_reflections_json || {})
    .map(([idx, text]) => ({
      index: Number(idx),
      title: sections[Number(idx)]?.section_title || `Section ${Number(idx) + 1}`,
      text,
    }))
    .filter((r) => r.text && r.text.trim())
    .sort((a, b) => a.index - b.index);

  return (
    <Card className="w-full border border-border bg-card rounded-2xl overflow-hidden space-y-6 shadow-xs animate-in fade-in duration-300">
      {/* Non-Gradient Clean Header */}
      <CardHeader className="border-b border-border/60 bg-background px-6 sm:px-8 py-6 text-center space-y-3">
        {hasKnowledgeCheck ? (
          <div className="mx-auto inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
            <Trophy className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span>Completed with Knowledge Check</span>
          </div>
        ) : (
          <div className="mx-auto inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20 text-xs font-semibold">
            <CheckCircle2 className="size-4 text-sky-600 dark:text-sky-400" />
            <span>Completed (Without Knowledge Check)</span>
          </div>
        )}

        <div className="space-y-1">
          <CardTitle className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            {session.topic}
          </CardTitle>
          {session.title && (
            <p className="text-xs sm:text-sm text-muted-foreground font-medium">
              {session.title}
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-4 sm:px-6 md:px-8 space-y-6">
        {/* Responsive Stats Row (1-col on mobile, 3-col on sm/md) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="p-4 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/30 transition-colors text-center space-y-1 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1.5">
              <Target className="size-3.5 text-amber-500" /> Practice
            </span>
            <p className="text-lg sm:text-xl font-bold text-foreground">
              {attempts.length > 0 ? `${practiceCorrect}/${attempts.length}` : "None"}
            </p>
            <span className="text-[10px] text-muted-foreground">
              {attempts.length > 0
                ? `correct across ${practicedSections.size} of ${sections.length} sections`
                : "No practice questions answered"}
            </span>
          </div>

          <div className="p-4 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/30 transition-colors text-center space-y-1 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1.5">
              <TrendingUp className="size-3.5 text-emerald-500" /> Knowledge Check
            </span>
            <p className="text-lg sm:text-xl font-bold text-foreground">
              {hasKnowledgeCheck ? `${Math.round(activeReport!.score_percentage)}%` : "Not Taken"}
            </p>
            <span className="text-[10px] text-muted-foreground">
              {hasKnowledgeCheck ? "Score achieved" : "Self-study evaluation"}
            </span>
          </div>

          <div className="p-4 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/30 transition-colors text-center space-y-1 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1.5">
              <Clock className="size-3.5 text-primary" /> Planned Duration
            </span>
            <p className="text-lg sm:text-xl font-bold text-foreground">
              {plannedMinutes}m
            </p>
            <span className="text-[10px] text-muted-foreground">Scheduled study time</span>
          </div>
        </div>

        {!hasKnowledgeCheck && (
          <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 text-xs text-foreground/90 leading-relaxed">
            You finished this session without taking the knowledge check, so there are no scores or
            weak areas to show. Your lesson, practice and notes are saved, and you can reopen the
            lesson below.
          </div>
        )}

        {/* What to work on, and why */}
        {hasKnowledgeCheck && needsAttention && (
          <div className="p-4 sm:p-5 rounded-xl border border-amber-500/25 bg-amber-500/5 space-y-4">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-4" /> What to work on next
            </h4>

            {weakConcepts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-foreground">
                  Why: you missed questions on
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {weakConcepts.map((concept, i) => (
                    <span
                      key={`${concept}-${i}`}
                      className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[11px] font-medium"
                    >
                      {concept}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {activeReport?.recommendations && activeReport.recommendations.length > 0 && (
              <ul className="list-disc list-inside text-xs text-foreground/90 space-y-1">
                {activeReport.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            )}

            {recommendedMaterials.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <BookOpen className="size-3.5 text-primary" /> Re-read these course materials
                </p>
                <ul className="space-y-1 text-xs text-foreground/90">
                  {recommendedMaterials.map((m) => (
                    <li key={m.resource_id} className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-primary shrink-0" />
                      <span className="font-medium">{m.title}</span>
                      {m.page_number ? (
                        <span className="text-muted-foreground text-[11px]">(p. {m.page_number})</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {review && reviewDate && !Number.isNaN(reviewDate.getTime()) && (
              <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/70 p-3 text-xs">
                <CalendarClock className="size-4 text-primary shrink-0 mt-0.5" />
                <p className="text-foreground/90 leading-relaxed">
                  A {review.duration_minutes}-minute review session is planned for{" "}
                  <strong>
                    {reviewDate.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
                    {" at "}
                    {reviewDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </strong>{" "}
                  so you revisit these topics a couple of days later, when it helps memory most.
                </p>
              </div>
            )}
          </div>
        )}

        {writtenNeedingFeedback.length > 0 && onGetWrittenFeedback && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
            <Sparkles className="size-4 text-primary shrink-0" />
            <p className="flex-1 min-w-[200px] text-xs text-foreground/90 leading-relaxed">
              {writtenNeedingFeedback.length === 1
                ? "1 written answer was marked by keyword match and has no feedback."
                : `${writtenNeedingFeedback.length} written answers were marked by keyword match and have no feedback.`}{" "}
              Get them marked for meaning, with notes on what was missing. Your score and weak areas
              will update to match.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={onGetWrittenFeedback}
              disabled={gettingWrittenFeedback}
              className="text-xs font-semibold gap-1.5 cursor-pointer"
            >
              {gettingWrittenFeedback ? "Marking..." : "Get AI feedback"}
            </Button>
          </div>
        )}

        {/* Question-by-question review */}
        {gradedQuestions.length > 0 && (
          <details className="group rounded-xl border border-border/60 bg-card" open={missedQuestions.length > 0}>
            <summary className="cursor-pointer select-none px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground flex items-center justify-between">
              <span>
                Review your answers ({gradedQuestions.length - missedQuestions.length} of{" "}
                {gradedQuestions.length} correct)
              </span>
            </summary>
            <div className="px-4 pb-4 space-y-3">
              {gradedQuestions.map((g, idx) => {
                const unanswered = isUnanswered(g.student_answer);
                return (
                  <div
                    key={g.question_id || idx}
                    className={
                      g.is_correct
                        ? "rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-1.5 text-xs"
                        : "rounded-lg border border-rose-500/25 bg-rose-500/5 p-3 space-y-1.5 text-xs"
                    }
                  >
                    <p className="font-semibold text-foreground flex items-start gap-1.5">
                      {g.is_correct ? (
                        <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-px" />
                      ) : (
                        <XCircle className="size-4 text-rose-500 shrink-0 mt-px" />
                      )}
                      <span>
                        {idx + 1}. {questionText(g.question_id, idx)}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-semibold text-foreground">Your answer: </span>
                      {unanswered ? <em>not answered</em> : g.student_answer}
                    </p>
                    {(!g.is_correct || (g.score ?? 1) < 0.85) && g.correct_answer && g.correct_answer !== "N/A" && (
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">Correct answer: </span>
                        {g.correct_answer}
                      </p>
                    )}
                    {g.feedback && (
                      <p className="text-foreground">
                        <span className="font-semibold text-primary">Feedback: </span>
                        {g.feedback}
                      </p>
                    )}
                    {g.explanation && (
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">Why: </span>
                        {g.explanation}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {/* Practice, section by section */}
        {sections.length > 0 && attempts.length > 0 && (
          <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Practice by section
            </h4>
            <ul className="space-y-1.5 text-xs">
              {sections.map((sec, idx) => {
                const sectionAttempts = attempts.filter((a) => a.section_index === idx);
                const correct = sectionAttempts.filter((a) => a.is_correct).length;
                return (
                  <li key={idx} className="flex items-center justify-between gap-3">
                    <span className="text-foreground/90">
                      {idx + 1}. {sec.section_title}
                    </span>
                    <span
                      className={
                        sectionAttempts.length === 0
                          ? "text-muted-foreground shrink-0"
                          : correct === sectionAttempts.length
                            ? "text-emerald-600 dark:text-emerald-400 font-semibold shrink-0"
                            : "text-amber-600 dark:text-amber-400 font-semibold shrink-0"
                      }
                    >
                      {sectionAttempts.length === 0
                        ? "Not practised"
                        : `${correct}/${sectionAttempts.length} correct`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Key terms from the lesson, for revision */}
        {(session.lesson_plan_json?.glossary?.length ?? 0) > 0 && (
          <details className="rounded-xl border border-border/60 bg-card">
            <summary className="cursor-pointer select-none px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground">
              Key terms to remember ({session.lesson_plan_json?.glossary?.length})
            </summary>
            <dl className="px-4 pb-4 grid gap-2.5 text-xs">
              {session.lesson_plan_json?.glossary?.map((entry, i) => (
                <div key={`${entry.term}-${i}`}>
                  <dt className="font-semibold text-foreground">{entry.term}</dt>
                  <dd className="text-muted-foreground leading-relaxed">{entry.definition}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}

        {/* The student's own reflections */}
        {reflections.length > 0 && (
          <div className="rounded-xl border border-teal-500/25 bg-teal-500/5 p-4 space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              <FileText className="size-4" /> Your own explanations
            </h4>
            {reflections.map((r) => (
              <div key={r.index} className="space-y-0.5">
                <p className="text-[11px] font-semibold text-foreground">
                  {r.index + 1}. {r.title}
                </p>
                <p className="text-xs text-foreground/85 whitespace-pre-wrap leading-relaxed">{r.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* AI Session Summary Report */}
        {session.session_summary_text && (
          <div className="p-4 sm:p-6 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
              <Sparkles className="size-4" /> AI Session Takeaways & Summary
            </h4>
            <div className="text-xs leading-relaxed text-foreground/90 font-sans">
              <RichMessageRenderer
                content={(() => {
                  const raw = session.session_summary_text.trim();
                  if (raw.startsWith("{") && raw.endsWith("}")) {
                    const tryParseJson = (value: string) => {
                      try {
                        return JSON.parse(value);
                      } catch {
                        return null;
                      }
                    };

                    const data =
                      tryParseJson(raw) ?? tryParseJson(raw.replace(/'/g, '"'));
                    if (data && typeof data === "object") {
                      const parts = [];
                      if (
                        data.key_takeaways &&
                        Array.isArray(data.key_takeaways)
                      ) {
                        parts.push(
                          "**Key Takeaways:**\n" +
                            data.key_takeaways
                              .map((t: string) => `- ${t}`)
                              .join("\n"),
                        );
                      }
                      if (
                        data.concepts_covered &&
                        Array.isArray(data.concepts_covered)
                      ) {
                        parts.push(
                          "**Concepts Covered:** " +
                            data.concepts_covered
                              .map((c: string) => `\`${c}\``)
                              .join(", "),
                        );
                      }
                      if (
                        data.common_mistakes_to_avoid &&
                        Array.isArray(data.common_mistakes_to_avoid)
                      ) {
                        parts.push(
                          "**Common Pitfalls to Avoid:**\n" +
                            data.common_mistakes_to_avoid
                              .map((m: string) => `- ${m}`)
                              .join("\n"),
                        );
                      }
                      if (
                        data.recommendations_for_future_revision &&
                        Array.isArray(data.recommendations_for_future_revision)
                      ) {
                        parts.push(
                          "**Recommendations for Revision:**\n" +
                            data.recommendations_for_future_revision
                              .map((r: string) => `- ${r}`)
                              .join("\n"),
                        );
                      }
                      if (parts.length > 0) return parts.join("\n\n");
                    }
                  }
                  return raw;
                })()}
              />
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="px-4 sm:px-6 md:px-8 py-5 border-t border-border/60 bg-muted/10 flex flex-col sm:flex-row justify-center gap-3">
        {onReviewLesson && sections.length > 0 && (
          <Button
            variant="outline"
            onClick={onReviewLesson}
            className="w-full sm:w-auto text-xs font-semibold px-6 h-10 rounded-xl gap-2 cursor-pointer"
          >
            <BookOpen className="size-4" /> Review the lesson
          </Button>
        )}
        <Button
          onClick={onReturnToPlanner}
          className="w-full sm:w-auto text-xs font-semibold px-8 h-10 rounded-xl gap-2 shadow-xs cursor-pointer"
        >
          Return to Learning Workspace <ArrowRight className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
