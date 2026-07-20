"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
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
import {
  Loader2,
  BrainCircuit,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Sparkles,
  RefreshCcw,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { aiGradingApi, GradeReviewDetails } from "@/lib/api/ai-grading";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AIReviewPanelProps {
  queueItemId?: string;
  responseId: string;
  maxScore: number;
  onSuggestionApplied?: (score: number, feedback?: string) => void;
  onSuggestionLoaded?: (
    draft: string,
    strengths: string[],
    improvements: string[],
    suggestions: string[]
  ) => void;
}

export function AIReviewPanel({
  queueItemId,
  responseId,
  maxScore,
  onSuggestionApplied,
  onSuggestionLoaded,
}: AIReviewPanelProps) {
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<GradeReviewDetails | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<
    "thumbs_up" | "thumbs_down" | null
  >(
    null
  );
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [pollTimeoutReached, setPollTimeoutReached] = useState(false);
  const onSuggestionLoadedRef = useRef(onSuggestionLoaded);

  useEffect(() => {
    onSuggestionLoadedRef.current = onSuggestionLoaded;
  }, [onSuggestionLoaded]);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await aiGradingApi.getGradeDetails(responseId);
      setDetails(data);
      if (data && onSuggestionLoadedRef.current) {
        onSuggestionLoadedRef.current(
          data.ai_feedback_draft || "",
          data.ai_feedback_strengths || [],
          data.ai_feedback_improvements || [],
          data.ai_feedback_suggestions || []
        );
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        setError("Failed to load AI grading details.");
      }
    } finally {
      setLoading(false);
    }
  }, [responseId]);

  useEffect(() => {
    setPollCount(0);
    setPollTimeoutReached(false);
    loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    // Exponential backoff polling: 5s → 7.5s → 11.3s → 17s → 25s → 30s max
    // Max 6 polls (≈ 95 seconds total). Much less aggressive than the old setInterval.
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const isPending =
      details?.ai_review_status === "PENDING" ||
      details?.ai_review_status === "PROCESSING";

    if (isPending && pollCount < 6 && !pollTimeoutReached) {
      const delay = Math.min(5000 * Math.pow(1.5, pollCount), 30000);
      timeoutId = setTimeout(() => {
        setPollCount((prev) => prev + 1);
        loadDetails();
      }, delay);
    } else if (pollCount >= 6 && !pollTimeoutReached) {
      setPollTimeoutReached(true);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [details?.ai_review_status, pollCount, pollTimeoutReached, loadDetails]);

  const handleRequestSuggestion = async () => {
    const triggerId = queueItemId || responseId;
    if (!triggerId) {
      toast.error("Cannot request AI suggestion without a queue item ID or response ID.");
      return;
    }

    if (hasSuggestion) {
      if (!confirm("This will discard your current edits and generate a new AI review. Do you want to continue?")) {
        return;
      }
    }

    setRequesting(true);
    setError(null);
    try {
      await aiGradingApi.requestAISuggestion(triggerId);
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

  const getReviewDuration = () => {
    if (!details?.ai_started_at || !details?.ai_completed_at) return null;
    const start = new Date(details.ai_started_at).getTime();
    const end = new Date(details.ai_completed_at).getTime();
    if (isNaN(start) || isNaN(end)) return null;
    return Math.max(1, Math.round((end - start) / 1000));
  };

  const durationSec = getReviewDuration();
  
  const confidenceLevel = details?.ai_confidence_level || (
    details?.ai_confidence !== null && details?.ai_confidence !== undefined
      ? (details.ai_confidence >= 0.8 ? "HIGH" : (details.ai_confidence >= 0.5 ? "MEDIUM" : "LOW"))
      : null
  );

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

  const hasSuggestion =
    details?.ai_suggested_score !== null &&
    details?.ai_suggested_score !== undefined;

  return (
    <Card className="shadow-none border border-primary/20 bg-primary/5">
      <CardHeader className="pb-3 border-b border-primary/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-4 text-primary" />
            <CardTitle className="text-sm font-semibold">
              AI Grading Assistant
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {details?.ai_grading_basis === "RUBRIC" ? (
              <Badge
                variant="outline"
                className="text-[10px] font-medium uppercase bg-emerald-500/10 border-emerald-500/20 text-emerald-700 shadow-none"
              >
                Rubric-Based
              </Badge>
            ) : details?.ai_grading_basis === "GENERAL_KNOWLEDGE" ? (
              <Badge
                variant="outline"
                className="text-[10px] font-medium uppercase bg-amber-500/10 border-amber-500/20 text-amber-700 shadow-none"
              >
                General Knowledge
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] font-medium uppercase bg-muted/10 border-border/20 text-muted-foreground shadow-none"
              >
                AI Basis Unavailable
              </Badge>
            )}
            <Badge
              variant="secondary"
              className="text-[10px] font-medium uppercase bg-background border border-primary/20 text-muted-foreground"
            >
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

        {pollTimeoutReached ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3 bg-amber-500/5 rounded-xl border border-dashed border-amber-500/20">
            <AlertCircle className="size-8 text-amber-500" />
            <p className="text-sm font-semibold text-amber-700">
              AI Review taking longer than expected
            </p>
            <p className="text-xs text-amber-600/80 max-w-[280px] leading-relaxed font-medium">
              The AI evaluation is still running on the server. You can check status again or restart.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPollCount(0);
                  setPollTimeoutReached(false);
                  loadDetails();
                }}
                className="rounded-lg font-semibold h-8 text-xs border-amber-500/20 hover:bg-amber-500/5 text-amber-700"
              >
                <RefreshCcw className="size-3 mr-1.5" /> Check Status Again
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setPollCount(0);
                  setPollTimeoutReached(false);
                  handleRequestSuggestion();
                }}
                className="rounded-lg font-semibold h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white border-0"
              >
                <Sparkles className="size-3 mr-1.5" /> Restart Evaluation
              </Button>
            </div>
          </div>
        ) : requesting || details?.ai_review_status === "PENDING" || details?.ai_review_status === "PROCESSING" ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3 bg-muted/5 rounded-xl border border-dashed border-primary/20">
            <Loader2 className="size-8 text-primary animate-spin" />
            <p className="text-sm font-semibold text-foreground animate-pulse">
              AI Review in Progress...
            </p>
            <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed font-medium">
              The AI grading assistant is currently evaluating this response and mapping it to the rubric.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={loadDetails}
              className="mt-2 rounded-lg font-semibold flex items-center gap-1.5 h-8 text-xs border-primary/20 hover:bg-primary/5 text-primary"
            >
              <RefreshCcw className="size-3 animate-spin-reverse" /> Check Status
            </Button>
          </div>
        ) : details?.ai_review_status === "FAILED" ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3 bg-rose-500/5 rounded-xl border border-dashed border-rose-500/20">
            <AlertCircle className="size-8 text-rose-500" />
            <p className="text-sm font-semibold text-rose-700">
              AI Review Failed
            </p>
            <p className="text-xs text-rose-600/80 max-w-[280px] leading-relaxed font-medium">
              The evaluation engine was unable to grade this response.
            </p>
            <Button
              size="sm"
              onClick={handleRequestSuggestion}
              className="mt-2 rounded-lg font-semibold flex items-center gap-1.5 h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white border-0"
            >
              <Sparkles className="size-3" /> Retry AI Review
            </Button>
          </div>
        ) : !hasSuggestion ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3 bg-muted/5 rounded-xl border border-dashed">
            <BrainCircuit className="size-8 text-muted-foreground/45" />
            <p className="text-sm font-semibold text-foreground">
              No AI Suggestion Generated Yet
            </p>
            <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed font-medium">
              Generate an AI-suggested score and feedback rationale for this student response.
            </p>
            <Button
              size="sm"
              onClick={handleRequestSuggestion}
              className="mt-2 rounded-lg font-semibold flex items-center gap-1.5 h-8 text-xs"
            >
              <Sparkles className="size-3" /> Generate AI Suggestion
            </Button>
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in duration-300">
            {details?.ai_grading_basis !== "RUBRIC" && (
              <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-800 py-2 rounded-xl">
                <AlertCircle className="size-4 text-amber-600" />
                <AlertDescription className="text-[11px] font-semibold text-amber-800">
                  Graded from AI general knowledge — no rubric defined.
                </AlertDescription>
              </Alert>
            )}
 
            <div className="py-2 px-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-[11px] text-emerald-700 font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-600" /> AI Review Completed • Generated automatically
              </span>
              {durationSec !== null && (
                <span className="text-[10px] opacity-80 font-mono">Review completed in {durationSec}s</span>
              )}
            </div>

            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Suggested Score
                </p>
                <div className="text-2xl font-bold text-primary">
                  {details.ai_suggested_score}{" "}
                  <span className="text-sm text-muted-foreground font-medium">
                    / {maxScore}
                  </span>
                </div>
              </div>

              {confidenceLevel && (
                <div className="text-right flex items-center gap-1.5 justify-end">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-end gap-1">
                      Confidence Level
                    </p>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs font-semibold px-2 py-0.5 uppercase border",
                          confidenceLevel === "HIGH"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            : confidenceLevel === "MEDIUM"
                              ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                              : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                        )}
                      >
                        {confidenceLevel}
                      </Badge>
                      {details.ai_confidence !== null && (
                        <span className="text-[11px] font-mono text-muted-foreground/80">
                          ({(details.ai_confidence * (details.ai_confidence <= 1.0 ? 100 : 1)).toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground/60 hover:text-muted-foreground transition-colors self-end mb-1"
                        >
                          <HelpCircle className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[200px] text-[11px] p-2 bg-popover text-popover-foreground border shadow-md">
                        Confidence score measures semantic similarity to
                        reference solutions and alignment with configured
                        rubrics. Scores above 80% indicate highly structured
                        matching.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>

            <Separator className="bg-primary/10" />

            {/* Why this score? Expandable section */}
            <div className="border border-primary/10 rounded-lg overflow-hidden bg-background">
              <button
                type="button"
                onClick={() => setExplainOpen(!explainOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-primary bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                <span>Why this score?</span>
                <span className="text-[10px] normal-case font-medium text-muted-foreground">
                  {explainOpen ? "Hide Details ▲" : "View Breakdown ▼"}
                </span>
              </button>
              {explainOpen && (
                <div className="p-3 space-y-3 text-[11px] leading-relaxed text-foreground/80 border-t border-primary/10 bg-muted/5">
                  <div>
                    <span className="font-semibold text-muted-foreground uppercase block mb-1">
                      Grading Source Basis
                    </span>
                    <p>
                      {details.ai_grading_basis === "RUBRIC"
                        ? "Graded against the lecturer-defined rubric. Rubric criteria weights and descriptors were used to calculate individual category marks."
                        : "Graded using general subject matter knowledge because no explicit rubric has been configured for this question node."}
                    </p>
                  </div>

                  {(details.ai_feedback_strengths &&
                    details.ai_feedback_strengths.length > 0) ||
                  (details.ai_feedback_improvements &&
                    details.ai_feedback_improvements.length > 0) ||
                  (details.ai_feedback_suggestions &&
                    details.ai_feedback_suggestions.length > 0) ? (
                    <div className="space-y-2">
                      {details.ai_feedback_strengths &&
                        details.ai_feedback_strengths.length > 0 && (
                          <div>
                            <span className="font-semibold text-emerald-700 uppercase block mb-0.5">
                              Key Strengths Matched
                            </span>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {details.ai_feedback_strengths.map((str, idx) => (
                                <li key={idx}>{str}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      {details.ai_feedback_improvements &&
                        details.ai_feedback_improvements.length > 0 && (
                          <div>
                            <span className="font-semibold text-amber-700 uppercase block mb-0.5">
                              Concepts Needing Improvement
                            </span>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {details.ai_feedback_improvements.map(
                                (imp, idx) => (
                                  <li key={idx}>{imp}</li>
                                ),
                              )}
                            </ul>
                          </div>
                        )}
                      {details.ai_feedback_suggestions &&
                        details.ai_feedback_suggestions.length > 0 && (
                          <div>
                            <span className="font-semibold text-sky-700 uppercase block mb-0.5">
                              Suggested Next Steps
                            </span>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {details.ai_feedback_suggestions.map(
                                (suggestion, idx) => (
                                  <li key={idx}>{suggestion}</li>
                                ),
                              )}
                            </ul>
                          </div>
                        )}
                    </div>
                  ) : (
                    <div>
                      <span className="font-semibold text-muted-foreground uppercase block mb-1">
                        Evaluation Details
                      </span>
                      <p>
                        The AI confidence score reflects semantic mapping
                        alignment with the reference answers and grading
                        criteria guidelines.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rationale
              </p>
              <p className="text-sm leading-relaxed text-foreground/90 font-medium">
                {details.ai_rationale}
              </p>
            </div>

            {/* Structured Rubric Alignment Checklist (B2 & A2 read-only report) */}
            {details.rubric_alignment && details.rubric_alignment.length > 0 ? (
              <div className="space-y-2 pt-2 border-t border-border/40">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                  <CheckCircle2 className="size-3.5 text-primary" /> AI Rubric Alignment Report
                </p>
                <div className="space-y-2">
                  {details.rubric_alignment.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-background rounded-xl border border-border/60 p-3 text-xs leading-normal space-y-1.5"
                    >
                      <div className="flex justify-between items-center font-medium">
                        <span className="font-bold flex items-center gap-1.5">
                          {item.matched ? (
                            <CheckCircle2 className="size-3.5 text-emerald-500" />
                          ) : (
                            <AlertCircle className="size-3.5 text-rose-500" />
                          )}
                          {item.criterion}
                        </span>
                        <Badge variant="outline" className="font-mono text-[10px] bg-primary/5 text-primary">
                          {item.points_awarded} / {item.max_points} pts
                        </Badge>
                      </div>
                      {item.description && (
                        <p className="text-muted-foreground font-medium pl-5">{item.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : details.rubric_scores && details.rubric_scores.length > 0 ? (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Rubric Alignment
                </p>
                <div className="space-y-2">
                  {details.rubric_scores.map((note, idx) => (
                    <div
                      key={idx}
                      className="bg-background rounded border p-3 text-sm"
                    >
                      <div className="flex justify-between font-medium mb-1">
                        <span>{note.criterion}</span>
                        <span className="text-primary">
                          {note.marks_awarded} pts
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {note.notes}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Flagged Analysis Issues */}
            {details.detected_issues && details.detected_issues.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border/40">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 flex items-center gap-1">
                  <ShieldAlert className="size-3.5 text-rose-500" /> Flagged Analysis Issues
                </p>
                <div className="space-y-1.5">
                  {details.detected_issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 border border-rose-500/15 bg-rose-500/5 rounded-xl flex gap-2 items-start text-xs text-rose-700 leading-normal font-medium"
                    >
                      <AlertCircle className="size-3.5 shrink-0 text-rose-500 mt-0.5" />
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Structured feedback signals */}
            <div className="pt-2.5 border-t border-primary/10 flex items-center justify-between gap-4">
              <span className="text-[11px] font-semibold text-muted-foreground">
                Was this AI suggestion accurate?
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={
                    feedbackStatus === "thumbs_up" ? "default" : "outline"
                  }
                  disabled={feedbackSaving || feedbackStatus !== null}
                  onClick={() => handleFeedback(true)}
                  className="h-7 px-2.5 rounded-lg text-xs"
                >
                  <ThumbsUp className="size-3 mr-1" /> Yes
                </Button>
                <Button
                  size="sm"
                  variant={
                    feedbackStatus === "thumbs_down" ? "destructive" : "outline"
                  }
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
                  This is an automated suggestion. You must review the rationale
                  and manually enter the final score.
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
            onClick={() =>
              onSuggestionApplied(details.ai_suggested_score as number, details.ai_feedback_draft || "")
            }
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
