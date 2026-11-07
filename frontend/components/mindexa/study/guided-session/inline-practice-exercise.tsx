"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronRight,
  HelpCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  studyPlannerApi,
  GuidedExercise,
  GuidedExerciseAttempt,
} from "@/lib/api/study-planner";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface InlinePracticeExerciseProps {
  sessionId: string;
  sectionIndex: number;
  sectionTitle: string;
  savedExercises?: GuidedExercise[];
  savedAttempts?: GuidedExerciseAttempt[];
  onExerciseCreated?: (exercise: GuidedExercise) => void;
  onAttemptSubmitted?: (attempt: GuidedExerciseAttempt) => void;
  onProceedToKnowledgeCheck: () => void;
}

export function InlinePracticeExercise({
  sessionId,
  sectionIndex,
  sectionTitle,
  savedExercises = [],
  savedAttempts = [],
  onExerciseCreated,
  onAttemptSubmitted,
  onProceedToKnowledgeCheck,
}: InlinePracticeExerciseProps) {
  const [exercise, setExercise] = useState<GuidedExercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<{
    is_correct: boolean;
    correct_option_index: number;
    explanation: string;
  } | null>(null);

  const fetchNewExercise = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedOption(null);
    setSubmitted(false);
    setFeedback(null);
    setSubmitError(null);
    try {
      const data = await studyPlannerApi.generateGuidedExercise(sessionId, sectionIndex);
      if (!data) {
        throw new Error("No practice exercise generated.");
      }
      setExercise(data);
      onExerciseCreated?.(data);
    } catch (err: any) {
      const msg = err?.message || "Could not load practice exercise";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [sessionId, sectionIndex, onExerciseCreated]);

  // Restore or initialize exercise for this section
  useEffect(() => {
    const sectionExercises = (savedExercises || []).filter(
      (ex) => ex.section_index === sectionIndex,
    );

    if (sectionExercises.length > 0) {
      // 1. Check for an unanswered exercise first
      // A newly generated exercise is appended to the session pool. Prefer the
      // newest unanswered item so the parent's pool update cannot switch the
      // learner back to an older exercise immediately after regeneration.
      const unanswered = [...sectionExercises].reverse().find(
        (ex) => !(savedAttempts || []).some((att) => att.exercise_id === ex.id),
      );

      if (unanswered) {
        setExercise(unanswered);
        setSelectedOption(null);
        setSubmitted(false);
        setFeedback(null);
        setSubmitError(null);
        setError(null);
        setLoading(false);
        return;
      }

      // 2. Otherwise restore the latest exercise and its saved attempt feedback
      const latestEx = sectionExercises[sectionExercises.length - 1];
      const matchingAttempt = (savedAttempts || []).find(
        (att) => att.exercise_id === latestEx.id,
      );

      setExercise(latestEx);
      if (matchingAttempt) {
        setSelectedOption(matchingAttempt.selected_option_index);
        setSubmitted(true);
        setFeedback({
          is_correct: matchingAttempt.is_correct,
          correct_option_index:
            matchingAttempt.correct_option_index ?? latestEx.correct_option_index,
          explanation: matchingAttempt.explanation ?? latestEx.explanation,
        });
      } else {
        setSelectedOption(null);
        setSubmitted(false);
        setFeedback(null);
      }
      setSubmitError(null);
      setError(null);
      setLoading(false);
      return;
    }

    // 3. If no exercise exists yet for this section, generate one
    fetchNewExercise();
  }, [sectionIndex, savedExercises, savedAttempts, fetchNewExercise]);

  const handleSubmit = async () => {
    if (selectedOption === null || !exercise || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await studyPlannerApi.submitGuidedExercise(
        sessionId,
        exercise.id,
        selectedOption,
      );
      setFeedback({
        is_correct: res.is_correct,
        correct_option_index: res.correct_option_index ?? exercise.correct_option_index,
        explanation: res.explanation ?? exercise.explanation,
      });
      setSubmitted(true);
      onAttemptSubmitted?.(res);
    } catch (err: any) {
      const msg = err?.message || "Failed to submit practice attempt";
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
            onClick={fetchNewExercise}
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

  const targetCorrectIndex = feedback?.correct_option_index ?? exercise.correct_option_index;
  const isCorrect = feedback ? feedback.is_correct : selectedOption === targetCorrectIndex;
  const explanationText = feedback?.explanation || exercise.explanation;

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
            onClick={fetchNewExercise}
            className="text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 h-7 px-2.5 gap-1 shrink-0 cursor-pointer"
          >
            <Sparkles className="size-3" /> Retry AI
          </Button>
        </div>
      )}

      <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold"
            >
              <HelpCircle className="mr-1 size-3.5" /> Practice Exercise
            </Badge>
            <span className="text-xs text-muted-foreground font-medium">
              Section {sectionIndex + 1}: {sectionTitle}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchNewExercise}
            disabled={submitting}
            className="text-xs text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
          >
            <RefreshCw className="size-3" /> New Question
          </Button>
        </div>
        <CardTitle className="text-base md:text-lg font-bold text-foreground mt-3 leading-snug">
          {exercise.question_text}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-6 space-y-4">
        {/* Option Choices */}
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

        {/* Immediate Explanation Card */}
        {submitted && (
          <div
            className={cn(
              "mt-6 p-4 rounded-xl border text-xs leading-relaxed space-y-2 animate-in fade-in duration-300",
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
              <span>{isCorrect ? "Correct Solution!" : "Needs Review"}</span>
            </div>
            <p>{explanationText}</p>
          </div>
        )}
      </CardContent>

      <CardFooter className="p-6 border-t border-border/50 flex items-center justify-between gap-4">
        {!submitted ? (
          <Button
            onClick={handleSubmit}
            disabled={selectedOption === null || submitting}
            className="w-full md:w-auto text-xs font-semibold px-6 gap-2"
          >
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            {submitting ? "Submitting..." : "Submit Answer"}
          </Button>
        ) : (
          <div className="flex w-full items-center justify-between gap-4">
            <Button
              variant="outline"
              onClick={fetchNewExercise}
              className="text-xs gap-1.5 cursor-pointer"
            >
              <RefreshCw className="size-3.5" /> Practice Another
            </Button>
            <Button
              onClick={onProceedToKnowledgeCheck}
              className="text-xs font-semibold gap-1.5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 text-primary-foreground shadow-md cursor-pointer"
            >
              Start Knowledge Check <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
