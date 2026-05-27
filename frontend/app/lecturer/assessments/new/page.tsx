// app/lecturer/assessments/new/page.tsx
"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  Info,
  Image as ImageIcon,
  Loader2 as LoaderCircleIcon,
  Calendar as CalendarIcon,
  Users,
  Upload,
} from "lucide-react";
import { format } from "date-fns";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiClient } from "@/lib/api/client";
import { questionApi } from "@/lib/api/question";
import { assessmentApi } from "@/lib/api/assessment";
import {
  lecturerApi,
  AdminCourseListItem,
  InstitutionResponse,
  DepartmentResponse,
  OptionResponse,
  ClassGroupResponse,
  AcademicPeriodResponse,
  UserResponse,
} from "@/lib/api/lecturer";
import { QuestionBankSelector } from "@/components/mindexa/assessment/question-bank-selector";
import { QuestionBankItem } from "@/lib/api/question";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GroupWorkConfigSection } from "@/components/mindexa/assessment/group-work-config";
import { GroupCsvImport } from "@/components/mindexa/assessment/group-csv-import";
import { GroupBuilderDnd } from "@/components/mindexa/assessment/group-builder-dnd";
import { GroupQuestionEditor } from "@/components/mindexa/assessment/group-question-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { summarizeQuestionMix } from "@/lib/grading-architecture";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

type AssessmentMode =
  | "Practice"
  | "Formative"
  | "Homework"
  | "CAT"
  | "Summative"
  | "Groupwork";
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

type ComputationalSubType = "decision" | "search" | "counting" | "optimization";

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
  groupId?: string;
  text: string;
  imageUrl?: string;
  type: QuestionType;
  computationalType?: ComputationalSubType;
  caseStudyContext?: string;
  marks: number;
  options: QuestionOption[];
  aiGenerated: boolean;
}

interface GroupMember {
  id: string;
  name: string;
  email: string;
  is_leader?: boolean;
}

interface Group {
  id: string;
  name: string;
  members: GroupMember[];
}

const PREDEFINED_INSTRUCTIONS = [
  "Fullscreen required",
  "No tab switching",
  "No external materials allowed",
  "Time strictly enforced",
  "Calculators permitted",
  "Formula sheet provided",
];

// --- COMPONENTS ---

