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
    <div className="space-y-6">
      {/* Precision Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Grading Queue
          </h1>
          <p className="text-sm text-muted-foreground">
            {total} pending submission{total !== 1 ? "s" : ""} awaiting review and evaluation
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden md:flex items-center gap-3 bg-muted/20 border border-border/50 rounded-xl p-1 px-3 h-9">
            <div className="flex items-center gap-1.5 border-r border-border/20 pr-3 h-5">
              <span className="size-2 rounded-full bg-amber-500" />
              <span className="text-xs font-semibold text-foreground/80">Pending:</span>
              <span className="text-xs font-bold tabular-nums">{stats.pending}</span>
            </div>
            <div className="flex items-center gap-1.5 border-r border-border/20 pr-3 h-5">
              <span className="size-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs font-semibold text-foreground/80">AI-Ready:</span>
              <span className="text-xs font-bold tabular-nums">{stats.aiSuggested}</span>
            </div>
            <div className="flex items-center gap-1.5 h-5">
              <span className="size-2 rounded-full bg-red-500" />
              <span className="text-xs font-semibold text-foreground/80">Flagged:</span>
              <span className="text-xs font-bold tabular-nums">{stats.flagged}</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSubmissions}
            className="h-9 px-4 text-xs font-medium border-border/60 gap-1.5 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <RefreshCcw className="size-3.5 text-muted-foreground" /> Sync Queue
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/30 p-1 rounded-xl w-full md:w-fit h-11 overflow-x-auto justify-start border border-border/40">
          <TabsTrigger
            value="individuals"
            className="text-xs font-medium px-4 py-2 rounded-lg gap-1.5 transition-all"
          >
            <User className="size-3.5 opacity-80" /> Individuals
          </TabsTrigger>
          <TabsTrigger
            value="moderation"
            className="text-xs font-medium px-4 py-2 rounded-lg gap-1.5 transition-all"
          >
            <Scale className="size-3.5 opacity-80" /> Moderation
          </TabsTrigger>
          <TabsTrigger
            value="release"
            className="text-xs font-medium px-4 py-2 rounded-lg gap-1.5 transition-all"
          >
            <Send className="size-3.5 opacity-80" /> Release Results
          </TabsTrigger>
          <TabsTrigger
            value="groups"
            className="text-xs font-medium px-4 py-2 rounded-lg gap-1.5 transition-all"
          >
            <Users className="size-3.5 opacity-80" /> Group Submissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="individuals" className="mt-4 space-y-4">
          {/* Compact Filter Bar */}
          <div className="bg-card/30 border border-border/50 rounded-xl p-2.5 flex flex-wrap items-center gap-2.5 backdrop-blur-sm shadow-none">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60" />
              <Input
                placeholder="Search students, assessments..."
                className="pl-9 h-9 text-xs border-border/60 bg-background/50 hover:bg-background/85 transition-all rounded-lg focus-visible:ring-1"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={assessmentId} onValueChange={setAssessmentId}>
                <SelectTrigger className="w-[170px] h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/85 transition-colors">
                  <SelectValue placeholder="Assessment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assessments</SelectItem>
                  {assessments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={classSectionId} onValueChange={setClassSectionId}>
                <SelectTrigger className="w-[140px] h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/85 transition-colors">
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {workspaces.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id}>{ws.class_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={questionType} onValueChange={setQuestionType}>
                <SelectTrigger className="w-[120px] h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/85 transition-colors">
                  <SelectValue placeholder="Q-Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="SHORT_ANSWER">Short Answer</SelectItem>
                  <SelectItem value="ESSAY">Essay</SelectItem>
                  <SelectItem value="CASE_STUDY">Case Study</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[130px] h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/85 transition-colors">
                  <div className="flex items-center gap-1.5">
                    <ArrowUpDown className="size-3.5 opacity-60" />
                    <span>Sort</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_asc">Oldest First</SelectItem>
                  <SelectItem value="date_desc">Newest First</SelectItem>
                  <SelectItem value="ai_confidence">AI Confidence</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-none">
            <Table>
              <TableHeader className="bg-muted/15 border-b border-border/40">
                <TableRow className="h-10 hover:bg-transparent border-none">
                  <TableHead className="text-xs font-semibold px-4 text-muted-foreground">
                    Student
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">
                    Assessment Context
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">
                    Question Trace
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">
                    Integrity Risk
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold pr-4 text-muted-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i} className="h-12 border-border/10">
                      <TableCell colSpan={6} className="px-4">
                        <Skeleton className="h-5 w-full rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-44 text-center text-sm font-medium text-muted-foreground"
                    >
                      <div className="flex flex-col items-center justify-center gap-3">
                        <Users className="size-8 opacity-20" />
                        <p>Grading queue is empty. No submissions require manual review.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((item) => (
                    <TableRow
                      key={item.id}
                      className="group hover:bg-primary/5 h-12 border-border/10 transition-all duration-200"
                    >
                      <TableCell className="px-4 py-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-foreground/90 group-hover:text-primary transition-colors">
                            {item.student_name}
                          </span>
                          <span className="text-[11px] text-muted-foreground/60">
                            {item.class_section_name || "Global Course"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground/85 line-clamp-1">
                            {item.assessment_title}
                          </span>
                          <span className="text-[10px] text-muted-foreground/55 flex items-center gap-1">
                            <Clock className="size-3 opacity-60" />
                            {item.submitted_at
                              ? formatDistanceToNow(
                                  new Date(item.submitted_at),
                                  { addSuffix: true },
                                )
                              : "N/A"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground/80 line-clamp-1">
                            {item.question_title}
                          </span>
                          <span className="text-[10px] font-semibold text-primary/70 capitalize">
                            {item.question_type?.replace("_", " ").toLowerCase()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-2.5 py-0.5 rounded-full capitalize font-semibold shadow-none border",
                              item.status === "AI_SUGGESTED"
                                ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                : "bg-amber-500/10 text-amber-600 border-amber-500/20",
                            )}
                          >
                            <span className={cn(
                              "size-1.5 rounded-full mr-1.5 inline-block",
                              item.status === "AI_SUGGESTED" ? "bg-blue-500 animate-pulse" : "bg-amber-500"
                            )} />
                            {item.status.replace("_", " ").toLowerCase()}
                          </Badge>
                          {item.ai_confidence !== null && (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                              <BrainCircuit className="size-3" />
                              <span className="font-semibold tabular-nums">
                                {Math.round(item.ai_confidence * 100)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden shrink-0 border border-border/20">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                item.integrity_risk_score > 70
                                  ? "bg-red-500"
                                  : item.integrity_risk_score > 30
                                    ? "bg-amber-500"
                                    : "bg-emerald-500",
                              )}
                              style={{
                                width: `${item.integrity_risk_score || 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-semibold tabular-nums text-muted-foreground/80">
                            {item.integrity_risk_score || 0}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-4 py-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs font-medium rounded-lg border-border/60 hover:bg-primary hover:text-primary-foreground hover:border-primary active:scale-95 transition-all duration-300 h-8"
                          onClick={() => handleOpenReview(item)}
                        >
                          Grade
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="moderation" className="mt-4">
          <Card className="shadow-none border border-border/50 bg-card/25 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm">
            <CardHeader className="p-4 border-b border-border/30 bg-muted/10 flex flex-col sm:flex-row items-start sm:items-center gap-4 space-y-0">
              <div className="flex-1 w-full space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground/80">
                  Select Assessment
                </Label>
                <Select
                  value={moderationAssessmentId}
                  onValueChange={setModerationAssessmentId}
                >
                  <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
                    <SelectValue placeholder="Choose assessment..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assessments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {questions.length > 0 && (
                <div className="flex-1 w-full space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground/80">
                    Select Question Node
                  </Label>
                  <Select
                    value={moderationQuestionId || ""}
                    onValueChange={setModerationQuestionId}
                  >
                    <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
                      <SelectValue placeholder="Choose question..." />
                    </SelectTrigger>
                    <SelectContent>
                      {questions.map((q, idx) => (
                        <SelectItem key={q.id} value={q.id}>
                          Q{idx + 1}: {q.title || q.content?.substring(0, 45)}...
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-5">
              {!moderationQuestionId ? (
                <div className="py-20 text-center text-sm font-medium text-muted-foreground">
                  <p className="italic">Awaiting node selection for moderation review.</p>
                </div>
              ) : (
                <ModerationPanel questionId={moderationQuestionId} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="release" className="mt-4">
          <Card className="shadow-none border border-border/50 bg-card/25 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm">
            <CardHeader className="p-4 border-b border-border/30 bg-muted/10 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground/80">
                Select Release Assessment Context
              </Label>
              <Select value={assessmentId} onValueChange={setAssessmentId}>
                <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
                  <SelectValue placeholder="Choose assessment..." />
                </SelectTrigger>
                <SelectContent>
                  {assessments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-5">
              {assessmentId === "all" ? (
                <div className="py-20 text-center text-sm font-medium text-muted-foreground">
                  <p className="italic">Awaiting release context selection.</p>
                </div>
              ) : (
                <ResultReleasePanel assessmentId={assessmentId} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="groups" className="mt-4">
          <Card className="shadow-none border border-border/50 bg-card/25 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm">
            <CardHeader className="p-4 border-b border-border/30 bg-muted/10 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Collaborative Submissions Registry
              </CardTitle>
              <Layers className="size-4 text-muted-foreground/40" />
            </CardHeader>
            <CardContent className="p-16 text-center space-y-3">
              <Users className="size-10 text-muted-foreground/35 mx-auto" />
              <p className="text-sm font-medium text-muted-foreground max-w-md mx-auto">
                Group grading and collaborative reviews are currently in development.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Decision Sheet */}
      <Sheet
        open={!!selectedStudent}
        onOpenChange={(open) => !open && setSelectedStudent(null)}
      >
        <SheetContent className="sm:max-w-2xl overflow-y-auto p-0 border-l border-border/40 shadow-2xl rounded-l-2xl">
          {selectedStudent && (
            <div className="flex flex-col h-full bg-background font-sans">
              <div className="p-6 border-b border-border/45 bg-muted/15">
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge
                    variant="outline"
                    className="text-xs px-2.5 py-0.5 rounded-full font-semibold border-primary/20 bg-primary/5 text-primary/70 shadow-none capitalize"
                  >
                    Response Audit
                  </Badge>
                  <span className="text-xs font-semibold text-muted-foreground/60 capitalize">
                    {selectedStudent.question_type?.replace("_", " ").toLowerCase()}
                  </span>
                </div>
                <SheetTitle className="text-xl font-semibold tracking-tight text-foreground/90 leading-tight">
                  {selectedStudent.student_name}
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground mt-1 font-medium">
                  {selectedStudent.assessment_title}
                </SheetDescription>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground/80">
                    Question Node Description
                  </Label>
                  <div className="text-sm leading-relaxed bg-muted/15 p-4 rounded-xl border border-border/40 text-foreground/85">
                    {selectedStudent.question_text}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground/80">
                    Student Response Trace
                  </Label>
                  <div className="text-sm leading-relaxed border border-border/50 rounded-xl p-4 bg-background shadow-sm whitespace-pre-wrap text-foreground/90">
                    {selectedStudent.student_answer || (
                      <span className="italic text-muted-foreground">No response recorded.</span>
                    )}
                  </div>
                </div>

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
                        className="text-xs font-medium text-destructive hover:bg-destructive/10 rounded-lg h-7 gap-1.5"
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
                    className="w-full text-xs font-medium h-9 border-dashed border-primary/20 bg-primary/[0.01] text-primary/70 hover:bg-primary/[0.03] rounded-lg"
                  >
                    <BrainCircuit className="size-3.5 mr-2" /> Restore Analysis
                  </Button>
                ) : null}

                <AIFeedbackEditor
                  responseId={selectedStudent.response_id}
                  initialDraft={selectedStudent.ai_feedback_draft}
                  onDraftApplied={(text) => setFinalFeedback(text)}
                />

                <div className="pt-6 border-t border-border/40 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground/80">
                      Lecturer Evaluation Feedback
                    </Label>
                    <Textarea
                      placeholder="Provide detailed feedback on this response..."
                      className="text-sm min-h-[90px] border-border/60 bg-muted/10 focus-visible:ring-1 transition-colors rounded-xl"
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
                          className="w-24 h-10 text-sm font-semibold text-center pr-7 border-border/60 rounded-lg"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground/60 select-none">
                          pts
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground/65">
                        out of {selectedStudent.max_score} Maximum
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pb-8 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => handleSaveDecision(false)}
                        disabled={isSaving}
                        className="h-10 text-xs font-medium rounded-lg border-border/60 hover:bg-muted/40 shadow-sm"
                      >
                        {isSaving ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          "Save Draft"
                        )}
                      </Button>
                      <Button
                        onClick={() => handleSaveDecision(true)}
                        disabled={isSaving}
                        className="h-10 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground shadow-md transition-all"
                      >
                        Confirm Evaluation
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
