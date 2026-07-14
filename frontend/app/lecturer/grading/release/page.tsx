"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Loader2, Scale, Unlock } from "lucide-react";
import { assessmentApi } from "@/lib/api/assessment";
import { resultApi } from "@/lib/api/result";
import { ResultReleasePanel } from "@/components/mindexa/grading/result-release-panel";
import { toast } from "sonner";
import { AssessmentSummary } from "../types";

export default function ResultReleasePage() {
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [releaseAssessmentId, setReleaseAssessmentId] = useState<string>("all");
  const [isSaving, setIsSaving] = useState(false);
  const [releasePolicy, setReleasePolicy] = useState<"immediate" | "scheduled" | "hold">("hold");
  const [releaseDate, setReleaseDate] = useState("");
  const [releaseValidation, setReleaseValidation] = useState({
    valid: true,
    errors: [] as string[],
    gradedCount: 0,
    totalCount: 0
  });

  useEffect(() => {
    async function loadAssessments() {
      try {
        const res = await assessmentApi.getAssessments({ status: "PUBLISHED" });
        setAssessments(res.items || []);
      } catch (err: any) {
        toast.error("Failed to load assessments context");
      } finally {
        setLoading(false);
      }
    }
    loadAssessments();
  }, []);

  const runReleaseValidation = useCallback(async (asmtId: string) => {
    try {
      const res = await resultApi.getAssessmentResults(asmtId);
      const items = res.items || [];
      const errorsList: string[] = [];
      let gradedQ = 0;
      let totalQ = 0;

      items.forEach(
        (r: {
          student_name: string;
          graded_question_count: number;
          total_question_count: number;
          integrity_hold: boolean;
        }) => {
          gradedQ += r.graded_question_count || 0;
          totalQ += r.total_question_count || 0;
          if (r.graded_question_count < r.total_question_count) {
            errorsList.push(
              `${r.student_name}: ${r.total_question_count - r.graded_question_count} questions remaining ungraded.`
            );
          }
          if (r.integrity_hold) {
            errorsList.push(
              `${r.student_name}: Unresolved active integrity hold.`
            );
          }
        }
      );

      setReleaseValidation({
        valid: errorsList.length === 0,
        errors: errorsList,
        gradedCount: gradedQ,
        totalCount: totalQ
      });
    } catch (error: unknown) {
      console.error("Failed to run validation", error);
    }
  }, []);

  useEffect(() => {
    if (releaseAssessmentId !== "all") {
      runReleaseValidation(releaseAssessmentId);
    } else {
      setReleaseValidation({
        valid: true,
        errors: [],
        gradedCount: 0,
        totalCount: 0
      });
    }
  }, [releaseAssessmentId, runReleaseValidation]);

  const handleSaveReleasePolicy = async (asmtId: string) => {
    try {
      await resultApi.updateReleasePolicy(asmtId, {
        policy: releasePolicy,
        release_date: releasePolicy === "scheduled" ? releaseDate : null
      });
      toast.success("Release policy saved successfully");
    } catch (error: unknown) {
      toast.error("Failed to save release policy");
    }
  };

  const handleTriggerImmediateRelease = async (asmtId: string) => {
    setIsSaving(true);
    try {
      await resultApi.triggerImmediateRelease(asmtId);
      toast.success("Results released to students immediately.");
      runReleaseValidation(asmtId);
    } catch (error: unknown) {
      toast.error("Failed to trigger immediate release");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Result Release Center</h1>
        <p className="text-xs text-muted-foreground">
          Audit grading completion, configure release policies, and publish results to students.
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center space-y-3">
          <Loader2 className="size-8 text-primary animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground font-medium">Loading release details...</p>
        </div>
      ) : (
        <Card className="shadow-none border border-border/50 bg-card/25 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm">
          <CardHeader className="p-4 border-b border-border/30 bg-muted/10 space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground/80">
              Select Release Assessment Context
            </Label>
            <Select
              value={releaseAssessmentId}
              onValueChange={setReleaseAssessmentId}
            >
              <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
                <SelectValue placeholder="Choose assessment..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Choose an assessment...</SelectItem>
                {assessments.map((a: AssessmentSummary) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            {releaseAssessmentId === "all" ? (
              <div className="py-20 text-center text-sm font-medium text-muted-foreground">
                <p className="italic">Awaiting release context selection.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Validation checklist */}
                <div className="p-4 border rounded-xl bg-background space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Scale className="size-4 text-primary" /> Result Release
                    Validation Audit
                  </h4>

                  {releaseValidation.errors.length > 0 ? (
                    <div className="space-y-2">
                      <div className="p-3 bg-red-500/10 border border-red-500/15 rounded-xl flex items-start gap-2.5 text-red-700">
                        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                        <div className="space-y-1 text-xs">
                          <p className="font-bold">
                            Validation Errors Detected
                          </p>
                          <ul className="list-disc pl-4 space-y-1">
                            {releaseValidation.errors.map(
                              (err: string, i: number) => (
                                <li key={i}>{err}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/15 rounded-xl flex items-center gap-2.5 text-emerald-700 text-xs font-bold">
                      <CheckCircle2 className="size-4 shrink-0" />
                      All validations passed! Ready for final released state.
                    </div>
                  )}
                </div>

                {/* Release settings policy form */}
                <div className="p-4 border rounded-xl bg-background space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Release Configuration
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Release Policy
                      </Label>
                      <Select
                        value={releasePolicy}
                        onValueChange={(
                          val: "immediate" | "scheduled" | "hold",
                        ) => setReleasePolicy(val)}
                      >
                        <SelectTrigger className="h-9 text-xs rounded-lg">
                          <SelectValue placeholder="Policy" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediate">
                            Release Immediately
                          </SelectItem>
                          <SelectItem value="scheduled">
                            Release On Specific Date
                          </SelectItem>
                          <SelectItem value="hold">Hold Results</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {releasePolicy === "scheduled" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Scheduled Date
                        </Label>
                        <Input
                          type="datetime-local"
                          value={releaseDate}
                          onChange={(e) => setReleaseDate(e.target.value)}
                          className="h-9 text-xs rounded-lg"
                        />
                      </div>
                    )}

                    <div className="flex items-end">
                      <Button
                        onClick={() =>
                          handleSaveReleasePolicy(releaseAssessmentId)
                        }
                        className="w-full h-9 text-xs font-semibold rounded-lg"
                      >
                        Save Release Policy
                      </Button>
                    </div>
                  </div>
                </div>

                {releasePolicy === "immediate" && releaseValidation.valid && (
                  <div className="p-4 border border-emerald-500/20 bg-emerald-500/5 rounded-xl flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                        Ready to Release
                      </p>
                      <p className="text-[11px] text-emerald-700/80">
                        All validations passed. Click to immediately publish
                        results to students.
                      </p>
                    </div>
                    <Button
                      className="h-9 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                      onClick={() =>
                        handleTriggerImmediateRelease(releaseAssessmentId)
                      }
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          <Unlock className="size-3.5 mr-1.5" /> Release
                          Results Now
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {releasePolicy === "immediate" &&
                  !releaseValidation.valid && (
                    <div className="p-4 border border-red-500/20 bg-red-500/5 rounded-xl text-xs text-red-700 font-semibold">
                      Cannot release: resolve all validation errors above
                      before triggering release.
                    </div>
                  )}

                <ResultReleasePanel assessmentId={releaseAssessmentId} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
