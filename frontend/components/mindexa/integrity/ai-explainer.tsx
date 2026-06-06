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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { BrainCircuit, Clock, ShieldAlert, History, AlertTriangle } from "lucide-react";
import { integrityApi } from "@/lib/api/integrity";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AIIntegrityExplainerProps {
  flagId: string;
}

export function AIIntegrityExplainer({ flagId }: AIIntegrityExplainerProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExplain = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await integrityApi.getFlagExplanation(flagId);
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to generate AI integrity explanation.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertDescription className="text-xs">{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center space-y-3 bg-muted/20 rounded-xl border border-dashed">
        <p className="text-sm text-muted-foreground">Require a deeper look into the recorded events?</p>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleExplain}
          className="bg-background text-xs font-bold h-9"
        >
          <BrainCircuit className="mr-2 size-4 text-primary" /> Explain with AI
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainCircuit className="size-4 text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">AI Narrative Explanation</h3>
        </div>
        <Badge variant="outline" className="text-[9px] uppercase font-bold tracking-widest text-amber-600 border-amber-200 bg-amber-50">
          ADVISORY • DOES NOT CONFIRM CHEATING
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* The Explanation */}
        <div className="space-y-2">
          <p className="text-sm leading-relaxed text-foreground/90 font-medium p-4 rounded-xl border bg-primary/5 border-primary/10">
            {data.explanation}
          </p>
        </div>

        {/* Timeline Summary */}
        <Card className="shadow-none border bg-muted/5">
          <CardHeader className="py-3 bg-muted/10 border-b">
            <CardTitle className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <History className="size-3.5" /> Timeline Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {data.timeline_summary}
            </p>
          </CardContent>
        </Card>

        {/* Escalation Rationale */}
        <Card className="shadow-none border bg-amber-50/20 border-amber-100">
          <CardHeader className="py-3 bg-amber-100/10 border-b border-amber-100">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-2">
              <ShieldAlert className="size-3.5" /> Escalation Rationale
            </CardTitle>
          </CardHeader>
          <CardContent className="py-4">
            <p className="text-sm text-amber-900/80 leading-relaxed">
              {data.escalation_rationale}
            </p>
            {data.risk_level_context && (
                <div className="mt-3 pt-3 border-t border-amber-100 text-xs font-medium text-amber-700 italic">
                    Note: {data.risk_level_context}
                </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <div className="px-1">
        <p className="text-[10px] text-muted-foreground leading-relaxed italic">
          This automated summary is provided to assist your investigation. Final academic integrity decisions remain the sole responsibility of the human reviewer.
        </p>
      </div>
    </div>
  );
}
