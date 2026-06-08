// app/lecturer/grading/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Eye,
  Search,
  CheckCircle2,
  Flag,
  BrainCircuit,
  Filter,
  Users,
  User as UserIcon,
  RefreshCcw,
  Clock,
  AlertTriangle,
  ArrowUpDown,
  ChevronRight,
  MoreVertical,
  Scale,
  Loader2,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { useDebounce } from "@/hooks/use-debounce";

import { gradingApi } from "@/lib/api/grading";
import { lecturerApi, WorkspaceListItem } from "@/lib/api/lecturer";
import { assessmentApi } from "@/lib/api/assessment";
import { apiClient } from "@/lib/api/client";
import { GroupSubmissionList } from "@/components/mindexa/grading/group-submission-list";
import { GroupSubmissionReview } from "@/components/mindexa/grading/group-submission-review";
import { Skeleton } from "@/components/ui/skeleton";
import { AIReviewPanel } from "@/components/mindexa/grading/ai-review-panel";
import { AIFeedbackEditor } from "@/components/mindexa/grading/ai-feedback-editor";
import { RubricGradingPanel } from "@/components/mindexa/grading/rubric-grading-panel";
import { ModerationPanel } from "@/components/mindexa/grading/moderation-panel";
import { ResultReleasePanel } from "@/components/mindexa/grading/result-release-panel";

