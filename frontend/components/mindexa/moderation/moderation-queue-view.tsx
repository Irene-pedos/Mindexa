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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  moderationApi,
  COMMENT_CATEGORY_LABELS,
  ModeratorQueueItem,
  ModerationCommentCategory,
  ModerationOverview,
  ChecklistItem,
} from "@/lib/api/moderation";
import { buildFeedbackFromChecks, failedChecks, mergeFeedback } from "@/lib/moderation-feedback";

/**
 * The backend has no "CLAIMED" status: a claimed review is an OPEN round with a
 * reviewer. Derive the label the moderator expects from that.
 */
type QueueState = "UNCLAIMED" | "CLAIMED" | "CHANGES_REQUESTED" | "APPROVED";

function queueState(item: ModeratorQueueItem): QueueState {
  if (item.review_status === "APPROVED") return "APPROVED";
  if (item.review_status === "CHANGES_REQUESTED") return "CHANGES_REQUESTED";
  return item.reviewer_id ? "CLAIMED" : "UNCLAIMED";
}

const STATE_LABELS: Record<QueueState, string> = {
  UNCLAIMED: "Unclaimed",
  CLAIMED: "Claimed",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
};
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
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  // Decision panel (inside the review sheet, not a second pop-up)
  const [actionType, setActionType] = useState<"APPROVE" | "REQUEST_CHANGES" | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [waiveReason, setWaiveReason] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);

  // New Comment state
  const [newCommentText, setNewCommentText] = useState("");
  const [newCommentCategory, setNewCommentCategory] =
    useState<ModerationCommentCategory>("WORDING");
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
      toast.success("Review claimed. Read the paper, then request changes or approve it.");
      fetchQueue();
      // Claiming keeps the round OPEN; it only records who is reviewing. The author is
      // told nothing more until a decision is made, so go straight to the review.
      const claimed = { ...item, reviewer_id: user?.id };
      if (selectedItem?.review_id === item.review_id) {
        setSelectedItem(claimed);
      } else {
        void handleOpenInspection(claimed);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to claim review");
    }
  };

  const handleOpenInspection = async (item: ModeratorQueueItem) => {
    setSelectedItem(item);
    setInspectionOpen(true);
    setLoadingDetails(true);
    setQuestionsError(null);
    setQuestions([]);
    try {
      const [overviewRes, questionsRes] = await Promise.all([
        moderationApi.getAssessmentModeration(item.assessment_id).catch(() => null),
        assessmentApi.getAssessmentQuestions(item.assessment_id).catch((err: unknown) => {
          // Surface the failure instead of showing "no questions attached"
          setQuestionsError(
            err instanceof Error && err.message
              ? err.message
              : "The questions could not be loaded.",
          );
          return [];
        }),
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

  const openDecision = (type: "APPROVE" | "REQUEST_CHANGES") => {
    setActionType(type);
    // Changes start from the automated checks that were not met; the moderator adds their own words.
    setDecisionNote(type === "REQUEST_CHANGES" ? buildFeedbackFromChecks(checklistItems) : "");
    setWaiveReason("");
    setDecisionError(null);
  };

  const closeDecision = () => {
    setActionType(null);
    setDecisionError(null);
  };

  const handleExecuteDecision = async () => {
    if (!selectedItem || !actionType) return;
    setDecisionError(null);
    if (actionType === "REQUEST_CHANGES" && !decisionNote.trim()) {
      setDecisionError("Write what the lecturer must change, so they can fix it.");
      return;
    }
    if (actionType === "APPROVE" && failedRequired.length > 0 && waiveReason.trim().length < 10) {
      setDecisionError("Explain why you are approving despite the failed checks (at least 10 characters).");
      return;
    }

    try {
      setSubmittingAction(true);
      // Feedback typed in the comment box but never posted must not be lost.
      if (actionType === "REQUEST_CHANGES" && newCommentText.trim()) {
        await moderationApi.addComment(selectedItem.review_id, {
          category: newCommentCategory,
          comment: newCommentText.trim(),
          target_type: "ASSESSMENT",
        });
        setNewCommentText("");
      }
      if (actionType === "APPROVE") {
        await moderationApi.approveReview(selectedItem.review_id, decisionNote.trim() || undefined, {
          overrideReason: failedRequired.length > 0 ? waiveReason.trim() : undefined,
        });
        toast.success(
          failedRequired.length > 0
            ? "Approved with waived checks. The lecturer and exam office have been told."
            : "Approved. The paper is now with the Exam Office.",
        );
      } else {
        await moderationApi.requestChanges(selectedItem.review_id, decisionNote.trim());
        toast.success("Changes requested. The lecturer has been notified and can edit the paper now.");
      }
      closeDecision();
      setDecisionNote("");
      setWaiveReason("");
      setInspectionOpen(false);
      fetchQueue();
    } catch (err: any) {
      // Shown inside the panel (a toast can be missed) and kept until the moderator acts again.
      const message = err?.message || "The decision could not be saved. Please try again.";
      setDecisionError(message);
      toast.error(message);
      // The rules may have changed since the sheet opened: reload what is shown.
      if (selectedItem) void moderationApi.getAssessmentModeration(selectedItem.assessment_id).then(setOverview).catch(() => undefined);
    } finally {
      setSubmittingAction(false);
    }
  };

  const filteredQueue = queue.filter((item) => {
    const matchesSearch =
      (item.assessment_title || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.assessment_id || "").toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    return filterStatus === "ALL" || queueState(item) === filterStatus;
  });

  const latestRound = overview?.rounds?.[overview.rounds.length - 1];
  // Today's result under the institution's rules when the round is open, else the snapshot.
  const checklistItems: ChecklistItem[] =
    overview?.current_checklist?.items ?? latestRound?.checklist_result?.items ?? [];
  const failedRequired = checklistItems.filter((c) => !c.passed && c.severity === "BLOCKING");
  const failedAdvisory = checklistItems.filter((c) => !c.passed && c.severity === "WARNING");

  // Only the moderator who claimed an open round may comment or decide. When the signed-in
  // account has not loaded yet, do not hide the buttons: the server enforces who may decide.
  const selectedState = selectedItem ? queueState(selectedItem) : null;
  const canActOnSelected =
    selectedState === "CLAIMED" && (!user?.id || selectedItem?.reviewer_id === user.id);

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
            {(["ALL", "UNCLAIMED", "CLAIMED", "CHANGES_REQUESTED", "APPROVED"] as const).map((st) => (
              <Button
                key={st}
                variant={filterStatus === st ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus(st)}
                className="h-8 text-xs"
              >
                {st === "ALL" ? "All" : STATE_LABELS[st]}
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
            const state = queueState(item);
            const isUnclaimed = state === "UNCLAIMED";

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
                          state === "UNCLAIMED" && "bg-amber-500/10 text-amber-600 border border-amber-500/20",
                          state === "CLAIMED" && "bg-blue-500/10 text-blue-600 border border-blue-500/20",
                          state === "CHANGES_REQUESTED" && "bg-orange-500/10 text-orange-600 border border-orange-500/20",
                          state === "APPROVED" && "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                        )}
                      >
                        {STATE_LABELS[state]}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Assessment ID: <span className="font-mono">{item.assessment_id.slice(0, 8)}</span></span>
                      {item.started_at && (
                        <span>Submitted: {format(new Date(item.started_at), "PPP p")}</span>
                      )}
                      {state === "CLAIMED" && (
                        <span className="flex items-center gap-1 text-primary">
                          <UserCheck className="size-3" />
                          {item.reviewer_id === user?.id ? "Claimed by you" : "Claimed by another moderator"}
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
                  Moderation Review Round {selectedItem?.round_no} · Status:{" "}
                  {selectedState ? STATE_LABELS[selectedState] : ""}
                </SheetDescription>
              </div>

              {selectedState === "UNCLAIMED" && (
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
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-primary" />
                    Automated Pre-Moderation Compliance
                  </h4>
                  <p className="mb-3 text-[11px] text-muted-foreground">
                    Checked against your institution&apos;s current rules. These checks guide you; the
                    decision is yours.
                    {failedRequired.length > 0
                      ? " You can approve despite a failed required check by giving a reason."
                      : ""}
                  </p>
                  {latestRound?.compliance_override && (
                    <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                      <p className="font-semibold text-amber-800 dark:text-amber-300">
                        Approved with waived checks: {latestRound.compliance_override.codes.join(", ")}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Reason: {latestRound.compliance_override.reason}
                      </p>
                    </div>
                  )}

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
                              : chk.severity === "BLOCKING"
                              ? "bg-rose-500/5 border-rose-500/20 text-rose-900 dark:text-rose-300"
                              : "bg-amber-500/5 border-amber-500/20 text-amber-900 dark:text-amber-300"
                          )}
                        >
                          {chk.passed ? (
                            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 mt-0.5" />
                          ) : chk.severity === "BLOCKING" ? (
                            <XCircle className="size-4 shrink-0 text-rose-600 mt-0.5" />
                          ) : (
                            <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <span className="font-semibold mr-1.5 uppercase tracking-wide text-[10px]">
                              [{chk.code}]
                            </span>
                            {!chk.passed && (
                              <span
                                className={cn(
                                  "mr-1.5 rounded px-1 py-px text-[9px] font-bold uppercase",
                                  chk.severity === "BLOCKING"
                                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                                )}
                              >
                                {chk.severity === "BLOCKING" ? "Required" : "Advisory"}
                              </span>
                            )}
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

                  {questionsError ? (
                    <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 text-xs text-rose-700 dark:text-rose-300">
                      Could not load the questions: {questionsError}
                    </div>
                  ) : questions.length === 0 ? (
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
                              {COMMENT_CATEGORY_LABELS[c.category] ?? c.category}
                            </Badge>
                            {/* The API does not send a timestamp; show resolution instead */}
                            <span
                              className={cn(
                                "text-[10px]",
                                c.resolved ? "text-emerald-600" : "text-muted-foreground",
                              )}
                            >
                              {c.resolved ? "Resolved by author" : "Open"}
                            </span>
                          </div>
                          <p className="text-foreground">{c.comment}</p>
                        </div>
                      ))
                    )}
                  </div>

                  {canActOnSelected && (
                    <p className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs text-foreground">
                      Claiming only reserves this paper. <span className="font-semibold">The lecturer is told
                      nothing until you decide</span>: use <span className="font-semibold">Request Changes</span>{" "}
                      (with a note saying what to fix) or <span className="font-semibold">Approve Assessment</span>{" "}
                      at the bottom of this panel.
                    </p>
                  )}

                  {/* Add comment box — only for the moderator who claimed the round */}
                  {!canActOnSelected && (
                    <p className="text-xs text-muted-foreground border-t pt-2">
                      {selectedState === "UNCLAIMED"
                        ? "Claim this review to comment on it or make a decision."
                        : selectedState === "CLAIMED"
                          ? "This review is claimed by another moderator."
                          : "This review round is closed."}
                    </p>
                  )}
                  <div className={cn("space-y-2 pt-2 border-t", !canActOnSelected && "hidden")}>
                    <div className="flex items-center gap-2">
                      <Select
                        value={newCommentCategory}
                        onValueChange={(val) => setNewCommentCategory(val as ModerationCommentCategory)}
                      >
                        <SelectTrigger className="h-8 text-xs w-44">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(COMMENT_CATEGORY_LABELS) as ModerationCommentCategory[]).map(
                            (cat) => (
                              <SelectItem key={cat} value={cat}>
                                {COMMENT_CATEGORY_LABELS[cat]}
                              </SelectItem>
                            ),
                          )}
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
                      placeholder="Add specific comments or concerns for the lecturer..."
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      className="text-xs min-h-[60px]"
                    />
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}

          {/* Decision area: pinned to the bottom of the sheet so it can never scroll out of reach */}
          <div className="shrink-0 border-t bg-muted/10">
            {actionType ? (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4" role="region" aria-label="Your decision">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">
                      {actionType === "APPROVE" ? "Approve this paper" : "Request changes from the lecturer"}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {actionType === "APPROVE"
                        ? "The paper moves to the Exam Office for sealing and printing."
                        : "The paper goes back to the lecturer, who is notified and can edit it straight away."}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Cancel"
                    onClick={closeDecision}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <XCircle className="size-4" />
                  </button>
                </div>

                {actionType === "APPROVE" && failedRequired.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                    <p className="font-semibold text-amber-800 dark:text-amber-300">
                      {failedRequired.length} required check{failedRequired.length === 1 ? "" : "s"} did not
                      pass. You can still approve.
                    </p>
                    <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                      {failedRequired.map((c) => (
                        <li key={c.code}>
                          <span className="font-medium text-foreground">{c.code}</span>: {c.message}
                        </li>
                      ))}
                    </ul>
                    <Label htmlFor="waive-reason" className="text-xs font-medium">
                      Why are you approving anyway? * <span className="font-normal text-muted-foreground">(recorded, and shown to the lecturer and exam office)</span>
                    </Label>
                    <Textarea
                      id="waive-reason"
                      value={waiveReason}
                      onChange={(e) => setWaiveReason(e.target.value)}
                      placeholder="e.g. This module is examined out of 70 by agreement with the exam board."
                      className="min-h-[64px] text-xs"
                    />
                  </div>
                )}
                {actionType === "APPROVE" && failedRequired.length === 0 && failedAdvisory.length > 0 && (
                  <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
                    {failedAdvisory.length} advisory check{failedAdvisory.length === 1 ? "" : "s"} did not pass (
                    {failedAdvisory.map((c) => c.code).join(", ")}). They are only advice, so you can approve
                    without giving a reason.
                  </p>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="decision-note" className="text-xs font-medium">
                    {actionType === "APPROVE" ? "Sign-off note (optional)" : "What must change? *"}
                  </Label>
                  {actionType === "REQUEST_CHANGES" && (
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {failedChecks(checklistItems).length > 0
                          ? `Filled from ${failedChecks(checklistItems).length} automated check${failedChecks(checklistItems).length === 1 ? "" : "s"} not met. Edit it or add your own words.`
                          : "All automated checks passed. Write what you want changed."}
                      </span>
                      {failedChecks(checklistItems).length > 0 && (
                        <button
                          type="button"
                          className="shrink-0 font-medium text-primary hover:underline"
                          onClick={() => setDecisionNote((cur) => mergeFeedback(cur, checklistItems))}
                        >
                          Add unmet checks
                        </button>
                      )}
                    </div>
                  )}
                  <Textarea
                    id="decision-note"
                    placeholder={
                      actionType === "APPROVE"
                        ? "e.g. Content checked against the syllabus; marking scheme verified."
                        : "Say which questions or settings must change, e.g. “Question 4 has two correct answers.”"
                    }
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    className="min-h-[80px] text-xs"
                  />
                </div>

                {decisionError && (
                  <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5 text-xs text-rose-700 dark:text-rose-300">
                    {decisionError}
                  </p>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={closeDecision} className="h-9 text-xs">
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={submittingAction}
                    onClick={handleExecuteDecision}
                    className={cn(
                      "h-9 text-xs",
                      actionType === "APPROVE"
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-orange-600 text-white hover:bg-orange-700",
                    )}
                  >
                    {submittingAction ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : actionType === "APPROVE" ? (
                      failedRequired.length > 0 ? "Approve anyway" : "Confirm approval"
                    ) : (
                      "Send to lecturer"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 p-4">
                <Button variant="outline" size="sm" onClick={() => setInspectionOpen(false)} className="h-9 text-xs">
                  Close
                </Button>

                {canActOnSelected && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDecision("REQUEST_CHANGES")}
                      className="h-9 text-xs text-orange-600 border-orange-500/30 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                    >
                      <RotateCcw className="size-3.5 mr-1" />
                      Request Changes
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => openDecision("APPROVE")}
                      className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <ThumbsUp className="size-3.5 mr-1" />
                      Approve Assessment
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}
