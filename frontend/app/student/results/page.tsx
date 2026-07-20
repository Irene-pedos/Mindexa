"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Trophy,
  Calendar,
  Award,
  Eye,
  BookOpen,
  Filter,
  ArrowRight,
  TrendingUp,
  FileText,
  AlertCircle,
  ArrowUpDown,
  Clock
} from "lucide-react";
import Link from "next/link";
import { studentApi, StudentRecentResult } from "@/lib/api/student";
import { resultApi } from "@/lib/api/result";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  getResultLifecycleSummary,
  getAssessmentCategory,
} from "@/lib/grading-architecture";
import HeroUITabs from "@/components/ui/heroui-tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export default function StudentResultsPage() {
  const [results, setResults] = useState<StudentRecentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [overallGPA, setOverallGPA] = useState(0);
  const [activeTab, setActiveTab] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  useEffect(() => {
    async function loadResults() {
      try {
        // BUG-12 fix: use /results/me for the full paginated list, not the dashboard
        // which only returns the last few entries.
        const [resultsData, dashboardData] = await Promise.all([
          resultApi.getMyResults({ page: 1, page_size: 100, include_pending: true }),
          studentApi.getDashboard(),
        ]);
        // ResultSummary shape differs slightly from StudentRecentResult;
        // map the common fields so the existing UI keeps working.
        const items = (resultsData.items || []).map((r: any) => ({
          id: r.attempt_id || r.id,
          attempt_id: r.attempt_id,
          assessment_id: r.assessment_id,
          assessment_title: r.assessment_title || "Assessment",
          assessment_type: r.assessment_type || "",
          course_code: r.course_code,
          course_name: r.course_name,
          academic_year: r.academic_year,
          score: r.total_score ?? r.score ?? 0,
          total_marks: r.max_score ?? r.total_marks ?? 0,
          percentage: r.percentage ?? 0,
          letter_grade: r.letter_grade,
          released_at: r.released_at,
          submitted_at: r.submitted_at,
          is_released: r.is_released,
          integrity_hold: r.integrity_hold,
          student_status: r.student_status,
          graded_question_count: r.graded_question_count,
          total_question_count: r.total_question_count,
        }));
        setResults(items);
        setOverallGPA(dashboardData.summary.cgpa.value);
      } catch (err) {
        console.error("Failed to load results", err);
      } finally {
        setLoading(false);
      }
    }
    loadResults();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 w-full mx-auto animate-in fade-in duration-300">
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  const averagePerformance =
    results.length > 0
      ? results.reduce((acc, curr) => acc + curr.percentage, 0) / results.length
      : 0;

  const bestPerformance =
    results.length > 0
      ? results.reduce((prev, current) =>
          prev.percentage > current.percentage ? prev : current,
        )
      : null;

  const getSortedResults = (items: StudentRecentResult[]) => {
    return [...items].sort((a, b) => {
      const dateA = new Date(a.released_at || (a as any).submitted_at || 0).getTime();
      const dateB = new Date(b.released_at || (b as any).submitted_at || 0).getTime();
      if (sortBy === "newest") return dateB - dateA;
      if (sortBy === "oldest") return dateA - dateB;
      if (sortBy === "highest") return b.percentage - a.percentage;
      if (sortBy === "lowest") return a.percentage - b.percentage;
      return 0;
    });
  };

  const getAssessmentTypeLabel = (type: string) => {
    if (!type) return "";
    return type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  };

  const renderResultItem = (result: StudentRecentResult) => {
    const lifecycle = getResultLifecycleSummary(result as any);
    const category = getAssessmentCategory(result as any);
    const isPublished = !!result.is_released || !!result.released_at;
    const isHeld = !!result.integrity_hold || category === "VIOLATION";
    const statusLabel = isPublished ? "Published" : isHeld ? "Integrity Review" : "Under Review";
    const statusClass = isPublished
      ? "border-emerald-500/20 text-emerald-700 bg-emerald-500/10"
      : isHeld
        ? "border-destructive/20 text-destructive bg-destructive/10"
        : "border-amber-500/20 text-amber-700 bg-amber-500/10";

    return (
      <div
        key={result.id}
        className={cn(
          "flex flex-col md:flex-row md:items-center justify-between py-3 px-4 hover:bg-card/45 transition-colors group border-b last:border-0",
          category === "VIOLATION" && "bg-destructive/5 border-l-4 border-l-destructive"
        )}
      >
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-base font-medium text-foreground/90 group-hover:text-primary transition-colors tracking-tight">
              {result.assessment_title}
            </div>
            {category === "VIOLATION" && (
              <Badge variant="destructive" className="h-5 text-xs font-medium px-2 py-0 rounded-full">
                Violation
              </Badge>
            )}
            <Badge variant="outline" className={cn("h-5 text-xs font-medium px-2 py-0 rounded-full", statusClass)}>
              {statusLabel}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge variant="secondary" className="h-5 px-2 text-xs border-none bg-muted/60 text-muted-foreground">{getAssessmentTypeLabel(result.assessment_type)}</Badge>
            {result.course_code && (
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <BookOpen className="size-3.5 text-muted-foreground/60" /> {result.course_code}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground/50 font-medium">
              <Calendar className="size-3.5" />{" "}
              {new Date(result.released_at || result.submitted_at || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <p className={cn(
            "text-xs font-medium leading-relaxed",
            category === "VIOLATION" ? "text-destructive italic" : "text-muted-foreground"
          )}>
            {isHeld ? "Integrity protocol audit in progress." : isPublished ? lifecycle.description : "Submitted successfully. Marks will appear here after lecturer publication."}
          </p>
        </div>

        <div className="flex items-center gap-5 mt-4 md:mt-0">
          <div className="text-right shrink-0">
            {isPublished ? (
              <>
                <div className="flex items-baseline justify-end gap-1.5 tabular-nums">
                  <span className="text-lg font-semibold text-foreground">
                    {result.score}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground/50">
                    / {result.total_marks || "N/A"}
                  </span>
                </div>
                <div className={cn(
                  "text-xs font-medium mt-0.5",
                  isHeld ? "text-destructive" :
                  result.percentage >= 70 ? "text-emerald-600" :
                  result.percentage >= 40 ? "text-primary" : "text-amber-600"
                )}>
                  {result.letter_grade || lifecycle.label.split(",")[0]}
                  <span className="ml-1.5 opacity-55">({result.percentage}%)</span>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-muted-foreground">
                  Not published
                </div>
                <div className="text-[10px] font-medium text-muted-foreground/70 mt-0.5">
                  {result.graded_question_count ?? 0}/{result.total_question_count ?? 0} graded
                </div>
              </>
            )}
          </div>

          <Button
            asChild
            variant={category === "VIOLATION" ? "destructive" : "outline"}
            size="sm"
            className="h-8 px-4 rounded-lg text-xs font-medium shadow-none transition-all"
          >
            <Link
              href={`/student/results/${result.id}`}
              className="flex items-center gap-1.5"
            >
              {category === "VIOLATION" ? "Audit Log" : "View Details"}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    );
  };

  const filteredAndSortedResults = getSortedResults(results.filter(r => {
    const category = getAssessmentCategory(r as any);
    const isPublished = !!r.is_released || !!r.released_at;
    const isHeld = !!r.integrity_hold || category === "VIOLATION";
    if (activeTab === "all") return true;
    if (activeTab === "graded") return isPublished && !isHeld;
    if (activeTab === "pending") return !isPublished && !isHeld;
    if (activeTab === "violations") return isHeld;
    return true;
  }));

  const groupedResults = filteredAndSortedResults.reduce((acc: any, res) => {
    const course = res.course_name || "General Assessments";
    if (!acc[course]) acc[course] = [];
    acc[course].push(res);
    return acc;
  }, {});

  return (
    <div className="space-y-6 w-full mx-auto animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/20">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Results & Feedback
          </h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 font-medium">
            <TrendingUp className="size-4 text-primary animate-pulse" /> Active academic evaluations and performance ledger.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="h-9 rounded-xl text-xs font-semibold gap-2 border-border/60">
          <FileText className="size-4" /> Export Result Slip (PDF)
        </Button>
      </div>

      {/* Main Ledger */}
      <HeroUITabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border/30 pb-3">
          <HeroUITabs.ListContainer className="border-none w-fit">
            <HeroUITabs.List aria-label="Results filter">
              <HeroUITabs.Tab id="all" className="text-xs font-medium relative px-1 pb-3 pt-1.5 transition-all">
                Performance Ledger
                <HeroUITabs.Indicator />
              </HeroUITabs.Tab>
              <HeroUITabs.Tab id="graded" className="text-xs font-medium relative px-1 pb-3 pt-1.5 transition-all">
                Graded
                <HeroUITabs.Indicator />
              </HeroUITabs.Tab>
              <HeroUITabs.Tab id="pending" className="text-xs font-medium relative px-1 pb-3 pt-1.5 transition-all">
                Under Review
                <HeroUITabs.Indicator />
              </HeroUITabs.Tab>
              <HeroUITabs.Tab id="violations" className="text-xs font-medium relative px-1 pb-3 pt-1.5 transition-all data-[selected=true]:text-destructive">
                Violations
                <HeroUITabs.Indicator />
              </HeroUITabs.Tab>
            </HeroUITabs.List>
          </HeroUITabs.ListContainer>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
               <ArrowUpDown className="size-4 text-muted-foreground/60" />
               <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-9 text-xs font-medium w-36 border border-border/60 bg-background/50 hover:bg-background/80 transition-colors rounded-lg shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="newest" className="text-xs font-medium">Newest Attempt</SelectItem>
                     <SelectItem value="oldest" className="text-xs font-medium">Oldest Attempt</SelectItem>
                     <SelectItem value="highest" className="text-xs font-medium">Highest Mark</SelectItem>
                     <SelectItem value="lowest" className="text-xs font-medium">Lowest Mark</SelectItem>
                  </SelectContent>
               </Select>
            </div>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground select-none">
              <Filter className="size-3.5" /> Filter by Module
            </div>
          </div>
        </div>

        <div className="pt-4">
           {filteredAndSortedResults.length === 0 ? (
             <div className="py-16 text-center border border-dashed rounded-xl bg-muted/5 border-border/30 animate-in fade-in duration-200">
                <p className="text-xs font-semibold text-muted-foreground">No matching evaluations identified in academic records.</p>
             </div>
           ) : (
             <div className="space-y-6 animate-in fade-in duration-300">
                 {Object.entries(groupedResults).map(([course, courseResults]: any) => (
                   <div key={course} className="space-y-2">
                     <div className="flex items-center gap-3 px-1">
                        <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{course}</h2>
                        <div className="h-[1px] flex-1 bg-border/40" />
                        <span className="text-[10px] font-bold text-muted-foreground/45 uppercase">{courseResults.length} Items</span>
                     </div>
                     <Card className="shadow-none border rounded-xl overflow-hidden bg-card/30 border-border/45 hover:border-primary/20 backdrop-blur-sm transition-all duration-300">
                        <div className="divide-y divide-border/20">
                           {courseResults.map(renderResultItem)}
                        </div>
                     </Card>
                   </div>
                 ))}
             </div>
           )}
        </div>
      </HeroUITabs>

      {/* Appeals Warning */}
      <Card className="bg-amber-500/5 border border-amber-500/15 rounded-xl overflow-hidden shadow-none">
        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-3">
             <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
             <p className="text-xs text-amber-900/80 font-medium leading-relaxed max-w-xl">
               Formal assessment appeals or grade reviews must be requested within 7 business days of the release of results. All instructor and administrator determinations are subject to institutional academic policies.
             </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs font-semibold border-amber-500/35 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 transition-colors shadow-none shrink-0">
            Appeal Guidelines
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
