"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Award,
  Sparkles,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Search,
  BookOpenCheck,
  RefreshCw,
  Loader2,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { toast } from "sonner";
import {
  lecturerAiApi,
  RubricCriterion,
  RubricCriterionLevel,
  RubricDraftOutput,
} from "@/lib/api/lecturer-ai";
import { questionApi, QuestionBankItem } from "@/lib/api/question";
import { cn } from "@/lib/utils";

interface RubricAssistantProps {
  workspaceId?: string;
  isRwandaBlocked?: boolean;
}

export function RubricAssistant({
  workspaceId,
  isRwandaBlocked = false,
}: RubricAssistantProps) {
  // Question search & selection
  const [searchQuery, setSearchQuery] = useState("");
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionBankItem | null>(null);
  const [isPickerCollapsed, setIsPickerCollapsed] = useState(false);

  // Rubric drafting parameters
  const [targetMarks, setTargetMarks] = useState<number>(10);
  const [existingNotes, setExistingNotes] = useState<string>("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Drafted Rubric state
  const [rubricTitle, setRubricTitle] = useState("");
  const [rubricDescription, setRubricDescription] = useState("");
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);

  // Search questions on mount / query
  useEffect(() => {
    async function loadQuestions() {
      try {
        setLoadingQuestions(true);
        const res = await questionApi.getQuestions({
          q: searchQuery || undefined,
          page_size: 15,
        });
        setQuestions(res.items || []);
        setSelectedQuestion((prev) => {
          if (!prev && res.items && res.items.length > 0) {
            setTargetMarks(res.items[0].marks || 10);
            return res.items[0];
          }
          return prev;
        });
      } catch (err) {
        console.error("Failed to load questions", err);
      } finally {
        setLoadingQuestions(false);
      }
    }
    const timeout = setTimeout(loadQuestions, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const handleSelectQuestion = (q: QuestionBankItem) => {
    setSelectedQuestion(q);
    setTargetMarks(q.marks || 10);
  };

  const handleDraftRubric = async () => {
    if (!selectedQuestion) {
      toast.error("Please select a target Question first.");
      return;
    }
    if (isRwandaBlocked) {
      toast.error("AI operations are restricted for Kinyarwanda language courses.");
      return;
    }

    try {
      setIsDrafting(true);
      const res = await lecturerAiApi.draftRubric(
        selectedQuestion.id,
        targetMarks,
        existingNotes || undefined
      );

      const drafted = res.rubric;
      setRubricTitle(drafted.title || `${selectedQuestion.question_type} Marking Rubric`);
      setRubricDescription(drafted.description || "");
      setCriteria(drafted.criteria || []);
      toast.success("Drafted rubric criteria successfully!");
    } catch (err: any) {
      console.error("Failed to draft rubric", err);
      toast.error(err.message || "Failed to draft rubric criteria.");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleSaveRubric = async () => {
    if (!selectedQuestion) return;
    if (criteria.length === 0) {
      toast.error("Rubric must contain at least one criterion.");
      return;
    }

    try {
      setIsSaving(true);
      await lecturerAiApi.saveRubric(
        selectedQuestion.id,
        rubricTitle || "Marking Rubric",
        criteria,
        rubricDescription || undefined
      );
      toast.success("Rubric saved and attached to Question in database!");
    } catch (err: any) {
      console.error("Failed to save rubric", err);
      toast.error(err.message || "Failed to save rubric.");
    } finally {
      setIsSaving(false);
    }
  };

  // Criteria manipulation
  const addCriterion = () => {
    const newCrit: RubricCriterion = {
      title: "New Criterion",
      description: "",
      max_marks: 5,
      order_index: criteria.length + 1,
      levels: [
        { label: "Excellent", description: "Demonstrates complete mastery and accuracy.", marks: 5 },
        { label: "Proficient", description: "Demonstrates good understanding with minor errors.", marks: 3 },
        { label: "Inadequate", description: "Fails to meet core requirements.", marks: 0 },
      ],
    };
    setCriteria([...criteria, newCrit]);
  };

  const removeCriterion = (idx: number) => {
    setCriteria(criteria.filter((_, i) => i !== idx));
  };

  const updateCriterion = (idx: number, field: keyof RubricCriterion, val: any) => {
    const next = [...criteria];
    next[idx] = { ...next[idx], [field]: val };
    setCriteria(next);
  };

  const updateLevel = (critIdx: number, lvlIdx: number, field: keyof RubricCriterionLevel, val: any) => {
    const next = [...criteria];
    const levels = [...next[critIdx].levels];
    levels[lvlIdx] = { ...levels[lvlIdx], [field]: val };
    next[critIdx] = { ...next[critIdx], levels };
    setCriteria(next);
  };

  const totalAllocatedMarks = criteria.reduce((sum, c) => sum + (c.max_marks || 0), 0);

  return (
    <div className="flex-1 p-3 sm:p-5 lg:p-6 overflow-y-auto space-y-4 w-full max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-border/40 pb-3 gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
            <Award className="size-4 text-primary" /> Rubric Assistant
          </h3>
          <p className="text-xs text-muted-foreground">
            Grounded directly to a specific Question entity. Draft, customize, and save transparent criterion-referenced marking schemes.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPickerCollapsed(!isPickerCollapsed)}
            className="h-8 text-xs gap-1.5 border-border/60 hover:bg-muted/50"
            title={isPickerCollapsed ? "Show Question Picker" : "Collapse Question Picker to Focus Editor"}
          >
            {isPickerCollapsed ? (
              <>
                <PanelLeftOpen className="size-3.5 text-primary" />
                <span className="hidden sm:inline">Show Question Picker</span>
              </>
            ) : (
              <>
                <PanelLeftClose className="size-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Focus Rubric Table</span>
              </>
            )}
          </Button>

          {criteria.length > 0 && (
            <Button
              onClick={handleSaveRubric}
              disabled={isSaving}
              size="sm"
              className="h-8 text-xs gap-1.5 font-semibold bg-primary text-primary-foreground shadow-xs"
            >
              {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              <span>Save to Question</span>
            </Button>
          )}
        </div>
      </div>

      {isRwandaBlocked && (
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
          <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-semibold">AI Rubric Drafting Restricted</strong>
            <span>Per institutional policy, automated AI drafting is disabled for Kinyarwanda language content.</span>
          </div>
        </div>
      )}

      {/* Main Grid: Collapsible Question Picker, Expandable Criteria Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Question Picker & Config */}
        {!isPickerCollapsed && (
          <Card className="lg:col-span-4 p-4 space-y-4 bg-muted/20 border-border/60 rounded-2xl shadow-xs transition-all">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">Select Target Question</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPickerCollapsed(true)}
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hidden lg:flex"
                title="Collapse question picker"
              >
                <PanelLeftClose className="size-3.5" />
              </Button>
            </div>

            <div className="relative">
              <Search className="size-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
              <Input
                placeholder="Search question bank..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 text-xs pl-8 bg-background rounded-xl"
              />
            </div>

            <div className="space-y-1 max-h-44 overflow-y-auto pr-1 pt-1">
              {loadingQuestions ? (
                <div className="text-xs text-muted-foreground py-2 text-center animate-pulse">
                  Searching questions...
                </div>
              ) : questions.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2 text-center">No questions found.</div>
              ) : (
                questions.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => handleSelectQuestion(q)}
                    className={cn(
                      "w-full p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer",
                      selectedQuestion?.id === q.id
                        ? "border-primary bg-primary/10 font-semibold"
                        : "border-border/60 bg-card hover:bg-muted/40 text-muted-foreground"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 uppercase">
                        {q.question_type}
                      </Badge>
                      <span className="text-[10px] font-semibold text-primary">{q.marks || 1} pts</span>
                    </div>
                    <p className="line-clamp-2 text-[11px] text-foreground leading-snug">{q.content}</p>
                  </button>
                ))
              )}
            </div>

            {selectedQuestion && (
              <div className="p-3.5 bg-card border border-border/60 rounded-xl space-y-1.5 text-xs">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Selected Question Stem
                </span>
                <p className="text-xs text-foreground font-medium whitespace-pre-wrap">{selectedQuestion.content}</p>
                <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
                  <span>Type: <strong>{selectedQuestion.question_type}</strong></span>
                  <span>&bull;</span>
                  <span>Difficulty: <strong>{selectedQuestion.difficulty}</strong></span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="rubric-marks" className="text-xs font-semibold">
                Total Target Marks
              </Label>
              <Input
                id="rubric-marks"
                type="number"
                min={1}
                max={100}
                value={targetMarks}
                onChange={(e) => setTargetMarks(parseInt(e.target.value) || 10)}
                className="h-9 text-xs bg-background rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="existing-notes" className="text-xs font-semibold">
                Optional Reference Guidelines
              </Label>
              <Textarea
                id="existing-notes"
                placeholder="e.g. Focus on step-by-step query optimization, deduct 2 marks for missing indices..."
                value={existingNotes}
                onChange={(e) => setExistingNotes(e.target.value)}
                className="h-16 text-xs bg-background rounded-xl"
              />
            </div>

            <Button
              onClick={handleDraftRubric}
              disabled={isDrafting || !selectedQuestion || isRwandaBlocked}
              className="w-full h-9.5 text-xs font-semibold text-primary-foreground bg-primary rounded-xl shadow-xs"
            >
              {isDrafting ? (
                <RefreshCw className="size-3.5 animate-spin mr-1.5" />
              ) : (
                <Sparkles className="size-3.5 mr-1.5" />
              )}
              Draft Rubric Scheme
            </Button>
          </Card>
        )}

        {/* Right Column: Editable Rubric Criteria (Expands to col-span-12 when picker collapsed) */}
        <div className={cn(
          "space-y-3 transition-all duration-200",
          isPickerCollapsed ? "lg:col-span-12" : "lg:col-span-8"
        )}>
          {/* Collapsed Picker Helper Banner */}
          {isPickerCollapsed && selectedQuestion && (
            <div className="p-2.5 bg-muted/30 border border-border/60 rounded-xl flex items-center justify-between text-xs gap-3">
              <div className="flex items-center gap-2 truncate">
                <Badge variant="outline" className="text-[10px] uppercase font-semibold shrink-0">
                  {selectedQuestion.question_type}
                </Badge>
                <span className="font-semibold text-foreground truncate">{selectedQuestion.content}</span>
                <span className="text-[10px] text-primary font-bold shrink-0">
                  ({targetMarks} marks)
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPickerCollapsed(false)}
                  className="h-7 text-[11px] px-2.5 gap-1"
                >
                  <PanelLeftOpen className="size-3 text-primary" />
                  <span>Change Target Question</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleDraftRubric}
                  disabled={isDrafting || isRwandaBlocked}
                  className="h-7 text-[11px] px-2.5 gap-1 font-semibold"
                >
                  <RefreshCw className={cn("size-3", isDrafting && "animate-spin")} />
                  <span>Redraft Scheme</span>
                </Button>
              </div>
            </div>
          )}
          {isDrafting ? (
            <Card className="p-12 flex flex-col items-center justify-center space-y-3 border-border/60 min-h-[420px]">
              <Loader2 className="size-8 text-primary animate-spin" />
              <div className="text-center space-y-1">
                <p className="text-xs font-semibold text-foreground">
                  Drafting Objective Rubric Criteria...
                </p>
                <p className="text-[11px] text-muted-foreground max-w-sm">
                  Allocating mark weights and defining descriptive achievement levels.
                </p>
              </div>
            </Card>
          ) : criteria.length === 0 ? (
            <Card className="p-12 flex flex-col items-center justify-center space-y-2 border-border/60 min-h-[420px] text-center">
              <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <BookOpenCheck className="size-5 text-primary" />
              </div>
              <h4 className="text-sm font-semibold text-foreground">No Rubric Drafted Yet</h4>
              <p className="text-xs text-muted-foreground max-w-md">
                Select a Question on the left and click &ldquo;Draft Rubric Scheme&rdquo; to generate criteria, or click below to build one manually.
              </p>
              <Button variant="outline" size="sm" onClick={addCriterion} className="mt-2 text-xs gap-1">
                <Plus className="size-3.5" /> Create Criterion Manually
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Header & Marks Balancer */}
              <div className="p-3.5 bg-card border border-border/60 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <Input
                    value={rubricTitle}
                    onChange={(e) => setRubricTitle(e.target.value)}
                    placeholder="Rubric Title..."
                    className="font-bold text-sm h-8 bg-background max-w-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {criteria.length} criteria defined
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5",
                    totalAllocatedMarks === targetMarks
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                  )}>
                    {totalAllocatedMarks === targetMarks ? (
                      <CheckCircle2 className="size-3.5 text-emerald-600" />
                    ) : (
                      <AlertCircle className="size-3.5 text-amber-600" />
                    )}
                    <span>
                      Allocated: {totalAllocatedMarks} / {targetMarks} marks
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={addCriterion} className="h-8 text-xs gap-1">
                    <Plus className="size-3.5" /> Add Criterion
                  </Button>
                </div>
              </div>

              {/* Criteria List */}
              <div className="space-y-3">
                {criteria.map((crit, cIdx) => (
                  <Card key={cIdx} className="p-4 border-border/70 bg-card space-y-3 shadow-xs">
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                      <div className="flex items-center gap-2 flex-1">
                        <Badge variant="secondary" className="text-xs px-2 py-0.5">
                          #{cIdx + 1}
                        </Badge>
                        <Input
                          value={crit.title}
                          onChange={(e) => updateCriterion(cIdx, "title", e.target.value)}
                          placeholder="Criterion Name (e.g. Correctness of Algorithm)..."
                          className="font-semibold text-xs h-8 bg-background flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Max:</span>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={crit.max_marks}
                            onChange={(e) => updateCriterion(cIdx, "max_marks", parseInt(e.target.value) || 1)}
                            className="w-16 h-8 text-xs bg-background font-bold"
                          />
                          <span className="text-xs text-muted-foreground">pts</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCriterion(cIdx)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Remove Criterion"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Criterion Description */}
                    <Input
                      value={crit.description || ""}
                      onChange={(e) => updateCriterion(cIdx, "description", e.target.value)}
                      placeholder="Criterion purpose or marking guidance..."
                      className="text-xs h-7.5 bg-background text-muted-foreground"
                    />

                    {/* Performance Levels */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                        Performance Levels & Descriptors
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {crit.levels.map((lvl, lIdx) => (
                          <div key={lIdx} className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Input
                                value={lvl.label}
                                onChange={(e) => updateLevel(cIdx, lIdx, "label", e.target.value)}
                                className="text-xs font-semibold h-6 px-1.5 bg-background w-24"
                              />
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min={0}
                                  value={lvl.marks}
                                  onChange={(e) => updateLevel(cIdx, lIdx, "marks", parseInt(e.target.value) || 0)}
                                  className="w-12 h-6 text-xs bg-background font-bold text-primary px-1"
                                />
                                <span className="text-[10px] text-muted-foreground">pts</span>
                              </div>
                            </div>
                            <Textarea
                              value={lvl.description}
                              onChange={(e) => updateLevel(cIdx, lIdx, "description", e.target.value)}
                              placeholder="Achievement descriptor..."
                              className="text-[11px] h-16 bg-background leading-relaxed"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
