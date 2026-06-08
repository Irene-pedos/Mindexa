// app/lecturer/grading/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Search,
  BrainCircuit,
  Filter,
  Users,
  RefreshCcw,
  Clock,
  ChevronRight,
  Scale,
  Loader2,
  Send,
  User,
  Layers,
  ArrowUpDown,
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
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { AIReviewPanel } from "@/components/mindexa/grading/ai-review-panel";
import { AIFeedbackEditor } from "@/components/mindexa/grading/ai-feedback-editor";
import { RubricGradingPanel } from "@/components/mindexa/grading/rubric-grading-panel";
import { ModerationPanel } from "@/components/mindexa/grading/moderation-panel";
import { ResultReleasePanel } from "@/components/mindexa/grading/result-release-panel";
import { GroupSubmissionList } from "@/components/mindexa/grading/group-submission-list";

export default function LecturerGradingQueue() {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

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

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page_size: 50, sort_by: sortBy };
      if (assessmentId !== "all") params.assessment_id = assessmentId;
      if (classSectionId !== "all") params.class_section_id = classSectionId;
      if (questionType !== "all") params.question_type = questionType;
      if (status !== "all") params.status = status;
      if (debouncedSearch) params.q = debouncedSearch;

      const response = await gradingApi.getGradingQueue(params);
      setData(response.items || []);
      setTotal(response.total || 0);
    } catch (error: any) {
      toast.error("Queue trace failure");
    } finally {
      setLoading(false);
    }
  }, [
    assessmentId,
    classSectionId,
    questionType,
    status,
    sortBy,
    debouncedSearch,
  ]);

  const fetchQuestions = useCallback(async (asmtId: string) => {
    try {
      const res = await assessmentApi.getAssessmentQuestions(asmtId);
      setQuestions(res || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "individuals") fetchSubmissions();
  }, [activeTab, fetchSubmissions]);

  useEffect(() => {
    if (moderationAssessmentId !== "all")
      fetchQuestions(moderationAssessmentId);
    else {
      setQuestions([]);
      setModerationQuestionId(null);
    }
  }, [moderationAssessmentId, fetchQuestions]);

  const fetchMetadata = async () => {
    try {
      const [asmtRes, wsRes] = await Promise.all([
        assessmentApi.getAssessments({ status: "PUBLISHED" }),
        lecturerApi.getWorkspaces(),
      ]);
      setAssessments(asmtRes.items || []);
      setWorkspaces(wsRes || []);
    } catch (err) {
      console.error(err);
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
      toast.error("Entry acquisition failure");
    }
  };

  const handleSaveDecision = async (
    isFinal: boolean,
    acceptAi: boolean = false,
  ) => {
    if (!selectedStudent) return;
    if (isFinal && !acceptAi && overrideScore === "") {
      toast.error("Score required for finalization");
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
        const parsedScore = parseFloat(overrideScore);
        if (Number.isFinite(parsedScore)) payload.override_score = parsedScore;
        payload.feedback = finalFeedback;
      }

      await gradingApi.saveGrade(selectedStudent.response_id, payload);
      toast.success(isFinal ? "Decision recorded" : "Draft preserved");

      if (isFinal) {
        setSelectedStudent(null);
        fetchSubmissions();
      }
    } catch (e: any) {
      toast.error("Save failure");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRubricChange = (scores: any[]) => {
    setRubricScores(scores);
    const total = scores.reduce((acc, curr) => acc + curr.score, 0);
    setOverrideScore(total.toString());
  };

  const stats = useMemo(
    () => ({
      pending: data.filter((d) => d.status === "PENDING").length,
      aiSuggested: data.filter((d) => d.status === "AI_SUGGESTED").length,
      flagged: data.filter((d) => d.is_flagged).length,
    }),
    [data],
  );

  return (
    <div className="max-w-7xl mx-auto space-y-4 p-4 pb-12">
      {/* Precision Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3 px-0.5">
        <div className="space-y-0.5">
          <h1 className="text-lg font-bold tracking-tight text-foreground/90 uppercase">
            Grading Ledger
          </h1>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            {total} pending nodes identified
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-4 bg-muted/5 border border-border/60 rounded-md px-3 py-1">
            <div className="flex items-center gap-1.5 border-r border-border/20 pr-4">
              <span className="text-[8px] font-bold text-amber-600 uppercase">
                Pending
              </span>
              <span className="text-[11px] font-bold tabular-nums">
                {stats.pending}
              </span>
            </div>
            <div className="flex items-center gap-1.5 border-r border-border/20 pr-4">
              <span className="text-[8px] font-bold text-blue-600 uppercase">
                AI-Ready
              </span>
              <span className="text-[11px] font-bold tabular-nums">
                {stats.aiSuggested}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-bold text-red-600 uppercase">
                Flagged
              </span>
              <span className="text-[11px] font-bold tabular-nums">
                {stats.flagged}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSubmissions}
            className="h-7 px-3 text-[10px] font-bold uppercase border-border/60 gap-1.5"
          >
            <RefreshCcw className="size-3 text-primary/60" /> Sync
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/30 p-0.5 rounded-lg w-full md:w-fit h-8.5 overflow-x-auto justify-start border border-border/40">
          <TabsTrigger
            value="individuals"
            className="text-[9px] font-bold uppercase tracking-tight px-3 h-7.5 gap-1.5"
          >
            <User className="size-3 opacity-60" /> Individual
          </TabsTrigger>
          <TabsTrigger
            value="moderation"
            className="text-[9px] font-bold uppercase tracking-tight px-3 h-7.5 gap-1.5"
          >
            <Scale className="size-3 opacity-60" /> Moderation
          </TabsTrigger>
          <TabsTrigger
            value="release"
            className="text-[9px] font-bold uppercase tracking-tight px-3 h-7.5 gap-1.5"
          >
            <Send className="size-3 opacity-60" /> Release
          </TabsTrigger>
          <TabsTrigger
            value="groups"
            className="text-[9px] font-bold uppercase tracking-tight px-3 h-7.5 gap-1.5"
          >
            <Users className="size-3 opacity-60" /> Groups
          </TabsTrigger>
        </TabsList>

        <TabsContent value="individuals" className="mt-3 space-y-3">
          {/* Compact Filter Bar */}
          <div className="bg-card border border-border/60 rounded-md p-1.5 flex flex-wrap items-center gap-1.5 shadow-none">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/40" />
              <Input
                placeholder="Search nodes..."
                className="pl-7 h-7 text-[10px] font-medium border-border/40 shadow-none uppercase placeholder:text-muted-foreground/30 focus-visible:ring-0"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Select value={assessmentId} onValueChange={setAssessmentId}>
              <SelectTrigger className="w-[150px] h-7 text-[9px] font-bold uppercase border-border/40 bg-muted/5">
                <SelectValue placeholder="Assessment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="all"
                  className="text-[9px] font-bold uppercase"
                >
                  All Assessments
                </SelectItem>
                {assessments.map((a) => (
                  <SelectItem
                    key={a.id}
                    value={a.id}
                    className="text-[9px] font-bold uppercase"
                  >
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={classSectionId} onValueChange={setClassSectionId}>
              <SelectTrigger className="w-[130px] h-7 text-[9px] font-bold uppercase border-border/40 bg-muted/5">
                <SelectValue placeholder="Section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="all"
                  className="text-[9px] font-bold uppercase"
                >
                  All Sections
                </SelectItem>
                {workspaces.map((ws) => (
                  <SelectItem
                    key={ws.id}
                    value={ws.id}
                    className="text-[9px] font-bold uppercase"
                  >
                    {ws.class_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={questionType} onValueChange={setQuestionType}>
              <SelectTrigger className="w-[110px] h-7 text-[9px] font-bold uppercase border-border/40 bg-muted/5">
                <SelectValue placeholder="Q-Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="all"
                  className="text-[9px] font-bold uppercase"
                >
                  All Types
                </SelectItem>
                <SelectItem
                  value="SHORT_ANSWER"
                  className="text-[9px] font-bold uppercase"
                >
                  Short Answer
                </SelectItem>
                <SelectItem
                  value="ESSAY"
                  className="text-[9px] font-bold uppercase"
                >
                  Essay
                </SelectItem>
                <SelectItem
                  value="CASE_STUDY"
                  className="text-[9px] font-bold uppercase"
                >
                  Case Study
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[120px] h-7 text-[9px] font-bold uppercase border-border/40 bg-muted/5">
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="size-2.5 opacity-40" />
                  <span>Sort</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="date_asc"
                  className="text-[9px] font-bold uppercase"
                >
                  Oldest First
                </SelectItem>
                <SelectItem
                  value="date_desc"
                  className="text-[9px] font-bold uppercase"
                >
                  Newest First
                </SelectItem>
                <SelectItem
                  value="ai_confidence"
                  className="text-[9px] font-bold uppercase"
                >
                  AI Confidence
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border border-border/60 rounded-md bg-card overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/5">
                <TableRow className="h-8 hover:bg-transparent border-b border-border/40">
                  <TableHead className="text-[8px] font-bold uppercase px-4 text-muted-foreground/50">
                    Node Identifier
                  </TableHead>
                  <TableHead className="text-[8px] font-bold uppercase text-muted-foreground/50">
                    Assessment Context
                  </TableHead>
                  <TableHead className="text-[8px] font-bold uppercase text-muted-foreground/50">
                    Question Trace
                  </TableHead>
                  <TableHead className="text-[8px] font-bold uppercase text-muted-foreground/50">
                    Operational State
                  </TableHead>
                  <TableHead className="text-[8px] font-bold uppercase text-muted-foreground/50">
                    Risk
                  </TableHead>
                  <TableHead className="text-right text-[8px] font-bold uppercase pr-4 text-muted-foreground/50">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i} className="h-10">
                      <TableCell colSpan={6}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-40 text-center text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest"
                    >
                      Inbox Empty • Zero matching nodes identified
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((item) => (
                    <TableRow
                      key={item.id}
                      className="group hover:bg-primary/[0.01] h-10 border-border/10 transition-colors"
                    >
                      <TableCell className="px-4">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-foreground/80 uppercase">
                            {item.student_name}
                          </span>
                          <span className="text-[8px] text-muted-foreground/40 font-bold uppercase">
                            {item.class_section_name || "Global"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-semibold text-foreground/60 line-clamp-1 uppercase">
                            {item.assessment_title}
                          </span>
                          <span className="text-[8px] text-muted-foreground/30 font-bold uppercase">
                            {item.submitted_at
                              ? formatDistanceToNow(
                                  new Date(item.submitted_at),
                                  { addSuffix: true },
                                )
                              : "N/A"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-medium text-foreground/60 line-clamp-1 uppercase">
                            {item.question_title}
                          </span>
                          <span className="text-[8px] font-bold text-primary/40 uppercase">
                            {item.question_type?.replace("_", " ")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[8px] px-1.5 h-3.5 uppercase font-bold border-none",
                              item.status === "AI_SUGGESTED"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-amber-50 text-amber-700",
                            )}
                          >
                            {item.status.replace("_", " ")}
                          </Badge>
                          {item.ai_confidence !== null && (
                            <div className="flex items-center gap-1 opacity-40">
                              <BrainCircuit className="size-2.5" />
                              <span className="text-[9px] font-bold tabular-nums">
                                {Math.round(item.ai_confidence * 100)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div className="w-8 h-0.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full",
                                item.integrity_risk_score > 70
                                  ? "bg-red-500"
                                  : "bg-emerald-500",
                              )}
                              style={{
                                width: `${item.integrity_risk_score || 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-[8px] font-bold text-muted-foreground/30 uppercase">
                            {item.integrity_risk_score || 0}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[8px] font-bold uppercase rounded-md border border-border/40 hover:bg-primary/5 hover:text-primary transition-all group"
                          onClick={() => handleOpenReview(item)}
                        >
                          Trace Audit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="moderation" className="mt-3">
          <Card className="shadow-none border border-border/60 bg-card/30 rounded-md">
            <CardHeader className="p-4 border-b border-border/40 bg-muted/5 flex flex-row items-center gap-4 space-y-0">
              <div className="flex-1 space-y-1">
                <Label className="text-[8px] font-bold uppercase text-muted-foreground/60 tracking-widest">
                  Assessment Reference
                </Label>
                <Select
                  value={moderationAssessmentId}
                  onValueChange={setModerationAssessmentId}
                >
                  <SelectTrigger className="h-8 text-[10px] font-bold uppercase border-border/40 bg-white">
                    <SelectValue placeholder="Reference..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assessments.map((a) => (
                      <SelectItem
                        key={a.id}
                        value={a.id}
                        className="text-[10px] uppercase font-bold"
                      >
                        {a.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {questions.length > 0 && (
                <div className="flex-1 space-y-1">
                  <Label className="text-[8px] font-bold uppercase text-muted-foreground/60 tracking-widest">
                    Question Node
                  </Label>
                  <Select
                    value={moderationQuestionId || ""}
                    onValueChange={setModerationQuestionId}
                  >
                    <SelectTrigger className="h-8 text-[10px] font-bold uppercase border-border/40 bg-white">
                      <SelectValue placeholder="Node..." />
                    </SelectTrigger>
                    <SelectContent>
                      {questions.map((q, idx) => (
                        <SelectItem
                          key={q.id}
                          value={q.id}
                          className="text-[10px] uppercase font-bold"
                        >
                          Q{idx + 1}: {q.title || q.content?.substring(0, 40)}
                          ...
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-4">
              {!moderationQuestionId ? (
                <div className="py-16 text-center text-[10px] font-bold text-muted-foreground/20 uppercase tracking-[0.2em] italic">
                  Awaiting node selection for moderation.
                </div>
              ) : (
                <ModerationPanel questionId={moderationQuestionId} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="release" className="mt-3">
          <Card className="shadow-none border border-border/60 bg-card/30 rounded-md overflow-hidden">
            <CardHeader className="p-4 border-b border-border/40 bg-muted/5 space-y-1">
              <Label className="text-[8px] font-bold uppercase text-muted-foreground/60 tracking-widest">
                Institutional Release Context
              </Label>
              <Select value={assessmentId} onValueChange={setAssessmentId}>
                <SelectTrigger className="h-8 text-[10px] font-bold uppercase border-border/40 bg-white">
                  <SelectValue placeholder="Reference..." />
                </SelectTrigger>
                <SelectContent>
                  {assessments.map((a) => (
                    <SelectItem
                      key={a.id}
                      value={a.id}
                      className="text-[10px] uppercase font-bold"
                    >
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-4">
              {assessmentId === "all" ? (
                <div className="py-16 text-center text-[10px] font-bold text-muted-foreground/20 uppercase tracking-[0.2em] italic">
                  Awaiting release context selection.
                </div>
              ) : (
                <ResultReleasePanel assessmentId={assessmentId} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="groups" className="mt-3">
          <Card className="shadow-none border border-border/60 rounded-md overflow-hidden bg-white">
            <CardHeader className="p-3 border-b border-border/40 bg-muted/5 flex flex-row items-center justify-between">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Collaborative Registry
              </CardTitle>
              <Layers className="size-3 text-muted-foreground/20" />
            </CardHeader>
            <CardContent className="p-8 text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                Group grading is coming soon. Collaborative review is not yet
                available.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Decision Sheet */}
      <Sheet
        open={!!selectedStudent}
        onOpenChange={(open) => !open && setSelectedStudent(null)}
      >
        <SheetContent className="sm:max-w-2xl overflow-y-auto p-0 border-l border-border/40 shadow-2xl rounded-l-xl">
          {selectedStudent && (
            <div className="flex flex-col h-full bg-background">
              <div className="p-5 border-b border-border/40 bg-muted/[0.02]">
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    variant="outline"
                    className="text-[8px] h-3.5 uppercase font-bold border-primary/20 bg-primary/5 text-primary/70"
                  >
                    Response Audit
                  </Badge>
                  <span className="text-[8px] font-bold text-muted-foreground/30 uppercase">
                    {selectedStudent.question_type}
                  </span>
                </div>
                <SheetTitle className="text-base font-bold uppercase tracking-tight text-foreground/90">
                  {selectedStudent.student_name}
                </SheetTitle>
                <SheetDescription className="text-[10px] font-bold text-muted-foreground/60 uppercase mt-0.5">
                  {selectedStudent.assessment_title}
                </SheetDescription>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <section className="space-y-1.5">
                  <Label className="text-[8px] font-bold uppercase text-muted-foreground/40 tracking-widest px-0.5">
                    Pedagogical Node
                  </Label>
                  <div className="text-[13px] font-medium leading-relaxed bg-muted/[0.01] p-3 rounded border border-border/40 italic text-foreground/80">
                    {selectedStudent.question_text}
                  </div>
                </section>

                <section className="space-y-1.5">
                  <Label className="text-[8px] font-bold uppercase text-muted-foreground/40 tracking-widest px-0.5">
                    Input Trace
                  </Label>
                  <div className="text-[13px] leading-relaxed border border-border/60 rounded-md p-4 bg-white/50 shadow-sm whitespace-pre-wrap font-medium">
                    {selectedStudent.student_answer ||
                      "Null response recorded."}
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
                  <div className="space-y-3">
                    <AIReviewPanel
                      queueItemId={selectedStudent.id}
                      responseId={selectedStudent.response_id}
                      maxScore={selectedStudent.max_score || 10}
                      onSuggestionApplied={(score) =>
                        setOverrideScore(score.toString())
                      }
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAiPanel(false)}
                        className="text-[8px] font-bold uppercase text-muted-foreground/30 hover:text-destructive h-5 gap-1.5"
                      >
                        Discard Analysis
                      </Button>
                    </div>
                  </div>
                ) : selectedStudent.ai_suggested_score !== null ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAiPanel(true)}
                    className="w-full text-[9px] font-bold uppercase h-8 border-dashed border-primary/20 bg-primary/[0.01] text-primary/60 hover:bg-primary/[0.03]"
                  >
                    <BrainCircuit className="size-3 mr-2" /> Restore Analysis
                  </Button>
                ) : null}

                <AIFeedbackEditor
                  responseId={selectedStudent.response_id}
                  initialDraft={selectedStudent.ai_feedback_draft}
                  onDraftApplied={(text) => setFinalFeedback(text)}
                />

                <div className="pt-6 border-t border-border/40 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-foreground/60 uppercase tracking-widest">
                      Academic Feedback
                    </Label>
                    <Textarea
                      placeholder="Final trace feedback..."
                      className="text-xs min-h-[80px] border-border/60 bg-muted/[0.01] focus:ring-0 uppercase placeholder:text-muted-foreground/20"
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
                          className="w-20 h-9 text-sm font-bold text-center pl-2 pr-5 border-border/60 focus:ring-0"
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] font-bold text-muted-foreground/40 uppercase">
                          pts
                        </span>
                      </div>
                      <div className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-tighter">
                        Vector Scale: {selectedStudent.max_score} MAX
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pb-6">
                      <Button
                        variant="secondary"
                        onClick={() => handleSaveDecision(false)}
                        disabled={isSaving}
                        className="h-9 text-[10px] font-bold uppercase rounded-md border border-border/40 shadow-none"
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
                        className="h-9 text-[10px] font-bold uppercase rounded-md bg-primary hover:bg-primary/90 text-primary-foreground shadow-none"
                      >
                        Confirm Decision
                      </Button>
                    </div>
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