export default function LecturerGradingQueue() {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters State
  const [assessmentId, setAssessmentId] = useState<string>("all");
  const [classSectionId, setClassSectionId] = useState<string>("all");
  const [questionType, setQuestionType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date_asc");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);

  // Metadata for Filters
  const [assessments, setAssessments] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [activeTab, setActiveTab] = useState("individuals");

  // Selection & Decision
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [overrideScore, setOverrideScore] = useState<string>("");
  const [finalFeedback, setFinalFeedback] = useState<string>("");
  const [rubricScores, setRubricScores] = useState<any[]>([]);
  const [reviewStartedAt, setReviewStartedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(true);

  // Moderation state
  const [moderationQuestionId, setModerationQuestionId] = useState<
    string | null
  >(null);
  const [moderationAssessmentId, setModerationAssessmentId] =
    useState<string>("all");
  const [questions, setQuestions] = useState<any[]>([]);

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    if (activeTab === "individuals") {
      fetchSubmissions();
    }
  }, [
    activeTab,
    assessmentId,
    classSectionId,
    questionType,
    status,
    sortBy,
    debouncedSearch,
  ]);

  useEffect(() => {
    if (moderationAssessmentId !== "all") {
      fetchQuestions(moderationAssessmentId);
    } else {
      setQuestions([]);
      setModerationQuestionId(null);
    }
  }, [moderationAssessmentId]);

  const fetchMetadata = async () => {
    try {
      const [asmtRes, wsRes] = await Promise.all([
        assessmentApi.getAssessments({ status: "PUBLISHED" }),
        lecturerApi.getWorkspaces(),
      ]);
      setAssessments(asmtRes.items || []);
      setWorkspaces(wsRes || []);
    } catch (err) {
      console.error("Failed to load filter metadata", err);
    }
  };

  const fetchQuestions = async (asmtId: string) => {
    try {
      const res = await assessmentApi.getAssessmentQuestions(asmtId);
      setQuestions(res || []);
    } catch (err) {
      console.error("Failed to load questions", err);
    }
  };

  const fetchSubmissions = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params: any = {
        page_size: 50,
        sort_by: sortBy,
      };
      if (assessmentId !== "all") params.assessment_id = assessmentId;
      if (classSectionId !== "all") params.class_section_id = classSectionId;
      if (questionType !== "all") params.question_type = questionType;
      if (status !== "all") params.status = status;
      if (debouncedSearch) params.q = debouncedSearch;

      const response = await gradingApi.getGradingQueue(params);
      setData(response.items || []);
      setTotal(response.total || 0);
    } catch (error: any) {
      setLoadError(error.message || "Could not load grading queue");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReview = async (item: any) => {
    try {
      const detail = await gradingApi.getGradeDetail(item.response_id);
      setSelectedStudent({ ...item, ...detail });
      setOverrideScore(
        detail.ai_suggested_score?.toString() || detail.score?.toString() || "",
      );
      setFinalFeedback(detail.feedback || "");
      setRubricScores(detail.rubric_scores || []);
      setReviewStartedAt(new Date());
      setShowAiPanel(true);
    } catch (e) {
      toast.error("Failed to load details");
    }
  };

  const handleSaveDecision = async (
    isFinal: boolean,
    acceptAi: boolean = false,
  ) => {
    if (!selectedStudent) return;

    if (isFinal && !acceptAi && overrideScore === "") {
      toast.error("Please enter a score before finalizing.");
      return;
    }

    setIsSaving(true);
    try {
      const duration = reviewStartedAt
        ? Math.floor((new Date().getTime() - reviewStartedAt.getTime()) / 1000)
        : 0;

      const payload: any = {
        accept_ai_suggestion: acceptAi,
        is_final: isFinal,
        review_started_at: reviewStartedAt?.toISOString(),
        review_duration_seconds: duration,
        rubric_scores: rubricScores,
      };

      if (!acceptAi) {
        payload.override_score = parseFloat(overrideScore);
        payload.feedback = finalFeedback;
      }

      await gradingApi.saveGrade(selectedStudent.response_id, payload);

      toast.success(
        isFinal ? "Academic decision finalized" : "Draft saved successfully",
      );

      if (isFinal) {
        setSelectedStudent(null);
        fetchSubmissions();
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save grade");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRubricChange = (scores: any[]) => {
    setRubricScores(scores);
    const total = scores.reduce((acc, curr) => acc + curr.score, 0);
    setOverrideScore(total.toString());
  };

  const stats = useMemo(() => {
    return {
      pending: data.filter((d) => d.status === "PENDING").length,
      aiSuggested: data.filter((d) => d.status === "AI_SUGGESTED").length,
      flagged: data.filter((d) => d.is_flagged).length,
    };
  }, [data]);

  return (
    <div className="space-y-4 pb-10 max-w-[1600px] mx-auto">
      {/* Dense Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground/90">
            Grading & Moderation
          </h1>
          <p className="text-[11px] text-muted-foreground uppercase font-medium tracking-wider">
            {total} items pending • Unified Workspace
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted/30 border rounded-md px-2 py-1 gap-4">
            <div className="flex items-center gap-1.5 border-r pr-4">
              <span className="text-[10px] font-bold text-amber-600 uppercase">
                Pending
              </span>
              <span className="text-xs font-mono font-bold">
                {stats.pending}
              </span>
            </div>
            <div className="flex items-center gap-1.5 border-r pr-4">
              <span className="text-[10px] font-bold text-blue-600 uppercase">
                AI Ready
              </span>
              <span className="text-xs font-mono font-bold">
                {stats.aiSuggested}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-red-600 uppercase">
                Flagged
              </span>
              <span className="text-xs font-mono font-bold">
                {stats.flagged}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSubmissions}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCcw className="size-3" /> Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/50 p-1 h-10 w-full max-w-xl border shadow-sm pl-30">
          <TabsTrigger
            value="individuals"
            className="flex-1 rounded-md text-[10px] font-bold uppercase tracking-widest gap-2"
          >
            <UserIcon className="size-3.5" /> Individual Submissions
          </TabsTrigger>
          <TabsTrigger
            value="moderation"
            className="flex-1 rounded-md text-[10px] font-bold uppercase tracking-widest gap-2"
          >
            <Scale className="size-3.5" /> Institutional Moderation
          </TabsTrigger>
          <TabsTrigger
            value="release"
            className="flex-1 rounded-md text-[10px] font-bold uppercase tracking-widest gap-2"
          >
            <Send className="size-3.5" /> Release Management
          </TabsTrigger>
          <TabsTrigger
            value="groups"
            className="flex-1 rounded-md text-[10px] font-bold uppercase tracking-widest gap-2"
          >
            <Users className="size-3.5" /> Group Work
          </TabsTrigger>
        </TabsList>

        <TabsContent value="individuals" className="mt-4 space-y-4">
          <div className="bg-card border rounded-lg p-2 shadow-sm flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60" />
              <Input
                placeholder="Search student or assessment..."
                className="pl-8 h-8 text-xs border-muted shadow-none bg-muted/10 focus-visible:ring-1"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Select value={assessmentId} onValueChange={setAssessmentId}>
              <SelectTrigger className="w-[180px] h-8 text-xs border-muted bg-transparent">
                <SelectValue placeholder="Assessment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assessments</SelectItem>
                {assessments.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={classSectionId} onValueChange={setClassSectionId}>
              <SelectTrigger className="w-[150px] h-8 text-xs border-muted bg-transparent">
                <SelectValue placeholder="Class Section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id} className="text-xs">
                    {ws.class_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={questionType} onValueChange={setQuestionType}>
              <SelectTrigger className="w-[130px] h-8 text-xs border-muted bg-transparent">
                <SelectValue placeholder="Q-Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="SHORT_ANSWER" className="text-xs">
                  Short Answer
                </SelectItem>
                <SelectItem value="ESSAY" className="text-xs">
                  Essay
                </SelectItem>
                <SelectItem value="CASE_STUDY" className="text-xs">
                  Case Study
                </SelectItem>
                <SelectItem value="COMPUTATIONAL" className="text-xs">
                  Computational
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[140px] h-8 text-xs border-muted bg-transparent">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <ArrowUpDown className="size-3" />
                  <span>Sort</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date_asc" className="text-xs">
                  Oldest First
                </SelectItem>
                <SelectItem value="date_desc" className="text-xs">
                  Newest First
                </SelectItem>
                <SelectItem value="ai_confidence" className="text-xs">
                  AI Confidence
                </SelectItem>
                <SelectItem value="risk_level" className="text-xs">
                  Security Risk
                </SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
            >
              <Filter className="size-3.5 mr-1.5" />
              <span className="text-xs">More Filters</span>
            </Button>
          </div>

          <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider h-9">
                    Student & Section
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider h-9">
                    Assessment Context
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider h-9">
                    Question Metadata
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider h-9">
                    System State
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider h-9">
                    Risk/Priority
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider h-9 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i} className="h-12">
                      <TableCell colSpan={7}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-40 text-center text-muted-foreground text-sm"
                    >
                      Your inbox is empty. No pending grading items match these
                      filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((item) => (
                    <TableRow
                      key={item.id}
                      className="group hover:bg-muted/10 h-11 border-b transition-colors"
                    >
                      <TableCell className="py-0 px-2 text-center">
                        {item.is_flagged && (
                          <Flag className="size-3.5 text-red-500 fill-red-500" />
                        )}
                      </TableCell>
                      <TableCell className="py-0">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-foreground/90 leading-tight">
                            {item.student_name}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Users className="size-2.5" />{" "}
                            {item.class_section_name || "Global Section"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-0">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-foreground/80 line-clamp-1">
                            {item.assessment_title}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="size-2.5" />
                            {item.submitted_at
                              ? formatDistanceToNow(
                                  new Date(item.submitted_at),
                                  { addSuffix: true },
                                )
                              : "N/A"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-0">
                        <div className="flex flex-col">
                          <span className="text-xs text-foreground/80 line-clamp-1">
                            {item.question_title || "Untitled Question"}
                          </span>
                          <span className="text-[9px] font-bold uppercase text-muted-foreground tracking-tight">
                            {item.question_type?.replace("_", " ")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] px-1.5 py-0 h-4 uppercase font-bold tracking-tighter border-muted-foreground/20",
                              item.status === "AI_SUGGESTED"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : item.status === "PENDING"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            {item.status.replace("_", " ")}
                          </Badge>
                          {item.ai_confidence !== null && (
                            <div
                              className="flex items-center gap-1"
                              title={`AI Confidence: ${Math.round(item.ai_confidence * 100)}%`}
                            >
                              <BrainCircuit
                                className={cn(
                                  "size-3",
                                  item.ai_confidence > 0.8
                                    ? "text-emerald-500"
                                    : "text-amber-500",
                                )}
                              />
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {Math.round(item.ai_confidence * 100)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-0">
                        {item.integrity_risk_score > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-10 h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  item.integrity_risk_score > 70
                                    ? "bg-red-500"
                                    : item.integrity_risk_score > 30
                                      ? "bg-amber-500"
                                      : "bg-emerald-500",
                                )}
                                style={{
                                  width: `${item.integrity_risk_score}%`,
                                }}
                              />
                            </div>
                            <span className="text-[9px] font-bold text-muted-foreground">
                              {item.integrity_risk_score}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-tight">
                            Normal
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-0 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleOpenReview(item)}
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="moderation" className="mt-4 space-y-6">
          <div className="bg-card border rounded-lg p-3 shadow-sm space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1">
                <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">
                  Select Assessment to Moderate
                </Label>
                <Select
                  value={moderationAssessmentId}
                  onValueChange={setModerationAssessmentId}
                >
                  <SelectTrigger className="w-full h-10 border-muted bg-muted/10">
                    <SelectValue placeholder="Choose an assessment..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Choose Assessment...</SelectItem>
                    {assessments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {questions.length > 0 && (
                <div className="flex-1 space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">
                    Select Question
                  </Label>
                  <Select
                    value={moderationQuestionId || ""}
                    onValueChange={setModerationQuestionId}
                  >
                    <SelectTrigger className="w-full h-10 border-muted bg-muted/10">
                      <SelectValue placeholder="Choose a question..." />
                    </SelectTrigger>
                    <SelectContent>
                      {questions.map((q, idx) => (
                        <SelectItem key={q.id} value={q.id}>
                          Q{idx + 1}:{" "}
                          {q.title || q.question_text?.substring(0, 50)}...
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {!moderationQuestionId ? (
              <div className="py-20 text-center border-2 border-dashed rounded-lg bg-muted/5">
                <Scale className="size-10 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-sm text-muted-foreground font-medium">
                  Select an assessment and question above to view distribution
                  and perform moderation.
                </p>
              </div>
            ) : (
              <ModerationPanel questionId={moderationQuestionId} />
            )}
          </div>
        </TabsContent>

        <TabsContent value="release" className="mt-4 space-y-6">
          <div className="bg-card border rounded-lg p-3 shadow-sm space-y-4">
            <div className="space-y-1">
              <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">
                Select Assessment to Manage Release
              </Label>
              <Select value={assessmentId} onValueChange={setAssessmentId}>
                <SelectTrigger className="w-full h-10 border-muted bg-muted/10">
                  <SelectValue placeholder="Choose an assessment..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Choose Assessment...</SelectItem>
                  {assessments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {assessmentId === "all" ? (
              <div className="py-20 text-center border-2 border-dashed rounded-lg bg-muted/5">
                <Send className="size-10 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-sm text-muted-foreground font-medium">
                  Select an assessment above to manage result publication and
                  integrity holds.
                </p>
              </div>
            ) : (
              <ResultReleasePanel assessmentId={assessmentId} />
            )}
          </div>
        </TabsContent>

        <TabsContent value="groups" className="mt-4">
          {/* Re-use existing group work logic but styled as a dense list */}
          <Card className="shadow-none border">
            <CardHeader className="py-3 border-b bg-muted/5">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Collaborative Workflow Queue
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <GroupSubmissionList
                submissions={[]} // This would be fetched separately
                onReview={() => {}}
                loading={false}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail View Sheet */}
      <Sheet
        open={!!selectedStudent}
        onOpenChange={(open) => !open && setSelectedStudent(null)}
      >
        <SheetContent className="sm:max-w-2xl overflow-y-auto p-0 gap-0">
          {selectedStudent && (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b bg-muted/10">
                <SheetHeader>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase text-primary tracking-widest bg-primary/10 px-1.5 py-0.5 rounded">
                      Response Review
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[9px] h-4 uppercase"
                    >
                      {selectedStudent.question_type}
                    </Badge>
                  </div>
                  <SheetTitle className="text-lg font-semibold tracking-tight leading-tight">
                    {selectedStudent.student_name}
                  </SheetTitle>
                  <SheetDescription className="text-xs">
                    {selectedStudent.assessment_title} • Submitted{" "}
                    {selectedStudent.submitted_at &&
                      formatDistanceToNow(
                        new Date(selectedStudent.submitted_at),
                        { addSuffix: true },
                      )}
                  </SheetDescription>
                </SheetHeader>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <section className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    Original Question
                  </Label>
                  <div className="text-sm text-foreground/90 font-medium leading-relaxed bg-muted/5 p-3 rounded border italic">
                    {selectedStudent.question_text ||
                      "Question text not available."}
                  </div>
                </section>

                <section className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    Student Response
                  </Label>
                  <div className="text-sm leading-relaxed border rounded-lg p-4 bg-background shadow-sm whitespace-pre-wrap">
                    {selectedStudent.student_answer ||
                      "Student did not provide an answer."}
                  </div>
                </section>

                {selectedStudent.rubric && (
                  <RubricGradingPanel
                    rubric={selectedStudent.rubric}
                    currentScores={rubricScores}
                    onScoresChange={handleRubricChange}
                  />
                )}

                {showAiPanel && selectedStudent.ai_suggested_score !== null ? (
                  <div className="space-y-4">
                    <AIReviewPanel
                      queueItemId={selectedStudent.id}
                      responseId={selectedStudent.response_id}
                      maxScore={selectedStudent.max_score || 10}
                      onSuggestionApplied={(score) =>
                        setOverrideScore(score.toString())
                      }
                    />
                    <div className="flex justify-end px-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAiPanel(false)}
                        className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground hover:text-destructive h-6 gap-1.5"
                      >
                        <Flag className="size-2.5" /> Discard AI Analysis
                      </Button>
                    </div>
                  </div>
                ) : selectedStudent.ai_suggested_score !== null ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAiPanel(true)}
                    className="w-full text-[10px] font-bold uppercase tracking-widest h-8 border-dashed bg-primary/5 text-primary border-primary/20 hover:bg-primary/10"
                  >
                    <BrainCircuit className="size-3 mr-2" /> Restore AI Grading
                    Proposal
                  </Button>
                ) : null}

                <AIFeedbackEditor
                  responseId={selectedStudent.response_id}
                  initialDraft={selectedStudent.ai_feedback_draft}
                  onDraftApplied={(text) => setFinalFeedback(text)}
                />

                <div className="pt-6 border-t space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                      Lecturer Final Marks & Feedback
                    </Label>
                    <Textarea
                      placeholder="Feedback visible to student..."
                      className="text-xs min-h-[80px] bg-muted/10 focus-visible:ring-1 border-muted"
                      value={finalFeedback}
                      onChange={(e) => setFinalFeedback(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Input
                          type="number"
                          value={overrideScore}
                          onChange={(e) => setOverrideScore(e.target.value)}
                          className="w-24 h-10 text-base font-bold text-center pl-2 pr-6 border-muted focus-visible:ring-1"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground uppercase">
                          pts
                        </span>
                      </div>
                      <div className="flex-1 text-xs text-muted-foreground font-medium italic">
                        Out of {selectedStudent.max_score} marks total
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => handleSaveDecision(false)}
                        disabled={isSaving}
                        className="h-9 text-[10px] font-bold uppercase tracking-wider bg-secondary/50 hover:bg-secondary border-muted shadow-none"
                      >
                        {isSaving ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          "Save Draft"
                        )}
                      </Button>
                      <Button
                        onClick={() => handleSaveDecision(true)}
                        disabled={isSaving}
                        className="h-9 text-[10px] font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-none"
                      >
                        {isSaving ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          "Confirm Decision"
                        )}
                      </Button>
                    </div>

                    {selectedStudent.ai_suggested_score !== null && (
                      <Button
                        variant="outline"
                        onClick={() => handleSaveDecision(true, true)}
                        disabled={isSaving}
                        className="h-9 text-[10px] font-bold uppercase tracking-wider border-primary/30 text-primary hover:bg-primary/5 shadow-none"
                      >
                        Accept AI Suggestion (
                        {selectedStudent.ai_suggested_score})
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
