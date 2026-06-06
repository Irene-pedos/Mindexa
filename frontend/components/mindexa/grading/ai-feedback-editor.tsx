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
import { Loader2, BrainCircuit, CheckCircle2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { aiGradingApi } from "@/lib/api/ai-grading";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AIFeedbackEditorProps {
  responseId: string;
  initialDraft?: string;
  initialStrengths?: string[];
  initialImprovements?: string[];
  initialSuggestions?: string[];
  onDraftApplied?: (draftText: string) => void;
}

export function AIFeedbackEditor({ 
  responseId, 
  initialDraft,
  initialStrengths,
  initialImprovements,
  initialSuggestions,
  onDraftApplied 
}: AIFeedbackEditorProps) {
  const [drafting, setDrafting] = useState(false);
  const [draftText, setDraftText] = useState(initialDraft || "");
  
  // Keep local copies of the metadata to display if generation succeeds
  const [strengths, setStrengths] = useState<string[]>(initialStrengths || []);
  const [improvements, setImprovements] = useState<string[]>(initialImprovements || []);
  const [suggestions, setSuggestions] = useState<string[]>(initialSuggestions || []);

  const handleGenerateDraft = async () => {
    setDrafting(true);
    try {
      const res = await aiGradingApi.requestAIFeedbackDraft(responseId);
      
      setDraftText(res.ai_feedback_draft || "");
      setStrengths(res.ai_feedback_strengths || []);
      setImprovements(res.ai_feedback_improvements || []);
      setSuggestions(res.ai_feedback_suggestions || []);
      
      toast.success("Feedback draft generated successfully.");
      
      if (onDraftApplied) {
        onDraftApplied(res.ai_feedback_draft || "");
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

  return (
    <Card className="shadow-none border border-primary/20">
      <CardHeader className="pb-3 border-b bg-muted/5 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainCircuit className="size-4 text-primary" />
          <CardTitle className="text-sm font-semibold">AI Feedback Editor</CardTitle>
        </div>
        <Badge variant="secondary" className="text-[10px] font-medium uppercase text-muted-foreground">
          AI Draft Only
        </Badge>
      </CardHeader>
      
      <CardContent className="p-4 space-y-4">
        {!draftText && !drafting ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground max-w-sm">
              Use the AI agent to draft professional, constructive feedback based on the rubric alignment and final score.
            </p>
            <Button 
              size="sm" 
              onClick={handleGenerateDraft}
              className="bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary border-none shadow-none"
            >
              <BrainCircuit className="mr-2 size-4" /> Draft Feedback
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Draft Text
                </span>
                {draftText && (
                   <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-xs text-muted-foreground"
                    onClick={handleGenerateDraft}
                    disabled={drafting}
                   >
                     {drafting ? <Loader2 className="size-3 animate-spin mr-1"/> : <BrainCircuit className="size-3 mr-1"/>}
                     Regenerate
                   </Button>
                )}
              </div>
              <Textarea
                className="min-h-[120px] text-sm leading-relaxed"
                value={draftText}
                onChange={handleTextChange}
                disabled={drafting}
                placeholder="AI draft will appear here. Edit it before saving."
              />
            </div>

            {(strengths.length > 0 || improvements.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {strengths.length > 0 && (
                  <div className="space-y-2 p-3 bg-emerald-50/50 border border-emerald-100 rounded-md">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Identified Strengths</span>
                    <ul className="space-y-1">
                      {strengths.map((s, i) => (
                        <li key={i} className="text-xs text-emerald-900 flex items-start gap-1.5">
                          <CheckCircle2 className="size-3 shrink-0 mt-0.5" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {improvements.length > 0 && (
                  <div className="space-y-2 p-3 bg-amber-50/50 border border-amber-100 rounded-md">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Areas for Growth</span>
                    <ul className="space-y-1">
                      {improvements.map((s, i) => (
                        <li key={i} className="text-xs text-amber-900 flex items-start gap-1.5">
                          <ChevronRight className="size-3 shrink-0 mt-0.5" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            <Alert className="bg-muted/30 border-muted py-2 mt-2">
              <AlertDescription className="text-[11px] text-muted-foreground">
                This draft is not visible to the student until you confirm the final score and feedback below.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
