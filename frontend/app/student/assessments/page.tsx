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

  const getStatusInfo = (assessment: any) => {
    const category = getAssessmentCategory(assessment);
    const progressStatus = getAssessmentProgressStatus(assessment);

    if (category === "VIOLATION") {
      return {
        label: "Violation",
        variant: "destructive" as const,
        color: "bg-red-50 text-red-700 border-red-200",
        available: false,
      };
    }

    if (category === "SUBMITTED" || category === "GRADED") {
      return {
        label: progressStatus.label,
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
        label: "Missed",
        variant: "outline" as const,
        color: "bg-muted text-muted-foreground border-muted-foreground/20",
        available: false,
      };
    }

    if (category === "UPCOMING") {
      const start = new Date(assessment.window_start);
      return {
        label: `Opens ${format(start, "MMM d, HH:mm")}`,
        variant: "secondary" as const,
        color: "",
        available: false,
      };
    }

    return {
      label: category === "IN_PROGRESS" ? "Continue" : "Available",
      variant: category === "IN_PROGRESS" ? "default" : ("default" as const),
      color: category === "IN_PROGRESS" ? "bg-primary" : "",
      available: true,
    };
  };

  const renderAssessmentCard = (assessment: any) => {
    const status = getStatusInfo(assessment);
    const category = getAssessmentCategory(assessment);

    return (
      <Card
        key={assessment.id}
        className={cn(
          "shadow-none border hover:border-primary/20 transition-all group rounded-md overflow-hidden",
          category === "VIOLATION" && "border-red-200 bg-red-50/10",
        )}
      >
        <div className="flex flex-col md:flex-row">
            <div className="flex-1 p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <CardTitle className="text-sm font-semibold tracking-tight text-foreground/90 truncate uppercase">
                                {assessment.title}
                            </CardTitle>
                            {category === "IN_PROGRESS" && (
                            <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-medium tracking-tight">
                            <BookOpen className="size-3 opacity-60" />
                            {assessment.course_code || "GEN-001"} • {assessment.assessment_type}
                        </div>
                    </div>
                    <Badge variant={status.variant} className={cn("text-[9px] font-bold h-4.5 px-2 rounded-sm uppercase", status.color)}>
                        {status.label}
                    </Badge>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 pt-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                        <Calendar className="size-3 opacity-40" />
                        <span>{assessment.window_start ? format(new Date(assessment.window_start), "MMM d, HH:mm") : "Open"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                        <Clock className="size-3 opacity-40" />
                        <span>{assessment.duration_minutes || 90}m</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium col-span-2 md:col-span-1">
                        <ShieldAlert className="size-3 opacity-40" />
                        <span>{assessment.is_supervised ? "Secure Environment" : "Self-paced"}</span>
                    </div>
                </div>
            </div>

            <div className="bg-muted/5 border-t md:border-t-0 md:border-l border-border/40 p-3.5 flex items-center justify-between md:justify-center md:flex-col gap-3 min-w-[140px]">
                <div className="text-center md:mb-1">
                    <div className="text-[11px] font-bold tabular-nums text-foreground/80">{assessment.total_marks || 100} PTS</div>
                    <div className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-tighter">Weight</div>
                </div>

                {category === "SUBMITTED" || category === "GRADED" || category === "VIOLATION" ? (
                    <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold px-4 rounded-md border-border/60" asChild>
                        <Link href={`/student/results/${assessment.student_attempt_id}`}>
                            {category === "VIOLATION" ? "Audit" : "Results"}
                        </Link>
                    </Button>
                ) : (
                    <Button asChild={status.available} size="sm" className="h-7 text-[10px] font-bold px-4 rounded-md shadow-none" disabled={!status.available} variant={status.available ? "default" : "secondary"}>
                        {status.available ? (
                            <Link href={assessment.assessment_type === "GROUP_WORK" ? `/student/group-work/${assessment.id}` : `/student/assessments/${assessment.id}/take`}>
                                {category === "IN_PROGRESS" ? "Resume" : "Start"}
                            </Link>
                        ) : (
                            <span className="flex items-center gap-1"><TimerOff className="size-3" /> Locked</span>
                        )}
                    </Button>
                )}
            </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-4 pb-8">
      {/* Precision Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-3">
        <div className="space-y-0.5">
          <h1 className="text-lg font-bold tracking-tight text-foreground/90 uppercase">Assessments</h1>
          <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Evaluation and protocol ledger.</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/40" />
            <Input
              placeholder="Search title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-40 h-7 pl-7 text-[10px] font-medium rounded-md border-border/60 uppercase"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32 h-7 text-[10px] font-bold uppercase rounded-md border-border/60">
              <SelectValue placeholder="Protocol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[10px] uppercase font-bold">All Modes</SelectItem>
              <SelectItem value="CAT" className="text-[10px] uppercase font-bold">CAT</SelectItem>
              <SelectItem value="formative" className="text-[10px] uppercase font-bold">Formative</SelectItem>
              <SelectItem value="summative" className="text-[10px] uppercase font-bold">Summative</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={filterTab} onValueChange={(v) => { setFilterTab(v); if (!visitedTabs.includes(v)) setVisitedTabs([...visitedTabs, v]); }} className="w-full">
        <TabsList className="bg-muted/30 p-0.5 rounded-lg w-full md:w-fit h-8.5 overflow-x-auto justify-start border border-border/40">
          <TabsTrigger value="active" className="text-[9px] font-bold uppercase tracking-tight px-3 h-7.5 relative">
            Active {hasNewInCategory("active") && <span className="absolute top-0.5 right-1 size-1.5 rounded-full bg-red-500" />}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="text-[9px] font-bold uppercase tracking-tight px-3 h-7.5 relative">
            Upcoming {hasNewInCategory("upcoming") && <span className="absolute top-0.5 right-1 size-1.5 rounded-full bg-red-500" />}
          </TabsTrigger>
          <TabsTrigger value="submitted" className="text-[9px] font-bold uppercase tracking-tight px-3 h-7.5 relative">
            Submitted {hasNewInCategory("submitted") && <span className="absolute top-0.5 right-1 size-1.5 rounded-full bg-red-500" />}
          </TabsTrigger>
          <TabsTrigger value="missed" className="text-[9px] font-bold uppercase tracking-tight px-3 h-7.5">Missed</TabsTrigger>
          <TabsTrigger value="violations" className="text-[9px] font-bold uppercase tracking-tight px-3 h-7.5 data-[state=active]:text-red-600">Violations</TabsTrigger>
        </TabsList>

        <div className="mt-3 space-y-2">
          {loading ? (
            [1, 2, 3].map((i) => (
              <Skeleton key={i} variant="media" className="h-20 w-full rounded-md" />
            ))
          ) : filteredAssessments.length > 0 ? (
            filteredAssessments.map(renderAssessmentCard)
          ) : (
            <div className="py-16 text-center border-2 border-dashed rounded-lg bg-muted/5 border-border/40">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Zero records identified.</p>
            </div>
          )}
        </div>
      </Tabs>

      {/* Integrity Notice - Compact */}
      <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex items-start gap-3">
        <ShieldAlert className="size-3.5 text-primary mt-0.5 opacity-60" />
        <div className="space-y-0.5">
          <p className="text-[10px] font-bold text-primary uppercase tracking-tight">Integrity Protocol Guard</p>
          <p className="text-[9px] text-muted-foreground font-medium leading-relaxed max-w-2xl uppercase tracking-tighter">High-security sessions enforce environment locking. Violations trigger immediate termination and automated submission.</p>
        </div>
      </div>
    </div>
  );
}
