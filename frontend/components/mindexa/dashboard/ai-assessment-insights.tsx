"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import {
  Sparkles,
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { analyticsApi, AIAssessmentInsightsResponse } from "@/lib/api/analytics";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface AIAssessmentInsightsProps {
  assessmentId: string;
}

export function AIAssessmentInsights({ assessmentId }: AIAssessmentInsightsProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AIAssessmentInsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weakExpanded, setWeakExpanded] = useState(true);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(true);
  const [insightsExpanded, setInsightsExpanded] = useState(false);

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
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[85%]" />
          <Skeleton className="h-4 w-[70%]" />
        </div>
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
    <div className="space-y-3 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">AI Cohort Analysis</span>
        </div>
        <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-border/60">
          AI suggestion only
        </Badge>
      </div>

      {/* Performance Narrative */}
      <div className="p-3 rounded-xl border border-border/50 bg-muted/20 text-xs text-foreground/80 leading-relaxed flex items-start gap-2">
        <TrendingUp className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <p>{data.summary}</p>
      </div>

      {/* Weak Topics */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <button
          onClick={() => setWeakExpanded(!weakExpanded)}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-3.5 text-amber-500" />
            <span className="text-[11px] font-semibold text-foreground">
              Weak Topics Identified
            </span>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
              {data.weak_topics.length}
            </Badge>
          </div>
          {weakExpanded ? (
            <ChevronUp className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
        </button>
        {weakExpanded && (
          <div className="px-3 py-2.5 space-y-1.5">
            {data.weak_topics.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">No significant weak areas detected.</p>
            ) : (
              data.weak_topics.map((topic, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-foreground/80">
                  <span className="mt-1.5 size-1.5 rounded-full bg-amber-400 shrink-0" />
                  {topic}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Suggested Interventions */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <button
          onClick={() => setSuggestionsExpanded(!suggestionsExpanded)}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Lightbulb className="size-3.5 text-primary" />
            <span className="text-[11px] font-semibold text-foreground">
              Suggested Interventions
            </span>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
              {data.recommended_interventions.length}
            </Badge>
          </div>
          {suggestionsExpanded ? (
            <ChevronUp className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
        </button>
        {suggestionsExpanded && (
          <div className="px-3 py-2.5 space-y-1.5">
            {data.recommended_interventions.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-foreground/80">
                <span className="mt-1.5 size-1.5 rounded-full bg-primary/60 shrink-0" />
                {item}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Strategic Insights */}
      {data.insights.length > 0 && (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <button
            onClick={() => setInsightsExpanded(!insightsExpanded)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Info className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] font-semibold text-foreground">Strategic Insights</span>
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                {data.insights.length}
              </Badge>
            </div>
            {insightsExpanded ? (
              <ChevronUp className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            )}
          </button>
          {insightsExpanded && (
            <div className="px-3 py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.insights.map((insight, i) => (
                <div key={i} className="p-2.5 rounded-lg border border-border/40 bg-muted/10 text-[11px] text-muted-foreground leading-relaxed">
                  {insight}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60 leading-relaxed px-0.5">
        Based on aggregated score distributions only. No individual student data was shared with the AI provider.
      </p>
    </div>
  );
}
