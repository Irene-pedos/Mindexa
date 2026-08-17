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
import { Loader2, Save, Sparkles, Layers, Eye } from "lucide-react";
import { assessmentApi } from "@/lib/api/assessment";
import { gradingApi } from "@/lib/api/grading";
import { aiGradingApi } from "@/lib/api/ai-grading";
import { lecturerApi } from "@/lib/api/lecturer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AssessmentSummary,
  GradingQueueItem,
  BatchGradeItemState,
  BatchReviewDetails,
  getAiSuggestion,
} from "../types";

function parseCaseStudyAnswer(answer: string): string[] | null {
  if (!answer || typeof answer !== "string" || !answer.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(answer);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const entries = Object.values(parsed).filter(Boolean);
      if (entries.length > 0) {
        return entries.map((v) => String(v));
      }
    }
  } catch {}
  return null;
}

function ExpandableAnswer({ answer }: { answer: string }) {
  const [expanded, setExpanded] = useState(false);
  const subAnswers = parseCaseStudyAnswer(answer);
  const isLong = answer.length > 100 || (subAnswers && subAnswers.length > 1);

  if (subAnswers) {
    return (
      <div className="text-xs space-y-1.5 font-sans">
        {(expanded ? subAnswers : subAnswers.slice(0, 1)).map((sa, i) => (
          <p key={i} className="text-foreground/90 leading-relaxed font-medium">
            <span className="font-bold text-primary mr-1">Part {i + 1}:</span> {sa}
          </p>
        ))}
        {subAnswers.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-[10px] text-primary font-bold uppercase tracking-widest mt-1 hover:underline block"
          >
            {expanded ? "Show Less" : `View All ${subAnswers.length} Sub-Answers`}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="text-xs">
      <p className={cn("font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap", !expanded && "line-clamp-2")}>
        {answer}
      </p>
      {isLong && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="text-[10px] text-primary font-bold uppercase tracking-widest mt-1 hover:underline block"
        >
          {expanded ? "Show Less" : "View Full Answer"}
        </button>
      )}
    </div>
  );
}

export default function BatchGradingPage() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("all");
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("all");
  const [queueData, setQueueData] = useState<GradingQueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [selectedBatchQuestionId, setSelectedBatchQuestionId] = useState<string>("all");

  const [batchGradeState, setBatchGradeState] = useState<Record<string, BatchGradeItemState>>({});
  const [showBatchReviewModal, setShowBatchReviewModal] = useState(false);
  const [batchReviewItem, setBatchReviewItem] = useState<GradingQueueItem | null>(null);
  const [batchReviewDetails, setBatchReviewDetails] = useState<BatchReviewDetails | null>(null);
  const [batchReviewLoading, setBatchReviewLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Cache for loaded AI details
  const [aiDetailsCache, setAiDetailsCache] = useState<Record<string, any>>({});

  // Load Workspaces on mount
  useEffect(() => {
    async function loadWorkspaces() {
      try {
        const wsRes = await lecturerApi.getWorkspaces();
        setWorkspaces(wsRes || []);
      } catch (err: any) {
        toast.error("Failed to load workspaces context");
      } finally {
        setLoading(false);
      }
    }
    loadWorkspaces();
  }, []);

  // Fetch assessments filtered by workspace
  useEffect(() => {
    async function loadAssessments() {
      try {
        const params: Record<string, any> = {};
        if (selectedWorkspaceId !== "all") {
          params.workspace_id = selectedWorkspaceId;
        }
        const res = await assessmentApi.getAssessments(params);
        const validItems = (res.items || []).filter(
          (a: any) => a.status !== "DRAFT" && a.status !== "ARCHIVED"
        );
        setAssessments(validItems);
        
        // Reset selected assessment if not in the new list
        if (selectedAssessmentId !== "all" && !res.items?.some((a: any) => a.id === selectedAssessmentId)) {
          setSelectedAssessmentId("all");
          setQueueData([]);
        }
      } catch (err: any) {
        toast.error("Failed to load assessments for the selected workspace");
      }
    }
    loadAssessments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId]);

  // Fetch submissions queue
  const fetchQueue = useCallback(async (asmtId: string) => {
    setQueueLoading(true);
    try {
      const response = await gradingApi.getGradingQueue({
        assessment_id: asmtId,
        page_size: 100 // large page size for batch mode
      });
      setQueueData(response.items || []);
      setSelectedBatchQuestionId("all");
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
      setSelectedBatchQuestionId("all");
    }
  }, [selectedAssessmentId, fetchQueue]);

  // Group queue items by question id
  const groupedBatchQuestions = useMemo(() => {
    const map: Record<string, GradingQueueItem[]> = {};
    queueData.forEach((item) => {
      if (!item.question_id) return;
      if (!map[item.question_id]) {
        map[item.question_id] = [];
      }
      map[item.question_id].push(item);
    });
    return map;
  }, [queueData]);

  // Load AI details helper for batch review modal and inline view
  const loadAiDetailsForQuestion = useCallback(async (items: GradingQueueItem[]) => {
    const pendingIds = items
      .filter(item => !aiDetailsCache[item.response_id] && getAiSuggestion(item).hasSuggestion)
      .map(item => item.response_id);

    if (pendingIds.length === 0) return;

    const promises = pendingIds.map(async (responseId) => {
      try {
        const details = await aiGradingApi.getGradeDetails(responseId);
        return { responseId, details };
      } catch (e) {
        console.error("Failed to load AI details for", responseId, e);
        return { responseId, details: null };
      }
    });

    const results = await Promise.all(promises);
    setAiDetailsCache(prev => {
      const next = { ...prev };
      results.forEach(res => {
        if (res.details) next[res.responseId] = res.details;
      });
      return next;
    });
  }, [aiDetailsCache]);

  // Trigger loading AI details when selected question changes
  useEffect(() => {
    if (selectedBatchQuestionId !== "all") {
      const items = groupedBatchQuestions[selectedBatchQuestionId] || [];
      loadAiDetailsForQuestion(items);
      
      // Seed initial local input state with already saved grades
      const nextState: Record<string, BatchGradeItemState> = {};
      items.forEach(item => {
        nextState[item.response_id] = {
          score: item.score !== null && item.score !== undefined ? item.score.toString() : "",
          feedback: item.feedback || ""
        };
      });
      setBatchGradeState(nextState);
    }
  }, [selectedBatchQuestionId, groupedBatchQuestions, loadAiDetailsForQuestion]);

  // AI Details loader for specific modal item
  useEffect(() => {
    let active = true;
    async function loadDetails() {
      if (!batchReviewItem) return;
      // If already cached, just use that
      if (aiDetailsCache[batchReviewItem.response_id]) {
        setBatchReviewDetails(aiDetailsCache[batchReviewItem.response_id]);
        return;
      }
      
      setBatchReviewLoading(true);
      try {
        const data = await aiGradingApi.getGradeDetails(batchReviewItem.response_id);
        if (active) {
          setBatchReviewDetails(data);
          setAiDetailsCache(prev => ({ ...prev, [batchReviewItem.response_id]: data }));
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
  }, [batchReviewItem, aiDetailsCache]);

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

  const handleBatchApplyAi = (responseId: string, score: number) => {
    setBatchItem(responseId, "score", score.toString());
    const details = aiDetailsCache[responseId];
    if (details?.ai_feedback_draft) {
      setBatchItem(responseId, "feedback", details.ai_feedback_draft);
    }
    toast.success("AI suggestion loaded. Click Save to finalize.");
  };

  const handleApplyAiToAll = () => {
    const items = groupedBatchQuestions[selectedBatchQuestionId] || [];
    const nextState = { ...batchGradeState };
    let appliedCount = 0;

    items.forEach(item => {
      const ai = getAiSuggestion(item);
      if (ai.hasSuggestion) {
        const details = aiDetailsCache[item.response_id];
        const detailAi = getAiSuggestion(details);
        nextState[item.response_id] = {
          score: ai.score!.toString(),
          feedback: detailAi.feedbackDraft || detailAi.rationale || ""
        };
        appliedCount++;
      }
    });

    setBatchGradeState(nextState);
    toast.success(`Applied AI suggestions locally for ${appliedCount} items. Click Save All to upload.`);
  };

  const handleSaveBatchGrade = async (
    responseId: string,
    scoreVal: string,
    feedbackVal: string
  ) => {
    if (scoreVal === "" || isNaN(Number(scoreVal))) {
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
      
      // Optimistically update status to COMPLETED locally
      setQueueData(prev => prev.map(q => q.response_id === responseId ? { ...q, score: Number(scoreVal), feedback: feedbackVal, status: "COMPLETED" } : q));
      
      toast.success("Grade submitted successfully.");
    } catch (err: any) {
      toast.error("Failed to save grade");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAllBatchGrades = async () => {
    const items = groupedBatchQuestions[selectedBatchQuestionId] || [];
    const modifiedItems = items.filter(item => {
      const state = batchGradeState[item.response_id];
      // Only save if dirty
      return state && (state.score !== (item.score?.toString() ?? "") || state.feedback !== (item.feedback ?? ""));
    });

    if (modifiedItems.length === 0) {
      toast.info("No modifications to save.");
      return;
    }

    setIsSaving(true);
    let successCount = 0;
    let failCount = 0;

    await Promise.all(modifiedItems.map(async (item) => {
      const state = batchGradeState[item.response_id];
      if (state.score === "" || isNaN(Number(state.score))) {
        failCount++;
        return;
      }
      try {
        await gradingApi.saveGrade(item.response_id, {
          score: Number(state.score),
          feedback: state.feedback || null,
          is_final: true
        });
        
        // Optimistically update
        setQueueData(prev => prev.map(q => q.response_id === item.response_id ? { ...q, score: Number(state.score), feedback: state.feedback, status: "COMPLETED" } : q));
        successCount++;
      } catch (e) {
        failCount++;
      }
    }));

    setIsSaving(false);
    if (successCount > 0) toast.success(`Saved ${successCount} grades.`);
    if (failCount > 0) toast.error(`Failed to save ${failCount} grades.`);
  };

  // Get metadata details for the currently selected question
  const selectedQuestionItems = groupedBatchQuestions[selectedBatchQuestionId] || [];
  const firstItem = selectedQuestionItems[0];
  const selectedQuestionTitle = firstItem?.question_title || "";
  const selectedQuestionType = firstItem?.question_type || "";
  const selectedQuestionMaxMarks = firstItem?.max_score || 0;
  
  const completedCount = selectedQuestionItems.filter(item => item.status === "COMPLETED").length;
  const totalCount = selectedQuestionItems.length;
  const aiSuggestionsReadyCount = selectedQuestionItems.filter(
    item => item.ai_suggested_score !== null || item.status === "AI_SUGGESTED" || item.status === "COMPLETED"
  ).length;

  return (
    <div className="w-full space-y-4 p-1 md:p-2 animate-in fade-in duration-200">
      <div className="border-b pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
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
          <Card className="shadow-none border border-border bg-card/30 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground/80 block mb-1.5">
                Filter by Workspace
              </Label>
              <Select
                value={selectedWorkspaceId}
                onValueChange={setSelectedWorkspaceId}
              >
                <SelectTrigger className="h-9 text-xs rounded-lg border-border bg-background">
                  <SelectValue placeholder="All Workspaces" />
                </SelectTrigger>
                <SelectContent className="rounded-lg shadow-lg">
                  <SelectItem value="all" className="text-xs">All Workspaces</SelectItem>
                  {workspaces.map((ws: any) => (
                    <SelectItem key={ws.id} value={ws.id} className="text-xs">
                      {ws.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground/80 block mb-1.5">
                Select Assessment
              </Label>
              <Select
                value={selectedAssessmentId}
                onValueChange={setSelectedAssessmentId}
              >
                <SelectTrigger className="h-9 text-xs rounded-lg border-border bg-background">
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
                  value={selectedBatchQuestionId}
                  onValueChange={setSelectedBatchQuestionId}
                >
                  <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background hover:bg-background/80 transition-colors">
                    <SelectValue placeholder="Choose question..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Choose a question...</SelectItem>
                    {Object.entries(groupedBatchQuestions).map(([qId, items], idx) => {
                      const qTitle = items[0]?.question_title || "Unknown Question";
                      return (
                        <SelectItem key={qId} value={qId}>
                          Q{idx + 1}: {qTitle.length > 50 ? `${qTitle.substring(0, 50)}...` : qTitle}
                        </SelectItem>
                      );
                    })}
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
          ) : selectedBatchQuestionId === "all" ? (
            <Card className="p-12 text-center text-sm text-muted-foreground italic border border-dashed rounded-xl bg-card/20">
              Please select a question to grade.
            </Card>
          ) : (
            <Card className="shadow-none border border-border/50 bg-card/25 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm p-4 space-y-4 animate-in fade-in duration-300">
              {/* BS3: Question Prompt Context Box */}
              <div className="bg-muted/15 border border-border/30 p-4 rounded-xl space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold uppercase tracking-wider">
                    {selectedQuestionType.replace(/_/g, " ")}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] font-bold">
                    Max Marks: {selectedQuestionMaxMarks} pts
                  </Badge>
                </div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Batch Question Prompt
                </h4>
                <p className="text-sm text-foreground/80 leading-relaxed font-semibold whitespace-pre-wrap">
                  {selectedQuestionTitle}
                </p>
              </div>

              {/* Progress & Bulk actions bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card border border-border/50 p-3 rounded-xl">
                <div className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                  <div>
                    Progress: <span className="font-bold text-foreground font-mono">{completedCount}</span> of <span className="font-bold text-foreground font-mono">{totalCount}</span> student submissions graded
                  </div>
                  <div className="text-[10px] text-muted-foreground/80 flex items-center gap-1">
                    <Sparkles className="size-3 text-indigo-500" />
                    AI suggestions ready: <span className="font-bold text-foreground font-mono">{aiSuggestionsReadyCount}</span> of <span className="font-bold text-foreground font-mono">{totalCount}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleApplyAiToAll}
                    className="h-8 text-xs font-bold text-primary border-primary/20 bg-primary/5 hover:bg-primary/10 rounded-lg"
                  >
                    <Sparkles className="size-3.5 mr-1.5" /> Apply AI to All
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveAllBatchGrades}
                    disabled={isSaving}
                    className="h-8 text-xs font-bold rounded-lg"
                  >
                    {isSaving && <Loader2 className="size-3 animate-spin mr-1.5" />}
                    <Save className="size-3.5 mr-1.5" /> Save All Reviewed
                  </Button>
                </div>
              </div>

              {/* Submissions table */}
              <div className="border border-border/40 rounded-xl overflow-hidden bg-background shadow-sm">
                <Table>
                  <TableHeader className="bg-muted/15 border-b border-border/40">
                    <TableRow className="h-10 hover:bg-transparent">
                      <TableHead className="text-[10px] font-bold uppercase w-1/5 pl-4">
                        Student Name & Status
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase w-1/4">
                        Answer Response
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase w-1/5">
                        AI suggestion & Draft
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase w-1/10 text-center">
                        Grade
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase w-1/4">
                        Feedback Comment
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase text-right pr-4 w-1/12">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {selectedQuestionItems.map((item, idx) => {
                      const localState = getBatchItem(item.response_id);
                      const aiDetails = aiDetailsCache[item.response_id];
                      
                      // Calculate row status
                      const itemStatus = item.status as any;
                      
                      return (
                        <TableRow key={idx} className="h-16 hover:bg-muted/5 transition-colors border-border/10">
                          <TableCell className="font-bold pl-4">
                            <div className="space-y-1">
                              <p className="text-sm font-bold text-foreground">{item.student_name}</p>
                              <Badge
                                className={cn(
                                  "text-[8px] font-bold uppercase tracking-wider px-1.5 py-0 border font-mono shadow-none",
                                  itemStatus === "COMPLETED"
                                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                    : itemStatus === "AI_SUGGESTED"
                                      ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                      : itemStatus === "IN_PROGRESS"
                                        ? "bg-amber-500/10 text-amber-600 border-amber-500/20 animate-pulse"
                                        : "bg-zinc-500/10 text-zinc-600 border-zinc-500/20"
                                )}
                              >
                                {itemStatus === "COMPLETED"
                                  ? "Graded"
                                  : itemStatus === "AI_SUGGESTED"
                                    ? "AI Suggested"
                                    : itemStatus === "IN_PROGRESS"
                                      ? "AI Grading..."
                                      : "Not Started"}
                              </Badge>
                            </div>
                          </TableCell>
                          
                          <TableCell className="py-2">
                            <ExpandableAnswer answer={item.student_answer || ""} />
                          </TableCell>
                          
                          <TableCell className="py-2">
                            {(() => {
                              const itemAi = getAiSuggestion(item);
                              const detailAi = getAiSuggestion(aiDetails);
                              const fbPreview =
                                detailAi.feedbackDraft || detailAi.rationale;
                              return itemAi.hasSuggestion ? (
                                <div className="space-y-1 text-xs">
                                  <div className="flex items-center gap-1.5">
                                    <Badge
                                      variant="secondary"
                                      className="font-mono font-bold bg-primary/10 text-primary border-primary/20 text-[10px]"
                                    >
                                      {itemAi.score} pts
                                    </Badge>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-6 text-primary hover:bg-primary/5 rounded-full"
                                      onClick={() => {
                                        setBatchReviewItem(item);
                                        setShowBatchReviewModal(true);
                                      }}
                                      title="View full AI rationale modal"
                                    >
                                      <Eye className="size-3.5" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 text-[9px] font-bold border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-md px-1.5 flex items-center gap-1"
                                      onClick={() =>
                                        handleBatchApplyAi(
                                          item.response_id,
                                          itemAi.score!,
                                        )
                                      }
                                    >
                                      <Sparkles className="size-2.5" /> Apply
                                    </Button>
                                  </div>
                                  {fbPreview && (
                                    <p
                                      className="text-[10px] text-muted-foreground font-medium italic line-clamp-2 max-w-[220px]"
                                      title={fbPreview}
                                    >
                                      {fbPreview}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground/40 text-[10px] italic">
                                  N/A (No AI suggestion)
                                </span>
                              );
                            })()}
                          </TableCell>
                          
                          <TableCell className="text-center py-2">
                            <Input
                              placeholder="--"
                              className="h-8 w-16 text-center font-mono font-bold mx-auto border-border/80 rounded-lg text-xs"
                              value={localState.score}
                              onChange={(e) =>
                                setBatchItem(item.response_id, "score", e.target.value)
                              }
                            />
                          </TableCell>
                          
                          <TableCell className="py-2">
                            <Textarea
                              placeholder="Provide feedback comment..."
                              className="min-h-[60px] w-full py-1 px-2 text-xs border-border/80 rounded-lg resize-none"
                              value={localState.feedback}
                              onChange={(e) =>
                                setBatchItem(item.response_id, "feedback", e.target.value)
                              }
                            />
                          </TableCell>
                          
                          <TableCell className="text-right pr-4 py-2">
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
            </Card>
          )}
        </div>
      )}

      {/* Single Batch AI Grade Review Modal (Optional expanded detail) */}
      <Dialog
        open={showBatchReviewModal}
        onOpenChange={setShowBatchReviewModal}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 rounded-xl border border-border shadow-2xl bg-background">
          <DialogHeader className="pb-2 border-b border-border/40">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="size-5" />
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
                    {getAiSuggestion(batchReviewItem).score} pts
                  </span>
                </div>
              </div>

              {/* Full Response Text */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Student Response
                </span>
                <div className="text-xs p-3 bg-muted/10 border border-border/60 rounded-xl whitespace-pre-wrap leading-relaxed max-h-[180px] overflow-y-auto font-sans">
                  {(() => {
                    const raw = batchReviewItem.student_answer;
                    if (!raw) return <span className="italic text-muted-foreground">No response.</span>;
                    const parsedSub = parseCaseStudyAnswer(raw);
                    if (parsedSub) {
                      return (
                        <div className="space-y-2">
                          {parsedSub.map((sa, i) => (
                            <div key={i} className="p-2 rounded-lg bg-background/70 border border-border/40">
                              <span className="font-bold text-primary text-[10px] uppercase tracking-wider block mb-0.5">
                                Sub-Question {i + 1}
                              </span>
                              <p className="text-foreground/90 font-medium leading-relaxed">{sa}</p>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return <span className="font-mono">{raw}</span>;
                  })()}
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
                    {(() => {
                      const modalAi = getAiSuggestion(batchReviewDetails);
                      return (
                        modalAi.feedbackDraft ||
                        modalAi.rationale ||
                        "No rationale or feedback draft available."
                      );
                    })()}
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
              disabled={batchReviewLoading || !batchReviewItem || isSaving}
              onClick={async () => {
                if (batchReviewItem) {
                  const details = aiDetailsCache[batchReviewItem.response_id];
                  const detailAi = getAiSuggestion(details);
                  const itemAi = getAiSuggestion(batchReviewItem);
                  const feedbackVal = detailAi.feedbackDraft || detailAi.rationale || "";
                  await handleSaveBatchGrade(
                    batchReviewItem.response_id,
                    (itemAi.score ?? "").toString(),
                    feedbackVal
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
