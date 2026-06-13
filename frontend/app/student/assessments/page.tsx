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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { assessmentApi } from "@/lib/api/assessment";
import { apiClient } from "@/lib/api/client";
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
    return <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">Expired</Badge>;
  }
  return (
    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 px-1.5 py-0.5 flex items-center gap-1 font-mono">
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
          apiClient("/notifications/me?unread_only=true")
        ]);
        setAssessments(assessData.items || []);
        setTotal(assessData.total || 0);
        setNotifications(notifData.items || []);
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

  const getAssessmentTypeLabel = (type: string) => {
    if (!type) return "";
    return type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
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
      };
    }

    if (category === "SUBMITTED" || category === "GRADED") {
      return {
        label: progressStatus.label,
        variant: "outline" as const,
        color:
          progressStatus.tone === "success"
            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
            : progressStatus.tone === "warning"
              ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
              : "bg-blue-500/10 text-blue-600 border-blue-500/20",
        available: false,
      };
    }

    if (category === "MISSED") {
      return {
        label: "Missed",
        variant: "outline" as const,
        color: "bg-muted text-muted-foreground border-muted-foreground/35",
        available: false,
      };
    }

    if (category === "UPCOMING") {
      const start = new Date(assessment.window_start);
      return {
        label: `Opens ${format(start, "MMM d, HH:mm")}`,
        variant: "secondary" as const,
        color: "bg-secondary text-secondary-foreground border-transparent",
        available: false,
      };
    }

    return {
      label: category === "IN_PROGRESS" ? "Continue" : "Available",
      variant: category === "IN_PROGRESS" ? "default" : ("default" as const),
      color: category === "IN_PROGRESS" ? "bg-primary text-primary-foreground" : "",
      available: true,
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
          "shadow-none border border-border/50 hover:bg-muted/10 transition-all duration-300 rounded-xl overflow-hidden bg-card/30",
          category === "VIOLATION" && "border-destructive/30 bg-destructive/5 hover:border-destructive/50"
        )}
      >
        <div className="flex flex-col md:flex-row">
          <div className="flex-1 p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-base font-medium text-foreground">
                    {assessment.title}
                  </h3>
                  {category === "IN_PROGRESS" && assessment.student_attempt_expires_at && (
                    <CountdownBadge expiresAt={assessment.student_attempt_expires_at} />
                  )}
                  {category === "IN_PROGRESS" && !assessment.student_attempt_expires_at && (
                    <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                  {isSupervised && (
                    <Badge variant="outline" className="text-[9px] uppercase font-medium px-1.5 h-4.5 flex items-center gap-1">
                      <Lock className="size-2.5" /> Supervised
                    </Badge>
                  )}
                  {assessment.is_password_protected && (
                    <Badge variant="outline" className="text-[9px] bg-amber-500/5 text-amber-600 border-amber-500/20 px-1.5 h-4.5 flex items-center gap-1 font-medium">
                      <Lock className="size-2.5" /> Password Required
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <BookOpen className="size-3.5 opacity-70" />
                  <span>{assessment.course_code || "GEN-001"} - {assessment.subject || assessment.course_name || "General"}</span>
                  <span className="text-muted-foreground/30">•</span>
                  <span>{getAssessmentTypeLabel(assessment.assessment_type)}</span>
                </div>
              </div>
              <Badge variant={status.variant} className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full capitalize shadow-none border", status.color)}>
                {status.label}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
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
                <span className="text-emerald-600 font-medium">Late submission is eligible for this assessment.</span>
              ) : (
                <span className="text-red-500/90 font-medium">Late submissions are not allowed.</span>
              )}
            </div>
          </div>

          <div className="bg-muted/20 border-t md:border-t-0 md:border-l border-border/40 p-5 flex items-center justify-between md:justify-center md:flex-col gap-4 min-w-[160px]">
            <div className="text-center md:mb-1">
              <div className="text-sm font-medium tabular-nums text-foreground">{assessment.total_marks || 100} Points</div>
              <div className="text-xs text-muted-foreground/70">Assessment Weight</div>
            </div>

            {category === "SUBMITTED" || category === "GRADED" || category === "VIOLATION" ? (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 text-xs font-medium px-4 rounded-lg border-border/60 w-full" 
                disabled={!assessment.student_attempt_id}
                asChild={!!assessment.student_attempt_id}
              >
                {assessment.student_attempt_id ? (
                  <Link href={`/student/results/${assessment.student_attempt_id}`}>
                    {category === "VIOLATION" ? "Audit Log" : "View Results"}
                  </Link>
                ) : (
                  <span>Results Pending</span>
                )}
              </Button>
            ) : (
              <Button 
                size="sm" 
                className="h-8 text-xs font-medium px-4 rounded-lg shadow-none w-full" 
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
    <div className="space-y-6">
      {/* Precision Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/40">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Assessments</h1>
          <p className="text-sm text-muted-foreground">Manage and track your active, upcoming, and completed academic evaluations.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative w-full sm:w-60">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/55" />
            <Input
              placeholder="Search assessments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-sm rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-36 h-9 text-sm rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
              <SelectValue placeholder="Assessment Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-sm">All Types</SelectItem>
              <SelectItem value="CAT" className="text-sm">CAT</SelectItem>
              <SelectItem value="formative" className="text-sm">Formative</SelectItem>
              <SelectItem value="summative" className="text-sm">Summative</SelectItem>
              <SelectItem value="homework" className="text-sm">Homework</SelectItem>
              <SelectItem value="group_work" className="text-sm">Group Work</SelectItem>
              <SelectItem value="reassessment" className="text-sm">Reassessment</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={filterTab} onValueChange={(v) => { setFilterTab(v); if (!visitedTabs.includes(v)) setVisitedTabs([...visitedTabs, v]); }} className="w-full">
        <TabsList className="bg-muted/30 p-1 rounded-xl w-full md:w-fit h-11 overflow-x-auto justify-start border border-border/40 shadow-none">
          <TabsTrigger value="active" className="text-xs font-medium px-4 py-2 rounded-lg relative transition-all">
            Active <span className="ml-1.5 bg-muted-foreground/10 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground">{getCount("active")}</span>
            {hasNewInCategory("active") && <span className="absolute top-1 right-2 size-1.5 rounded-full bg-red-500 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="text-xs font-medium px-4 py-2 rounded-lg relative transition-all">
            Upcoming <span className="ml-1.5 bg-muted-foreground/10 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground">{getCount("upcoming")}</span>
            {hasNewInCategory("upcoming") && <span className="absolute top-1 right-2 size-1.5 rounded-full bg-red-500 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="submitted" className="text-xs font-medium px-4 py-2 rounded-lg relative transition-all">
            Submitted <span className="ml-1.5 bg-muted-foreground/10 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground">{getCount("submitted")}</span>
            {hasNewInCategory("submitted") && <span className="absolute top-1 right-2 size-1.5 rounded-full bg-red-500 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="missed" className="text-xs font-medium px-4 py-2 rounded-lg transition-all">
            Missed <span className="ml-1.5 bg-muted-foreground/10 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground">{getCount("missed")}</span>
          </TabsTrigger>
          <TabsTrigger value="violations" className="text-xs font-medium px-4 py-2 rounded-lg transition-all data-[state=active]:text-destructive data-[state=active]:bg-destructive/10">
            Violations <span className="ml-1.5 bg-destructive/15 px-1.5 py-0.5 rounded text-[10px] text-destructive-foreground/90">{getCount("violations")}</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-4 space-y-3">
          {loading ? (
            [1, 2, 3].map((i) => (
              <Skeleton key={i} variant="media" className="h-24 w-full rounded-xl" />
            ))
          ) : filteredAssessments.length > 0 ? (
            filteredAssessments.map(renderAssessmentCard)
          ) : (
            <div className="py-16 text-center border-2 border-dashed rounded-xl bg-muted/5 border-border/30">
              <p className="text-sm font-medium text-muted-foreground">{getEmptyMessage()}</p>
            </div>
          )}
        </div>
      </Tabs>

      {/* Pagination Controls */}
      {total > pageSize && (
        <div className="flex items-center justify-between pt-4 border-t border-border/40">
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
      <div className="p-4 rounded-xl border border-primary/15 bg-primary/5 flex items-start gap-3.5 transition-all duration-300">
        <ShieldAlert className="size-5 text-primary mt-0.5 opacity-85 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-primary">Integrity Protocol Notice</p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl font-medium">
            High-security testing environments enforce strict environment locking. Switching tabs or applications will register as a violation, which may result in session termination and immediate automated submission.
          </p>
        </div>
      </div>

      {/* Pre-flight Checklist Modal */}
      <Dialog 
        open={!!selectedAssessmentForStart} 
        onOpenChange={(open) => { if (!open) setSelectedAssessmentForStart(null); }}
      >
        <DialogContent className="max-w-md p-6 rounded-xl border border-border bg-card">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base font-semibold text-foreground">
              Pre-flight Security Check-in
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Please review the following requirements before starting the assessment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4">
            {/* Fullscreen Rules */}
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-muted/10">
              <ShieldAlert className="size-4.5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-foreground">Fullscreen Environment</p>
                <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                  {selectedAssessmentForStart?.fullscreen_required 
                    ? "This exam enforces lock-down fullscreen. You must not exit fullscreen mode." 
                    : "Standard environment monitoring is active. Do not close the browser."}
                </p>
              </div>
            </div>

            {/* Tab Switching Rules */}
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-muted/10">
              <ShieldAlert className="size-4.5 text-red-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-foreground">Tab and App Switching Prohibited</p>
                <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                  Switching tabs, opening developer tools, or resizing the window registers as a violation. Multiple violations will cause automatic submission.
                </p>
              </div>
            </div>

            {/* Attempt Limits */}
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-muted/10">
              <History className="size-4.5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-foreground">Attempt Tracking</p>
                <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                  Attempt {Math.min(selectedAssessmentForStart?.max_attempts, (selectedAssessmentForStart?.attempts_used || 0) + 1)} of {selectedAssessmentForStart?.max_attempts}. 
                  Remaining attempts: {Math.max(0, (selectedAssessmentForStart?.max_attempts || 1) - (selectedAssessmentForStart?.attempts_used || 0))}.
                </p>
              </div>
            </div>

            {/* Checkbox Agreement */}
            <div className="flex items-start gap-2.5 pt-2">
              <Checkbox 
                id="integrity-agree" 
                checked={checklistAgreed} 
                onCheckedChange={(checked) => setChecklistAgreed(!!checked)}
                className="mt-0.5 border-border/70"
              />
              <Label htmlFor="integrity-agree" className="text-xs text-muted-foreground leading-normal font-medium cursor-pointer">
                I understand and agree to the academic integrity protocols. I am ready to begin this supervised assessment.
              </Label>
            </div>
          </div>

          <DialogFooter className="flex sm:justify-end gap-2 pt-2 border-t border-border/40">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setSelectedAssessmentForStart(null)}
              className="h-9 text-xs font-medium rounded-lg border-border/60"
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
              className="h-9 text-xs font-medium rounded-lg shadow-none"
            >
              Start Assessment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
