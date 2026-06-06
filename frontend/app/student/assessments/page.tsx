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
import {
  Calendar,
  Clock,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  History,
  TimerOff,
  SearchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { assessmentApi } from "@/lib/api/assessment";
import { apiClient } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import {
  getAssessmentProgressStatus,
  getAssessmentCategory,
  AssessmentCategory,
} from "@/lib/grading-architecture";

export default function StudentAssessmentsPage() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTab, setFilterTab] = useState<string>("active");
  const [visitedTabs, setVisitedTabs] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [assessData, notifData] = await Promise.all([
            assessmentApi.getAssessments(),
            apiClient("/notifications/me?unread_only=true")
        ]);
        setAssessments(assessData.items || []);
        setNotifications(notifData.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const hasNewInCategory = (tab: string) => {
    if (visitedTabs.includes(tab)) return false;
    
    if (tab === "active") {
        return assessments.some(a => {
            const cat = getAssessmentCategory(a);
            return (cat === "ACTIVE" || cat === "IN_PROGRESS") && 
                   notifications.some(n => n.reference_id === a.id && !n.is_read);
        });
    }
    if (tab === "upcoming") {
        return assessments.some(a => {
            const cat = getAssessmentCategory(a);
            return cat === "UPCOMING" && 
                   notifications.some(n => n.reference_id === a.id && !n.is_read);
        });
    }
    if (tab === "submitted") {
        return assessments.some(a => {
            const cat = getAssessmentCategory(a);
            return (cat === "SUBMITTED" || cat === "GRADED") && 
                   notifications.some(n => n.reference_id === a.id && !n.is_read);
        });
    }
    return false;
  };

  const filteredAssessments = assessments.filter((ass) => {
    const category = getAssessmentCategory(ass);
    const matchesSearch =
      ass.title?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const matchesType =
      filterType === "all" || ass.assessment_type === filterType.toUpperCase();

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

  const getStatusInfo = (assessment: any) => {
    const category = getAssessmentCategory(assessment);
    const progressStatus = getAssessmentProgressStatus(assessment);

    if (category === "VIOLATION") {
      return {
        label: "Auto-Submitted / Violation",
        description:
          assessment.termination_reason ||
          "Session ended due to integrity protocol violation.",
        variant: "destructive" as const,
        color: "bg-red-50 text-red-700 border-red-200",
        available: false,
      };
    }

    if (category === "SUBMITTED" || category === "GRADED") {
      return {
        label: progressStatus.label,
        description: progressStatus.description,
        variant: "outline" as const,
        color:
          progressStatus.tone === "success"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : progressStatus.tone === "warning"
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-blue-50 text-blue-700 border-blue-200",
        available: false,
      };
    }

    if (category === "MISSED") {
      return {
        label: "Closed / Missed",
        description:
          "The submission window has ended and no attempt was recorded.",
        variant: "outline" as const,
        color: "bg-muted text-muted-foreground border-muted-foreground/20",
        available: false,
      };
    }

    if (category === "UPCOMING") {
      const start = new Date(assessment.window_start);
      return {
        label: `Opens ${start.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        description:
          "Review instructions and duration while you wait for the session to open.",
        variant: "secondary" as const,
        color: "",
        available: false,
      };
    }

    return {
      label:
        category === "IN_PROGRESS" ? "Continue Assessment" : "Available Now",
      description:
        category === "IN_PROGRESS"
          ? "You have an active session. Resume to complete your work."
          : "Closed questions are graded automatically. Open responses may require lecturer review.",
      variant: category === "IN_PROGRESS" ? "default" : ("default" as const),
      color: category === "IN_PROGRESS" ? "bg-primary shadow-md" : "",
      available: true,
    };
  };

  const getTypeColor = (type: string) => {
    const t = type?.toLowerCase();
    if (t === "cat" || t === "summative") return "text-primary font-bold";
    return "text-muted-foreground font-medium";
  };

  const renderAssessmentCard = (assessment: any) => {
    const status = getStatusInfo(assessment);
    const category = getAssessmentCategory(assessment);

    return (
      <Card
        key={assessment.id}
        className={cn(
          "shadow-none border hover:border-primary/10 transition-all group",
          category === "VIOLATION" && "border-red-200 bg-red-50/10",
          !status.available &&
            category !== "SUBMITTED" &&
            category !== "GRADED" &&
            category !== "VIOLATION" &&
            "opacity-80",
        )}
      >
        <CardHeader className="py-4 px-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
                {assessment.title}
                {category === "IN_PROGRESS" && (
                  <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </CardTitle>
              <CardDescription className="flex items-center gap-1.5 text-[11px] font-medium">
                <BookOpen className="size-3.5" />
                {assessment.course_name
                  ? `${assessment.course_name} (${assessment.course_code})`
                  : "General Assessment"}
              </CardDescription>
              <p
                className={cn(
                  "text-[10px] leading-relaxed mt-1.5",
                  category === "VIOLATION"
                    ? "text-red-600 font-bold"
                    : "text-muted-foreground",
                )}
              >
                {status.description}
              </p>
            </div>
            <Badge
              variant={status.variant}
              className={cn(
                "text-[10px] font-bold h-5 px-2 uppercase tracking-tight",
                status.color,
              )}
            >
              {status.label}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="py-4 px-5 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div className="flex items-center gap-3">
              <Calendar className="size-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="font-medium truncate text-xs">
                  {assessment.window_start
                    ? format(new Date(assessment.window_start), "MMM d, HH:mm")
                    : "Anytime"}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {assessment.window_end
                    ? `Until ${format(new Date(assessment.window_end), "MMM d, HH:mm")}`
                    : "No deadline"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Clock className="size-4 text-muted-foreground" />
              <div>
                <div className="font-medium text-xs">
                  {assessment.duration_minutes || 90} min
                </div>
                <div className="text-[10px] text-muted-foreground uppercase font-medium tracking-tight flex items-center gap-1.5">
                  {assessment.is_supervised ? (
                    <>
                      <ShieldAlert className="size-3 text-primary" /> Proctored
                    </>
                  ) : (
                    "Self-paced"
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-6">
              <div className="text-right">
                <div
                  className={cn(
                    "text-[10px] uppercase tracking-wider font-semibold",
                    getTypeColor(assessment.assessment_type),
                  )}
                >
                  {assessment.assessment_type}
                </div>
                <div className="text-[10px] text-muted-foreground font-medium tabular-nums">
                  {assessment.total_marks || 100} PTS
                </div>
              </div>

              {category === "SUBMITTED" ||
              category === "GRADED" ||
              category === "VIOLATION" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[11px] font-bold px-4 gap-2"
                  asChild
                >
                  <Link
                    href={`/student/results/${assessment.student_attempt_id}`}
                  >
                    <History className="size-3.5" />
                    {category === "VIOLATION" ? "Audit" : "Results"}
                  </Link>
                </Button>
              ) : (
                <Button
                  asChild={status.available}
                  size="sm"
                  className="h-8 text-[11px] font-bold px-5"
                  disabled={!status.available}
                  variant={status.available ? "default" : "secondary"}
                >
                  {status.available ? (
                    <Link
                      href={
                        assessment.assessment_type === "GROUP_WORK"
                          ? `/student/group-work/${assessment.id}`
                          : `/student/assessments/${assessment.id}/take`
                      }
                    >
                      {category === "IN_PROGRESS"
                        ? "Continue"
                        : assessment.assessment_type === "GROUP_WORK"
                          ? "Join"
                          : "Start"}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <TimerOff className="size-3.5" /> Locked
                    </span>
                  )}
                </Button>
              )}
            </div>
          </div>

          {category === "VIOLATION" && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-100 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-red-700">
              <div className="flex gap-4">
                <span>Warnings: {assessment.warning_count || 0}</span>
                <span>
                  Activity:{" "}
                  {assessment.detected_activity || "Suspicious Patterns"}
                </span>
              </div>
              <Badge
                variant="outline"
                className="h-4 px-1.5 text-[8px] border-red-200 text-red-600 bg-white"
              >
                Under Institutional Review
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>
          <p className="text-muted-foreground text-xs font-medium">
            Manage your academic lifecycle from upcoming tasks to finalized
            evaluations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Filter title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-52 h-9 pl-8 text-xs font-medium"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-36 h-9 text-xs">
              <SelectValue placeholder="Protocol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                All Modes
              </SelectItem>
              <SelectItem value="CAT" className="text-xs">
                CAT
              </SelectItem>
              <SelectItem value="formative" className="text-xs">
                Formative
              </SelectItem>
              <SelectItem value="summative" className="text-xs">
                Summative
              </SelectItem>
              <SelectItem value="homework" className="text-xs">
                Homework
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs 
        value={filterTab} 
        onValueChange={(v) => {
            setFilterTab(v);
            if (!visitedTabs.includes(v)) setVisitedTabs([...visitedTabs, v]);
        }} 
        className="w-full"
      >
        <TabsList className="bg-muted/30 p-1 rounded-lg w-full md:w-fit h-10 overflow-x-auto justify-start">
          <TabsTrigger
            value="active"
            className="text-[10px] font-bold uppercase tracking-tight px-4 h-8 gap-2 relative"
          >
            Active / In Progress
            {hasNewInCategory("active") && (
                <span className="absolute -top-1 -left-1 size-2 rounded-full bg-red-500 border border-background" />
            )}
          </TabsTrigger>
          <TabsTrigger
            value="upcoming"
            className="text-[10px] font-bold uppercase tracking-tight px-4 h-8 relative"
          >
            Upcoming
            {hasNewInCategory("upcoming") && (
                <span className="absolute -top-1 -left-1 size-2 rounded-full bg-red-500 border border-background" />
            )}
          </TabsTrigger>
          <TabsTrigger
            value="submitted"
            className="text-[10px] font-bold uppercase tracking-tight px-4 h-8 relative"
          >
            Submitted & Graded
            {hasNewInCategory("submitted") && (
                <span className="absolute -top-1 -left-1 size-2 rounded-full bg-red-500 border border-background" />
            )}
          </TabsTrigger>
          <TabsTrigger
            value="missed"
            className="text-[10px] font-bold uppercase tracking-tight px-4 h-8"
          >
            Missed / Expired
          </TabsTrigger>
          <TabsTrigger
            value="violations"
            className="text-[10px] font-bold uppercase tracking-tight px-4 h-8 data-[state=active]:text-red-600"
          >
            Violations
          </TabsTrigger>
        </TabsList>

        <div className="mt-6 space-y-4">
          {loading ? (
            [1, 2, 3].map((i) => (
              <Skeleton key={i} variant="media" className="h-28 w-full" />
            ))
          ) : filteredAssessments.length > 0 ? (
            filteredAssessments.map(renderAssessmentCard)
          ) : (
            <div className="py-20 text-center border-2 border-dashed rounded-2xl bg-muted/5">
              <div className="size-12 rounded-full bg-muted/20 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="size-6 text-muted-foreground/30" />
              </div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                No records found in this category.
              </p>
            </div>
          )}
        </div>
      </Tabs>

      {/* Quick Integrity Notice */}
      <div className="p-5 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-4 shadow-sm">
        <ShieldAlert className="size-5 text-primary mt-0.5" />
        <div>
          <p className="text-sm font-bold text-primary uppercase tracking-tight">
            Institutional Integrity Guard
          </p>
          <p className="text-[11px] text-muted-foreground mt-1.5 font-medium leading-relaxed max-w-2xl">
            High-security assessments (CATs, Exams) enforce a continuous session
            lock. Unauthorized exits, tab switching, or integrity protocol
            breaches will trigger automated warnings and may result in immediate
            session termination and auto-submission for pedagogical review.
          </p>
        </div>
      </div>
    </div>
  );
}
import { format } from "date-fns";
