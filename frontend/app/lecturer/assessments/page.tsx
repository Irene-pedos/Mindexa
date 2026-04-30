// app/lecturer/assessments/new/page.tsx
"use client";

import React, { useState, useMemo, useEffect } from "react";
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
  Calendar as CalendarIcon,
  Clock,
  Shield,
  Users,
  Clock2Icon,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  FileText,
  Layout,
  Settings,
  BrainCircuit,
  HelpCircle,
  MoreVertical,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { apiClient } from "@/lib/api/client";
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
  | "ordering";

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
  options?: string[];
  correctAnswer?: string;
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

export default function NewAssessmentBuilder() {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

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

  const updateSection = (
    id: string,
    field: keyof BlueprintSection,
    value: any,
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

    setQuestions([
      ...questions,
      {
        id: `q-${Date.now()}`,
        sectionId,
        text: "",
        type: section.allowedTypes[0] || "mcq",
        marks: Math.floor(section.marks / (section.questions || 1)),
        aiGenerated: false,
      },
    ]);
  };

  const handleBankSelect = (qBank: QuestionBankItem, sectionId: string) => {
    // Map backend type (e.g., "SHORT_ANSWER") to frontend type (e.g., "shortanswer")
    const mappedType = qBank.question_type.toLowerCase().replace("_", "") as QuestionType;
    
    setQuestions([
      ...questions,
      {
        id: `q-bank-${qBank.id}-${Date.now()}`,
        sectionId,
        text: qBank.content,
        type: mappedType,
        marks: qBank.marks,
        aiGenerated: false,
      },
    ]);
    toast.success("Question added from bank");
  };

  const handleSaveDraft = async () => {
    try {
      const result = await apiClient("/assessments/draft", {
        method: "POST",
        body: JSON.stringify({ metadata, blueprint, questions, rules }),
      });
      toast.success("Draft saved successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to save draft");
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublish = async () => {
    if (currentMarks !== totalMarks) {
      toast.error(
        `Total marks mismatch! Expected ${totalMarks}, but got ${currentMarks}`,
      );
      return;
    }
    if (questions.length !== totalQuestions) {
      toast.error(
        `Question count mismatch! Expected ${totalQuestions}, but got ${questions.length}`,
      );
      return;
    }
    try {
      const result = await apiClient("/assessments/publish", {
        method: "POST",
        body: JSON.stringify({ metadata, blueprint, questions, rules }),
      });
      
      if (result.validation_passed) {
        toast.success("Assessment published successfully!");
        // Redirect or refresh
      } else {
        const errorMsg = result.errors?.join(", ") || "Validation failed";
        toast.error(`Publishing failed: ${errorMsg}`);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to publish assessment");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Assessment Builder
          </h1>
          <p className="text-muted-foreground mt-1">
            Step-based creation of secure academic assessments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleSaveDraft}>
            <Save className="mr-2 size-4" /> Save Draft
          </Button>
          <Badge variant="outline" className="px-4 py-1 h-9">
            Step {step} of 5
          </Badge>
        </div>
      </div>

      {/* Stepper UI */}
      <div className="relative flex justify-between before:absolute before:top-5 before:left-0 before:h-[2px] before:w-full before:bg-muted before:-z-10">
        {[
          { icon: FileText, label: "Metadata" },
          { icon: Layout, label: "Blueprint" },
          { icon: BrainCircuit, label: "Questions" },
          { icon: Eye, label: "Review" },
          { icon: CheckCircle2, label: "Publish" },
        ].map((s, i) => {
          const num = i + 1;
          const isActive = step === num;
          const isCompleted = step > num;
          const Icon = s.icon;

          return (
            <div
              key={num}
              className="flex flex-col items-center gap-2 bg-background px-4"
            >
              <div
                className={cn(
                  "size-10 rounded-full flex items-center justify-center border-2 transition-all",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground shadow-md scale-110"
                    : isCompleted
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-muted bg-background text-muted-foreground",
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="size-6" />
                ) : (
                  <Icon className="size-5" />
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* STEP 1: Metadata */}
      {step === 1 && (
        <Card className="border-2">
          <CardHeader>
            <CardTitle>Assessment Metadata</CardTitle>
            <CardDescription>
              Core identity and scheduling details
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4 md:col-span-2">
              <Label>Assessment Title</Label>
              <Input
                value={metadata.title}
                onChange={(e) =>
                  setMetadata({ ...metadata, title: e.target.value })
                }
                placeholder="e.g. Mid-Semester CAT – Database Systems"
                className="text-lg h-12"
              />
            </div>

            <div className="space-y-4">
              <Label>Assessment Mode</Label>
              <Select
                value={metadata.mode}
                onValueChange={(v: AssessmentMode) =>
                  setMetadata({ ...metadata, mode: v })
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Practice">Practice</SelectItem>
                  <SelectItem value="Homework">Homework</SelectItem>
                  <SelectItem value="CAT">
                    Continuous Assessment Test (CAT)
                  </SelectItem>
                  <SelectItem value="Summative">
                    Summative Examination
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <Label>Course / Module</Label>
              <Select
                value={metadata.course}
                onValueChange={(v) => setMetadata({ ...metadata, course: v })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select from assigned courses" />
                </SelectTrigger>
                <SelectContent>
                  {TEACHING_SCOPE.colleges[0].departments[0].courses.map(
                    (c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.id})
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <Label>Target Class & Section</Label>
              <Select
                value={metadata.targetClass}
                onValueChange={(v) =>
                  setMetadata({ ...metadata, targetClass: v })
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select Class" />
                </SelectTrigger>
                <SelectContent>
                  {TEACHING_SCOPE.colleges[0].departments[0].courses[0].classes.map(
                    (cl) => (
                      <SelectItem key={cl.id} value={cl.id}>
                        {cl.name}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <Label>Duration (Minutes)</Label>
              <Input
                type="number"
                value={metadata.durationMinutes}
                onChange={(e) =>
                  setMetadata({
                    ...metadata,
                    durationMinutes: parseInt(e.target.value),
                  })
                }
                className="h-11"
              />
            </div>

            <div className="md:col-span-2 space-y-4">
              <Label>Assessment Instructions</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {availableInstructions.map((instr) => (
                  <div
                    key={instr}
                    className={cn(
                      "flex items-center space-x-2 border rounded-xl p-3 cursor-pointer transition-colors hover:bg-muted/50",
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
                    <Checkbox
                      checked={metadata.selectedInstructions.includes(instr)}
                    />
                    <span className="text-sm">{instr}</span>
                  </div>
                ))}
              </div>
              <Textarea
                placeholder="Additional custom instructions..."
                value={metadata.customInstructions}
                onChange={(e) =>
                  setMetadata({
                    ...metadata,
                    customInstructions: e.target.value,
                  })
                }
                className="min-h-[100px]"
              />
            </div>

            <div className="md:col-span-2 space-y-4">
              <Label>Schedule</Label>
              <div className="flex flex-col md:flex-row gap-6">
                <Card className="w-fit p-4">
                  <Calendar
                    mode="single"
                    selected={metadata.date}
                    onSelect={(d) => setMetadata({ ...metadata, date: d })}
                  />
                </Card>
                <div className="flex-1 space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field>
                      <FieldLabel>Start Time</FieldLabel>
                      <Input
                        type="time"
                        value={metadata.startTime}
                        onChange={(e) =>
                          setMetadata({
                            ...metadata,
                            startTime: e.target.value,
                          })
                        }
                        className="h-11"
                      />
                    </Field>
                    <Field>
                      <FieldLabel>End Time</FieldLabel>
                      <Input
                        type="time"
                        value={metadata.endTime}
                        onChange={(e) =>
                          setMetadata({ ...metadata, endTime: e.target.value })
                        }
                        className="h-11"
                      />
                    </Field>
                  </div>
                  <div className="p-4 rounded-2xl bg-muted/50 border flex items-center gap-3">
                    <Clock className="text-muted-foreground size-5" />
                    <p className="text-sm text-muted-foreground">
                      Students will have access between{" "}
                      <strong>{metadata.startTime}</strong> and{" "}
                      <strong>{metadata.endTime}</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end p-6 bg-muted/20 border-t">
            <Button
              size="lg"
              onClick={() => setStep(2)}
              className="rounded-full px-8"
            >
              Continue to Blueprint <ChevronRight className="ml-2 size-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STEP 2: Blueprint & Rules */}
      {step === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Assessment Blueprint</CardTitle>
                  <CardDescription>
                    Define marks distribution and sections
                  </CardDescription>
                </div>
                <Button onClick={addSection} variant="outline" size="sm">
                  <Plus className="mr-2 size-4" /> Add Section
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                {blueprint.map((sec, idx) => (
                  <div
                    key={sec.id}
                    className="border rounded-2xl p-6 space-y-4 relative bg-muted/30"
                  >
                    <div className="flex justify-between items-center">
                      <Input
                        value={sec.section}
                        onChange={(e) =>
                          updateSection(sec.id, "section", e.target.value)
                        }
                        className="font-bold text-lg w-48 bg-transparent border-none focus-visible:ring-0 px-0 h-auto"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSection(sec.id)}
                        className="text-destructive h-8 w-8"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-xs uppercase text-muted-foreground">
                          Topics Covered
                        </Label>
                        <Input
                          placeholder="e.g. Normalization, SQL Queries"
                          value={sec.topics}
                          onChange={(e) =>
                            updateSection(sec.id, "topics", e.target.value)
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs uppercase text-muted-foreground">
                            Total Marks
                          </Label>
                          <Input
                            type="number"
                            value={sec.marks}
                            onChange={(e) =>
                              updateSection(
                                sec.id,
                                "marks",
                                parseInt(e.target.value) || 0,
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs uppercase text-muted-foreground">
                            Question Count
                          </Label>
                          <Input
                            type="number"
                            value={sec.questions}
                            onChange={(e) =>
                              updateSection(
                                sec.id,
                                "questions",
                                parseInt(e.target.value) || 0,
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {["mcq", "shortanswer", "essay", "truefalse"].map(
                        (type) => (
                          <Badge
                            key={type}
                            variant={
                              sec.allowedTypes.includes(type as QuestionType)
                                ? "default"
                                : "outline"
                            }
                            className="cursor-pointer capitalize"
                            onClick={() => {
                              const current = sec.allowedTypes;
                              updateSection(
                                sec.id,
                                "allowedTypes",
                                current.includes(type as QuestionType)
                                  ? current.filter((t) => t !== type)
                                  : [...current, type],
                              );
                            }}
                          >
                            {type}
                          </Badge>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
              <CardFooter className="bg-muted/50 flex justify-between py-4">
                <div className="text-sm">
                  Total Marks: <span className="font-bold">{totalMarks}</span>
                </div>
                <div className="text-sm">
                  Total Questions:{" "}
                  <span className="font-bold">{totalQuestions}</span>
                </div>
              </CardFooter>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="size-5 text-primary" /> Exam Environment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    key: "supervised",
                    label: "Proctored / Supervised",
                    desc: "Live monitoring enabled",
                  },
                  {
                    key: "browserRestricted",
                    label: "Safe Browser Mode",
                    desc: "Forces fullscreen & lock",
                  },
                  {
                    key: "aiAllowed",
                    label: "AI Assistance",
                    desc: "Allow student study AI",
                  },
                  {
                    key: "shuffleQuestions",
                    label: "Shuffle within Section Only",
                    desc: "Randomize question order within sections (cross-section shuffle disabled)",
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-start justify-between gap-4"
                  >
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {item.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {item.desc}
                      </p>
                    </div>
                    <Switch
                      checked={(rules as any)[item.key]}
                      onCheckedChange={(v) =>
                        setRules({ ...rules, [item.key]: v })
                      }
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex gap-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(1)}
              >
                <ChevronLeft className="mr-2 size-4" /> Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                Questions <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Question Creation */}
      {step === 3 && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge variant="secondary" className="px-4 py-1 h-8 text-sm">
                Progress: {questions.length} / {totalQuestions} Questions
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "px-4 py-1 h-8 text-sm",
                  currentMarks !== totalMarks
                    ? "text-destructive border-destructive"
                    : "text-emerald-600 border-emerald-200 bg-emerald-50",
                )}
              >
                Marks: {currentMarks} / {totalMarks}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <BrainCircuit className="mr-2 size-4" /> AI Question Generator
              </Button>
            </div>
          </div>

          {blueprint.map((sec) => (
            <div key={sec.id} className="space-y-4">
              <h3 className="font-bold text-xl flex items-center gap-2">
                <Badge className="rounded-full size-6 flex items-center justify-center p-0">
                  {sec.section.split(" ")[1]}
                </Badge>
                {sec.section}
              </h3>

              <div className="space-y-4">
                {questions
                  .filter((q) => q.sectionId === sec.id)
                  .map((q, idx) => (
                    <Card key={q.id}>
                      <CardContent className="p-6">
                        <div className="flex gap-4">
                          <div className="text-muted-foreground font-medium text-lg w-8">
                            {idx + 1}.
                          </div>
                          <div className="flex-1 space-y-4">
                            <Textarea
                              placeholder="Type question text here..."
                              value={q.text}
                              onChange={(e) => {
                                setQuestions(
                                  questions.map((item) =>
                                    item.id === q.id
                                      ? { ...item, text: e.target.value }
                                      : item,
                                  ),
                                );
                              }}
                              className="text-lg border-none focus-visible:ring-0 p-0 shadow-none resize-none min-h-[60px]"
                            />

                            <div className="flex items-center justify-between pt-4 border-t">
                              <div className="flex gap-4 items-center">
                                <Select
                                  value={q.type}
                                  onValueChange={(v: QuestionType) => {
                                    setQuestions(
                                      questions.map((item) =>
                                        item.id === q.id
                                          ? { ...item, type: v }
                                          : item,
                                      ),
                                    );
                                  }}
                                >
                                  <SelectTrigger className="w-40 h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {sec.allowedTypes.map((t) => (
                                      <SelectItem
                                        key={t}
                                        value={t}
                                        className="capitalize"
                                      >
                                        {t}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs uppercase text-muted-foreground">
                                    Marks:
                                  </Label>
                                  <Input
                                    type="number"
                                    className="w-16 h-8 text-center"
                                    value={q.marks}
                                    onChange={(e) => {
                                      setQuestions(
                                        questions.map((item) =>
                                          item.id === q.id
                                            ? {
                                                ...item,
                                                marks:
                                                  parseInt(e.target.value) || 0,
                                              }
                                            : item,
                                        ),
                                      );
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() =>
                                    setQuestions(
                                      questions.filter(
                                        (item) => item.id !== q.id,
                                      ),
                                    )
                                  }
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                <div className="flex gap-4">
                  <Button
                    variant="dashed"
                    className="flex-1 h-16 border-2 border-muted hover:border-primary/50 hover:bg-primary/5 rounded-2xl"
                    onClick={() => addQuestion(sec.id)}
                  >
                    <Plus className="mr-2 size-4" /> Add Manually
                  </Button>
                  <QuestionBankSelector 
                    selectedIds={questions.map(q => q.id)}
                    onSelect={(q) => handleBankSelect(q, sec.id)}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="flex justify-between pt-8 border-t">
            <Button variant="outline" size="lg" onClick={() => setStep(2)}>
              <ChevronLeft className="mr-2 size-4" /> Back to Blueprint
            </Button>
            <Button
              size="lg"
              onClick={() => setStep(4)}
              className="rounded-full px-10"
            >
              Review Assessment <ChevronRight className="ml-2 size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: Review */}
      {step === 4 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">
                {metadata.title || "Untitled Assessment"}
              </h2>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{metadata.mode}</Badge>
                <Badge variant="outline">{metadata.course}</Badge>
                <Badge variant="outline">{metadata.targetClass}</Badge>
                <Badge variant="outline">{metadata.durationMinutes} mins</Badge>
              </div>
            </div>

            <Separator />

            <div className="space-y-6">
              {blueprint.map((sec) => (
                <div key={sec.id} className="space-y-4">
                  <div className="flex justify-between items-end border-b pb-2">
                    <h3 className="font-bold text-lg">{sec.section}</h3>
                    <span className="text-sm text-muted-foreground">
                      {sec.marks} Marks • {sec.questions} Questions
                    </span>
                  </div>
                  <div className="space-y-4">
                    {questions
                      .filter((q) => q.sectionId === sec.id)
                      .map((q, i) => (
                        <div key={q.id} className="flex gap-4 items-start py-2">
                          <span className="text-muted-foreground text-sm font-medium w-6">
                            {i + 1}.
                          </span>
                          <div className="flex-1 space-y-1">
                            <p className="font-medium">
                              {q.text || (
                                <em className="text-muted-foreground">
                                  No question text
                                </em>
                              )}
                            </p>
                            <div className="flex gap-3 items-center">
                              <Badge
                                variant="outline"
                                className="text-[10px] capitalize px-1 py-0"
                              >
                                {q.type}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">
                                {q.marks} Marks
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Assessment Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Marks</span>
                  <span className="font-bold">{totalMarks}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Questions</span>
                  <span className="font-bold">{totalQuestions}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Created Questions
                  </span>
                  <span
                    className={cn(
                      "font-bold",
                      questions.length !== totalQuestions && "text-destructive",
                    )}
                  >
                    {questions.length} / {totalQuestions}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Allocated Marks</span>
                  <span
                    className={cn(
                      "font-bold",
                      currentMarks !== totalMarks && "text-destructive",
                    )}
                  >
                    {currentMarks} / {totalMarks}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Security & Integrity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(rules)
                  .filter(([, v]) => typeof v === "boolean" && v)
                  .map(([k]) => (
                    <div key={k} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="size-4 text-emerald-500" />
                      <span className="capitalize">
                        {k.replace(/([A-Z])/g, " $1")}
                      </span>
                    </div>
                  ))}
              </CardContent>
            </Card>

            <div className="flex gap-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(3)}
              >
                <ChevronLeft className="mr-2 size-4" /> Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(5)}>
                Finalize <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: Finalize */}
      {step === 5 && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-8">
          <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Shield className="size-10" />
          </div>
          <div className="max-w-md space-y-4">
            <h2 className="text-3xl font-bold">Ready to Publish?</h2>
            <p className="text-muted-foreground">
              Once published, this assessment will be scheduled for{" "}
              <strong>{metadata.date?.toDateString()}</strong> at{" "}
              <strong>{metadata.startTime}</strong>. Students will be notified
              immediately.
            </p>
          </div>

          <div className="flex flex-col gap-4 w-full max-w-sm">
            <Button
              size="lg"
              className="h-14 text-lg rounded-full"
              onClick={handlePublish}
            >
              Publish Assessment Now
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-14 text-lg rounded-full"
              onClick={handleSaveDraft}
            >
              Save as Draft
            </Button>
            <Button variant="ghost" onClick={() => setStep(4)}>
              Review one more time
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
