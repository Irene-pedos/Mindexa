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
} from "lucide-react";
import {
  questionApi,
  QuestionBankItem,
  QuestionOption,
  QuestionCreateRequest,
} from "@/lib/api/question";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export default function LecturerQuestionBank() {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [filterType, setFilterType] = useState("all");
  const [filterDifficulty, setFilterDifficulty] = useState("all");
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);

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
        page_size: 50,
      });
      setQuestions(response.items as any);
    } catch (error: any) {
      console.error("Failed to fetch questions", error);
      toast.error(error.message || "Could not load questions from bank");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterType, filterDifficulty]);

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
        explanation: data.explanation || "",
        hint: data.hint || "",
        question_type: data.question_type.toLowerCase() as any,
        difficulty: data.difficulty.toLowerCase() as any,
        suggested_marks: data.marks,
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
          <h1 className="text-3xl font-semibold tracking-tight">Question Bank</h1>
          <p className="text-muted-foreground mt-1">Manage and reuse your institutional question library</p>
        </div>
        <Button onClick={handleAdd} className="h-10 px-5 shadow-sm">
          <Plus className="mr-2 size-4" /> New Question
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search questions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-52 h-10">
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
          <SelectTrigger className="w-44 h-10">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="EASY">Easy</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HARD">Hard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="space-y-4">
             {[1, 2, 3, 4, 5].map(i => (
                <Card key={i} className="shadow-none border p-6">
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
          <Card className="border-dashed shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <Database className="size-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground font-medium">No questions found matching your criteria.</p>
              <Button
                variant="link"
                className="mt-2 text-primary"
                onClick={() => {
                  setSearchTerm("");
                  setFilterType("all");
                  setFilterDifficulty("all");
                }}
              >
                Clear all filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          questions.map((q) => (
            <Card key={q.id} className="shadow-none border hover:border-primary/20 transition-all group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <CardTitle className="text-base leading-snug line-clamp-2 font-medium">
                      {q.content}
                    </CardTitle>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="capitalize text-[10px] font-medium text-muted-foreground">
                        {q.question_type.toLowerCase().replace("_", " ")}
                      </Badge>
                      <Badge variant="secondary" className="capitalize text-[10px] font-medium">
                        {q.difficulty.toLowerCase()}
                      </Badge>
                      {q.topic && (
                        <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary text-[10px] font-medium">
                          {q.topic}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive h-8 w-8"
                      onClick={() => handleDelete(q.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between text-[11px] pt-3 border-t">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground font-medium uppercase tracking-wider">Marks:</span>
                      <span className="font-bold">{q.marks}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground font-medium uppercase tracking-wider">Created:</span>
                      <span className="font-bold">{new Date(q.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-medium"
                      onClick={() => handlePreview(q.id)}
                    >
                      <Eye className="mr-1.5 size-3.5" /> Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-medium"
                      onClick={() => handleEdit(q.id)}
                    >
                      <Edit className="mr-1.5 size-3.5" /> Edit
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
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-6 pb-0">
            <div className="flex items-center justify-between pr-8">
              <div>
                <DialogTitle>Question Preview</DialogTitle>
                <DialogDescription>Institutional rendering for student evaluation</DialogDescription>
              </div>
              <Badge variant="outline" className="font-medium">{previewData?.marks} Marks</Badge>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 px-6 py-6">
            {loadingDetail ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <Skeleton variant="title" className="h-6 w-32" />
                <Skeleton variant="media" className="h-32 w-full mt-4" />
                <Skeleton variant="text" className="w-full mt-8" />
              </div>
            ) : previewData ? (
              <div className="space-y-8">
                <div className="space-y-3">
                  <Label className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Stem</Label>
                  <div className="text-sm font-medium leading-relaxed p-4 rounded-lg border bg-muted/20">
                    {previewData.content}
                  </div>
                </div>

                {previewData.options && previewData.options.length > 0 && (
                  <div className="space-y-4">
                    <Label className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Response Options</Label>
                    <div className="grid gap-2">
                      {previewData.options.map((opt, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-center justify-between p-3 px-4 rounded-md border text-sm transition-colors",
                            opt.is_correct ? "bg-primary/5 border-primary/20 text-primary" : "bg-background"
                          )}
                        >
                          <div className="flex items-center gap-4">
                            <div className="size-6 rounded border flex items-center justify-center text-[10px] font-medium bg-muted/30">
                              {String.fromCharCode(65 + idx)}
                            </div>
                            <span className="font-medium">{opt.option_text}</span>
                          </div>
                          {opt.is_correct && <CheckCircle2 className="size-4 text-primary" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(previewData.explanation || previewData.hint) && (
                  <div className="space-y-4 pt-4 border-t border-dashed">
                    {previewData.explanation && (
                      <div className="p-4 rounded-md bg-muted/30 border">
                        <h4 className="text-xs font-medium flex items-center gap-2 mb-1.5 text-foreground">
                          <AlertCircle className="size-3.5" /> Explanation
                        </h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {previewData.explanation}
                        </p>
                      </div>
                    )}
                    {previewData.hint && (
                      <div className="p-4 rounded-md bg-muted/30 border">
                        <h4 className="text-xs font-medium flex items-center gap-2 mb-1.5 text-foreground">
                          <BrainCircuit className="size-3.5" /> Student Hint
                        </h4>
                        <p className="text-sm text-muted-foreground leading-relaxed italic">
                          {previewData.hint}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </ScrollArea>

          <DialogFooter className="p-6 pt-2 border-t bg-muted/5">
            <Button variant="ghost" onClick={() => setPreviewOpen(false)} className="font-medium">Close</Button>
            <Button onClick={() => previewData && handleEdit(previewData.id)} className="font-medium">Edit Question</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <form onSubmit={handleFormSubmit} className="flex flex-col h-full">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="text-xl">{editingId ? "Modify Question" : "Library Addition"}</DialogTitle>
              <DialogDescription>Define institutional grade assessment items</DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1 px-6 py-6">
              {formLoading && !formData.content ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3">
                  <Skeleton variant="title" className="h-6 w-32" />
                  <Skeleton variant="text" className="w-full mt-4" />
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="content" className="text-xs font-bold uppercase tracking-wider">Question Stem</Label>
                      <Textarea
                        id="content"
                        placeholder="Enter the central question or instruction..."
                        className="min-h-[120px] text-base"
                        value={formData.content}
                        onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="type" className="text-xs font-bold uppercase tracking-wider">Type</Label>
                        <Select
                          value={formData.question_type}
                          onValueChange={(val) => setFormData((prev) => ({ ...prev, question_type: val as any }))}
                        >
                          <SelectTrigger id="type" className="h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mcq">Multiple Choice</SelectItem>
                            <SelectItem value="true_false">True / False</SelectItem>
                            <SelectItem value="short_answer">Short Answer</SelectItem>
                            <SelectItem value="essay">Essay Response</SelectItem>
                            <SelectItem value="matching">Matching Pairs</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="difficulty" className="text-xs font-bold uppercase tracking-wider">Difficulty</Label>
                        <Select
                          value={formData.difficulty}
                          onValueChange={(val) => setFormData((prev) => ({ ...prev, difficulty: val as any }))}
                        >
                          <SelectTrigger id="difficulty" className="h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="easy">Easy Level</SelectItem>
                            <SelectItem value="medium">Medium Level</SelectItem>
                            <SelectItem value="hard">Hard Level</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="marks" className="text-xs font-bold uppercase tracking-wider">Marks</Label>
                        <Input
                          id="marks"
                          type="number"
                          min={1}
                          className="h-10 font-bold"
                          value={formData.suggested_marks}
                          onChange={(e) => setFormData((prev) => ({ ...prev, suggested_marks: Number(e.target.value) }))}
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="topic" className="text-xs font-bold uppercase tracking-wider">Topic Tag</Label>
                        <Input
                          id="topic"
                          placeholder="e.g. Molecular Biology"
                          className="h-10"
                          value={formData.topic}
                          onChange={(e) => setFormData((prev) => ({ ...prev, topic: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {(formData.question_type === "mcq" || formData.question_type === "true_false" || formData.question_type === "matching" || formData.question_type === "ordering") && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                          {formData.question_type === "matching" ? "Matching Pairs" : "Response Options / Sequence"}
                        </Label>
                        {formData.question_type !== "true_false" && (
                          <Button type="button" variant="outline" size="sm" onClick={addOption} className="h-8">
                            <Plus className="mr-1.5 size-3.5" /> Add {formData.question_type === "matching" ? "Pair" : "Item"}
                          </Button>
                        )}
                      </div>
                      <div className="space-y-3">
                        {formData.options.map((opt, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-4 rounded-xl border bg-muted/5 transition-all focus-within:bg-background focus-within:ring-1 focus-within:ring-primary/20">
                            <div className="pt-2.5 flex flex-col items-center gap-2">
                              {(formData.question_type === "mcq" || formData.question_type === "true_false") ? (
                                <Checkbox
                                  checked={opt.is_correct}
                                  onCheckedChange={(checked) => updateOption(idx, "is_correct", !!checked)}
                                  className="size-5 rounded"
                                />
                              ) : (
                                <div className="size-6 rounded-lg bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                                  {idx + 1}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 flex gap-3">
                              <Input
                                placeholder={formData.question_type === "matching" ? "Left Item..." : `Option ${idx + 1} text...`}
                                value={opt.option_text}
                                onChange={(e) => updateOption(idx, "option_text", e.target.value)}
                                className="border-none bg-transparent shadow-none px-0 h-10 font-medium focus-visible:ring-0"
                                required
                                disabled={formData.question_type === "true_false"}
                              />
                              {formData.question_type === "matching" && (
                                <>
                                  <ArrowRight className="size-4 text-muted-foreground/30 mt-3" />
                                  <Input
                                    placeholder="Right Match..."
                                    value={opt.option_text_right || ""}
                                    onChange={(e) => updateOption(idx, "option_text_right", e.target.value)}
                                    className="border-none bg-transparent shadow-none px-0 h-10 font-medium focus-visible:ring-0"
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
                                className="text-muted-foreground hover:text-destructive h-10 w-10 shrink-0"
                              >
                                <X className="size-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-6 pt-4 border-t border-dashed">
                    <div className="space-y-2">
                      <Label htmlFor="explanation" className="text-xs font-bold uppercase tracking-wider">Evaluation Rubric / Explanation</Label>
                      <Textarea
                        id="explanation"
                        placeholder="Detail the reasoning or correct response path..."
                        className="min-h-[100px] text-sm"
                        value={formData.explanation}
                        onChange={(e) => setFormData((prev) => ({ ...prev, explanation: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hint" className="text-xs font-bold uppercase tracking-wider text-amber-700">Student Hint (Optional)</Label>
                      <Input
                        id="hint"
                        placeholder="Nudge students towards the correct approach..."
                        className="h-10 text-sm border-amber-100 bg-amber-50/10 focus-visible:ring-amber-200"
                        value={formData.hint}
                        onChange={(e) => setFormData((prev) => ({ ...prev, hint: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </ScrollArea>

              <Button type="submit" disabled={formLoading} className="font-semibold min-w-[140px]">
                {formLoading ? "Saving Changes..." : <><Database className="mr-2 size-4" /> {editingId ? "Update Item" : "Save to Bank"}</>}
              </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
