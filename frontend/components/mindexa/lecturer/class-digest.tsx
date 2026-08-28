"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  BarChart2,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Copy,
  Check,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
  Users,
  Target,
  FileSpreadsheet,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { toast } from "sonner";
import { analyticsApi, AIAssessmentInsightsResponse } from "@/lib/api/analytics";
import { assessmentApi } from "@/lib/api/assessment";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";
import { cn } from "@/lib/utils";

interface ClassDigestProps {
  workspaceId?: string;
}

export function ClassDigest({ workspaceId }: ClassDigestProps) {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("");

  const [isLoading, setIsLoading] = useState(false);
  const [insights, setInsights] = useState<AIAssessmentInsightsResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSelectorCollapsed, setIsSelectorCollapsed] = useState(false);

  // Load published or completed assessments
  useEffect(() => {
    async function loadAssessments() {
      try {
        setLoadingAssessments(true);
        const res: any = await assessmentApi.getAssessments();
        const list = Array.isArray(res) ? res : res?.items || [];
        setAssessments(list);
        if (list.length > 0) {
          setSelectedAssessmentId(list[0].id);
        }
      } catch (err) {
        console.error("Failed to load assessments", err);
      } finally {
        setLoadingAssessments(false);
      }
    }
    loadAssessments();
  }, [workspaceId]);

  const handleFetchInsights = async (regenerate: boolean = false) => {
    if (!selectedAssessmentId) {
      toast.error("Please select an assessment first.");
      return;
    }

    try {
      setIsLoading(true);
      const res = await analyticsApi.getAssessmentInsights(selectedAssessmentId, regenerate);
      setInsights(res);
      toast.success(regenerate ? "AI narrative refreshed!" : "Cohort insights loaded.");
    } catch (err: any) {
      console.error("Failed to load assessment insights", err);
      toast.error(err.message || "Failed to load assessment analytics.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyDigest = () => {
    if (!insights) return;
    const selectedAsmt = assessments.find((a) => a.id === selectedAssessmentId);
    let text = `# Class Digest: ${selectedAsmt?.title || "Assessment"}\n\n`;
    text += `**Class Average:** ${insights.class_average?.toFixed(1)}% | **Pass Rate:** ${insights.pass_rate?.toFixed(1)}% | **Submissions:** ${insights.total_submissions || 0}\n\n`;
    text += `### Executive Summary\n${insights.ai_narrative || insights.summary || "No narrative generated."}\n\n`;

    if (insights.weak_topics && insights.weak_topics.length > 0) {
      text += `### Areas Requiring Reinforcement\n`;
      insights.weak_topics.forEach((t) => (text += `- ${t}\n`));
      text += `\n`;
    }

    if (insights.recommended_interventions && insights.recommended_interventions.length > 0) {
      text += `### Recommended Interventions\n`;
      insights.recommended_interventions.forEach((i) => (text += `- ${i}\n`));
      text += `\n`;
    }

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Class digest copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedAsmt = assessments.find((a) => a.id === selectedAssessmentId);

  return (
    <div className="flex-1 p-3 sm:p-5 lg:p-6 overflow-y-auto space-y-4 w-full max-w-full">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-border/40 pb-3 gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
            <BarChart2 className="size-4 text-primary" /> Class Digest & AI Insights
          </h3>
          <p className="text-xs text-muted-foreground">
            Grounded statistical narration of cohort performance aggregates, identifying weak topics and actionable interventions.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSelectorCollapsed(!isSelectorCollapsed)}
            className="h-8 text-xs gap-1.5 border-border/60 hover:bg-muted/50"
            title={isSelectorCollapsed ? "Show Assessment Target" : "Collapse Selector to Focus Insights"}
          >
            {isSelectorCollapsed ? (
              <>
                <PanelLeftOpen className="size-3.5 text-primary" />
                <span className="hidden sm:inline">Change Assessment</span>
              </>
            ) : (
              <>
                <PanelLeftClose className="size-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Focus Digest</span>
              </>
            )}
          </Button>

          {insights && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyDigest}
                className="h-8 text-xs gap-1"
              >
                {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                <span>{copied ? "Copied" : "Copy Digest"}</span>
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleFetchInsights(true)}
                disabled={isLoading}
                className="h-8 text-xs gap-1.5 font-semibold bg-primary text-primary-foreground shadow-xs"
              >
                <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
                <span>Regenerate AI Narrative</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Assessment Selector Bar */}
      {!isSelectorCollapsed ? (
        <Card className="p-4 bg-muted/20 border-border/60 rounded-2xl shadow-xs transition-all">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="space-y-1.5 flex-1 w-full md:w-auto">
              <Label className="text-xs font-semibold text-foreground">
                Target Assessment
              </Label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <select
                  value={selectedAssessmentId}
                  onChange={(e) => {
                    setSelectedAssessmentId(e.target.value);
                    setInsights(null);
                  }}
                  className="h-9 rounded-xl border border-border text-xs px-2.5 bg-background text-foreground outline-none font-medium flex-1 max-w-lg transition-colors focus:ring-1 focus:ring-primary"
                >
                  {loadingAssessments ? (
                    <option>Loading assessments...</option>
                  ) : assessments.length === 0 ? (
                    <option value="">No assessments available</option>
                  ) : (
                    assessments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} ({a.status}) &bull; {a.assessment_type}
                      </option>
                    ))
                  )}
                </select>
                <Button
                  onClick={() => handleFetchInsights(false)}
                  disabled={isLoading || !selectedAssessmentId}
                  size="sm"
                  className="h-9 text-xs font-semibold bg-primary text-primary-foreground gap-1.5 rounded-xl shadow-xs shrink-0"
                >
                  {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  <span>Synthesize Digest</span>
                </Button>
              </div>
            </div>

            <div className="p-2.5 bg-card rounded-xl border border-border/60 text-xs text-muted-foreground text-left shrink-0">
              <span className="font-semibold text-foreground block">Zero-Hallucination Policy</span>
              <span className="text-[10px]">
                Narratives strictly reflect real student submissions and database aggregates.
              </span>
            </div>
          </div>
        </Card>
      ) : (
        selectedAsmt && (
          <div className="p-2.5 bg-muted/30 border border-border/60 rounded-xl flex items-center justify-between text-xs gap-3">
            <div className="flex items-center gap-2 truncate">
              <Badge variant="outline" className="text-[10px] font-semibold uppercase">
                {selectedAsmt.status}
              </Badge>
              <span className="font-semibold text-foreground truncate">{selectedAsmt.title}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSelectorCollapsed(false)}
                className="h-7 text-[11px] px-2.5 gap-1"
              >
                <PanelLeftOpen className="size-3 text-primary" />
                <span>Switch Assessment</span>
              </Button>
            </div>
          </div>
        )
      )}

      {/* Main Content Area */}
      {isLoading ? (
        <Card className="p-12 flex flex-col items-center justify-center space-y-3 border-border/60 min-h-[400px]">
          <Loader2 className="size-8 text-primary animate-spin" />
          <div className="text-center space-y-1">
            <p className="text-xs font-semibold text-foreground">
              Computing Aggregates & Synthesizing Performance Digest...
            </p>
            <p className="text-[11px] text-muted-foreground max-w-sm">
              Analyzing grade distribution, difficult questions, and formative intervention points.
            </p>
          </div>
        </Card>
      ) : !insights ? (
        <Card className="p-12 flex flex-col items-center justify-center space-y-2 border-border/60 min-h-[400px] text-center">
          <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <BarChart2 className="size-5 text-primary" />
          </div>
          <h4 className="text-sm font-semibold text-foreground">No Assessment Selected</h4>
          <p className="text-xs text-muted-foreground max-w-md">
            Select an assessment above and click &ldquo;Synthesize Digest&rdquo; to generate cohort statistics and AI-driven pedagogical recommendations.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-3.5 bg-card border-border/60 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                <span>Class Average</span>
                <TrendingUp className="size-3.5 text-primary" />
              </div>
              <div className="text-xl font-bold text-foreground">
                {insights.class_average !== undefined ? `${insights.class_average.toFixed(1)}%` : "N/A"}
              </div>
              <p className="text-[10px] text-muted-foreground">Mean score across cohort</p>
            </Card>

            <Card className="p-3.5 bg-card border-border/60 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                <span>Pass Rate</span>
                <CheckCircle2 className="size-3.5 text-emerald-600" />
              </div>
              <div className="text-xl font-bold text-foreground">
                {insights.pass_rate !== undefined ? `${insights.pass_rate.toFixed(1)}%` : "N/A"}
              </div>
              <p className="text-[10px] text-muted-foreground">Students meeting pass criteria</p>
            </Card>

            <Card className="p-3.5 bg-card border-border/60 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                <span>Score Range</span>
                <Target className="size-3.5 text-amber-600" />
              </div>
              <div className="text-xl font-bold text-foreground">
                {insights.lowest_score !== undefined && insights.highest_score !== undefined
                  ? `${insights.lowest_score.toFixed(0)}% - ${insights.highest_score.toFixed(0)}%`
                  : "N/A"}
              </div>
              <p className="text-[10px] text-muted-foreground">Min to Max score</p>
            </Card>

            <Card className="p-3.5 bg-card border-border/60 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                <span>Submissions</span>
                <Users className="size-3.5 text-primary" />
              </div>
              <div className="text-xl font-bold text-foreground">
                {insights.total_submissions || 0}
              </div>
              <p className="text-[10px] text-muted-foreground">Total graded attempts</p>
            </Card>
          </div>

          {/* AI Narrative Commentary */}
          <Card className="p-5 border-border/70 bg-card space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="size-4 text-primary" /> Executive Narrative Commentary
              </h4>
              <Badge variant="outline" className="text-[10px]">
                Analytics Agent
              </Badge>
            </div>

            <div className="text-xs text-foreground leading-relaxed">
              <RichMessageRenderer content={insights.ai_narrative || insights.summary || "No commentary generated."} />
            </div>

            {/* Weak Topics & Interventions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {/* Weak Topics */}
              {insights.weak_topics && insights.weak_topics.length > 0 && (
                <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="size-3.5 text-amber-600" />
                    <span>Areas Requiring Reinforcement</span>
                  </div>
                  <ul className="space-y-1">
                    {insights.weak_topics.map((topic, idx) => (
                      <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="size-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                        <span>{topic}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommended Interventions */}
              {insights.recommended_interventions && insights.recommended_interventions.length > 0 && (
                <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Lightbulb className="size-3.5" />
                    <span>Recommended Teaching Interventions</span>
                  </div>
                  <ul className="space-y-1">
                    {insights.recommended_interventions.map((action, idx) => (
                      <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="size-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* General Insights */}
            {insights.insights && insights.insights.length > 0 && (
              <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-1.5">
                <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider block">
                  Key Statistical Observations
                </span>
                <ul className="space-y-1">
                  {insights.insights.map((ins, idx) => (
                    <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="size-1.5 rounded-full bg-primary/70 shrink-0 mt-1.5" />
                      <span>{ins}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
