"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronRight,
  HelpCircle,
  Loader2,
  AlertTriangle,
  ListChecks,
  PenLine,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  studyPlannerApi,
  GuidedExercise,
  GuidedExerciseAttempt,
  GuidedExerciseType,
} from "@/lib/api/study-planner";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MAX_WRITTEN_ANSWER_CHARS = 1500;

interface InlinePracticeExerciseProps {
  sessionId: string;
  sectionIndex: number;
  sectionTitle: string;
  /** Practice runs through every lesson section, one question each. */
  totalSections: number;
  savedExercises?: GuidedExercise[];
  savedAttempts?: GuidedExerciseAttempt[];
  onExerciseCreated?: (exercise: GuidedExercise) => void;
  onAttemptSubmitted?: (attempt: GuidedExerciseAttempt) => void;
  onNextSection: () => void;
  onPrevSection: () => void;
  /** Go back to reading the lesson (at the section being practised). */
  onBackToLesson: () => void;
  onProceedToKnowledgeCheck: () => void;
}

interface ExerciseFeedback {
  is_correct: boolean;
  correct_option_index: number | null;
  explanation: string;
  /** Written exercises only. */
  score?: number;
  feedback?: string | null;
  model_answer?: string;
}

const isWrittenExercise = (exercise: GuidedExercise | null): boolean =>
  exercise?.question_type === "SHORT_ANSWER";

