// frontend/components/mindexa/study-reader/page-check-panel.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  PageCheckQuestion,
  PageCheckSubmitResponse,
  ReaderSource,
} from "./types";
import { studyReaderApi } from "@/lib/api/study-reader";
import {
  Target,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  ArrowRight,
  BookmarkCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PageCheckPanelProps {
  source: ReaderSource;
  currentPage: number;
  selectedText: string | null;
  onPageCheckCompleted: () => void;
  onSelectPage: (page: number) => void;
}

export function PageCheckPanel({
  source,
  currentPage,
  selectedText,
  onPageCheckCompleted,
  onSelectPage,
}: PageCheckPanelProps) {
  const [questions, setQuestions] = useState<PageCheckQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PageCheckSubmitResponse | null>(null);

  const loadQuiz = useCallback(async () => {
    try {
      setLoading(true);
      setResult(null);
      setSelectedAnswers({});
      const res = await studyReaderApi.generatePageCheck(source.kind, source.id, {
        page_number: currentPage,
        selected_text: selectedText || undefined,
      });
      setQuestions(res.questions || []);
    } catch {
      toast.error("Failed to generate page check");
    } finally {
      setLoading(false);
    }
  }, [source.kind, source.id, currentPage, selectedText]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    if (result) return; // Locked once submitted
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const handleSubmit = async () => {
    if (questions.length === 0 || submitting) return;

    const answersPayload = questions.map((q) => ({
      question_id: q.id,
      selected_option_index: selectedAnswers[q.id] ?? 0,
      selected_option_text: q.options[selectedAnswers[q.id] ?? 0] || "",
    }));

    setSubmitting(true);
    try {
      const res = await studyReaderApi.submitPageCheck(source.kind, source.id, {
        page_number: currentPage,
        answers: answersPayload,
      });
      setResult(res);
      onPageCheckCompleted();
      if (res.passed) {
        toast.success(`Passed page check! Score: ${res.score}/${res.max_score}`);
      } else {
        toast.info(`Review point added to your spaced focus queue.`);
      }
    } catch {
      toast.error("Failed to submit page check");
    } finally {
      setSubmitting(false);
    }
  };

  const allAnswered = questions.length > 0 && questions.every((q) => selectedAnswers[q.id] !== undefined);

  return (
    <div className="flex flex-col h-full select-none">
      {/* Top Header */}
      <div className="p-3 border-b border-border/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Target className="size-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate">
            Page Check (p. {currentPage})
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={loadQuiz}
          disabled={loading}
          title="Regenerate questions"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin text-primary")} />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-3">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="size-7 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">
              Generating active recall questions from page {currentPage}…
            </p>
          </div>
        ) : questions.length > 0 ? (
          <div className="space-y-4 pb-6">
            {/* Score Result Card */}
            {result && (
              <div
                className={cn(
                  "p-3.5 rounded-2xl border space-y-2 animate-in zoom-in-95 duration-200",
                  result.passed
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {result.passed ? (
                      <CheckCircle2 className="size-5 text-emerald-500" />
                    ) : (
                      <XCircle className="size-5 text-rose-500" />
                    )}
                    <span className="text-xs font-bold">
                      {result.passed ? "Comprehension Mastered" : "Needs Review"}
                    </span>
                  </div>

                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs font-mono font-bold px-2 py-0.5",
                      result.passed
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40"
                        : "bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/40"
                    )}
                  >
                    {result.score} / {result.max_score} ({result.percentage}%)
                  </Badge>
                </div>

                {!result.passed && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    This page has been flagged in your <strong>Focus Weakness Queue</strong>. You&apos;ll be prompted to revisit it in 24 hours.
                  </p>
                )}
              </div>
            )}

            {/* Questions List */}
            {questions.map((q, qIndex) => {
              const fb = result?.feedback.find((f) => f.question_id === q.id);

              return (
                <div
                  key={q.id}
                  className="p-3.5 rounded-2xl border border-border/50 bg-card/60 space-y-3 shadow-xs"
                >
                  <div className="flex items-start gap-2">
                    <span className="size-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 font-mono">
                      {qIndex + 1}
                    </span>
                    <p className="text-xs font-semibold text-foreground leading-relaxed">
                      {q.question}
                    </p>
                  </div>

                  {/* Option cards */}
                  <div className="space-y-1.5 pl-7">
                    {q.options.map((opt, optIndex) => {
                      const isSelected = selectedAnswers[q.id] === optIndex;
                      const isCorrect = optIndex === q.correct_option_index;
                      const showFeedback = Boolean(result);

                      let optionStyle = "border-border/50 bg-card/40 hover:bg-muted/40 text-foreground/90";
                      if (showFeedback) {
                        if (isCorrect) {
                          optionStyle = "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold";
                        } else if (isSelected && !isCorrect) {
                          optionStyle = "border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-300";
                        }
                      } else if (isSelected) {
                        optionStyle = "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/40";
                      }

                      return (
                        <button
                          key={optIndex}
                          type="button"
                          disabled={Boolean(result)}
                          onClick={() => handleSelectOption(q.id, optIndex)}
                          className={cn(
                            "w-full p-2.5 rounded-xl border text-left text-xs transition-all flex items-center gap-2 cursor-pointer",
                            optionStyle
                          )}
                        >
                          <span className="size-4 rounded-full border border-current/40 text-[9px] font-bold flex items-center justify-center shrink-0 uppercase font-mono">
                            {String.fromCharCode(65 + optIndex)}
                          </span>
                          <span className="flex-1 leading-snug">{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Explanation feedback */}
                  {result && (
                    <div className="mt-2 pl-7 pt-2 border-t border-border/30 text-[11px] text-muted-foreground leading-relaxed">
                      <span className="font-semibold text-foreground">Explanation: </span>
                      {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Bottom Actions */}
            <div className="pt-2">
              {!result ? (
                <Button
                  onClick={handleSubmit}
                  disabled={!allAnswered || submitting}
                  className="w-full h-9 text-xs font-semibold rounded-xl gap-1.5"
                >
                  {submitting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Target className="size-3.5" />
                  )}
                  <span>Submit Answers</span>
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={loadQuiz}
                    className="flex-1 h-9 text-xs rounded-xl"
                  >
                    Retake Quiz
                  </Button>
                  <Button
                    onClick={() => onSelectPage(currentPage + 1)}
                    className="flex-1 h-9 text-xs font-semibold rounded-xl gap-1"
                  >
                    <span>Next Page</span>
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-16 text-center text-xs text-muted-foreground space-y-2">
            <HelpCircle className="size-8 mx-auto text-muted-foreground/30" />
            <p className="font-medium">No quiz questions generated</p>
            <Button onClick={loadQuiz} size="sm" variant="outline" className="text-xs">
              Generate Questions
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
