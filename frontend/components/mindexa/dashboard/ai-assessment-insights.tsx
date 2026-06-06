"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { BrainCircuit, Lightbulb, AlertTriangle, TrendingUp, Info } from "lucide-react";
import { analyticsApi, AIAssessmentInsightsResponse } from "@/lib/api/analytics";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AIAssessmentInsightsProps {
  assessmentId: string;
}

export function AIAssessmentInsights({ assessmentId }: AIAssessmentInsightsProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AIAssessmentInsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await analyticsApi.getAssessmentInsights(assessmentId);
        setData(res);
      } catch (err: any) {
        setError(err.message || "Failed to load AI insights.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [assessmentId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Card className="shadow-none border border-dashed border-primary/20">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
            <div className="grid grid-cols-2 gap-4 pt-4">
               <Skeleton className="h-24 w-full" />
               <Skeleton className="h-24 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>Analytics Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainCircuit className="size-5 text-primary" />
          <h2 className="text-lg font-bold tracking-tight">AI Cohort Analysis</h2>
        </div>
        <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-primary/5 text-muted-foreground border border-primary/10">
          AI Suggestion Only
        </Badge>
      </div>

      <Card className="shadow-none border border-primary/10 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <TrendingUp className="size-4" /> Performance Narrative
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-foreground/90 font-medium">
            {data.summary}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Weak Topics */}
        <Card className="shadow-none border border-amber-100 bg-amber-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-2">
              <AlertTriangle className="size-3.5" /> Weak Topics Identified
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.weak_topics.map((topic, i) => (
                <li key={i} className="text-sm text-amber-900/80 flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 rounded-full bg-amber-500 shrink-0" />
                  {topic}
                </li>
              ))}
              {data.weak_topics.length === 0 && <li className="text-xs text-muted-foreground italic">No significant weak areas detected.</li>}
            </ul>
          </CardContent>
        </Card>

        {/* Recommended Interventions */}
        <Card className="shadow-none border border-emerald-100 bg-emerald-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-2">
              <Lightbulb className="size-3.5" /> Suggested Interventions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.recommended_interventions.map((item, i) => (
                <li key={i} className="text-sm text-emerald-900/80 flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 rounded-full bg-emerald-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Strategic Insights */}
      {data.insights.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 px-1">
            <Info className="size-3" /> Strategic Insights
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.insights.map((insight, i) => (
              <div key={i} className="p-3 rounded-lg border bg-background text-xs text-muted-foreground leading-relaxed shadow-sm">
                {insight}
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="pt-2 px-1">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          These insights are based on automated analysis of student score distributions and question-level difficulty aggregates. 
          No individual student data was shared with the AI provider.
        </p>
      </div>
    </div>
  );
}
