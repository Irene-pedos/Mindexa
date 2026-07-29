"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, CheckCircle2, XCircle, RefreshCw, ChevronRight, HelpCircle, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { studyPlannerApi } from "@/lib/api/study-planner";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface InlinePracticeExerciseProps {
  sessionId: string;
  sectionIndex: number;
  sectionTitle: string;
  onProceedToKnowledgeCheck: () => void;
}

export function InlinePracticeExercise({
  sessionId,
  sectionIndex,
  sectionTitle,
  onProceedToKnowledgeCheck,
}: InlinePracticeExerciseProps) {
  const [exercise, setExercise] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const fetchExercise = React.useCallback(async () => {
    setLoading(true);
    setSelectedOption(null);
    setSubmitted(false);
    try {
      const data = await studyPlannerApi.generateGuidedExercise(sessionId, sectionIndex);
      setExercise(data);
    } catch (err: any) {
      toast.error("Could not load practice exercise");
    } finally {
      setLoading(false);
    }
  }, [sessionId, sectionIndex]);

  useEffect(() => {
    fetchExercise();
  }, [fetchExercise]);

  const handleSubmit = () => {
    if (selectedOption === null) return;
    setSubmitted(true);
  };

  if (loading) {
    return (
      <Card className="border-border/70 bg-card p-8 rounded-2xl flex flex-col items-center justify-center min-h-[300px] space-y-4 text-center">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground font-medium">Generating practice exercise for {sectionTitle}...</p>
      </Card>
    );
  }

  if (!exercise) return null;

  const isCorrect = selectedOption === exercise.correct_option_index;

  return (
    <Card className="border-border/70 bg-card shadow-lg rounded-2xl overflow-hidden">
      <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold">
              <HelpCircle className="mr-1 size-3.5" /> Practice Exercise
            </Badge>
            <span className="text-xs text-muted-foreground font-medium">
              Section {sectionIndex + 1}: {sectionTitle}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchExercise}
            className="text-xs text-muted-foreground hover:text-foreground gap-1"
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
        <div className="space-y-2.5">
          {exercise.options.map((opt: string, idx: number) => {
            const isSelected = selectedOption === idx;
            const isTargetCorrect = exercise.correct_option_index === idx;

            let stateStyle = "border-border/60 hover:border-primary/50 hover:bg-muted/30";
            if (submitted) {
              if (isTargetCorrect) {
                stateStyle = "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold";
              } else if (isSelected && !isTargetCorrect) {
                stateStyle = "border-destructive bg-destructive/10 text-destructive font-semibold";
              } else {
                stateStyle = "border-border/40 opacity-60";
              }
            } else if (isSelected) {
              stateStyle = "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary";
            }

            return (
              <button
                key={idx}
                type="button"
                disabled={submitted}
                onClick={() => setSelectedOption(idx)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border text-xs transition-all duration-200 flex items-center justify-between gap-3",
                  stateStyle
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="size-6 rounded-full border border-current flex items-center justify-center text-[11px] font-bold shrink-0">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span>{opt}</span>
                </div>
                {submitted && isTargetCorrect && <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />}
                {submitted && isSelected && !isTargetCorrect && <XCircle className="size-4 text-destructive shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Immediate Explanation Card */}
        {submitted && (
          <div
            className={cn(
              "mt-6 p-4 rounded-xl border text-xs leading-relaxed space-y-2 animate-in fade-in duration-300",
              isCorrect ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200" : "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
            )}
          >
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[11px]">
              {isCorrect ? <CheckCircle2 className="size-4 text-emerald-500" /> : <XCircle className="size-4 text-amber-500" />}
              <span>{isCorrect ? "Correct Solution!" : "Needs Review"}</span>
            </div>
            <p>{exercise.explanation}</p>
          </div>
        )}
      </CardContent>

      <CardFooter className="p-6 border-t border-border/50 flex items-center justify-between gap-4">
        {!submitted ? (
          <Button
            onClick={handleSubmit}
            disabled={selectedOption === null}
            className="w-full md:w-auto text-xs font-semibold px-6"
          >
            Submit Answer
          </Button>
        ) : (
          <div className="flex w-full items-center justify-between gap-4">
            <Button variant="outline" onClick={fetchExercise} className="text-xs gap-1.5">
              <RefreshCw className="size-3.5" /> Practice Another
            </Button>
            <Button
              onClick={onProceedToKnowledgeCheck}
              className="text-xs font-semibold gap-1.5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 text-primary-foreground shadow-md"
            >
              Start Knowledge Check <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
