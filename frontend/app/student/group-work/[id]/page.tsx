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
  Check,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  MessageSquare,
  BookOpen,
  FileText,
  Users,
  ShieldCheck,
  Clock,
  Sparkles,
  CheckCircle2,
  XCircle,
  Activity,
  Layers,
  Info,
  ShieldAlert,
  Send,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { format, formatDistanceToNow } from "date-fns";

import { groupWorkApi } from "@/lib/api/group-work";
import { GroupAnswerEditor } from "@/components/mindexa/group-work/group-answer-editor";
import { GroupCommentsPanel } from "@/components/mindexa/group-work/group-comments-panel";
import { GroupApprovalPanel } from "@/components/mindexa/group-work/group-approval-panel";
import { GroupMembersPanel } from "@/components/mindexa/group-work/group-members-panel";
import { GroupActivityFeed } from "@/components/mindexa/group-work/group-activity-feed";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ContextualExplainer } from "@/components/mindexa/common/contextual-explainer";

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
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<"approval" | "chat" | "members">("approval");
  const [filterQuestionState, setFilterQuestionState] = useState<"all" | "unanswered" | "answered">("all");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);

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
            return { ...m, participation_count: (m.participation_count || 0) + 1 };
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
      setSyncError(null);
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

  const activeQuestionIndex = useMemo(() => {
    if (!workspace?.questions) return -1;
    return workspace.questions.findIndex((q: any) => q.id === activeQuestionId);
  }, [workspace?.questions, activeQuestionId]);

  const activeQuestion = useMemo(() => {
    return workspace?.questions?.find((q: any) => q.id === activeQuestionId);
  }, [workspace?.questions, activeQuestionId]);

  const currentAnswer = useMemo(() => {
    return workspace?.answers?.find((a: any) => a.question_id === activeQuestionId);
  }, [workspace?.answers, activeQuestionId]);

  const answeredQuestionsCount = useMemo(() => {
    if (!workspace?.questions || !workspace?.answers) return 0;
    return workspace.questions.filter((q: any) => 
      workspace.answers.some((a: any) => a.question_id === q.id && a.answer_content)
    ).length;
  }, [workspace?.questions, workspace?.answers]);

  const totalQuestionsCount = workspace?.questions?.length || 0;
  const progressPercentage = totalQuestionsCount > 0 ? Math.round((answeredQuestionsCount / totalQuestionsCount) * 100) : 0;

  const amLeader = useMemo(() => {
    return workspace?.members?.find((m: any) => m.student_id === user?.id)?.is_leader || false;
  }, [workspace?.members, user?.id]);

  const minParticipation = useMemo(() => {
    return workspace?.assessment?.min_participation_count ?? 1;
  }, [workspace?.assessment]);

  const myMemberRecord = useMemo(() => {
    return workspace?.members?.find((m: any) => m.student_id === user?.id);
  }, [workspace?.members, user?.id]);

  const myParticipation = myMemberRecord?.participation_count || 0;
  const participationSatisfied = myParticipation >= minParticipation;

  const approvedMembersCount = useMemo(() => {
    return workspace?.members?.filter((m: any) => m.approval_status === "APPROVED").length || 0;
  }, [workspace?.members]);

  const totalMembersCount = workspace?.members?.length || 0;
  const consensusPercentage = totalMembersCount > 0 ? Math.round((approvedMembersCount / totalMembersCount) * 100) : 0;

  const deadlineDate = workspace?.assessment?.window_end ? new Date(workspace.assessment.window_end) : null;
  const isUrgent = deadlineDate && (deadlineDate.getTime() - Date.now()) < 24 * 60 * 60 * 1000;

  const filteredQuestions = useMemo(() => {
    if (!workspace?.questions) return [];
    return workspace.questions.filter((q: any) => {
      const hasAnswer = workspace.answers?.some((a: any) => a.question_id === q.id && a.answer_content);
      if (filterQuestionState === "answered") return hasAnswer;
      if (filterQuestionState === "unanswered") return !hasAnswer;
      return true;
    });
  }, [workspace?.questions, workspace?.answers, filterQuestionState]);

  const handleNextQuestion = () => {
    if (!workspace?.questions || activeQuestionIndex === -1) return;
    if (activeQuestionIndex < workspace.questions.length - 1) {
      setActiveQuestionId(workspace.questions[activeQuestionIndex + 1].id);
    }
  };

  const handlePrevQuestion = () => {
    if (!workspace?.questions || activeQuestionIndex === -1) return;
    if (activeQuestionIndex > 0) {
      setActiveQuestionId(workspace.questions[activeQuestionIndex - 1].id);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="h-14 border-b bg-card px-6 flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <div className="flex gap-3">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <div className="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-12 gap-6">
          <div className="col-span-3 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
          <div className="col-span-6 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="col-span-3 space-y-4">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-primary/10">
      {/* 1. ULTRA-SLEEK GLASSMORPHIC STUDIO HEADER */}
      <header className="sticky top-0 z-40 h-14 border-b border-border/40 bg-background/90 backdrop-blur-xl px-4 lg:px-6 flex items-center justify-between shadow-xs">
        {/* Left branding & assessment info */}
        <div className="flex items-center gap-3 min-w-0">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.push("/student/dashboard")} 
            className="h-8 px-2 text-xs font-semibold gap-1.5 text-muted-foreground hover:text-foreground rounded-lg"
          >
            <ArrowLeft className="size-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>

          <Separator orientation="vertical" className="h-4 bg-border/60 hidden sm:block" />

          <div className="flex items-center gap-2 min-w-0">
            <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
              <Users className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xs sm:text-sm font-bold text-foreground truncate max-w-[200px] sm:max-w-[320px]">
                  {workspace?.assessment?.title}
                </h1>
                <Badge variant="outline" className="hidden md:inline-flex text-[10px] font-mono font-bold uppercase tracking-wider h-5 bg-muted/40 border-border/60">
                  {workspace?.group_name}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground truncate hidden sm:block font-medium">
                {workspace?.assessment?.course_name} ({workspace?.assessment?.course_code})
              </p>
            </div>
          </div>
        </div>

        {/* Center Live Sync Status Indicator */}
        <div className="hidden lg:flex items-center gap-3 bg-muted/20 border border-border/40 py-1 px-3 rounded-full text-[11px] font-medium">
          <span className="relative flex size-2">
            <span className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              syncError ? "bg-rose-400" : isSyncing ? "bg-amber-400" : "bg-emerald-400"
            )} />
            <span className={cn(
              "relative inline-flex rounded-full size-2",
              syncError ? "bg-rose-500" : isSyncing ? "bg-amber-500" : "bg-emerald-500"
            )} />
          </span>
          <span className="font-semibold text-foreground/80">
            {isSyncing ? "Syncing changes…" : syncError ? "Sync offline" : "Real-time Studio Active"}
          </span>
          {lastSyncedAt && !syncError && (
            <span className="text-[10px] text-muted-foreground/60 border-l border-border/40 pl-2">
              Updated {format(lastSyncedAt, "HH:mm:ss")}
            </span>
          )}
        </div>

        {/* Right workspace controls & quick actions */}
        <div className="flex items-center gap-2">
          {/* Instructions Modal Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInstructionsModal(true)}
            className="h-8 text-xs font-semibold gap-1.5 rounded-lg border-border/60 text-muted-foreground hover:text-foreground"
          >
            <BookOpen className="size-3.5 text-primary" />
            <span className="hidden sm:inline">Brief & Rules</span>
          </Button>

          {/* Refresh button */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => loadWorkspace(false)} 
            disabled={isSyncing} 
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
            title="Refresh shared workspace state"
          >
            <RefreshCcw className={cn("size-3.5", isSyncing && "animate-spin text-primary")} />
          </Button>

          <Separator orientation="vertical" className="h-4 bg-border/60" />

          {/* Quick Panels Toggles */}
          <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border border-border/40">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
              className={cn(
                "h-7 px-2 text-[11px] font-semibold gap-1 rounded-md transition-colors",
                leftSidebarOpen ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
              title="Toggle Question Navigator"
            >
              <Layers className="size-3" />
              <span className="hidden xl:inline">Navigator</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              className={cn(
                "h-7 px-2 text-[11px] font-semibold gap-1 rounded-md transition-colors",
                rightSidebarOpen ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
              title="Toggle Team Hub"
            >
              <Users className="size-3" />
              <span className="hidden xl:inline">Team Hub</span>
              {workspace?.comments && workspace.comments.length > 0 && (
                <span className="size-1.5 rounded-full bg-primary" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* 2. HIGH-DENSITY COLLABORATION SUB-BAR */}
      <div className="bg-muted/10 border-b border-border/30 px-4 lg:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Progress indicator */}
        <div className="flex items-center gap-3 min-w-[220px]">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-foreground font-mono">{answeredQuestionsCount}</span>
            <span className="text-muted-foreground font-medium">/ {totalQuestionsCount} Answered</span>
          </div>
          <div className="w-28 sm:w-36">
            <Progress value={progressPercentage} className="h-1.5 bg-muted/60" />
          </div>
          <span className="text-[10px] font-bold text-primary font-mono">{progressPercentage}%</span>
        </div>

        {/* Center: Online team members snippet */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground hidden md:inline">
            Team:
          </span>
          <div className="flex -space-x-2 items-center">
            {workspace?.members?.map((m: any) => (
              <div 
                key={m.student_id} 
                className="relative group cursor-pointer"
                title={`${m.student_name} (${m.is_online ? "Online" : "Offline"}) • ${m.participation_count || 0} contributions`}
              >
                <Avatar className="size-7 border-2 border-background ring-1 ring-border/40 bg-muted">
                  <AvatarImage src={m.avatar_url} />
                  <AvatarFallback className="text-[10px] font-bold">
                    {m.student_name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {m.is_online && (
                  <span className="absolute bottom-0 right-0 size-2 bg-emerald-500 rounded-full ring-1 ring-background" />
                )}
                {m.is_leader && (
                  <span className="absolute -top-1 -right-1 size-3 bg-amber-500 text-white rounded-full flex items-center justify-center text-[8px] font-black shadow-xs">
                    ★
                  </span>
                )}
              </div>
            ))}
          </div>
          <Badge 
            variant="secondary" 
            className="text-[10px] font-bold uppercase tracking-wider h-5 bg-background border border-border/60 ml-1"
          >
            {approvedMembersCount}/{totalMembersCount} Approved
          </Badge>
        </div>

        {/* Right: Deadline & Submission readiness */}
        <div className="flex items-center gap-3">
          <Badge 
            variant="outline" 
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider h-6 px-2.5 border",
              isUrgent 
                ? "bg-rose-500/10 text-rose-600 border-rose-500/30 animate-pulse" 
                : "bg-background text-muted-foreground border-border/60"
            )}
          >
            <Clock className="size-3 mr-1 text-current" />
            {deadlineDate ? `Due ${format(deadlineDate, "MMM d, HH:mm")}` : "No Deadline"}
          </Badge>

          {workspace?.can_submit && amLeader && (
            <Button
              size="sm"
              onClick={requestSubmit}
              className="h-7 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-3 rounded-lg shadow-sm"
            >
              <Check className="size-3.5 mr-1" /> Final Submit
            </Button>
          )}
        </div>
      </div>

      {/* 3. MAIN WORKSPACE 3-PANE STUDIO LAYOUT */}
      <main className="flex-1 w-full max-w-[1720px] mx-auto p-3 sm:p-4 lg:p-5 flex flex-col">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 items-stretch">
          
          {/* ◄ LEFT PANE: QUESTIONS NAVIGATOR */}
          {leftSidebarOpen && (
            <aside className="lg:col-span-3 xl:col-span-3 flex flex-col rounded-2xl border border-border/40 bg-card shadow-xs overflow-hidden max-h-[calc(100vh-145px)] sticky top-20">
              {/* Navigator Header & Filter */}
              <div className="p-3.5 border-b border-border/30 bg-muted/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-primary" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Question Queue
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-muted-foreground">
                    {filteredQuestions.length} Total
                  </span>
                </div>

                {/* Question Filter Tabs */}
                <div className="grid grid-cols-3 gap-1 bg-muted/40 p-1 rounded-lg border border-border/30 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setFilterQuestionState("all")}
                    className={cn(
                      "py-1 rounded-md transition-all text-center",
                      filterQuestionState === "all" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterQuestionState("answered")}
                    className={cn(
                      "py-1 rounded-md transition-all text-center",
                      filterQuestionState === "answered" ? "bg-background text-emerald-600 shadow-xs" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Done ({answeredQuestionsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterQuestionState("unanswered")}
                    className={cn(
                      "py-1 rounded-md transition-all text-center",
                      filterQuestionState === "unanswered" ? "bg-background text-amber-600 shadow-xs" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Pending
                  </button>
                </div>
              </div>

              {/* Questions List */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 divide-y divide-border/10">
                {filteredQuestions.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground italic">
                    No questions matching filter.
                  </div>
                ) : (
                  filteredQuestions.map((q: any, idx: number) => {
                    const hasAnswer = workspace.answers?.some((a: any) => a.question_id === q.id && a.answer_content);
                    const isActive = activeQuestionId === q.id;
                    const normalizedQType = q.type.toLowerCase().replace(/[^a-z0-9_]/g, "");

                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setActiveQuestionId(q.id)}
                        className={cn(
                          "w-full flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all relative group",
                          isActive 
                            ? "bg-primary/5 border-primary/60 text-primary shadow-xs ring-1 ring-primary/20" 
                            : hasAnswer 
                              ? "bg-emerald-500/[0.03] border-emerald-500/20 hover:bg-emerald-500/[0.08]" 
                              : "bg-background border-border/40 hover:bg-muted/40"
                        )}
                      >
                        {/* Question Index Badge */}
                        <div className={cn(
                          "size-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 transition-transform group-hover:scale-105",
                          isActive 
                            ? "bg-primary text-primary-foreground shadow-xs" 
                            : hasAnswer 
                              ? "bg-emerald-500 text-white" 
                              : "bg-muted text-muted-foreground"
                        )}>
                          {hasAnswer && !isActive ? <Check className="size-3 stroke-[3]" /> : idx + 1}
                        </div>

                        {/* Question Text & Metadata */}
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-xs font-bold truncate leading-snug",
                            isActive ? "text-primary" : "text-foreground"
                          )}>
                            {q.text}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">
                              {normalizedQType.replace("_", " ")}
                            </span>
                            <span className="text-[9px] text-muted-foreground/40">•</span>
                            <span className="text-[9px] font-mono font-bold text-muted-foreground/80">
                              {q.marks} pts
                            </span>
                          </div>
                        </div>

                        {/* Status marker */}
                        {hasAnswer && !isActive && (
                          <span className="size-1.5 rounded-full bg-emerald-500 shrink-0 mt-2" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </aside>
          )}

          {/* ▼ CENTER PANE: COLLABORATIVE ANSWER EDITOR & WORKBENCH */}
          <div className={cn(
            "flex flex-col gap-4 min-w-0",
            (leftSidebarOpen && rightSidebarOpen) 
              ? "lg:col-span-6 xl:col-span-6" 
              : (leftSidebarOpen || rightSidebarOpen) 
                ? "lg:col-span-9 xl:col-span-9" 
                : "lg:col-span-12 xl:col-span-12"
          )}>
            {/* Main Question Card Area */}
            {activeQuestion ? (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                {/* Active Question Bar */}
                <div className="flex items-center justify-between bg-card p-3.5 rounded-2xl border border-border/40 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="size-7 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-xs font-black">
                      Q{activeQuestionIndex + 1}
                    </span>
                    <div>
                      <span className="text-xs font-bold text-foreground">
                        Question {activeQuestionIndex + 1} of {totalQuestionsCount}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-2 font-mono">
                        ({activeQuestion.marks} Mark{activeQuestion.marks > 1 ? "s" : ""})
                      </span>
                    </div>
                  </div>

                  {/* Previous / Next Quick Jump buttons */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevQuestion}
                      disabled={activeQuestionIndex <= 0}
                      className="h-7 px-2 text-xs font-semibold rounded-lg border-border/50"
                    >
                      <ChevronLeft className="size-3.5" />
                      <span className="hidden sm:inline">Prev</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextQuestion}
                      disabled={activeQuestionIndex >= totalQuestionsCount - 1}
                      className="h-7 px-2 text-xs font-semibold rounded-lg border-border/50"
                    >
                      <span className="hidden sm:inline">Next</span>
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Editor Component */}
                <div className="rounded-2xl border border-border/40 bg-card shadow-xs overflow-hidden">
                  <GroupAnswerEditor 
                    question={activeQuestion}
                    answer={currentAnswer}
                    onSave={handleSaveAnswer}
                    currentUserId={user?.id || ""}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-[420px] rounded-2xl border-2 border-dashed border-border/60 bg-muted/5 flex flex-col items-center justify-center p-8 text-center gap-3">
                <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <BookOpen className="size-6" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h3 className="text-sm font-bold text-foreground">Select a Question</h3>
                  <p className="text-xs text-muted-foreground">
                    Click any question from the left queue to open the shared workspace and begin contributing.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ► RIGHT PANE: INTEGRATED TEAM HUB (APPROVALS, CHAT, MEMBERS) */}
          {rightSidebarOpen && (
            <aside className="lg:col-span-3 xl:col-span-3 flex flex-col rounded-2xl border border-border/40 bg-card shadow-xs overflow-hidden max-h-[calc(100vh-145px)] sticky top-20">
              {/* Tab Navigation Header */}
              <div className="p-2 border-b border-border/30 bg-muted/10">
                <Tabs value={activeRightTab} onValueChange={(val: any) => setActiveRightTab(val)} className="w-full">
                  <TabsList className="w-full grid grid-cols-3 h-8 bg-muted/40 p-0.5 rounded-lg">
                    <TabsTrigger value="approval" className="text-[11px] font-bold rounded-md py-1">
                      <ShieldCheck className="size-3 mr-1 text-primary" />
                      Sign-off
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="text-[11px] font-bold rounded-md py-1 relative">
                      <MessageSquare className="size-3 mr-1 text-primary" />
                      Chat
                      {workspace?.comments && workspace.comments.length > 0 && (
                        <span className="ml-1 size-1.5 rounded-full bg-primary" />
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="members" className="text-[11px] font-bold rounded-md py-1">
                      <Users className="size-3 mr-1 text-primary" />
                      Team
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Tab Contents */}
              <div className="flex-1 overflow-y-auto p-3">
                {activeRightTab === "approval" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <GroupApprovalPanel 
                      myStatus={myMemberRecord?.approval_status || "PENDING"}
                      approvalCount={approvedMembersCount}
                      totalMembers={totalMembersCount}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onSubmit={requestSubmit}
                      isLeader={amLeader}
                      canSubmit={!!workspace?.can_submit}
                      participationSatisfied={participationSatisfied}
                    />
                  </div>
                )}

                {activeRightTab === "chat" && (
                  <div className="h-[480px] animate-in fade-in duration-200 flex flex-col">
                    <GroupCommentsPanel 
                      comments={workspace.comments ?? []}
                      onPostComment={handlePostComment}
                      currentUserId={user?.id || ""}
                      activeQuestionId={activeQuestionId || undefined}
                    />
                  </div>
                )}

                {activeRightTab === "members" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <GroupMembersPanel 
                      members={workspace.members.map((m: any) => ({
                        id: m.student_id,
                        name: m.student_name,
                        avatar_url: m.avatar_url,
                        is_leader: m.is_leader,
                        participation_count: m.participation_count,
                        approval_status: m.approval_status,
                        is_online: m.is_online
                      }))}
                      requireApproval={workspace?.assessment?.require_all_member_approval}
                    />

                    <Separator className="bg-border/40" />

                    <GroupActivityFeed activities={workspace.activities ?? []} />
                  </div>
                )}
              </div>
            </aside>
          )}

        </div>
      </main>

      {/* 4. MODAL: ASSESSMENT BRIEF & INSTRUCTIONS */}
      <Dialog open={showInstructionsModal} onOpenChange={setShowInstructionsModal}>
        <DialogContent className="sm:max-w-xl rounded-2xl p-6 border-border/40 bg-background shadow-xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
              <BookOpen className="size-4" /> Assessment Guidelines & Brief
            </div>
            <DialogTitle className="text-lg font-bold text-foreground">
              {workspace?.assessment?.title}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {workspace?.assessment?.course_name} ({workspace?.assessment?.course_code})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs max-h-[60vh] overflow-y-auto pr-1">
            {workspace?.assessment?.description && (
              <div className="p-3.5 rounded-xl bg-muted/20 border border-border/40 space-y-1">
                <h4 className="font-bold text-foreground text-[11px] uppercase tracking-wider">Description</h4>
                <p className="text-muted-foreground leading-relaxed">{workspace.assessment.description}</p>
              </div>
            )}

            {workspace?.assessment?.instructions && (
              <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-1">
                <h4 className="font-bold text-primary text-[11px] uppercase tracking-wider">Lecturer Instructions</h4>
                <p className="text-foreground/90 italic leading-relaxed">&quot;{workspace.assessment.instructions}&quot;</p>
              </div>
            )}

            {/* Quick Rules Grid */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-3 rounded-xl border border-border/40 bg-card space-y-1">
                <span className="font-bold text-muted-foreground block text-[10px] uppercase">Leader Approval Policy</span>
                <span className="font-semibold text-foreground">
                  {workspace?.assessment?.require_all_member_approval ? "Consensus required from all members" : "Leader can submit directly"}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-border/40 bg-card space-y-1">
                <span className="font-bold text-muted-foreground block text-[10px] uppercase">Min. Contribution</span>
                <span className="font-semibold text-foreground">
                  {minParticipation} action{minParticipation > 1 ? "s" : ""} per member
                </span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 5. MODAL: FINAL SUBMISSION CONFIRMATION */}
      <Dialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <DialogContent className="sm:max-w-md p-6 border-border/40 shadow-2xl rounded-2xl bg-background space-y-4">
          <DialogHeader>
            <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-1">
              <ShieldCheck className="size-6" />
            </div>
            <DialogTitle className="text-base font-bold text-center">
              Submit Group Assessment?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground text-center leading-relaxed">
              You are about to finalize and lock the submission for <strong>{workspace?.assessment?.title}</strong> on behalf of your group.
            </DialogDescription>
          </DialogHeader>

          {workspace && (
            <div className="p-3.5 bg-muted/30 rounded-xl text-left border border-border/40 space-y-2 text-xs">
              <div className="flex items-center justify-between font-semibold">
                <span className="text-muted-foreground">Team Sign-off</span>
                <span className="text-emerald-600 font-bold">{approvedMembersCount} of {totalMembersCount} Members ({consensusPercentage}%)</span>
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span className="text-muted-foreground">Questions Answered</span>
                <span className="font-bold text-foreground">{answeredQuestionsCount} of {totalQuestionsCount}</span>
              </div>
              {workspace.assessment?.require_all_member_approval && approvedMembersCount < totalMembersCount && (
                <p className="text-[11px] text-amber-600 font-medium pt-1">
                  * Note: Institutional policy requires 100% member consensus before submission.
                </p>
              )}
            </div>
          )}

          {submitConfirmError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-left flex items-start gap-2.5">
              <AlertTriangle className="size-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-600 leading-relaxed">
                <span className="font-bold block">Submission Blocked</span>
                {submitConfirmError}
              </div>
            </div>
          )}

          <div className="flex gap-2.5 pt-2">
            <Button
              variant="outline"
              disabled={submitting}
              className="flex-1 h-9 text-xs rounded-xl border-border/60"
              onClick={() => setShowSubmitConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={submitting}
              className="flex-1 h-9 text-xs rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
              onClick={handleSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Submitting…
                </>
              ) : (
                "Confirm & Submit"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 6. SUBMISSION LOCKED SCREEN */}
      {(workspace?.submission_status === "SUBMITTED" || workspace?.submission_status === "GRADED") && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
          <div className="max-w-md p-8 rounded-3xl border border-border/40 bg-card shadow-2xl space-y-6">
            <div className="size-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto ring-8 ring-emerald-500/5">
              <Check className="size-8 stroke-[3]" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-foreground">Group Assessment Submitted</h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your team&apos;s responses have been locked and submitted for lecturer review and grading.
              </p>
            </div>
            <div className="flex flex-col gap-2.5 w-full pt-2">
              <Button onClick={() => router.push("/student/results")} className="w-full h-9 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground">
                View Results & Submissions
              </Button>
              <Button onClick={() => router.push("/student/dashboard")} variant="outline" className="w-full h-9 text-xs font-semibold rounded-xl border-border/60">
                Return to Dashboard
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

