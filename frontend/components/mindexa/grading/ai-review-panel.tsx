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
import { Loader2, BrainCircuit, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { aiGradingApi, GradeReviewDetails } from "@/lib/api/ai-grading";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { Separator } from "@/components/ui/separator";

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-4 text-primary" />
            <CardTitle className="text-sm font-semibold">AI Grading Assistant</CardTitle>
          </div>
          <Badge variant="secondary" className="text-[10px] font-medium uppercase bg-background border border-primary/20 text-muted-foreground">
            AI Suggestion Only
          </Badge>
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
            <p className="text-sm text-muted-foreground">No AI suggestion exists for this response yet.</p>
            {queueItemId && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRequestSuggestion}
                disabled={requesting}
                className="bg-background"
              >
                {requesting ? <><Loader2 className="mr-2 size-3 animate-spin"/> Processing...</> : "Request AI Suggestion"}
              </Button>
            )}
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
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Confidence</p>
                  <Badge variant={details.ai_confidence > 0.8 ? "outline" : "secondary"} className="text-xs">
                    {(details.ai_confidence * 100).toFixed(0)}%
                  </Badge>
                </div>
              )}
            </div>

            <Separator className="bg-primary/10" />

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