function SortableLecturerOrderItem({
  id,
  index,
  option,
  onUpdateText,
  onRemove,
}: {
  id: string;
  index: number;
  option: any;
  onUpdateText: (val: string) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: "relative" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-2 border rounded-md bg-background transition-all",
        isDragging && "shadow-lg border-primary/50 z-10"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="size-4" />
      </div>
      <Badge variant="outline">{index + 1}</Badge>
      <Input
        value={option.option_text || option.text || ""}
        onChange={(e) => onUpdateText(e.target.value)}
        className="flex-1 h-9"
        placeholder={`Step ${index + 1}`}
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="text-destructive h-8 w-8"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

function LecturerOrderingList({
  options,
  onUpdateOptions,
  onAddOption,
  onUpdateOptionText,
  onRemoveOption,
}: {
  options: any[];
  onUpdateOptions: (newOptions: any[]) => void;
  onAddOption: () => void;
  onUpdateOptionText: (index: number, val: string) => void;
  onRemoveOption: (index: number) => void;
}) {
  const itemsWithIds = useMemo(() => {
    return options.map((opt, i) => ({ ...opt, _dndId: opt.id || `opt-${i}` }));
  }, [options]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = itemsWithIds.findIndex((x) => x._dndId === active.id);
      const newIndex = itemsWithIds.findIndex((x) => x._dndId === over.id);

      const newOptions = arrayMove(options, oldIndex, newIndex);
      const sortedOptions = newOptions.map((opt, i) => ({ ...opt, order_index: i }));
      onUpdateOptions(sortedOptions);
    }
  };

  return (
    <div className="space-y-4 pl-4 border-l-2 border-muted">
      <Label className="text-sm font-semibold">
        Correct Sequence (Auto-Shuffled for Students)
      </Label>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext
          items={itemsWithIds.map(x => x._dndId)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {itemsWithIds.map((opt, idx) => (
              <SortableLecturerOrderItem
                key={opt._dndId}
                id={opt._dndId}
                index={idx}
                option={opt}
                onUpdateText={(val) => onUpdateOptionText(idx, val)}
                onRemove={() => onRemoveOption(idx)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button variant="outline" size="sm" onClick={onAddOption}>
        <Plus className="size-3 mr-2" /> Add Item
      </Button>
    </div>
  );
}

function SortableMatchingPairItem({
  id,
  option,
  onUpdateLeft,
  onUpdateRight,
  onRemove,
}: {
  id: string;
  option: any;
  onUpdateLeft: (val: string) => void;
  onUpdateRight: (val: string) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: "relative" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-2 border rounded-md bg-background transition-all",
        isDragging && "shadow-lg border-primary/50 z-10"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="size-4" />
      </div>
      <Input
        value={option.option_text || ""}
        onChange={(e) => onUpdateLeft(e.target.value)}
        className="flex-1 h-9"
        placeholder="Premise (Left)"
      />
      <ChevronRight className="size-4 text-muted-foreground opacity-30" />
      <Input
        value={option.option_text_right || ""}
        onChange={(e) => onUpdateRight(e.target.value)}
        className="flex-1 h-9"
        placeholder="Response (Right)"
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="text-destructive h-8 w-8"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

function LecturerMatchingList({
  options,
  onUpdateOptions,
  onAddOption,
  onUpdateOptionLeft,
  onUpdateOptionRight,
  onRemoveOption,
}: {
  options: any[];
  onUpdateOptions: (newOptions: any[]) => void;
  onAddOption: () => void;
  onUpdateOptionLeft: (index: number, val: string) => void;
  onUpdateOptionRight: (index: number, val: string) => void;
  onRemoveOption: (index: number) => void;
}) {
  const itemsWithIds = useMemo(() => {
    return options.map((opt, i) => ({ ...opt, _dndId: opt.id || `match-${i}` }));
  }, [options]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = itemsWithIds.findIndex((x) => x._dndId === active.id);
      const newIndex = itemsWithIds.findIndex((x) => x._dndId === over.id);

      const newOptions = arrayMove(options, oldIndex, newIndex);
      const sortedOptions = newOptions.map((opt, i) => ({ ...opt, order_index: i }));
      onUpdateOptions(sortedOptions);
    }
  };

  return (
    <div className="space-y-4 pl-4 border-l-2 border-muted">
      <Label className="text-sm font-semibold">
        Matching Pairs (Draggable Reordering)
      </Label>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext
          items={itemsWithIds.map(x => x._dndId)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {itemsWithIds.map((opt, idx) => (
              <SortableMatchingPairItem
                key={opt._dndId}
                id={opt._dndId}
                option={opt}
                onUpdateLeft={(val) => onUpdateOptionLeft(idx, val)}
                onUpdateRight={(val) => onUpdateOptionRight(idx, val)}
                onRemove={() => onRemoveOption(idx)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button variant="outline" size="sm" onClick={onAddOption}>
        <Plus className="size-3 mr-2" /> Add Pair
      </Button>
    </div>
  );
}

function QuestionCard({
  question,
  index,
  allowedTypes,
  onUpdate,
  onDelete,
  onSaveToBank,
  onUpdateOption,
  onAddOption,
  onRemoveOption,
}: {
  question: Question;
  index: number;
  allowedTypes: QuestionType[];
  onUpdate: (updates: Partial<Question>) => void;
  onDelete: () => void;
  onSaveToBank: () => void;
  onUpdateOption: (idx: number, updates: Partial<QuestionOption>) => void;
  onAddOption: () => void;
  onRemoveOption: (idx: number) => void;
}) {
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image too large. Max 5MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        onUpdate({ imageUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Card className="shadow-none border hover:border-primary/20 transition-colors">
      <CardContent className="p-6 space-y-6">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="size-8 flex items-center justify-center rounded-lg font-semibold text-sm"
            >
              {index + 1}
            </Badge>
            <Select
              value={question.type}
              onValueChange={(v: QuestionType) => {
                let newOptions: QuestionOption[] = [];
                if (v === "mcq") {
                  newOptions = [
                    {
                      option_text: "Option 1",
                      is_correct: true,
                      order_index: 0,
                    },
                    {
                      option_text: "Option 2",
                      is_correct: false,
                      order_index: 1,
                    },
                  ];
                } else if (v === "truefalse") {
                  newOptions = [
                    { option_text: "True", is_correct: true, order_index: 0 },
                    { option_text: "False", is_correct: false, order_index: 1 },
                  ];
                } else if (v === "fillblank") {
                  newOptions = [
                    {
                      option_text: "Answer 1",
                      is_correct: true,
                      order_index: 0,
                    },
                  ];
                } else if (v === "matching") {
                  newOptions = [
                    {
                      option_text: "Premise 1",
                      option_text_right: "Response 1",
                      is_correct: true,
                      order_index: 0,
                    },
                    {
                      option_text: "Premise 2",
                      option_text_right: "Response 2",
                      is_correct: true,
                      order_index: 1,
                    },
                  ];
                } else if (v === "ordering") {
                  newOptions = [
                    { option_text: "Step 1", is_correct: true, order_index: 0 },
                    { option_text: "Step 2", is_correct: true, order_index: 1 },
                  ];
                }
                onUpdate({ type: v, options: newOptions });
              }}
            >
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedTypes.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Marks
              </Label>
              <Input
                type="number"
                className="w-16 h-8 text-center"
                value={question.marks ?? 0}
                onChange={(e) =>
                  onUpdate({ marks: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="flex items-center gap-1 border-l pl-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={onSaveToBank}
                className="text-primary hover:bg-primary/5 h-8 w-8"
                title="Save to Bank"
              >
                <Database className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/5 h-8 w-8"
                title="Delete Question"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Question Text & Media */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Question Content</Label>
            <Textarea
              placeholder="Write your question text here..."
              value={question.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              className="min-h-[100px] text-base"
            />
            {question.type === "fillblank" && (
              <p className="text-[11px] text-primary font-medium mt-1">
                Tip: Use <strong>[blank]</strong> to indicate where students
                should type their answers.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <ImageIcon className="size-4" /> Question Media (Optional)
            </Label>
            {question.imageUrl ? (
              <div className="relative inline-block border rounded-lg p-2 bg-muted/30 group">
                <img
                  src={question.imageUrl}
                  alt="Diagram"
                  className="max-h-60 rounded-md object-contain"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onUpdate({ imageUrl: undefined })}
                  >
                    <Trash2 className="size-4 mr-2" /> Remove Image
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 px-4 h-9 rounded-md border border-dashed cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="size-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Upload Image
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </label>
                <span className="text-[11px] text-muted-foreground">
                  JPG, PNG, SVG (Max 5MB)
                </span>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Specialized Logic Sections */}
        {question.type === "computational" && (
          <div className="space-y-4 pl-4 border-l-2 border-primary bg-primary/5 p-4 rounded-r-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-primary">
                  Logic Classification
                </Label>
                <Select
                  value={question.computationalType || "search"}
                  onValueChange={(v: ComputationalSubType) =>
                    onUpdate({ computationalType: v })
                  }
                >
                  <SelectTrigger className="h-9 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="decision">
                      Decision Problem (Yes/No)
                    </SelectItem>
                    <SelectItem value="search">
                      Search Problem (Value retrieval)
                    </SelectItem>
                    <SelectItem value="counting">
                      Counting Problem (Solution total)
                    </SelectItem>
                    <SelectItem value="optimization">
                      Optimization Problem (Best solution)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-primary">
                  Expected Solution / Rubric
                </Label>
                <Textarea
                  placeholder="Describe the mathematical proof or value expected..."
                  className="h-9 min-h-[36px] bg-background text-sm"
                  value={question.options[0]?.option_text || ""}
                  onChange={(e) =>
                    onUpdate({
                      options: [
                        {
                          option_text: e.target.value,
                          is_correct: true,
                          order_index: 0,
                        },
                      ],
                    })
                  }
                />
              </div>
            </div>
          </div>
        )}

        {question.type === "casestudy" && (
          <div className="space-y-4 pl-4 border-l-2 border-amber-500 bg-amber-50/50 p-4 rounded-r-lg">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-amber-700">
                Case Scenario / Background
              </Label>
              <Textarea
                placeholder="Paste the scenario, story, or data context here..."
                className="min-h-[120px] bg-background text-sm leading-relaxed"
                value={question.caseStudyContext || ""}
                onChange={(e) => onUpdate({ caseStudyContext: e.target.value })}
              />
            </div>
          </div>
        )}

        {/* Answer Options Editors */}
        {(question.type === "mcq" || question.type === "truefalse") && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <Label className="text-sm font-semibold">
              Options (Select the correct one)
            </Label>
            <RadioGroup
              value={question.options
                .find((o) => o.is_correct)
                ?.order_index.toString()}
              onValueChange={(v) => {
                const idx = parseInt(v);
                onUpdate({
                  options: question.options.map((opt, i) => ({
                    ...opt,
                    is_correct: i === idx,
                  })),
                });
              }}
              className="space-y-2"
            >
              {question.options.map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-3">
                  <RadioGroupItem value={oIdx.toString()} />
                  <Input
                    value={opt.option_text || ""}
                    onChange={(e) =>
                      onUpdateOption(oIdx, { option_text: e.target.value })
                    }
                    className="h-9"
                    placeholder={`Option ${oIdx + 1}`}
                    disabled={question.type === "truefalse"}
                  />
                  {question.type === "mcq" && question.options.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveOption(oIdx)}
                      className="text-destructive h-9 w-9"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </RadioGroup>
            {question.type === "mcq" && (
              <Button variant="outline" size="sm" onClick={onAddOption}>
                <Plus className="size-3 mr-2" /> Add Option
              </Button>
            )}
          </div>
        )}

        {question.type === "matching" && (
          <LecturerMatchingList
            options={question.options}
            onUpdateOptions={(newOptions) => onUpdate({ options: newOptions })}
            onAddOption={onAddOption}
            onUpdateOptionLeft={(idx, val) => onUpdateOption(idx, { option_text: val })}
            onUpdateOptionRight={(idx, val) => onUpdateOption(idx, { option_text_right: val })}
            onRemoveOption={onRemoveOption}
          />
        )}

        {question.type === "fillblank" && (
          <div className="space-y-6 pl-4 border-l-2 border-muted">
            <div className="space-y-4">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" />
                Correct Answers for Blanks (In Sequence)
              </Label>
              <div className="space-y-2">
                {question.options.filter(o => o.is_correct).map((opt, oIdx) => (
                  <div key={oIdx} className="flex items-center gap-3">
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">#{oIdx + 1}</Badge>
                    <Input
                      value={opt.option_text || ""}
                      onChange={(e) => {
                        const correctIndices = question.options.map((o, i) => o.is_correct ? i : -1).filter(i => i !== -1);
                        const actualIdx = correctIndices[oIdx];
                        onUpdateOption(actualIdx, { option_text: e.target.value });
                      }}
                      className="flex-1 h-9"
                      placeholder="Correct Answer"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const correctIndices = question.options.map((o, i) => o.is_correct ? i : -1).filter(i => i !== -1);
                        onRemoveOption(correctIndices[oIdx]);
                      }}
                      className="text-destructive"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const newOptions = [...question.options, { option_text: "", is_correct: true, order_index: question.options.length }];
                    onUpdate({ options: newOptions });
                  }}
                  className="h-8 text-[11px]"
                >
                  <Plus className="size-3 mr-2" /> Add Blank Target
                </Button>
              </div>
            </div>

            <Separator className="opacity-50" />

            <div className="space-y-4">
              <Label className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Plus className="size-4" />
                Extra Pool Distractors (Optional)
              </Label>
              <p className="text-[11px] text-muted-foreground">These will appear in the student&apos;s pool but are not correct for any blank.</p>
              <div className="space-y-2">
                {question.options.filter(o => !o.is_correct).map((opt, oIdx) => (
                  <div key={oIdx} className="flex items-center gap-3">
                    <div className="size-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold opacity-40">D</div>
                    <Input
                      value={opt.option_text || ""}
                      onChange={(e) => {
                        const distractorIndices = question.options.map((o, i) => !o.is_correct ? i : -1).filter(i => i !== -1);
                        const actualIdx = distractorIndices[oIdx];
                        onUpdateOption(actualIdx, { option_text: e.target.value });
                      }}
                      className="flex-1 h-9"
                      placeholder="Distractor Text"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const distractorIndices = question.options.map((o, i) => !o.is_correct ? i : -1).filter(i => i !== -1);
                        onRemoveOption(distractorIndices[oIdx]);
                      }}
                      className="text-destructive"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    const newOptions = [...question.options, { option_text: "", is_correct: false, order_index: question.options.length }];
                    onUpdate({ options: newOptions });
                  }}
                  className="h-8 text-[11px] border border-dashed hover:bg-muted/50"
                >
                  <Plus className="size-3 mr-2" /> Add Distractor
                </Button>
              </div>
            </div>
          </div>
        )}

        {question.type === "ordering" && (
          <LecturerOrderingList
            options={question.options}
            onUpdateOptions={(newOptions) => onUpdate({ options: newOptions })}
            onAddOption={onAddOption}
            onUpdateOptionText={(idx, val) => onUpdateOption(idx, { option_text: val })}
            onRemoveOption={onRemoveOption}
          />
        )}

        {(question.type === "shortanswer" || question.type === "essay") && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-xs text-primary font-semibold flex items-center gap-2 mb-1">
                <BrainCircuit className="size-4" /> Open-Ended Evaluation
              </p>
              <p className="text-xs text-muted-foreground">
                Students will be provided with a{" "}
                {question.type === "shortanswer"
                  ? "text input"
                  : "rich text area"}
                . AI will use the rubric below for pre-grading.
              </p>
            </div>
            <Label className="text-sm font-semibold">
              Ideal Answer / Grading Rubric
            </Label>
            <Textarea
              placeholder="Define exactly what constitutes a full-mark answer..."
              className="min-h-[100px] text-sm"
              value={question.options[0]?.option_text || ""}
              onChange={(e) =>
                onUpdate({
                  options: [
                    {
                      option_text: e.target.value,
                      is_correct: true,
                      order_index: 0,
                    },
                  ],
                })
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewQuestionCard({
  question,
  index,
}: {
  question: Question;
  index: number;
}) {
  return (
    <div className="space-y-4 group p-4 border rounded-lg hover:bg-muted/5 transition-colors">
      <div className="flex gap-4">
        <span className="text-muted-foreground font-bold text-2xl tabular-nums shrink-0">
          {(index + 1).toString().padStart(2, "0")}
        </span>
        <div className="space-y-3 flex-1">
          <div>
            <p className="font-semibold text-lg leading-tight">
              {question.text || (
                <em className="text-muted-foreground font-normal italic">
                  No question text provided
                </em>
              )}
            </p>
            {question.imageUrl && (
              <div className="mt-3 inline-block p-1 border rounded-lg overflow-hidden">
                <img
                  src={question.imageUrl}
                  alt="Diagram"
                  className="max-h-52 rounded-md object-contain"
                />
              </div>
            )}
            {question.caseStudyContext && (
              <div className="mt-3 p-4 bg-muted/20 border border-dashed rounded-lg text-sm text-foreground/80 leading-relaxed">
                <span className="font-bold block mb-1 text-[10px] text-primary uppercase tracking-wider">
                  Case Scenario
                </span>
                {question.caseStudyContext}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="h-5 text-[10px] uppercase font-bold"
            >
              {question.type}
            </Badge>
            <Badge variant="outline" className="h-5 text-[10px] font-medium">
              {question.marks} Marks
            </Badge>
          </div>

          {/* Options Preview */}
          <div className="space-y-2">
            {(question.type === "mcq" || question.type === "truefalse") && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {question.options.map((opt, i) => (
                  <div
                    key={i}
                    className={cn(
                      "text-sm p-2 px-3 rounded-md border flex items-center justify-between",
                      opt.is_correct
                        ? "bg-emerald-50 border-emerald-100 text-emerald-900 font-medium"
                        : "bg-background border-border",
                    )}
                  >
                    {opt.option_text}
                    {opt.is_correct && (
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {question.type === "matching" && (
              <div className="space-y-1 max-w-lg">
                {question.options.map((opt, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 bg-muted/10 p-2 px-3 rounded-md border border-dashed text-xs"
                  >
                    <div className="font-medium flex-1">{opt.option_text}</div>
                    <ChevronRight className="size-3 text-primary" />
                    <div className="font-bold text-primary flex-1">
                      {opt.option_text_right}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {((question.type as string) === "fillblank" || (question.type as string) === "fill_blank") && (
              <div className="flex flex-wrap gap-2">
                {question.options.map((opt, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="h-7 bg-amber-50 text-amber-900 border-amber-200"
                  >
                    #{i + 1}: {opt.option_text}
                  </Badge>
                ))}
              </div>
            )}

            {question.type === "ordering" && (
              <div className="space-y-1 max-w-md">
                {question.options.map((opt, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-background border p-2 px-3 rounded-md text-sm font-medium"
                  >
                    <span className="size-5 bg-primary text-white rounded-full flex items-center justify-center text-[10px]">
                      {i + 1}
                    </span>
                    {opt.option_text}
                  </div>
                ))}
              </div>
            )}

            {(question.type === "computational" ||
              question.type === "shortanswer" ||
              question.type === "essay" ||
              question.type === "casestudy") && (
              <div className="p-3 bg-muted/10 border-l-2 border-primary/20 rounded-r-md text-sm italic text-muted-foreground">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-primary not-italic mb-1">
                  Grading Key
                </span>
                {question.options[0]?.option_text ||
                  "No grading rubric provided."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- MAIN BUILDER ---

const STEPS_DATA = [
  { title: "Identity", icon: FileText },
  { title: "Blueprint", icon: Layout },
  { title: "Structure", icon: BrainCircuit },
  { title: "Final Review", icon: Eye },
  { title: "Go Live", icon: CheckCircle2 },
];

export default function NewAssessmentBuilder() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const draftId = searchParams.get("draft");

  const [activeStep, setActiveStep] = useState(1);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [courses, setCourses] = useState<AdminCourseListItem[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [periods, setPeriods] = useState<AcademicPeriodResponse[]>([]);

  const uniquePeriods = useMemo(() => {
    const seen = new Set();
    return periods.filter((p) => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    });
  }, [periods]);

  // Core State
  const [metadata, setMetadata] = useState({
    title: "",
    description: "",
    mode: "CAT" as AssessmentMode,
    institution_id: "",
    course_id: "",
    teaching_workspace_id: "",
    department_ids: [] as string[],
    option_ids: [] as string[],
    class_group_ids: [] as string[],
    academic_year: "",
    academic_period_id: "",
    date: undefined as Date | undefined,
    startTime: "09:00",
    endTime: "11:00",
    durationMinutes: 120,
    passing_marks: 70,
    selectedInstructions: [
      "Fullscreen required",
      "No tab switching",
      "No external materials allowed",
      "Time strictly enforced",
    ] as string[],
    customInstructions: "",
    max_group_size: 4,
    group_formation_mode: "self_enrol",
    group_assignment_mode: "AUTOMATIC" as "AUTOMATIC" | "MANUAL",
    question_distribution_mode: "SHARED" as "SHARED" | "PER_GROUP",
    require_all_member_approval: true,
    require_all_member_participation: true,
    appeal_window_days: 7,
  });

  const [groups, setGroups] = useState<Group[]>([]);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [institutions, setInstitutions] = useState<InstitutionResponse[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<
    DepartmentResponse[]
  >([]);
  const [availableOptions, setAvailableOptions] = useState<OptionResponse[]>(
    [],
  );
  const [availableClasses, setAvailableClasses] = useState<
    ClassGroupResponse[]
  >([]);
  const [fetchingMetadata, setFetchingMetadata] = useState(true);
  const [fetchingDepts, setFetchingDepts] = useState(false);
  const [fetchingOptions, setFetchingOptions] = useState(false);
  const [fetchingClasses, setFetchingClasses] = useState(false);

  const [blueprint, setBlueprint] = useState<BlueprintSection[]>([
    {
      id: "sec-1",
      section: "Section A",
      topics: "",
      marks: 20,
      questions: 10,
      difficulty: "Medium",
      allowedTypes: ["mcq", "truefalse", "matching"],
    },
  ]);

  const [rules, setRules] = useState({
    openBook: false,
    supervised: true,
    aiAllowed: false,
    browserRestricted: true,
    shuffleQuestions: true,
    shuffleOptions: true,
    resultRelease: "manual" as "immediate" | "manual",
    resultReleaseAt: undefined as Date | undefined,
    attempts: 1,
    passwordProtected: false,
    accessPassword: "",
    latePenaltyPercent: 0,
    gracePeriodMinutes: 0,
    autosaveToken:
      typeof window !== "undefined" ? crypto.randomUUID() : undefined,
    supervisor_ids: [] as string[],
  });

  const [questions, setQuestions] = useState<Question[]>([]);

  // Derived
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
  const gradingArchitecture = useMemo(
    () => summarizeQuestionMix(questions),
    [questions],
  );

  const [availableLecturers, setAvailableLecturers] = useState<UserResponse[]>([]);
  const [passingMarksPercent, setPassingMarksPercent] = useState(70);

  // Logic: Passing Marks calculation
  useEffect(() => {
    setMetadata(prev => ({
      ...prev,
      passing_marks: Math.floor((totalMarks * passingMarksPercent) / 100)
    }));
  }, [totalMarks, passingMarksPercent]);

  // Init Data
  useEffect(() => {
    async function init() {
      try {
        const [workspaceRes, instRes, periodRes, lectRes] = await Promise.all([
          lecturerApi.getWorkspaces(),
          lecturerApi.getMyInstitutions(),
          lecturerApi.getPeriods(),
          lecturerApi.getLecturers(),
        ]);
        setCourses(workspaceRes as any); // Type assertion until AdminCourseListItem is fully retired
        setInstitutions(instRes);
        setPeriods(periodRes);
        setAvailableLecturers(lectRes);
        
        if (instRes.length === 1) handleInstitutionChange(instRes[0].id);
        
        if (periodRes.length > 0) {
            setMetadata(prev => ({
                ...prev,
                academic_year: periodRes[0].name
            }));
        }
      } catch (err) {
        toast.error("Failed to initialize builder.");
      } finally {
        setIsLoadingCourses(false);
        setFetchingMetadata(false);
      }
    }
    init();
  }, []);

  const handleInstitutionChange = async (val: string) => {
    setMetadata((prev) => ({
      ...prev,
      institution_id: val,
      department_ids: [],
      option_ids: [],
      class_group_ids: [],
    }));
    setAvailableDepartments([]);
    setFetchingDepts(true);
    try {
      const depts = await lecturerApi.getMyDepartments(val);
      setAvailableDepartments(depts);
    } finally {
      setFetchingDepts(false);
    }
  };

  const toggleDept = async (id: string) => {
    const newSelected = metadata.department_ids.includes(id)
      ? metadata.department_ids.filter((i) => i !== id)
      : [...metadata.department_ids, id];
    setMetadata((p) => ({
      ...p,
      department_ids: newSelected,
      option_ids: [],
      class_group_ids: [],
    }));
    setAvailableOptions([]);
    if (newSelected.length > 0) {
      setFetchingOptions(true);
      try {
        const all = await Promise.all(
          newSelected.map((dId) => lecturerApi.getMyOptions(dId)),
        );
        setAvailableOptions(all.flat());
      } finally {
        setFetchingOptions(false);
      }
    }
  };

  const toggleOption = async (id: string) => {
    const newSelected = metadata.option_ids.includes(id)
      ? metadata.option_ids.filter((i) => i !== id)
      : [...metadata.option_ids, id];
    setMetadata((p) => ({
      ...p,
      option_ids: newSelected,
      class_group_ids: [],
    }));
    setAvailableClasses([]);
    if (newSelected.length > 0) {
      setFetchingClasses(true);
      try {
        const all = await Promise.all(
          newSelected.map((oId) => lecturerApi.getMyClasses(oId)),
        );
        setAvailableClasses(all.flat());
      } finally {
        setFetchingClasses(false);
      }
    }
  };

  const toggleClass = (id: string) => {
    setMetadata((p) => ({
      ...p,
      class_group_ids: p.class_group_ids.includes(id)
        ? p.class_group_ids.filter((i) => i !== id)
        : [...p.class_group_ids, id],
    }));
  };

  // Logic: Result Release Mode
  useEffect(() => {
    const hasOpen = questions.some((q) =>
      ["essay", "shortanswer", "computational", "casestudy"].includes(q.type),
    );
    setRules((prev) => ({
      ...prev,
      resultRelease: hasOpen ? "manual" : "immediate",
    }));
  }, [questions]);

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

  const addQuestion = (sectionId: string, groupId?: string) => {
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
        groupId,
        text: "",
        type,
        marks:
          section.questions > 0
            ? Math.floor(section.marks / section.questions)
            : 2,
        options: initialOptions,
        aiGenerated: false,
      },
    ]);
  };

  const updateQuestion = (id: string, updates: Partial<Question>) =>
    setQuestions(
      questions.map((q) => (q.id === id ? { ...q, ...updates } : q)),
    );
  const removeQuestion = (id: string) =>
    setQuestions(questions.filter((q) => q.id !== id));
  const updateOption = (
    qId: string,
    optIdx: number,
    updates: Partial<QuestionOption>,
  ) => {
    setQuestions(
      questions.map((q) => {
        if (q.id !== qId) return q;
        const newOptions = [...q.options];
        newOptions[optIdx] = { ...newOptions[optIdx], ...updates };
        return { ...q, options: newOptions };
      }),
    );
  };
  const addOption = (qId: string) =>
    setQuestions(
      questions.map((q) =>
        q.id === qId
          ? {
              ...q,
              options: [
                ...q.options,
                {
                  option_text: `New Item`,
                  is_correct: false,
                  order_index: q.options.length,
                },
              ],
            }
          : q,
      ),
    );
  const removeOption = (qId: string, optIdx: number) =>
    setQuestions(
      questions.map((q) =>
        q.id === qId
          ? {
              ...q,
              options: q.options
                .filter((_, i) => i !== optIdx)
                .map((opt, i) => ({ ...opt, order_index: i })),
            }
          : q,
      ),
    );

  const handleSaveToBank = async (q: Question) => {
    if (!q.text) {
      toast.error("Please enter question text before saving to bank");
      return;
    }

    try {
      const typeMap: Record<string, string> = {
        mcq: "mcq",
        truefalse: "true_false",
        shortanswer: "short_answer",
        essay: "essay",
        matching: "matching",
        fillblank: "fill_blank",
        computational: "computational",
        ordering: "ordering",
        casestudy: "case_study",
      };

      await questionApi.createQuestion({
        content: q.text,
        question_type: typeMap[q.type] || "short_answer",
        difficulty: "medium",
        suggested_marks: Math.max(1, q.marks),
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

  const handleBankSelect = async (
    qBankSummary: QuestionBankItem,
    sectionId: string,
    groupId?: string,
  ) => {
    try {
      const qBank = await questionApi.getQuestion(qBankSummary.id);
      const mappedType = qBank.question_type
        .toLowerCase()
        .replace("_", "") as QuestionType;

      setQuestions((prev) => [
        ...prev,
        {
          id: `q-bank-${qBank.id}-${Date.now()}`,
          sectionId,
          groupId,
          text: qBank.content,
          type: mappedType,
          marks: qBank.marks,
          options: (qBank.options || []).map((opt) => ({
            option_text: opt.option_text,
            option_text_right: opt.option_text_right,
            is_correct: opt.is_correct,
            order_index: opt.order_index,
          })),
          aiGenerated: false,
        },
      ]);
      toast.success("Question added from bank");
    } catch (err) {
      toast.error("Failed to fetch full question details from bank.");
    }
  };

  const formatDisplayTime = (timeStr: string) => {
    if (!timeStr) return "";
    try {
      const [h, m] = timeStr.split(":");
      const d = new Date();
      d.setHours(parseInt(h), parseInt(m));
      return format(d, "h:mm a");
    } catch (e) {
      return timeStr;
    }
  };

  const preparePayload = () => {
    const payload = {
      id: draftId || undefined,
      metadata: {
        ...metadata,
        academic_year: metadata.academic_year,
        maxGroupSize: metadata.max_group_size,
        groupFormation: metadata.group_formation_mode,
        groupAssignmentMode: metadata.group_assignment_mode,
        questionDistributionMode: metadata.question_distribution_mode,
        appealWindowDays: metadata.appeal_window_days,
        // Ensure lists are valid or empty
        department_ids: metadata.department_ids || [],
        option_ids: metadata.option_ids || [],
        class_group_ids: metadata.class_group_ids || [],
      },
      blueprint: blueprint.map((b) => ({
        id: b.id,
        section: b.section,
        topics: b.topics,
        marks: b.marks,
        questions: b.questions,
        difficulty: b.difficulty,
        allowedTypes: b.allowedTypes,
      })),
      questions: questions.map((q) => ({
        id: q.id,
        sectionId: q.sectionId,
        groupId: q.groupId,
        text: q.text,
        type: q.type, // BulkAssessmentQuestion expects 'type' and handles casing in service
        marks: q.marks,
        options: q.options.map(opt => ({
          option_text: opt.option_text,
          option_text_right: opt.option_text_right,
          is_correct: opt.is_correct,
          order_index: opt.order_index
        })),
        aiGenerated: q.aiGenerated,
        imageUrl: q.imageUrl,
        computationalType: q.computationalType,
        caseStudyContext: q.caseStudyContext,
      })),
      rules: {
        ...rules,
        requireAllMemberApproval: metadata.require_all_member_approval,
        requireAllMemberParticipation:
          metadata.require_all_member_participation,
        supervisor_ids: rules.supervisor_ids,
      },
    };

    const parseTimeString = (timeStr: string, baseDate: Date) => {
      const d = new Date(baseDate);
      const [time, modifier] = timeStr.trim().split(/\s+/);
      const [h, m] = time.split(":");
      let hours = parseInt(h);
      const minutes = parseInt(m);
      if (modifier?.toLowerCase() === "pm" && hours < 12) hours += 12;
      if (modifier?.toLowerCase() === "am" && hours === 12) hours = 0;
      d.setHours(hours, minutes, 0, 0);
      return d;
    };

    if (metadata.date && metadata.startTime)
      (payload.metadata as any).windowStart = parseTimeString(
        metadata.startTime,
        metadata.date,
      ).toISOString();
    if (metadata.date && metadata.endTime)
      (payload.metadata as any).windowEnd = parseTimeString(
        metadata.endTime,
        metadata.date,
      ).toISOString();

    return payload;
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const res = (await apiClient("/assessments/draft", {
        method: "POST",
        body: JSON.stringify(preparePayload()),
      })) as any;
      toast.success("Draft saved successfully.");
      if (!draftId && res.assessment_id)
        router.replace(`/lecturer/assessments/new?draft=${res.assessment_id}`);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handlePublish = async () => {
    if (currentMarks !== totalMarks) {
      toast.error(
        `Total marks mismatch. Expected ${totalMarks}, but got ${currentMarks}.`,
      );
      return;
    }
    if (questions.length !== totalQuestions) {
      toast.error(
        `Question count mismatch. Expected ${totalQuestions}, but got ${questions.length}.`,
      );
      return;
    }
    setIsPublishing(true);
    try {
      const result = (await apiClient("/assessments/publish", {
        method: "POST",
        body: JSON.stringify(preparePayload()),
      })) as any;
      if (result.validation_passed) {
        toast.success("Assessment Published!");
        router.push("/lecturer/assessments");
      } else {
        toast.error(result.errors?.join(", ") || "Validation failed.");
      }
    } finally {
      setIsPublishing(false);
    }
  };

  if (isLoadingDraft || isLoadingCourses)
    return (
      <div className="max-w-6xl mx-auto space-y-10 py-10 px-4">
        <div className="flex items-center justify-between">
           <div className="space-y-2">
              <Skeleton variant="title" className="h-10 w-64" />
              <Skeleton variant="title" className="h-4 w-96" />
           </div>
           <div className="flex gap-2">
              <Skeleton variant="title" className="h-9 w-24 rounded-lg" />
              <Skeleton variant="title" className="h-9 w-24 rounded-lg" />
           </div>
        </div>
        <div className="space-y-6 bg-muted/50 p-6 rounded-2xl border">
           <div className="flex gap-4">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} variant="title" className="flex-1 h-12 rounded-lg" />)}
           </div>
           <Card className="shadow-none border p-8 space-y-8">
              <div className="grid grid-cols-2 gap-8">
                 <Skeleton variant="media" className="h-12 w-full rounded-lg" />
                 <Skeleton variant="media" className="h-12 w-full rounded-lg" />
              </div>
              <Skeleton variant="media" className="h-32 w-full rounded-lg" />
              <div className="grid grid-cols-4 gap-4">
                 {[1, 2, 3, 4].map(i => <Skeleton key={i} variant="media" className="h-10 w-full rounded-lg" />)}
              </div>
           </Card>
        </div>
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24 px-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Assessment Builder
          </h1>
          <p className="text-muted-foreground mt-1">
            Design secure academic assessments with ease
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={isSavingDraft}
            className="h-9"
          >
            <Save className="mr-2 size-4" />
            {isSavingDraft ? "Saving..." : "Save Draft"}
          </Button>
          <Badge variant="outline" className="h-9 px-4 font-semibold">
            Step {activeStep} / 5
          </Badge>
        </div>
      </div>

      <Stepper
        value={activeStep}
        onValueChange={setActiveStep}
        className="space-y-6"
        indicators={{
          completed: <Check className="size-3.5" />,
          loading: <div className="size-3.5 rounded-full bg-primary/40 animate-pulse" />,
        }}
      >
        <StepperNav className="flex w-full gap-2 border-b">
          {STEPS_DATA.map((s, index) => (
            <StepperItem
              key={index}
              step={index + 1}
              className="relative flex-1"
            >
              <StepperTrigger className="flex w-full flex-row items-center justify-center gap-2 p-3 rounded-none border-b-2 border-transparent transition-all hover:bg-muted/50 data-[state=active]:bg-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
                <StepperIndicator className="size-5 text-[10px] rounded-full bg-muted text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <s.icon className="size-3" />
                </StepperIndicator>
                <StepperTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground data-[state=active]:text-foreground">
                  {s.title}
                </StepperTitle>
              </StepperTrigger>
            </StepperItem>
          ))}
        </StepperNav>

        <StepperPanel>
          {/* STEP 1: IDENTITY */}
          <StepperContent value={1}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <Card className="shadow-none border">
                  <CardHeader className="py-5 border-b">
                    <CardTitle className="text-lg">
                      Assessment Identity
                    </CardTitle>
                    <CardDescription>
                      Define the core details and schedule for this assessment.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Assessment Title</Label>
                        <Input
                          value={metadata.title}
                          onChange={(e) =>
                            setMetadata({ ...metadata, title: e.target.value })
                          }
                          placeholder="e.g. Mid-Semester CAT – Database Systems"
                          className="h-10 font-medium"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Course / Module</Label>
                        <Select
                          value={metadata.teaching_workspace_id || metadata.course_id}
                          onValueChange={(v) => {
                            const ws = courses.find(c => c.id === v);
                            setMetadata({ 
                                ...metadata, 
                                teaching_workspace_id: v,
                                // If the workspace has a course_id (or if we can get it from the code/title)
                                // In WorkspaceListItem, we don't have course_id directly, but backend will resolve it.
                                // We'll set it to v for now as the backend handle potential workspace ID in course_id field.
                                course_id: v 
                            });
                          }}
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select course" />
                          </SelectTrigger>
                          <SelectContent>
                            {courses.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.title} ({c.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={metadata.description}
                        onChange={(e) =>
                          setMetadata({
                            ...metadata,
                            description: e.target.value,
                          })
                        }
                        placeholder="Brief overview of the assessment coverage..."
                        className="min-h-[100px] text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-dashed">
                      <div className="space-y-2">
                        <Label>Mode</Label>
                        <Select
                          value={metadata.mode}
                          onValueChange={(v: any) =>
                            setMetadata({ ...metadata, mode: v })
                          }
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[
                              "CAT",
                              "Summative",
                              "Homework",
                              "Formative",
                              "Practice",
                              "Groupwork",
                            ].map((m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Date</Label>
                        <Popover
                          open={datePopoverOpen}
                          onOpenChange={setDatePopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full h-10 justify-start font-normal text-sm",
                                !metadata.date && "text-muted-foreground",
                              )}
                            >
                              <CalendarIcon className="mr-2 size-4" />
                              {metadata.date
                                ? format(metadata.date, "PPP")
                                : "Set Date"}
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
                      <div className="space-y-2">
                        <Label>Start Time</Label>
                        <Input
                          type="time"
                          value={metadata.startTime}
                          onChange={(e) =>
                            setMetadata({
                              ...metadata,
                              startTime: e.target.value,
                            })
                          }
                          className="h-10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>End Time</Label>
                        <Input
                          type="time"
                          value={metadata.endTime}
                          onChange={(e) =>
                            setMetadata({
                              ...metadata,
                              endTime: e.target.value,
                            })
                          }
                          className="h-10"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-dashed">
                      <div className="space-y-2">
                        <Label>Institution</Label>
                        <Select
                          value={metadata.institution_id}
                          onValueChange={handleInstitutionChange}
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select Institution" />
                          </SelectTrigger>
                          <SelectContent>
                            {institutions.map((inst) => (
                              <SelectItem key={inst.id} value={inst.id}>
                                {inst.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Academic Year</Label>
                        <Select
                          value={metadata.academic_year}
                          onValueChange={(val) => {
                            const p = periods.find(p => p.name === val);
                            setMetadata({ 
                                ...metadata, 
                                academic_year: val,
                                academic_period_id: p?.id || "",
 
                            });
                          }}
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select Year Range" />
                          </SelectTrigger>
                          <SelectContent>
                            {uniquePeriods.map((p) => (
                              <SelectItem key={p.name} value={p.name}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-6 border-t border-dashed">
                      <div className="space-y-2">
                        <Label>Duration (Min)</Label>
                        <Input
                          type="number"
                          value={metadata.durationMinutes}
                          onChange={(e) =>
                            setMetadata({
                              ...metadata,
                              durationMinutes: parseInt(e.target.value) || 0,
                            })
                          }
                          className="h-10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Passing Marks (%)</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={passingMarksPercent}
                            onChange={(e) =>
                              setPassingMarksPercent(parseInt(e.target.value) || 0)
                            }
                            className="h-10 flex-1"
                          />
                          <Badge variant="secondary" className="h-10 px-3">
                            {metadata.passing_marks} Marks
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Passing threshold based on total assessment marks ({totalMarks})
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-dashed">
                      <div className="space-y-2">
                        <Label>Predefined Instructions</Label>
                        <div className="grid grid-cols-1 gap-2 border rounded-lg p-3 bg-muted/10">
                          {PREDEFINED_INSTRUCTIONS.map((instr) => (
                            <div
                              key={instr}
                              className="flex items-center space-x-2"
                            >
                              <Checkbox
                                id={instr}
                                checked={metadata.selectedInstructions.includes(
                                  instr,
                                )}
                                onCheckedChange={(checked) => {
                                  const current = metadata.selectedInstructions;
                                  setMetadata({
                                    ...metadata,
                                    selectedInstructions: checked
                                      ? [...current, instr]
                                      : current.filter((i) => i !== instr),
                                  });
                                }}
                              />
                              <label
                                htmlFor={instr}
                                className="text-sm cursor-pointer"
                              >
                                {instr}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Custom Instructions</Label>
                        <Textarea
                          placeholder="Any additional rules not covered by presets..."
                          className="min-h-[120px] text-sm"
                          value={metadata.customInstructions}
                          onChange={(e) =>
                            setMetadata({
                              ...metadata,
                              customInstructions: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {metadata.mode === "Groupwork" && (
                  <GroupWorkConfigSection
                    config={metadata as any}
                    onConfigChange={(updates) =>
                      setMetadata((prev) => ({ ...prev, ...updates }))
                    }
                  />
                )}
              </div>

              <div className="space-y-6">
                <Card className="shadow-none border">
                  <CardHeader className="py-4 border-b">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Target Enrollment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-6">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-[11px] font-bold text-muted-foreground mb-1.5 block">
                          Departments
                        </Label>
                        <ScrollArea className="h-32 border rounded-md p-2 bg-muted/10">
                          {availableDepartments.map((d) => (
                            <div
                              key={d.id}
                              className="flex items-center gap-2 p-1.5 rounded-md hover:bg-white cursor-pointer"
                              onClick={() => toggleDept(d.id)}
                            >
                              <Checkbox
                                checked={metadata.department_ids.includes(d.id)}
                              />
                              <span className="text-[11px] font-medium truncate">
                                {d.name}
                              </span>
                            </div>
                          ))}
                          {availableDepartments.length === 0 && (
                            <p className="text-[10px] text-center py-8 text-muted-foreground">
                              Select an institution first
                            </p>
                          )}
                        </ScrollArea>
                      </div>
                      <div>
                        <Label className="text-[11px] font-bold text-muted-foreground mb-1.5 block">
                          Class Options
                        </Label>
                        <ScrollArea className="h-32 border rounded-md p-2 bg-muted/10">
                          {availableOptions.map((o) => (
                            <div
                              key={o.id}
                              className="flex items-center gap-2 p-1.5 rounded-md hover:bg-white cursor-pointer"
                              onClick={() => toggleOption(o.id)}
                            >
                              <Checkbox
                                checked={metadata.option_ids.includes(o.id)}
                              />
                              <span className="text-[11px] font-medium truncate">
                                {o.name}
                              </span>
                            </div>
                          ))}
                          {availableOptions.length === 0 && (
                            <p className="text-[10px] text-center py-8 text-muted-foreground">
                              Select departments first
                            </p>
                          )}
                        </ScrollArea>
                      </div>
                      <div>
                        <Label className="text-[11px] font-bold text-muted-foreground mb-1.5 block">
                          Classes
                        </Label>
                        <ScrollArea className="h-32 border rounded-md p-2 bg-muted/10">
                          {availableClasses.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center gap-2 p-1.5 rounded-md hover:bg-white cursor-pointer"
                              onClick={() => toggleClass(c.id)}
                            >
                              <Checkbox
                                checked={metadata.class_group_ids.includes(
                                  c.id,
                                )}
                              />
                              <span className="text-[11px] font-medium truncate">
                                {c.name}
                              </span>
                            </div>
                          ))}
                          {availableClasses.length === 0 && (
                            <p className="text-[10px] text-center py-8 text-muted-foreground">
                              Select options first
                            </p>
                          )}
                        </ScrollArea>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
            <div className="flex justify-end mt-8">
              <Button
                size="lg"
                onClick={() => setActiveStep(2)}
                className="h-11 px-8 rounded-md font-semibold"
              >
                Define Blueprint <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </StepperContent>

          {/* STEP 2: BLUEPRINT */}
          <StepperContent value={2}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-semibold tracking-tight">
                    Assessment Blueprint
                  </h2>
                  <Button
                    onClick={addSection}
                    variant="outline"
                    size="sm"
                    className="h-8"
                  >
                    <Plus className="mr-2 size-3.5" /> Add Section
                  </Button>
                </div>

                {blueprint.map((sec) => (
                  <Card
                    key={sec.id}
                    className="shadow-none border overflow-hidden"
                  >
                    <CardHeader className="bg-muted/30 flex flex-row items-center justify-between p-4 py-3 border-b">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="secondary"
                          className="font-bold text-[10px] px-2 h-5"
                        >
                          {sec.section}
                        </Badge>
                        <Input
                          value={sec.section}
                          onChange={(e) =>
                            updateSection(sec.id, "section", e.target.value)
                          }
                          className="font-semibold text-base p-0 h-auto bg-transparent border-none focus-visible:ring-0 w-48"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSection(sec.id)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </CardHeader>
                    <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                            Topic Coverage
                          </Label>
                          <Input
                            placeholder="e.g. Advanced Calculus, Integration"
                            value={sec.topics}
                            onChange={(e) =>
                              updateSection(sec.id, "topics", e.target.value)
                            }
                            className="h-9 font-medium"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                              Allocated Marks
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
                              className="h-9 font-bold text-center"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
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
                              className="h-9 font-bold text-center"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          Permitted Question Types
                        </Label>
                        <ToggleGroup
                          type="multiple"
                          value={sec.allowedTypes}
                          onValueChange={(v: any) =>
                            v.length > 0 &&
                            updateSection(sec.id, "allowedTypes", v)
                          }
                          className="flex flex-wrap gap-2 justify-start"
                        >
                          {[
                            "mcq",
                            "truefalse",
                            "shortanswer",
                            "essay",
                            "matching",
                            "fillblank",
                            "computational",
                            "ordering",
                            "casestudy",
                          ].map((t) => (
                            <ToggleGroupItem
                              key={t}
                              value={t}
                              className="h-8 px-2.5 text-[10px] font-bold uppercase tracking-tight border hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-white data-[state=on]:border-primary transition-all rounded-md"
                            >
                              {t}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="space-y-6 pt-10">
                <Card className="shadow-none border">
                  <CardHeader className="py-4 border-b">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Shield className="size-4 text-primary" /> Environment &
                      Policy
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-6">
                    <div className="space-y-4">
                      {[
                        {
                          key: "supervised",
                          label: "Proctored",
                          desc: "Live monitoring enabled",
                        },
                        {
                          key: "browserRestricted",
                          label: "Safe Browser",
                          desc: "Forces fullscreen mode",
                        },
                        {
                          key: "aiAllowed",
                          label: "AI Allowed",
                          desc: "Allow LLM tools during exam",
                        },
                        {
                          key: "openBook",
                          label: "Open Book",
                          desc: "Reference materials allowed",
                        },
                      ].map((item) => (
                        <div
                          key={item.key}
                          className="flex items-start justify-between gap-4"
                        >
                          <div className="space-y-0.5">
                            <Label className="text-sm">{item.label}</Label>
                            <p className="text-[10px] text-muted-foreground leading-tight">
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
                    </div>

                    {rules.supervised && (
                      <div className="pt-5 border-t space-y-4">
                        <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                          Co-Supervisors / Invigilators
                        </Label>
                        <div className="space-y-3">
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            Select colleagues who can assist with live proctoring and integrity management.
                          </p>
                          <ScrollArea className="h-32 border rounded-md p-2 bg-muted/10">
                            {availableLecturers.map((l) => (
                              <div
                                key={l.id}
                                className="flex items-center gap-2 p-1.5 rounded-md hover:bg-white cursor-pointer"
                                onClick={() => {
                                  const current = rules.supervisor_ids;
                                  setRules({
                                    ...rules,
                                    supervisor_ids: current.includes(l.id)
                                      ? current.filter((id) => id !== l.id)
                                      : [...current, l.id],
                                  });
                                }}
                              >
                                <Checkbox
                                  checked={rules.supervisor_ids.includes(l.id)}
                                />
                                <div className="flex flex-col">
                                  <span className="text-[11px] font-semibold">
                                    {l.profile?.display_name || `${l.profile?.first_name} ${l.profile?.last_name}`}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground">
                                    {l.email}
                                  </span>
                                </div>
                              </div>
                            ))}
                            {availableLecturers.length === 0 && (
                              <p className="text-[10px] text-center py-8 text-muted-foreground">
                                No other lecturers found.
                              </p>
                            )}
                          </ScrollArea>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3 pt-5 border-t">
                      <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Result Release Mode
                      </Label>
                      <Select
                        value={rules.resultRelease}
                        onValueChange={(v: any) =>
                          setRules({ ...rules, resultRelease: v })
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediate">
                            Immediate (Auto-grade)
                          </SelectItem>
                          <SelectItem value="manual">
                            Manual Review Required
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="pt-5 border-t">
                      <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
                        Additional Configuration{" "}
                        <ChevronDown className="size-3" />
                      </Label>
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5">
                            <Label className="text-sm">
                              Randomize Questions
                            </Label>
                            <p className="text-[10px] text-muted-foreground">
                              Shuffle order per student
                            </p>
                          </div>
                          <Switch
                            checked={rules.shuffleQuestions}
                            onCheckedChange={(v) =>
                              setRules({ ...rules, shuffleQuestions: v })
                            }
                          />
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5">
                            <Label className="text-sm">Randomize Options</Label>
                            <p className="text-[10px] text-muted-foreground">
                              Shuffle MCQ options
                            </p>
                          </div>
                          <Switch
                            checked={rules.shuffleOptions}
                            onCheckedChange={(v) =>
                              setRules({ ...rules, shuffleOptions: v })
                            }
                          />
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5">
                            <Label className="text-sm">
                              Password Protected
                            </Label>
                            <p className="text-[10px] text-muted-foreground">
                              Require code to start
                            </p>
                          </div>
                          <Switch
                            checked={rules.passwordProtected}
                            onCheckedChange={(v) =>
                              setRules({ ...rules, passwordProtected: v })
                            }
                          />
                        </div>

                        {rules.passwordProtected && (
                          <Input
                            placeholder="Access code..."
                            value={rules.accessPassword}
                            onChange={(e) =>
                              setRules({
                                ...rules,
                                accessPassword: e.target.value,
                              })
                            }
                            className="h-8 text-sm"
                          />
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                              Max Attempts
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              value={rules.attempts}
                              onChange={(e) =>
                                setRules({
                                  ...rules,
                                  attempts: parseInt(e.target.value) || 1,
                                })
                              }
                              className="h-8 text-sm"
                            />
                          </div>
                          {metadata.mode === "Homework" && (
                            <div className="space-y-1.5">
                              <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                                Late Penalty %
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={rules.latePenaltyPercent}
                                onChange={(e) =>
                                  setRules({
                                    ...rules,
                                    latePenaltyPercent:
                                      parseFloat(e.target.value) || 0,
                                  })
                                }
                                className="h-8 text-sm"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-none border bg-muted/20">
                  <CardHeader className="py-3 border-b">
                    <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">
                      Blueprint Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium">Total Marks</span>
                      <span className="font-bold">{totalMarks}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium">Question Target</span>
                      <span className="font-bold">{totalQuestions}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8 pt-6 border-t">
              <Button variant="ghost" onClick={() => setActiveStep(1)}>
                Back
              </Button>
              <Button
                size="lg"
                onClick={() => setActiveStep(3)}
                className="h-11 px-8 rounded-md font-semibold"
              >
                Construct Questions <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </StepperContent>

          {/* STEP 3: QUESTIONS */}
          <StepperContent value={3}>
            {metadata.mode === "Groupwork" ? (
              <Tabs
                defaultValue="structure"
                className="space-y-8 max-w-5xl mx-auto"
              >
                <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
                  <TabsTrigger value="structure">Exam Structure</TabsTrigger>
                  <TabsTrigger value="groups">Groups & Members</TabsTrigger>
                </TabsList>

                <TabsContent value="structure" className="space-y-8">
                  <div className="flex items-center justify-between sticky top-16 z-40 bg-background/95 backdrop-blur-md py-3 border-b border-dashed">
                    <div className="flex items-center gap-6">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">
                          Progress
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xl font-bold text-primary">
                            {questions.length}
                          </span>
                          <span className="text-sm font-medium text-muted-foreground">
                            / {totalQuestions} questions
                          </span>
                        </div>
                      </div>
                    </div>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-[10px] font-bold uppercase tracking-wider rounded-lg border-primary/20 text-primary hover:bg-primary/5 shadow-none"
                        >
                          <Info className="mr-2 size-3.5" />
                          Grading Logic
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="w-[600px] p-0 overflow-hidden rounded-2xl border-none shadow-2xl"
                      >
                        <div className="bg-muted/10 border-b p-5">
                          <h4 className="text-sm font-bold uppercase tracking-widest">
                            Grading Architecture
                          </h4>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            Mindexa will automatically grade deterministic
                            closed questions and route open-ended responses
                            through lecturer review. AI-assisted review will
                            plug into this same control model later without
                            replacing lecturer authority.
                          </p>
                        </div>
                        <div className="p-4 grid grid-cols-2 gap-4">
                          <div className="p-4 rounded-xl border bg-muted/5 space-y-2">
                            <div className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">
                              Closed Questions
                            </div>
                            <div className="text-2xl font-bold text-emerald-600 tabular-nums">
                              {gradingArchitecture.closedQuestions}
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              MCQ, True/False, Matching, Fill-in-the-Blank,
                              Ordering
                            </p>
                          </div>
                          <div className="p-4 rounded-xl border bg-muted/5 space-y-2">
                            <div className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">
                              Open Questions
                            </div>
                            <div className="text-2xl font-bold text-amber-600 tabular-nums">
                              {gradingArchitecture.openQuestions}
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              Short Answer, Essay, Case Study, Computational
                              Reasoning
                            </p>
                          </div>
                          <div className="p-4 rounded-xl border bg-muted/5 space-y-2">
                            <div className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">
                              Release Mode
                            </div>
                            <div className="text-base font-bold text-foreground">
                              {gradingArchitecture.releaseMode === "manual"
                                ? "Manual Review"
                                : "Immediate Release"}
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              {gradingArchitecture.releaseMode === "manual"
                                ? "Open questions prevent immediate final release."
                                : "All current questions are auto-gradable."}
                            </p>
                          </div>
                          <div className="p-4 rounded-xl border bg-muted/5 space-y-2">
                            <div className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">
                              Rubric Readiness
                            </div>
                            <div className="text-base font-bold text-foreground">
                              {gradingArchitecture.rubricRequired
                                ? "Required"
                                : "Optional"}
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              {gradingArchitecture.rubricRequired
                                ? "Analytic rubrics should be defined for open-ended questions."
                                : "Current question mix does not require guided review."}
                            </p>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {blueprint.map((sec) => (
                    <div key={sec.id} className="space-y-6">
                      <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-lg border">
                        <Badge className="font-bold px-3">{sec.section}</Badge>
                        <span className="text-sm font-semibold">
                          {sec.topics || "General Topics"}
                        </span>
                      </div>

                      <div className="space-y-6">
                        <GroupQuestionEditor
                          groups={groups.map((g) => ({
                            id: g.id,
                            name: g.name,
                            memberCount: g.members.length,
                          }))}
                          totalMarks={sec.marks}
                          getGroupMarks={(gId) =>
                            questions
                              .filter(
                                (q) => q.sectionId === sec.id && q.groupId === gId,
                              )
                              .reduce((sum, q) => sum + q.marks, 0)
                          }
                          renderQuestionEditor={(gId) => (
                            <div className="space-y-6">
                              {questions
                                .filter(
                                  (q) =>
                                    q.sectionId === sec.id &&
                                    q.groupId === gId,
                                )
                                .map((q, idx) => (
                                  <QuestionCard
                                    key={q.id}
                                    question={q}
                                    index={idx}
                                    allowedTypes={sec.allowedTypes}
                                    onUpdate={(u) => updateQuestion(q.id, u)}
                                    onDelete={() => removeQuestion(q.id)}
                                    onSaveToBank={() => handleSaveToBank(q)}
                                    onUpdateOption={(oi, u) =>
                                      updateOption(q.id, oi, u)
                                    }
                                    onAddOption={() => addOption(q.id)}
                                    onRemoveOption={(oi) =>
                                      removeOption(q.id, oi)
                                    }
                                  />
                                ))}
                              <Button
                                variant="outline"
                                className="w-full h-12 border-dashed flex items-center justify-center gap-2"
                                onClick={() => addQuestion(sec.id, gId)}
                              >
                                <Plus className="size-4" /> Add Question to{" "}
                                {groups.find((g) => g.id === gId)?.name}
                              </Button>
                            </div>
                          )}
                        />
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="groups" className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                    <div className="md:col-span-4 space-y-6">
                      <Card className="shadow-none border">
                        <CardHeader>
                          <CardTitle className="text-base">
                            Import Students
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <GroupCsvImport
                            assessmentId={draftId || undefined}
                            onImport={(members) => {
                              // Logic to auto-create groups or assign to list
                              toast.success(
                                `Imported ${members.length} students`,
                              );
                            }}
                          />
                        </CardContent>
                      </Card>
                    </div>
                    <div className="md:col-span-8">
                      <GroupBuilderDnd
                        courseId={metadata.course_id}
                        initialGroups={groups}
                        maxGroupSize={metadata.max_group_size}
                        onSave={setGroups}
                      />
                    </div>
                  </div>
                </TabsContent>

                <div className="flex justify-between mt-12 pt-8 border-t border-dashed">
                  <Button variant="ghost" onClick={() => setActiveStep(2)}>
                    Back to Blueprint
                  </Button>
                  <Button
                    size="lg"
                    onClick={() => setActiveStep(4)}
                    className="h-11 px-10 rounded-md font-semibold"
                  >
                    Review & Finalize <ChevronRight className="ml-2 size-4" />
                  </Button>
                </div>
              </Tabs>
            ) : (
              <div className="space-y-8 max-w-4xl mx-auto">
                <div className="flex items-center justify-between sticky top-16 z-40 bg-background/95 backdrop-blur-md py-3 border-b border-dashed">
                  <div className="flex items-center gap-6">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">
                        Progress
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xl font-bold text-primary">
                          {questions.length}
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">
                          / {totalQuestions} questions
                        </span>
                      </div>
                    </div>
                    <div className="w-px h-8 bg-muted" />
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">
                        Marks
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-xl font-bold",
                            currentMarks === totalMarks
                              ? "text-emerald-600"
                              : "text-red-600",
                          )}
                        >
                          {currentMarks}
                        </span>{" "}
                        <span className="text-sm font-medium text-muted-foreground">
                          / {totalMarks} allocated
                        </span>
                      </div>
                    </div>
                  </div>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold uppercase tracking-wider rounded-lg border-primary/20 text-primary hover:bg-primary/5 shadow-none">
                        <Info className="mr-2 size-3.5" />
                        Grading Logic
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[600px] p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
                        <div className="bg-muted/10 border-b p-5">
                            <h4 className="text-sm font-bold uppercase tracking-widest">Grading Architecture</h4>
                            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                Mindexa will automatically grade deterministic closed questions and route open-ended responses through lecturer review. AI-assisted review will plug into this same control model later without replacing lecturer authority.
                            </p>
                        </div>
                        <div className="p-4 grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl border bg-muted/5 space-y-2">
                                <div className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Closed Questions</div>
                                <div className="text-2xl font-bold text-emerald-600 tabular-nums">{gradingArchitecture.closedQuestions}</div>
                                <p className="text-[10px] text-muted-foreground leading-tight">MCQ, True/False, Matching, Fill-in-the-Blank, Ordering</p>
                            </div>
                            <div className="p-4 rounded-xl border bg-muted/5 space-y-2">
                                <div className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Open Questions</div>
                                <div className="text-2xl font-bold text-amber-600 tabular-nums">{gradingArchitecture.openQuestions}</div>
                                <p className="text-[10px] text-muted-foreground leading-tight">Short Answer, Essay, Case Study, Computational Reasoning</p>
                            </div>
                            <div className="p-4 rounded-xl border bg-muted/5 space-y-2">
                                <div className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Release Mode</div>
                                <div className="text-base font-bold text-foreground">{gradingArchitecture.releaseMode === "manual" ? "Manual Review" : "Immediate Release"}</div>
                                <p className="text-[10px] text-muted-foreground leading-tight">
                                    {gradingArchitecture.releaseMode === "manual" ? "Open questions prevent immediate final release." : "All current questions are auto-gradable."}
                                </p>
                            </div>
                            <div className="p-4 rounded-xl border bg-muted/5 space-y-2">
                                <div className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Rubric Readiness</div>
                                <div className="text-base font-bold text-foreground">{gradingArchitecture.rubricRequired ? "Required" : "Optional"}</div>
                                <p className="text-[10px] text-muted-foreground leading-tight">
                                    {gradingArchitecture.rubricRequired ? "Analytic rubrics should be defined for open-ended questions." : "Current question mix does not require guided review."}
                                </p>
                            </div>
                        </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {blueprint.map((sec) => (
                  <div key={sec.id} className="space-y-6">
                    <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-lg border">
                      <Badge className="font-bold px-3">{sec.section}</Badge>
                      <div className="flex-1">
                        <span className="text-sm font-semibold block">
                          {sec.topics || "General Topics"}
                        </span>
                        <span className="text-[11px] text-muted-foreground uppercase font-bold">
                          {sec.marks} Marks Target
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold block">
                          {questions
                            .filter((q) => q.sectionId === sec.id)
                            .reduce((s, q) => s + q.marks, 0)}{" "}
                          / {sec.marks} Marks
                        </span>
                      </div>
                    </div>

                    <div className="space-y-6">
                      {questions
                        .filter((q) => q.sectionId === sec.id)
                        .map((q, idx) => (
                          <QuestionCard
                            key={q.id}
                            question={q}
                            index={idx}
                            allowedTypes={sec.allowedTypes}
                            onUpdate={(u) => updateQuestion(q.id, u)}
                            onDelete={() => removeQuestion(q.id)}
                            onSaveToBank={() => handleSaveToBank(q)}
                            onUpdateOption={(oi, u) =>
                              updateOption(q.id, oi, u)
                            }
                            onAddOption={() => addOption(q.id)}
                            onRemoveOption={(oi) => removeOption(q.id, oi)}
                          />
                        ))}
                      <div className="flex gap-4">
                        <Button
                          variant="outline"
                          className="flex-1 h-20 border-2 border-dashed hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col gap-1.5"
                          onClick={() => addQuestion(sec.id)}
                        >
                          <Plus className="size-5 text-primary" />
                          <span className="font-bold uppercase text-[10px] tracking-wider">
                            Add Manually
                          </span>
                        </Button>
                        <QuestionBankSelector
                          selectedIds={questions.map((q) => q.id)}
                          onSelect={(q) => handleBankSelect(q, sec.id)}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex justify-between mt-12 pt-8 border-t border-dashed">
                  <Button variant="ghost" onClick={() => setActiveStep(2)}>
                    Back to Blueprint
                  </Button>
                  <Button
                    size="lg"
                    onClick={() => setActiveStep(4)}
                    className="h-11 px-10 rounded-md font-semibold"
                  >
                    Review & Finalize <ChevronRight className="ml-2 size-4" />
                  </Button>
                </div>
              </div>
            )}
          </StepperContent>

          {/* STEP 4: REVIEW */}
          <StepperContent value={4}>
            <div className="max-w-4xl mx-auto space-y-8">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">
                  {metadata.title || "Untitled Assessment"}
                </h2>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CalendarIcon className="size-4" />{" "}
                    {metadata.date ? format(metadata.date, "PPP") : "TBD"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-4" />{" "}
                    {formatDisplayTime(metadata.startTime)} -{" "}
                    {formatDisplayTime(metadata.endTime)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="size-4" /> {metadata.mode}
                  </span>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-8">
                  {blueprint.map((sec) => (
                    <div key={sec.id} className="space-y-6">
                      <div className="flex justify-between items-center border-b pb-2">
                        <h3 className="font-bold text-xl">{sec.section}</h3>
                        <Badge variant="outline">{sec.marks} Marks</Badge>
                      </div>
                      <div className="space-y-6">
                        {questions
                          .filter((q) => q.sectionId === sec.id)
                          .map((q, i) => (
                            <ReviewQuestionCard
                              key={q.id}
                              question={q}
                              index={i}
                            />
                          ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-6">
                  <Card className="shadow-none border sticky top-20">
                    <CardHeader className="py-4 border-b">
                      <CardTitle className="text-sm uppercase font-bold tracking-wider">
                        Exam Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Total Questions
                          </span>
                          <span
                            className={cn(
                              "font-bold",
                              questions.length !== totalQuestions &&
                                "text-destructive",
                            )}
                          >
                            {questions.length} / {totalQuestions}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Total Marks
                          </span>
                          <span
                            className={cn(
                              "font-bold",
                              currentMarks !== totalMarks && "text-destructive",
                            )}
                          >
                            {currentMarks} / {totalMarks}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Closed / Open Mix
                          </span>
                          <span className="font-bold">
                            {gradingArchitecture.closedQuestions} / {gradingArchitecture.openQuestions}
                          </span>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-2 text-xs">
                        <p className="font-bold uppercase text-muted-foreground">
                          Grading Path
                        </p>
                        <div className="rounded-lg border bg-muted/30 p-3 leading-relaxed">
                          Closed questions will be graded automatically. Open-ended responses stay in lecturer review and align with rubric-based moderation in the later AI-assisted phase.
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-2 text-xs">
                        <p className="font-bold uppercase text-muted-foreground">
                          Policy Checklist
                        </p>
                        <div className="grid gap-1.5">
                          <div className="flex items-center gap-2">
                            {rules.supervised ? (
                              <Check className="size-3 text-emerald-500" />
                            ) : (
                              <X className="size-3 text-muted-foreground" />
                            )}
                            <span>Proctored Exam</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {rules.browserRestricted ? (
                              <Check className="size-3 text-emerald-500" />
                            ) : (
                              <X className="size-3 text-muted-foreground" />
                            )}
                            <span>Safe Browser Forced</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {rules.resultRelease === "immediate" ? (
                              <Check className="size-3 text-emerald-500" />
                            ) : (
                              <Clock className="size-3 text-amber-500" />
                            )}
                            <span>
                              {rules.resultRelease === "immediate"
                                ? "Immediate Results"
                                : "Manual Review"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="flex justify-between mt-12 pt-8 border-t border-dashed">
                <Button variant="ghost" onClick={() => setActiveStep(3)}>
                  Back to Questions
                </Button>
                <Button
                  size="lg"
                  onClick={() => setActiveStep(5)}
                  className="h-11 px-10 rounded-md font-semibold"
                >
                  Final Confirmation <ChevronRight className="ml-2 size-4" />
                </Button>
              </div>
            </div>
          </StepperContent>

          {/* STEP 5: FINALIZE */}
          <StepperContent value={5}>
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-8">
              <div className="max-w-md space-y-4">
                <h2 className="text-3xl font-bold tracking-tight">
                  Ready to Publish?
                </h2>
                <p className="text-muted-foreground">
                  Your assessment is fully configured and ready for students.
                  Scheduled for{" "}
                  <strong>
                    {metadata.date ? format(metadata.date, "PPP") : "TBD"}
                  </strong>
                  .
                </p>
                <div className="p-4 bg-muted/50 rounded-lg text-sm space-y-1">
                  <p>
                    <strong>Window:</strong>{" "}
                    {formatDisplayTime(metadata.startTime)} -{" "}
                    {formatDisplayTime(metadata.endTime)}
                  </p>
                  <p>
                    <strong>Mode:</strong> {metadata.mode} •{" "}
                    <strong>Review:</strong> {rules.resultRelease}
                  </p>
                  <p>
                    <strong>Closed / Open:</strong> {gradingArchitecture.closedQuestions} / {gradingArchitecture.openQuestions}
                  </p>
                  <p className="text-muted-foreground">
                    {gradingArchitecture.hasOpenQuestions
                      ? "Open-ended responses will require lecturer review now and can adopt rubric-guided AI suggestions later."
                      : "This assessment is currently compatible with full automatic grading."}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <Button
                  size="lg"
                  className="h-12 text-base font-semibold"
                  onClick={handlePublish}
                  disabled={isPublishing}
                >
                  {isPublishing ? "Publishing..." : "Publish Assessment"}
                </Button>
                <Button variant="ghost" onClick={() => setActiveStep(4)}>
                  Review Again
                </Button>
              </div>
            </div>
          </StepperContent>
        </StepperPanel>
      </Stepper>
    </div>
  );
}