export function InlinePracticeExercise({
  sessionId,
  sectionIndex,
  sectionTitle,
  totalSections,
  savedExercises = [],
  savedAttempts = [],
  onExerciseCreated,
  onAttemptSubmitted,
  onNextSection,
  onPrevSection,
  onBackToLesson,
  onProceedToKnowledgeCheck,
}: InlinePracticeExerciseProps) {
  const isLastSection = sectionIndex >= totalSections - 1;
  const practicedCount = new Set(
    savedAttempts.map((attempt) => attempt.section_index),
  ).size;

  const [exercise, setExercise] = useState<GuidedExercise | null>(null);
  const [mode, setMode] = useState<GuidedExerciseType>("MCQ");
  // The mode lives in a ref too so changing it never re-creates fetchNewExercise, which would
  // re-run the restore effect below and throw away the question on screen.
  const modeRef = useRef<GuidedExerciseType>("MCQ");
  // The exercise on screen. The restore effect must keep showing it: otherwise answering one
  // question would make an older unanswered one (e.g. from switching format) pop back up.
  const shownExerciseIdRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<ExerciseFeedback | null>(null);

  const resetAnswerState = () => {
    setSelectedOption(null);
    setAnswerText("");
    setSubmitted(false);
    setFeedback(null);
    setSubmitError(null);
  };

  const fetchNewExercise = useCallback(
    async (type?: GuidedExerciseType) => {
      const requestedType = type ?? modeRef.current;
      setLoading(true);
      setError(null);
      resetAnswerState();
      try {
        const data = await studyPlannerApi.generateGuidedExercise(
          sessionId,
          sectionIndex,
          requestedType,
        );
        if (!data) {
          throw new Error("No practice exercise generated.");
        }
        shownExerciseIdRef.current = data.id;
        setExercise(data);
        onExerciseCreated?.(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not load practice exercise";
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [sessionId, sectionIndex, onExerciseCreated],
  );

  const applyMode = (next: GuidedExerciseType) => {
    modeRef.current = next;
    setMode(next);
  };

  // Restore or initialize exercise for this section
  useEffect(() => {
    const sectionExercises = (savedExercises || []).filter(
      (ex) => ex.section_index === sectionIndex,
    );

    if (sectionExercises.length > 0) {
      const hasAttempt = (ex: GuidedExercise) =>
        (savedAttempts || []).some((att) => att.exercise_id === ex.id);

      // 1. Keep the exercise already on screen (answered or not). A newly generated exercise is
      //    appended to the session pool, and answering one must not switch the learner to some
      //    other exercise.
      const shown = shownExerciseIdRef.current
        ? sectionExercises.find((ex) => ex.id === shownExerciseIdRef.current)
        : undefined;
      // 2. Otherwise (first visit to this section): the newest unanswered one, else the latest.
      const unanswered = [...sectionExercises].reverse().find((ex) => !hasAttempt(ex));
      const target = shown ?? unanswered ?? sectionExercises[sectionExercises.length - 1];

      shownExerciseIdRef.current = target.id;
      setExercise(target);
      applyMode(isWrittenExercise(target) ? "SHORT_ANSWER" : "MCQ");

      const matchingAttempt = (savedAttempts || []).find(
        (att) => att.exercise_id === target.id,
      );

      if (!matchingAttempt) {
        // Unanswered: keep whatever the student has typed or picked for this very question.
        setSubmitted(false);
        setFeedback(null);
        setSubmitError(null);
        setError(null);
        setLoading(false);
        return;
      }

      // Answered: show the saved answer and its feedback.
      setSelectedOption(matchingAttempt.selected_option_index ?? null);
      setAnswerText(matchingAttempt.answer_text ?? "");
      setSubmitted(true);
      setFeedback({
        is_correct: matchingAttempt.is_correct,
        correct_option_index:
          matchingAttempt.correct_option_index ?? target.correct_option_index ?? null,
        explanation: matchingAttempt.explanation ?? target.explanation,
        score: matchingAttempt.score,
        feedback: matchingAttempt.feedback,
        model_answer: matchingAttempt.model_answer,
      });
      setSubmitError(null);
      setError(null);
      setLoading(false);
      return;
    }

    // 3. If no exercise exists yet for this section, generate one
    fetchNewExercise();
  }, [sectionIndex, savedExercises, savedAttempts, fetchNewExercise]);

  const switchMode = (next: GuidedExerciseType) => {
    if (next === mode || loading || submitting) return;
    applyMode(next);
    void fetchNewExercise(next);
  };

  const written = isWrittenExercise(exercise);
  const canSubmit = written ? answerText.trim().length > 0 : selectedOption !== null;

  const handleSubmit = async () => {
    if (!exercise || submitting || !canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await studyPlannerApi.submitGuidedExercise(
        sessionId,
        exercise.id,
        written ? { answerText: answerText.trim() } : { selectedOptionIndex: selectedOption as number },
      );
      setFeedback({
        is_correct: res.is_correct,
        correct_option_index: res.correct_option_index ?? exercise.correct_option_index ?? null,
        explanation: res.explanation ?? exercise.explanation,
        score: res.score,
        feedback: res.feedback,
        model_answer: res.model_answer,
      });
      setSubmitted(true);
      onAttemptSubmitted?.(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit practice attempt";
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-border/70 bg-card p-10 rounded-2xl flex flex-col items-center justify-center min-h-[300px] space-y-4 text-center">
        <div className="relative flex items-center justify-center">
          <div className="size-12 rounded-full bg-primary/10 animate-ping absolute" />
          <div className="size-12 rounded-full bg-primary/20 flex items-center justify-center text-primary relative">
            <Sparkles className="size-6 animate-pulse" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">Preparing Practice Exercise...</p>
          <p className="text-xs text-muted-foreground font-medium max-w-sm mx-auto">
            Creating an active-recall exercise tailored to {sectionTitle}.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-full border border-border/40">
          <Loader2 className="size-3 animate-spin text-primary" />
          <span>Grounded in section concepts and course materials</span>
        </div>
      </Card>
    );
  }

  if (!exercise) {
    return (
      <Card className="border-border/70 bg-card p-8 rounded-2xl flex flex-col items-center justify-center min-h-[300px] space-y-4 text-center">
        <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <AlertTriangle className="size-6" />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-base font-bold text-foreground">
            {error ? "Practice Exercise Unavailable" : "No Practice Exercise Available"}
          </CardTitle>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            {error ||
              "Could not generate an exercise for this section. You can retry or proceed directly to the checkpoint quiz."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => void fetchNewExercise()}
            className="text-xs font-semibold px-4 gap-1.5"
          >
            <RefreshCw className="size-3.5" /> Try Generating Again
          </Button>
          <Button
            onClick={onProceedToKnowledgeCheck}
            className="text-xs font-semibold px-4 gap-1.5 bg-primary text-primary-foreground"
          >
            Skip to Knowledge Check <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </Card>
    );
  }

  const targetCorrectIndex = feedback?.correct_option_index ?? exercise.correct_option_index ?? null;
  const isCorrect = feedback
    ? feedback.is_correct
    : selectedOption !== null && selectedOption === targetCorrectIndex;
  const explanationText = feedback?.explanation || exercise.explanation;
  const scorePercent =
    feedback?.score !== undefined ? Math.round(feedback.score * 100) : null;

  return (
    <Card className="border-border/70 bg-card shadow-lg rounded-2xl overflow-hidden">
      {exercise.generated_by === "fallback" && (
        <div className="mx-6 mt-4 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-500/50 bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase shrink-0"
            >
              Offline Mode
            </Badge>
            <span className="text-xs">
              AI exercise generation was unavailable. Showing standard review questions.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchNewExercise()}
            className="text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 h-7 px-2.5 gap-1 shrink-0 cursor-pointer"
          >
            <Sparkles className="size-3" /> Retry AI
          </Button>
        </div>
      )}

      <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold"
            >
              <HelpCircle className="mr-1 size-3.5" /> Practice Exercise
            </Badge>
            <span className="text-xs text-muted-foreground font-medium">
              Section {sectionIndex + 1} of {totalSections}: {sectionTitle}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div
              role="group"
              aria-label="Practice format"
              className="inline-flex rounded-lg border border-border/60 bg-background p-0.5"
            >
              {(
                [
                  { value: "MCQ", label: "Multiple choice", Icon: ListChecks },
                  { value: "SHORT_ANSWER", label: "Write your answer", Icon: PenLine },
                ] as const
              ).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  disabled={submitting}
                  onClick={() => switchMode(value)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer",
                    mode === value
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3" /> {label}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchNewExercise()}
              disabled={submitting}
              className="text-xs text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
            >
              <RefreshCw className="size-3" /> New Question
            </Button>
          </div>
        </div>
        <CardTitle className="text-base md:text-lg font-bold text-foreground mt-3 leading-snug">
          {exercise.question_text}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-6 space-y-4">
        {written ? (
          <div className="space-y-2">
            <label
              htmlFor="written-practice-answer"
              className="text-xs font-semibold text-muted-foreground block"
            >
              Answer in your own words (2–4 sentences):
            </label>
            <Textarea
              id="written-practice-answer"
              value={answerText}
              onChange={(e) => {
                setAnswerText(e.target.value);
                setSubmitError(null);
              }}
              disabled={submitted || submitting}
              maxLength={MAX_WRITTEN_ANSWER_CHARS}
              rows={5}
              placeholder="Explain it as if you were teaching a classmate..."
              className="text-xs p-3 rounded-xl border-border/60 focus-visible:ring-primary min-h-[130px]"
            />
            <div className="flex justify-end text-[10px] text-muted-foreground">
              {answerText.length}/{MAX_WRITTEN_ANSWER_CHARS}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5" role="radiogroup" aria-label="Exercise options">
            {exercise.options.map((opt: string, idx: number) => {
              const isSelected = selectedOption === idx;
              const isTargetCorrect = targetCorrectIndex === idx;

              let stateStyle = "border-border/60 hover:border-primary/50 hover:bg-muted/30";
              if (submitted) {
                if (isTargetCorrect) {
                  stateStyle =
                    "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold";
                } else if (isSelected && !isTargetCorrect) {
                  stateStyle = "border-destructive bg-destructive/10 text-destructive font-semibold";
                } else {
                  stateStyle = "border-border/40 opacity-60";
                }
              } else if (isSelected) {
                stateStyle =
                  "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary";
              }

              return (
                <button
                  key={idx}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={submitted || submitting}
                  onClick={() => {
                    setSelectedOption(idx);
                    setSubmitError(null);
                  }}
                  className={cn(
                    "w-full text-left p-4 rounded-xl border text-xs transition-all duration-200 flex items-center justify-between gap-3 cursor-pointer",
                    submitted && "cursor-default",
                    submitting && "opacity-70 cursor-not-allowed",
                    stateStyle,
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="size-6 rounded-full border border-current flex items-center justify-center text-[11px] font-bold shrink-0">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span>{opt}</span>
                  </div>
                  {submitted && isTargetCorrect && (
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  )}
                  {submitted && isSelected && !isTargetCorrect && (
                    <XCircle className="size-4 text-destructive shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Submit Error Callout */}
        {submitError && (
          <div
            role="alert"
            className="p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{submitError}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSubmit}
              disabled={submitting}
              className="h-6 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10 px-2"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Immediate Feedback Card */}
        {submitted && (
          <div
            className={cn(
              "mt-6 p-4 rounded-xl border text-xs leading-relaxed space-y-2.5 animate-in fade-in duration-300",
              isCorrect
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                : "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200",
            )}
          >
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[11px]">
              {isCorrect ? (
                <CheckCircle2 className="size-4 text-emerald-500" />
              ) : (
                <XCircle className="size-4 text-amber-500" />
              )}
              <span>
                {written
                  ? isCorrect
                    ? "Good answer"
                    : "Needs more work"
                  : isCorrect
                    ? "Correct Solution!"
                    : "Needs Review"}
                {written && scorePercent !== null ? ` · ${scorePercent}%` : ""}
              </span>
            </div>

            {written && feedback?.feedback && (
              <p>
                <span className="font-semibold">Feedback: </span>
                {feedback.feedback}
              </p>
            )}
            {written && feedback?.model_answer && (
              <p>
                <span className="font-semibold">A strong answer: </span>
                {feedback.model_answer}
              </p>
            )}
            {explanationText && <p>{explanationText}</p>}
          </div>
        )}
      </CardContent>

      <CardFooter className="p-6 border-t border-border/50 flex flex-col gap-3 items-stretch">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onPrevSection}
              disabled={sectionIndex === 0 || submitting}
              className="text-xs text-muted-foreground cursor-pointer"
            >
              Previous section
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToLesson}
              disabled={submitting}
              className="text-xs text-muted-foreground cursor-pointer"
            >
              Back to lesson
            </Button>
          </div>

          {!submitted ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={isLastSection ? onProceedToKnowledgeCheck : onNextSection}
                disabled={submitting}
                className="text-xs cursor-pointer"
              >
                {isLastSection ? "Skip to Knowledge Check" : "Skip this section"}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="text-xs font-semibold px-6 gap-2"
              >
                {submitting && <Loader2 className="size-3.5 animate-spin" />}
                {submitting ? (written ? "Marking..." : "Submitting...") : "Submit Answer"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchNewExercise()}
                className="text-xs gap-1.5 cursor-pointer"
              >
                <RefreshCw className="size-3.5" /> Practice Another
              </Button>
              <Button
                onClick={isLastSection ? onProceedToKnowledgeCheck : onNextSection}
                className="text-xs font-semibold gap-1.5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 text-primary-foreground shadow-md cursor-pointer"
              >
                {isLastSection ? "Start Knowledge Check" : "Next Section"}{" "}
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {practicedCount} of {totalSections} sections practised. You can move on to the
          knowledge check at any time.
          {!isLastSection && (
            <>
              {" "}
              <button
                type="button"
                onClick={onProceedToKnowledgeCheck}
                className="underline hover:no-underline cursor-pointer"
              >
                Go to knowledge check now
              </button>
            </>
          )}
        </p>
      </CardFooter>
    </Card>
  );
}
