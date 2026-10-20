// frontend/app/lecturer/question-bank/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Database,
  ArrowRight,
  Upload,
  Sigma,
  Table as TableIcon,
} from "lucide-react";
import Image from "next/image";
import {
  questionApi,
  QuestionBankItem,
  QuestionOption,
  QuestionCreateRequest,
} from "@/lib/api/question";
import { lecturerApi } from "@/lib/api/lecturer";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { MathEditorDialog } from "@/components/mindexa/common/math-editor-dialog";
import { TableEditor } from "@/components/mindexa/assessment/table-editor";
import { TableContextViewer } from "@/components/mindexa/common/table-context-viewer";
import { renderRichMathText } from "@/components/mindexa/common/math-renderer";

export default function LecturerQuestionBank() {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [filterType, setFilterType] = useState("all");
  const [filterDifficulty, setFilterDifficulty] = useState("all");
  const [filterCourse, setFilterCourse] = useState("all");
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Preview Dialog State
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<QuestionBankItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Form Dialog State (Add/Edit)
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setFormEditingId] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [showTableStemEditor, setShowTableStemEditor] = useState(false);
  const [showTableAnswerEditor, setShowTableAnswerEditor] = useState(false);

  // Math Editor Dialog State
  const [mathDialogOpen, setMathDialogOpen] = useState(false);
  const [mathTarget, setMathTarget] = useState<{
    field: "content" | "explanation" | "hint" | "option";
    optionIndex?: number;
  } | null>(null);

  const openMathEditor = (
    field: "content" | "explanation" | "hint" | "option",
    optionIndex?: number
  ) => {
    setMathTarget({ field, optionIndex });
    setMathDialogOpen(true);
  };

  const handleInsertMath = (formattedMath: string) => {
    if (!mathTarget) return;
    if (mathTarget.field === "content") {
      setFormData((prev) => ({
        ...prev,
        content: prev.content ? `${prev.content} ${formattedMath}` : formattedMath,
      }));
    } else if (mathTarget.field === "explanation") {
      setFormData((prev) => ({
        ...prev,
        explanation: prev.explanation ? `${prev.explanation} ${formattedMath}` : formattedMath,
      }));
    } else if (mathTarget.field === "hint") {
      setFormData((prev) => ({
        ...prev,
        hint: prev.hint ? `${prev.hint} ${formattedMath}` : formattedMath,
      }));
    } else if (mathTarget.field === "option" && mathTarget.optionIndex !== undefined) {
      const idx = mathTarget.optionIndex;
      setFormData((prev) => {
        const nextOpts = [...prev.options];
        if (nextOpts[idx]) {
          nextOpts[idx] = {
            ...nextOpts[idx],
            option_text: nextOpts[idx].option_text
              ? `${nextOpts[idx].option_text} ${formattedMath}`
              : formattedMath,
          };
        }
        return { ...prev, options: nextOpts };
      });
    }
    setMathDialogOpen(false);
  };

  const [formData, setFormData] = useState<QuestionCreateRequest>({
    content: "",
    explanation: "",
    hint: "",
    question_type: "mcq",
    difficulty: "medium",
    suggested_marks: 1,
    options: [
      { option_text: "", is_correct: false, order_index: 1 },
      { option_text: "", is_correct: false, order_index: 2 },
    ],
  });

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await questionApi.getQuestions({
        q: debouncedSearch,
        type: filterType === "all" ? undefined : filterType,
        difficulty: filterDifficulty === "all" ? undefined : filterDifficulty,
        course_id: filterCourse === "all" ? undefined : filterCourse,
      });
      setQuestions(response.items || []);
    } catch (err) {
      toast.error("Failed to load questions");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterType, filterDifficulty, filterCourse]);

  const fetchCourses = useCallback(async () => {
    try {
      const data = await lecturerApi.getWorkspaces();
      setCourses(data || []);
    } catch (err) {
      console.error("Failed to load courses");
    }
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const handlePreview = async (id: string) => {
    setPreviewOpen(true);
    setLoadingDetail(true);
    try {
      const data = await questionApi.getQuestion(id);
      setPreviewData(data);
    } catch (err) {
      toast.error("Failed to load question details");
      setPreviewOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleEdit = async (id: string) => {
    setFormEditingId(id);
    setFormOpen(true);
    setFormLoading(true);
    try {
      const data = await questionApi.getQuestion(id);
      setFormData({
        content: data.content,
        explanation: data.explanation || "",
        hint: data.hint || "",
        question_type: data.question_type.toLowerCase() as any,
        difficulty: data.difficulty.toLowerCase() as any,
        suggested_marks: data.marks,
        course_id: data.course_id || undefined,
        topic: data.topic || "",
        image_url: data.image_url || undefined,
        question_table_context: data.question_table_context,
        requires_table_answer: data.requires_table_answer,
        answer_table_template: data.answer_table_template,
        options: data.options.map((opt, i) => ({
          option_text: opt.option_text,
          option_text_right: opt.option_text_right,
          is_correct: opt.is_correct,
          order_index: opt.order_index ?? i + 1,
        })),
      });
      setShowTableStemEditor(!!data.question_table_context);
      setShowTableAnswerEditor(!!data.requires_table_answer);
    } catch (err) {
      toast.error("Failed to load question for editing");
      setFormOpen(false);
    } finally {
      setFormLoading(false);
    }
  };

  const handleAdd = () => {
    setFormEditingId(null);
    setFormData({
      content: "",
      explanation: "",
      hint: "",
      question_type: "mcq",
      difficulty: "medium",
      suggested_marks: 1,
      options: [
        { option_text: "", is_correct: false, order_index: 1 },
        { option_text: "", is_correct: false, order_index: 2 },
      ],
    });
    setShowTableStemEditor(false);
    setShowTableAnswerEditor(false);
    setFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this question?")) return;
    try {
      await questionApi.deleteQuestion(id);
      toast.success("Question deleted successfully");
      fetchQuestions();
    } catch (err) {
      toast.error("Failed to delete question");
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    const payload: QuestionCreateRequest = {
      ...formData,
      question_type: formData.question_type.toUpperCase() as any,
      difficulty: formData.difficulty.toUpperCase() as any,
      options:
        formData.question_type === "mcq" ||
        formData.question_type === "true_false" ||
        formData.question_type === "matching"
          ? formData.options.map((o, idx) => ({ ...o, order_index: idx + 1 }))
          : [],
    };

    try {
      if (editingId) {
        await questionApi.updateQuestion(editingId, payload);
        toast.success("Question updated successfully");
      } else {
        await questionApi.createQuestion(payload);
        toast.success("Question created successfully");
      }
      setFormOpen(false);
      fetchQuestions();
    } catch (err: any) {
      toast.error(err.message || "Failed to save question");
    } finally {
      setFormLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const toastId = toast.loading("Uploading image asset...");
    try {
      const res = await lecturerApi.uploadImage(file);
      setFormData((prev) => ({ ...prev, image_url: res.url }));
      toast.success("Image uploaded", { id: toastId });
    } catch (err: any) {
      toast.error("Failed to upload image", { id: toastId });
    }
  };

  const addOption = () => {
    setFormData((prev) => ({
      ...prev,
      options: [
        ...prev.options,
        {
          option_text: "",
          is_correct: false,
          order_index: prev.options.length + 1,
        },
      ],
    }));
  };

  const removeOption = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  };

  const updateOption = (
    index: number,
    field: keyof Omit<QuestionOption, "id">,
    value: any,
  ) => {
    setFormData((prev) => {
      const newOptions = [...prev.options];
      newOptions[index] = { ...newOptions[index], [field]: value };
      return { ...prev, options: newOptions };
    });
  };

  const getDifficultyBadge = (difficulty: string) => {
    const d = difficulty.toUpperCase();
    if (d === "EASY") {
      return (
        <Badge variant="outline" className="capitalize text-[9px] font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
          Easy
        </Badge>
      );
    }
    if (d === "HARD") {
      return (
        <Badge variant="outline" className="capitalize text-[9px] font-semibold rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
          Hard
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="capitalize text-[9px] font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
        Medium
      </Badge>
    );
  };

  return (
    <div data-tour="lecturer-bank" className="w-full max-w-full 2xl:max-w-[1800px] mx-auto min-w-0 space-y-4 sm:space-y-5 p-1 sm:p-2 lg:p-3 transition-all duration-300 font-sans pb-12">
      {/* Header Container */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Database className="size-4.5 text-primary" />
            Institutional Question Bank
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-normal">
            Author, tag, and verify reusable assessment items with math formulas and dataset tables.
          </p>
        </div>
        <Button
          onClick={handleAdd}
          size="sm"
          className="h-8 px-3.5 font-semibold text-xs rounded-xl shadow-2xs text-primary-foreground bg-primary hover:bg-primary/90 gap-1.5"
        >
          <Plus className="size-3.5" /> New Question
        </Button>
      </div>

      {/* Filters and Searches Control Bar */}
      <div className="flex flex-wrap items-center gap-2.5 p-2.5 border border-border/50 bg-card/40 rounded-xl backdrop-blur-xs">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search items by prompt or topic..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-xs rounded-lg border-border/60 bg-background text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36 h-8 text-xs rounded-lg border-border/60 bg-background text-foreground">
            <SelectValue placeholder="Protocol Type" />
          </SelectTrigger>
          <SelectContent className="rounded-lg shadow-lg border-border/60 bg-popover text-popover-foreground">
            <SelectItem value="all" className="text-xs">All Types</SelectItem>
            <SelectItem value="MCQ" className="text-xs">Multiple Choice</SelectItem>
            <SelectItem value="TRUE_FALSE" className="text-xs">True/False</SelectItem>
            <SelectItem value="SHORT_ANSWER" className="text-xs">Short Answer</SelectItem>
            <SelectItem value="ESSAY" className="text-xs">Essay Response</SelectItem>
            <SelectItem value="MATCHING" className="text-xs">Matching Pairs</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
          <SelectTrigger className="w-32 h-8 text-xs rounded-lg border-border/60 bg-background text-foreground">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent className="rounded-lg shadow-lg border-border/60 bg-popover text-popover-foreground">
            <SelectItem value="all" className="text-xs">All Levels</SelectItem>
            <SelectItem value="EASY" className="text-xs">Easy</SelectItem>
            <SelectItem value="MEDIUM" className="text-xs">Medium</SelectItem>
            <SelectItem value="HARD" className="text-xs">Hard</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCourse} onValueChange={setFilterCourse}>
          <SelectTrigger className="w-44 h-8 text-xs rounded-lg border-border/60 bg-background text-foreground">
            <SelectValue placeholder="All Courses" />
          </SelectTrigger>
          <SelectContent className="rounded-lg shadow-lg border-border/60 bg-popover text-popover-foreground">
            <SelectItem value="all" className="text-xs">All Courses</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs">
                {c.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Questions list feed */}
      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="shadow-2xs border border-border/60 p-4 rounded-xl animate-pulse bg-card">
                <Skeleton className="h-4 w-3/4 rounded mb-2" />
                <Skeleton className="h-3.5 w-1/4 rounded" />
              </Card>
            ))}
          </div>
        ) : questions.length === 0 ? (
          <Card className="border-dashed bg-card/60 rounded-2xl border-border/60 shadow-none">
            <CardContent className="py-16 text-center">
              <Database className="size-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                No matching questions found
              </p>
              <Button
                variant="link"
                size="sm"
                className="mt-1 text-xs font-semibold text-primary"
                onClick={() => {
                  setSearchTerm("");
                  setFilterType("all");
                  setFilterDifficulty("all");
                  setFilterCourse("all");
                }}
              >
                Reset Search Filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          questions.map((q) => (
            <Card
              key={q.id}
              className="shadow-2xs border border-border/60 hover:border-border transition-colors rounded-xl overflow-hidden bg-card"
            >
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3 flex-1 min-w-0">
                    {q.image_url && (
                      <div className="size-12 rounded-lg border border-border/60 bg-muted/20 overflow-hidden shrink-0 relative">
                        <Image
                          src={q.image_url}
                          alt="Resource prompt"
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </div>
                    )}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="text-xs font-semibold leading-normal text-foreground line-clamp-2">
                        {renderRichMathText(q.content)}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge
                          variant="outline"
                          className="capitalize text-[9px] font-semibold text-muted-foreground rounded-full border-border/60 bg-muted/30"
                        >
                          {q.question_type.toLowerCase().replace("_", " ")}
                        </Badge>
                        {getDifficultyBadge(q.difficulty)}
                        {q.topic && (
                          <Badge
                            variant="outline"
                            className="bg-primary/10 border-primary/20 text-primary text-[9px] font-semibold rounded-full truncate max-w-[120px]"
                          >
                            {q.topic}
                          </Badge>
                        )}
                        {q.course_id && (
                          <Badge
                            variant="outline"
                            className="text-[9px] font-semibold rounded-full border-border/60 text-muted-foreground bg-muted/40 truncate max-w-[100px]"
                          >
                            {courses.find((c) => c.id === q.course_id)?.code || "Assigned Course"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 size-7 transition-colors rounded-lg self-start shrink-0"
                    onClick={() => handleDelete(q.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                <div className="flex items-center justify-between text-[10px] pt-3 border-t border-border/40">
                  <div className="flex items-center gap-4 text-muted-foreground font-medium">
                    <div>
                      <span>Weight: </span>
                      <span className="font-semibold text-foreground">{q.marks} Marks</span>
                    </div>
                    <div>
                      <span>Date: </span>
                      <span className="font-semibold text-foreground">
                        {new Date(q.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7.5 px-3 text-xs font-medium rounded-lg border-border/60 bg-card hover:bg-muted/50 text-foreground shadow-2xs"
                      onClick={() => handlePreview(q.id)}
                    >
                      <Eye className="mr-1.5 size-3 text-muted-foreground" /> Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7.5 px-3 text-xs font-medium rounded-lg border-border/60 bg-card hover:bg-muted/50 text-foreground shadow-2xs"
                      onClick={() => handleEdit(q.id)}
                    >
                      <Edit className="mr-1.5 size-3 text-muted-foreground" /> Modify
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 rounded-2xl border border-border/60 shadow-xl bg-card text-card-foreground">
          <DialogHeader className="p-4 pb-3 border-b border-border/40 bg-muted/20">
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle className="text-sm font-semibold text-foreground">
                  Question Detail Preview
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 font-normal">
                  Review item layout and verified evaluation keys.
                </DialogDescription>
              </div>
              <Badge variant="outline" className="font-mono font-medium h-5.5 px-2 rounded-full border-primary/20 text-primary bg-primary/10 text-[10px]">
                {previewData?.marks} Marks
              </Badge>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <ScrollArea className="h-full">
              <div className="p-5 space-y-5">
                {loadingDetail ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">Loading details...</span>
                  </div>
                ) : previewData ? (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block ml-0.5">
                        Question Prompt
                      </span>
                      <div className="space-y-3">
                        <div className="text-xs font-semibold leading-relaxed p-4 rounded-xl border border-border/60 bg-muted/30 text-foreground">
                          {renderRichMathText(previewData.content)}
                        </div>
                        {previewData.question_table_context && (
                          <div className="p-3 border border-border/60 rounded-xl bg-card">
                            <TableContextViewer data={previewData.question_table_context} />
                          </div>
                        )}
                        {previewData.image_url && (
                          <div className="p-1.5 border border-border/60 rounded-xl bg-muted/20 inline-block shadow-2xs overflow-hidden max-w-full">
                            <Image
                              src={previewData.image_url}
                              alt="Prompt Media Link"
                              width={800}
                              height={600}
                              unoptimized
                              className="max-h-60 rounded-lg object-contain w-auto h-auto"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {previewData.options && previewData.options.length > 0 && (
                      <div className="space-y-2 pt-3 border-t border-border/40">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block ml-0.5">
                          Response Candidates
                        </span>
                        <div className="grid gap-2">
                          {previewData.options.map((opt, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                "flex items-center justify-between p-3 px-4 rounded-xl border text-xs transition-colors",
                                opt.is_correct
                                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-900 dark:text-emerald-200 font-semibold shadow-2xs"
                                  : "bg-card border-border/60 text-foreground"
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    "size-5.5 rounded border flex items-center justify-center text-[10px] font-bold",
                                    opt.is_correct
                                      ? "bg-emerald-500 text-white border-emerald-400"
                                      : "bg-muted text-muted-foreground border-border/60"
                                  )}
                                >
                                  {String.fromCharCode(65 + idx)}
                                </div>
                                <span className="font-semibold">{renderRichMathText(opt.option_text)}</span>
                              </div>
                              {opt.is_correct && <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(previewData.explanation || previewData.hint) && (
                      <div className="space-y-3 pt-3 border-t border-border/40">
                        {previewData.explanation && (
                          <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/15">
                            <h4 className="text-[10px] font-semibold flex items-center gap-1.5 mb-1 text-primary uppercase tracking-wider">
                              <AlertCircle className="size-3.5" /> Logic Explanation
                            </h4>
                            <div className="text-xs font-normal text-muted-foreground leading-relaxed italic">
                              {renderRichMathText(previewData.explanation)}
                            </div>
                          </div>
                        )}
                        {previewData.hint && (
                          <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
                            <h4 className="text-[10px] font-semibold flex items-center gap-1.5 mb-1 text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                              <Sparkles className="size-3.5" /> Student Guidance Hint
                            </h4>
                            <p className="text-xs font-normal text-amber-800 dark:text-amber-300 leading-relaxed italic">
                              {previewData.hint}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="p-4 border-t border-border/40 bg-muted/20 flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(false)}
              className="text-xs font-medium h-8 px-4 rounded-xl border-border/60"
            >
              Close
            </Button>
            <Button
              onClick={() => previewData && handleEdit(previewData.id)}
              size="sm"
              className="text-xs font-semibold h-8 px-4 rounded-xl text-primary-foreground bg-primary hover:bg-primary/90 shadow-2xs"
            >
              Edit Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-2xl border border-border/60 shadow-xl bg-card text-card-foreground">
          <form onSubmit={handleFormSubmit} className="flex flex-col h-full overflow-hidden">
            <DialogHeader className="p-4 pb-3 border-b border-border/40 bg-muted/20">
              <DialogTitle className="text-sm font-semibold text-foreground">
                {editingId ? "Modify Question" : "New Question Entry"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 font-normal">
                Configure details for evaluation questions registered in the institutional bank.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              <ScrollArea className="h-full">
                <div className="p-5 space-y-5">
                  {formLoading && !formData.content ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 animate-pulse">
                      <Loader2 className="size-5 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">Syncing data...</span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="content" className="text-xs font-semibold text-foreground">
                              Question Prompt <span className="text-destructive">*</span>
                            </Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => openMathEditor("content")}
                              className="h-6 px-2 text-[10px] font-semibold text-primary hover:bg-primary/10 gap-1 rounded-md"
                            >
                              <Sigma className="size-3" /> Insert Math / Formula
                            </Button>
                          </div>
                          <Textarea
                            id="content"
                            placeholder="Type the core question or prompt instruction... (LaTeX: $formula$ or $$block$$)"
                            className="min-h-[100px] text-xs font-normal p-3 rounded-lg border-border/60 bg-background text-foreground placeholder:text-muted-foreground"
                            value={formData.content}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, content: e.target.value }))
                            }
                            required
                          />
                        </div>

                        {/* Structured Table Section */}
                        <div className="space-y-3 p-3.5 border border-border/60 rounded-xl bg-muted/20">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <TableIcon className="size-4 text-primary" />
                              <span className="text-xs font-semibold text-foreground">
                                Structured Tables & Datasets
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant={showTableStemEditor ? "default" : "outline"}
                                size="sm"
                                onClick={() => setShowTableStemEditor(!showTableStemEditor)}
                                className="h-7 text-xs font-medium rounded-lg px-2.5 border-border/60"
                              >
                                {formData.question_table_context ? "Edit Reference Table" : "+ Add Reference Table"}
                              </Button>
                              {(formData.question_type === "short_answer" || formData.question_type === "essay") && (
                                <Button
                                  type="button"
                                  variant={showTableAnswerEditor ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => {
                                    const nextVal = !formData.requires_table_answer;
                                    setFormData((prev) => ({ ...prev, requires_table_answer: nextVal }));
                                    setShowTableAnswerEditor(nextVal);
                                  }}
                                  className="h-7 text-xs font-medium rounded-lg px-2.5 border-border/60"
                                >
                                  {formData.requires_table_answer ? "✓ Requires Table Answer" : "Require Table Answer"}
                                </Button>
                              )}
                            </div>
                          </div>

                          {showTableStemEditor && (
                            <div className="mt-3 p-3 bg-card border border-border/60 rounded-xl space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-foreground">Question Stem Reference Table</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setFormData((prev) => ({ ...prev, question_table_context: undefined }));
                                    setShowTableStemEditor(false);
                                  }}
                                  className="h-6 text-[10px] text-destructive hover:bg-destructive/10"
                                >
                                  Remove Table
                                </Button>
                              </div>
                              <TableEditor
                                initialData={formData.question_table_context}
                                onChange={(data) => setFormData((prev) => ({ ...prev, question_table_context: data }))}
                              />
                            </div>
                          )}

                          {showTableAnswerEditor && formData.requires_table_answer && (
                            <div className="mt-3 p-3 bg-card border border-border/60 rounded-xl space-y-2">
                              <span className="text-xs font-semibold text-foreground">Student Answer Table Template Grid</span>
                              <TableEditor
                                initialData={formData.answer_table_template}
                                onChange={(data) => setFormData((prev) => ({ ...prev, answer_table_template: data }))}
                              />
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="type" className="text-xs font-semibold text-foreground">
                              Protocol Type
                            </Label>
                            <Select
                              value={formData.question_type}
                              onValueChange={(val) =>
                                setFormData((prev) => ({ ...prev, question_type: val as any }))
                              }
                            >
                              <SelectTrigger id="type" className="h-8.5 rounded-lg border-border/60 bg-background text-xs text-foreground">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-lg shadow-lg border-border/60 bg-popover text-popover-foreground">
                                <SelectItem value="mcq" className="text-xs">Multiple Choice</SelectItem>
                                <SelectItem value="true_false" className="text-xs">True / False</SelectItem>
                                <SelectItem value="short_answer" className="text-xs">Short Answer</SelectItem>
                                <SelectItem value="essay" className="text-xs">Essay Response</SelectItem>
                                <SelectItem value="matching" className="text-xs">Matching Pairs</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor="difficulty" className="text-xs font-semibold text-foreground">
                              Complexity Vector
                            </Label>
                            <Select
                              value={formData.difficulty}
                              onValueChange={(val) =>
                                setFormData((prev) => ({ ...prev, difficulty: val as any }))
                              }
                            >
                              <SelectTrigger id="difficulty" className="h-8.5 rounded-lg border-border/60 bg-background text-xs text-foreground">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-lg shadow-lg border-border/60 bg-popover text-popover-foreground">
                                <SelectItem value="easy" className="text-xs">Easy</SelectItem>
                                <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                                <SelectItem value="hard" className="text-xs">Hard</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="marks" className="text-xs font-semibold text-foreground">
                              Weight (Marks)
                            </Label>
                            <Input
                              id="marks"
                              type="number"
                              min={1}
                              className="h-8.5 font-bold rounded-lg border-border/60 bg-background text-foreground text-xs"
                              value={formData.suggested_marks}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  suggested_marks: parseInt(e.target.value) || 1,
                                }))
                              }
                              required
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor="course" className="text-xs font-semibold text-foreground">
                              Linked Subject Ledger
                            </Label>
                            <Select
                              value={formData.course_id}
                              onValueChange={(val) =>
                                setFormData((prev) => ({ ...prev, course_id: val }))
                              }
                            >
                              <SelectTrigger id="course" className="h-8.5 rounded-lg border-border/60 bg-background text-foreground text-xs">
                                <SelectValue placeholder="General (All courses)" />
                              </SelectTrigger>
                              <SelectContent className="rounded-lg shadow-lg border-border/60 bg-popover text-popover-foreground">
                                {courses.map((c) => (
                                  <SelectItem key={c.id} value={c.id} className="text-xs">
                                    {c.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor="topic" className="text-xs font-semibold text-foreground">
                              Topic Classification
                            </Label>
                            <Input
                              id="topic"
                              placeholder="e.g. Molecular Biology"
                              className="h-8.5 rounded-lg border-border/60 bg-background text-foreground text-xs font-medium"
                              value={formData.topic}
                              onChange={(e) =>
                                setFormData((prev) => ({ ...prev, topic: e.target.value }))
                              }
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <Label className="text-xs font-semibold text-foreground">
                            Media Attachment
                          </Label>
                          <div className="flex items-center gap-4">
                            {formData.image_url ? (
                              <div className="relative group size-16 rounded-xl border border-border/60 bg-card p-1 overflow-hidden">
                                <Image
                                  src={formData.image_url}
                                  alt="Media Upload"
                                  fill
                                  unoptimized
                                  className="object-contain rounded-lg p-1"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setFormData((p) => ({ ...p, image_url: undefined }))
                                  }
                                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            ) : (
                              <label className="size-16 rounded-xl border border-dashed border-border/60 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/40 transition-colors group">
                                <Upload className="size-4 text-muted-foreground group-hover:text-primary mb-1" />
                                <span className="text-[8px] font-semibold text-muted-foreground uppercase">
                                  Upload
                                </span>
                                <input
                                  type="file"
                                  className="hidden"
                                  accept="image/*"
                                  onChange={handleImageUpload}
                                />
                              </label>
                            )}
                            <div className="text-[10px] text-muted-foreground font-normal">
                              JPEG or PNG format under 5MB.
                            </div>
                          </div>
                        </div>
                      </div>

                      <Separator className="bg-border/40" />

                      {/* Interactive Options list */}
                      {(formData.question_type === "mcq" ||
                        formData.question_type === "true_false" ||
                        formData.question_type === "matching") && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold text-foreground">
                              {formData.question_type === "matching"
                                ? "Relation Pair Mapping"
                                : "Option Nodes Settings"}
                            </Label>
                            {formData.question_type !== "true_false" && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addOption}
                                className="h-7 rounded-lg text-xs font-medium border-border/60 text-foreground hover:bg-muted/50 bg-card"
                              >
                                <Plus className="mr-1.5 size-3 text-primary" /> Add Option
                              </Button>
                            )}
                          </div>

                          <div className="space-y-2">
                            {formData.options.map((opt, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-3 p-3 bg-muted/20 border border-border/60 rounded-xl focus-within:bg-card focus-within:border-border"
                              >
                                {formData.question_type === "mcq" ||
                                formData.question_type === "true_false" ? (
                                  <Checkbox
                                    checked={opt.is_correct}
                                    onCheckedChange={(checked) =>
                                      updateOption(idx, "is_correct", !!checked)
                                    }
                                    className="size-4.5 rounded border-border/60 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-400"
                                  />
                                ) : (
                                  <span className="text-[10px] font-bold text-muted-foreground font-mono">
                                    {idx + 1}.
                                  </span>
                                )}

                                <div className="flex-1 flex gap-3 min-w-0">
                                  <Input
                                    placeholder={
                                      formData.question_type === "matching"
                                        ? "Left Term..."
                                        : `Choice text content...`
                                    }
                                    value={opt.option_text}
                                    onChange={(e) =>
                                      updateOption(idx, "option_text", e.target.value)
                                    }
                                    className="border-none bg-transparent shadow-none px-0 h-7 text-xs font-semibold text-foreground focus-visible:ring-0 placeholder:text-muted-foreground"
                                    required
                                    disabled={formData.question_type === "true_false"}
                                  />
                                  {formData.question_type === "matching" && (
                                    <>
                                      <ArrowRight className="size-3.5 text-muted-foreground mt-2 shrink-0" />
                                      <Input
                                        placeholder="Right Mapping..."
                                        value={opt.option_text_right || ""}
                                        onChange={(e) =>
                                          updateOption(idx, "option_text_right", e.target.value)
                                        }
                                        className="border-none bg-transparent shadow-none px-0 h-7 text-xs font-semibold text-primary focus-visible:ring-0 placeholder:text-muted-foreground"
                                        required
                                      />
                                    </>
                                  )}
                                </div>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 text-muted-foreground hover:text-primary rounded-lg shrink-0"
                                  title="Insert Math Formula"
                                  onClick={() => openMathEditor("option", idx)}
                                >
                                  <Sigma className="size-3.5" />
                                </Button>

                                {formData.question_type !== "true_false" &&
                                  formData.options.length > 1 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="size-6 text-muted-foreground hover:text-destructive rounded-lg"
                                      onClick={() => removeOption(idx)}
                                    >
                                      <X className="size-3.5" />
                                    </Button>
                                  )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Explanation and Hints */}
                      <div className="space-y-4 pt-2">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="explanation" className="text-xs font-semibold text-foreground">
                              Rubric Evaluation Guide
                            </Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => openMathEditor("explanation")}
                              className="h-6 px-2 text-[10px] font-semibold text-primary hover:bg-primary/10 gap-1 rounded-md"
                            >
                              <Sigma className="size-3" /> Insert Math
                            </Button>
                          </div>
                          <Textarea
                            id="explanation"
                            placeholder="Provide details on the correct answer rationale..."
                            className="min-h-[80px] text-xs font-normal p-3 rounded-lg border-border/60 bg-background text-foreground placeholder:text-muted-foreground"
                            value={formData.explanation}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, explanation: e.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="hint" className="text-xs font-semibold text-foreground">
                              Assistance Hint
                            </Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => openMathEditor("hint")}
                              className="h-6 px-2 text-[10px] font-semibold text-primary hover:bg-primary/10 gap-1 rounded-md"
                            >
                              <Sigma className="size-3" /> Insert Math
                            </Button>
                          </div>
                          <Input
                            id="hint"
                            placeholder="Hint suggestion for students (optional)..."
                            className="h-8.5 text-xs rounded-lg border-border/60 bg-background text-foreground placeholder:text-muted-foreground px-3"
                            value={formData.hint}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, hint: e.target.value }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <DialogFooter className="p-4 border-t border-border/40 bg-muted/20 flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFormOpen(false)}
                className="text-xs font-medium h-8 px-4 rounded-xl border-border/60"
              >
                Abort
              </Button>
              <Button
                type="submit"
                disabled={formLoading}
                size="sm"
                className="text-xs font-semibold h-8 px-5 rounded-xl text-primary-foreground bg-primary hover:bg-primary/90 shadow-2xs"
              >
                {formLoading ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Syncing...
                  </>
                ) : (
                  <>
                    <Database className="mr-1.5 size-3.5" /> Save Item
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <MathEditorDialog
        open={mathDialogOpen}
        onOpenChange={setMathDialogOpen}
        onInsert={handleInsertMath}
      />
    </div>
  );
}
