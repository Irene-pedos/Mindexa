// app/student/group-work/[id]/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Loader2, 
  ArrowLeft, 
  RefreshCcw, 
  HelpCircle,
  LayoutDashboard,
  Monitor,
  Check,
  ChevronRight
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

  const hasInitializedQuestion = useRef(false);
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

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

  useEffect(() => {
    loadWorkspace();
    
    // Polling for collaborative updates
    const interval = setInterval(() => {
      loadWorkspace(true);
    }, 10000); // Sync every 10 seconds
    
    return () => {
      clearInterval(interval);
      abortControllerRef.current?.abort();
    };
  }, [loadWorkspace]);

  const handleSaveAnswer = async (qId: string, content: any, notes?: any) => {
    if (!workspace?.submission_id) {
      toast.error("Workspace is still initializing. Please wait a moment and try again.");
      return;
    }

    const question = workspace.questions.find((q: any) => q.id === qId);
    const qType = question?.type?.toLowerCase() || "";
    const isMcq = ["mcq", "multiple_choice", "truefalse", "true_false"].includes(qType);

    const formattedContent = content !== undefined && content !== null
      ? (isMcq ? { selected_option_id: content } : { text: content })
      : null;

    const formattedNotes = notes !== undefined && notes !== null
      ? { text: notes }
      : null;

    try {
      await groupWorkApi.saveAnswer(assessmentId, workspace.submission_id, qId, {
        answer_content: formattedContent,
        notes_content: formattedNotes,
        change_source: "manual_edit"
      });
      loadWorkspace(true);
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
      await groupWorkApi.addComment(assessmentId, workspace.submission_id, {
        body,
        question_id: qId
      });
      loadWorkspace(true);
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
    setShowSubmitConfirm(false);
    try {
      await groupWorkApi.submitGroupWork(assessmentId, workspace.submission_id, {
        confirm: true
      });
      toast.success("Group assessment submitted successfully.");
      router.push(`/student/results`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Submission failed";
      toast.error(message);
    }
  };

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

  const activeQuestion = workspace.questions.find((q: any) => q.id === activeQuestionId);
  const currentAnswer = workspace.answers.find((a: any) => a.question_id === activeQuestionId);
  const amLeader = workspace.members.find((m: any) => m.student_id === user?.id)?.is_leader || false;
  const minParticipation = workspace.assessment?.min_participation_count ?? 1;
  const myParticipation = workspace.members.find(
    (m: { student_id: string }) => m.student_id === user?.id
  )?.participation_count || 0;
  const participationSatisfied = myParticipation >= minParticipation;

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
             <div className="size-2 rounded-full bg-success" />
             <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Workspace Active</span>
           </div>
         </div>

         <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
               {isSyncing && <Loader2 className="size-3.5 animate-spin text-primary" />}
               <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                 {isSyncing ? "Syncing..." : "Workspace Synced"}
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

      <div className="max-w-7xl mx-auto p-6 space-y-10">
         {/* INTRO & CONTEXT */}
         <GroupIntroCard 
           assessment={workspace.assessment} 
           groupName={workspace.group_name} 
         />

         {/* Collaboration Info Banner */}
         <div className="p-4 rounded-xl border border-primary/10 bg-primary/5 flex items-start gap-3.5 transition-all duration-300">
           <Monitor className="size-5 text-primary mt-0.5 opacity-85 shrink-0 animate-pulse" />
           <div className="space-y-1">
             <p className="text-xs font-bold text-primary">Real-Time Team Collaboration Mode</p>
             <p className="text-[11px] text-muted-foreground leading-relaxed max-w-4xl font-medium">
               You are currently working in a shared session. All answers, edits, and code segments are synced in real-time across all team members. Use the discussion section to coordinate, and remember to submit your approval when you are satisfied with the solutions.
             </p>
           </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* LEFT: MAIN WORK AREA */}
            <div className="lg:col-span-8 space-y-10">
               <div className="space-y-6">
                  <div className="flex items-center justify-between border-b pb-4">
                     <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                        <Monitor className="size-5 text-primary" />
                        Collaboration Deck
                     </h2>
                     <Badge variant="secondary" className="font-bold">
                        {workspace.questions.length} Questions
                     </Badge>
                  </div>

                  <div className="space-y-6">
                     {/* Question Navigator */}
                     <div className="flex flex-wrap gap-2 p-1.5 bg-muted/30 rounded-lg border">
                        {workspace.questions.map((q: any, idx: number) => {
                           const hasAnswer = workspace.answers.some((a: any) => a.question_id === q.id && a.answer_content);
                           const isActive = activeQuestionId === q.id;
                           return (
                             <button
                               key={q.id}
                               onClick={() => setActiveQuestionId(q.id)}
                               className={cn(
                                 "size-9 rounded-md border text-xs font-bold transition-all flex items-center justify-center relative",
                                 isActive 
                                   ? "bg-primary border-primary text-primary-foreground shadow-sm" 
                                   : hasAnswer 
                                     ? "bg-success/[0.03] border-success/20 text-success hover:bg-success/10" 
                                     : "bg-background border-border hover:bg-muted text-muted-foreground"
                               )}
                             >
                               {idx + 1}
                               {hasAnswer && !isActive && (
                                 <div className="absolute -top-1 -right-1 size-3 bg-success rounded-full border-2 border-background" />
                               )}
                             </button>
                           );
                        })}
                     </div>

                     {/* Collaborative Editor */}
                     {activeQuestion && (
                       <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                         <GroupAnswerEditor 
                           question={activeQuestion}
                           answer={currentAnswer}
                           onSave={handleSaveAnswer}
                           currentUserId={user?.id || ""}
                         />
                       </div>
                     )}
                  </div>
               </div>

               {/* DISCUSSION SECTION */}
               <GroupCommentsPanel 
                  comments={workspace.comments}
                  onPostComment={handlePostComment}
                  currentUserId={user?.id || ""}
                  activeQuestionId={activeQuestionId || undefined}
               />
            </div>

            {/* RIGHT: OVERSIGHT & STATUS */}
            <div className="lg:col-span-4 space-y-8 sticky top-24">
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
               <div className="h-[400px]">
                 <GroupActivityFeed activities={workspace.activities} />
               </div>
            </div>
         </div>
      </div>

      <Dialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <DialogContent className="sm:max-w-sm p-6 border-none shadow-xl rounded-xl bg-background">
          <DialogTitle className="text-base font-semibold text-center">
            Submit Group Assessment?
          </DialogTitle>
          <p className="text-xs text-muted-foreground text-center mt-2 mb-5 leading-relaxed">
            This will finalize your group&apos;s submission for{" "}
            <strong>{workspace?.assessment?.title}</strong>. This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-9 text-xs rounded-lg"
              onClick={() => setShowSubmitConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 h-9 text-xs rounded-lg"
              onClick={handleSubmit}
            >
              Confirm & Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
