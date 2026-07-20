// app/student/group-work/[id]/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Loader2, 
  ArrowLeft, 
  RefreshCcw, 
  HelpCircle,
  LayoutDashboard,
  Monitor,
  Check,
  ChevronRight,
  AlertTriangle,
  MessageSquare,
  BookOpen,
  FileText,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

import { groupWorkApi } from "@/lib/api/group-work";
import { GroupIntroCard } from "@/components/mindexa/group-work/group-intro-card";
import { GroupMembersPanel } from "@/components/mindexa/group-work/group-members-panel";
import { GroupAnswerEditor } from "@/components/mindexa/group-work/group-answer-editor";
import { GroupCommentsPanel } from "@/components/mindexa/group-work/group-comments-panel";
import { GroupApprovalPanel } from "@/components/mindexa/group-work/group-approval-panel";
import { GroupActivityFeed } from "@/components/mindexa/group-work/group-activity-feed";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export default function StudentGroupWorkWorkspace() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.id as string;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [workspace, setWorkspace] = useState<any>(null);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitConfirmError, setSubmitConfirmError] = useState<string | null>(null);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (!showSubmitConfirm) {
      setSubmitConfirmError(null);
    }
  }, [showSubmitConfirm]);

  const hasInitializedQuestion = useRef(false);
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const incrementLocalParticipation = useCallback(() => {
    setWorkspace((prev: any) => {
      if (!prev) return null;
      return {
        ...prev,
        members: prev.members.map((m: any) => {
          if (m.student_id === userRef.current?.id) {
            return { ...m, participation_count: m.participation_count + 1 };
          }
          return m;
        }),
      };
    });
  }, []);

  const loadWorkspace = useCallback(async (silent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    // Cancel any in-flight previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    if (!silent) setLoading(true);
    else setIsSyncing(true);

    try {
      const data = await groupWorkApi.getWorkspace(assessmentId);
      if (abortControllerRef.current.signal.aborted) return;

      setWorkspace(data);

      const isMember = data.members?.some((m: { student_id: string }) => m.student_id === userRef.current?.id);
      if (!isMember) {
        toast.error("You are not a member of this group workspace.");
        router.push("/student/dashboard");
        return;
      }

      if (!hasInitializedQuestion.current && data.questions?.length > 0) {
        setActiveQuestionId(data.questions[0].id);
        hasInitializedQuestion.current = true;
      }
      setLastSyncedAt(new Date());
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError" || abortControllerRef.current?.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Failed to load group workspace";
      if (!silent) {
        toast.error(message);
        router.push("/student/dashboard");
      } else {
        setSyncError(message);
      }
    } finally {
      isFetchingRef.current = false;
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false);
        setIsSyncing(false);
      }
    }
  }, [assessmentId, router]);

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = setInterval(() => {
      if (workspace?.submission_status === "SUBMITTED" || workspace?.submission_status === "GRADED") {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        return;
      }
      loadWorkspace(true);
    }, 10000);
  }, [loadWorkspace, workspace?.submission_status]);

  useEffect(() => {
    loadWorkspace();
    startPolling();
    
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      abortControllerRef.current?.abort();
    };
  }, [loadWorkspace, startPolling]);

  const handleSaveAnswer = async (qId: string, content: any, notes?: any) => {
    if (!workspace?.submission_id) {
      toast.error("Workspace is still initializing. Please wait a moment and try again.");
      return;
    }

    const question = workspace.questions.find((q: any) => q.id === qId);
    const qType = question?.type?.toLowerCase() || "";
    
    const isMcq = ["mcq", "multiple_choice", "truefalse", "true_false"].includes(qType);
    const isMultiSelect = ["multiselect", "multi_correct", "multi_select", "checkbox"].includes(qType);
    const isOrdering = ["ordering", "ordered_list"].includes(qType);
    const isMatching = ["matching", "match_pairs"].includes(qType);
    const isFillBlank = ["fill_blank", "fillblank", "fillblanks"].includes(qType);
    const isCaseStudy = ["casestudy", "case_study"].includes(qType);

    let formattedContent = null;
    if (content !== undefined && content !== null) {
      if (isMcq) {
        formattedContent = { selected_option_id: content };
      } else if (isMultiSelect) {
        formattedContent = { selected_option_ids: content };
      } else if (isOrdering) {
        formattedContent = { ordered_option_ids: content };
      } else if (isMatching) {
        formattedContent = { match_pairs_json: content };
      } else if (isFillBlank) {
        formattedContent = { fill_blank_answers: content };
      } else if (isCaseStudy) {
        formattedContent = { case_study_answers: content, text: typeof content === "object" ? JSON.stringify(content) : content };
      } else {
        formattedContent = { text: content };
      }
    }

    const formattedNotes = notes !== undefined && notes !== null
      ? { text: notes }
      : null;

    try {
      incrementLocalParticipation();
      await groupWorkApi.saveAnswer(assessmentId, workspace.submission_id, qId, {
        answer_content: formattedContent,
        notes_content: formattedNotes,
        change_source: "manual_edit"
      });
      await loadWorkspace(true);
      startPolling();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save shared answer";
      toast.error(message);
      throw err;
    }
  };

  const handlePostComment = async (body: string, qId?: string) => {
    if (!workspace?.submission_id) {
      toast.error("Workspace is still initializing. Please wait a moment and try again.");
      return;
    }
    try {
      incrementLocalParticipation();
      await groupWorkApi.addComment(assessmentId, workspace.submission_id, {
        body,
        question_id: qId
      });
      await loadWorkspace(true);
      startPolling();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to post comment";
      toast.error(message);
      throw err;
    }
  };

  const handleApprove = async (note?: string) => {
    if (!workspace?.submission_id) {
      toast.error("Workspace is still initializing. Please wait a moment and try again.");
      return;
    }
    try {
      await groupWorkApi.approveSubmission(assessmentId, workspace.submission_id, {
        status: "APPROVED",
        note
      });
      toast.success("Your approval has been recorded.");
      loadWorkspace(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to approve";
      toast.error(message);
    }
  };

  const handleReject = async (note: string) => {
    if (!workspace?.submission_id) {
      toast.error("Workspace is still initializing. Please wait a moment and try again.");
      return;
    }
    try {
      await groupWorkApi.approveSubmission(assessmentId, workspace.submission_id, {
        status: "CHANGES_REQUESTED",
        note
      });
      toast.warning("Change request recorded. Your team has been notified.");
      loadWorkspace(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to request changes";
      toast.error(message);
    }
  };

  const requestSubmit = async () => {
    setShowSubmitConfirm(true);
  };

  const handleSubmit = async () => {
    if (!workspace?.submission_id) return;
    setSubmitting(true);
    setSubmitConfirmError(null);
    try {
      await groupWorkApi.submitGroupWork(assessmentId, workspace.submission_id, {
        confirm: true
      });
      toast.success("Group assessment submitted successfully.");
      setWorkspace((prev: any) => prev ? { ...prev, submission_status: "SUBMITTED" } : null);
      setShowSubmitConfirm(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Submission failed";
      setSubmitConfirmError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeQuestion = useMemo(() => {
    return workspace?.questions?.find((q: any) => q.id === activeQuestionId);
  }, [workspace?.questions, activeQuestionId]);

  const currentAnswer = useMemo(() => {
    return workspace?.answers?.find((a: any) => a.question_id === activeQuestionId);
  }, [workspace?.answers, activeQuestionId]);

  const amLeader = useMemo(() => {
    return workspace?.members?.find((m: any) => m.student_id === user?.id)?.is_leader || false;
  }, [workspace?.members, user?.id]);

  const minParticipation = useMemo(() => {
    return workspace?.assessment?.min_participation_count ?? 1;
  }, [workspace?.assessment]);

  const myParticipation = useMemo(() => {
    return workspace?.members?.find(
      (m: any) => m.student_id === user?.id
    )?.participation_count || 0;
  }, [workspace?.members, user?.id]);

  const participationSatisfied = useMemo(() => {
    return myParticipation >= minParticipation;
  }, [myParticipation, minParticipation]);

  if (loading) {
    return (
      <div className="p-8 space-y-10 max-w-7xl mx-auto">
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
           <div className="md:col-span-8 space-y-6">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-[400px] w-full" />
           </div>
           <div className="md:col-span-4 space-y-6">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-[300px] w-full" />
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* TOP WORKSPACE NAV */}
      <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-md px-6 py-2.5 flex items-center justify-between">
         <div className="flex items-center gap-4">
           <Button variant="ghost" size="sm" onClick={() => router.push("/student/dashboard")} className="h-8 text-xs font-semibold gap-2">
             <LayoutDashboard className="size-4" /> Dashboard
           </Button>
           <Separator orientation="vertical" className="h-4" />
           <div className="flex items-center gap-2">
             <div className={cn(
                "size-2 rounded-full",
                syncError ? "bg-destructive animate-pulse" : "bg-emerald-500"
              )} />
             <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{syncError ? "Sync Offline" : "Workspace Active"}</span>
           </div>
         </div>

         <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
               {isSyncing && <Loader2 className="size-3.5 animate-spin text-primary" />}
               <span className={cn(
                  "text-[10px] font-bold uppercase tracking-widest",
                  syncError ? "text-destructive animate-pulse" : "text-muted-foreground"
                )}>
                 {isSyncing ? "Syncing..." : syncError ? "Sync Error" : "Workspace Synced"}
               </span>
            </div>
            <Button variant="outline" size="icon" onClick={() => loadWorkspace()} disabled={isSyncing} className="h-8 w-8 rounded-md">
               {isSyncing ? (
                 <Loader2 className="size-3.5 animate-spin" />
               ) : (
                 <RefreshCcw className="size-3.5" />
               )}
            </Button>
            <Separator orientation="vertical" className="h-4" />
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground">
               <HelpCircle className="size-4" />
            </Button>
         </div>
      </div>

      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
         {/* INTRO & CONTEXT */}
         <GroupIntroCard 
           assessment={workspace.assessment} 
           groupName={workspace.group_name} 
         />

         {/* Collaboration Info Banner */}
         <div className="p-4 rounded-xl border border-primary/10 bg-primary/5 flex items-start gap-3.5 transition-all duration-300">
           <BookOpen className="size-5 text-primary mt-0.5 opacity-85 shrink-0 animate-pulse" />
           <div className="space-y-1">
             <p className="text-xs font-bold text-primary">Real-Time Team Collaboration Mode</p>
             <p className="text-[11px] text-muted-foreground leading-relaxed max-w-4xl font-medium">
               You are currently working in a shared session. All answers, edits, and code segments are synced in real-time across all team members. Use the discussion section to coordinate, and remember to submit your approval when you are satisfied with the solutions.
             </p>
           </div>
         </div>

         {/* Sidebar Toggles Bar */}
         <div className="flex items-center justify-between border-b pb-3">
           <div className="flex items-center gap-2">
             <Button
               variant="outline"
               size="sm"
               onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
               className={cn(
                 "h-8 text-xs font-semibold gap-1.5 rounded-lg px-2.5",
                 leftSidebarOpen && "bg-primary/5 border-primary/20 text-primary"
               )}
             >
               <LayoutDashboard className="size-3.5" />
               {leftSidebarOpen ? "Hide Navigator" : "Show Navigator"}
             </Button>
             <Button
               variant="outline"
               size="sm"
               onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
               className={cn(
                 "h-8 text-xs font-semibold gap-1.5 rounded-lg px-2.5",
                 rightSidebarOpen && "bg-primary/5 border-primary/20 text-primary"
               )}
             >
               <Users className="size-3.5" />
               {rightSidebarOpen ? "Hide Oversight" : "Show Oversight"}
             </Button>
           </div>
           <Badge variant="secondary" className="font-bold uppercase tracking-wider text-[10px]">
             {workspace.questions.length} Questions
           </Badge>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT SIDEBAR: QUESTION LIST/NAVIGATOR */}
            {leftSidebarOpen && (
              <div className="lg:col-span-3 space-y-4 lg:sticky lg:top-24 max-h-[calc(100vh-140px)] overflow-hidden flex flex-col border rounded-xl p-4 bg-card shadow-sm animate-in slide-in-from-left duration-200">
                <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Navigator</h3>
                <div className="space-y-2 overflow-y-auto pr-1 flex-1">
                  {workspace.questions.map((q: any, idx: number) => {
                    const hasAnswer = workspace.answers.some((a: any) => a.question_id === q.id && a.answer_content);
                    const isActive = activeQuestionId === q.id;
                    const normalizedQType = q.type.toLowerCase().replace(/[^a-z0-9_]/g, "");
                    return (
                      <button
                        key={q.id}
                        onClick={() => setActiveQuestionId(q.id)}
                        className={cn(
                          "w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all relative group",
                          isActive 
                            ? "bg-primary/5 border-primary text-primary shadow-sm" 
                            : hasAnswer 
                              ? "bg-emerald-50/[0.15] border-emerald-500/25 hover:bg-emerald-500/[0.05]" 
                              : "bg-background border-border hover:bg-muted/40"
                        )}
                      >
                        <div className={cn(
                          "size-6 rounded-md flex items-center justify-center text-[10px] font-black shrink-0",
                          isActive 
                            ? "bg-primary text-primary-foreground" 
                            : hasAnswer 
                              ? "bg-emerald-500 text-white" 
                              : "bg-muted text-muted-foreground"
                        )}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-xs font-bold truncate leading-none",
                            isActive ? "text-primary" : "text-foreground"
                          )}>
                            {q.text}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">
                              {normalizedQType.replace("_", " ")}
                            </span>
                            <span className="text-[9px] font-medium text-muted-foreground/40">•</span>
                            <span className="text-[9px] font-bold text-muted-foreground/80">
                              {q.marks} Marks
                            </span>
                          </div>
                        </div>
                        {hasAnswer && !isActive && (
                          <div className="absolute right-3 top-3.5 size-2 rounded-full bg-emerald-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CENTER: MAIN EDITOR WORK AREA */}
            <div className={cn(
              "space-y-6",
              (leftSidebarOpen && rightSidebarOpen) 
                ? "lg:col-span-6" 
                : (leftSidebarOpen || rightSidebarOpen) 
                  ? "lg:col-span-9" 
                  : "lg:col-span-12"
            )}>
               <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                     <h2 className="text-base font-bold tracking-wider uppercase flex items-center gap-2">
                        <FileText className="size-4 text-primary" />
                        Collaboration Deck
                     </h2>
                  </div>

                  <div className="space-y-6">
                     {/* Collaborative Editor */}
                     {activeQuestion ? (
                       <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                         <GroupAnswerEditor 
                           question={activeQuestion}
                           answer={currentAnswer}
                           onSave={handleSaveAnswer}
                           currentUserId={user?.id || ""}
                         />
                       </div>
                     ) : (
                       <div className="p-16 border border-dashed rounded-2xl flex flex-col items-center justify-center text-center gap-4 bg-muted/5">
                         <BookOpen className="size-10 text-muted-foreground opacity-45" />
                         <div className="space-y-1">
                           <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Select a Question</h3>
                           <p className="text-xs text-muted-foreground max-w-xs">
                             Please click a question from the navigator to load and begin collaborating.
                           </p>
                         </div>
                       </div>
                     )}
                  </div>
               </div>
            </div>

            {/* RIGHT SIDEBAR: OVERSIGHT & STATUS */}
            {rightSidebarOpen && (
              <div className="lg:col-span-3 space-y-6 lg:sticky lg:top-24 max-h-[calc(100vh-140px)] overflow-y-auto pr-1 animate-in slide-in-from-right duration-200">
                 {/* APPROVAL GATEWAY */}
                 <GroupApprovalPanel 
                   myStatus={workspace.members.find((m: any) => m.student_id === user?.id)?.approval_status || "PENDING"}
                   approvalCount={workspace.members.filter((m: any) => m.approval_status === "APPROVED").length}
                   totalMembers={workspace.members.length}
                   onApprove={handleApprove}
                   onReject={handleReject}
                   onSubmit={requestSubmit}
                   isLeader={amLeader}
                   canSubmit={!!workspace.can_submit}
                   participationSatisfied={participationSatisfied}
                 />

                 {/* TEAM MEMBERS */}
                 <GroupMembersPanel 
                   members={workspace.members.map((m: any) => ({
                      id: m.student_id,
                      name: m.student_name,
                      is_leader: m.is_leader,
                      participation_count: m.participation_count,
                      approval_status: m.approval_status,
                      is_online: m.is_online
                   }))}
                   requireApproval={workspace.assessment.require_all_member_approval}
                 />

                 {/* AUDIT TRAIL */}
                 <GroupActivityFeed activities={workspace.activities ?? []} />
              </div>
            )}
         </div>
      </div>

      {/* Floating Chat Trigger Button */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="fixed bottom-6 right-6 z-50 size-14 rounded-full bg-primary hover:bg-primary/95 text-primary-foreground flex items-center justify-center shadow-2xl transition-transform active:scale-95 group border-2 border-background"
      >
        <MessageSquare className="size-6 transition-transform group-hover:scale-110" />
        {workspace?.comments && workspace.comments.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-6 h-6 px-1.5 rounded-full bg-destructive text-white text-[10px] font-black flex items-center justify-center border-2 border-background shadow-md">
            {workspace.comments.length}
          </span>
        )}
      </button>

      {/* Floating Slide-out Chat Panel */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
          <div 
            className="absolute inset-0 bg-black/20 backdrop-blur-xs pointer-events-auto transition-opacity duration-300"
            onClick={() => setChatOpen(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-[420px] max-w-full bg-background border-l shadow-2xl pointer-events-auto flex flex-col animate-in slide-in-from-right duration-350">
            <div className="py-3 px-4 border-b flex items-center justify-between bg-muted/15">
              <div className="flex items-center gap-2">
                <MessageSquare className="size-4 text-primary" />
                <h3 className="font-bold text-xs uppercase tracking-wider">Group Chat & Discussion</h3>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setChatOpen(false)}
                className="h-8 text-xs font-semibold px-2 rounded-lg"
              >
                Close
              </Button>
            </div>
            <div className="flex-1 overflow-hidden">
              <GroupCommentsPanel 
                 comments={workspace.comments ?? []}
                 onPostComment={handlePostComment}
                 currentUserId={user?.id || ""}
                 activeQuestionId={activeQuestionId || undefined}
              />
            </div>
          </div>
        </div>
      )}

      <Dialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <DialogContent className="sm:max-w-sm p-6 border-none shadow-xl rounded-xl bg-background space-y-4">
          <DialogTitle className="text-base font-bold text-center">
            Submit Group Assessment?
          </DialogTitle>
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            This will finalize your group&apos;s submission for{" "}
            <strong>{workspace?.assessment?.title}</strong>. Once submitted, all inputs will be locked for grading.
          </p>

          {workspace && (
            <div className="p-3.5 bg-muted/40 rounded-xl text-left border border-border/40 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">Team Approval Progress</span>
              <div className="flex items-center justify-between text-xs font-bold">
                <span>{workspace.members.filter((m: any) => m.approval_status === "APPROVED").length} of {workspace.members.length} members approved</span>
                <span className="text-primary">{Math.round((workspace.members.filter((m: any) => m.approval_status === "APPROVED").length / workspace.members.length) * 100)}%</span>
              </div>
              {workspace.assessment?.require_all_member_approval && (
                <p className="text-[10px] text-amber-600 font-semibold leading-relaxed">
                  * Note: Institutional policy requires approval from all members.
                </p>
              )}
            </div>
          )}

          {submitConfirmError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-left flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-xs text-destructive leading-relaxed">
                <span className="font-semibold block mb-0.5">Submission Failed</span>
                {submitConfirmError}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              disabled={submitting}
              className="flex-1 h-10 text-xs rounded-lg"
              onClick={() => setShowSubmitConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={submitting}
              className="flex-1 h-10 text-xs rounded-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={handleSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Submitting...
                </>
              ) : (
                "Confirm & Submit"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Locked Overlay if submitted */}
      {(workspace?.submission_status === "SUBMITTED" || workspace?.submission_status === "GRADED") && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
          <div className="max-w-md p-8 rounded-2xl border bg-card shadow-2xl space-y-6">
            <div className="size-16 rounded-full bg-success/15 text-success flex items-center justify-center mx-auto">
              <Check className="size-8 text-emerald-600" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Submission Completed</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This group workspace has been finalized and submitted for grading. Edits, comments, and approvals are now locked.
              </p>
            </div>
            <div className="flex flex-col gap-2.5 w-full">
              <Button onClick={() => router.push("/student/results")} className="w-full h-10 text-xs font-semibold rounded-lg">
                View Results & Submissions
              </Button>
              <Button onClick={() => router.push("/student/dashboard")} variant="outline" className="w-full h-10 text-xs font-semibold rounded-lg">
                Return to Dashboard
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
