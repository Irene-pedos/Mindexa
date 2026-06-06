// frontend/app/lecturer/question-bank/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  BrainCircuit,
  Database,
  ArrowRight,
  Image as ImageIcon,
  Upload,
} from "lucide-react";
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

import { AIGeneratorPanel } from "@/components/mindexa/assessment/ai-generator-panel";

export default function LecturerQuestionBank() {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [filterType, setFilterType] = useState("all");
  const [filterDifficulty, setFilterDifficulty] = useState("all");
  const [filterCourse, setFilterCourse] = useState("all");
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // View Mode
  const [viewMode, setViewMode] = useState<"bank" | "ai">("bank");

  // Preview Dialog State
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<QuestionBankItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Form Dialog State (Add/Edit)
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setFormEditingId] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
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
        page_size: 50,
      });
      setQuestions(response.items as any);
    } catch (error: any) {
      console.error("Failed to fetch questions", error);
      toast.error(error.message || "Could not load questions from bank");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterType, filterDifficulty, filterCourse]);

  useEffect(() => {
    async function loadCourses() {
        try {
            const data = await lecturerApi.getWorkspaces();
            setCourses(data as any);
        } catch (err) {
            console.error("Failed to load courses", err);
        }
    }
    loadCourses();
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handlePreview = async (id: string) => {
    setPreviewOpen(true);
    setLoadingDetail(true);
    setPreviewData(null);
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
        image_url: data.image_url,
        explanation: data.explanation || "",
        hint: data.hint || "",
        question_type: data.question_type.toLowerCase() as any,
        difficulty: data.difficulty.toLowerCase() as any,
        suggested_marks: data.marks,
        course_id: data.course_id,
        options: data.options.map((opt) => ({
          option_text: opt.option_text,
          option_text_right: opt.option_text_right,
          is_correct: opt.is_correct,
          order_index: opt.order_index,
        })),
      });
    } catch (err) {
      toast.error("Failed to load question for editing");
      setFormOpen(false);
    } finally {
      setFormLoading(false);
    }
  };

  const handleAdd = () => {
    setFormEditingId(null);
    setFormOpen(true);
    setFormData({
      content: "",
      image_url: undefined,
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
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image too large. Max 5MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image_url: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      formData.question_type === "mcq" ||
      formData.question_type === "true_false"
    ) {
      const hasCorrect = formData.options.some((o) => o.is_correct);
      if (!hasCorrect) {
        toast.error("Please mark at least one option as correct");
        return;
      }
    }

    setFormLoading(true);
    try {
      if (editingId) {
        await questionApi.updateQuestion(editingId, formData);
        toast.success("Question updated successfully");
      } else {
        await questionApi.createQuestion(formData);
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

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this question?")) return;

    try {
      await questionApi.deleteQuestion(id);
      toast.success("Question deleted successfully");
      fetchQuestions();
    } catch (error) {
      toast.error("Failed to delete question");
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

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground/90">Question Bank</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage and reuse your institutional question library</p>
        </div>
        <Button onClick={handleAdd} className="h-10 px-5 shadow-sm font-semibold rounded-lg">
          <Plus className="mr-2 size-4" /> New Question
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground/60" />
          <Input
            placeholder="Search questions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10 rounded-lg border-muted-foreground/10"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-52 h-10 rounded-lg">
            <SelectValue placeholder="Question Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="MCQ">Multiple Choice</SelectItem>
            <SelectItem value="TRUE_FALSE">True/False</SelectItem>
            <SelectItem value="SHORT_ANSWER">Short Answer</SelectItem>
            <SelectItem value="ESSAY">Essay</SelectItem>
            <SelectItem value="MATCHING">Matching</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
          <SelectTrigger className="w-44 h-10 rounded-lg">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="EASY">Easy</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HARD">Hard</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCourse} onValueChange={setFilterCourse}>
          <SelectTrigger className="w-64 h-10 rounded-lg">
            <SelectValue placeholder="All Courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Courses</SelectItem>
            {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.title} ({c.code})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 pb-20">
        {loading ? (
          <div className="space-y-4">
             {[1, 2, 3, 4, 5].map(i => (
                <Card key={i} className="shadow-none border p-6 rounded-xl">
                   <Skeleton variant="title" className="mb-4 w-3/4" />
                   <div className="flex gap-2 mb-6">
                      <Skeleton variant="title" className="w-20 h-5" />
                      <Skeleton variant="title" className="w-20 h-5" />
                   </div>
                   <Skeleton variant="text" className="w-full" />
                </Card>
             ))}
          </div>
        ) : questions.length === 0 ? (
          <Card className="border-dashed shadow-none rounded-xl">
            <CardContent className="flex flex-col items-center justify-center py-24 text-center">
              <Database className="size-12 text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground font-medium">No questions found matching your criteria.</p>
              <Button
                variant="link"
                className="mt-2 text-primary"
                onClick={() => {
                  setSearchTerm("");
                  setFilterType("all");
                  setFilterDifficulty("all");
                  setFilterCourse("all");
                }}
              >
                Clear all filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          questions.map((q) => (
            <Card key={q.id} className="shadow-none border hover:border-primary/20 transition-all group rounded-xl overflow-hidden">
              <CardHeader className="pb-3 px-6 pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-start gap-4">
                        {q.image_url && (
                            <div className="size-16 rounded-lg border bg-muted/5 overflow-hidden flex-shrink-0">
                                <img src={q.image_url} alt="Question media" className="size-full object-cover" />
                            </div>
                        )}
                        <div className="space-y-2">
                            <CardTitle className="text-base leading-snug line-clamp-2 font-semibold text-foreground/90">
                                {q.content}
                            </CardTitle>
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="outline" className="capitalize text-[10px] font-bold text-muted-foreground rounded-md tracking-tight">
                                    {q.question_type.toLowerCase().replace("_", " ")}
                                </Badge>
                                <Badge variant="secondary" className="capitalize text-[10px] font-bold rounded-md tracking-tight">
                                    {q.difficulty.toLowerCase()}
                                </Badge>
                                {q.topic && (
                                    <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary text-[10px] font-bold rounded-md tracking-tight">
                                        {q.topic}
                                    </Badge>
                                )}
                                {q.course_id && (
                                    <Badge variant="outline" className="text-[10px] font-bold rounded-md border-muted-foreground/10 text-muted-foreground/80 tracking-tight">
                                        {courses.find(c => c.id === q.course_id)?.code || "Assigned Course"}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive h-8 w-8 transition-colors rounded-lg"
                      onClick={() => handleDelete(q.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 px-6 pb-4">
                <div className="flex items-center justify-between text-[11px] pt-4 border-t border-muted/50">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Marks:</span>
                      <span className="font-bold text-foreground/80">{q.marks}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Registered:</span>
                      <span className="font-bold text-foreground/80">{new Date(q.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-semibold rounded-lg hover:bg-muted/50 transition-all shadow-none"
                      onClick={() => handlePreview(q.id)}
                    >
                      <Eye className="mr-1.5 size-3.5" /> Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-semibold rounded-lg hover:bg-muted/50 transition-all shadow-none"
                      onClick={() => handleEdit(q.id)}
                    >
                      <Edit className="mr-1.5 size-3.5" /> Modify
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0 rounded-2xl border-none shadow-2xl">
          <DialogHeader className="p-6 pb-4 border-b bg-muted/5">
            <div className="flex items-center justify-between pr-8">
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight">Question Preview</DialogTitle>
                <DialogDescription className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 mt-0.5">Institutional Registry Trace</DialogDescription>
              </div>
              <Badge variant="outline" className="font-bold h-7 px-3 rounded-lg border-primary/20 text-primary bg-primary/5">{previewData?.marks} Marks</Badge>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <ScrollArea className="h-full">
              <div className="p-8 space-y-10">
                {loadingDetail ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-3">
                    <Skeleton variant="title" className="h-6 w-32" />
                    <Skeleton variant="media" className="h-32 w-full mt-4" />
                    <Skeleton variant="text" className="w-full mt-8" />
                  </div>
                ) : previewData ? (
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 ml-1">Question Context</Label>
                      <div className="space-y-6">
                        <div className="text-sm font-semibold leading-relaxed p-6 rounded-2xl border bg-muted/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]">
                            {previewData.content}
                        </div>
                        {previewData.image_url && (
                            <div className="p-2 border rounded-2xl bg-muted/5 inline-block shadow-sm overflow-hidden">
                                <img src={previewData.image_url} alt="Question Media" className="max-h-80 rounded-xl object-contain" />
                            </div>
                        )}
                      </div>
                    </div>

                    {previewData.options && previewData.options.length > 0 && (
                      <div className="space-y-4 pt-4 border-t border-dashed">
                        <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 ml-1">Response Candidates</Label>
                        <div className="grid gap-2.5">
                          {previewData.options.map((opt, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                "flex items-center justify-between p-4 px-5 rounded-xl border text-sm transition-all",
                                opt.is_correct ? "bg-emerald-50/50 border-emerald-100 text-emerald-900 font-bold shadow-sm" : "bg-background hover:bg-muted/5 cursor-default"
                              )}
                            >
                              <div className="flex items-center gap-4">
                                <div className={cn(
                                    "size-6 rounded border flex items-center justify-center text-[10px] font-bold transition-colors",
                                    opt.is_correct ? "bg-emerald-500 text-white border-emerald-400" : "bg-muted/20 text-muted-foreground"
                                )}>
                                  {String.fromCharCode(65 + idx)}
                                </div>
                                <span className="font-medium tracking-tight">{opt.option_text}</span>
                              </div>
                              {opt.is_correct && <CheckCircle2 className="size-4 text-emerald-500" />}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(previewData.explanation || previewData.hint) && (
                      <div className="space-y-5 pt-8 border-t border-dashed">
                        {previewData.explanation && (
                          <div className="p-5 rounded-2xl bg-primary/[0.02] border border-primary/10">
                            <h4 className="text-[10px] font-bold flex items-center gap-2 mb-2 text-primary uppercase tracking-widest">
                              <AlertCircle className="size-3.5" /> Logic Explanation
                            </h4>
                            <p className="text-xs font-medium text-foreground/70 leading-relaxed italic pr-4">
                              &quot;{previewData.explanation}&quot;
                            </p>
                          </div>
                        )}
                        {previewData.hint && (
                          <div className="p-5 rounded-2xl bg-amber-50/50 border border-amber-100">
                            <h4 className="text-[10px] font-bold flex items-center gap-2 mb-2 text-amber-700 uppercase tracking-widest">
                              <BrainCircuit className="size-3.5" /> Student Guidance
                            </h4>
                            <p className="text-xs font-medium text-amber-900/60 leading-relaxed italic pr-4">
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

          <DialogFooter className="p-6 pt-4 border-t bg-muted/5 flex gap-3">
            <Button variant="ghost" onClick={() => setPreviewOpen(false)} className="font-bold text-[11px] uppercase tracking-widest rounded-xl px-6">Close</Button>
            <Button onClick={() => previewData && handleEdit(previewData.id)} className="font-bold text-[11px] uppercase tracking-widest rounded-xl px-8 shadow-sm">Edit Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-2xl border-none shadow-2xl">
          <form onSubmit={handleFormSubmit} className="flex flex-col h-full overflow-hidden">
            <DialogHeader className="p-6 pb-4 border-b bg-muted/5">
              <DialogTitle className="text-xl font-bold tracking-tight">{editingId ? "Modify Item" : "Library Addition"}</DialogTitle>
              <DialogDescription className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 mt-0.5">Define institutional grade assessment items</DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              <ScrollArea className="h-full">
                <div className="p-8 space-y-10">
                  {formLoading && !formData.content ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-3">
                      <Skeleton variant="title" className="h-6 w-32" />
                      <Skeleton variant="text" className="w-full mt-4" />
                    </div>
                  ) : (
                    <div className="space-y-10">
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <Label htmlFor="content" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 ml-1">Question Prompt</Label>
                          <Textarea
                            id="content"
                            placeholder="Enter the central question or instruction..."
                            className="min-h-[140px] text-base font-semibold p-6 rounded-2xl border-muted-foreground/10 focus-visible:ring-primary/20 bg-muted/10 leading-relaxed shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                            value={formData.content}
                            onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
                            required
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-3">
                            <Label htmlFor="type" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 ml-1">Protocol Type</Label>
                            <Select
                              value={formData.question_type}
                              onValueChange={(val) => setFormData((prev) => ({ ...prev, question_type: val as any }))}
                            >
                              <SelectTrigger id="type" className="h-11 rounded-xl border-muted-foreground/10 bg-muted/5 font-medium">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl">
                                <SelectItem value="mcq">Multiple Choice</SelectItem>
                                <SelectItem value="true_false">True / False</SelectItem>
                                <SelectItem value="short_answer">Short Answer</SelectItem>
                                <SelectItem value="essay">Essay Response</SelectItem>
                                <SelectItem value="matching">Matching Pairs</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-3">
                            <Label htmlFor="difficulty" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 ml-1">Complexity Vector</Label>
                            <Select
                              value={formData.difficulty}
                              onValueChange={(val) => setFormData((prev) => ({ ...prev, difficulty: val as any }))}
                            >
                              <SelectTrigger id="difficulty" className="h-11 rounded-xl border-muted-foreground/10 bg-muted/5 font-medium">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl">
                                <SelectItem value="easy">Level 1 (Easy)</SelectItem>
                                <SelectItem value="medium">Level 2 (Medium)</SelectItem>
                                <SelectItem value="hard">Level 3 (Hard)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                          <div className="space-y-3">
                            <Label htmlFor="marks" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 ml-1">Weight (Marks)</Label>
                            <Input
                              id="marks"
                              type="number"
                              min={1}
                              className="h-11 font-bold text-center rounded-xl border-muted-foreground/10 bg-muted/5"
                              value={formData.suggested_marks}
                              onChange={(e) => setFormData((prev) => ({ ...prev, suggested_marks: Number(e.target.value) }))}
                            />
                          </div>
                          <div className="space-y-3">
                            <Label htmlFor="course" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 ml-1">Course Assignment</Label>
                            <Select
                              value={formData.course_id}
                              onValueChange={(val) => setFormData((prev) => ({ ...prev, course_id: val }))}
                            >
                              <SelectTrigger id="course" className="h-11 rounded-xl border-muted-foreground/10 bg-muted/5 font-medium">
                                <SelectValue placeholder="General Utility" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl">
                                {courses.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>{c.title} ({c.code})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-3">
                            <Label htmlFor="topic" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 ml-1">Topic Classification</Label>
                            <Input
                              id="topic"
                              placeholder="e.g. Molecular Biology"
                              className="h-11 rounded-xl border-muted-foreground/10 bg-muted/5 font-medium"
                              value={formData.topic}
                              onChange={(e) => setFormData((prev) => ({ ...prev, topic: e.target.value }))}
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 ml-1">Media Integration</Label>
                          <div className="flex items-center gap-6">
                            {formData.image_url ? (
                                <div className="relative group size-24 rounded-2xl border shadow-sm overflow-hidden bg-white p-1">
                                    <img src={formData.image_url} alt="Preview" className="size-full object-contain rounded-xl" />
                                    <button 
                                        type="button"
                                        onClick={() => setFormData(p => ({ ...p, image_url: undefined }))}
                                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center text-white"
                                    >
                                        <Trash2 className="size-5 mb-1" />
                                        <span className="text-[9px] font-bold uppercase">Clear</span>
                                    </button>
                                </div>
                            ) : (
                                <label className="size-24 rounded-2xl border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/5 hover:border-primary/30 transition-all group">
                                    <Upload className="size-5 text-muted-foreground/40 group-hover:text-primary/60 mb-2" />
                                    <span className="text-[9px] font-bold text-muted-foreground/60 group-hover:text-primary/70 uppercase tracking-tighter">Upload Image</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                                </label>
                            )}
                            <div className="space-y-1.5 py-1">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Protocol Support</p>
                                <p className="text-[10px] text-muted-foreground/60 leading-relaxed font-medium">Standard JPG, PNG, SVG supported.<br/>Maximum allocation 5MB per trace.<br/>Diagrams are securely processed.</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <Separator className="bg-border/50" />

                      {(formData.question_type === "mcq" || formData.question_type === "true_false" || formData.question_type === "matching" || formData.question_type === "ordering") && (
                        <div className="space-y-6">
                          <div className="flex items-center justify-between px-1">
                            <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
                              {formData.question_type === "matching" ? "Relational Matrix" : "Response Nodes / Sequence"}
                            </Label>
                            {formData.question_type !== "true_false" && (
                              <Button type="button" variant="outline" size="sm" onClick={addOption} className="h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider border-primary/20 text-primary hover:bg-primary/5">
                                <Plus className="mr-1.5 size-3.5" /> Add {formData.question_type === "matching" ? "Pair" : "Item"}
                              </Button>
                            )}
                          </div>
                          <div className="space-y-3">
                            {formData.options.map((opt, idx) => (
                              <div key={idx} className="flex items-start gap-4 p-5 rounded-2xl border bg-muted/[0.03] transition-all focus-within:bg-background focus-within:ring-1 focus-within:ring-primary/20 hover:border-muted-foreground/20">
                                <div className="pt-2.5 flex flex-col items-center gap-2">
                                  {(formData.question_type === "mcq" || formData.question_type === "true_false") ? (
                                    <Checkbox
                                      checked={opt.is_correct}
                                      onCheckedChange={(checked) => updateOption(idx, "is_correct", !!checked)}
                                      className="size-5 rounded-md border-muted-foreground/30 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-400"
                                    />
                                  ) : (
                                    <div className="size-6 rounded-lg bg-muted flex items-center justify-center text-[10px] font-black text-muted-foreground/40">
                                      {idx + 1}
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 flex gap-4">
                                  <Input
                                    placeholder={formData.question_type === "matching" ? "Left Item..." : `Option ${idx + 1} trace...`}
                                    value={opt.option_text}
                                    onChange={(e) => updateOption(idx, "option_text", e.target.value)}
                                    className="border-none bg-transparent shadow-none px-0 h-10 font-semibold text-sm focus-visible:ring-0 placeholder:text-muted-foreground/30"
                                    required
                                    disabled={formData.question_type === "true_false"}
                                  />
                                  {formData.question_type === "matching" && (
                                    <>
                                      <ArrowRight className="size-4 text-muted-foreground/20 mt-3" />
                                      <Input
                                        placeholder="Right Match..."
                                        value={opt.option_text_right || ""}
                                        onChange={(e) => updateOption(idx, "option_text_right", e.target.value)}
                                        className="border-none bg-transparent shadow-none px-0 h-10 font-semibold text-sm focus-visible:ring-0 text-primary placeholder:text-muted-foreground/30"
                                        required
                                      />
                                    </>
                                  )}
                                </div>
                                {formData.question_type !== "true_false" && formData.options.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeOption(idx)}
                                    className="text-muted-foreground/30 hover:text-destructive hover:bg-destructive/5 h-10 w-10 shrink-0 transition-all rounded-xl"
                                  >
                                    <X className="size-4" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-8 pt-4 border-t border-dashed border-muted-foreground/10">
                        <div className="space-y-3">
                          <Label htmlFor="explanation" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 ml-1">Logic Evaluation / Rubric</Label>
                          <Textarea
                            id="explanation"
                            placeholder="Detail the reasoning or correct response path..."
                            className="min-h-[110px] text-xs font-medium p-5 rounded-2xl border-muted-foreground/10 bg-primary/[0.01] focus-visible:ring-primary/10 leading-relaxed shadow-[inset_0_2px_4px_rgba(0,0,0,0.01)]"
                            value={formData.explanation}
                            onChange={(e) => setFormData((prev) => ({ ...prev, explanation: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-3">
                          <Label htmlFor="hint" className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700/50 ml-1">Student Orientation Hint</Label>
                          <Input
                            id="hint"
                            placeholder="Nudge students towards the correct approach..."
                            className="h-11 text-xs font-medium border-amber-100/50 bg-amber-50/[0.03] focus-visible:ring-amber-200 rounded-xl px-5"
                            value={formData.hint}
                            onChange={(e) => setFormData((prev) => ({ ...prev, hint: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="p-8 border-t bg-muted/5 flex justify-end gap-3 px-10">
                <Button type="button" variant="ghost" onClick={() => setFormOpen(false)} className="font-bold text-[11px] uppercase tracking-widest rounded-xl px-6 h-11">Abort</Button>
                <Button type="submit" disabled={formLoading} className="font-bold text-[11px] uppercase tracking-widest rounded-xl min-w-[180px] h-11 shadow-sm">
                    {formLoading ? <><Loader2 className="mr-2 size-3.5 animate-spin" /> Processing...</> : <><Database className="mr-2 size-3.5" /> {editingId ? "Finalize Changes" : "Commit to Bank"}</>}
                </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
