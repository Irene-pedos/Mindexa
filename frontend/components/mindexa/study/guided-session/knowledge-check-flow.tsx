"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Loader2,
  Award,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  studyPlannerApi,
  QuizQuestion,
  KnowledgeCheckReport,
} from "@/lib/api/study-planner";
import { SharedMatchingDnd } from "@/components/mindexa/assessment/matching-dnd";
import { SharedFillInTheBlanksDnd } from "@/components/mindexa/assessment/fill-in-the-blanks-dnd";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface KnowledgeCheckFlowProps {
  sessionId: string;
  topic: string;
  initialQuestions?: QuizQuestion[];
  initialDraftAnswers?: Record<string, any>;
  initialQuestionIndex?: number;
  initialReport?: KnowledgeCheckReport | null;
  onQuestionsChange?: (questions: QuizQuestion[]) => void;
  onDraftChange?: (answers: Record<string, any>, questionIndex: number) => void;
  onCompleteKnowledgeCheck: (report: KnowledgeCheckReport | null) => void;
}

export function KnowledgeCheckFlow({
  sessionId,
  topic,
  initialQuestions = [],
  initialDraftAnswers = {},
  initialQuestionIndex = 0,
  initialReport = null,
  onQuestionsChange,
  onDraftChange,
  onCompleteKnowledgeCheck,
}: KnowledgeCheckFlowProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions);
  const [currentIdx, setCurrentIdx] = useState<number>(() => {
    const maxIdx = Math.max((initialQuestions?.length || 1) - 1, 0);
    return Math.max(0, Math.min(initialQuestionIndex ?? 0, maxIdx));
  });
  const [answers, setAnswers] = useState<Record<string, any>>(initialDraftAnswers || {});
  const [report, setReport] = useState<KnowledgeCheckReport | null>(initialReport);
  const [loading, setLoading] = useState<boolean>(() => {
    // If we already have a report or quiz questions from the server, no initial loading fetch needed
    if (initialReport) return false;
    if (initialQuestions && initialQuestions.length > 0) return false;
    return true;
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPartialConfirm, setShowPartialConfirm] = useState(false);
  const [saveDraftStatus, setSaveDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Version tracking & queue to prevent queued writes from overwriting newer answers
  const draftVersionRef = useRef(0);
  const latestDraftRef = useRef({ answers: initialDraftAnswers || {}, currentIdx: initialQuestionIndex ?? 0 });
  const lastSavedDraftRef = useRef({ answers: initialDraftAnswers || {}, currentIdx: initialQuestionIndex ?? 0 });
  const pendingSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeSavePromiseRef = useRef<Promise<void>>(Promise.resolve());

  const loadQuestions = useCallback(async (forceRegenerate: boolean = false) => {
    setLoading(true);
    setError(null);
    if (forceRegenerate) {
      setAnswers({});
      setCurrentIdx(0);
      setReport(null);
      latestDraftRef.current = { answers: {}, currentIdx: 0 };
      lastSavedDraftRef.current = { answers: {}, currentIdx: 0 };
      onDraftChange?.({}, 0);
    }
    try {
      const qList = await studyPlannerApi.generateKnowledgeCheck(
        sessionId,
        5,
        forceRegenerate,
      );
      if (!qList || qList.length === 0) {
        throw new Error("No knowledge check questions were generated.");
      }
      setQuestions(qList);
      onQuestionsChange?.(qList);
    } catch (err: any) {
      const msg = err?.message || "Failed to load knowledge check questions";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [sessionId, onQuestionsChange, onDraftChange]);

  // Initial load only if questions are completely missing and no report exists
  useEffect(() => {
    if (initialReport) {
      setLoading(false);
      return;
    }
    if (questions.length > 0) {
      setLoading(false);
      return;
    }
    loadQuestions(false);
  }, [initialReport, questions.length, loadQuestions]);

  // Update latest draft ref
  useEffect(() => {
    latestDraftRef.current = { answers, currentIdx };
  }, [answers, currentIdx]);

  // Debounced auto-save for draft answers and question index
  useEffect(() => {
    if (questions.length === 0 || report) return;

    // Check if anything actually changed from last saved draft
    const answersChanged =
      JSON.stringify(answers) !== JSON.stringify(lastSavedDraftRef.current.answers);
    const indexChanged = currentIdx !== lastSavedDraftRef.current.currentIdx;

    if (!answersChanged && !indexChanged) return;

    draftVersionRef.current += 1;
    const thisVersion = draftVersionRef.current;
    setSaveDraftStatus("saving");

    if (pendingSaveTimerRef.current) {
      clearTimeout(pendingSaveTimerRef.current);
    }

    pendingSaveTimerRef.current = setTimeout(() => {
      activeSavePromiseRef.current = activeSavePromiseRef.current
        .catch(() => undefined)
        .then(async () => {
          // If a newer write has been queued, skip this one to avoid overwriting newer answers
          if (thisVersion < draftVersionRef.current) return;

          const toSaveAnswers = latestDraftRef.current.answers;
          const toSaveIdx = Math.max(
            0,
            Math.min(latestDraftRef.current.currentIdx, questions.length - 1),
          );

          await studyPlannerApi.saveKnowledgeCheckDraft(
            sessionId,
            toSaveAnswers,
            toSaveIdx,
          );

          if (thisVersion === draftVersionRef.current) {
            lastSavedDraftRef.current = { answers: toSaveAnswers, currentIdx: toSaveIdx };
            setSaveDraftStatus("saved");
            onDraftChange?.(toSaveAnswers, toSaveIdx);
          }
        })
        .catch(() => {
          if (thisVersion === draftVersionRef.current) {
            setSaveDraftStatus("error");
          }
        });
    }, 600);
  }, [answers, currentIdx, questions.length, report, sessionId, onDraftChange]);

  // Flush on unmount if dirty
  useEffect(() => {
    return () => {
      if (pendingSaveTimerRef.current) {
        clearTimeout(pendingSaveTimerRef.current);
      }
      if (
        questions.length > 0 &&
        !report &&
        (JSON.stringify(latestDraftRef.current.answers) !==
          JSON.stringify(lastSavedDraftRef.current.answers) ||
          latestDraftRef.current.currentIdx !== lastSavedDraftRef.current.currentIdx)
      ) {
        studyPlannerApi
          .saveKnowledgeCheckDraft(
            sessionId,
            latestDraftRef.current.answers,
            Math.max(0, Math.min(latestDraftRef.current.currentIdx, questions.length - 1)),
          )
          .catch(() => {});
      }
    };
  }, [sessionId, questions.length, report]);

  const handleSelect = (questionId: string, val: any) => {
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
    setShowPartialConfirm(false);
  };

  const answeredCount = Object.keys(answers).length;

  const handleSubmit = async () => {
    setSubmitting(true);
    setShowPartialConfirm(false);
    try {
      const res = await studyPlannerApi.submitKnowledgeCheck(
        sessionId,
        answers,
      );
      setReport(res);
      toast.success("Knowledge Check evaluated!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit knowledge check");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-border/70 bg-card p-12 rounded-2xl flex flex-col items-center justify-center min-h-[350px] space-y-4 text-center">
        <div className="relative flex items-center justify-center">
          <div className="size-12 rounded-full bg-primary/10 animate-ping absolute" />
          <div className="size-12 rounded-full bg-primary/20 flex items-center justify-center text-primary relative">
            <Sparkles className="size-6 animate-pulse" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">
            Preparing Knowledge Check...
          </p>
          <p className="text-xs text-muted-foreground font-medium max-w-sm mx-auto">
            Personalizing active-recall questions based on {topic} and your lesson notes.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-full border border-border/40">
          <Loader2 className="size-3 animate-spin text-primary" />
          <span>Analyzing lesson concepts & formulating questions</span>
        </div>
      </Card>
    );
  }

  // ── RESULTS VIEW ─────────────────────────────────────────────────────────────
  if (report) {
    const isPassing = report.score_percentage >= 70;

    return (
      <Card className="border-border/70 bg-card shadow-xl rounded-2xl overflow-hidden space-y-6">
        <CardHeader className="border-b border-border/50 bg-muted/20 px-8 py-6 text-center">
          <div className="mx-auto size-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
            <Award className="size-8" />
          </div>
          <Badge
            variant="outline"
            className={cn(
              "mx-auto text-xs font-bold px-3 py-1 mb-2",
              isPassing
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400",
            )}
          >
            {isPassing ? "Mastery Demonstrated!" : "Needs Further Practice"}
          </Badge>
          <CardTitle className="text-2xl font-extrabold text-foreground">
            Score: {Math.round(report.score_percentage)}%
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Knowledge Check for {topic}
          </p>
        </CardHeader>

        <CardContent className="px-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Estimated Confidence
              </span>
              <p className="text-lg font-bold text-foreground">
                {report.estimated_confidence_level}%
              </p>
            </div>
            <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Questions Evaluated
              </span>
              <p className="text-lg font-bold text-foreground">
                {report.total_questions}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.mastered_concepts &&
              report.mastered_concepts.length > 0 && (
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="size-4" /> Mastered Concepts
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {report.mastered_concepts.map((c, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="text-[11px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      >
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

            {report.weak_concepts && report.weak_concepts.length > 0 && (
              <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="size-4" /> Focus Areas
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {report.weak_concepts.map((c, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="text-[11px] bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    >
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {report.recommendations && report.recommendations.length > 0 && (
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
              <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                <Sparkles className="size-4" /> Recommended Next Steps
              </span>
              <ul className="list-disc list-inside text-xs text-foreground/90 space-y-1">
                {report.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Per-Question Detailed Review */}
          {report.question_grades && report.question_grades.length > 0 && (
            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Detailed Question Breakdown
              </h4>
              <div className="space-y-3">
                {report.question_grades.map((qg, idx) => {
                  const matchingQ = questions.find(
                    (q) => q.id === qg.question_id,
                  );
                  const qText = matchingQ
                    ? matchingQ.question_text
                    : `Question ${idx + 1}`;
                  const isUnanswered = !qg.student_answer || qg.student_answer.trim() === "";

                  return (
                    <div
                      key={qg.question_id || idx}
                      className={cn(
                        "p-4 rounded-xl border space-y-2.5 transition-all text-xs",
                        qg.is_correct
                          ? "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10"
                          : "border-rose-500/30 bg-rose-500/5 dark:bg-rose-500/10",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-foreground leading-snug">
                          {idx + 1}. {qText}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 font-semibold text-[10px]",
                            qg.is_correct
                              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                              : "border-rose-500 text-rose-600 dark:text-rose-400 bg-rose-500/10",
                          )}
                        >
                          {qg.is_correct
                            ? "Correct (+100%)"
                            : isUnanswered
                              ? "Incorrect (Unanswered)"
                              : "Incorrect (0%)"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2 rounded bg-background/60 border border-border/40">
                          <span className="font-semibold text-muted-foreground block text-[10px]">
                            Your Answer
                          </span>
                          <span
                            className={cn(
                              "font-medium",
                              isUnanswered ? "text-amber-600 dark:text-amber-400 italic" : "text-foreground",
                            )}
                          >
                            {isUnanswered ? "No answer provided" : qg.student_answer}
                          </span>
                        </div>
                        {!qg.is_correct && (
                          <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 block text-[10px]">
                              Correct Answer
                            </span>
                            <span className="font-medium text-foreground">
                              {qg.correct_answer || "N/A"}
                            </span>
                          </div>
                        )}
                      </div>

                      {qg.explanation && (
                        <p className="text-[11px] text-muted-foreground bg-background/40 p-2 rounded border border-border/30 italic">
                          <span className="font-semibold not-italic text-foreground">
                            Explanation:{" "}
                          </span>
                          {qg.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="px-8 py-6 border-t border-border/50 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => loadQuestions(true)}
            className="text-xs font-semibold gap-1.5 cursor-pointer"
          >
            <Sparkles className="size-3.5" /> Retake Knowledge Check
          </Button>
          <Button
            onClick={() => onCompleteKnowledgeCheck(report)}
            className="text-xs font-semibold px-6 gap-2 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 text-primary-foreground shadow-md cursor-pointer"
          >
            Finalize Session & View Summary <ArrowRight className="size-4" />
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (questions.length === 0) {
    return (
      <Card className="border-border/70 bg-card p-8 rounded-2xl flex flex-col items-center justify-center min-h-[350px] space-y-4 text-center">
        <div className="size-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
          <AlertTriangle className="size-6" />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-base font-bold text-foreground">
            {error ? "Knowledge Check Unavailable" : "No Questions Generated"}
          </CardTitle>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            {error ||
              "We couldn't generate questions for this session topic. You can retry generation or proceed directly to your session summary."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => onCompleteKnowledgeCheck(null)}
            className="text-xs font-semibold px-4 cursor-pointer"
          >
            Skip & View Summary
          </Button>
          <Button
            onClick={() => loadQuestions(true)}
            className="text-xs font-semibold px-4 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs cursor-pointer"
          >
            <Sparkles className="size-3.5" /> Try Generating Again
          </Button>
        </div>
      </Card>
    );
  }

  const currentQ = questions[currentIdx];
  const qType = (currentQ.question_type || "MCQ").toUpperCase();

  const HAS_BLANK_MARKER = /_{2,}/;
  const rawFillBlank =
    qType === "FILL_BLANKS" || qType === "FILL_BLANK" || qType === "FILL_IN_BLANK";
  const isFillBlank = rawFillBlank && HAS_BLANK_MARKER.test(currentQ.question_text);

  return (
    <Card className="border-border/70 bg-card shadow-lg rounded-2xl overflow-hidden">
      {questions.some((q) => q.generated_by === "fallback") && (
        <div className="mx-6 mt-4 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-500/50 bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase shrink-0"
            >
              Offline Review Mode
            </Badge>
            <span className="text-xs">
              AI question generation was temporarily unavailable. Showing standard review questions.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadQuestions(true)}
            className="text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 h-7 px-2.5 gap-1 shrink-0 cursor-pointer"
          >
            <Sparkles className="size-3" /> Retry AI
          </Button>
        </div>
      )}

      <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-xs font-semibold text-primary border-primary/30"
            >
              Question {currentIdx + 1} of {questions.length}
            </Badge>
            <Badge
              variant="secondary"
              className="text-[10px] font-bold text-muted-foreground uppercase"
            >
              {qType === "FILL_BLANKS" ||
              qType === "FILL_BLANK" ||
              qType === "FILL_IN_BLANK"
                ? "Fill in the Blanks"
                : qType.replace("_", " ")}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            {saveDraftStatus === "saving" && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Loader2 className="size-3 animate-spin text-primary" /> Saving draft...
              </span>
            )}
            {saveDraftStatus === "saved" && (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 className="size-3" /> Draft saved
              </span>
            )}
            <span className="text-xs text-muted-foreground font-medium">
              Answered: {answeredCount}/{questions.length}
            </span>
          </div>
        </div>

        <Progress
          value={((currentIdx + 1) / questions.length) * 100}
          className="h-1.5 w-full bg-muted"
        />

        <CardTitle className="text-base md:text-lg font-bold text-foreground leading-snug pt-2">
          {currentQ.question_text}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-6 space-y-4">
        {/* 1. MATCHING Question Type */}
        {qType === "MATCHING" && (
          <SharedMatchingDnd
            options={(currentQ.premises || []).map((premiseText: string, idx: number) => ({
              id: `opt-${idx}`,
              text: premiseText,
              match_value: currentQ.matches?.[idx] ?? "",
            }))}
            questionId={currentQ.id}
            attemptId={sessionId}
            currentVal={answers[currentQ.id]}
            onAnswerChange={(val) => handleSelect(currentQ.id, val)}
          />
        )}

        {/* 2. FILL_BLANKS Question Type */}
        {isFillBlank && (
          <SharedFillInTheBlanksDnd
            questionText={currentQ.question_text}
            options={(currentQ.options || []).map((optStr, idx) => ({
              id: `pool-${idx}`,
              text: optStr,
            }))}
            questionId={currentQ.id}
            attemptId={sessionId}
            currentVal={answers[currentQ.id]}
            onAnswerChange={(val) => handleSelect(currentQ.id, val)}
          />
        )}

        {/* 3. TRUE_FALSE Question Type */}
        {qType === "TRUE_FALSE" && (
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto pt-2">
            {["True", "False"].map((opt, idx) => {
              const isSelected = answers[currentQ.id] === opt;
              return (
                <button
                  key={idx}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleSelect(currentQ.id, opt)}
                  className={cn(
                    "p-4 rounded-xl border text-sm font-bold transition-all duration-200 text-center shadow-2xs cursor-pointer",
                    isSelected
                      ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                      : "border-border/60 hover:border-primary/50 hover:bg-muted/30",
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {/* 4. SHORT_ANSWER Question Type */}
        {(qType === "SHORT_ANSWER" || (rawFillBlank && !isFillBlank)) && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground block">
              Provide your concise written response:
            </label>
            <Input
              value={answers[currentQ.id] || ""}
              onChange={(e) => handleSelect(currentQ.id, e.target.value)}
              placeholder="Type your answer here..."
              className="text-xs p-3 rounded-xl border-border/60 focus-visible:ring-primary h-11"
            />
          </div>
        )}

        {/* 5. OPEN_QUESTION / Essay Question Type */}
        {qType === "OPEN_QUESTION" && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground block">
              Provide your detailed explanation:
            </label>
            <Textarea
              value={answers[currentQ.id] || ""}
              onChange={(e) => handleSelect(currentQ.id, e.target.value)}
              placeholder="Write your explanation or reflection here..."
              rows={4}
              className="text-xs p-3 rounded-xl border-border/60 focus-visible:ring-primary min-h-[120px]"
            />
          </div>
        )}

        {/* 6. MCQ / Multiple Choice Question Type */}
        {(qType === "MCQ" ||
          ![
            "MATCHING",
            "FILL_BLANKS",
            "FILL_BLANK",
            "FILL_IN_BLANK",
            "TRUE_FALSE",
            "SHORT_ANSWER",
            "OPEN_QUESTION",
          ].includes(qType)) && (
          <div className="space-y-3" role="radiogroup" aria-label="Question options">
            {(currentQ.options || []).map((opt, idx) => {
              const isSelected =
                answers[currentQ.id] === opt ||
                answers[currentQ.id] === String(idx);

              return (
                <button
                  key={idx}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleSelect(currentQ.id, opt)}
                  className={cn(
                    "w-full text-left p-4 rounded-xl border text-xs transition-all duration-200 flex items-center gap-3 cursor-pointer",
                    isSelected
                      ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary"
                      : "border-border/60 hover:border-primary/50 hover:bg-muted/30",
                  )}
                >
                  <span className="size-6 rounded-full border border-current flex items-center justify-center text-[11px] font-bold shrink-0">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>

      <CardFooter className="p-6 border-t border-border/50 flex flex-wrap items-center justify-between gap-4">
        <Button
          variant="outline"
          onClick={() => setCurrentIdx((p) => Math.max(0, p - 1))}
          disabled={currentIdx === 0}
          className="text-xs font-semibold cursor-pointer"
        >
          Previous
        </Button>

        <div className="flex items-center gap-3">
          {currentIdx < questions.length - 1 ? (
            <Button
              onClick={() =>
                setCurrentIdx((p) => Math.min(questions.length - 1, p + 1))
              }
              className="text-xs font-semibold px-5 cursor-pointer"
            >
              Next Question
            </Button>
          ) : showPartialConfirm ? (
            <div className="flex items-center gap-2 p-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10">
              <span className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                {answeredCount}/{questions.length} answered. Unanswered = 0%.
              </span>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitting}
                className="h-7 text-xs font-bold px-3 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                {submitting ? <Loader2 className="size-3 animate-spin" /> : "Confirm & Submit"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowPartialConfirm(false)}
                className="h-7 text-xs text-muted-foreground cursor-pointer"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => {
                if (answeredCount < questions.length) {
                  setShowPartialConfirm(true);
                } else {
                  handleSubmit();
                }
              }}
              disabled={submitting || answeredCount === 0}
              className="text-xs font-bold px-6 gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : answeredCount < questions.length ? (
                `Submit Check (${answeredCount}/${questions.length})`
              ) : (
                "Submit Knowledge Check"
              )}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
