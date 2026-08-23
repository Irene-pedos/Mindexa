// app/student/assessments/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Calendar,
  Clock,
  BookOpen,
  CheckCircle2,
  ShieldAlert,
  History,
  TimerOff,
  SearchIcon,
  Lock,
  ArrowRight,
  HelpCircle,
  FileText,
  AlertCircle,
  Zap,
  XCircle,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { ContextualExplainer } from "@/components/mindexa/common/contextual-explainer";
import { cn, formatAssessmentType } from "@/lib/utils";
import { assessmentApi } from "@/lib/api/assessment";
import { notificationApi } from "@/lib/api/notification";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import {
  getAssessmentProgressStatus,
  getAssessmentCategory,
} from "@/lib/grading-architecture";
import { format } from "date-fns";

function CountdownBadge({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  
  useEffect(() => {
    const target = new Date(expiresAt).getTime();
    
    const update = () => {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        setTimeLeft("Expired");
        return;
      }
      
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}m ${secs}s`);
    };
    
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  
  if (timeLeft === "Expired") {
    return <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 font-bold uppercase tracking-wider">Expired</Badge>;
  }
  return (
    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 px-2 py-0.5 flex items-center gap-1 font-mono font-semibold">
      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
      {timeLeft}
    </Badge>
  );
}

export default function StudentAssessmentsPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTab, setFilterTab] = useState<string>("active");
  const [visitedTabs, setVisitedTabs] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  
  // Pagination & checklist modal states
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;
  const [selectedAssessmentForStart, setSelectedAssessmentForStart] = useState<any | null>(null);
  const [checklistAgreed, setChecklistAgreed] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [assessData, notifData] = await Promise.all([
          assessmentApi.getAssessments({ page, page_size: pageSize }),
          notificationApi.getNotifications(true).catch(() => ({ items: [] })),
        ]);
        setAssessments(assessData.items || []);
        setTotal(assessData.total || 0);
        setNotifications((notifData as any)?.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [page]);

  const hasNewInCategory = (tab: string) => {
    if (visitedTabs.includes(tab)) return false;
    
    if (tab === "active") {
      return assessments.some(a => {
        const cat = getAssessmentCategory(a);
        return (cat === "ACTIVE" || cat === "IN_PROGRESS") && 
               notifications.some(n => (n.reference_id === a.id || n.reference_id === a.student_attempt_id) && !n.is_read);
      });
    }
    if (tab === "upcoming") {
      return assessments.some(a => {
        const cat = getAssessmentCategory(a);
        return cat === "UPCOMING" && 
               notifications.some(n => (n.reference_id === a.id || n.reference_id === a.student_attempt_id) && !n.is_read);
      });
    }
    if (tab === "submitted") {
      return assessments.some(a => {
        const cat = getAssessmentCategory(a);
        return (cat === "SUBMITTED" || cat === "GRADED") && 
               notifications.some(n => (n.reference_id === a.id || n.reference_id === a.student_attempt_id) && !n.is_read);
      });
    }
    return false;
  };

  const filteredAssessments = assessments.filter((ass) => {
    const category = getAssessmentCategory(ass);
    const matchesSearch =
      ass.title?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const matchesType =
      filterType === "all" || ass.assessment_type?.toLowerCase() === filterType.toLowerCase();

    const matchesTab = () => {
      if (filterTab === "active")
        return category === "ACTIVE" || category === "IN_PROGRESS";
      if (filterTab === "upcoming") return category === "UPCOMING";
      if (filterTab === "submitted")
        return category === "SUBMITTED" || category === "GRADED";
      if (filterTab === "missed") return category === "MISSED";
      if (filterTab === "violations") return category === "VIOLATION";
      return true;
    };

    return matchesSearch && matchesType && matchesTab();
  });

  const getAssessmentTypeLabel = (type: string, assessment?: any) => {
    if (!type) return "";
    return formatAssessmentType(type, {
      integrity_monitoring_enabled: assessment?.integrity_monitoring_enabled,
      is_supervised: assessment?.is_supervised,
      allow_resume: assessment?.allow_resume,
    });
  };

  const getStatusInfo = (assessment: any) => {
    const category = getAssessmentCategory(assessment);
    const progressStatus = getAssessmentProgressStatus(assessment);

    if (category === "VIOLATION") {
      return {
        label: "Violation",
        variant: "destructive" as const,
        color: "bg-destructive/10 text-destructive border-destructive/20",
        available: false,
        icon: <ShieldAlert className="size-3 shrink-0" />,
      };
    }

    if (category === "SUBMITTED" || category === "GRADED") {
      return {
        label: progressStatus.label,
        variant: "outline" as const,
        color:
          progressStatus.tone === "success"
            ? "bg-success/10 text-success border-success/20"
            : progressStatus.tone === "warning"
              ? "bg-warning/10 text-warning border-warning/15"
              : "bg-primary/10 text-primary border-primary/20",
        available: false,
        icon: progressStatus.tone === "success" ? <CheckCircle2 className="size-3 shrink-0" /> : <Clock className="size-3 shrink-0" />,
      };
    }

    if (category === "MISSED") {
      return {
        label: "Missed",
        variant: "outline" as const,
        color: "bg-muted text-muted-foreground border-muted-foreground/35",
        available: false,
        icon: <TimerOff className="size-3 shrink-0" />,
      };
    }

    if (category === "UPCOMING") {
      const start = new Date(assessment.window_start);
      return {
        label: `Opens ${format(start, "MMM d, HH:mm")}`,
        variant: "secondary" as const,
        color: "bg-secondary text-secondary-foreground border-transparent",
        available: false,
        icon: <Calendar className="size-3 shrink-0" />,
      };
    }

    return {
      label: category === "IN_PROGRESS" ? "Continue" : "Available",
      variant: category === "IN_PROGRESS" ? "default" : ("default" as const),
      color: category === "IN_PROGRESS" ? "bg-primary text-primary-foreground" : "",
      available: true,
      icon: category === "IN_PROGRESS" ? <span className="size-1.5 rounded-full bg-primary-foreground animate-pulse shrink-0" /> : <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />,
    };
  };

  const renderAssessmentCard = (assessment: any) => {
    const status = getStatusInfo(assessment);
    const category = getAssessmentCategory(assessment);
    const isSupervised = assessment.is_supervised;
    const remainingAttempts = Math.max(0, assessment.max_attempts - (assessment.attempts_used || 0));

    return (
      <Card
        key={assessment.id}
        className={cn(
          "shadow-sm border border-border/45 hover:border-primary/20 hover:shadow-md transition-all duration-300 rounded-xl overflow-hidden bg-card/30 hover:bg-card/45 backdrop-blur-sm",
          category === "VIOLATION" && "border-destructive/30 bg-destructive/5 hover:border-destructive/50"
        )}
      >
        <div className="flex flex-col md:flex-row">
          <div className="flex-1 py-3.5 px-5 space-y-3.5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <h3 className="text-base font-semibold text-foreground tracking-tight">
                    {assessment.title}
                  </h3>
                  {category === "IN_PROGRESS" && assessment.student_attempt_expires_at && (
                    <CountdownBadge expiresAt={assessment.student_attempt_expires_at} />
                  )}
                  {category === "IN_PROGRESS" && !assessment.student_attempt_expires_at && (
                    <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                  {isSupervised && (
                    <Badge variant="outline" className="text-[9px] uppercase font-bold px-1.5 h-4.5 flex items-center gap-1 border-primary/20 bg-primary/5 text-primary">
                      <Lock className="size-2.5" /> Supervised
                    </Badge>
                  )}
                  {assessment.is_password_protected && (
                    <Badge variant="outline" className="text-[9px] bg-warning/5 text-warning border-warning/15 px-1.5 h-4.5 flex items-center gap-1 font-semibold">
                      <Lock className="size-2.5" /> Password Required
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <BookOpen className="size-3.5 opacity-70" />
                  <span>{assessment.course_code || "GEN-001"} - {assessment.subject || assessment.course_name || "General"}</span>
                  <span className="text-muted-foreground/30">•</span>
                  <span>{getAssessmentTypeLabel(assessment.assessment_type, assessment)}</span>
                </div>
              </div>
              <Badge variant={status.variant} className={cn("text-xs font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 capitalize shadow-none border", status.color)}>
                {status.icon}
                {status.label}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <Calendar className="size-3.5 opacity-60 text-muted-foreground" />
                <span>{assessment.window_start ? format(new Date(assessment.window_start), "MMM d, yyyy • HH:mm") : "Open window"}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <Clock className="size-3.5 opacity-60 text-muted-foreground" />
                <span>{assessment.duration_minutes || 90} mins</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <History className="size-3.5 opacity-60 text-muted-foreground" />
                <span>{assessment.attempts_used || 0} / {assessment.max_attempts} Attempts ({remainingAttempts} left)</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <BookOpen className="size-3.5 opacity-60 text-muted-foreground" />
                <span>
                  {assessment.is_open_book ? "Open Book" : "Closed Book"}
                  {assessment.ai_assistance_allowed ? " (AI Allowed)" : " (No AI)"}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground/80 font-medium">
              {assessment.late_submission_allowed ? (
                <span className="text-success font-semibold">Late submission is eligible for this assessment.</span>
              ) : (
                <span className="text-destructive font-semibold">Late submissions are not allowed.</span>
              )}
            </div>
          </div>

          <div className="bg-muted/20 border-t md:border-t-0 md:border-l border-border/40 p-4 flex items-center justify-between md:justify-center md:flex-col gap-3.5 min-w-[160px]">
            <div className="text-center md:mb-1">
              <div className="text-sm font-semibold tabular-nums text-foreground">{assessment.total_marks || 100} Points</div>
              <div className="text-xs text-muted-foreground/75 font-medium">Assessment Weight</div>
            </div>

            {category === "SUBMITTED" || category === "GRADED" || category === "VIOLATION" ? (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 text-xs font-semibold px-4 rounded-lg border-border/60 w-full hover:bg-muted/50 transition-colors" 
                disabled={!assessment.student_attempt_id}
                asChild={!!assessment.student_attempt_id}
              >
                {assessment.student_attempt_id ? (
                  <Link href={`/student/results/${assessment.student_attempt_id}`} className="flex items-center justify-center gap-1">
                    {category === "VIOLATION" ? "Audit Log" : "View Results"} <ArrowRight className="size-3" />
                  </Link>
                ) : (
                  <span>Results Pending</span>
                )}
              </Button>
            ) : (
              <Button 
                size="sm" 
                className="h-8 text-xs font-semibold px-4 rounded-lg shadow-none w-full transition-all" 
                disabled={!status.available} 
                variant={status.available ? "default" : "secondary"}
                onClick={() => {
                  if (status.available) {
                    if (assessment.assessment_type?.toUpperCase() === "GROUP_WORK") {
                      router.push(`/student/group-work/${assessment.id}`);
                    } else {
                      setSelectedAssessmentForStart(assessment);
                      setChecklistAgreed(false);
                    }
                  }
                }}
              >
                {status.available ? (
                  category === "IN_PROGRESS" ? "Resume" : "Start Test"
                ) : (
                  <span className="flex items-center gap-1.5 justify-center"><TimerOff className="size-3.5" /> Locked</span>
                )}
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  };
  const getCount = (tab: string) => {
    return assessments.filter((a) => {
      const category = getAssessmentCategory(a);
      if (tab === "active") return category === "ACTIVE" || category === "IN_PROGRESS";
      if (tab === "upcoming") return category === "UPCOMING";
      if (tab === "submitted") return category === "SUBMITTED" || category === "GRADED";
      if (tab === "missed") return category === "MISSED";
      if (tab === "violations") return category === "VIOLATION";
      return false;
    }).length;
  };

  const getEmptyMessage = () => {
    if (filterTab === "active") return "No active assessments at the moment. You're all caught up!";
    if (filterTab === "upcoming") return "No upcoming assessments scheduled. Check back later.";
    if (filterTab === "submitted") return "You haven't submitted any assessments yet.";
    if (filterTab === "missed") return "Great! You haven't missed any assessments.";
    if (filterTab === "violations") return "No integrity violations recorded. Keep up the honest work!";
    return "No assessments identified in this category.";
  };



  return (
    <div data-tour="student-assessments" className="space-y-5 w-full mx-auto animate-in fade-in duration-300">
      {/* Precision Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border/25">
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">My Evaluations</h1>
          <p className="text-xs text-muted-foreground font-medium">Manage and track your active, upcoming, and completed academic tasks.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative w-full sm:w-60">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/55" />
            <Input
              placeholder="Search assessments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-8.5 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-36 h-8.5 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
              <SelectValue placeholder="Assessment Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Types</SelectItem>
              <SelectItem value="CAT" className="text-xs">CAT</SelectItem>
              <SelectItem value="formative" className="text-xs">Formative</SelectItem>
              <SelectItem value="summative" className="text-xs">Summative</SelectItem>
              <SelectItem value="homework" className="text-xs">Homework</SelectItem>
              <SelectItem value="group_work" className="text-xs">Group Work</SelectItem>
              <SelectItem value="reassessment" className="text-xs">Reassessment</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={filterTab} onValueChange={(v) => { setFilterTab(v); if (!visitedTabs.includes(v)) setVisitedTabs([...visitedTabs, v]); }} className="w-full">
        <TabsList className="h-auto p-1 flex-wrap">
          <TabsTrigger value="active" className="relative">
            <Zap className="size-3.5" />
            Active
            <span className="ml-1 opacity-70 font-normal text-[10px]">({getCount("active")})</span>
            {hasNewInCategory("active") && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-red-400 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="relative">
            <Calendar className="size-3.5" />
            Upcoming
            <span className="ml-1 opacity-70 font-normal text-[10px]">({getCount("upcoming")})</span>
            {hasNewInCategory("upcoming") && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-red-400 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="submitted" className="relative">
            <CheckCircle2 className="size-3.5" />
            Submitted
            <span className="ml-1 opacity-70 font-normal text-[10px]">({getCount("submitted")})</span>
            {hasNewInCategory("submitted") && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-red-400 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="missed">
            <TimerOff className="size-3.5" />
            Missed
            <span className="ml-1 opacity-70 font-normal text-[10px]">({getCount("missed")})</span>
          </TabsTrigger>
          <TabsTrigger value="violations" className="data-[state=active]:bg-destructive">
            <XCircle className="size-3.5" />
            Violations
            <span className="ml-1 opacity-70 font-normal text-[10px]">({getCount("violations")})</span>
          </TabsTrigger>
        </TabsList>

        <div className="space-y-3 pt-3">
          {loading ? (
            [1, 2, 3].map((i) => (
              <Skeleton key={i} variant="media" className="h-24 w-full rounded-xl" />
            ))
          ) : filteredAssessments.length > 0 ? (
            filteredAssessments.map(renderAssessmentCard)
          ) : (
            <div className="py-14 text-center border-2 border-dashed rounded-xl bg-muted/5 border-border/30">
              <p className="text-xs font-semibold text-muted-foreground">{getEmptyMessage()}</p>
            </div>
          )}
        </div>
      </Tabs>

      {/* Pagination Controls */}
      {total > pageSize && (
        <div className="flex items-center justify-between pt-3 border-t border-border/20">
          <p className="text-xs text-muted-foreground font-medium">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} assessments
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="h-8 text-xs font-medium px-3 rounded-lg border-border/60"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={page * pageSize >= total}
              className="h-8 text-xs font-medium px-3 rounded-lg border-border/60"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Integrity Notice - Compact */}
      <div className="p-3.5 rounded-xl border border-warning/15 bg-warning/5 flex items-start gap-3 transition-all duration-300">
        <ShieldAlert className="size-4.5 text-warning mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-warning">Integrity Protocol Notice</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-4xl font-medium">
            High-security testing environments enforce strict environment locking. Switching tabs or applications will register as a violation, which may result in session termination and immediate automated submission.
          </p>
        </div>
      </div>

      {/* Pre-flight Checklist Modal - Larger size & scrollable */}
      <Dialog 
        open={!!selectedAssessmentForStart} 
        onOpenChange={(open) => { if (!open) setSelectedAssessmentForStart(null); }}
      >
        {(() => {
          const typeStr = (selectedAssessmentForStart?.assessment_type || selectedAssessmentForStart?.type || "").toUpperCase();
          const isHomework = typeStr === "HOMEWORK";
          const isPractice =
            typeStr === "FORMATIVE" &&
            selectedAssessmentForStart?.integrity_monitoring_enabled === false;
          const isOpen = isHomework || isPractice;

          return (
            <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto p-6 rounded-2xl border border-border bg-card">
              <DialogHeader className="space-y-1">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                    {isHomework ? (
                      <>
                        <BookOpen className="size-4.5 text-emerald-600" />
                        <span>Homework Evaluation Check-in</span>
                      </>
                    ) : isPractice ? (
                      <>
                        <Sparkles className="size-4.5 text-blue-500" />
                        <span>Practice Session Check-in</span>
                      </>
                    ) : (
                      <span>Pre-flight Security Check-in</span>
                    )}
                  </DialogTitle>
                  <ContextualExplainer topic="start-assessment" variant="pill" label="What to expect?" />
                </div>
                <DialogDescription className="text-xs text-muted-foreground">
                  {isHomework 
                    ? "Please review the homework guidelines and submission window before beginning."
                    : isPractice
                      ? "This is an open practice session. You are free to reference materials, use AI assistance, and pause at any time."
                      : "Please review the following requirements before starting the assessment."}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3.5 my-3">
                {isOpen ? (
                  <>
                    {/* Open Environment */}
                    <div className="flex items-start gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                      <BookOpen className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 flex-1">
                        <p className="text-xs font-semibold text-foreground">Open Resource Environment</p>
                        <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                          {isPractice
                            ? "You are free to reference textbooks, notes, search the web, and use any study resources."
                            : "You are free to research, reference course notes, textbooks, and approved academic materials while completing this homework."}
                        </p>
                      </div>
                    </div>

                    {/* AI Study Assistant */}
                    <div className="flex items-start gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
                      <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-0.5 flex-1">
                        <p className="text-xs font-semibold text-foreground">AI Study Assistant Enabled</p>
                        <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                          An interactive AI Study Tutor is available directly in your workspace to explain concepts and search your course materials with citations.
                        </p>
                      </div>
                    </div>

                    {/* Pause & Resume */}
                    <div className="flex items-start gap-3 p-3 rounded-xl border border-border/40 bg-muted/10">
                      <RotateCcw className="size-4 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-0.5 flex-1">
                        <p className="text-xs font-semibold text-foreground">
                          {isPractice ? "Self-Paced (Pause & Resume)" : "Take-Home Flexibility (Pause & Resume)"}
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                          {isPractice
                            ? "You can pause, exit, and resume your practice session at any time — there is no time penalty."
                            : "You can save your progress, exit, and resume your homework session anytime before the final submission deadline."}
                        </p>
                      </div>
                    </div>

                    {/* No Integrity Monitoring */}
                    <div className="flex items-start gap-3 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5">
                      <CheckCircle2 className="size-4 text-blue-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 flex-1">
                        <p className="text-xs font-semibold text-foreground">No Integrity Monitoring</p>
                        <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                          Tab switching, copy/paste, window blur, and browser focus changes are not monitored and will not trigger warnings.
                        </p>
                      </div>
                    </div>

                    {/* Submission Deadline (homework only) */}
                    {isHomework && (
                      <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                        <Clock className="size-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="space-y-0.5 flex-1">
                          <p className="text-xs font-semibold text-foreground">Submission Deadline & Auto-Finalize</p>
                          <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                            Ensure all answers are submitted before the assessment window closes. When the deadline arrives, your attempt will automatically finalize and submit.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Fullscreen Rules */}
                    <div className="flex items-start gap-3 p-3 rounded-xl border border-border/40 bg-muted/10">
                      <ShieldAlert className="size-4 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-0.5 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-foreground">Fullscreen Environment</p>
                          <ContextualExplainer topic="fullscreen-integrity" variant="icon" />
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                          {selectedAssessmentForStart?.fullscreen_required 
                            ? "This exam enforces lock-down fullscreen. You must not exit fullscreen mode." 
                            : "Standard environment monitoring is active. Do not close the browser."}
                        </p>
                      </div>
                    </div>

                    {/* Tab Switching Rules */}
                    <div className="flex items-start gap-3 p-3 rounded-xl border border-border/40 bg-muted/10">
                      <ShieldAlert className="size-4 text-red-500 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-foreground">Tab and App Switching Prohibited</p>
                        <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                          Switching tabs, opening developer tools, or resizing the window registers as a violation. Multiple violations will cause automatic submission.
                        </p>
                      </div>
                    </div>

                    {/* Attempt Limits */}
                    <div className="flex items-start gap-3 p-3 rounded-xl border border-border/40 bg-muted/10">
                      <History className="size-4 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-foreground">Attempt Tracking</p>
                        <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                          Attempt {Math.min(selectedAssessmentForStart?.max_attempts, (selectedAssessmentForStart?.attempts_used || 0) + 1)} of {selectedAssessmentForStart?.max_attempts}. 
                          Remaining attempts: {Math.max(0, (selectedAssessmentForStart?.max_attempts || 1) - (selectedAssessmentForStart?.attempts_used || 0))}.
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* Checkbox Agreement */}
                <div className="flex items-start gap-2.5 pt-1">
                  <Checkbox 
                    id="integrity-agree" 
                    checked={checklistAgreed} 
                    onCheckedChange={(checked) => setChecklistAgreed(!!checked)}
                    className="mt-0.5 border-border/70"
                  />
                  <Label htmlFor="integrity-agree" className="text-xs text-muted-foreground leading-normal font-medium cursor-pointer">
                    {isHomework 
                      ? "I understand the homework guidelines and submission deadline. I am ready to begin."
                      : isPractice
                        ? "I understand this is an open practice session. I am ready to begin."
                        : "I understand and agree to the academic integrity protocols. I am ready to begin this supervised assessment."}
                  </Label>
                </div>
              </div>

              <DialogFooter className="flex sm:justify-end gap-2 pt-2 border-t border-border/40">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setSelectedAssessmentForStart(null)}
                  className="h-8.5 text-xs font-medium rounded-lg border-border/60"
                >
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  disabled={!checklistAgreed}
                  onClick={() => {
                    if (selectedAssessmentForStart) {
                      router.push(`/student/assessments/${selectedAssessmentForStart.id}/take`);
                      setSelectedAssessmentForStart(null);
                    }
                  }}
                  className="h-8.5 text-xs font-semibold rounded-lg shadow-none"
                >
                  {isHomework ? "Start Homework" : isPractice ? "Start Practice" : "Start Assessment"}
                </Button>
              </DialogFooter>
            </DialogContent>
          );
        })()}
      </Dialog>
    </div>
  );
}


