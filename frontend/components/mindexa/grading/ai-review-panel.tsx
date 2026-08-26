"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Sparkles,
  RefreshCcw,
  BookOpen,
  FileText,
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { aiGradingApi, GradeReviewDetails } from "@/lib/api/ai-grading";
import { gradingApi } from "@/lib/api/grading";
import { groupWorkApi } from "@/lib/api/group-work";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AIReviewPanelProps {
  queueItemId?: string;
  responseId?: string;
  maxScore: number;
  isGroupWork?: boolean;
  groupSubmissionId?: string;
  groupQuestionId?: string;
  groupAnswerData?: any;
  onSuggestionApplied?: (score: number, feedback?: string) => void;
  onSuggestionLoaded?: (
    draft: string,
    strengths: string[],
    improvements: string[],
    suggestions: string[],
  ) => void;
  className?: string;
}

export function AIReviewPanel({
  queueItemId,
  responseId,
  maxScore,
  isGroupWork,
  groupSubmissionId,
  groupQuestionId,
  groupAnswerData,
  onSuggestionApplied,
  onSuggestionLoaded,
  className,
}: AIReviewPanelProps) {
  const [loading, setLoading] = useState(!isGroupWork);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<GradeReviewDetails | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<
    "thumbs_up" | "thumbs_down" | null
  >(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [pollTimeoutReached, setPollTimeoutReached] = useState(false);
  const [suggestModalOpen, setSuggestModalOpen] = useState(false);
  const [suggestFeedback, setSuggestFeedback] = useState("");
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);
  const onSuggestionLoadedRef = useRef(onSuggestionLoaded);

  useEffect(() => {
    onSuggestionLoadedRef.current = onSuggestionLoaded;
  }, [onSuggestionLoaded]);

  const mapGroupAnswerToDetails = useCallback(
    (ans: any): GradeReviewDetails => {
      const isProcessing =
        ans?.ai_grade_decision === "PROCESSING" ||
        ans?.ai_grade_decision === "PENDING";
      const confidence = ans?.ai_grade_confidence ?? ans?.ai_confidence ?? null;
      return {
        id: ans?.id || `${groupSubmissionId}-${groupQuestionId}`,
        response_id: ans?.id || `${groupSubmissionId}-${groupQuestionId}`,
        score: ans?.score ?? null,
        ai_grade_score: ans?.ai_grade_score ?? ans?.ai_suggested_score ?? null,
        ai_suggested_score:
          ans?.ai_suggested_score ?? ans?.ai_grade_score ?? null,
        ai_confidence: confidence,
        ai_confidence_level:
          confidence !== null && confidence !== undefined
            ? confidence >= 0.8
              ? "HIGH"
              : confidence >= 0.5
                ? "MEDIUM"
                : "LOW"
            : null,
        ai_rationale: ans?.ai_grade_rationale ?? ans?.ai_rationale ?? null,
        ai_grading_basis: ans?.ai_grading_basis ?? null,
        ai_feedback_draft: ans?.ai_feedback_draft ?? null,
        ai_feedback_strengths: Array.isArray(ans?.ai_feedback_strengths)
          ? ans.ai_feedback_strengths
          : [],
        ai_feedback_improvements: Array.isArray(ans?.ai_feedback_improvements)
          ? ans.ai_feedback_improvements
          : [],
        ai_feedback_suggestions: Array.isArray(ans?.ai_feedback_suggestions)
          ? ans.ai_feedback_suggestions
          : [],
        source_citations: Array.isArray(ans?.ai_context_sources)
          ? ans.ai_context_sources
          : [],
        citations: Array.isArray(ans?.ai_context_sources)
          ? ans.ai_context_sources
          : [],
        is_final: false,
        ai_review_status: isProcessing ? "PROCESSING" : "COMPLETED",
        rubric_scores: ans?.rubric_scores ?? null,
      };
    },
    [groupSubmissionId, groupQuestionId],
  );

  const loadDetails = useCallback(async () => {
    if (isGroupWork) {
      if (groupAnswerData) {
        const mapped = mapGroupAnswerToDetails(groupAnswerData);
        setDetails(mapped);
        if (onSuggestionLoadedRef.current) {
          onSuggestionLoadedRef.current(
            mapped.ai_feedback_draft || "",
            mapped.ai_feedback_strengths || [],
            mapped.ai_feedback_improvements || [],
            mapped.ai_feedback_suggestions || [],
          );
        }
      }
      setLoading(false);
      return;
    }

    if (!responseId) {
      setLoading(false);
      return;
    }

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
          data.ai_feedback_suggestions || [],
        );
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        setError("Failed to load AI grading details.");
      }
    } finally {
      setLoading(false);
    }
  }, [isGroupWork, groupAnswerData, mapGroupAnswerToDetails, responseId]);

  useEffect(() => {
    if (isGroupWork && groupAnswerData) {
      const mapped = mapGroupAnswerToDetails(groupAnswerData);
      setDetails(mapped);
      if (onSuggestionLoadedRef.current) {
        onSuggestionLoadedRef.current(
          mapped.ai_feedback_draft || "",
          mapped.ai_feedback_strengths || [],
          mapped.ai_feedback_improvements || [],
          mapped.ai_feedback_suggestions || [],
        );
      }
      setLoading(false);
    } else if (!isGroupWork) {
      setPollCount(0);
      setPollTimeoutReached(false);
      loadDetails();
    }
  }, [isGroupWork, groupAnswerData, mapGroupAnswerToDetails, loadDetails]);

  useEffect(() => {
    if (isGroupWork) return;
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
  }, [
    isGroupWork,
    details?.ai_review_status,
    pollCount,
    pollTimeoutReached,
    loadDetails,
  ]);

  const hasSuggestion =
    details?.ai_suggested_score !== null &&
    details?.ai_suggested_score !== undefined;

  const handleRequestSuggestion = async () => {
    if (isGroupWork && groupSubmissionId && groupQuestionId) {
      if (hasSuggestion) {
        if (
          !confirm(
            "This will discard your current edits and generate a new AI review. Do you want to continue?",
          )
        ) {
          return;
        }
      }
      setRequesting(true);
      setError(null);
      try {
        const res = await groupWorkApi.triggerQuestionAIReview(
          groupSubmissionId,
          groupQuestionId,
        );
        const mapped = mapGroupAnswerToDetails(res);
        setDetails(mapped);
        if (onSuggestionLoadedRef.current) {
          onSuggestionLoadedRef.current(
            mapped.ai_feedback_draft || "",
            mapped.ai_feedback_strengths || [],
            mapped.ai_feedback_improvements || [],
            mapped.ai_feedback_suggestions || [],
          );
        }
        toast.success("AI review initiated for group question.");
      } catch (err: any) {
        setError(err?.message || "Failed to trigger AI review.");
        toast.error("AI evaluation failed");
      } finally {
        setRequesting(false);
      }
      return;
    }

    const triggerId = queueItemId || responseId;
    if (!triggerId) {
      toast.error(
        "Cannot request AI suggestion without a queue item ID or response ID.",
      );
      return;
    }

    if (hasSuggestion) {
      if (
        !confirm(
          "This will discard your current edits and generate a new AI review. Do you want to continue?",
        )
      ) {
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

  const confidencePct =
    details?.ai_confidence !== null && details?.ai_confidence !== undefined
      ? Math.round(details.ai_confidence * (details.ai_confidence <= 1.0 ? 100 : 1))
      : null;

  const confidenceLevel =
    details?.ai_confidence_level ||
    (confidencePct !== null
      ? confidencePct >= 80
        ? "HIGH"
        : confidencePct >= 50
          ? "MEDIUM"
          : "LOW"
      : null);

  if (loading) {
    return (
      <Card className={cn("border border-border/50 bg-card/40 backdrop-blur-xs rounded-2xl shadow-2xs", className)}>
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-4 w-1/2 rounded-lg" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border border-border/50 bg-card/40 backdrop-blur-xs rounded-2xl shadow-2xs overflow-hidden font-sans", className)}>
      <CardHeader className="pb-3 border-b border-border/30 bg-muted/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
              <Sparkles className="size-4" />
            </div>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground truncate">
              AI Evaluation & Assessment
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {details?.ai_grading_basis === "RUBRIC" ? (
              <Badge
                variant="outline"
                className="text-[9px] font-medium uppercase bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              >
                Rubric-Based
              </Badge>
            ) : details?.ai_grading_basis === "GENERAL_KNOWLEDGE" ? (
              <Badge
                variant="outline"
                className="text-[9px] font-medium uppercase bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
              >
                General Subject
              </Badge>
            ) : null}
            <Badge
              variant="outline"
              className="text-[9px] font-medium uppercase bg-primary/5 text-primary border-primary/20"
            >
              AI Draft Only
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3.5 sm:p-4 space-y-3.5">
        {error && (
          <Alert variant="destructive" className="py-2 rounded-xl text-xs">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {pollTimeoutReached ? (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-2.5 bg-amber-500/5 rounded-2xl border border-dashed border-amber-500/20 p-4">
            <AlertCircle className="size-6 text-amber-500" />
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              AI Evaluation taking longer than usual
            </p>
            <p className="text-[11px] text-muted-foreground max-w-[280px] leading-relaxed">
              The evaluation engine is still processing this response. You can check status again or restart.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPollCount(0);
                  setPollTimeoutReached(false);
                  loadDetails();
                }}
                className="rounded-xl h-7 text-xs border-amber-500/30 text-amber-700 dark:text-amber-300"
              >
                <RefreshCcw className="size-3 mr-1" /> Check Status
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setPollCount(0);
                  setPollTimeoutReached(false);
                  handleRequestSuggestion();
                }}
                className="rounded-xl h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white border-0"
              >
                <Sparkles className="size-3 mr-1" /> Restart
              </Button>
            </div>
          </div>
        ) : requesting ||
          details?.ai_review_status === "PENDING" ||
          details?.ai_review_status === "PROCESSING" ? (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-2.5 bg-muted/10 rounded-2xl border border-dashed border-primary/20 p-4">
            <Loader2 className="size-6 text-primary animate-spin" />
            <p className="text-xs font-semibold text-foreground animate-pulse">
              AI Evaluation in Progress...
            </p>
            <p className="text-[11px] text-muted-foreground max-w-[260px] leading-relaxed">
              Analyzing student reasoning against rubric criteria and benchmark solutions.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={loadDetails}
              className="mt-1 rounded-xl h-7 text-xs border-primary/30 text-primary hover:bg-primary/10 gap-1.5"
            >
              <RefreshCcw className="size-3" /> Check Status
            </Button>
          </div>
        ) : details?.ai_review_status === "FAILED" ? (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-2 bg-rose-500/5 rounded-2xl border border-dashed border-rose-500/20 p-4">
            <AlertCircle className="size-6 text-rose-500" />
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">
              Evaluation Engine Stalled
            </p>
            <p className="text-[11px] text-muted-foreground max-w-[260px]">
              Unable to generate AI review for this response format.
            </p>
            <Button
              size="sm"
              onClick={handleRequestSuggestion}
              className="mt-1 rounded-xl h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
            >
              <Sparkles className="size-3" /> Retry Evaluation
            </Button>
          </div>
        ) : !hasSuggestion ? (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-2.5 bg-muted/10 rounded-2xl border border-dashed border-border/60 p-4">
            <Sparkles className="size-6 text-muted-foreground/50" />
            <p className="text-xs font-semibold text-foreground">
              No AI Evaluation Generated Yet
            </p>
            <p className="text-[11px] text-muted-foreground max-w-[260px]">
              Generate an automated score suggestion with diagnostic rationale for this answer.
            </p>
            <Button
              size="sm"
              onClick={handleRequestSuggestion}
              className="mt-1 rounded-xl h-8 text-xs bg-primary text-primary-foreground gap-1.5 shadow-2xs hover:bg-primary/95"
            >
              <Sparkles className="size-3.5" /> Generate AI Suggestion
            </Button>
          </div>
        ) : (
          <div className="space-y-3.5 animate-in fade-in duration-300">
            {/* Completion & Duration banner */}
            <div className="py-2 px-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-500" /> AI Review Completed
              </span>
              {durationSec !== null && (
                <span className="text-[10px] font-mono opacity-80 font-semibold">
                  {durationSec}s
                </span>
              )}
            </div>

            {/* Score & Confidence meter */}
            <div className="p-3 bg-muted/20 border border-border/40 rounded-2xl flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  Suggested Score
                </p>
                <div className="text-xl font-bold font-mono text-primary flex items-baseline gap-1">
                  {details.ai_suggested_score}
                  <span className="text-xs font-normal text-muted-foreground">
                    / {maxScore} pts
                  </span>
                </div>
              </div>

              {confidenceLevel && (
                <div className="text-right space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-end gap-1">
                    Confidence
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help text-muted-foreground/60 hover:text-foreground">
                            <HelpCircle className="size-3" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[220px] text-[11px] p-2 bg-popover text-popover-foreground border shadow-md">
                          Confidence reflects semantic alignment with reference rubrics and exemplar solutions.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </p>
                  <div className="flex items-center justify-end gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] font-bold font-mono px-1.5 py-0 uppercase border",
                        confidenceLevel === "HIGH"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          : confidenceLevel === "MEDIUM"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
                      )}
                    >
                      {confidenceLevel}
                      {confidencePct !== null && ` (${confidencePct}%)`}
                    </Badge>
                  </div>
                </div>
              )}
            </div>

            {/* Collapsible Rationale breakdown */}
            <div className="border border-border/40 rounded-xl overflow-hidden bg-card/60">
              <button
                type="button"
                onClick={() => setExplainOpen(!explainOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-primary bg-primary/5 hover:bg-primary/10 transition-colors select-none"
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5" />
                  Diagnostic Rationale
                </span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  {explainOpen ? "Hide Details ▲" : "View Breakdown ▼"}
                </span>
              </button>

              {explainOpen && (
                <div className="p-3 space-y-2.5 text-[11px] leading-relaxed border-t border-border/30 bg-muted/5 animate-in fade-in duration-150">
                  {details.ai_rationale && (
                    <div>
                      <span className="font-semibold text-muted-foreground uppercase text-[9px] block mb-1">
                        Evaluation Rationale
                      </span>
                      <p className="text-xs text-foreground/90 font-normal leading-relaxed">
                        {details.ai_rationale}
                      </p>
                    </div>
                  )}

                  {/* Strengths & Improvements */}
                  {((details.ai_feedback_strengths && details.ai_feedback_strengths.length > 0) ||
                    (details.ai_feedback_improvements && details.ai_feedback_improvements.length > 0)) && (
                    <div className="space-y-2 pt-1 border-t border-border/20">
                      {details.ai_feedback_strengths && details.ai_feedback_strengths.length > 0 && (
                        <div>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 uppercase text-[9px] block mb-0.5">
                            Demonstrated Competencies
                          </span>
                          <ul className="space-y-0.5 text-[11px] text-emerald-950 dark:text-emerald-200">
                            {details.ai_feedback_strengths.map((str, idx) => (
                              <li key={idx} className="flex items-start gap-1">
                                <CheckCircle2 className="size-2.5 text-emerald-500 shrink-0 mt-1" />
                                <span>{str}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {details.ai_feedback_improvements && details.ai_feedback_improvements.length > 0 && (
                        <div>
                          <span className="font-semibold text-amber-600 dark:text-amber-400 uppercase text-[9px] block mb-0.5">
                            Omissions & Misconceptions
                          </span>
                          <ul className="space-y-0.5 text-[11px] text-amber-950 dark:text-amber-200">
                            {details.ai_feedback_improvements.map((imp, idx) => (
                              <li key={idx} className="flex items-start gap-1">
                                <ChevronRight className="size-2.5 text-amber-500 shrink-0 mt-1" />
                                <span>{imp}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Source Citations */}
            {((details.source_citations && details.source_citations.length > 0) ||
              (details.citations && details.citations.length > 0)) && (
              <div className="space-y-1.5 pt-1 border-t border-border/30">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <BookOpen className="size-3 text-primary" /> Source Evidence Citations
                </p>
                <div className="rounded-xl border border-border/40 bg-muted/10 p-2.5 space-y-1.5">
                  {(details.source_citations || details.citations || []).map((citation, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-1.5 text-[11px] text-foreground/90 bg-background p-2 rounded-lg border border-border/30"
                    >
                      <FileText className="size-3 text-primary shrink-0 mt-0.5" />
                      <span className="leading-snug">{citation}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Accuracy feedback buttons */}
            <div className="pt-2 border-t border-border/30 flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium text-muted-foreground">
                Was this AI review accurate?
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant={feedbackStatus === "thumbs_up" ? "default" : "outline"}
                  disabled={feedbackSaving || feedbackStatus !== null}
                  onClick={() => handleFeedback(true)}
                  className="h-6 px-2 rounded-lg text-[10px] gap-1"
                >
                  <ThumbsUp className="size-2.5" /> Yes
                </Button>
                <Button
                  size="sm"
                  variant={feedbackStatus === "thumbs_down" ? "destructive" : "outline"}
                  disabled={feedbackSaving || feedbackStatus !== null}
                  onClick={() => handleFeedback(false)}
                  className="h-6 px-2 rounded-lg text-[10px] gap-1"
                >
                  <ThumbsDown className="size-2.5" /> No
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {hasSuggestion && (
        <CardFooter className="p-3 border-t border-border/30 bg-muted/10 flex items-center justify-between gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSuggestModalOpen(true)}
            disabled={details?.is_final || requesting}
            className="text-xs h-8 rounded-xl border-border/60 hover:bg-primary/5"
          >
            <Sparkles className="size-3 mr-1 text-primary" />
            Suggest Changes to AI
          </Button>

          {onSuggestionApplied && (
            <Button
              size="sm"
              variant="default"
              onClick={() =>
                onSuggestionApplied(
                  details.ai_suggested_score as number,
                  details.ai_feedback_draft || "",
                )
              }
              disabled={details?.is_final}
              className="text-xs h-8 rounded-xl font-medium bg-primary text-primary-foreground shadow-2xs hover:bg-primary/95"
            >
              Use Suggested Score
            </Button>
          )}
        </CardFooter>
      )}

      {/* Suggest Changes Modal */}
      <Dialog open={suggestModalOpen} onOpenChange={setSuggestModalOpen}>
        <DialogContent className="sm:max-w-md bg-background border border-border/60 rounded-2xl shadow-2xl p-6 text-left font-sans">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-foreground">
                  Guide AI Re-evaluation
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Provide specific guidance to adjust how the AI assesses this submission.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!suggestFeedback.trim()) {
                toast.error("Please enter your guidance for the AI.");
                return;
              }
              try {
                setSuggestSubmitting(true);
                if (isGroupWork && groupSubmissionId && groupQuestionId) {
                  const res = await groupWorkApi.suggestChanges(
                    groupSubmissionId,
                    groupQuestionId,
                    suggestFeedback.trim(),
                  );
                  const mapped = mapGroupAnswerToDetails(res);
                  setDetails(mapped);
                  if (onSuggestionLoadedRef.current) {
                    onSuggestionLoadedRef.current(
                      mapped.ai_feedback_draft || "",
                      mapped.ai_feedback_strengths || [],
                      mapped.ai_feedback_improvements || [],
                      mapped.ai_feedback_suggestions || [],
                    );
                  }
                  if (onSuggestionApplied) {
                    onSuggestionApplied(
                      mapped.ai_suggested_score as number,
                      mapped.ai_feedback_draft || "",
                    );
                  }
                } else if (responseId) {
                  await gradingApi.suggestChanges(responseId, suggestFeedback.trim());
                  await loadDetails();
                }
                toast.success("AI evaluation updated with your guidance!");
                setSuggestModalOpen(false);
                setSuggestFeedback("");
              } catch (err: any) {
                toast.error(err?.message || "Failed to submit changes to AI.");
              } finally {
                setSuggestSubmitting(false);
              }
            }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-2">
              <Textarea
                placeholder="e.g. 'Award partial credit for mentioning primary key constraints in paragraph 2, but penalize the missing concurrency isolation discussion.'"
                value={suggestFeedback}
                onChange={(e) => setSuggestFeedback(e.target.value)}
                rows={4}
                className="text-xs rounded-xl bg-background"
                disabled={suggestSubmitting}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Tip: Point out specific criteria or key concepts the AI may have underweighted.
              </p>
            </div>

            <DialogFooter className="flex items-center justify-end gap-2 border-t border-border/30 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSuggestModalOpen(false)}
                disabled={suggestSubmitting}
                className="text-xs rounded-xl h-8"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={suggestSubmitting || !suggestFeedback.trim()}
                className="text-xs rounded-xl h-8 bg-primary text-primary-foreground gap-1.5"
              >
                {suggestSubmitting ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Re-evaluating...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3" />
                    Re-evaluate
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
