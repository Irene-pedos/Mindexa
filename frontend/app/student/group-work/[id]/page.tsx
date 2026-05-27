// app/student/group-work/[id]/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
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

export default function StudentGroupWorkWorkspace() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.id as string;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [workspace, setWorkspace] = useState<any>(null);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);

  const loadWorkspace = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsSyncing(true);
    
    try {
      const data = await groupWorkApi.getWorkspace(assessmentId);
      setWorkspace(data);
      
      // Default to first question if none active
      if (!activeQuestionId && data.questions && data.questions.length > 0) {
        setActiveQuestionId(data.questions[0].id);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load group workspace");
      router.push("/student/dashboard");
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, [assessmentId, router, activeQuestionId]);

  useEffect(() => {
    loadWorkspace();
    
    // Polling for collaborative updates
    const interval = setInterval(() => {
      loadWorkspace(true);
    }, 10000); // Sync every 10 seconds
    
    return () => clearInterval(interval);
  }, [loadWorkspace]);

  const handleSaveAnswer = async (qId: string, content: any, notes?: any) => {
    try {
      await groupWorkApi.saveAnswer(assessmentId, workspace.submission_id, qId, {
        answer_content: content,
        notes_content: notes,
        change_source: "manual_edit"
      });
      loadWorkspace(true);
    } catch (err: any) {
      toast.error("Failed to save shared answer");
      throw err;
    }
  };

  const handlePostComment = async (body: string, qId?: string) => {
    try {
      await groupWorkApi.addComment(assessmentId, workspace.submission_id, {
        body,
        question_id: qId
      });
      loadWorkspace(true);
    } catch (err: any) {
      toast.error("Failed to post comment");
      throw err;
    }
  };

  const handleApprove = async (note?: string) => {
    try {
      await groupWorkApi.approveSubmission(assessmentId, workspace.submission_id, {
        status: "APPROVED",
        note
      });
      toast.success("Digital signature applied");
      loadWorkspace(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to approve");
    }
  };

  const handleReject = async (note: string) => {
    try {
      await groupWorkApi.approveSubmission(assessmentId, workspace.submission_id, {
        status: "REJECTED",
        note
      });
      toast.warning("Changes requested successfully");
      loadWorkspace(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to request changes");
    }
  };

  const handleSubmit = async () => {
    try {
      await groupWorkApi.submitGroupWork(assessmentId, workspace.submission_id, {
        confirm: true
      });
      toast.success("Assessment submitted successfully!");
      router.push("/student/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Submission failed");
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
  const participationSatisfied = (workspace.members.find((m: any) => m.student_id === user?.id)?.participation_count || 0) > 0;

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
             <div className="size-2 rounded-full bg-emerald-500" />
             <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Workspace Active</span>
           </div>
         </div>

         <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
               {isSyncing && <div className="size-3.5 rounded-full bg-primary/20 animate-pulse" />}
               <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                 {isSyncing ? "Syncing..." : "Workspace Synced"}
               </span>
            </div>
            <Button variant="outline" size="icon" onClick={() => loadWorkspace()} disabled={isSyncing} className="h-8 w-8 rounded-md">
               {isSyncing ? (
                 <div className="size-3.5 rounded-full bg-primary/10 animate-pulse" />
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
                                     ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" 
                                     : "bg-background border-border hover:bg-muted text-muted-foreground"
                               )}
                             >
                               {idx + 1}
                               {hasAnswer && !isActive && (
                                 <div className="absolute -top-1 -right-1 size-3 bg-emerald-500 rounded-full border-2 border-background" />
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
                 onSubmit={handleSubmit}
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
    </div>
  );
}
