"use client";

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles, ArrowRight, ShieldAlert, Loader2, ListChecks, CheckCircle2 } from "lucide-react";
import { studentAiApi, StudentSupportResponse } from "@/lib/api/student-ai";

interface AISupportChatProps {
  // If we want to pass specific contexts (like a selected resource)
  selectedContexts?: { title: string; content: string }[];
}

export function AISupportChat({ selectedContexts = [] }: AISupportChatProps) {
  const [prompt, setPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [response, setResponse] = useState<StudentSupportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAskAI = async () => {
    if (!prompt.trim()) return;
    
    setIsThinking(true);
    setError(null);
    setResponse(null);

    try {
      const res = await studentAiApi.getSupport({
        question: prompt,
        contexts: selectedContexts,
      });
      setResponse(res);
    } catch (err: any) {
      // Handle known API errors
      if (err.response) {
        if (err.response.status === 403) {
          setError("AI Support is disabled during active summative assessments or CATs to maintain integrity.");
        } else if (err.response.status === 429) {
          setError("Rate limit exceeded. Please wait a moment before asking another question.");
        } else {
          setError(err.response.data?.detail || "An unexpected error occurred while contacting the AI.");
        }
      } else {
        setError("Failed to connect to the AI service. Please check your network.");
      }
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <Card className="shadow-none border">
      <CardHeader className="border-b bg-muted/5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> Ask Your Personal Assistant
            </CardTitle>
            <CardDescription className="text-xs font-medium uppercase tracking-wider mt-1">
              Explain • Identify Weak Areas • Suggest Priorities
            </CardDescription>
          </div>
          {response?.model && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground opacity-50">
              {response.provider} / {response.model}
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-6 space-y-6">
        <div className="space-y-4">
          <Textarea
            placeholder="e.g., Explain ACID properties with banking examples... or Suggest a revision plan for Database Normalization."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[140px] text-base leading-relaxed"
            disabled={isThinking}
          />

          <Button
            onClick={handleAskAI}
            disabled={isThinking || !prompt.trim()}
            className="w-full h-12 text-sm font-bold shadow-sm"
          >
            {isThinking ? (
              <><Loader2 className="mr-2 size-4 animate-spin" /> Analyzing Requirements...</>
            ) : (
              <><ArrowRight className="mr-2 size-4" /> Generate Study Guidance</>
            )}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-4">
            <ShieldAlert className="size-4" />
            <AlertTitle>Access Denied or Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {response && (
          <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 pt-4">
            
            {/* Safety Notice */}
            {response.safety_notice && (
              <Alert className="bg-muted/30 border-muted">
                <ShieldAlert className="size-4 text-muted-foreground" />
                <AlertTitle className="text-sm font-semibold text-muted-foreground">AI Safety Notice</AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground">
                  {response.safety_notice}
                </AlertDescription>
              </Alert>
            )}

            {/* Explanation */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Sparkles className="size-4" /> Explanation
              </h3>
              <div className="p-5 rounded-xl border bg-primary/5 text-sm text-foreground/90 leading-relaxed whitespace-pre-line border-primary/20">
                {response.explanation}
              </div>
            </div>

            {/* Revision Plan */}
            {response.revision_plan && response.revision_plan.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <ListChecks className="size-4" /> Revision Plan
                </h3>
                <ul className="space-y-2 p-5 rounded-xl border bg-background text-sm text-foreground/80 leading-relaxed">
                  {response.revision_plan.map((step, idx) => (
                    <li key={idx} className="flex gap-3 items-start">
                      <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Follow-up Questions */}
            {response.follow_up_questions && response.follow_up_questions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <ArrowRight className="size-4" /> Follow-up Suggestions
                </h3>
                <div className="flex flex-wrap gap-2">
                  {response.follow_up_questions.map((q, idx) => (
                    <Badge 
                      key={idx} 
                      variant="secondary" 
                      className="cursor-pointer hover:bg-secondary/80 px-3 py-1.5 text-xs font-medium"
                      onClick={() => setPrompt(q)}
                    >
                      {q}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
          </div>
        )}
      </CardContent>
    </Card>
  );
}
