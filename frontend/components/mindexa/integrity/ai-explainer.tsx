"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  ShieldAlert,
  History,
  AlertTriangle,
  RotateCcw,
  Copy,
  Check,
  Sparkles,
  Info,
  Layers,
  FileCheck,
} from "lucide-react";
import { integrityApi } from "@/lib/api/integrity";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AIIntegrityExplainerProps {
  flagId: string;
  autoFetch?: boolean;
}

export function AIIntegrityExplainer({
  flagId,
  autoFetch = true,
}: AIIntegrityExplainerProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCached, setIsCached] = useState(false);

  const cacheKey = `mindexa_ai_flag_explain_${flagId}`;

  // Load from local storage cache if available
  const loadFromCache = useCallback(() => {
    try {
      const stored = localStorage.getItem(cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.explanation) {
          setData(parsed);
          setIsCached(true);
          return true;
        }
      }
    } catch {
      // Ignore cache retrieval errors
    }
    return false;
  }, [cacheKey]);

  const handleExplain = useCallback(
    async (forceRefresh = false) => {
      // If not forced and cache exists, load cached version
      if (!forceRefresh) {
        const foundInCache = loadFromCache();
        if (foundInCache) return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await integrityApi.getFlagExplanation(flagId);
        setData(res);
        setIsCached(false);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(res));
        } catch {
          // Ignore local storage quota limits
        }
      } catch (err: any) {
        setError(
          err.message ||
            "Failed to synthesize AI integrity explanation. Please try again."
        );
      } finally {
        setLoading(false);
      }
    },
    [flagId, cacheKey, loadFromCache]
  );

  useEffect(() => {
    const hasCache = loadFromCache();
    if (!hasCache && autoFetch) {
      handleExplain(false);
    }
  }, [flagId, autoFetch, loadFromCache, handleExplain]);

  const handleCopy = () => {
    if (!data) return;
    const textToCopy = `[Mindexa AI Integrity Analysis]\n\nNarrative:\n${data.explanation}\n\nTimeline:\n${data.timeline_summary}\n\nEscalation Rationale:\n${data.escalation_rationale}${data.risk_level_context ? `\n\nContext Note:\n${data.risk_level_context}` : ""}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success("Analysis report copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4 rounded-2xl bg-card border border-border/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary animate-pulse" />
            <Skeleton className="h-4 w-48 rounded-lg" />
          </div>
          <Skeleton className="h-4 w-28 rounded-full" />
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 p-4 rounded-2xl bg-destructive/5 border border-destructive/20 text-destructive">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <h4 className="text-xs font-bold uppercase tracking-wider">
              AI Analysis Unavailable
            </h4>
            <p className="text-xs text-destructive/90 leading-relaxed font-medium">
              {error}
            </p>
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExplain(true)}
            className="h-8 text-xs font-semibold rounded-xl border-destructive/30 hover:bg-destructive/10 text-destructive"
          >
            <RotateCcw className="size-3 mr-1.5" /> Retry Synthesis
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center space-y-3 bg-muted/20 rounded-2xl border border-dashed border-border/70 p-6">
        <div className="size-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
          <Sparkles className="size-5" />
        </div>
        <div className="space-y-1 max-w-sm">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
            AI-Assisted Event Reconstruction
          </h4>
          <p className="text-[11px] text-muted-foreground leading-normal">
            Generate an autonomous synthesized narrative and chronological timeline from browser telemetry.
          </p>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={() => handleExplain(false)}
          className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold h-8 px-4 rounded-xl shadow-none"
        >
          <Sparkles className="mr-1.5 size-3.5" /> Synthesize with AI
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              AI Integrity Reconstruction
              {isCached && (
                <Badge
                  variant="outline"
                  className="text-[9px] font-mono px-1.5 py-0 h-4 border-border/50 text-muted-foreground"
                  title="Loaded from local cache to prevent redundant AI queries"
                >
                  Cached
                </Badge>
              )}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-7 text-xs font-semibold px-2.5 rounded-lg border-border/60"
            title="Copy analysis to clipboard"
          >
            {copied ? (
              <Check className="size-3 mr-1 text-emerald-600" />
            ) : (
              <Copy className="size-3 mr-1 text-muted-foreground" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleExplain(true)}
            className="h-7 text-xs font-semibold px-2.5 rounded-lg text-muted-foreground hover:text-foreground"
            title="Force re-generation with AI"
          >
            <RotateCcw className="size-3 mr-1" /> Re-analyze
          </Button>
        </div>
      </div>

      {/* Scrollable Content Container */}
      <ScrollArea className="max-h-[60vh] pr-2.5 -mr-1">
        <div className="space-y-3.5 pb-2">
          {/* Executive Narrative */}
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/15 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider">
              <Sparkles className="size-3.5" /> Executive Summary & Findings
            </div>
            <p className="text-xs leading-relaxed text-foreground/90 font-medium whitespace-pre-line">
              {data.explanation}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Chronological Timeline Summary */}
            <Card className="shadow-none border border-border/60 bg-card rounded-xl">
              <CardHeader className="py-2.5 px-3.5 bg-muted/20 border-b border-border/40">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <History className="size-3.5 text-muted-foreground/80" /> Telemetry Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3.5 text-xs leading-relaxed text-muted-foreground font-medium whitespace-pre-line">
                {data.timeline_summary}
              </CardContent>
            </Card>

            {/* Escalation Rationale & Rules */}
            <Card className="shadow-none border border-amber-500/25 bg-amber-50/20 dark:bg-amber-950/20 rounded-xl">
              <CardHeader className="py-2.5 px-3.5 bg-amber-500/10 border-b border-amber-500/20">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <ShieldAlert className="size-3.5 text-amber-600 dark:text-amber-400" /> Escalation Policy
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3.5 space-y-2 text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90 font-medium">
                <p className="whitespace-pre-line">{data.escalation_rationale}</p>
                {data.risk_level_context && (
                  <div className="mt-2 pt-2 border-t border-amber-500/20 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    <span className="font-bold">Context:</span> {data.risk_level_context}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Human Governance Footer Note */}
          <div className="p-3 rounded-xl bg-muted/30 border border-border/40 flex items-start gap-2 text-[11px] text-muted-foreground font-medium">
            <Info className="size-3.5 text-muted-foreground/70 shrink-0 mt-0.5" />
            <span>
              This automated AI reconstruction is an advisory summary. Institutional decisions must always be confirmed by an authorized human reviewer.
            </span>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
