// app/lecturer/assessments/new/page.tsx
"use client";

import React, { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Trash2,
  Save,
  Eye,
  Clock,
  Shield,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  FileText,
  Layout,
  BrainCircuit,
  ChevronDown,
  Check,
  X,
  GripVertical,
  Database,
  Loader2 as LoaderCircleIcon,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Stepper,
  StepperContent,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/ui/stepper";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiClient } from "@/lib/api/client";
import { questionApi } from "@/lib/api/question";
import { QuestionBankSelector } from "@/components/mindexa/assessment/question-bank-selector";
import { QuestionBankItem } from "@/lib/api/question";

type AssessmentMode = "Practice" | "Homework" | "CAT" | "Summative";
type Difficulty = "Easy" | "Medium" | "Hard";
type QuestionType =
  | "mcq"
  | "truefalse"
  | "shortanswer"
  | "essay"
  | "matching"
  | "fillblank"
  | "computational"
  | "ordering"
  | "casestudy";

interface QuestionOption {
  id?: string;
  option_text: string;
  option_text_right?: string;
  is_correct: boolean;
  order_index: number;
}

interface BlueprintSection {
  id: string;
  section: string;
  topics: string;
  marks: number;
  questions: number;
  difficulty: Difficulty;
  allowedTypes: QuestionType[];
}

interface Question {
  id: string;
  sectionId: string;
  text: string;
  type: QuestionType;
  marks: number;
  options: QuestionOption[];
  aiGenerated: boolean;
}

const PREDEFINED_INSTRUCTIONS = [
  "Fullscreen required",
  "No tab switching",
  "No external materials allowed",
  "Time strictly enforced",
  "Calculators permitted",
  "Formula sheet provided",
];

const TEACHING_SCOPE = {
  colleges: [
    {
      id: "CST",
      name: "College of Science and Technology",
      departments: [
        {
          id: "IT",
          name: "Information Technology",
          courses: [
            {
              id: "BIT211",
              name: "Database Systems",
              classes: [
                { id: "YR2A", name: "Year 2 Section A" },
                { id: "YR2B", name: "Year 2 Section B" },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const STEPS = [
  { title: "Metadata", icon: FileText },
  { title: "Blueprint", icon: Layout },
  { title: "Questions", icon: BrainCircuit },
  { title: "Review", icon: Eye },
  { title: "Publish", icon: CheckCircle2 },
];

export default function NewAssessmentBuilder() {
  const [activeStep, setActiveStep] = useState(1);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  // Step 1: Metadata
  const [metadata, setMetadata] = useState({
    title: "",
    mode: "CAT" as AssessmentMode,
    college: "",
    department: "",
    course: "",
    targetClass: "",
    date: undefined as Date | undefined,
    startTime: "09:00",
    endTime: "11:00",
    durationMinutes: 120,
    selectedInstructions: [] as string[],
    customInstructions: "",
  });

  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  // Step 2: Blueprint & Rules
  const [blueprint, setBlueprint] = useState<BlueprintSection[]>([
    {
      id: "sec-1",
      section: "Section A",
      topics: "",
      marks: 0,
      questions: 0,
      difficulty: "Medium",
      allowedTypes: ["mcq"],
    },
  ]);

  const [rules, setRules] = useState({
    openBook: false,
    supervised: true,
    aiAllowed: false,
    browserRestricted: true,
    shuffleQuestions: true,
    shuffleOptions: true,
    resultRelease: "delayed" as "immediate" | "delayed",
    attempts: 1,
  });

  // Step 3: Question Creation
  const [questions, setQuestions] = useState<Question[]>([]);

  // Derived State
  const totalMarks = useMemo(
    () => blueprint.reduce((sum, s) => sum + s.marks, 0),
    [blueprint],
  );
  const totalQuestions = useMemo(
    () => blueprint.reduce((sum, s) => sum + s.questions, 0),
    [blueprint],
  );
  const currentMarks = useMemo(
    () => questions.reduce((sum, q) => sum + q.marks, 0),
    [questions],
  );

  const availableInstructions = useMemo(() => {
    if (metadata.mode === "Homework") {
      return PREDEFINED_INSTRUCTIONS.filter(
        (i) =>
          i !== "Fullscreen required" &&
          i !== "No tab switching" &&
          i !== "Time strictly enforced",
      );
    }
    if (metadata.mode === "Practice") {
      return PREDEFINED_INSTRUCTIONS.filter(
        (i) => i !== "Fullscreen required" && i !== "No tab switching",
      );
    }
    return PREDEFINED_INSTRUCTIONS;
  }, [metadata.mode]);

  // Handlers
  const addSection = () => {
    const nextLetter = String.fromCharCode(65 + blueprint.length);
    setBlueprint([
      ...blueprint,
      {
        id: `sec-${Date.now()}`,
        section: `Section ${nextLetter}`,
        topics: "",
        marks: 0,
        questions: 0,
        difficulty: "Medium",
        allowedTypes: ["mcq"],
      },
    ]);
  };

  const updateSection = <K extends keyof BlueprintSection>(
    id: string,
    field: K,
    value: BlueprintSection[K],
  ) => {
    setBlueprint(
      blueprint.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    );
  };

  const removeSection = (id: string) => {
    if (blueprint.length === 1) return;
    setBlueprint(blueprint.filter((s) => s.id !== id));
    setQuestions(questions.filter((q) => q.sectionId !== id));
  };

  const addQuestion = (sectionId: string) => {
    const section = blueprint.find((s) => s.id === sectionId);
    if (!section) return;

    const type = section.allowedTypes[0] || "mcq";
    let initialOptions: QuestionOption[] = [];

    if (type === "mcq") {
      initialOptions = [
        { option_text: "Option 1", is_correct: true, order_index: 0 },
        { option_text: "Option 2", is_correct: false, order_index: 1 },
      ];
    } else if (type === "truefalse") {
      initialOptions = [
        { option_text: "True", is_correct: true, order_index: 0 },
        { option_text: "False", is_correct: false, order_index: 1 },
      ];
    }

    setQuestions([
      ...questions,
      {
        id: `q-${Date.now()}`,
        sectionId,
        text: "",
        type,
        marks: Math.floor(section.marks / (section.questions || 1)),
        options: initialOptions,
        aiGenerated: false,
      },
    ]);
  };

  const handleBankSelect = (qBank: QuestionBankItem, sectionId: string) => {
    const mappedType = qBank.question_type.toLowerCase().replace("_", "") as QuestionType;
    
    setQuestions([
      ...questions,
      {
        id: `q-bank-${qBank.id}-${Date.now()}`,
        sectionId,
        text: qBank.content,
        type: mappedType,
        marks: qBank.marks,
        options: qBank.options.map(opt => ({
          option_text: opt.option_text,
          option_text_right: opt.option_text_right,
          is_correct: opt.is_correct,
          order_index: opt.order_index
        })),
        aiGenerated: false,
      },
    ]);
    toast.success("Question added from bank");
  };

  const handleSaveDraft = async () => {
    if (isSavingDraft || isPublishing) return;
    setIsSavingDraft(true);
    try {
      await apiClient("/assessments/draft", {
        method: "POST",
        body: JSON.stringify({ metadata, blueprint, questions, rules }),
      });
      toast.success("Draft saved successfully");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to save draft";
      toast.error(msg);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions(
      questions.map((q) => (q.id === id ? { ...q, ...updates } : q)),
    );
  };

  const updateOption = (qId: string, optIdx: number, updates: Partial<QuestionOption>) => {
    setQuestions(questions.map(q => {
      if (q.id !== qId) return q;
      const newOptions = [...q.options];
      newOptions[optIdx] = { ...newOptions[optIdx], ...updates };
      return { ...q, options: newOptions };
    }));
  };

  const addOption = (qId: string) => {
    setQuestions(questions.map(q => {
      if (q.id !== qId) return q;
      return {
        ...q,
        options: [
          ...q.options,
          { option_text: `Option ${q.options.length + 1}`, is_correct: false, order_index: q.options.length }
        ]
      };
    }));
  };

  const removeOption = (qId: string, optIdx: number) => {
    setQuestions(questions.map(q => {
      if (q.id !== qId) return q;
      return {
        ...q,
        options: q.options.filter((_, i) => i !== optIdx).map((opt, i) => ({ ...opt, order_index: i }))
      };
    }));
  };

  const handleSaveToBank = async (q: Question) => {
    if (!q.text) {
      toast.error("Please enter question text before saving to bank");
      return;
    }

    try {
      const typeMap: Record<string, string> = {
        mcq: "MCQ",
        truefalse: "TRUE_FALSE",
        shortanswer: "SHORT_ANSWER",
        essay: "ESSAY",
        matching: "MATCHING",
        fillblank: "FILL_BLANK",
        computational: "COMPUTATIONAL",
        ordering: "ORDERING",
        casestudy: "CASE_STUDY",
      };

      await questionApi.createQuestion({
        content: q.text,
        question_type: typeMap[q.type] || "SHORT_ANSWER",
        difficulty: "medium",
        suggested_marks: q.marks,
        options: q.options.map((opt) => ({
          option_text: opt.option_text,
          option_text_right: opt.option_text_right,
          is_correct: opt.is_correct,
          order_index: opt.order_index,
        })),
        topic: blueprint.find((s) => s.id === q.sectionId)?.topics || "",
      });
      toast.success("Question saved to bank successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to save question to bank");
    }
  };

  const handlePublish = async () => {
    if (isPublishing || isSavingDraft) return;
    if (currentMarks !== totalMarks) {
      toast.error(`Total marks mismatch! Expected ${totalMarks}, but got ${currentMarks}`);
      return;
    }
    if (questions.length !== totalQuestions) {
      toast.error(`Question count mismatch! Expected ${totalQuestions}, but got ${questions.length}`);
      return;
    }
    setIsPublishing(true);
    try {
      const result = await apiClient("/assessments/publish", {
        method: "POST",
        body: JSON.stringify({ metadata, blueprint, questions, rules }),
      }) as { validation_passed: boolean; errors?: string[] };
      
      if (result.validation_passed) {
        toast.success("Assessment published successfully!");
      } else {
        toast.error(`Publishing failed: ${result.errors?.join(", ") || "Validation failed"}`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to publish assessment";
      toast.error(msg);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Assessment Builder
          </h1>
          <p className="text-muted-foreground text-sm">
            Step-based creation of secure academic assessments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={isSavingDraft || isPublishing}
            className="h-8"
          >
            <Save className="mr-2 size-3.5" />
            {isSavingDraft ? "Saving..." : "Save Draft"}
          </Button>
          <Badge variant="outline" className="px-3 h-7 text-[11px] font-bold">
            Step {activeStep} of 5
          </Badge>
        </div>
      </div>

      <Stepper
        value={activeStep}
        onValueChange={setActiveStep}
        indicators={{
          completed: <Check className="size-3.5" />,
          loading: <LoaderCircleIcon className="size-3.5 animate-spin" />,
        }}
        className="space-y-6"
      >
        <StepperNav className="gap-2">
          {STEPS.map((s, index) => {
            const Icon = s.icon;
            return (
              <StepperItem key={index} step={index + 1} className="relative">
                <StepperTrigger className="flex justify-start gap-1.5 p-2 hover:bg-muted/50 rounded-lg">
                  <StepperIndicator className="size-7">
                    <Icon className="size-3.5" />
                  </StepperIndicator>
                  <StepperTitle className="text-xs font-semibold">{s.title}</StepperTitle>
                </StepperTrigger>
                {STEPS.length > index + 1 && (
                  <StepperSeparator className="group-data-[state=completed]/step:bg-primary" />
                )}
              </StepperItem>
            );
          })}
        </StepperNav>

        <StepperPanel>
          <StepperContent value={1}>
            {/* STEP 1: Metadata */}
            <Card className="border shadow-none">
              <CardHeader className="py-4 border-b">
                <CardTitle className="text-lg">Assessment Metadata</CardTitle>
                <CardDescription className="text-xs">
                  Core identity and scheduling details
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5">
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assessment Title</Label>
                  <Input
                    value={metadata.title}
                    onChange={(e) =>
                      setMetadata({ ...metadata, title: e.target.value })
                    }
                    placeholder="e.g. Mid-Semester CAT – Database Systems"
                    className="h-10 text-base border"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assessment Mode</Label>
                  <Select
                    value={metadata.mode}
                    onValueChange={(v: AssessmentMode) =>
                      setMetadata({ ...metadata, mode: v })
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Practice">Practice</SelectItem>
                      <SelectItem value="Homework">Homework</SelectItem>
                      <SelectItem value="CAT">Continuous Assessment Test (CAT)</SelectItem>
                      <SelectItem value="Summative">Summative Examination</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Course / Module</Label>
                  <Select
                    value={metadata.course}
                    onValueChange={(v) => setMetadata({ ...metadata, course: v })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select course" />
                    </SelectTrigger>
                    <SelectContent>
                      {TEACHING_SCOPE.colleges[0].departments[0].courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Target Class</Label>
                  <Select
                    value={metadata.targetClass}
                    onValueChange={(v) => setMetadata({ ...metadata, targetClass: v })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select Class" />
                    </SelectTrigger>
                    <SelectContent>
                      {TEACHING_SCOPE.colleges[0].departments[0].courses[0].classes.map((cl) => (
                        <SelectItem key={cl.id} value={cl.id}>
                          {cl.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Duration (Minutes)</Label>
                  <Input
                    type="number"
                    value={metadata.durationMinutes}
                    onChange={(e) =>
                      setMetadata({
                        ...metadata,
                        durationMinutes: parseInt(e.target.value),
                      })
                    }
                    className="h-9 text-sm"
                  />
                </div>

                <div className="md:col-span-2 space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assessment Instructions</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {availableInstructions.map((instr) => (
                      <div
                        key={instr}
                        className={cn(
                          "flex items-center space-x-2 border rounded-lg p-2.5 cursor-pointer transition-colors hover:bg-muted/30",
                          metadata.selectedInstructions.includes(instr) &&
                            "border-primary bg-primary/5",
                        )}
                        onClick={() => {
                          const current = metadata.selectedInstructions;
                          setMetadata({
                            ...metadata,
                            selectedInstructions: current.includes(instr)
                              ? current.filter((i) => i !== instr)
                              : [...current, instr],
                          });
                        }}
                      >
                        <Checkbox checked={metadata.selectedInstructions.includes(instr)} className="size-3.5" />
                        <span className="text-[11px] font-medium">{instr}</span>
                      </div>
                    ))}
                  </div>
                  <Textarea
                    placeholder="Additional custom instructions..."
                    value={metadata.customInstructions}
                    onChange={(e) =>
                      setMetadata({ ...metadata, customInstructions: e.target.value })
                    }
                    className="min-h-[80px] text-xs border"
                  />
                </div>

                <div className="md:col-span-2 space-y-3 border-t pt-5 mt-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Schedule</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="date" className="text-[10px] uppercase font-bold text-muted-foreground">Date</Label>
                      <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            id="date"
                            className="w-full justify-between font-normal h-9 text-xs"
                          >
                            {metadata.date ? metadata.date.toLocaleDateString() : "Select date"}
                            <ChevronDown className="size-3.5 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={metadata.date}
                            onSelect={(d) => {
                              setMetadata({ ...metadata, date: d });
                              setDatePopoverOpen(false);
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="time-from" className="text-[10px] uppercase font-bold text-muted-foreground">From</Label>
                      <Input
                        type="time"
                        id="time-from"
                        value={metadata.startTime}
                        onChange={(e) => setMetadata({ ...metadata, startTime: e.target.value })}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="time-to" className="text-[10px] uppercase font-bold text-muted-foreground">To</Label>
                      <Input
                        type="time"
                        id="time-to"
                        value={metadata.endTime}
                        onChange={(e) => setMetadata({ ...metadata, endTime: e.target.value })}
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end py-4 px-5 border-t bg-muted/20">
                <Button size="sm" onClick={() => setActiveStep(2)} className="rounded-lg h-9 px-6 font-semibold">
                  Continue to Blueprint <ChevronRight className="ml-2 size-3.5" />
                </Button>
              </CardFooter>
            </Card>
          </StepperContent>

          <StepperContent value={2}>
            {/* STEP 2: Blueprint & Rules */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Assessment Blueprint</CardTitle>
                      <CardDescription>Define marks distribution and sections</CardDescription>
                    </div>
                    <Button onClick={addSection} variant="outline" size="sm">
                      <Plus className="mr-2 size-4" /> Add Section
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {blueprint.map((sec) => (
                      <div key={sec.id} className="border rounded-2xl p-6 space-y-4 bg-muted/30">
                        <div className="flex justify-between items-center">
                          <Input
                            value={sec.section}
                            onChange={(e) => updateSection(sec.id, "section", e.target.value)}
                            className="font-bold text-lg w-48 bg-transparent border-none focus-visible:ring-0 px-0 h-auto"
                          />
                          <Button variant="ghost" size="icon" onClick={() => removeSection(sec.id)} className="text-destructive">
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label className="text-xs uppercase text-muted-foreground">Topics Covered</Label>
                            <Input
                              placeholder="e.g. Normalization, SQL Queries"
                              value={sec.topics}
                              onChange={(e) => updateSection(sec.id, "topics", e.target.value)}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs uppercase text-muted-foreground">Total Marks</Label>
                              <Input
                                type="number"
                                value={sec.marks}
                                onChange={(e) => updateSection(sec.id, "marks", parseInt(e.target.value) || 0)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs uppercase text-muted-foreground">Question Count</Label>
                              <Input
                                type="number"
                                value={sec.questions}
                                onChange={(e) => updateSection(sec.id, "questions", parseInt(e.target.value) || 0)}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-xs uppercase text-muted-foreground">Allowed Question Types</Label>
                          <ToggleGroup
                            type="multiple"
                            value={sec.allowedTypes}
                            onValueChange={(v: QuestionType[]) => {
                              if (v.length > 0) updateSection(sec.id, "allowedTypes", v);
                            }}
                            className="justify-start flex-wrap gap-2"
                          >
                            {[
                              { id: "mcq", label: "MCQ" },
                              { id: "truefalse", label: "True/False" },
                              { id: "shortanswer", label: "Short Answer" },
                              { id: "essay", label: "Essay" },
                              { id: "matching", label: "Matching" },
                              { id: "fillblank", label: "Fill Blank" },
                              { id: "ordering", label: "Ordering" },
                              { id: "computational", label: "Computational" },
                              { id: "casestudy", label: "Case Study" },
                            ].map((t) => (
                              <ToggleGroupItem
                                key={t.id}
                                value={t.id}
                                variant="outline"
                                className="px-3 h-9 rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                              >
                                {t.label}
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                  <CardFooter className="bg-muted/50 flex justify-between py-4">
                    <div className="text-sm">Total Marks: <span className="font-bold">{totalMarks}</span></div>
                    <div className="text-sm">Total Questions: <span className="font-bold">{totalQuestions}</span></div>
                  </CardFooter>
                </Card>
              </div>
              <div className="space-y-6">
                <Card>
                  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Shield className="size-5 text-primary" /> Environment</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      { key: "supervised", label: "Proctored", desc: "Live monitoring enabled" },
                      { key: "browserRestricted", label: "Safe Browser", desc: "Forces fullscreen" },
                    ].map((item) => (
                      <div key={item.key} className="flex items-start justify-between gap-4">
                        <div className="space-y-0.5"><Label>{item.label}</Label><p className="text-xs text-muted-foreground">{item.desc}</p></div>
                        <Switch checked={(rules as any)[item.key]} onCheckedChange={(v) => setRules({ ...rules, [item.key]: v })} />
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <div className="flex gap-4">
                  <Button variant="outline" className="flex-1" onClick={() => setActiveStep(1)}><ChevronLeft className="mr-2 size-4" /> Back</Button>
                  <Button className="flex-1" onClick={() => setActiveStep(3)}>Questions <ChevronRight className="ml-2 size-4" /></Button>
                </div>
              </div>
            </div>
          </StepperContent>

          <StepperContent value={3}>
            {/* STEP 3: Question Creation */}
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Badge variant="secondary" className="px-3 py-1">Progress: {questions.length} / {totalQuestions}</Badge>
                  <Badge variant={currentMarks === totalMarks ? "outline" : "destructive"} className="px-3 py-1">
                    Marks: {currentMarks} / {totalMarks}
                  </Badge>
                </div>
              </div>

              {blueprint.map((sec) => (
                <div key={sec.id} className="space-y-6">
                  <div className="flex items-center gap-3 border-b pb-2">
                    <h3 className="font-bold text-xl">{sec.section}</h3>
                    <Badge variant="secondary">{sec.topics}</Badge>
                  </div>
                  
                  <div className="space-y-6">
                    {questions.filter((q) => q.sectionId === sec.id).map((q, idx) => (
                      <Card key={q.id} className="border-2 hover:border-primary/20 transition-colors">
                        <CardContent className="p-6 space-y-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <Badge className="size-7 flex items-center justify-center rounded-full p-0">{idx + 1}</Badge>
                              <Select
                                value={q.type}
                                onValueChange={(v: QuestionType) => {
                                  let newOptions: QuestionOption[] = [];
                                  if (v === "mcq") {
                                    newOptions = [
                                      { option_text: "Option 1", is_correct: true, order_index: 0 },
                                      { option_text: "Option 2", is_correct: false, order_index: 1 },
                                    ];
                                  } else if (v === "truefalse") {
                                    newOptions = [
                                      { option_text: "True", is_correct: true, order_index: 0 },
                                      { option_text: "False", is_correct: false, order_index: 1 },
                                    ];
                                  }
                                  updateQuestion(q.id, { type: v, options: newOptions });
                                }}
                              >
                                <SelectTrigger className="w-[160px] h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {sec.allowedTypes.map(t => (
                                    <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2">
                                <Label className="text-xs font-bold uppercase text-muted-foreground">Marks</Label>
                                <Input
                                  type="number"
                                  className="w-16 h-9"
                                  value={q.marks}
                                  onChange={(e) => updateQuestion(q.id, { marks: parseInt(e.target.value) || 0 })}
                                />
                              </div>
                              <div className="flex items-center gap-1 border-l pl-3">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleSaveToBank(q)} 
                                  className="text-primary hover:bg-primary/10"
                                  title="Save to Bank"
                                >
                                  <Database className="size-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => removeQuestion(q.id)} 
                                  className="text-destructive hover:bg-destructive/10"
                                  title="Delete Question"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm font-semibold">Question Content</Label>
                            <Textarea
                              placeholder="Write your question here..."
                              value={q.text}
                              onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                              className="text-lg font-medium min-h-[100px] bg-muted/20"
                            />
                          </div>

                          {/* QUESTION TYPE SPECIFIC EDITORS */}
                          {(q.type === "mcq" || q.type === "truefalse") && (
                            <div className="space-y-3 pl-4 border-l-2 border-muted">
                              <Label className="text-sm font-semibold">Options (Select the correct one)</Label>
                              <RadioGroup
                                value={q.options.find(o => o.is_correct)?.order_index.toString()}
                                onValueChange={(v) => {
                                  const idx = parseInt(v);
                                  setQuestions(questions.map(item => {
                                    if (item.id !== q.id) return item;
                                    return {
                                      ...item,
                                      options: item.options.map((opt, i) => ({ ...opt, is_correct: i === idx }))
                                    };
                                  }));
                                }}
                                className="space-y-2"
                              >
                                {q.options.map((opt, oIdx) => (
                                  <div key={oIdx} className="flex items-center gap-3">
                                    <RadioGroupItem value={oIdx.toString()} />
                                    <Input
                                      value={opt.option_text}
                                      onChange={(e) => updateOption(q.id, oIdx, { option_text: e.target.value })}
                                      className="flex-1 h-9"
                                      placeholder={`Option ${oIdx + 1}`}
                                      disabled={q.type === "truefalse"}
                                    />
                                    {q.type === "mcq" && q.options.length > 2 && (
                                      <Button variant="ghost" size="icon" onClick={() => removeOption(q.id, oIdx)}>
                                        <X className="size-4" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </RadioGroup>
                              {q.type === "mcq" && (
                                <Button variant="outline" size="sm" onClick={() => addOption(q.id)} className="mt-2">
                                  <Plus className="size-3 mr-2" /> Add Option
                                </Button>
                              )}
                            </div>
                          )}

                          {q.type === "matching" && (
                            <div className="space-y-3 pl-4 border-l-2 border-muted">
                              <Label className="text-sm font-semibold">Pairs (Match Left to Right)</Label>
                              <div className="space-y-2">
                                {q.options.map((opt, oIdx) => (
                                  <div key={oIdx} className="flex items-center gap-3">
                                    <Input
                                      value={opt.option_text}
                                      onChange={(e) => updateOption(q.id, oIdx, { option_text: e.target.value })}
                                      className="flex-1 h-9"
                                      placeholder="Left Item"
                                    />
                                    <ChevronRight className="size-4 text-muted-foreground" />
                                    <Input
                                      value={opt.option_text_right}
                                      onChange={(e) => updateOption(q.id, oIdx, { option_text_right: e.target.value })}
                                      className="flex-1 h-9"
                                      placeholder="Right Match"
                                    />
                                    <Button variant="ghost" size="icon" onClick={() => removeOption(q.id, oIdx)}>
                                      <X className="size-4" />
                                    </Button>
                                  </div>
                                ))}
                                <Button variant="outline" size="sm" onClick={() => {
                                  setQuestions(questions.map(item => {
                                    if (item.id !== q.id) return item;
                                    return {
                                      ...item,
                                      options: [...item.options, { option_text: "", option_text_right: "", is_correct: true, order_index: item.options.length }]
                                    };
                                  }));
                                }}>
                                  <Plus className="size-3 mr-2" /> Add Pair
                                </Button>
                              </div>
                            </div>
                          )}

                          {(q.type === "shortanswer" || q.type === "essay") && (
                            <div className="space-y-3 pl-4 border-l-2 border-muted">
                              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                                <p className="text-sm text-primary font-medium flex items-center gap-2">
                                  <BrainCircuit className="size-4" /> 
                                  {q.type === "shortanswer" ? "Short Answer Field" : "Essay Response Field"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Students will see a specified {q.type === "shortanswer" ? "text input" : "rich text area"} to answer this question.
                                </p>
                              </div>
                              <Label className="text-sm font-semibold">Sample Correct Answer / Rubric</Label>
                              <Textarea
                                placeholder="Enter what a good answer looks like..."
                                className="min-h-[80px]"
                                value={q.options[0]?.option_text || ""}
                                onChange={(e) => {
                                  const opts = [{ option_text: e.target.value, is_correct: true, order_index: 0 }];
                                  updateQuestion(q.id, { options: opts });
                                }}
                              />
                            </div>
                          )}

                          {q.type === "fillblank" && (
                            <div className="space-y-3 pl-4 border-l-2 border-muted">
                              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                                Use <strong>[blank]</strong> in the question text above to indicate where student should type.
                              </div>
                              <Label className="text-sm font-semibold">Answers for Blanks (in order)</Label>
                              <div className="space-y-2">
                                {q.options.map((opt, oIdx) => (
                                  <div key={oIdx} className="flex items-center gap-2">
                                    <Badge variant="outline">#{oIdx + 1}</Badge>
                                    <Input
                                      value={opt.option_text}
                                      onChange={(e) => updateOption(q.id, oIdx, { option_text: e.target.value })}
                                      className="flex-1 h-9"
                                      placeholder="Correct Answer"
                                    />
                                    <Button variant="ghost" size="icon" onClick={() => removeOption(q.id, oIdx)}>
                                      <X className="size-4" />
                                    </Button>
                                  </div>
                                ))}
                                <Button variant="outline" size="sm" onClick={() => addOption(q.id)}>
                                  <Plus className="size-3 mr-2" /> Add Blank Answer
                                </Button>
                              </div>
                            </div>
                          )}

                          {q.type === "ordering" && (
                            <div className="space-y-3 pl-4 border-l-2 border-muted">
                              <Label className="text-sm font-semibold">Items (Set in Correct Order)</Label>
                              <div className="space-y-2">
                                {q.options.map((opt, oIdx) => (
                                  <div key={oIdx} className="flex items-center gap-3">
                                    <GripVertical className="size-4 text-muted-foreground cursor-grab" />
                                    <Input
                                      value={opt.option_text}
                                      onChange={(e) => updateOption(q.id, oIdx, { option_text: e.target.value })}
                                      className="flex-1 h-9"
                                      placeholder={`Item ${oIdx + 1}`}
                                    />
                                    <Button variant="ghost" size="icon" onClick={() => removeOption(q.id, oIdx)}>
                                      <X className="size-4" />
                                    </Button>
                                  </div>
                                ))}
                                <Button variant="outline" size="sm" onClick={() => addOption(q.id)}>
                                  <Plus className="size-3 mr-2" /> Add Item
                                </Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                    <div className="flex gap-4">
                      <Button variant="dashed" className="flex-1 h-20 rounded-2xl border-2 hover:bg-muted/50 hover:border-primary/50 transition-all" onClick={() => addQuestion(sec.id)}>
                        <div className="flex flex-col items-center">
                          <Plus className="size-6 mb-1" />
                          <span className="font-semibold text-sm uppercase tracking-wider">Add Manually</span>
                        </div>
                      </Button>
                      <QuestionBankSelector selectedIds={questions.map(q => q.id)} onSelect={(q) => handleBankSelect(q, sec.id)} />
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-8 border-t">
                <Button variant="outline" size="lg" onClick={() => setActiveStep(2)} className="rounded-full px-8">
                  <ChevronLeft className="mr-2 size-4" /> Back to Blueprint
                </Button>
                <Button size="lg" onClick={() => setActiveStep(4)} className="rounded-full px-10">
                  Review Assessment <ChevronRight className="ml-2 size-4" />
                </Button>
              </div>
            </div>
          </StepperContent>

          <StepperContent value={4}>
            {/* STEP 4: Review */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold">{metadata.title || "Untitled Assessment"}</h2>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="size-4" /> {metadata.durationMinutes} mins</span>
                    <span className="flex items-center gap-1"><FileText className="size-4" /> {metadata.mode}</span>
                  </div>
                </div>
                <Separator />
                {blueprint.map((sec) => (
                  <div key={sec.id} className="space-y-6">
                    <div className="flex justify-between items-center border-b pb-2">
                      <h3 className="font-bold text-xl">{sec.section}</h3>
                      <Badge variant="outline">{sec.marks} Marks</Badge>
                    </div>
                    <div className="space-y-6">
                      {questions.filter((q) => q.sectionId === sec.id).map((q, i) => (
                        <div key={q.id} className="space-y-2">
                          <div className="flex justify-between items-start">
                            <div className="flex gap-3">
                              <span className="text-muted-foreground font-bold">{i + 1}.</span>
                              <div className="space-y-1">
                                <p className="font-medium text-lg">{q.text || <em>No question text</em>}</p>
                                <div className="flex gap-2">
                                  <Badge variant="secondary" className="text-[10px] uppercase">{q.type}</Badge>
                                  <span className="text-xs text-muted-foreground">{q.marks} Marks</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Options Preview */}
                          {q.options.length > 0 && (
                            <div className="pl-8 space-y-1">
                              {q.type === "mcq" || q.type === "truefalse" ? (
                                <ul className="list-disc text-sm text-muted-foreground pl-4">
                                  {q.options.map((opt, oIdx) => (
                                    <li key={oIdx} className={cn(opt.is_correct && "text-primary font-medium")}>
                                      {opt.option_text} {opt.is_correct && "✓"}
                                    </li>
                                  ))}
                                </ul>
                              ) : q.type === "matching" ? (
                                <div className="grid grid-cols-2 gap-2 max-w-md">
                                  {q.options.map((opt, oIdx) => (
                                    <React.Fragment key={oIdx}>
                                      <div className="text-sm bg-muted p-2 rounded-lg">{opt.option_text}</div>
                                      <div className="text-sm bg-primary/10 p-2 rounded-lg">{opt.option_text_right}</div>
                                    </React.Fragment>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground italic">
                                  {q.type === "shortanswer" || q.type === "essay" ? "Open response field" : "Multiple answers/items"}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-6">
                <Card><CardHeader><CardTitle>Summary</CardTitle></CardHeader><CardContent className="space-y-4">
                  <div className="flex justify-between text-sm"><span>Total Marks</span><span className="font-bold">{totalMarks}</span></div>
                  <div className="flex justify-between text-sm"><span>Questions</span><span className={cn("font-bold", questions.length !== totalQuestions && "text-destructive")}>{questions.length} / {totalQuestions}</span></div>
                </CardContent></Card>
                <div className="flex gap-4">
                  <Button variant="outline" className="flex-1" onClick={() => setActiveStep(3)}><ChevronLeft className="mr-2 size-4" /> Back</Button>
                  <Button className="flex-1" onClick={() => setActiveStep(5)}>Finalize <ChevronRight className="ml-2 size-4" /></Button>
                </div>
              </div>
            </div>
          </StepperContent>

          <StepperContent value={5}>
            {/* STEP 5: Finalize */}
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-8">
              <Shield className="size-16 text-primary" />
              <div className="max-w-md space-y-4">
                <h2 className="text-3xl font-bold">Ready to Publish?</h2>
                <p className="text-muted-foreground">Scheduled for <strong>{metadata.date?.toDateString()}</strong> at <strong>{metadata.startTime}</strong>.</p>
              </div>
              <div className="flex flex-col gap-4 w-full max-w-sm">
                <Button size="lg" className="h-14 rounded-full" onClick={handlePublish} disabled={isPublishing}>Publish Now</Button>
                <Button variant="ghost" onClick={() => setActiveStep(4)}>Back to Review</Button>
              </div>
            </div>
          </StepperContent>
        </StepperPanel>
      </Stepper>
    </div>
  );
}
