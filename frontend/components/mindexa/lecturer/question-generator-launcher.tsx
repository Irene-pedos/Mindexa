"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Layers,
  Sparkles,
  ShieldCheck,
  Folder,
  FileCheck,
  AlertCircle,
  Plus,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AIGeneratorPanel } from "@/components/mindexa/assessment/ai-generator-panel";
import { assessmentApi } from "@/lib/api/assessment";

interface QuestionGeneratorLauncherProps {
  workspaceId: string;
  workspaceName?: string;
  language?: string;
  isRwandaBlocked?: boolean;
}

interface AssessmentOption {
  id: string;
  title: string;
  status: string;
  assessment_type: string;
}

export function QuestionGeneratorLauncher({
  workspaceId,
  workspaceName,
  language = "EN",
  isRwandaBlocked = false,
}: QuestionGeneratorLauncherProps) {
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("");
  const [isTargetCollapsed, setIsTargetCollapsed] = useState(false);

  useEffect(() => {
    async function loadDraftAssessments() {
      try {
        setLoadingAssessments(true);
        const res: any = await assessmentApi.getAssessments({ status: "DRAFT" });
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
    loadDraftAssessments();
  }, [workspaceId]);

  const selectedAsmt = assessments.find((a) => a.id === selectedAssessmentId);

  return (
    <div className="flex-1 p-3 sm:p-5 lg:p-6 overflow-y-auto space-y-4 w-full max-w-full">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-border/40 pb-3 gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
            <Layers className="size-4 text-primary" /> Question Generator
          </h3>
          <p className="text-xs text-muted-foreground">
            Grounded in your workspace materials and blueprint rules. All candidate questions require explicit human review before entering your question bank.
          </p>
        </div>
      </div>

      {/* Target Assessment Selector Card */}
      {!isTargetCollapsed ? (
        <Card className="p-4 bg-muted/20 border-border/60 rounded-2xl shadow-xs transition-all">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="space-y-1.5 flex-1 w-full md:w-auto">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">
                  Target Draft Assessment (Optional)
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsTargetCollapsed(true)}
                  className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                >
                  Hide Options
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedAssessmentId}
                  onChange={(e) => setSelectedAssessmentId(e.target.value)}
                  className="h-9 rounded-xl border border-border text-xs px-2.5 bg-background text-foreground outline-none font-medium flex-1 max-w-lg transition-colors focus:ring-1 focus:ring-primary"
                >
                  <option value="">-- Standalone Question Bank Generation --</option>
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} ({a.assessment_type})
                    </option>
                  ))}
                </select>
                {loadingAssessments && <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />}
              </div>
            </div>

            <div className="p-2.5 bg-card rounded-xl border border-border/60 text-xs text-muted-foreground space-y-0.5 shrink-0">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <ShieldCheck className="size-3.5 text-emerald-600" />
                <span>Audited & Approval-Gated</span>
              </div>
              <p className="text-[10px]">
                No questions are added silently. You approve, edit, or reject each draft below.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="p-2.5 bg-muted/30 border border-border/60 rounded-xl flex items-center justify-between text-xs gap-3">
          <div className="flex items-center gap-2 truncate">
            <span className="text-muted-foreground">Target:</span>
            <span className="font-semibold text-foreground truncate">
              {selectedAsmt ? `${selectedAsmt.title} (${selectedAsmt.assessment_type})` : "Standalone Question Bank"}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsTargetCollapsed(false)}
            className="h-7 text-[11px] px-2.5"
          >
            Change Target
          </Button>
        </div>
      )}

      {/* Embedded Audited AI Generator Panel */}
      <AIGeneratorPanel
        assessmentId={selectedAssessmentId || undefined}
        workspaceId={workspaceId || undefined}
        language={language}
        onQuestionPromoted={() => {
          toast.success("Question approved and promoted to Question Bank!");
        }}
      />
    </div>
  );
}
