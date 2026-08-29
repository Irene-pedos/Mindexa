"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Loader2,
  Award,
  AlertTriangle,
} from "lucide-react";
import {
  studyPlannerApi,
  QuizQuestion,
  StudySession,
  KnowledgeCheckReport,
} from "@/lib/api/study-planner";
import { SharedMatchingDnd } from "@/components/mindexa/assessment/matching-dnd";
import { SharedFillInTheBlanksDnd } from "@/components/mindexa/assessment/fill-in-the-blanks-dnd";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SessionQuizModalProps {
  session: StudySession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuizCompleted: () => void;
}

export function SessionQuizModal({
  session,
  open,
  onOpenChange,
  onQuizCompleted,
}: SessionQuizModalProps) {
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [report, setReport] = useState<KnowledgeCheckReport | null>(null);

  if (!session) return null;

  const handleGenerateQuiz = async (forceRegenerate: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const generated = await studyPlannerApi.generateQuiz(
        session.id,
        questionCount,
        forceRegenerate
      );
      if (!generated || generated.length === 0) {
        throw new Error("No quiz questions were generated.");
      }
      setQuestions(generated);
      setCurrentIdx(0);
      setAnswers({});
      setReport(null);
    } catch (err: any) {
      const msg = err?.message || "Failed to generate AI checkpoint quiz";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (questionId: string, val: any) => {
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const result = await studyPlannerApi.submitKnowledgeCheck(
        session.id,
        answers
      );
      setReport(result);
      toast.success("AI Checkpoint Quiz evaluated and readiness updated!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit checkpoint quiz");
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = Object.keys(answers).length;
  const currentQ = questions[currentIdx];
  const qType = currentQ ? (currentQ.question_type || "MCQ").toUpperCase() : "MCQ";

  const HAS_BLANK_MARKER = /_{2,}/;
  const rawFillBlank =
    qType === "FILL_BLANKS" ||
    (currentQ?.question_text ? HAS_BLANK_MARKER.test(currentQ.question_text) : false);
  const isFillBlank = Boolean(rawFillBlank);

  const handleModalClose = (isOpen: boolean) => {
    if (!isOpen) {
      setQuestions([]);
      setError(null);
      setAnswers({});
      setCurrentIdx(0);
      setReport(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleModalClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl border border-border bg-card">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <DialogTitle className="text-base font-bold">
              AI Checkpoint Quiz
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Topic: <span className="font-semibold text-foreground">{session.topic}</span>
          </DialogDescription>
        </DialogHeader>

        {questions.length === 0 ? (
          <div className="space-y-4 my-2 text-center py-4">
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
              <Sparkles className="mx-auto size-7 text-primary" />
              <p className="text-xs font-bold text-foreground">Close the Learning Loop</p>
              <p className="text-[11px] text-muted-foreground font-medium max-w-sm mx-auto leading-relaxed">
                Generate an interactive practice quiz grounded directly in your session topics, notes, and course materials.
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs space-y-1.5 text-left">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>AI Generation Temporarily Unavailable</span>
                </div>
                <p className="text-[11px] text-foreground/80 leading-relaxed">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground">Select Question Count:</label>
              <div className="flex justify-center gap-2">
                {[3, 5, 10].map((num) => (
                  <button
                    key={num}
                    onClick={() => setQuestionCount(num)}
                    className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                      questionCount === num
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border/40 text-muted-foreground hover:bg-muted/10"
                    }`}
                  >
                    {num} Questions
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={() => handleGenerateQuiz(!!error)}
              disabled={loading}
              className="w-full h-10 text-xs font-bold uppercase tracking-wider rounded-xl gap-2 shadow-md mt-2"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {error ? "Retry AI Quiz Generation" : "Generate AI Quiz Now"}
            </Button>
          </div>
        ) : !report ? (
          /* Active Question View */
          <div className="space-y-4 my-2">
            {questions.some((q) => q.generated_by === "fallback") && (
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-amber-500/50 bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase shrink-0">
                    Offline Review Mode
                  </Badge>
                  <span className="text-xs">AI quiz generation was unavailable. Showing standard review questions.</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleGenerateQuiz(true)}
                  className="text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 h-7 px-2.5 gap-1 shrink-0"
                >
                  <Sparkles className="size-3" /> Retry AI
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between border-b border-border/40 pb-2 text-xs font-semibold">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                  Question {currentIdx + 1} of {questions.length}
                </Badge>
                <Badge variant="secondary" className="text-[10px] uppercase font-bold text-muted-foreground">
                  {qType.replace("_", " ")}
                </Badge>
              </div>
              <span className="text-muted-foreground text-[11px]">
                Answered: {answeredCount}/{questions.length}
              </span>
            </div>

            <Progress
              value={((currentIdx + 1) / questions.length) * 100}
              className="h-1.5 w-full bg-muted"
            />

            <div className="text-sm font-bold text-foreground leading-relaxed pt-1">
              {currentQ.question_text}
            </div>

            {/* Question Input Renderers */}
            <div className="space-y-3 pt-2">
              {/* 1. MATCHING */}
              {qType === "MATCHING" && (
                <SharedMatchingDnd
                  options={(currentQ.premises || []).map((premiseText: string, idx: number) => ({
                    id: `opt-${idx}`,
                    text: premiseText,
                    match_value: currentQ.matches?.[idx] ?? "",
                  }))}
                  questionId={currentQ.id}
                  attemptId={session.id}
                  currentVal={answers[currentQ.id]}
                  onAnswerChange={(val) => handleSelect(currentQ.id, val)}
                />
              )}

              {/* 2. FILL_BLANKS */}
              {isFillBlank && (
                <SharedFillInTheBlanksDnd
                  questionText={currentQ.question_text}
                  options={(currentQ.options || []).map((optStr, idx) => ({
                    id: `pool-${idx}`,
                    text: optStr,
                  }))}
                  questionId={currentQ.id}
                  attemptId={session.id}
                  currentVal={answers[currentQ.id]}
                  onAnswerChange={(val) => handleSelect(currentQ.id, val)}
                />
              )}

              {/* 3. TRUE_FALSE */}
              {qType === "TRUE_FALSE" && (
                <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto pt-2">
                  {["True", "False"].map((opt, idx) => {
                    const isSelected = answers[currentQ.id] === opt;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelect(currentQ.id, opt)}
                        className={cn(
                          "p-3.5 rounded-xl border text-xs font-bold transition-all text-center",
                          isSelected
                            ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                            : "border-border/60 hover:border-primary/50 hover:bg-muted/30 text-foreground"
                        )}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 4. SHORT_ANSWER */}
              {(qType === "SHORT_ANSWER" || (rawFillBlank && !isFillBlank)) && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground block">
                    Your response:
                  </label>
                  <Input
                    value={answers[currentQ.id] || ""}
                    onChange={(e) => handleSelect(currentQ.id, e.target.value)}
                    placeholder="Type your answer here..."
                    className="text-xs p-3 rounded-xl border-border/60 focus-visible:ring-primary h-10"
                  />
                </div>
              )}

              {/* 5. OPEN_QUESTION */}
              {qType === "OPEN_QUESTION" && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground block">
                    Your explanation:
                  </label>
                  <Textarea
                    value={answers[currentQ.id] || ""}
                    onChange={(e) => handleSelect(currentQ.id, e.target.value)}
                    placeholder="Write your explanation or reflection here..."
                    rows={3}
                    className="text-xs p-3 rounded-xl border-border/60 focus-visible:ring-primary min-h-[90px]"
                  />
                </div>
              )}

              {/* 6. MCQ Default */}
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
                <div className="space-y-2">
                  {(currentQ.options || []).map((opt, oIdx) => {
                    const isSelected =
                      answers[currentQ.id] === opt ||
                      answers[currentQ.id] === String(oIdx);
                    return (
                      <button
                        key={oIdx}
                        type="button"
                        onClick={() => handleSelect(currentQ.id, opt)}
                        className={cn(
                          "w-full p-3 rounded-xl border text-left text-xs font-medium transition-all flex items-center gap-3",
                          isSelected
                            ? "border-primary bg-primary/10 text-primary font-bold shadow-xs ring-1 ring-primary/30"
                            : "border-border/40 hover:bg-muted/10 text-foreground"
                        )}
                      >
                        <span className="size-5 rounded-full border border-current flex items-center justify-center text-[10px] font-bold shrink-0">
                          {String.fromCharCode(65 + oIdx)}
                        </span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentIdx((p) => Math.max(0, p - 1))}
                disabled={currentIdx === 0}
                className="h-8 text-xs font-semibold rounded-lg"
              >
                Previous
              </Button>

              {currentIdx < questions.length - 1 ? (
                <Button
                  size="sm"
                  onClick={() => setCurrentIdx((p) => p + 1)}
                  className="h-8 text-xs font-bold rounded-lg gap-1.5"
                >
                  Next <ArrowRight className="size-3.5" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={submitting || answeredCount === 0}
                  className="h-8 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  {submitting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Award className="size-3.5" />
                  )}
                  Submit & View Results
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Server-Graded Results View */
          <div className="space-y-4 my-2 text-center py-2 animate-in fade-in duration-300">
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
              <Award className="mx-auto size-8 text-emerald-600 dark:text-emerald-400" />
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-bold px-3 py-0.5",
                  report.score_percentage >= 70
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                )}
              >
                {report.score_percentage >= 70 ? "Mastery Demonstrated!" : "Needs Review"}
              </Badge>
              <h3 className="text-xl font-bold text-foreground">
                Score: {Math.round(report.score_percentage)}%
              </h3>
              <p className="text-xs text-muted-foreground font-medium">
                Your Assessment Readiness Score & Learning Profile have been updated!
              </p>
            </div>

            {/* Mastered & Weak Concepts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              {report.mastered_concepts && report.mastered_concepts.length > 0 && (
                <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1.5">
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" /> Mastered Concepts
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {report.mastered_concepts.map((c, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {report.weak_concepts && report.weak_concepts.length > 0 && (
                <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-1.5">
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="size-3.5" /> Focus Areas
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {report.weak_concepts.map((c, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Detailed Question Review */}
            {report.question_grades && report.question_grades.length > 0 && (
              <div className="space-y-2 text-left max-h-56 overflow-y-auto pr-1">
                {report.question_grades.map((qg, idx) => {
                  const matchingQ = questions.find((q) => q.id === qg.question_id);
                  const qText = matchingQ ? matchingQ.question_text : `Question ${idx + 1}`;
                  return (
                    <div
                      key={qg.question_id || idx}
                      className={cn(
                        "p-3 rounded-xl border text-xs space-y-1.5",
                        qg.is_correct
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-rose-500/30 bg-rose-500/5"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 font-semibold text-foreground">
                        <div className="flex items-start gap-2">
                          {qg.is_correct ? (
                            <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="size-4 text-rose-500 shrink-0 mt-0.5" />
                          )}
                          <span>{idx + 1}. {qText}</span>
                        </div>
                        <span className={cn("text-[10px] font-bold shrink-0", qg.is_correct ? "text-emerald-600" : "text-rose-600")}>
                          {qg.is_correct ? "+100%" : "0%"}
                        </span>
                      </div>
                      {!qg.is_correct && (
                        <p className="text-[11px] text-muted-foreground pl-6">
                          <span className="font-semibold text-foreground">Correct Answer:</span> {qg.correct_answer}
                        </p>
                      )}
                      {qg.explanation && (
                        <p className="text-[11px] text-muted-foreground pl-6 italic">
                          {qg.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <Button
              onClick={() => {
                handleModalClose(false);
                onQuizCompleted();
              }}
              className="w-full h-9 text-xs font-bold uppercase tracking-wider rounded-xl shadow-sm mt-2"
            >
              Close & Update Readiness
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
