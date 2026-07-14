"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrainCircuit, Loader2, Save, Sparkles, Layers } from "lucide-react";
import { assessmentApi } from "@/lib/api/assessment";
import { gradingApi } from "@/lib/api/grading";
import { aiGradingApi } from "@/lib/api/ai-grading";
import { toast } from "sonner";
import { AssessmentSummary, GradingQueueItem, BatchGradeItemState, BatchReviewDetails } from "../types";

export default function BatchGradingPage() {
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("all");
  const [queueData, setQueueData] = useState<GradingQueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [selectedBatchQuestionTitle, setSelectedBatchQuestionTitle] = useState<string>("all");

  const [batchGradeState, setBatchGradeState] = useState<Record<string, BatchGradeItemState>>({});
  const [showBatchReviewModal, setShowBatchReviewModal] = useState(false);
  const [batchReviewItem, setBatchReviewItem] = useState<GradingQueueItem | null>(null);
  const [batchReviewDetails, setBatchReviewDetails] = useState<BatchReviewDetails | null>(null);
  const [batchReviewLoading, setBatchReviewLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  const fetchQueue = useCallback(async (asmtId: string) => {
    setQueueLoading(true);
    try {
      const response = await gradingApi.getGradingQueue({
        assessment_id: asmtId,
        page_size: 100 // large page size for batch mode
      });
      setQueueData(response.items || []);
      setSelectedBatchQuestionTitle("all");
    } catch (error: unknown) {
      console.error("Queue trace failure", error);
      toast.error("Failed to fetch submissions queue");
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAssessmentId !== "all") {
      fetchQueue(selectedAssessmentId);
    } else {
      setQueueData([]);
      setSelectedBatchQuestionTitle("all");
    }
  }, [selectedAssessmentId, fetchQueue]);

  // Group queue items by question title
  const groupedBatchQuestions = useMemo(() => {
    const map: Record<string, GradingQueueItem[]> = {};
    queueData.forEach((item) => {
      if (!item.question_title) return;
      if (!map[item.question_title]) {
        map[item.question_title] = [];
      }
      map[item.question_title].push(item);
    });
    return map;
  }, [queueData]);

  // AI Details loader for batch review modal
  useEffect(() => {
    let active = true;
    async function loadDetails() {
      if (!batchReviewItem) return;
      setBatchReviewLoading(true);
      try {
        const data = await aiGradingApi.getGradeDetails(batchReviewItem.response_id);
        if (active) {
          setBatchReviewDetails(data);
        }
      } catch (err) {
        console.error("Failed to load AI details in batch mode", err);
      } finally {
        if (active) {
          setBatchReviewLoading(false);
        }
      }
    }
    loadDetails();
    return () => {
      active = false;
    };
  }, [batchReviewItem]);

  const getBatchItem = (responseId: string): BatchGradeItemState =>
    batchGradeState[responseId] ?? { score: "", feedback: "" };

  const setBatchItem = (
    responseId: string,
    field: keyof BatchGradeItemState,
    value: string
  ) => {
    setBatchGradeState((prev) => ({
      ...prev,
      [responseId]: { ...getBatchItem(responseId), [field]: value }
    }));
  };

  const handleBatchApplyAi = async (responseId: string, score: number) => {
    setBatchItem(responseId, "score", score.toString());
    // Auto-populate feedback if feedback draft is available
    if (batchReviewDetails?.ai_feedback_draft) {
      setBatchItem(responseId, "feedback", batchReviewDetails.ai_feedback_draft);
    }
    toast.success("AI suggested grade applied locally. Click Save to submit.");
  };

  const handleSaveBatchGrade = async (
    responseId: string,
    scoreVal: string,
    feedbackVal: string
  ) => {
    if (!scoreVal || isNaN(Number(scoreVal))) {
      toast.error("Please enter a valid numeric grade.");
      return;
    }
    setIsSaving(true);
    try {
      await gradingApi.saveGrade(responseId, {
        score: Number(scoreVal),
        feedback: feedbackVal || null,
        is_final: true
      });
      toast.success("Grade submitted successfully.");
      // Refresh queue
      if (selectedAssessmentId !== "all") {
        fetchQueue(selectedAssessmentId);
      }
    } catch (err: any) {
      toast.error("Failed to save grade");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-200">
      <div className="border-b pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          Batch Grading Center
        </h1>
        <p className="text-sm text-muted-foreground mt-1 font-medium">
          Grade the same question for all student submissions in a unified table.
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center space-y-2">
          <Loader2 className="size-6 text-primary animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground font-medium">Loading batch grading context...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="shadow-none border border-zinc-150 bg-white rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground/80 block mb-1.5">
                Select Assessment
              </Label>
              <Select
                value={selectedAssessmentId}
                onValueChange={setSelectedAssessmentId}
              >
                <SelectTrigger className="h-9 text-xs rounded-lg border-zinc-200 bg-white">
                  <SelectValue placeholder="Choose assessment..." />
                </SelectTrigger>
                <SelectContent className="rounded-lg shadow-lg">
                  <SelectItem value="all" className="text-xs">Choose an assessment...</SelectItem>
                  {assessments.map((a: AssessmentSummary) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {queueData.length > 0 && (
              <div>
                <Label className="text-xs font-semibold text-muted-foreground/80 block mb-1.5">
                  Select Question to Batch Grade
                </Label>
                <Select
                  value={selectedBatchQuestionTitle}
                  onValueChange={setSelectedBatchQuestionTitle}
                >
                  <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
                    <SelectValue placeholder="Choose question..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Choose a question node...</SelectItem>
                    {Object.keys(groupedBatchQuestions).map((title, idx) => (
                      <SelectItem key={idx} value={title}>
                        Q{idx + 1}: {title.substring(0, 50)}...
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </Card>

          {queueLoading ? (
            <div className="py-20 text-center space-y-3">
              <Loader2 className="size-8 text-primary animate-spin mx-auto" />
              <p className="text-xs text-muted-foreground font-medium">Fetching submissions queue...</p>
            </div>
          ) : selectedAssessmentId === "all" ? (
            <Card className="p-12 text-center text-sm text-muted-foreground italic border border-dashed rounded-xl bg-card/20">
              Please select an assessment to begin batch grading.
            </Card>
          ) : selectedBatchQuestionTitle === "all" ? (
            <Card className="p-12 text-center text-sm text-muted-foreground italic border border-dashed rounded-xl bg-card/20">
              Please select a question node to grade.
            </Card>
          ) : (
            <Card className="shadow-none border border-border/50 bg-card/25 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm p-4">
              <div className="space-y-4">
                <div className="bg-muted/15 border border-border/30 p-3 rounded-lg">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Batch Question Prompt
                  </h4>
                  <p className="text-xs text-foreground/80 leading-relaxed font-semibold">
                    {selectedBatchQuestionTitle}
                  </p>
                </div>

                <div className="border border-border/40 rounded-xl overflow-hidden bg-background shadow-sm">
                  <Table>
                    <TableHeader className="bg-muted/15 border-b border-border/40">
                      <TableRow className="h-10 hover:bg-transparent">
                        <TableHead className="text-[10px] font-bold uppercase w-1/5 pl-4">
                          Student Name
                        </TableHead>
                        <TableHead className="text-[10px] font-bold uppercase w-1/3">
                          Answer Preview
                        </TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-center w-1/6">
                          AI Suggested
                        </TableHead>
                        <TableHead className="text-[10px] font-bold uppercase w-1/8 text-center">
                          Grade
                        </TableHead>
                        <TableHead className="text-[10px] font-bold uppercase w-1/4">
                          Feedback Comment
                        </TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-right pr-4 w-1/10">
                          Action
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs">
                      {groupedBatchQuestions[selectedBatchQuestionTitle]?.map((item, idx) => {
                        const localState = getBatchItem(item.response_id);
                        return (
                          <TableRow key={idx} className="h-14 hover:bg-muted/5 transition-colors border-border/10">
                            <TableCell className="font-bold pl-4">
                              {item.student_name}
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground leading-normal max-w-[250px] truncate">
                              {item.student_answer || (
                                <span className="italic text-muted-foreground/50">
                                  No response.
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.ai_suggested_score !== null ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <Badge variant="secondary" className="font-mono font-bold bg-primary/10 text-primary border-primary/20">
                                    {item.ai_suggested_score} pts
                                  </Badge>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-primary hover:bg-primary/5 rounded-full"
                                    onClick={() => {
                                      setBatchReviewItem(item);
                                      setShowBatchReviewModal(true);
                                    }}
                                  >
                                    <Sparkles className="size-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-muted-foreground/40 text-[10px] italic">
                                  N/A
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Input
                                placeholder="--"
                                className="h-8 w-16 text-center font-mono font-bold mx-auto border-border/80 rounded-lg text-xs"
                                value={localState.score}
                                onChange={(e) =>
                                  setBatchItem(item.response_id, "score", e.target.value)
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Textarea
                                placeholder="Provide optional batch feedback..."
                                className="h-8 min-h-[32px] max-h-16 py-1 px-2 text-xs border-border/80 rounded-lg"
                                value={localState.feedback}
                                onChange={(e) =>
                                  setBatchItem(item.response_id, "feedback", e.target.value)
                                }
                              />
                            </TableCell>
                            <TableCell className="text-right pr-4">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs font-semibold rounded-lg"
                                disabled={isSaving}
                                onClick={async () => {
                                  const s = getBatchItem(item.response_id);
                                  await handleSaveBatchGrade(
                                    item.response_id,
                                    s.score,
                                    s.feedback
                                  );
                                }}
                              >
                                <Save className="size-3 mr-1" /> Save
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Single Batch AI Grade Review Modal */}
      <Dialog
        open={showBatchReviewModal}
        onOpenChange={setShowBatchReviewModal}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 rounded-xl border border-border shadow-2xl bg-background">
          <DialogHeader className="pb-2 border-b border-border/40">
            <div className="flex items-center gap-2 text-primary">
              <BrainCircuit className="size-5" />
              <DialogTitle className="text-lg font-bold">
                Review AI Suggestion
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground/80 mt-1">
              Verify the student response and AI feedback draft details below before finalizing this grade.
            </DialogDescription>
          </DialogHeader>

          {batchReviewLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="size-6 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">
                Retrieving grading details & rubric alignment...
              </p>
            </div>
          ) : batchReviewItem ? (
            <div className="flex-1 overflow-y-auto my-4 pr-1 space-y-4 text-left">
              {/* Student Metadata */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-muted/20 p-3 rounded-lg border border-border/40">
                <div>
                  <span className="font-semibold text-muted-foreground block mb-0.5">
                    Student
                  </span>
                  <span className="font-bold text-foreground">
                    {batchReviewItem.student_name}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground block mb-0.5">
                    Suggested Score
                  </span>
                  <span className="font-bold text-primary">
                    {batchReviewItem.ai_suggested_score} pts
                  </span>
                </div>
              </div>

              {/* Full Response Text */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Student Response
                </span>
                <div className="text-xs p-3 bg-muted/10 border border-border/60 rounded-xl whitespace-pre-wrap leading-relaxed max-h-[150px] overflow-y-auto font-mono">
                  {batchReviewItem.student_answer || (
                    <span className="italic text-muted-foreground">
                      No response.
                    </span>
                  )}
                </div>
              </div>

              {/* AI Details / Rubric / Basis */}
              <div className="space-y-3 border-t border-border/30 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    AI Grading Basis
                  </span>
                  {batchReviewDetails?.ai_grading_basis === "RUBRIC" ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold uppercase bg-emerald-500/10 border-emerald-500/20 text-emerald-700 shadow-none"
                    >
                      Rubric-Based AI Grading
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold uppercase bg-amber-500/10 border-amber-500/20 text-amber-700 shadow-none"
                    >
                      General Knowledge AI Grading
                    </Badge>
                  )}
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    AI Grading Rationale & Feedback Draft
                  </span>
                  <div className="text-xs p-3 bg-primary/[0.02] border border-primary/10 rounded-xl leading-relaxed">
                    {batchReviewDetails?.ai_feedback_draft ||
                      batchReviewDetails?.ai_rationale ||
                      "No rationale or feedback draft available."}
                  </div>
                </div>

                {batchReviewDetails?.rubric_scores &&
                  batchReviewDetails.rubric_scores.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                        Rubric Criterion Breakdown
                      </span>
                      <div className="space-y-2">
                        {batchReviewDetails.rubric_scores.map(
                          (note: any, idx: number) => (
                            <div
                              key={idx}
                              className="bg-background rounded-lg border border-border/40 p-2.5 text-xs"
                            >
                              <div className="flex justify-between font-bold mb-1">
                                <span>{note.criterion}</span>
                                <span className="text-primary">
                                  {note.marks_awarded} pts
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-normal">
                                {note.notes}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center py-6 text-sm text-muted-foreground">
              No response data selected.
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-border/40 flex justify-end gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBatchReviewModal(false)}
              className="text-xs rounded-xl h-9"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={batchReviewLoading || !batchReviewItem}
              onClick={() => {
                if (batchReviewItem) {
                  handleBatchApplyAi(
                    batchReviewItem.response_id,
                    batchReviewItem.ai_suggested_score!
                  );
                  setShowBatchReviewModal(false);
                }
              }}
              className="text-xs rounded-xl h-9 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
            >
              Confirm & Save Grade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
