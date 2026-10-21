// frontend/components/mindexa/moderation/moderation-queue-view.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ShieldCheck,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Eye,
  MessageSquare,
  ThumbsUp,
  RotateCcw,
  BookOpen,
  HelpCircle,
  Send,
  Loader2,
  Check,
  ChevronRight,
  UserCheck,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  moderationApi,
  ModeratorQueueItem,
  ModerationOverview,
  ChecklistItem,
} from "@/lib/api/moderation";
import { assessmentApi } from "@/lib/api/assessment";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface ModerationQueueViewProps {
  portal?: "lecturer" | "admin";
}

export function ModerationQueueView({ portal = "lecturer" }: ModerationQueueViewProps) {
  const { user } = useAuth();
  const [queue, setQueue] = useState<ModeratorQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Inspection Drawer State
  const [selectedItem, setSelectedItem] = useState<ModeratorQueueItem | null>(null);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [overview, setOverview] = useState<ModerationOverview | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);

  // Dialog states for Actions
  const [actionType, setActionType] = useState<"APPROVE" | "REQUEST_CHANGES" | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  // New Comment state
  const [newCommentText, setNewCommentText] = useState("");
  const [newCommentCategory, setNewCommentCategory] = useState<
    "GENERAL" | "SYLLABUS_ALIGNMENT" | "DIFFICULTY" | "CLARITY" | "MARKING_SCHEME"
  >("GENERAL");
  const [addingComment, setAddingComment] = useState(false);

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      const res = await moderationApi.getModeratorQueue();
      setQueue(res || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load moderator queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleClaim = async (item: ModeratorQueueItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await moderationApi.claimReview(item.review_id);
      toast.success("Moderation review claimed successfully!");
      fetchQueue();
      if (selectedItem?.review_id === item.review_id) {
        setSelectedItem({ ...item, review_status: "CLAIMED", reviewer_id: user?.id });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to claim review");
    }
  };

  const handleOpenInspection = async (item: ModeratorQueueItem) => {
    setSelectedItem(item);
    setInspectionOpen(true);
    setLoadingDetails(true);
    try {
      const [overviewRes, questionsRes] = await Promise.all([
        moderationApi.getAssessmentModeration(item.assessment_id).catch(() => null),
        assessmentApi.getAssessmentQuestions(item.assessment_id).catch(() => []),
      ]);
      setOverview(overviewRes);
      setQuestions(questionsRes || []);
    } catch (err: any) {
      toast.error("Could not load complete review details");
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleAddComment = async () => {
    if (!selectedItem || !newCommentText.trim()) return;
    try {
      setAddingComment(true);
      await moderationApi.addComment(selectedItem.review_id, {
        category: newCommentCategory,
        comment: newCommentText.trim(),
        target_type: "ASSESSMENT",
      });
      toast.success("Feedback comment added!");
      setNewCommentText("");
      // Refresh overview
      const updatedOverview = await moderationApi.getAssessmentModeration(
        selectedItem.assessment_id
      );
      setOverview(updatedOverview);
    } catch (err: any) {
      toast.error(err.message || "Failed to add comment");
    } finally {
      setAddingComment(false);
    }
  };

  const handleExecuteDecision = async () => {
    if (!selectedItem || !actionType) return;
    if (actionType === "REQUEST_CHANGES" && !decisionNote.trim()) {
      toast.error("Please enter specific feedback notes for the changes requested.");
      return;
    }

    try {
      setSubmittingAction(true);
      if (actionType === "APPROVE") {
        await moderationApi.approveReview(selectedItem.review_id, decisionNote.trim() || undefined);
        toast.success("Summative assessment approved! Sent to Exam Office.");
      } else {
        await moderationApi.requestChanges(selectedItem.review_id, decisionNote.trim());
        toast.info("Changes requested. Assessment returned to author.");
      }
      setActionType(null);
      setDecisionNote("");
      setInspectionOpen(false);
      fetchQueue();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit decision");
    } finally {
      setSubmittingAction(false);
    }
  };

  const filteredQueue = queue.filter((item) => {
    const matchesSearch =
      (item.assessment_title || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.assessment_id || "").toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (filterStatus === "ALL") return true;
    if (filterStatus === "OPEN") return item.review_status === "OPEN";
    if (filterStatus === "CLAIMED") return item.review_status === "CLAIMED";
    if (filterStatus === "CHANGES_REQUESTED") return item.review_status === "CHANGES_REQUESTED";
    if (filterStatus === "APPROVED") return item.review_status === "APPROVED";
    return true;
  });

  const latestRound = overview?.rounds?.[overview.rounds.length - 1];
  const checklistItems = latestRound?.checklist_result?.items || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-xl text-primary">
              <ShieldCheck className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Exam Moderation Queue</h1>
              <p className="text-sm text-muted-foreground">
                Institutional summative exam quality assurance and approval workflow.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchQueue}
            disabled={loading}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-border/60 shadow-none">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search assessment title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap w-full md:w-auto">
            {["ALL", "OPEN", "CLAIMED", "CHANGES_REQUESTED", "APPROVED"].map((st) => (
              <Button
                key={st}
                variant={filterStatus === st ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus(st)}
                className="h-8 text-xs capitalize"
              >
                {st.replace("_", " ").toLowerCase()}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Queue Items */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-24 border-border/50" />
          ))}
        </div>
      ) : filteredQueue.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted/60 mb-3">
            <ShieldCheck className="size-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold">No assessments in moderation queue</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {filterStatus === "ALL"
              ? "When faculty authors submit summative assessments for department moderation, they will appear here."
              : `No assessments found with status '${filterStatus}'.`}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredQueue.map((item) => {
            const isClaimedByMe = item.reviewer_id === user?.id;
            const isUnclaimed = !item.reviewer_id || item.review_status === "OPEN";

            return (
              <Card
                key={item.review_id}
                onClick={() => handleOpenInspection(item)}
                className="hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer border-border/60"
              >
                <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-base text-foreground truncate">
                        {item.assessment_title || "Untitled Assessment"}
                      </h3>
                      <Badge variant="secondary" className="text-[10px] font-semibold h-5">
                        Round {item.round_no}
                      </Badge>
                      <Badge
                        className={cn(
                          "text-[10px] font-semibold h-5 uppercase tracking-wide",
                          item.review_status === "OPEN" && "bg-amber-500/10 text-amber-600 border border-amber-500/20",
                          item.review_status === "CLAIMED" && "bg-blue-500/10 text-blue-600 border border-blue-500/20",
                          item.review_status === "CHANGES_REQUESTED" && "bg-orange-500/10 text-orange-600 border border-orange-500/20",
                          item.review_status === "APPROVED" && "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                        )}
                      >
                        {item.review_status.replace("_", " ")}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Assessment ID: <span className="font-mono">{item.assessment_id.slice(0, 8)}</span></span>
                      {item.started_at && (
                        <span>Submitted: {format(new Date(item.started_at), "PPP p")}</span>
                      )}
                      {item.claimed_at && (
                        <span className="flex items-center gap-1 text-primary">
                          <UserCheck className="size-3" /> Claimed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
                    {isUnclaimed && (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 text-xs rounded-lg"
                        onClick={(e) => handleClaim(item, e)}
                      >
                        Claim Review
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs rounded-lg gap-1"
                      onClick={() => handleOpenInspection(item)}
                    >
                      <Eye className="size-3.5" />
                      Review Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review Inspection Sheet */}
      <Sheet open={inspectionOpen} onOpenChange={setInspectionOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
          <SheetHeader className="p-6 border-b shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <SheetTitle className="text-xl font-bold flex items-center gap-2">
                  <ShieldCheck className="size-5 text-primary" />
                  {selectedItem?.assessment_title}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  Moderation Review Round {selectedItem?.round_no} · Status: {selectedItem?.review_status}
                </SheetDescription>
              </div>

              {selectedItem?.review_status === "OPEN" && (
                <Button
                  size="sm"
                  onClick={() => selectedItem && handleClaim(selectedItem)}
                  className="h-8 text-xs"
                >
                  Claim Review
                </Button>
              )}
            </div>
          </SheetHeader>

          {loadingDetails ? (
            <div className="flex-1 p-6 space-y-4">
              <div className="h-6 w-48 bg-muted animate-pulse rounded" />
              <div className="h-32 w-full bg-muted animate-pulse rounded-xl" />
              <div className="h-48 w-full bg-muted animate-pulse rounded-xl" />
            </div>
          ) : (
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6">
                {/* Pre-Moderation Automated Checklist */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-primary" />
                    Automated Pre-Moderation Compliance
                  </h4>

                  {checklistItems.length === 0 ? (
                    <div className="p-4 rounded-xl border border-border/60 bg-muted/20 text-xs text-muted-foreground text-center">
                      No automated checklist results recorded for this round.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {checklistItems.map((chk: ChecklistItem, idx: number) => (
                        <div
                          key={idx}
                          className={cn(
                            "p-3 rounded-xl border text-xs flex items-start gap-3",
                            chk.passed
                              ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-900 dark:text-emerald-300"
                              : chk.severity === "HARD_FAIL"
                              ? "bg-rose-500/5 border-rose-500/20 text-rose-900 dark:text-rose-300"
                              : "bg-amber-500/5 border-amber-500/20 text-amber-900 dark:text-amber-300"
                          )}
                        >
                          {chk.passed ? (
                            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 mt-0.5" />
                          ) : chk.severity === "HARD_FAIL" ? (
                            <XCircle className="size-4 shrink-0 text-rose-600 mt-0.5" />
                          ) : (
                            <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <span className="font-semibold mr-1.5 uppercase tracking-wide text-[10px]">
                              [{chk.code}]
                            </span>
                            {chk.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Questions Preview */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <BookOpen className="size-4 text-primary" />
                      Assessment Questions ({questions.length})
                    </h4>
                  </div>

                  {questions.length === 0 ? (
                    <div className="p-4 rounded-xl border border-border/60 bg-muted/20 text-xs text-muted-foreground text-center">
                      No questions attached to this assessment.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {questions.map((q: any, i: number) => {
                        const questionData = q.question || q;
                        return (
                          <div
                            key={q.id || i}
                            className="p-3 rounded-xl border border-border/60 bg-card text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-foreground">
                                Q{i + 1}. {questionData.type || questionData.question_type || "Question"}
                              </span>
                              <Badge variant="outline" className="text-[10px] h-4.5">
                                {q.marks_override || questionData.marks || 1} Marks
                              </Badge>
                            </div>
                            <p className="text-muted-foreground line-clamp-2">
                              {questionData.content || questionData.text || "No text"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Review Feedback / Comments */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <MessageSquare className="size-4 text-primary" />
                    Review Feedback & Concerns
                  </h4>

                  {/* Existing comments */}
                  <div className="space-y-2 mb-4">
                    {(latestRound?.comments || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        No feedback notes added yet.
                      </p>
                    ) : (
                      latestRound?.comments?.map((c) => (
                        <div
                          key={c.id}
                          className="p-3 rounded-xl border border-border/60 bg-muted/20 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <Badge variant="secondary" className="text-[9px] uppercase tracking-wider">
                              {c.category.replace("_", " ")}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(c.created_at), "p")}
                            </span>
                          </div>
                          <p className="text-foreground">{c.comment}</p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add comment box */}
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Select
                        value={newCommentCategory}
                        onValueChange={(val: any) => setNewCommentCategory(val)}
                      >
                        <SelectTrigger className="h-8 text-xs w-44">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GENERAL">General Feedback</SelectItem>
                          <SelectItem value="SYLLABUS_ALIGNMENT">Syllabus Alignment</SelectItem>
                          <SelectItem value="DIFFICULTY">Difficulty Level</SelectItem>
                          <SelectItem value="CLARITY">Question Clarity</SelectItem>
                          <SelectItem value="MARKING_SCHEME">Marking Scheme</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={addingComment || !newCommentText.trim()}
                        onClick={handleAddComment}
                        className="h-8 text-xs ml-auto gap-1"
                      >
                        <Send className="size-3" />
                        Post Feedback
                      </Button>
                    </div>
                    <Textarea
                      placeholder="Add specific comments or concerns for the author..."
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      className="text-xs min-h-[60px]"
                    />
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}

          {/* Footer Action Buttons */}
          <div className="p-4 border-t bg-muted/10 flex items-center justify-between gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInspectionOpen(false)}
              className="h-9 text-xs"
            >
              Close
            </Button>

            {selectedItem?.review_status !== "APPROVED" && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActionType("REQUEST_CHANGES");
                    setDecisionNote("");
                  }}
                  className="h-9 text-xs text-orange-600 border-orange-500/30 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                >
                  <RotateCcw className="size-3.5 mr-1" />
                  Request Changes
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setActionType("APPROVE");
                    setDecisionNote("");
                  }}
                  className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <ThumbsUp className="size-3.5 mr-1" />
                  Approve Assessment
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Decision Confirmation Dialog */}
      <Dialog open={actionType !== null} onOpenChange={(open) => !open && setActionType(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {actionType === "APPROVE" ? "Approve Summative Assessment" : "Request Changes from Author"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {actionType === "APPROVE"
                ? "Approving this assessment marks moderation complete and moves the assessment to the Exam Office queue for cryptographic sealing and print job generation."
                : "The assessment will be returned to the course lecturer with your feedback for revision before resubmission."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-medium">
              {actionType === "APPROVE" ? "Sign-off Note (Optional)" : "Reason / Changes Requested *"}
            </Label>
            <Textarea
              placeholder={
                actionType === "APPROVE"
                  ? "e.g., Content vetted against semester syllabus; marking scheme verified."
                  : "Detail what questions or parameters must be altered before approval..."
              }
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              className="text-xs min-h-[90px]"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActionType(null)}
              className="h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={submittingAction || (actionType === "REQUEST_CHANGES" && !decisionNote.trim())}
              onClick={handleExecuteDecision}
              className={cn(
                "h-9 text-xs",
                actionType === "APPROVE"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-orange-600 hover:bg-orange-700 text-white"
              )}
            >
              {submittingAction ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : actionType === "APPROVE" ? (
                "Confirm Approval"
              ) : (
                "Send Changes Request"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
