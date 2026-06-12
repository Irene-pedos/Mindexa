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
                  <h3 className="text-base font-semibold text-foreground">
                    {assessment.title}
                  </h3>
                  {category === "IN_PROGRESS" && (
                    <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                  {isSupervised && (
                    <Badge variant="outline" className="text-[9px] uppercase font-bold px-1.5 h-4.5 flex items-center gap-1">
                      <Lock className="size-2.5" /> Supervised
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <BookOpen className="size-3.5 opacity-70" />
                  <span>{assessment.course_code || "GEN-001"}</span>
                  <span className="text-muted-foreground/30">•</span>
                  <span>{getAssessmentTypeLabel(assessment.assessment_type)}</span>
                </div>
              </div>
              <Badge variant={status.variant} className={cn("text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize shadow-none border", status.color)}>
                {status.label}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <Calendar className="size-3.5 opacity-60 text-muted-foreground" />
                <span>{assessment.window_start ? format(new Date(assessment.window_start), "MMM d, yyyy • HH:mm") : "Open window"}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <Clock className="size-3.5 opacity-60 text-muted-foreground" />
                <span>{assessment.duration_minutes || 90} mins</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <ShieldAlert className="size-3.5 opacity-60 text-muted-foreground" />
                <span>{isSupervised ? "Secure Environment" : "Self-paced"}</span>
              </div>
            </div>
          </div>

          <div className="bg-muted/20 border-t md:border-t-0 md:border-l border-border/40 p-5 flex items-center justify-between md:justify-center md:flex-col gap-4 min-w-[160px]">
            <div className="text-center md:mb-1">
              <div className="text-sm font-semibold tabular-nums text-foreground">{assessment.total_marks || 100} Points</div>
              <div className="text-xs text-muted-foreground/70">Assessment Weight</div>
            </div>

            {category === "SUBMITTED" || category === "GRADED" || category === "VIOLATION" ? (
              <Button variant="outline" size="sm" className="h-8 text-xs font-medium px-4 rounded-lg border-border/60 w-full" asChild>
                <Link href={`/student/results/${assessment.student_attempt_id}`}>
                  {category === "VIOLATION" ? "Audit Log" : "View Results"}
                </Link>
              </Button>
            ) : (
              <Button asChild={status.available} size="sm" className="h-8 text-xs font-medium px-4 rounded-lg shadow-none w-full" disabled={!status.available} variant={status.available ? "default" : "secondary"}>
                {status.available ? (
                  <Link href={assessment.assessment_type === "GROUP_WORK" ? `/student/group-work/${assessment.id}` : `/student/assessments/${assessment.id}/take`}>
                    {category === "IN_PROGRESS" ? "Resume" : "Start Test"}
                  </Link>
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
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={filterTab} onValueChange={(v) => { setFilterTab(v); if (!visitedTabs.includes(v)) setVisitedTabs([...visitedTabs, v]); }} className="w-full">
        <TabsList className="bg-muted/30 p-1 rounded-xl w-full md:w-fit h-11 overflow-x-auto justify-start border border-border/40 shadow-none">
          <TabsTrigger value="active" className="text-xs font-semibold px-4 py-2 rounded-lg relative transition-all">
            Active {hasNewInCategory("active") && <span className="absolute top-1 right-2 size-2 rounded-full bg-red-500 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="text-xs font-semibold px-4 py-2 rounded-lg relative transition-all">
            Upcoming {hasNewInCategory("upcoming") && <span className="absolute top-1 right-2 size-2 rounded-full bg-red-500 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="submitted" className="text-xs font-semibold px-4 py-2 rounded-lg relative transition-all">
            Submitted {hasNewInCategory("submitted") && <span className="absolute top-1 right-2 size-2 rounded-full bg-red-500 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="missed" className="text-xs font-semibold px-4 py-2 rounded-lg transition-all">Missed</TabsTrigger>
          <TabsTrigger value="violations" className="text-xs font-semibold px-4 py-2 rounded-lg transition-all data-[state=active]:text-destructive data-[state=active]:bg-destructive/10">Violations</TabsTrigger>
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
              <p className="text-sm font-medium text-muted-foreground">No assessments identified in this category.</p>
            </div>
          )}
        </div>
      </Tabs>

      {/* Integrity Notice - Compact */}
      <div className="p-4 rounded-xl border border-primary/15 bg-primary/5 flex items-start gap-3.5 transition-all duration-300">
        <ShieldAlert className="size-5 text-primary mt-0.5 opacity-85 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-primary">Integrity Protocol Notice</p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
            High-security testing environments enforce strict environment locking. Switching tabs or applications will register as a violation, which may result in session termination and immediate automated submission.
          </p>
        </div>
      </div>
    </div>
  );
}
