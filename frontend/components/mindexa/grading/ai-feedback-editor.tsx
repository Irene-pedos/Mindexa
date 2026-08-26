"use client";

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  Copy,
  Check,
  Plus,
  RotateCcw,
  MessageSquare,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { aiGradingApi } from "@/lib/api/ai-grading";
import { groupWorkApi } from "@/lib/api/group-work";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface AIFeedbackEditorProps {
  responseId?: string;
  isGroupWork?: boolean;
  groupSubmissionId?: string;
  groupQuestionId?: string;
  initialDraft?: string;
  initialStrengths?: string[];
  initialImprovements?: string[];
  initialSuggestions?: string[];
  onDraftApplied?: (draftText: string) => void;
  className?: string;
}

export function AIFeedbackEditor({
  responseId,
  isGroupWork,
  groupSubmissionId,
  groupQuestionId,
  initialDraft,
  initialStrengths,
  initialImprovements,
  initialSuggestions,
  onDraftApplied,
  className,
}: AIFeedbackEditorProps) {
  const [drafting, setDrafting] = useState(false);
  const [draftText, setDraftText] = useState(initialDraft || "");
  const [copied, setCopied] = useState(false);

  const [strengths, setStrengths] = useState<string[]>(initialStrengths || []);
  const [improvements, setImprovements] = useState<string[]>(initialImprovements || []);
  const [suggestions, setSuggestions] = useState<string[]>(initialSuggestions || []);

  React.useEffect(() => {
    setDraftText(initialDraft || "");
  }, [initialDraft]);

  React.useEffect(() => {
    setStrengths(initialStrengths || []);
    setImprovements(initialImprovements || []);
    setSuggestions(initialSuggestions || []);
  }, [initialStrengths, initialImprovements, initialSuggestions]);

  const handleGenerateDraft = async () => {
    setDrafting(true);
    try {
      if (isGroupWork && groupSubmissionId && groupQuestionId) {
        const res = await groupWorkApi.triggerQuestionAIReview(
          groupSubmissionId,
          groupQuestionId,
        );
        const draft = res.ai_feedback_draft || "";
        setDraftText(draft);
        setStrengths(res.ai_feedback_strengths || []);
        setImprovements(res.ai_feedback_improvements || []);
        setSuggestions(res.ai_feedback_suggestions || []);

        toast.success("Group feedback draft generated successfully.");
        if (onDraftApplied && draft) {
          onDraftApplied(draft);
        }
      } else if (responseId) {
        const res = await aiGradingApi.requestAIFeedbackDraft(responseId);
        const draft = res.ai_feedback_draft || "";
        setDraftText(draft);
        setStrengths(res.ai_feedback_strengths || []);
        setImprovements(res.ai_feedback_improvements || []);
        setSuggestions(res.ai_feedback_suggestions || []);

        toast.success("Feedback draft generated successfully.");

        if (onDraftApplied) {
          onDraftApplied(draft);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate feedback draft.");
    } finally {
      setDrafting(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraftText(e.target.value);
    if (onDraftApplied) {
      onDraftApplied(e.target.value);
    }
  };

  const handleInsertSnippet = (snippet: string) => {
    const newText = draftText ? `${draftText.trim()}\n• ${snippet}` : `• ${snippet}`;
    setDraftText(newText);
    if (onDraftApplied) {
      onDraftApplied(newText);
    }
    toast.success("Added to feedback draft");
  };

  const handleCopy = () => {
    if (!draftText) return;
    navigator.clipboard.writeText(draftText);
    setCopied(true);
    toast.success("Feedback copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const wordCount = draftText.trim() ? draftText.trim().split(/\s+/).length : 0;
  const charCount = draftText.length;

  return (
    <Card className={cn("border border-border/50 bg-card/40 backdrop-blur-xs rounded-2xl shadow-2xs overflow-hidden font-sans", className)}>
      <CardHeader className="pb-3 border-b border-border/30 bg-muted/10 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <Sparkles className="size-4" />
          </div>
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground truncate">
            AI Pedagogical Feedback Assistant
          </CardTitle>
        </div>
        <Badge
          variant="outline"
          className="text-[9px] font-medium uppercase bg-primary/5 text-primary border-primary/20 shrink-0"
        >
          AI Draft Only
        </Badge>
      </CardHeader>

      <CardContent className="p-3.5 sm:p-4 space-y-3.5">
        {!draftText ? (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-2.5">
            {drafting ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="size-6 text-primary animate-spin" />
                <p className="text-xs font-semibold text-foreground">
                  Synthesizing Diagnostic Feedback...
                </p>
                <p className="text-[11px] text-muted-foreground max-w-xs">
                  Analyzing student reasoning against rubric criteria to construct constructive guidance.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="size-10 rounded-2xl bg-muted/40 flex items-center justify-center text-muted-foreground/60">
                  <MessageSquare className="size-5" />
                </div>
                <div className="space-y-0.5 max-w-sm">
                  <p className="text-xs font-semibold text-foreground">
                    No Draft Feedback Generated Yet
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Generate an AI pedagogical feedback draft with strengths, growth opportunities, and actionable advice.
                  </p>
                </div>
                <Button
                  size="sm"
                  type="button"
                  onClick={handleGenerateDraft}
                  disabled={drafting}
                  className="mt-1.5 h-8 text-xs font-medium rounded-xl bg-primary text-primary-foreground gap-1.5 shadow-2xs hover:bg-primary/95"
                >
                  <Sparkles className="size-3.5" />
                  Generate AI Feedback
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  Feedback Draft
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {wordCount} words • {charCount} chars
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={handleCopy}
                    className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                    title="Copy text"
                  >
                    {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={handleGenerateDraft}
                    disabled={drafting}
                    className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-primary gap-1"
                    title="Regenerate draft"
                  >
                    <RotateCcw className={cn("size-3", drafting && "animate-spin")} />
                    <span>Regen</span>
                  </Button>
                </div>
              </div>

              <Textarea
                className="min-h-[110px] text-xs leading-relaxed rounded-xl bg-background border-border/50 focus-visible:border-primary/50"
                value={draftText}
                onChange={handleTextChange}
                placeholder="AI draft will appear here. Edit it before saving..."
              />
            </div>

            {/* Identified Strengths & Areas for Growth chips */}
            {(strengths.length > 0 || improvements.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                {strengths.length > 0 && (
                  <div className="space-y-1.5 p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="size-3" /> Key Strengths
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {strengths.map((s, i) => (
                        <li
                          key={i}
                          className="text-[11px] text-emerald-950 dark:text-emerald-200 flex items-start justify-between gap-1 group/item"
                        >
                          <span className="leading-snug flex-1">• {s}</span>
                          <button
                            type="button"
                            onClick={() => handleInsertSnippet(s)}
                            className="opacity-0 group-hover/item:opacity-100 hover:text-emerald-500 p-0.5 text-[9px] font-medium shrink-0 transition-opacity"
                            title="Insert into draft"
                          >
                            <Plus className="size-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {improvements.length > 0 && (
                  <div className="space-y-1.5 p-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <ChevronRight className="size-3" /> Growth Opportunities
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {improvements.map((s, i) => (
                        <li
                          key={i}
                          className="text-[11px] text-amber-950 dark:text-amber-200 flex items-start justify-between gap-1 group/item"
                        >
                          <span className="leading-snug flex-1">• {s}</span>
                          <button
                            type="button"
                            onClick={() => handleInsertSnippet(s)}
                            className="opacity-0 group-hover/item:opacity-100 hover:text-amber-500 p-0.5 text-[9px] font-medium shrink-0 transition-opacity"
                            title="Insert into draft"
                          >
                            <Plus className="size-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="p-2 rounded-xl bg-muted/20 border border-border/30 text-[10px] text-muted-foreground flex items-center gap-1.5">
              <Info className="size-3 shrink-0 text-muted-foreground/70" />
              <span>
                This draft is lecturer-confidential until confirmed and released in the final evaluation card.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
