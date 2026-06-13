// app/(student)/results/page.tsx
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  getResultLifecycleSummary,
  getAssessmentCategory,
} from "@/lib/grading-architecture";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
        const data = await studentApi.getDashboard();
        setResults(data.recent_results);
        setOverallGPA(data.summary.cgpa.value);
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
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 rounded-md" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
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

    return (
      <div
        key={result.id}
        className={cn(
          "flex flex-col md:flex-row md:items-center justify-between p-4 hover:bg-muted/10 transition-colors group border-b last:border-0",
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
            {lifecycle.tone === "warning" && (
              <Badge variant="outline" className="h-5 text-xs font-medium border-amber-500/20 text-amber-600 bg-amber-500/10 px-2 py-0 rounded-full">
                In Review
              </Badge>
            )}
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
              {new Date(result.released_at || (result as any).submitted_at || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <p className={cn(
            "text-xs font-medium leading-relaxed",
            category === "VIOLATION" ? "text-destructive italic" : "text-muted-foreground"
          )}>
            {category === "VIOLATION" ? "Integrity protocol audit in progress." : lifecycle.description}
          </p>
        </div>

        <div className="flex items-center gap-5 mt-4 md:mt-0">
          <div className="text-right shrink-0">
            <div className="flex items-baseline justify-end gap-1.5 tabular-nums">
              <span className="text-lg font-semibold text-foreground">
                {result.score}
              </span>
              <span className="text-xs font-medium text-muted-foreground/50">
                / {result.total_marks}
              </span>
            </div>
            <div className={cn(
              "text-xs font-medium mt-0.5",
              category === "VIOLATION" ? "text-destructive" : 
              result.percentage >= 70 ? "text-emerald-600" :
              result.percentage >= 40 ? "text-primary" : "text-amber-600"
            )}>
              {result.letter_grade || (category === "VIOLATION" ? "Violation" : lifecycle.label.split(",")[0])}
              <span className="ml-1.5 opacity-55">({result.percentage}%)</span>
            </div>
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
    if (activeTab === "all") return true;
    if (activeTab === "graded") return r.letter_grade || category === "GRADED";
    if (activeTab === "pending") return !r.letter_grade && category === "SUBMITTED";
    if (activeTab === "violations") return category === "VIOLATION";
    return true;
  }));

  const groupedResults = filteredAndSortedResults.reduce((acc: any, res) => {
    const course = res.course_name || "General Assessments";
    if (!acc[course]) acc[course] = [];
    acc[course].push(res);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/20">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Results & Feedback
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <TrendingUp className="size-4 text-primary" /> Active academic evaluations and performance ledger.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-9 rounded-lg text-xs font-medium gap-2 border-border/55">
          <FileText className="size-4" /> Export Result Slip (PDF)
        </Button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Cumulative GPA", value: overallGPA.toFixed(2), icon: TrendingUp, progress: (overallGPA / 4.0) * 100 },
          { label: "Average Grade Score", value: `${averagePerformance.toFixed(1)}%`, icon: TrendingUp },
          { label: "Top Score Accomplished", value: `${bestPerformance?.percentage || 0}%`, icon: Trophy },
          { label: "Registered Attempts", value: results.length.toString(), icon: FileText },
        ].map((stat, i) => (
          <Card key={i} className="shadow-none border rounded-xl overflow-hidden bg-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</span>
                <stat.icon className="size-4 text-primary/50" />
              </div>
              <div className="text-2xl font-semibold text-foreground tracking-tight">{stat.value}</div>
              {stat.progress !== undefined && (
                <div className="pt-1">
                   <Progress value={stat.progress} className="h-1.5 bg-primary/10 rounded-full" />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Ledger */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border/30 pb-3">
          <TabsList className="bg-muted/30 p-1 rounded-xl w-fit h-11 border shadow-none">
            <TabsTrigger value="all" className="text-xs font-medium px-4 py-2 rounded-lg">Performance Ledger</TabsTrigger>
            <TabsTrigger value="graded" className="text-xs font-medium px-4 py-2 rounded-lg">Graded</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs font-medium px-4 py-2 rounded-lg">Under Review</TabsTrigger>
            <TabsTrigger value="violations" className="text-xs font-medium px-4 py-2 rounded-lg text-destructive data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground">Violations</TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
               <ArrowUpDown className="size-4 text-muted-foreground/60" />
               <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-9 text-xs font-medium w-36 border border-border/60 bg-background/50 hover:bg-background/80 transition-colors rounded-lg shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="newest" className="text-xs">Newest Attempt</SelectItem>
                     <SelectItem value="oldest" className="text-xs">Oldest Attempt</SelectItem>
                     <SelectItem value="highest" className="text-xs">Highest Mark</SelectItem>
                     <SelectItem value="lowest" className="text-xs">Lowest Mark</SelectItem>
                  </SelectContent>
               </Select>
            </div>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground select-none">
              <Filter className="size-3.5" /> Filter by Module
            </div>
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-6">
           {filteredAndSortedResults.length === 0 ? (
             <div className="py-16 text-center border border-dashed rounded-xl bg-muted/5 border-border/30">
                <p className="text-sm font-medium text-muted-foreground">No matching evaluations identified in academic records.</p>
             </div>
           ) : (
             <div className="space-y-6">
                {Object.entries(groupedResults).map(([course, courseResults]: any) => (
                  <div key={course} className="space-y-2">
                    <div className="flex items-center gap-3 px-1">
                       <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">{course}</h2>
                       <div className="h-[1px] flex-1 bg-border/40" />
                       <span className="text-xs font-medium text-muted-foreground/45">{courseResults.length} Items</span>
                    </div>
                    <Card className="shadow-none border rounded-xl overflow-hidden bg-card">
                       <div className="divide-y divide-border/20">
                          {courseResults.map(renderResultItem)}
                       </div>
                    </Card>
                  </div>
                ))}
             </div>
           )}
        </TabsContent>
      </Tabs>

      {/* Appeals Warning */}
      <Card className="bg-amber-500/5 border border-amber-500/15 rounded-xl overflow-hidden shadow-none">
        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-3">
             <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
             <p className="text-xs text-amber-900/80 font-medium leading-relaxed max-w-xl">
               Formal assessment appeals or grade reviews must be requested within 7 business days of the release of results. All instructor and administrator determinations are subject to institutional academic policies.
             </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs font-medium border-amber-500/35 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 transition-colors shadow-none shrink-0">
            Appeal Guidelines
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
