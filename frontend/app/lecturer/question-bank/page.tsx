// frontend/app/lecturer/question-bank/page.tsx
"use client";

import React, { useState, useEffect } from "react";
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
  ChevronLeft, 
  X,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { 
  questionApi, 
  QuestionBankItem, 
  QuestionOption, 
  QuestionCreateRequest 
} from "@/lib/api/question";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";

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

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const response = await questionApi.getQuestions({
        q: debouncedSearch,
        type: filterType === "all" ? undefined : filterType,
        difficulty: filterDifficulty === "all" ? undefined : filterDifficulty,
        page_size: 50,
      });
      // Summaries don't have all data, but that's fine for the list
      setQuestions(response.items as any);
    } catch (error: any) {
      console.error("Failed to fetch questions", error);
      toast.error(error.message || "Could not load questions from bank");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, [debouncedSearch, filterType, filterDifficulty]);

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
        options: data.options.map(opt => ({
          option_text: opt.option_text,
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
    
    // Simple validation
    if (formData.question_type === "mcq" || formData.question_type === "true_false") {
      const hasCorrect = formData.options.some(o => o.is_correct);
      if (!hasCorrect) {
        toast.error("Please mark at least one option as correct");
        return;
      }
    }

    setFormLoading(true);
    try {
      if (editingId) {
        await questionApi.updateQuestion(editingId, formData);
        toast.success("Question updated successfully (new version created)");
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
    setFormData(prev => ({
      ...prev,
      options: [
        ...prev.options,
        { option_text: "", is_correct: false, order_index: prev.options.length + 1 }
      ]
    }));
  };

  const removeOption = (index: number) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const updateOption = (index: number, field: keyof Omit<QuestionOption, "id">, value: any) => {
    setFormData(prev => {
      const newOptions = [...prev.options];
      newOptions[index] = { ...newOptions[index], [field]: value };
      
      // If setting MCQ correct and only one should be correct (optional logic)
      // if (field === 'is_correct' && value === true && prev.question_type === 'mcq') {
      //   newOptions.forEach((o, i) => { if(i !== index) o.is_correct = false; });
      // }
      
      return { ...prev, options: newOptions };
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Question Bank
          </h1>
          <p className="text-muted-foreground mt-1">
            Reusable, searchable, and AI-assisted question library
          </p>
        </div>
        <Button size="lg" onClick={handleAdd}>
          <Plus className="mr-2 size-5" /> Add New Question
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            placeholder="Search questions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-52">
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
          <SelectTrigger className="w-44">
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

      <div className="grid gap-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="size-10 animate-spin" />
            <p>Loading questions...</p>
          </div>
        ) : questions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-muted-foreground">
                No questions found in the bank.
              </p>
              <Button
                variant="link"
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
            <Card key={q.id} className="hover:shadow-md transition-all group">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg leading-tight line-clamp-2">
                      {q.content}
                    </CardTitle>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Badge variant="outline" className="capitalize">
                        {q.question_type.toLowerCase().replace("_", " ")}
                      </Badge>
                      <Badge variant="secondary" className="capitalize">
                        {q.difficulty.toLowerCase()}
                      </Badge>
                      {q.topic && (
                        <Badge
                          variant="outline"
                          className="bg-primary/5 border-primary/20 text-primary"
                        >
                          {q.topic}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(q.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm pt-2 border-t">
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-muted-foreground">Marks:</span>{" "}
                      {q.marks}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Created:</span>{" "}
                      {new Date(q.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handlePreview(q.id)}
                    >
                      <Eye className="mr-2 size-4" /> Preview
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleEdit(q.id)}
                    >
                      <Edit className="mr-2 size-4" /> Edit
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Question Preview</DialogTitle>
            <DialogDescription>
              Check how the question looks for students
            </DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : previewData ? (
            <div className="space-y-6 pt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  <span>Question Stem</span>
                  <Badge variant="secondary">{previewData.marks} Marks</Badge>
                </div>
                <div className="text-lg font-medium border rounded-lg p-4 bg-muted/30">
                  {previewData.content}
                </div>
              </div>

              {previewData.options && previewData.options.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase">Options</p>
                  <div className="grid gap-2">
                    {previewData.options.map((opt, idx) => (
                      <div 
                        key={idx} 
                        className={`flex items-center justify-between p-3 rounded-md border ${opt.is_correct ? 'bg-emerald-50 border-emerald-200' : 'bg-white'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="size-6 rounded-full border flex items-center justify-center text-[10px] font-bold">
                            {String.fromCharCode(65 + idx)}
                          </div>
                          <span className="text-sm">{opt.option_text}</span>
                        </div>
                        {opt.is_correct && (
                          <CheckCircle2 className="size-4 text-emerald-600" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {previewData.explanation && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                  <h4 className="text-sm font-semibold flex items-center gap-2 mb-1">
                    <AlertCircle className="size-4 text-primary" /> Explanation
                  </h4>
                  <p className="text-sm text-muted-foreground">{previewData.explanation}</p>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
            <Button onClick={() => previewData && handleEdit(previewData.id)}>Edit Question</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleFormSubmit}>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Question" : "Add New Question"}</DialogTitle>
              <DialogDescription>
                Fill in the details for your reusable question bank item.
              </DialogDescription>
            </DialogHeader>

            {formLoading && !formData.content ? (
              <div className="py-20 flex justify-center">
                <Loader2 className="size-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="py-6 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="content">Question Content</Label>
                    <Textarea 
                      id="content"
                      placeholder="Enter the main question text here..."
                      className="min-h-[100px]"
                      value={formData.content}
                      onChange={e => setFormData(prev => ({ ...prev, content: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="type">Question Type</Label>
                      <Select 
                        value={formData.question_type} 
                        onValueChange={val => setFormData(prev => ({ ...prev, question_type: val as any }))}
                      >
                        <SelectTrigger id="type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mcq">Multiple Choice</SelectItem>
                          <SelectItem value="true_false">True/False</SelectItem>
                          <SelectItem value="short_answer">Short Answer</SelectItem>
                          <SelectItem value="essay">Essay</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="difficulty">Difficulty</Label>
                      <Select 
                        value={formData.difficulty} 
                        onValueChange={val => setFormData(prev => ({ ...prev, difficulty: val as any }))}
                      >
                        <SelectTrigger id="difficulty">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">Easy</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="marks">Suggested Marks</Label>
                      <Input 
                        id="marks" 
                        type="number" 
                        min={1}
                        value={formData.suggested_marks}
                        onChange={e => setFormData(prev => ({ ...prev, suggested_marks: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="topic">Topic / Tag</Label>
                      <Input 
                        id="topic" 
                        placeholder="e.g. Thermodynamics, Algebra"
                        value={formData.topic}
                        onChange={e => setFormData(prev => ({ ...prev, topic: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Options Section */}
                {(formData.question_type === "mcq" || formData.question_type === "true_false") && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base">Options</Label>
                      {formData.question_type === "mcq" && (
                        <Button type="button" variant="outline" size="sm" onClick={addOption}>
                          <Plus className="mr-2 size-4" /> Add Option
                        </Button>
                      )}
                    </div>
                    <div className="space-y-3">
                      {formData.options.map((opt, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
                          <div className="pt-2">
                            <Checkbox 
                              checked={opt.is_correct}
                              onCheckedChange={checked => updateOption(idx, "is_correct", !!checked)}
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <Input 
                              placeholder={`Option ${idx + 1}`}
                              value={opt.option_text}
                              onChange={e => updateOption(idx, "option_text", e.target.value)}
                              required
                            />
                          </div>
                          {formData.question_type === "mcq" && formData.options.length > 2 && (
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => removeOption(idx)}
                              className="text-destructive"
                            >
                              <X className="size-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4 border-t pt-6">
                  <div className="space-y-2">
                    <Label htmlFor="explanation">Explanation (Optional)</Label>
                    <Textarea 
                      id="explanation"
                      placeholder="Visible to students after grading..."
                      value={formData.explanation}
                      onChange={e => setFormData(prev => ({ ...prev, explanation: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hint">Hint (Optional)</Label>
                    <Input 
                      id="hint"
                      placeholder="Helpful nudge for students during attempt..."
                      value={formData.hint}
                      onChange={e => setFormData(prev => ({ ...prev, hint: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : "Save Question"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
