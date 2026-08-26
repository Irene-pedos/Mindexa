"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle2, XCircle, ArrowRight, Loader2, HelpCircle, Award } from "lucide-react";
import { studyPlannerApi, QuizQuestion, StudySession } from "@/lib/api/study-planner";
import { toast } from "sonner";

interface SessionQuizModalProps {
  session: StudySession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuizCompleted: () => void;
}

export function SessionQuizModal({ session, open, onOpenChange, onQuizCompleted }: SessionQuizModalProps) {
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);

  if (!session) return null;

  const handleGenerateQuiz = async () => {
    setLoading(true);
    try {
      const generated = await studyPlannerApi.generateQuiz(
        session.study_plan_id,
        session.id,
        questionCount
      );
      setQuestions(generated || []);
      setCurrentIdx(0);
      setSelectedAnswers({});
      setShowResults(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate AI checkpoint quiz");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (qIdx: number, optIdx: number) => {
    setSelectedAnswers(prev => ({ ...prev, [qIdx]: optIdx }));
  };

  const calculateScore = () => {
    let score = 0;
    questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correct_option_index) {
        score += 1;
      }
    });
    return score;
  };

  const currentQ = questions[currentIdx];

  return (
    <Dialog open={open} onOpenChange={(v) => { setQuestions([]); setShowResults(false); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-6 rounded-2xl border border-border bg-card">
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
                Generate an AI practice quiz sourced directly from your course slides, notes, and previous session questions.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground">Select Question Count:</label>
              <div className="flex justify-center gap-2">
                {[5, 10, 20].map((num) => (
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
              onClick={handleGenerateQuiz}
              disabled={loading}
              className="w-full h-10 text-xs font-bold uppercase tracking-wider rounded-xl gap-2 shadow-md mt-2"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Generate AI Quiz Now
            </Button>
          </div>
        ) : !showResults ? (
          /* Question View */
          <div className="space-y-4 my-2">
            <div className="flex items-center justify-between border-b border-border/40 pb-2 text-xs font-semibold">
              <span className="text-muted-foreground">Question {currentIdx + 1} of {questions.length}</span>
              <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/20">
                Checkpoint Quiz
              </Badge>
            </div>

            <div className="text-sm font-bold text-foreground leading-relaxed">
              {currentQ.question_text}
            </div>

            <div className="space-y-2">
              {currentQ.options.map((opt, oIdx) => {
                const selected = selectedAnswers[currentIdx] === oIdx;
                return (
                  <button
                    key={oIdx}
                    onClick={() => handleSelectOption(currentIdx, oIdx)}
                    className={`w-full p-3 rounded-xl border text-left text-xs font-medium transition-all ${
                      selected
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                        : "border-border/40 hover:bg-muted/10 text-foreground"
                    }`}
                  >
                    {String.fromCharCode(65 + oIdx)}. {opt}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentIdx(p => Math.max(0, p - 1))}
                disabled={currentIdx === 0}
                className="h-8 text-xs font-semibold rounded-lg"
              >
                Previous
              </Button>

              {currentIdx < questions.length - 1 ? (
                <Button
                  size="sm"
                  onClick={() => setCurrentIdx(p => p + 1)}
                  disabled={selectedAnswers[currentIdx] === undefined}
                  className="h-8 text-xs font-bold rounded-lg gap-1.5"
                >
                  Next <ArrowRight className="size-3.5" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => { setShowResults(true); onQuizCompleted(); }}
                  disabled={selectedAnswers[currentIdx] === undefined}
                  className="h-8 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Finish & View Results
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Results View */
          <div className="space-y-4 my-2 text-center py-2 animate-in fade-in duration-300">
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
              <Award className="mx-auto size-8 text-emerald-600" />
              <h3 className="text-lg font-bold text-foreground">
                Quiz Score: {calculateScore()} / {questions.length} ({Math.round((calculateScore() / questions.length) * 100)}%)
              </h3>
              <p className="text-xs text-muted-foreground font-medium">
                Your Assessment Readiness Score has been updated!
              </p>
            </div>

            <div className="space-y-2 text-left max-h-52 overflow-y-auto pr-1">
              {questions.map((q, idx) => {
                const userAns = selectedAnswers[idx];
                const isCorrect = userAns === q.correct_option_index;
                return (
                  <div key={q.id} className="p-3 rounded-lg border border-border/40 text-xs space-y-1 bg-muted/5">
                    <div className="flex items-start gap-2 font-semibold text-foreground">
                      {isCorrect ? <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="size-4 text-red-500 shrink-0 mt-0.5" />}
                      <span>{q.question_text}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground pl-6">
                      Explanation: {q.explanation}
                    </p>
                  </div>
                );
              })}
            </div>

            <Button
              onClick={() => onOpenChange(false)}
              className="w-full h-9 text-xs font-bold uppercase tracking-wider rounded-xl shadow-sm"
            >
              Close & Update Readiness
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
