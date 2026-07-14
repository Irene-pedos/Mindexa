"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { assessmentApi } from "@/lib/api/assessment";
import { ModerationPanel } from "@/components/mindexa/grading/moderation-panel";
import { toast } from "sonner";
import { AssessmentSummary, QuestionSummary } from "../types";

export default function QualityAssurancePage() {
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [moderationAssessmentId, setModerationAssessmentId] = useState<string>("all");
  const [moderationQuestionId, setModerationQuestionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  useEffect(() => {
    async function loadAssessments() {
      try {
        const res = await assessmentApi.getAssessments({ status: "PUBLISHED" });
        setAssessments(res.items || []);
      } catch (err: any) {
        toast.error("Failed to load assessments context");
      } finally {
        setLoading(false);
      }
    }
    loadAssessments();
  }, []);

  useEffect(() => {
    if (moderationAssessmentId === "all") {
      setQuestions([]);
      setModerationQuestionId(null);
      return;
    }

    async function loadQuestions() {
      setQuestionsLoading(true);
      try {
        const res = await assessmentApi.getAssessmentQuestions(moderationAssessmentId);
        setQuestions(res || []);
        setModerationQuestionId(null);
      } catch (err: any) {
        toast.error("Failed to load assessment question nodes");
      } finally {
        setQuestionsLoading(false);
      }
    }
    loadQuestions();
  }, [moderationAssessmentId]);

  return (
    <div className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-200">
      <div className="border-b pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Quality Assurance (Moderation)</h1>
        <p className="text-sm text-muted-foreground mt-1 font-medium">
          Perform post-grading moderation and adjust scores across grading nodes.
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center space-y-2">
          <Loader2 className="size-6 text-primary animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground font-medium">Loading moderation context...</p>
        </div>
      ) : (
        <Card className="shadow-none border border-zinc-150 bg-white rounded-xl overflow-hidden">
          <CardHeader className="p-4 border-b border-border/30 bg-muted/10 flex flex-col sm:flex-row items-start sm:items-center gap-4 space-y-0">
            <div className="flex-1 w-full space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground/80">
                Select Assessment
              </Label>
              <Select
                value={moderationAssessmentId}
                onValueChange={setModerationAssessmentId}
              >
                <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
                  <SelectValue placeholder="Choose assessment..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Select an assessment...</SelectItem>
                  {assessments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {questionsLoading ? (
              <div className="flex items-center justify-center h-9 px-4">
                <Loader2 className="size-4 animate-spin text-primary" />
              </div>
            ) : questions.length > 0 && (
              <div className="flex-1 w-full space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground/80">
                  Select Question Node
                </Label>
                <Select
                  value={moderationQuestionId || ""}
                  onValueChange={setModerationQuestionId}
                >
                  <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
                    <SelectValue placeholder="Choose question..." />
                  </SelectTrigger>
                  <SelectContent>
                    {questions.map((q: QuestionSummary, idx: number) => (
                      <SelectItem key={q.id} value={q.question_id || q.id}>
                        Q{idx + 1}:{" "}
                        {q.question?.title ||
                          q.question?.content?.substring(0, 45)}
                        ...
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-5">
            {!moderationQuestionId ? (
              <div className="py-20 text-center text-sm font-medium text-muted-foreground">
                <p className="italic">
                  Awaiting node selection for moderation review.
                </p>
              </div>
            ) : (
              <ModerationPanel questionId={moderationQuestionId} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
