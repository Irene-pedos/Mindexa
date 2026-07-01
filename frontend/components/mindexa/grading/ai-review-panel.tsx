"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BrainCircuit, AlertCircle, CheckCircle2, ShieldAlert, ThumbsUp, ThumbsDown, HelpCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { aiGradingApi, GradeReviewDetails } from "@/lib/api/ai-grading";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AIReviewPanelProps {
  queueItemId?: string;
  responseId: string;
  maxScore: number;
  onSuggestionApplied?: (score: number) => void;
}

export function AIReviewPanel({ queueItemId, responseId, maxScore, onSuggestionApplied }: AIReviewPanelProps) {
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<GradeReviewDetails | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<"thumbs_up" | "thumbs_down" | null>(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await aiGradingApi.getGradeDetails(responseId);
      setDetails(data);
    } catch (err: any) {
      if (err.response?.status !== 404) {
        setError("Failed to load AI grading details.");
      }
    } finally {
      setLoading(false);
    }
  }, [responseId]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const handleRequestSuggestion = async () => {
    if (!queueItemId) {
      toast.error("Cannot request AI suggestion without a queue item ID.");
      return;
    }

    setRequesting(true);
    setError(null);
    try {
      await aiGradingApi.requestAISuggestion(queueItemId);
      toast.success("AI suggestion generated successfully.");
      await loadDetails();
    } catch (err: any) {
      setError(err.message || "Failed to generate AI suggestion.");
      toast.error("AI Generation failed");
    } finally {
      setRequesting(false);
    }
  };

  const handleFeedback = async (isAccurate: boolean) => {
    if (!details?.id) return;
    setFeedbackSaving(true);
    try {
      await aiGradingApi.submitAIFeedback(details.id, isAccurate);
      setFeedbackStatus(isAccurate ? "thumbs_up" : "thumbs_down");
      toast.success("Accuracy signal recorded for model calibration.");
    } catch (err: any) {
      toast.error("Failed to submit feedback.");
    } finally {
      setFeedbackSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="shadow-none border border-dashed border-primary/20">
        <CardContent className="p-6">
          <Skeleton variant="text" className="w-1/2 mb-4" />
          <Skeleton variant="text" className="w-full h-20" />
        </CardContent>
      </Card>
    );
  }

  const hasSuggestion = details?.ai_suggested_score !== null && details?.ai_suggested_score !== undefined;

  return (
    <Card className="shadow-none border border-primary/20 bg-primary/5">
      <CardHeader className="pb-3 border-b border-primary/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-4 text-primary" />
            <CardTitle className="text-sm font-semibold">AI Grading Assistant</CardTitle>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {details?.ai_grading_basis === "RUBRIC" && (
              <Badge variant="outline" className="text-[10px] font-bold uppercase bg-emerald-500/10 border-emerald-500/20 text-emerald-700 shadow-none">
                Rubric-Based
              </Badge>
            )}
            {details?.ai_grading_basis === "GENERAL_KNOWLEDGE" && (
              <Badge variant="outline" className="text-[10px] font-bold uppercase bg-amber-500/10 border-amber-500/20 text-amber-700 shadow-none">
                General Knowledge
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px] font-medium uppercase bg-background border border-primary/20 text-muted-foreground">
              AI Suggestion Only
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="size-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {!hasSuggestion ? (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
            <Loader2 className="size-6 text-primary/50 animate-spin mb-2" />
            <p className="text-sm font-medium text-foreground">AI Review in Progress</p>
            <p className="text-xs text-muted-foreground max-w-[250px]">
              The AI grading assistant automatically processes submissions in the background. Please check back shortly for the suggested score and rationale.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Suggested Score</p>
                <div className="text-2xl font-bold text-primary">
                  {details.ai_suggested_score} <span className="text-sm text-muted-foreground font-medium">/ {maxScore}</span>
                </div>
              </div>
              
              {details.ai_confidence && (
                <div className="text-right flex items-center gap-1.5 justify-end">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-end gap-1">
                      Confidence
                    </p>
                    <Badge variant={details.ai_confidence > 0.8 ? "outline" : "secondary"} className="text-xs">
                      {(details.ai_confidence * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground/60 hover:text-muted-foreground transition-colors self-end mb-1">
                          <HelpCircle className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[200px] text-[11px] p-2 bg-popover text-popover-foreground border shadow-md">
                        Confidence score measures semantic similarity to reference solutions and alignment with configured rubrics. Scores above 80% indicate highly structured matching.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>

            <Separator className="bg-primary/10" />

            {/* Why this score? Expandable section (Bug 15) */}
            <div className="border border-primary/10 rounded-lg overflow-hidden bg-background">
              <button
                type="button"
                onClick={() => setExplainOpen(!explainOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                <span>Why this score?</span>
                <span className="text-[10px] normal-case font-medium text-muted-foreground">
                  {explainOpen ? "Hide Details ▲" : "View Breakdown ▼"}
                </span>
              </button>
              {explainOpen && (
                <div className="p-3 space-y-3 text-[11px] leading-relaxed text-foreground/80 border-t border-primary/10 bg-muted/5">
                  <div>
                    <span className="font-bold text-muted-foreground uppercase block mb-1">Grading Source Basis</span>
                    <p>
                      {details.ai_grading_basis === "RUBRIC"
                        ? "Graded against the lecturer-defined rubric. Rubric criteria weights and descriptors were used to calculate individual category marks."
                        : "Graded using general subject matter knowledge because no explicit rubric has been configured for this question node."}
                    </p>
                  </div>

                  {((details.ai_feedback_strengths && details.ai_feedback_strengths.length > 0) ||
                    (details.ai_feedback_improvements && details.ai_feedback_improvements.length > 0) ||
                    (details.ai_feedback_suggestions && details.ai_feedback_suggestions.length > 0)) ? (
                    <div className="space-y-2">
                      {details.ai_feedback_strengths && details.ai_feedback_strengths.length > 0 && (
                        <div>
                          <span className="font-bold text-emerald-700 uppercase block mb-0.5">Key Strengths Matched</span>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {details.ai_feedback_strengths.map((str, idx) => (
                              <li key={idx}>{str}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {details.ai_feedback_improvements && details.ai_feedback_improvements.length > 0 && (
                        <div>
                          <span className="font-bold text-amber-700 uppercase block mb-0.5">Concepts Needing Improvement</span>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {details.ai_feedback_improvements.map((imp, idx) => (
                              <li key={idx}>{imp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <span className="font-bold text-muted-foreground uppercase block mb-1">Evaluation Details</span>
                      <p>The AI confidence score reflects semantic mapping alignment with the reference answers and grading criteria guidelines.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rationale</p>
              <p className="text-sm leading-relaxed text-foreground/90">
                {details.ai_rationale}
              </p>
            </div>

            {details.rubric_scores && details.rubric_scores.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Rubric Alignment</p>
                <div className="space-y-2">
                  {details.rubric_scores.map((note, idx) => (
                    <div key={idx} className="bg-background rounded border p-3 text-sm">
                      <div className="flex justify-between font-medium mb-1">
                        <span>{note.criterion}</span>
                        <span className="text-primary">{note.marks_awarded} pts</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{note.notes}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Structured feedback signals (Bug 16) */}
            <div className="pt-2.5 border-t border-primary/10 flex items-center justify-between gap-4">
              <span className="text-[11px] font-semibold text-muted-foreground">Was this AI suggestion accurate?</span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={feedbackStatus === "thumbs_up" ? "default" : "outline"}
                  disabled={feedbackSaving || feedbackStatus !== null}
                  onClick={() => handleFeedback(true)}
                  className="h-7 px-2.5 rounded-lg text-xs"
                >
                  <ThumbsUp className="size-3 mr-1" /> Yes
                </Button>
                <Button
                  size="sm"
                  variant={feedbackStatus === "thumbs_down" ? "destructive" : "outline"}
                  disabled={feedbackSaving || feedbackStatus !== null}
                  onClick={() => handleFeedback(false)}
                  className="h-7 px-2.5 rounded-lg text-xs"
                >
                  <ThumbsDown className="size-3 mr-1" /> No
                </Button>
              </div>
            </div>
            
            <div className="pt-2">
              <Alert className="bg-amber-50 border-amber-200 py-2">
                <ShieldAlert className="size-4 text-amber-600" />
                <AlertDescription className="text-[11px] text-amber-800 font-medium">
                  This is an automated suggestion. You must review the rationale and manually enter the final score.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        )}
      </CardContent>
      
      {hasSuggestion && onSuggestionApplied && (
        <CardFooter className="p-4 pt-0 border-t border-primary/10 bg-muted/5 flex justify-end">
          <Button 
            size="sm" 
            variant="secondary"
            onClick={() => onSuggestionApplied(details.ai_suggested_score as number)}
            disabled={details.is_final}
            className="font-medium"
          >
            Use Suggested Score
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
