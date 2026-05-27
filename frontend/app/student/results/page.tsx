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
      <div className="space-y-4 max-w-7xl mx-auto p-4 pt-2">
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

  const renderResultItem = (result: StudentRecentResult) => {
    const lifecycle = getResultLifecycleSummary(result as any);
    const category = getAssessmentCategory(result as any);

    return (
      <div
        key={result.id}
        className={cn(
          "flex flex-col md:flex-row md:items-center justify-between p-3.5 hover:bg-muted/5 transition-colors group border-b last:border-0",
          category === "VIOLATION" && "bg-red-50/10 border-l-4 border-l-red-500"
        )}
      >
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-foreground/90 truncate uppercase tracking-tight">
              {result.assessment_title}
            </div>
            {category === "VIOLATION" && (
              <Badge variant="destructive" className="h-4 text-[8px] font-bold tracking-widest">
                TERMINATED
              </Badge>
            )}
            {lifecycle.tone === "warning" && (
              <Badge variant="outline" className="h-4 text-[8px] font-semibold border-amber-200 text-amber-600 bg-amber-50">
                IN REVIEW
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <Badge variant="secondary" className="h-3.5 px-1 text-[8px] border-none bg-muted/60">{result.assessment_type}</Badge>
            {result.course_code && (
              <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                <BookOpen className="size-3" /> {result.course_code}
              </span>
            )}
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60 font-medium">
              <Calendar className="size-2.5" />{" "}
              {new Date(result.released_at || (result as any).submitted_at || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <p className={cn(
            "text-[10px] font-medium leading-relaxed",
            category === "VIOLATION" ? "text-red-600 italic" : "text-muted-foreground"
          )}>
            {category === "VIOLATION" ? "Integrity audit active." : lifecycle.description}
          </p>
        </div>

        <div className="flex items-center gap-4 mt-3 md:mt-0">
          <div className="text-right shrink-0">
            <div className="flex items-baseline justify-end gap-1">
              <span className="text-lg font-bold tabular-nums text-foreground">
                {result.score}
              </span>
              <span className="text-[10px] font-medium text-muted-foreground/60">
                / {result.total_marks}
              </span>
            </div>
            <div className={cn(
              "text-[10px] font-bold uppercase tracking-widest mt-0.5",
              category === "VIOLATION" ? "text-red-600" : 
              result.percentage >= 70 ? "text-emerald-600" :
              result.percentage >= 40 ? "text-primary" : "text-amber-600"
            )}>
              {result.letter_grade || (category === "VIOLATION" ? "VIOLATION" : lifecycle.label.split(",")[0])}
              <span className="ml-1.5 opacity-40">({result.percentage}%)</span>
            </div>
          </div>

          <Button
            asChild
            variant={category === "VIOLATION" ? "destructive" : "outline"}
            size="sm"
            className="h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-none"
          >
            <Link
              href={`/student/results/${result.id}`}
              className="flex items-center gap-1.5"
            >
              {category === "VIOLATION" ? "Audit" : "Trace"}
              <ArrowRight className="size-3" />
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
    <div className="space-y-4 max-w-7xl mx-auto px-4 pb-12 pt-2">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 px-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground/90">
            Results & Feedback
          </h1>
          <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-widest mt-0.5 flex items-center gap-1.5">
            <TrendingUp className="size-3 text-primary" /> Academic Registry Active
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 rounded-lg text-[10px] font-bold uppercase tracking-widest gap-2">
          <FileText className="size-3.5" /> Result Slip (PDF)
        </Button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "Cumulative GPA", value: overallGPA.toFixed(2), icon: TrendingUp, progress: (overallGPA / 4.0) * 100 },
          { label: "Avg Performance", value: `${averagePerformance.toFixed(1)}%`, icon: TrendingUp },
          { label: "Best Mark", value: `${bestPerformance?.percentage || 0}%`, icon: Trophy },
          { label: "Total Records", value: results.length, icon: FileText },
        ].map((stat, i) => (
          <Card key={i} className="shadow-none border-muted/20 bg-muted/5 rounded-xl overflow-hidden border-none">
            <CardContent className="p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</span>
                <stat.icon className="size-3 text-primary/40" />
              </div>
              <div className="text-2xl font-bold text-primary tracking-tight">{stat.value}</div>
              {stat.progress !== undefined && (
                <div className="pt-0.5">
                   <Progress value={stat.progress} className="h-1 bg-primary/10" />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Ledger */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b pb-2">
          <TabsList className="bg-muted/40 p-0.5 rounded-lg w-fit h-8 border shadow-none">
            <TabsTrigger value="all" className="text-[10px] font-bold uppercase tracking-widest px-3 h-7">Ledger</TabsTrigger>
            <TabsTrigger value="graded" className="text-[10px] font-bold uppercase tracking-widest px-3 h-7">Graded</TabsTrigger>
            <TabsTrigger value="pending" className="text-[10px] font-bold uppercase tracking-widest px-3 h-7">Review</TabsTrigger>
            <TabsTrigger value="violations" className="text-[10px] font-bold uppercase tracking-widest px-3 h-7 text-red-600 data-[state=active]:bg-red-600 data-[state=active]:text-white">Violations</TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
               <ArrowUpDown className="size-3 text-muted-foreground" />
               <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-7 text-[10px] font-bold uppercase w-32 border-none bg-muted/30 shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="newest" className="text-[10px] font-bold uppercase">Newest First</SelectItem>
                     <SelectItem value="oldest" className="text-[10px] font-bold uppercase">Oldest First</SelectItem>
                     <SelectItem value="highest" className="text-[10px] font-bold uppercase">Highest Mark</SelectItem>
                     <SelectItem value="lowest" className="text-[10px] font-bold uppercase">Lowest Mark</SelectItem>
                  </SelectContent>
               </Select>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              <Filter className="size-3" /> Modules
            </div>
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-4">
           {filteredAndSortedResults.length === 0 ? (
             <div className="py-16 text-center border-2 border-dashed rounded-xl bg-muted/5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">No matching registry items.</p>
             </div>
           ) : (
             <div className="space-y-5">
               {Object.entries(groupedResults).map(([course, courseResults]: any) => (
                  <div key={course} className="space-y-1.5">
                    <div className="flex items-center gap-2 px-1">
                       <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{course}</h2>
                       <div className="h-px flex-1 bg-muted/30" />
                       <span className="text-[8px] font-bold text-muted-foreground/40 uppercase">{courseResults.length} Items</span>
                    </div>
                    <Card className="shadow-none border-muted/20 rounded-xl overflow-hidden">
                       <div className="divide-y divide-muted/10">
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
      <Card className="bg-amber-50/20 border-amber-100/50 rounded-xl overflow-hidden shadow-none">
        <CardContent className="p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-start gap-2">
             <AlertCircle className="size-3.5 text-amber-600 mt-0.5" />
             <p className="text-[10px] text-amber-900/60 font-semibold leading-tight max-w-xl">
               Formal manual review requests (appeals) must be registered within 7 business days of result release. Institutional authority remains final.
             </p>
          </div>
          <Button variant="outline" size="sm" className="h-7 rounded-lg text-[10px] font-bold uppercase tracking-widest border-amber-200 text-amber-800 hover:bg-amber-100/50 shadow-none shrink-0">
            Review Appeals
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
