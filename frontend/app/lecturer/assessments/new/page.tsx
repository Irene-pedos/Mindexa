// app/lecturer/assessments/new/page.tsx
"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
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
  AlertTriangle,
  Image as ImageIcon,
  Loader2 as LoaderCircleIcon,
  Calendar as CalendarIcon,
  Users,
  Upload,
  BookOpen,
} from "lucide-react";
import Image from "next/image";
import { format } from "date-fns";

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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiClient } from "@/lib/api/client";
import { questionApi } from "@/lib/api/question";
import { assessmentApi } from "@/lib/api/assessment";
import { authApi } from "@/lib/api/auth";
import { academicApi } from "@/lib/api/academic";
import { aiGenerationApi } from "@/lib/api/ai-generation";
import {
  lecturerApi,
  AdminCourseListItem,
  InstitutionResponse,
  DepartmentResponse,
  OptionResponse,
  ClassGroupResponse,
  AcademicPeriodResponse,
  UserResponse,
  WorkspaceListItem,
  WorkspaceDetail,
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
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

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

const QUESTION_TYPE_LABELS: Record<string, string> = {
  mcq: "Multiple Choice",
  truefalse: "True / False",
  shortanswer: "Short Answer",
  essay: "Essay",
  matching: "Matching",
  ordering: "Ordering",
  fillblank: "Fill-in-the-Blank",
  computational: "Computational",
  casestudy: "Case Study",
};

interface QuestionOption {
  id?: string;
  option_text: string;
  option_text_right?: string;
  is_correct: boolean;
  order_index: number;
  match_key?: string;
}

interface BlueprintSection {
  id: string;
  section: string;
  topics: string;
  instructions?: string;
  marks: number;
  questions: number;
  difficulty: Difficulty;
  allowedTypes: QuestionType[];
  difficultyDistribution?: {
    easy: number;
    medium: number;
    hard: number;
  };
  aiPromptHint?: string;
  bloomLevel?:
    | "remember"
    | "understand"
    | "apply"
    | "analyze"
    | "evaluate"
    | "create";
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
  is_required: boolean;
  wordLimit?: number;
  rubric?: string;
  solutionSteps?: string;
  tolerance?: number;
  shuffleOptions?: boolean;
  caseSensitive?: boolean;
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

function SortableQuestionItem({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
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
    zIndex: isDragging ? 20 : 1,
    position: "relative" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group transition-all",
        isDragging && "opacity-50 shadow-md",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="absolute -left-2 top-8 p-1 cursor-grab active:cursor-grabbing text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity z-30 bg-background border rounded shadow-sm"
        title="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}

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
        isDragging && "shadow-lg border-primary/50 z-10",
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
    }),
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = itemsWithIds.findIndex((x) => x._dndId === active.id);
      const newIndex = itemsWithIds.findIndex((x) => x._dndId === over.id);

      const newOptions = arrayMove(options, oldIndex, newIndex);
      const sortedOptions = newOptions.map((opt, i) => ({
        ...opt,
        order_index: i,
      }));
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
          items={itemsWithIds.map((x) => x._dndId)}
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
        isDragging && "shadow-lg border-primary/50 z-10",
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
    return options.map((opt, i) => ({
      ...opt,
      _dndId: opt.id || `match-${i}`,
    }));
  }, [options]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = itemsWithIds.findIndex((x) => x._dndId === active.id);
      const newIndex = itemsWithIds.findIndex((x) => x._dndId === over.id);

      const newOptions = arrayMove(options, oldIndex, newIndex);
      const sortedOptions = newOptions.map((opt, i) => ({
        ...opt,
        order_index: i,
      }));
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
          items={itemsWithIds.map((x) => x._dndId)}
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
  const [showMediaUpload, setShowMediaUpload] = useState(!!question.imageUrl);
  const [isUploading, setIsUploading] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image too large. Max 5MB.");
        return;
      }
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await apiClient("/questions/upload-image", {
          method: "POST",
          body: formData,
        }) as any;
        if (res && res.url) {
          onUpdate({ imageUrl: res.url });
          toast.success("Image uploaded successfully.");
        } else {
          toast.error("Failed to upload image.");
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to upload image.");
      } finally {
        setIsUploading(false);
      }
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
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {QUESTION_TYPE_LABELS[t] || t}
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
                value={question.marks === 0 ? "" : question.marks}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdate({ marks: val === "" ? "" as any : parseInt(val) || 0 });
                }}
              />
            </div>
            <div className="flex items-center gap-1 border-l pl-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowMediaUpload(!showMediaUpload)}
                className={cn(
                  "h-8 w-8",
                  showMediaUpload
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground",
                )}
                title="Add Media / Diagram"
                aria-label="Add Media / Diagram"
              >
                <ImageIcon className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onSaveToBank}
                className="text-primary hover:bg-primary/5 h-8 w-8"
                title="Save to Bank"
                aria-label="Save to Bank"
              >
                <Database className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/5 h-8 w-8"
                title="Delete Question"
                aria-label="Delete Question"
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
              className="min-h-25 text-base"
            />
            {question.type === "fillblank" && (
              <div className="space-y-1 mt-1">
                <p className="text-[11px] text-primary font-medium">
                  Tip: Use <strong>[blank]</strong> to indicate where students
                  should type their answers.
                </p>
                {(!question.text || !question.text.includes("[blank]")) && (
                  <p className="text-[11px] text-destructive font-semibold flex items-center gap-1">
                    ⚠️ Missing &quot;[blank]&quot; placeholder in question text.
                  </p>
                )}
              </div>
            )}
          </div>

          {showMediaUpload && (
            <div className="space-y-2 p-4 border rounded-lg bg-muted/20 animate-in fade-in slide-in-from-top-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <ImageIcon className="size-4" /> Question Media (Optional)
              </Label>
              {question.imageUrl ? (
                <div className="relative inline-block border rounded-lg p-2 bg-background group">
                  <Image
                    src={question.imageUrl || "/placeholder.png"}
                    alt="Diagram"
                    width={800}
                    height={600}
                    unoptimized
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
                  <label className="flex items-center gap-2 px-4 h-9 rounded-md border border-dashed cursor-pointer hover:bg-background transition-colors bg-background/50">
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
          )}
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
                  Numerical Answer / Final Output
                </Label>
                <Input
                  placeholder="e.g. 42.5"
                  className="h-9 bg-background text-sm font-semibold"
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-primary">
                  Solution Steps / Grading Guidance
                </Label>
                <Textarea
                  placeholder="Describe the mathematical proof or step-by-step solution steps..."
                  className="min-h-20 bg-background text-sm"
                  value={question.solutionSteps || ""}
                  onChange={(e) => onUpdate({ solutionSteps: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-primary">
                  Tolerance (Optional)
                </Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="e.g. 0.01"
                  className="h-9 bg-background text-sm"
                  value={question.tolerance || ""}
                  onChange={(e) =>
                    onUpdate({
                      tolerance: parseFloat(e.target.value) || undefined,
                    })
                  }
                />
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Allowed deviation margin (+/-) for auto grading validation
                </p>
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
                className="min-h-30 bg-background text-sm leading-relaxed"
                value={question.caseStudyContext || ""}
                onChange={(e) => onUpdate({ caseStudyContext: e.target.value })}
              />
            </div>
            <div className="space-y-4 pt-4 border-t border-amber-200">
              <Label className="text-sm font-semibold text-amber-950">
                Sub-Questions
              </Label>
              <div className="space-y-3">
                {question.options.map((opt, oIdx) => (
                  <div
                    key={oIdx}
                    className="space-y-2 p-3 border rounded-md bg-background"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-muted-foreground">
                        Sub-Question #{oIdx + 1}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemoveOption(oIdx)}
                        className="text-destructive h-8 w-8"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Input
                        value={opt.option_text || ""}
                        onChange={(e) =>
                          onUpdateOption(oIdx, { option_text: e.target.value })
                        }
                        placeholder="Sub-question text..."
                        className="h-8 text-xs"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                           <Input
                            type="number"
                            value={opt.match_key !== undefined && opt.match_key !== null ? opt.match_key : "5"}
                            onChange={(e) => {
                              const val = e.target.value;
                              const nextOptions = question.options.map((o, idx) =>
                                idx === oIdx ? { ...o, match_key: val } : o
                              );
                              const nextMarks = nextOptions.reduce((sum, o) => sum + (parseInt(o.match_key !== undefined && o.match_key !== null ? o.match_key : "5") || 0), 0);
                              onUpdate({ options: nextOptions, marks: nextMarks });
                            }}
                            placeholder="Marks"
                            className="h-8 text-xs text-center"
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            value={opt.option_text_right || ""}
                            onChange={(e) =>
                              onUpdateOption(oIdx, {
                                option_text_right: e.target.value,
                              })
                            }
                            placeholder="Answer Guidance..."
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const nextIdx = question.options.length;
                    const newOpt = {
                      option_text: "",
                      option_text_right: "",
                      is_correct: true,
                      order_index: nextIdx,
                      match_key: "5", // default sub-question marks
                    };
                    const nextOptions = [...question.options, newOpt];
                    const nextMarks = nextOptions.reduce((sum, o) => sum + (parseInt(o.match_key !== undefined && o.match_key !== null ? o.match_key : "5") || 0), 0);
                    onUpdate({ options: nextOptions, marks: nextMarks });
                  }}
                  className="h-8 text-[11px] border-amber-300 text-amber-900 hover:bg-amber-50"
                >
                  <Plus className="size-3 mr-2" /> Add Sub-Question
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Answer Options Editors */}
        {question.type === "mcq" && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <Label className="text-sm font-semibold">
              Options (Select at least one correct option)
            </Label>
            <div className="space-y-2">
              {question.options.map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-3">
                  <Checkbox
                    checked={opt.is_correct}
                    onCheckedChange={(checked) =>
                      onUpdateOption(oIdx, { is_correct: !!checked })
                    }
                  />
                  <Input
                    value={opt.option_text || ""}
                    onChange={(e) =>
                      onUpdateOption(oIdx, { option_text: e.target.value })
                    }
                    className="h-9"
                    placeholder={`Option ${oIdx + 1}`}
                  />
                  {question.options.length > 2 && (
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
            </div>
            {(() => {
              const correctCount = question.options.filter((o) => o.is_correct).length;
              return (
                <div className="space-y-1">
                  {correctCount === 0 && (
                    <p className="text-[11px] text-destructive font-semibold">
                      ⚠️ Warning: No options are marked as correct.
                    </p>
                  )}
                  {correctCount > 1 && (
                    <p className="text-[11px] text-amber-600 font-semibold">
                      ⚠️ Warning: Multiple options are marked as correct.
                    </p>
                  )}
                </div>
              );
            })()}
            {question.options.length < 8 && (
              <Button variant="outline" size="sm" onClick={onAddOption}>
                <Plus className="size-3 mr-2" /> Add Option
              </Button>
            )}
          </div>
        )}

        {question.type === "truefalse" && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <Label className="text-sm font-semibold">
              Select the correct option
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
                  />
                </div>
              ))}
            </RadioGroup>
          </div>
        )}

        {question.type === "matching" && (
          <LecturerMatchingList
            options={question.options}
            onUpdateOptions={(newOptions) => onUpdate({ options: newOptions })}
            onAddOption={onAddOption}
            onUpdateOptionLeft={(idx, val) =>
              onUpdateOption(idx, { option_text: val })
            }
            onUpdateOptionRight={(idx, val) =>
              onUpdateOption(idx, { option_text_right: val })
            }
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
              {(() => {
                const blankMatches = (question.text || "").match(/\[blank\]/g);
                const expectedBlanksCount = blankMatches ? blankMatches.length : 0;
                const blankTargetsCount = question.options.filter((o) => o.is_correct).length;
                if (expectedBlanksCount !== blankTargetsCount) {
                  return (
                    <p className="text-[11px] text-amber-600 font-semibold">
                      ⚠️ Warning: Question text has {expectedBlanksCount} &quot;[blank]&quot; placeholder(s), but you have defined {blankTargetsCount} blank target(s).
                    </p>
                  );
                }
                return null;
              })()}
              <div className="space-y-2">
                {question.options
                  .filter((o) => o.is_correct)
                  .map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-emerald-700 border-emerald-200"
                      >
                        #{oIdx + 1}
                      </Badge>
                      <Input
                        value={opt.option_text || ""}
                        onChange={(e) => {
                          const correctIndices = question.options
                            .map((o, i) => (o.is_correct ? i : -1))
                            .filter((i) => i !== -1);
                          const actualIdx = correctIndices[oIdx];
                          onUpdateOption(actualIdx, {
                            option_text: e.target.value,
                          });
                        }}
                        className="flex-1 h-9"
                        placeholder="Correct Answer"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const correctIndices = question.options
                            .map((o, i) => (o.is_correct ? i : -1))
                            .filter((i) => i !== -1);
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
                    const newOptions = [
                      ...question.options,
                      {
                        option_text: "",
                        is_correct: true,
                        order_index: question.options.length,
                      },
                    ];
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
              <p className="text-[11px] text-muted-foreground">
                These will appear in the student&apos;s pool but are not correct
                for any blank.
              </p>
              <div className="space-y-2">
                {question.options
                  .filter((o) => !o.is_correct)
                  .map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-3">
                      <div className="size-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold opacity-40">
                        D
                      </div>
                      <Input
                        value={opt.option_text || ""}
                        onChange={(e) => {
                          const distractorIndices = question.options
                            .map((o, i) => (!o.is_correct ? i : -1))
                            .filter((i) => i !== -1);
                          const actualIdx = distractorIndices[oIdx];
                          onUpdateOption(actualIdx, {
                            option_text: e.target.value,
                          });
                        }}
                        className="flex-1 h-9"
                        placeholder="Distractor Text"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const distractorIndices = question.options
                            .map((o, i) => (!o.is_correct ? i : -1))
                            .filter((i) => i !== -1);
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
                    const newOptions = [
                      ...question.options,
                      {
                        option_text: "",
                        is_correct: false,
                        order_index: question.options.length,
                      },
                    ];
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
            onUpdateOptionText={(idx, val) =>
              onUpdateOption(idx, { option_text: val })
            }
            onRemoveOption={onRemoveOption}
          />
        )}

        {question.type === "shortanswer" && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-xs text-primary font-semibold flex items-center gap-2 mb-1">
                <BrainCircuit className="size-4" /> Short Answer Evaluation
              </p>
              <p className="text-xs text-muted-foreground">
                Students will be provided with a text input. AI will use the
                model answer below for grading guidance.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Model Answer / Explanation
              </Label>
              <Textarea
                placeholder="Define the model answer for grading guidance..."
                className="min-h-25 text-sm"
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
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Rubric Selector (Optional)
              </Label>
              <Select
                value={question.rubric || "none"}
                onValueChange={(val) => onUpdate({ rubric: val })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    None (Direct score matching)
                  </SelectItem>
                  <SelectItem value="general">
                    General Short Answer Rubric
                  </SelectItem>
                  <SelectItem value="technical">
                    Technical Definition Rubric
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {question.type === "essay" && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/10">
              <p className="text-xs text-amber-700 font-semibold flex items-center gap-2 mb-1">
                <BrainCircuit className="size-4" /> Essay Evaluation
              </p>
              <p className="text-xs text-muted-foreground">
                Students will write an essay response. A grading rubric is
                required.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Grading Guidance / Model Answer
              </Label>
              <Textarea
                placeholder="Provide grading guidance or key points to look for in the essay..."
                className="min-h-25 text-sm"
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Word Limit (Optional)
                </Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 500 words"
                  value={question.wordLimit || ""}
                  onChange={(e) =>
                    onUpdate({
                      wordLimit: parseInt(e.target.value) || undefined,
                    })
                  }
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Rubric Selector <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={question.rubric || "general_essay"}
                  onValueChange={(val) => onUpdate({ rubric: val })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general_essay">
                      General Essay Rubric (Analytic)
                    </SelectItem>
                    <SelectItem value="critical_thinking">
                      Critical Thinking & Analysis Rubric
                    </SelectItem>
                    <SelectItem value="scientific_writing">
                      Scientific/Research Paper Rubric
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
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
                <Image
                  src={question.imageUrl || "/placeholder.png"}
                  alt="Diagram"
                  width={800}
                  height={600}
                  unoptimized
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
              {QUESTION_TYPE_LABELS[question.type] || question.type}
            </Badge>
            <Badge variant="outline" className="h-5 text-[10px] font-medium">
              {question.marks} Marks
            </Badge>
            {question.aiGenerated && (
              <Badge variant="secondary" className="h-5 text-[10px] bg-purple-50 text-purple-700 border-purple-200 gap-1 font-bold">
                <BrainCircuit className="size-3" /> AI Generated
              </Badge>
            )}
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

            {((question.type as string) === "fillblank" ||
              (question.type as string) === "fill_blank") && (
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

const parseInstructions = (instructionStr: string | null | undefined) => {
  const defaultPresets = [
    "Fullscreen required",
    "No tab switching",
    "No external materials allowed",
    "Time strictly enforced",
  ];
  if (!instructionStr) {
    return { selectedInstructions: defaultPresets, customInstructions: "" };
  }

  const marker = "\n\nAdditional Instructions:\n";
  if (instructionStr.includes(marker)) {
    const parts = instructionStr.split(marker);
    const selected = parts[0] ? parts[0].split("\n").filter(Boolean) : [];
    const custom = parts[1] || "";
    return { selectedInstructions: selected, customInstructions: custom };
  }

  const lines = instructionStr.split("\n");
  const selected: string[] = [];
  const customLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (defaultPresets.includes(trimmed)) {
      selected.push(trimmed);
    } else if (trimmed) {
      customLines.push(line);
    }
  }
  return {
    selectedInstructions: selected,
    customInstructions: customLines.join("\n"),
  };
};

const parseOpenEndedExplanation = (type: string, explanation: string) => {
  let rubric = "";
  let wordLimit = 0;
  let solutionSteps = "";
  let tolerance = 0;
  let modelAnswer = explanation || "";

  if (!explanation) {
    return { modelAnswer, rubric, wordLimit, solutionSteps, tolerance };
  }

  // Normalize newlines to \n to ease regex matching
  const cleanExp = explanation.replaceAll("\r\n", "\n").trim();

  if (type === "essay") {
    const modelMatch = cleanExp.match(/(?:Model Answer:|^)\s*([\s\S]*?)(?=\n+Rubric:|\n+Word Limit:|$)/i);
    const rubricMatch = cleanExp.match(/\n+Rubric:\s*([\s\S]*?)(?=\n+Word Limit:|$)/i);
    const wordLimitMatch = cleanExp.match(/\n+Word Limit:\s*(\d+)/i);

    if (modelMatch) modelAnswer = modelMatch[1].trim();
    if (rubricMatch) rubric = rubricMatch[1].trim();
    if (wordLimitMatch) wordLimit = parseInt(wordLimitMatch[1]);
  } else if (type === "shortanswer") {
    const modelMatch = cleanExp.match(/(?:Model Answer:|^)\s*([\s\S]*?)(?=\n+Rubric:|$)/i);
    const rubricMatch = cleanExp.match(/\n+Rubric:\s*([\s\S]*?)$/i);

    if (modelMatch) modelAnswer = modelMatch[1].trim();
    if (rubricMatch) rubric = rubricMatch[1].trim();
  } else if (type === "computational") {
    const stepsMatch = cleanExp.match(/(?:Solution Steps:|^)\s*([\s\S]*?)(?=\n+Numerical Answer:|\n+Tolerance:|$)/i);
    const answerMatch = cleanExp.match(/\n+Numerical Answer:\s*([\s\S]*?)(?=\n+Tolerance:|$)/i);
    const toleranceMatch = cleanExp.match(/\n+Tolerance:\s*([\d.]+)/i);

    if (stepsMatch) solutionSteps = stepsMatch[1].trim();
    if (answerMatch) modelAnswer = answerMatch[1].trim();
    if (toleranceMatch) tolerance = parseFloat(toleranceMatch[1]);
  }

  return { modelAnswer, rubric, wordLimit, solutionSteps, tolerance };
};

const mapFrontendToBackendType = (type: string): string => {
  if (type === "truefalse") return "true_false";
  if (type === "shortanswer") return "short_answer";
  if (type === "fillblank") return "fill_blank";
  if (type === "casestudy") return "case_study";
  return type;
};

const mapBackendToFrontendType = (type: string): QuestionType => {
  const norm = (type || "").toLowerCase().replaceAll("_", "");
  if (norm === "truefalse") return "truefalse";
  if (norm === "shortanswer") return "shortanswer";
  if (norm === "fillblank") return "fillblank";
  if (norm === "casestudy" || norm === "casestudycontext" || norm === "case_study") return "casestudy";
  return norm as QuestionType;
};

const mapCandidateToQuestion = (
  candidate: any,
  targetSecId: string,
  marksPerQuestion: number,
  explanationOverride?: string,
  questionTextOverride?: string,
  optionsOverride?: any[]
): Question => {
  const qType = mapBackendToFrontendType(candidate.question_type) || "shortanswer";
  const text = questionTextOverride !== undefined ? questionTextOverride : (candidate.parsed_question_text || "");
  const explanation = explanationOverride !== undefined ? explanationOverride : (candidate.parsed_explanation || candidate.explanation || "");

  let rubric = "";
  let wordLimit: number | undefined;
  let solutionSteps = "";
  let tolerance: number | undefined;
  let caseStudyContext = "";
  let mappedOptions = optionsOverride !== undefined
    ? optionsOverride.map((o: any, idx: number) => ({
        option_text: o.text || o.option_text || "",
        option_text_right: o.option_text_right || o.explanation || "",
        is_correct: o.is_correct,
        order_index: qType === "casestudy" ? idx : (o.order_index !== undefined ? o.order_index : idx),
        match_key: qType === "casestudy" ? String(o.match_key !== undefined && o.match_key !== null ? o.match_key : "5") : o.match_key,
      }))
    : ((candidate.options || candidate._options || []).map((o: any, idx: number) => ({
        option_text: o.text || o.option_text || "",
        option_text_right: o.option_text_right || o.explanation || "",
        is_correct: o.is_correct,
        order_index: qType === "casestudy" ? idx : (o.order_index !== undefined ? o.order_index : idx),
        match_key: qType === "casestudy" ? String(o.match_key !== undefined && o.match_key !== null ? o.match_key : "5") : o.match_key,
      })));

  if (["essay", "shortanswer", "computational"].includes(qType) && explanation) {
    const unpacked = parseOpenEndedExplanation(qType, explanation);
    
    const rubricValue = unpacked.rubric.toLowerCase();
    let selectedRubric = "general_essay";
    if (qType === "shortanswer") {
      selectedRubric = "general_short";
      if (rubricValue.includes("technical") || rubricValue.includes("definition")) {
        selectedRubric = "technical_definition";
      }
    } else if (qType === "essay") {
      if (rubricValue.includes("critical") || rubricValue.includes("analysis")) {
        selectedRubric = "critical_thinking";
      } else if (rubricValue.includes("scientific") || rubricValue.includes("research") || rubricValue.includes("paper") || rubricValue.includes("writing")) {
        selectedRubric = "scientific_writing";
      } else if (rubricValue.includes("technical") || rubricValue.includes("definition")) {
        selectedRubric = "technical_definition";
      }
    }
    
    rubric = selectedRubric;
    wordLimit = unpacked.wordLimit;
    solutionSteps = unpacked.solutionSteps;
    tolerance = unpacked.tolerance;
    mappedOptions = [
      {
        option_text: unpacked.modelAnswer || explanation,
        is_correct: true,
        order_index: 0
      }
    ];
  } else if (qType === "casestudy") {
    caseStudyContext = text;
    const shortText = explanation || "Analyze the following case scenario and answer the sub-questions:";
    const computedMarks = mappedOptions.reduce((sum: number, o: QuestionOption) => sum + (parseInt(o.match_key || "5") || 0), 0);
    return {
      id: candidate.promoted_question_id || candidate.id,
      sectionId: targetSecId,
      text: shortText,
      type: qType as any,
      marks: computedMarks,
      options: mappedOptions,
      aiGenerated: true,
      is_required: true,
      caseStudyContext,
    };
  }

  return {
    id: candidate.promoted_question_id || candidate.id,
    sectionId: targetSecId,
    text,
    type: qType as any,
    marks: marksPerQuestion,
    options: mappedOptions,
    aiGenerated: true,
    is_required: true,
    rubric,
    wordLimit,
    solutionSteps,
    tolerance,
  };
};

// --- MAIN BUILDER ---

const STEPS_DATA = [
  { title: "Identity", icon: FileText },
  { title: "Proctoring & Rules", icon: Shield },
  { title: "Target Audience", icon: Users },
  { title: "Blueprint", icon: Layout },
  { title: "Questions & Bank", icon: BrainCircuit },
  { title: "Review & Publish", icon: CheckCircle2 },
];

export default function NewAssessmentBuilder() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const draftId = searchParams.get("draft");
  const draftIdRef = useRef<string | null>(draftId);
  if (draftId !== draftIdRef.current) {
    draftIdRef.current = draftId;
  }

  const activeAutosavePromiseRef = useRef<Promise<any>>(Promise.resolve());
  const hasInitializedRef = useRef(false);
  const loadedDraftIdRef = useRef<string | null>(null);

  const [activeStep, setActiveStep] = useState(1);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [autosaveStatus, setAutosaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [selectedWorkspaceDetail, setSelectedWorkspaceDetail] =
    useState<WorkspaceDetail | null>(null);
  const [isLoadingWorkspaceDetail, setIsLoadingWorkspaceDetail] =
    useState(false);
  const [periods, setPeriods] = useState<AcademicPeriodResponse[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [supervisorList, setSupervisorList] = useState<
    { id: string; name: string; role: "PRIMARY" | "ASSISTANT" | "OBSERVER" }[]
  >([]);
  const [pendingRole, setPendingRole] = useState<"ASSISTANT" | "OBSERVER">("ASSISTANT");
  const [studentSearch, setStudentSearch] = useState("");

  const filteredRoster = useMemo(() => {
    const roster = selectedWorkspaceDetail?.roster || [];
    if (!studentSearch) return roster;
    const searchLower = studentSearch.toLowerCase();
    return roster.filter((student) => {
      return (
        (student.name &&
          student.name.toLowerCase().includes(searchLower)) ||
        (student.email &&
          student.email.toLowerCase().includes(searchLower)) ||
        (student.student_id &&
          student.student_id.toLowerCase().includes(searchLower))
      );
    });
  }, [selectedWorkspaceDetail?.roster, studentSearch]);

  // Step 4 AI Generation configs
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerationConfig, setAiGenerationConfig] = useState({
    topic: "",
    question_type: "mcq",
    difficulty: "medium",
    bloom_level: "understand",
    count: 5,
    additional_context: "",
    easyPercent: 30,
    mediumPercent: 40,
    hardPercent: 30,
  });
  const [aiReviewDrawerOpen, setAiReviewDrawerOpen] = useState(false);
  const [aiCandidates, setAiCandidates] = useState<any[]>([]);
  const [aiTargetSectionId, setAiTargetSectionId] = useState<string>("all");
  const [aiBatchId, setAiBatchId] = useState<string | null>(null);
  const [aiFailedSectionIds, setAiFailedSectionIds] = useState<string[]>([]);

  // Load and save AI config to/from sessionStorage
  const loadSavedAiConfig = useCallback((targetSectionId: string, defaults: typeof aiGenerationConfig) => {
    if (draftIdRef.current) {
      const saved = sessionStorage.getItem(`aiGenerationConfig_${draftIdRef.current}_${targetSectionId}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return defaults;
        }
      }
    }
    return defaults;
  }, []);

  useEffect(() => {
    if (draftIdRef.current && aiTargetSectionId) {
      sessionStorage.setItem(
        `aiGenerationConfig_${draftIdRef.current}_${aiTargetSectionId}`,
        JSON.stringify(aiGenerationConfig)
      );
    }
  }, [aiGenerationConfig, aiTargetSectionId]);

  // Step 6 validation & distribution report
  const [validationResult, setValidationResult] = useState<any>(null);
  const [distributionData, setDistributionData] = useState<any>(null);
  const [lecturerConfirmed, setLecturerConfirmedState] = useState(false);

  const setLecturerConfirmed = (val: boolean) => {
    setLecturerConfirmedState(val);
    if (draftIdRef.current) {
      sessionStorage.setItem(`lecturerConfirmed_${draftIdRef.current}`, String(val));
    }
  };

  useEffect(() => {
    if (draftIdRef.current) {
      const saved = sessionStorage.getItem(`lecturerConfirmed_${draftIdRef.current}`);
      setLecturerConfirmedState(saved === "true");
    } else {
      setLecturerConfirmedState(false);
    }
  }, [activeStep]);



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
    instructions: "", // student-facing instructions shown before assessment starts
    grading_mode: "AUTO" as "AUTO" | "MANUAL" | "AI_ASSISTED" | "HYBRID",
    result_release_mode: "MANUAL" as "IMMEDIATE" | "MANUAL" | "SCHEDULED",
    total_marks: "" as any, // overall assessment total marks
    is_group_assessment: false, // explicit group assessment flag
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
    startTime: "",
    endTime: "",
    durationMinutes: "" as any,
    passing_marks: "" as any,
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
    audience_type: "all" as "all" | "selected",
    target_student_ids: [] as string[],
  });

  const loadWorkspaceDetail = useCallback(async (workspaceId: string) => {
    if (!workspaceId) {
      setSelectedWorkspaceDetail(null);
      return;
    }
    setIsLoadingWorkspaceDetail(true);
    try {
      const detail = await lecturerApi.getWorkspaceDetail(workspaceId);
      setSelectedWorkspaceDetail(detail);

      setMetadata((prev) => ({
        ...prev,
        teaching_workspace_id: workspaceId,
        course_id: workspaceId,
        academic_year: detail.academic_year || prev.academic_year,
      }));
    } catch (err) {
      console.error("Failed to load workspace detail:", err);
    } finally {
      setIsLoadingWorkspaceDetail(false);
    }
  }, []);

  const [groups, setGroups] = useState<Group[]>([]);
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
      marks: "" as any,
      questions: "" as any,
      difficulty: "Medium",
      allowedTypes: ["mcq", "truefalse", "matching"],
      bloomLevel: "understand",
    },
  ]);

  const [rules, setRules] = useState({
    openBook: false,
    supervised: true,
    aiAllowed: false,
    browserRestricted: true,
    integrityMonitoring: true, // integrity_monitoring_enabled
    lateSubmissionAllowed: false, // late_submission_allowed
    shuffleQuestions: true,
    shuffleOptions: true,
    resultRelease: "manual" as "immediate" | "manual" | "scheduled",
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
  const [saveToBank, setSaveToBank] = useState(false);
  const [isReviewApplying, setIsReviewApplying] = useState(false);

  const metadataRef = useRef(metadata);
  const rulesRef = useRef(rules);
  const blueprintRef = useRef(blueprint);
  const questionsRef = useRef(questions);
  const activeStepRef = useRef(activeStep);
  const supervisorListRef = useRef(supervisorList);
  const loadWorkspaceDetailRef = useRef(loadWorkspaceDetail);
  const isReviewApplyingRef = useRef(isReviewApplying);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Synchronously update all refs in the render phase to prevent stale state reads
  metadataRef.current = metadata;
  rulesRef.current = rules;
  blueprintRef.current = blueprint;
  questionsRef.current = questions;
  activeStepRef.current = activeStep;
  supervisorListRef.current = supervisorList;
  loadWorkspaceDetailRef.current = loadWorkspaceDetail;
  isReviewApplyingRef.current = isReviewApplying;

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  // Derived

  const triggerStep6Load = useCallback(async () => {
    const activeId = draftIdRef.current;
    if (!activeId) return;
    try {
      const [valRes, distRes] = await Promise.all([
        apiClient(`/blueprint/${activeId}/validate`),
        apiClient(`/blueprint/${activeId}/distribution`),
      ]);
      setValidationResult(valRes);
      setDistributionData(distRes);
    } catch (e) {
      console.error("Failed to load step 6 reports:", e);
    }
  }, []);

  const totalMarks = useMemo(
    () =>
      blueprint.reduce((sum, s) => sum + (parseInt(s.marks as any) || 0), 0),
    [blueprint],
  );

  const windowDuration = useMemo(() => {
    if (!metadata.startTime || !metadata.endTime) return 0;
    try {
      const [sh, sm] = metadata.startTime.split(":").map(Number);
      const [eh, em] = metadata.endTime.split(":").map(Number);
      let diff = eh * 60 + em - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60; // Handle over midnight
      return diff;
    } catch (e) {
      return 0;
    }
  }, [metadata.startTime, metadata.endTime]);
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

  const [availableLecturers, setAvailableLecturers] = useState<UserResponse[]>(
    [],
  );
  const [passingMarksPercent, setPassingMarksPercent] = useState(70);

  // Logic: Passing Marks calculation & Auto-sync total_marks
  useEffect(() => {
    setMetadata((prev) => {
      const newTotal = totalMarks;
      const newPassing = Math.floor((totalMarks * passingMarksPercent) / 100);
      if (prev.total_marks !== newTotal || prev.passing_marks !== newPassing) {
        return {
          ...prev,
          total_marks: newTotal,
          passing_marks: newPassing,
        };
      }
      return prev;
    });
  }, [totalMarks, passingMarksPercent]);

  // Init Data
  useEffect(() => {
    if (hasInitializedRef.current && draftId === loadedDraftIdRef.current) {
      return;
    }
    hasInitializedRef.current = true;
    loadedDraftIdRef.current = draftId;
    draftIdRef.current = draftId || null;

    async function init() {
      try {
        const [workspaceRes, instRes, periodRes, lectRes, userRes] =
          await Promise.all([
            lecturerApi.getWorkspaces(),
            lecturerApi.getMyInstitutions(),
            lecturerApi.getPeriods(),
            lecturerApi.getLecturers(),
            authApi.getCurrentUser(),
          ]);
        setWorkspaces(workspaceRes);
        setInstitutions(instRes);
        setPeriods(periodRes);
        setAvailableLecturers(lectRes);
        setCurrentUser(userRes);

        // Default supervisor list with logged-in user
        setSupervisorList([
          {
            id: userRes.id,
            name: `${userRes.first_name} ${userRes.last_name}`,
            role: "PRIMARY",
          },
        ]);

        if (instRes.length === 1) handleInstitutionChange(instRes[0].id);

        if (periodRes.length > 0) {
          setMetadata((prev) => ({
            ...prev,
            academic_year: periodRes[0].name,
          }));
        }

        // Load draft if ID exists
        if (draftId) {
          setIsLoadingDraft(true);
          try {
            const data = await assessmentApi.getAssessmentById(draftId);

            // Populate metadata
            const parsedInst = parseInstructions(data.instructions);
            setMetadata({
              title: data.title || "",
              description: data.description || "",
              mode: (() => {
                const type = data.assessment_type;
                if (type === "GROUP_WORK") return "Groupwork";
                if (type === "CAT") return "CAT";
                if (!type) return "CAT";
                const normalized =
                  type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
                const validModes = [
                  "Practice",
                  "Formative",
                  "Homework",
                  "Summative",
                ];
                return (
                  validModes.includes(normalized) ? normalized : type
                ) as AssessmentMode;
              })(),
              instructions: data.instructions || "",
              grading_mode: (data.grading_mode || "AUTO") as
                | "AUTO"
                | "MANUAL"
                | "AI_ASSISTED"
                | "HYBRID",
              result_release_mode: (data.result_release_mode || "MANUAL") as
                | "IMMEDIATE"
                | "MANUAL"
                | "SCHEDULED",
              total_marks: data.total_marks || "",
              is_group_assessment:
                data.is_group_assessment ||
                data.assessment_type === "GROUP_WORK" ||
                false,
              institution_id: data.institution_id || "",
              course_id: data.course_id || "",
              teaching_workspace_id: data.teaching_workspace_id || "",
              department_ids:
                data.target_sections
                  ?.map((ts: any) => ts.department_id)
                  .filter(Boolean) || [],
              option_ids:
                data.target_sections
                  ?.map((ts: any) => ts.option_id)
                  .filter(Boolean) || [],
              class_group_ids:
                data.target_sections
                  ?.map((ts: any) => ts.class_group_id)
                  .filter(Boolean) || [],
              academic_year: data.academic_year || "",
              academic_period_id: data.academic_period_id || "",
              date: data.window_start ? new Date(data.window_start) : undefined,
              startTime: data.window_start
                ? format(new Date(data.window_start), "HH:mm")
                : "09:00",
              endTime: data.window_end
                ? format(new Date(data.window_end), "HH:mm")
                : "11:00",
              durationMinutes: data.duration_minutes || 120,
              passing_marks: data.passing_marks || 70,
              selectedInstructions: parsedInst.selectedInstructions,
              customInstructions: parsedInst.customInstructions,
              max_group_size: data.max_group_size || 4,
              group_formation_mode: data.group_formation_mode || "self_enrol",
              group_assignment_mode: data.group_assignment_mode || "AUTOMATIC",
              question_distribution_mode:
                data.question_distribution_mode || "SHARED",
              require_all_member_approval:
                data.require_all_member_approval || false,
              require_all_member_participation:
                data.require_all_member_participation || false,
              appeal_window_days: data.appeal_window_days || 7,
              audience_type: data.audience_type || "all",
              target_student_ids: data.target_student_ids || [],
            });

            const initialTotal = data.total_marks || 0;
            const initialPassing = data.passing_marks || 70;
            const initialPct = initialTotal > 0 ? Math.round((initialPassing * 100) / initialTotal) : 70;
            setPassingMarksPercent(initialPct);

            if (data.teaching_workspace_id) {
              loadWorkspaceDetailRef.current(data.teaching_workspace_id);
            }

            // Populate blueprint
            if (data.sections?.length > 0) {
              const sortedSections = [...data.sections].sort(
                (a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)
              );
              setBlueprint(
                sortedSections.map((s: any) => ({
                  id: s.id,
                  section: s.title,
                  topics: s.description || "",
                  marks: s.allocated_marks || 0,
                  questions: s.question_count_target || 0,
                  difficulty: (() => {
                    const diff = s.allowed_question_types?.difficulty || s.difficulty || "Medium";
                    return diff.charAt(0).toUpperCase() + diff.slice(1).toLowerCase();
                  })(),
                  allowedTypes: (s.allowed_question_types?.types || ["mcq"]).map((t: string) =>
                    t.toLowerCase().replaceAll("_", "")
                  ),
                  aiPromptHint: s.ai_generation_prompt_hint || "",
                  difficultyDistribution:
                    s.difficulty_distribution || undefined,
                  bloomLevel:
                    s.allowed_question_types?.bloom_level ||
                    s.allowed_question_types?.bloomLevel ||
                    s.bloom_level ||
                    s.bloomLevel ||
                    "understand",
                })),
              );
            }

            // Populate rules
            setRules({
              openBook: data.is_open_book || false,
              supervised: data.is_supervised || false,
              aiAllowed: data.ai_assistance_allowed || false,
              browserRestricted: data.fullscreen_required || false,
              integrityMonitoring: data.integrity_monitoring_enabled ?? true,
              lateSubmissionAllowed: data.late_submission_allowed || false,
              shuffleQuestions: data.randomise_questions || false,
              shuffleOptions: data.randomise_options || false,
              resultRelease:
                data.result_release_mode?.toLowerCase() || "manual",
              resultReleaseAt: data.result_release_at
                ? new Date(data.result_release_at)
                : undefined,
              attempts: data.max_attempts || 1,
              passwordProtected: data.is_password_protected || false,
              accessPassword: "",
              latePenaltyPercent: data.late_penalty_percent || 0,
              gracePeriodMinutes: data.grace_period_minutes || 0,
              autosaveToken: data.autosave_token || crypto.randomUUID(),
              supervisor_ids:
                data.supervisors?.map((s: any) => s.supervisor_id) || [],
            });

            // Map supervisor list with names from lectRes
            if (data.supervisors && data.supervisors.length > 0) {
              const sups = data.supervisors.map((s: any) => {
                const lect = lectRes.find((l: any) => l.id === s.supervisor_id);
                return {
                  id: s.supervisor_id,
                  name: lect
                    ? `${lect.profile?.first_name || ""} ${lect.profile?.last_name || ""}`
                    : `Lecturer ${s.supervisor_id.substring(0, 5)}`,
                  role: (s.supervisor_role || "ASSISTANT") as
                    | "PRIMARY"
                    | "ASSISTANT"
                    | "OBSERVER",
                };
              });
              setSupervisorList(sups);
            }

            // Populate questions
            if (data.assessment_questions?.length > 0) {
              const sortedQuestions = [...data.assessment_questions].sort(
                (a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)
              );
              setQuestions(
                sortedQuestions.map((aq: any) => {
                  const qType = aq.question.question_type
                    .toLowerCase()
                    .replaceAll("_", "") as QuestionType;
                  const rawContent = aq.question.explanation || aq.question.options?.[0]?.option_text || aq.question.options?.[0]?.content || "";
                  const parsed = ["shortanswer", "essay", "computational"].includes(qType)
                    ? parseOpenEndedExplanation(qType, rawContent)
                    : null;
                  return {
                    id: aq.question.id,
                    sectionId: aq.assessment_section_id,
                    groupId: aq.group_id,
                    text: aq.question.content,
                    imageUrl: aq.question.image_url,
                    type: qType,
                    marks: aq.marks_override || aq.question.marks,
                    options: parsed
                      ? [
                          {
                            id: aq.question.options?.[0]?.id,
                            option_text: parsed.modelAnswer,
                            option_text_right: "",
                            is_correct: true,
                            order_index: 0,
                          },
                        ]
                      : aq.question.options?.map((o: any) => ({
                          id: o.id,
                          option_text: o.option_text || o.content || "",
                          option_text_right: o.option_text_right || o.match_value || "",
                          is_correct: o.is_correct,
                          order_index: o.order_index,
                          match_key: o.match_key,
                        })) || [],
                    rubric: parsed?.rubric,
                    wordLimit: parsed?.wordLimit,
                    solutionSteps: parsed?.solutionSteps,
                    tolerance: parsed?.tolerance,
                    computationalType: aq.question.computational_type,
                    caseStudyContext: aq.question.case_study_context,
                    aiGenerated: aq.added_via === "ai_generated",
                    is_required: aq.is_required ?? true,
                  };
                }),
              );
            }

            if (data.draft_step) setActiveStep(data.draft_step);
          } catch (err) {
            toast.error("Failed to load draft assessment.");
          } finally {
            setIsLoadingDraft(false);
          }
        }
      } catch (err) {
        toast.error("Failed to initialize builder.");
      } finally {
        setIsLoadingWorkspaces(false);
        setFetchingMetadata(false);
      }
    }
    init();
  }, [draftId]);

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

  // Logic: Result Release Mode (auto-suggest based on question mix)
  useEffect(() => {
    if (rules.resultRelease === "scheduled") return;
    const hasOpen = questions.some((q) =>
      ["essay", "shortanswer", "computational", "casestudy"].includes(q.type),
    );
    const suggested = hasOpen ? "manual" : "immediate";
    if (rules.resultRelease !== suggested) {
      setRules((prev) => ({
        ...prev,
        resultRelease: suggested,
      }));
    }
  }, [questions, rules.resultRelease]);

  // Unsaved changes beforeunload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasPendingSave = debouncedAutosaveRef.current !== null;
      const isSaving = autosaveStatus === "saving";
      if (hasPendingSave || isSaving) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [autosaveStatus]);

  // Smart defaults: supervised → force fullscreen ON and AI OFF;
  // CAT/Summative mode → default AI to OFF regardless of toggle
  useEffect(() => {
    setRules((prev) => {
      const isHighStakes =
        metadata.mode === "CAT" || metadata.mode === "Summative";
      return {
        ...prev,
        aiAllowed: prev.supervised
          ? false
          : isHighStakes
            ? false
            : prev.aiAllowed,
        browserRestricted: prev.supervised ? true : prev.browserRestricted,
      };
    });
  }, [rules.supervised, metadata.mode]);

  // Handlers
  const updateBlueprintAndAutosave = (nextBlueprint: BlueprintSection[], nextQuestions?: Question[]) => {
    setBlueprint(nextBlueprint);
    blueprintRef.current = nextBlueprint;
    if (nextQuestions) {
      setQuestions(nextQuestions);
      questionsRef.current = nextQuestions;
    }
    triggerDebouncedAutosave(4, undefined, undefined, nextQuestions);
  };

  const addSection = () => {
    const nextLetter = String.fromCharCode(65 + blueprint.length);
    const nextBlueprint = [
      ...blueprint,
      {
        id: `sec-${Date.now()}`,
        section: `Section ${nextLetter}`,
        topics: "",
        marks: "" as any,
        questions: "" as any,
        difficulty: "Medium" as any,
        allowedTypes: ["mcq" as any],
        bloomLevel: "understand" as any,
      },
    ];
    updateBlueprintAndAutosave(nextBlueprint);
  };

  const updateSection = <K extends keyof BlueprintSection>(
    id: string,
    field: K,
    value: BlueprintSection[K],
  ) => {
    const nextBlueprint = blueprint.map((s) => (s.id === id ? { ...s, [field]: value } : s));
    updateBlueprintAndAutosave(nextBlueprint);
  };

  const removeSection = (id: string) => {
    if (blueprint.length === 1) return;
    const nextBlueprint = blueprint.filter((s) => s.id !== id);
    const nextQuestions = questions.filter((q) => q.sectionId !== id);
    updateBlueprintAndAutosave(nextBlueprint, nextQuestions);
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

    const nextQuestions = [
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
        is_required: true,
      },
    ];
    updateQuestionsAndAutosave(nextQuestions);
  };

  const updateQuestionsAndAutosave = (nextQuestions: Question[]) => {
    setQuestions(nextQuestions);
    triggerDebouncedAutosave(5, undefined, undefined, nextQuestions);
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    const nextQuestions = questions.map((q) =>
      q.id === id ? { ...q, ...updates } : q,
    );
    updateQuestionsAndAutosave(nextQuestions);
  };

  const removeQuestion = (id: string) => {
    const questionToRestore = questions.find((q) => q.id === id);
    if (!questionToRestore) return;

    const originalQuestions = [...questions];
    const nextQuestions = questions.filter((q) => q.id !== id);
    updateQuestionsAndAutosave(nextQuestions);

    toast("Question deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          updateQuestionsAndAutosave(originalQuestions);
        },
      },
    });
  };

  const updateOption = (
    qId: string,
    optIdx: number,
    updates: Partial<QuestionOption>,
  ) => {
    const nextQuestions = questions.map((q) => {
      if (q.id !== qId) return q;
      const newOptions = [...q.options];
      newOptions[optIdx] = { ...newOptions[optIdx], ...updates };
      let nextMarks = q.marks;
      if (q.type === "casestudy") {
        nextMarks = newOptions.reduce((sum, o) => sum + (parseInt(o.match_key !== undefined && o.match_key !== null ? o.match_key : "5") || 0), 0);
      }
      return { ...q, options: newOptions, marks: nextMarks };
    });
    updateQuestionsAndAutosave(nextQuestions);
  };

  const addOption = (qId: string) => {
    const nextQuestions = questions.map((q) => {
      if (q.id !== qId) return q;
      const newOptions = [
        ...q.options,
        {
          option_text: `New Item`,
          is_correct: q.type === "casestudy" ? true : false,
          order_index: q.options.length,
          match_key: q.type === "casestudy" ? "5" : undefined,
        },
      ];
      let nextMarks = q.marks;
      if (q.type === "casestudy") {
        nextMarks = newOptions.reduce((sum, o) => sum + (parseInt(o.match_key !== undefined && o.match_key !== null ? o.match_key : "5") || 0), 0);
      }
      return { ...q, options: newOptions, marks: nextMarks };
    });
    updateQuestionsAndAutosave(nextQuestions);
  };

  const removeOption = (qId: string, optIdx: number) => {
    const nextQuestions = questions.map((q) => {
      if (q.id !== qId) return q;
      const newOptions = q.options
        .filter((_, i) => i !== optIdx)
        .map((opt, i) => ({ ...opt, order_index: i }));
      let nextMarks = q.marks;
      if (q.type === "casestudy") {
        nextMarks = newOptions.reduce((sum, o) => sum + (parseInt(o.match_key !== undefined && o.match_key !== null ? o.match_key : "5") || 0), 0);
      }
      return { ...q, options: newOptions, marks: nextMarks };
    });
    updateQuestionsAndAutosave(nextQuestions);
  };



  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(
    null,
  );
  const [editingText, setEditingText] = useState("");
  const [editingExplanation, setEditingExplanation] = useState("");
  const [editingOptions, setEditingOptions] = useState<any[]>([]);

  const buildBlueprintConstraints = (
    blueprintList: BlueprintSection[],
    questionsList: Question[],
  ) => {
    return blueprintList
      .map((s, idx) => {
        const existingCount = questionsList.filter(
          (q) => q.sectionId === s.id,
        ).length;
        const allowedTypesStr = s.allowedTypes.join(", ");
        return `Section ${idx + 1} (${s.section || `Section ${String.fromCharCode(65 + idx)}`}):
- Topic: ${s.topics || "General"}
- Target Questions Count: ${s.questions}
- Target Total Marks: ${s.marks}
- Difficulty: ${s.difficulty || "Medium"}
- Bloom Level: ${s.bloomLevel || "understand"}
- Allowed Types: [${allowedTypesStr}]
- Existing accepted question count: ${existingCount}`;
      })
      .join("\n\n");
  };

  const pollBatchStatus = useCallback(
    (batchId: string, currentTick = 0, targetSectionId: string) => {
      const maxTicks = 60; // 120 seconds max (2s interval)
      if (currentTick >= maxTicks) {
        setAiGenerating(false);
        toast.error("AI question generation timed out. Please try again.");
        return;
      }

      pollTimeoutRef.current = setTimeout(async () => {
        try {
          const batch = await aiGenerationApi.getBatch(batchId);
          const status = batch.status?.toLowerCase();

          if (status === "completed" || status === "partial_failure") {
            const generatedQuestions = batch.questions || [];
            if (generatedQuestions.length === 0) {
              setAiGenerating(false);
              toast.error(
                "AI finished, but zero questions were successfully generated. Please check constraints.",
              );
              return;
            }

            const tagged = generatedQuestions.map((q) => ({
              ...q,
              _options: q.options || q._options || [],
              _sectionId:
                q.target_section_id ||
                (targetSectionId === "all" ? undefined : targetSectionId),
            }));

            // Validate candidates structurally before showing them
            const discardedReasonMap: Record<string, string[]> = {};
            const validCandidatesList = tagged.filter(
              (cand: any, cIdx: number) => {
                const sec =
                  targetSectionId !== "all"
                    ? blueprint.find((s) => s.id === targetSectionId)
                    : blueprint.find(
                        (s) =>
                          s.id === (cand.target_section_id || cand._sectionId),
                      );

                if (!sec) {
                  discardedReasonMap[cand.id || `candidate-${cIdx}`] = [
                    "Could not associate candidate with any section in the blueprint.",
                  ];
                  return false;
                }

                const reasons: string[] = [];
                const bType = cand.question_type;

                // 1. Type matches target section allowedTypes
                const normalizedBackType = bType
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, "");
                const isTypeAllowed = sec.allowedTypes.some(
                  (ft) =>
                    ft.toLowerCase().replace(/[^a-z0-9]/g, "") ===
                    normalizedBackType,
                );
                if (!isTypeAllowed) {
                  reasons.push(
                    `Type '${bType}' is not allowed for section '${sec.section}' (Allowed: ${sec.allowedTypes.join(", ")})`,
                  );
                }

                // 2. Options exist for MCQ/TF/matching/ordering
                if (
                  [
                    "mcq",
                    "true_false",
                    "truefalse",
                    "matching",
                    "ordering",
                  ].includes(normalizedBackType)
                ) {
                  if (!cand._options || cand._options.length < 2) {
                    reasons.push(
                      `Missing or insufficient choices/options for question type '${bType}' (Found: ${cand._options?.length || 0})`,
                    );
                  }
                }

                // 3. Open-ended explanation format validation
                if (
                  ["shortanswer", "short_answer", "essay"].includes(
                    normalizedBackType,
                  )
                ) {
                  const explanationText =
                    cand.parsed_explanation || cand.explanation || "";
                  if (!explanationText.trim()) {
                    reasons.push(
                      "Open-ended question has an empty explanation/model answer.",
                    );
                  } else if (
                    !explanationText.toLowerCase().includes("model answer")
                  ) {
                    reasons.push(
                      "Explanation does not start with or contain 'Model Answer:' required format.",
                    );
                  }
                }

                if (reasons.length > 0) {
                  discardedReasonMap[cand.id || `candidate-${cIdx}`] = reasons;
                  return false;
                }
                return true;
              },
            );

            const discardedCount = tagged.length - validCandidatesList.length;
            if (discardedCount > 0) {
              console.warn(
                "Discarded invalid AI candidates:",
                discardedReasonMap,
              );
              toast.warning(
                `Filtered out ${discardedCount} generated question candidates due to schema or option validation failures.`,
              );
            }

            if (validCandidatesList.length === 0) {
              setAiGenerating(false);
              toast.error(
                "AI finished, but all generated candidates failed structural validation.",
              );
              return;
            }

            // Alert user if the count differs from target constraints
            if (targetSectionId === "all") {
              blueprint.forEach((sec) => {
                const targetCount = sec.questions || 3;
                const sectionSecId = sec.id;
                const sectionGeneratedCount = validCandidatesList.filter(
                  (c: any) =>
                    (c.target_section_id ||
                    c._sectionId ||
                    targetSectionId === "all"
                      ? c._sectionId || c.target_section_id
                      : targetSectionId) === sectionSecId,
                ).length;
                if (sectionGeneratedCount !== targetCount) {
                  toast.warning(
                    `Section '${sec.section}' received ${sectionGeneratedCount} valid question(s), but requested ${targetCount}.`,
                  );
                }
              });
            } else {
              const sec = blueprint.find((s) => s.id === targetSectionId);
              const targetCount = sec ? sec.questions || 3 : 3;
              if (validCandidatesList.length !== targetCount) {
                toast.warning(
                  `Section '${sec?.section || "Target"}' received ${validCandidatesList.length} valid question(s), but requested ${targetCount}.`,
                );
              }
            }

            setAiCandidates((prev) => {
              const newSectionIds = new Set(
                validCandidatesList.map((q) => q._sectionId).filter(Boolean),
              );
              const filteredPrev = prev.filter(
                (q) => !q._sectionId || !newSectionIds.has(q._sectionId),
              );
              return [...filteredPrev, ...validCandidatesList];
            });
            setAiGenerating(false);
            setAiDrawerOpen(false);
            setAiReviewDrawerOpen(true);

            if (status === "partial_failure") {
              const totalReq = batch.total_requested || 0;
              const totalGen = batch.total_generated || 0;
              const totalFail = batch.total_failed || 0;
              toast.warning(
                `AI question generation partially succeeded: ${totalGen} generated, ${totalFail} failed out of ${totalReq} requested. You can review the successfully generated candidates and retry the remaining ones.`,
                { duration: 8000 }
              );
            }

            if (targetSectionId === "all") {
              const generatedSectionIds = new Set(
                validCandidatesList
                  .map((q) => q.target_section_id || q._sectionId)
                  .filter(Boolean),
              );
              const failedIds = blueprint
                .map((s) => s.id)
                .filter((id) => !generatedSectionIds.has(id));
              setAiFailedSectionIds(failedIds);
              if (failedIds.length > 0) {
                toast.warning(
                  `Generation partially completed. ${failedIds.length} out of ${blueprint.length} sections failed.`,
                );
              } else if (status !== "partial_failure") {
                toast.success(
                  `AI generated ${validCandidatesList.length} valid question candidates!`,
                );
              }
            } else {
              setAiFailedSectionIds([]);
              if (status !== "partial_failure") {
                toast.success(
                  `AI generated ${validCandidatesList.length} valid question candidates!`,
                );
              }
            }
          } else if (status === "failed") {
            setAiGenerating(false);
            toast.error(
              batch.error_message || "AI question generation failed on server.",
            );
          } else {
            // Continue polling
            pollBatchStatus(batchId, currentTick + 1, targetSectionId);
          }
        } catch (err) {
          console.error("Polling batch failed:", err);
          // Continue polling despite small errors
          pollBatchStatus(batchId, currentTick + 1, targetSectionId);
        }
      }, 2000);
    },
    [blueprint],
  );

  const handleAIGenerate = async () => {
    setAiGenerating(true);
    try {
      if (aiTargetSectionId === "all") {
        const sectionsPayload: any[] = [];
        // Use blueprintRef.current so we always read the latest synced state
        // (ensureDraftId may have updated blueprint via setBlueprint before the
        // component re-rendered, so the closure-captured `blueprint` could still
        // have old temp IDs).
        blueprintRef.current.forEach((sec) => {
          const allowedTypes = sec.allowedTypes && sec.allowedTypes.length > 0 ? sec.allowedTypes : ["mcq"];
          const totalQuestions = sec.questions || 3;
          
          const base = Math.floor(totalQuestions / allowedTypes.length);
          let remainder = totalQuestions % allowedTypes.length;
          
          allowedTypes.forEach((qType) => {
            const countForType = base + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;
            
            if (countForType > 0) {
              sectionsPayload.push({
                section_id: sec.id,
                topic: sec.topics || "General Topic",
                question_type: mapFrontendToBackendType(qType) as any,
                difficulty: sec.difficulty.toLowerCase() as any,
                count: countForType,
                bloom_level: (sec.bloomLevel || "understand") as any,
              });
            }
          });
        });

        const activeId = draftIdRef.current;
        const firstSec = blueprintRef.current[0];
        const firstType = firstSec?.allowedTypes?.[0] || "mcq";
        const topLevelType = mapFrontendToBackendType(firstType);
        const topLevelDifficulty = (firstSec?.difficulty || "medium").toLowerCase();
        const totalCount = blueprintRef.current.reduce((sum, s) => sum + (s.questions || 3), 0);

        toast.info(
          "Submitting AI request to generate questions for all sections...",
        );
        const res = await aiGenerationApi.generateQuestions({
          subject: metadata.title || "Subject",
          topic: "Multiple Topics (Blueprint-aligned)",
          question_type: topLevelType as any,
          difficulty: topLevelDifficulty as any,
          count: totalCount,
          additional_context: aiGenerationConfig.additional_context,
          target_assessment_id: activeId || undefined,
          workspace_id: metadata.teaching_workspace_id || undefined,
          sections: sectionsPayload,
          blueprint_constraints: buildBlueprintConstraints(
            blueprintRef.current,
            questionsRef.current,
          ),
        });

        setAiBatchId(res.id);
        pollBatchStatus(res.id, 0, "all");
      } else {
        // Synchronize AI drawer config back to the selected blueprint section so it's persisted in the draft
        setBlueprint((prev) =>
          prev.map((s) =>
            s.id === aiTargetSectionId
              ? {
                  ...s,
                  topics: aiGenerationConfig.topic,
                  difficulty: (aiGenerationConfig.difficulty
                    .charAt(0)
                    .toUpperCase() +
                    aiGenerationConfig.difficulty.slice(1)) as any,
                  questions: aiGenerationConfig.count,
                  bloomLevel: aiGenerationConfig.bloom_level as any,
                  aiPromptHint: aiGenerationConfig.additional_context,
                  allowedTypes: s.allowedTypes,
                }
              : s,
          ),
        );
        setTimeout(() => runAutosave(4), 0);

        // Use blueprintRef.current for the same reason — may have been updated by ensureDraftId
        const targetSection = blueprintRef.current.find((s) => s.id === aiTargetSectionId);
        const secTopic =
          aiGenerationConfig.topic || targetSection?.topics || "";

        const activeId = draftIdRef.current;

        let sectionsPayload: any[] | undefined = undefined;
        if (aiGenerationConfig.question_type === "mixed") {
          const allowedTypes = targetSection && targetSection.allowedTypes && targetSection.allowedTypes.length > 0
            ? targetSection.allowedTypes
            : ["mcq"];
          const totalQuestions = aiGenerationConfig.count;
          
          const base = Math.floor(totalQuestions / allowedTypes.length);
          let remainder = totalQuestions % allowedTypes.length;
          
          sectionsPayload = [];
          allowedTypes.forEach((qType) => {
            const countForType = base + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;
            
            if (countForType > 0) {
              sectionsPayload!.push({
                section_id: aiTargetSectionId,
                topic: secTopic,
                question_type: mapFrontendToBackendType(qType) as any,
                difficulty: aiGenerationConfig.difficulty as any,
                count: countForType,
                bloom_level: aiGenerationConfig.bloom_level as any,
              });
            }
          });
        }

        const res = await aiGenerationApi.generateQuestions({
          subject: metadata.title || "Subject",
          topic: secTopic,
          question_type: aiGenerationConfig.question_type === "mixed"
            ? "mcq"
            : (mapFrontendToBackendType(aiGenerationConfig.question_type) as any),
          difficulty: aiGenerationConfig.difficulty as any,
          count: aiGenerationConfig.count,
          bloom_level: aiGenerationConfig.bloom_level as any,
          additional_context: aiGenerationConfig.additional_context,
          target_assessment_id: activeId || undefined,
          target_section_id: aiTargetSectionId,
          workspace_id: metadata.teaching_workspace_id || undefined,
          sections: sectionsPayload,
          blueprint_constraints: buildBlueprintConstraints(
            blueprintRef.current,
            questionsRef.current,
          ),
        });

        setAiBatchId(res.id);
        pollBatchStatus(res.id, 0, aiTargetSectionId);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate questions with AI.");
      setAiGenerating(false);
    }
  };

  const handleRetryFailedSections = async () => {
    setAiGenerating(true);
    try {
      const failedSections = blueprint.filter((sec) =>
        aiFailedSectionIds.includes(sec.id),
      );
      const sectionsPayload: any[] = [];
      failedSections.forEach((sec) => {
        const allowedTypes = sec.allowedTypes && sec.allowedTypes.length > 0 ? sec.allowedTypes : ["mcq"];
        const totalQuestions = sec.questions || 3;
        
        const base = Math.floor(totalQuestions / allowedTypes.length);
        let remainder = totalQuestions % allowedTypes.length;
        
        allowedTypes.forEach((qType) => {
          const countForType = base + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder--;
          
          if (countForType > 0) {
            sectionsPayload.push({
              section_id: sec.id,
              topic: sec.topics || "General Topic",
              question_type: mapFrontendToBackendType(qType) as any,
              difficulty: sec.difficulty.toLowerCase() as any,
              count: countForType,
              bloom_level: (sec.bloomLevel || "understand") as any,
            });
          }
        });
      });

      const activeId = draftIdRef.current;
      const firstSec = failedSections[0] || blueprint[0];
      const firstType = firstSec?.allowedTypes?.[0] || "mcq";
      const topLevelType = mapFrontendToBackendType(firstType);
      const topLevelDifficulty = (firstSec?.difficulty || "medium").toLowerCase();
      const totalCount = failedSections.reduce((sum, s) => sum + (s.questions || 3), 0);

      toast.info(
        `Retrying question generation for ${failedSections.length} sections...`,
      );
      const res = await aiGenerationApi.generateQuestions({
        subject: metadata.title || "Subject",
        topic: "Multiple Topics (Blueprint-aligned)",
        question_type: topLevelType as any,
        difficulty: topLevelDifficulty as any,
        count: totalCount,
        additional_context: aiGenerationConfig.additional_context,
        target_assessment_id: activeId || undefined,
        workspace_id: metadata.teaching_workspace_id || undefined,
        sections: sectionsPayload,
        blueprint_constraints: buildBlueprintConstraints(blueprint, questions),
      });

      setAiBatchId(res.id);
      pollBatchStatus(res.id, 0, "all");
    } catch (err: any) {
      toast.error(err.message || "Failed to retry generation.");
      setAiGenerating(false);
    }
  };

  const handleAcceptCandidate = async (candidateId: string) => {
    const candidate = aiCandidates.find((c) => c.id === candidateId);
    if (!candidate) return;

    setIsReviewApplying(true);
    isReviewApplyingRef.current = true;
    let nextQuestions: Question[] = [];

    const action = async () => {
      const activeId = draftIdRef.current;
      const targetSecId =
        (candidate as any)._sectionId ||
        (aiTargetSectionId === "all" ? blueprint[0].id : aiTargetSectionId);

      // Calculate marks per question using questionsRef.current to avoid stale closures
      const sectionObj = blueprint.find((s) => s.id === targetSecId);
      let marksPerQuestion = 2;
      if (sectionObj) {
        const sectionQuestions = questionsRef.current.filter(
          (q) => q.sectionId === targetSecId,
        );
        const allocatedMarks = sectionQuestions.reduce(
          (sum, q) => sum + (q.marks || 0),
          0,
        );
        const totalSectionMarks = parseInt(sectionObj.marks as any) || 0;
        const targetQuestionCount =
          parseInt(sectionObj.questions as any) || 1;
        const remainingSectionMarks = Math.max(
          0,
          totalSectionMarks - allocatedMarks,
        );
        const remainingQuestionSlots = Math.max(
          1,
          targetQuestionCount - sectionQuestions.length,
        );
        marksPerQuestion = Math.max(
          1,
          Math.round(remainingSectionMarks / remainingQuestionSlots),
        );
      }

      const res = await aiGenerationApi.reviewQuestion(candidateId, {
        decision: "approved",
        add_to_assessment_id: activeId || undefined,
        add_to_section_id: targetSecId || undefined,
        marks_if_added: marksPerQuestion,
        save_to_bank: saveToBank,
      });

      const qType = mapBackendToFrontendType(candidate.question_type) || "shortanswer";
      const realId =
        res?.assessment_question?.id ||
        res?.promoted_question?.id ||
        candidate.id;

      const newQ = mapCandidateToQuestion(candidate, targetSecId, marksPerQuestion);
      newQ.id = realId;
      nextQuestions = [...questionsRef.current, newQ];
      setQuestions(nextQuestions);
      setAiCandidates((prev) => {
        const updated = prev.filter((c) => c.id !== candidateId);
        if (updated.length === 0) {
          setAiReviewDrawerOpen(false);
          if (activeStep !== 6) {
            setActiveStep(5);
          }
        }
        return updated;
      });
      toast.success("Question accepted and added!");
    };

    try {
      activeAutosavePromiseRef.current = activeAutosavePromiseRef.current
        .then(action);
      await activeAutosavePromiseRef.current;
    } catch (err) {
      toast.error("Failed to accept AI question.");
      console.error("Error in accept candidate queue execution:", err);
    } finally {
      isReviewApplyingRef.current = false;
      setIsReviewApplying(false);
    }

    if (nextQuestions.length > 0) {
      await runAutosave(5, undefined, undefined, nextQuestions);
    }
  };

  const handleRejectCandidate = async (candidateId: string) => {
    try {
      await aiGenerationApi.reviewQuestion(candidateId, {
        decision: "rejected",
      });
      setAiCandidates((prev) => prev.filter((c) => c.id !== candidateId));
      toast.success("Question rejected.");
    } catch (err) {
      toast.error("Failed to reject question.");
    }
  };

  const handleSaveEditedCandidate = async (candidateId: string) => {
    const candidate = aiCandidates.find((c) => c.id === candidateId);
    if (!candidate) return;

    setIsReviewApplying(true);
    isReviewApplyingRef.current = true;
    let nextQuestions: Question[] = [];

    const action = async () => {
      const activeId = draftIdRef.current;
      const targetSecId =
        (candidate as any)._sectionId ||
        (aiTargetSectionId === "all" ? blueprint[0].id : aiTargetSectionId);

      // Calculate marks per question using questionsRef.current to avoid stale closures
      const sectionObj = blueprint.find((s) => s.id === targetSecId);
      let marksPerQuestion = 2;
      if (sectionObj) {
        const sectionQuestions = questionsRef.current.filter(
          (q) => q.sectionId === targetSecId,
        );
        const allocatedMarks = sectionQuestions.reduce(
          (sum, q) => sum + (q.marks || 0),
          0,
        );
        const totalSectionMarks = parseInt(sectionObj.marks as any) || 0;
        const targetQuestionCount =
          parseInt(sectionObj.questions as any) || 1;
        const remainingSectionMarks = Math.max(
          0,
          totalSectionMarks - allocatedMarks,
        );
        const remainingQuestionSlots = Math.max(
          1,
          targetQuestionCount - sectionQuestions.length,
        );
        marksPerQuestion = Math.max(
          1,
          Math.round(remainingSectionMarks / remainingQuestionSlots),
        );
      }

      const res = await aiGenerationApi.reviewQuestion(candidateId, {
        decision: "edited",
        modified_question_text: editingText,
        modified_explanation: editingExplanation,
        modified_options_json: JSON.stringify(editingOptions),
        add_to_assessment_id: activeId || undefined,
        add_to_section_id: targetSecId || undefined,
        marks_if_added: marksPerQuestion,
        save_to_bank: saveToBank,
      });
      const qType = mapBackendToFrontendType(candidate.question_type) || "shortanswer";
      const realId =
        res?.assessment_question?.id ||
        res?.promoted_question?.id ||
        candidate.id;

      const newQ = mapCandidateToQuestion(candidate, targetSecId, marksPerQuestion, editingExplanation, editingText, editingOptions);
      newQ.id = realId;
      nextQuestions = [...questionsRef.current, newQ];
      setQuestions(nextQuestions);
      setAiCandidates((prev) => {
        const updated = prev.filter((c) => c.id !== candidateId);
        if (updated.length === 0) {
          setAiReviewDrawerOpen(false);
          if (activeStep !== 6) {
            setActiveStep(5);
          }
        }
        return updated;
      });
      setEditingCandidateId(null);
      toast.success("Edited question accepted!");
    };

    try {
      activeAutosavePromiseRef.current = activeAutosavePromiseRef.current
        .then(action);
      await activeAutosavePromiseRef.current;
    } catch (err) {
      toast.error("Failed to save edited question.");
      console.error("Error in save edited candidate queue execution:", err);
    } finally {
      isReviewApplyingRef.current = false;
      setIsReviewApplying(false);
    }

    if (nextQuestions.length > 0) {
      await runAutosave(5, undefined, undefined, nextQuestions);
    }
  };

  const handleAcceptAllCandidates = async () => {
    setIsReviewApplying(true);
    isReviewApplyingRef.current = true;
    let finalQuestionsList: Question[] = [];

    const action = async () => {
      const activeId = draftIdRef.current;
      const simulatedQuestionsForMarks = [...questionsRef.current];
      const candidatesWithMarks = aiCandidates.map((c) => {
        const targetSecId =
          (c as any)._sectionId ||
          (aiTargetSectionId === "all"
            ? blueprint[0].id
            : aiTargetSectionId);
        const sectionObj = blueprint.find((s) => s.id === targetSecId);
        let marksPerQuestion = 2;
        if (sectionObj) {
          const sectionQuestions = simulatedQuestionsForMarks.filter(
            (q) => q.sectionId === targetSecId,
          );
          const allocatedMarks = sectionQuestions.reduce(
            (sum, q) => sum + (q.marks || 0),
            0,
          );
          const totalSectionMarks = parseInt(sectionObj.marks as any) || 0;
          const targetQuestionCount =
            parseInt(sectionObj.questions as any) || 1;
          const remainingSectionMarks = Math.max(
            0,
            totalSectionMarks - allocatedMarks,
          );
          const remainingQuestionSlots = Math.max(
            1,
            targetQuestionCount - sectionQuestions.length,
          );
          marksPerQuestion = Math.max(
            1,
            Math.round(remainingSectionMarks / remainingQuestionSlots),
          );
        }

        simulatedQuestionsForMarks.push({
          id: c.id,
          sectionId: targetSecId,
          marks: marksPerQuestion,
          text: "",
          type: "mcq",
          options: [],
          aiGenerated: true,
        } as any);

        return {
          candidate: c,
          targetSecId,
          marksPerQuestion,
        };
      });

      const results = await Promise.all(
        candidatesWithMarks.map(({ candidate, targetSecId, marksPerQuestion }) => {
          return aiGenerationApi.reviewQuestion(candidate.id, {
            decision: "approved",
            add_to_assessment_id: activeId || undefined,
            add_to_section_id: targetSecId || undefined,
            marks_if_added: marksPerQuestion,
            save_to_bank: saveToBank,
          });
        }),
      );

      const simulatedQuestions = [...questionsRef.current];
      candidatesWithMarks.forEach(({ candidate, targetSecId, marksPerQuestion }, index) => {
        const res = results[index];
        const realId =
          res?.assessment_question?.id || res?.promoted_question?.id || candidate.id;

        const newQ = mapCandidateToQuestion(candidate, targetSecId, marksPerQuestion);
        newQ.id = realId;
        simulatedQuestions.push(newQ);
      });

      finalQuestionsList = simulatedQuestions;
      setQuestions(simulatedQuestions);
      setAiCandidates([]);
      setAiReviewDrawerOpen(false);
      if (activeStep !== 6) {
        setActiveStep(5);
      }
      toast.success("All candidate questions accepted!");
    };

    try {
      activeAutosavePromiseRef.current = activeAutosavePromiseRef.current
        .then(action);
      await activeAutosavePromiseRef.current;
    } catch (err) {
      toast.error("Failed to accept all questions.");
      console.error("Error in accept all candidates queue execution:", err);
    } finally {
      isReviewApplyingRef.current = false;
      setIsReviewApplying(false);
    }

    if (finalQuestionsList.length > 0) {
      await runAutosave(5, undefined, undefined, finalQuestionsList);
    }
  };

  const handleRejectAllCandidates = async () => {
    try {
      await Promise.all(
        aiCandidates.map((c) =>
          aiGenerationApi.reviewQuestion(c.id, { decision: "rejected" }),
        ),
      );
      setAiCandidates([]);
      setAiReviewDrawerOpen(false);
      toast.success("All candidate questions rejected.");
    } catch (err) {
      toast.error("Failed to reject all questions.");
    }
  };

  const handleSaveToBank = async (q: Question) => {
    if (!q.text) {
      toast.error("Please enter question text before saving to bank");
      return;
    }

    try {
      await questionApi.createQuestion({
        content: q.text,
        image_url: q.imageUrl,
        question_type: mapFrontendToBackendType(q.type),
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
      // Check for duplicate content or ID
      const isDuplicate = questionsRef.current.some(
        (q) =>
          q.id.includes(qBankSummary.id) ||
          q.text.trim() === qBankSummary.content.trim()
      );
      if (isDuplicate) {
        toast.error("This question already exists in the assessment.");
        return;
      }

    try {
      const qBank = await questionApi.getQuestion(qBankSummary.id);
      const mappedType = qBank.question_type
        .toLowerCase()
        .replaceAll("_", "") as QuestionType;

      const rawContent = qBank.explanation || qBank.options?.[0]?.option_text || (qBank.options?.[0] as any)?.content || "";
      const parsed = ["shortanswer", "essay", "computational"].includes(mappedType)
        ? parseOpenEndedExplanation(mappedType, rawContent)
        : null;

      const nextQuestions = [
        ...questionsRef.current,
        {
          id: `q-bank-${qBank.id}-${Date.now()}`,
          sectionId,
          groupId,
          text: qBank.content,
          type: mappedType,
          marks: qBank.marks,
          options: parsed
            ? [
                {
                  id: qBank.options?.[0]?.id,
                  option_text: parsed.modelAnswer,
                  option_text_right: "",
                  is_correct: true,
                  order_index: 0,
                },
              ]
            : (qBank.options || []).map((opt: any, idx: number) => ({
                option_text: opt.option_text || opt.content || "",
                option_text_right: opt.option_text_right || opt.match_value || opt.matchValue || "",
                is_correct: opt.is_correct,
                order_index: opt.order_index !== undefined ? opt.order_index : idx,
              })),
          imageUrl: qBank.image_url,
          caseStudyContext: (qBank as any).case_study_context || (qBank as any).caseStudyContext,
          computationalType: (qBank as any).computational_type || (qBank as any).computationalType,
          rubric: parsed?.rubric,
          wordLimit: parsed?.wordLimit,
          solutionSteps: parsed?.solutionSteps,
          tolerance: parsed?.tolerance,
          aiGenerated: false,
          is_required: true,
        },
      ];
      updateQuestionsAndAutosave(nextQuestions);
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



  const preparePayload = useCallback(
    (
      metadataOverride?: any,
      rulesOverride?: any,
      draftStep?: number | null,
      questionsOverride?: Question[],
    ) => {
      const activeMetadata = metadataOverride
        ? { ...metadataRef.current, ...metadataOverride }
        : metadataRef.current;
      const activeRules = rulesOverride
        ? { ...rulesRef.current, ...rulesOverride }
        : rulesRef.current;
      const activeQuestions =
        questionsOverride !== undefined
          ? questionsOverride
          : questionsRef.current;

      // 1. Generate UUIDs for temporary IDs and mutate refs in-place
      blueprintRef.current.forEach((b) => {
        if (b.id.startsWith("sec-")) {
          const newId = crypto.randomUUID();
          // Update any questions referencing this temporary section ID
          activeQuestions.forEach((q) => {
            if (q.sectionId === b.id) {
              q.sectionId = newId;
            }
          });
          b.id = newId;
        }
      });

      activeQuestions.forEach((q) => {
        if (q.id.startsWith("q-") && !q.id.startsWith("q-bank-")) {
          q.id = crypto.randomUUID();
        }
      });

      const payload = {
        id: draftIdRef.current || undefined,
        draft_step: draftStep === null ? undefined : (draftStep !== undefined ? draftStep : activeStepRef.current),
        metadata: {
          title: activeMetadata.title || "Untitled Assessment",
          description: activeMetadata.description || "",
          mode: activeMetadata.mode || "CAT",
          assessment_type:
            activeMetadata.mode === "Groupwork"
              ? "GROUP_WORK"
              : activeMetadata.mode.toUpperCase(),
          institution_id: activeMetadata.institution_id || undefined,
          course_id: activeMetadata.course_id || undefined,
          department_ids: activeMetadata.department_ids || [],
          option_ids: activeMetadata.option_ids || [],
          class_group_ids: activeMetadata.class_group_ids || [],
          teaching_workspace_id: activeMetadata.teaching_workspace_id || undefined,
          subject_id: activeMetadata.subject_id || undefined,
          audience_type: activeMetadata.audience_type || "all",
          target_student_ids: activeMetadata.target_student_ids || [],
          date: activeMetadata.date || undefined,
          startTime: activeMetadata.startTime || undefined,
          endTime: activeMetadata.endTime || undefined,
          windowStart: activeMetadata.windowStart || undefined,
          windowEnd: activeMetadata.windowEnd || undefined,
          durationMinutes: activeMetadata.durationMinutes ? parseInt(activeMetadata.durationMinutes as any) : 0,
          passing_marks: activeMetadata.passing_marks ? parseInt(activeMetadata.passing_marks as any) : 0,
          selectedInstructions: activeMetadata.selectedInstructions || [],
          customInstructions: activeMetadata.customInstructions || "",
          maxGroupSize: activeMetadata.max_group_size || undefined,
          groupFormation: activeMetadata.group_formation_mode || undefined,
          groupAssignmentMode: activeMetadata.group_assignment_mode || undefined,
          questionDistributionMode: activeMetadata.question_distribution_mode || undefined,
          appealWindowDays: activeMetadata.appeal_window_days ? parseInt(activeMetadata.appeal_window_days as any) : 0,
          academic_year: activeMetadata.academic_year || undefined,
        },
        blueprint: blueprintRef.current.map((b) => ({
          id: b.id,
          section: b.section,
          topics: b.topics,
          marks: b.marks,
          questions: b.questions,
          difficulty: b.difficulty,
          allowedTypes: b.allowedTypes.map((t) => mapFrontendToBackendType(t)),
          aiPromptHint: b.aiPromptHint,
          difficultyDistribution: b.difficultyDistribution,
          bloomLevel: b.bloomLevel,
        })),
        questions: activeQuestions.map((q) => {
          let finalOptions: QuestionOption[] = (q.options || []).map((opt) => ({
            option_text: opt.option_text,
            option_text_right: opt.option_text_right,
            is_correct: opt.is_correct,
            order_index: opt.order_index,
            match_key: opt.match_key,
          }));

          if (["shortanswer", "essay", "computational"].includes(q.type)) {
            let combinedText = q.options?.[0]?.option_text || "";
            if (q.type === "essay") {
              combinedText = `Model Answer: ${q.options?.[0]?.option_text || ""}\n\nRubric: ${q.rubric || ""}\n\nWord Limit: ${q.wordLimit || 0} words`;
            } else if (q.type === "shortanswer") {
              combinedText = `Model Answer: ${q.options?.[0]?.option_text || ""}\n\nRubric: ${q.rubric || ""}`;
            } else if (q.type === "computational") {
              combinedText = `Solution Steps: ${q.solutionSteps || ""}\n\nNumerical Answer: ${q.options?.[0]?.option_text || ""}\n\nTolerance: ${q.tolerance || 0}`;
            }
            finalOptions = [
              {
                option_text: combinedText,
                option_text_right: "",
                is_correct: true,
                order_index: 0,
              },
            ];
          } else if (q.type === "casestudy" && q.options) {
            finalOptions = q.options.map((opt) => ({
              option_text: opt.option_text,
              option_text_right: opt.option_text_right || "",
              is_correct: true,
              order_index: opt.order_index,
              match_key: opt.match_key,
            }));
          }

          return {
            id: q.id,
            sectionId: q.sectionId,
            groupId: q.groupId,
            text: q.text,
            type: mapFrontendToBackendType(q.type),
            marks: q.marks,
            options: finalOptions,
            aiGenerated: q.aiGenerated,
            imageUrl: q.imageUrl,
            computationalType: q.computationalType,
            caseStudyContext: q.caseStudyContext,
            is_required: q.is_required,
          };
        }),
        rules: {
          ...activeRules,
          requireAllMemberApproval: activeMetadata.require_all_member_approval,
          requireAllMemberParticipation:
            activeMetadata.require_all_member_participation,
          supervisor_ids: supervisorListRef.current.map((s) => s.id),
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

      let startD: Date | undefined;
      let endD: Date | undefined;

      if (activeMetadata.date && activeMetadata.startTime) {
        startD = parseTimeString(activeMetadata.startTime, activeMetadata.date);
        (payload.metadata as any).windowStart = startD.toISOString();
      }
      if (activeMetadata.date && activeMetadata.endTime) {
        endD = parseTimeString(activeMetadata.endTime, activeMetadata.date);
        if (startD && endD <= startD) {
          // Handle over midnight end time by adding 1 day
          endD.setDate(endD.getDate() + 1);
        }
        (payload.metadata as any).windowEnd = endD.toISOString();
      }

      return payload;
    },
    [],
  );

  const mapApiErrors = (err: any) => {
    const errors: Record<string, string> = {};
    try {
      let errMsg = err.message || "";
      if (errMsg.startsWith("Validation failed: ")) {
        errMsg = errMsg.replace("Validation failed: ", "");
      }
      const parsed = JSON.parse(errMsg);
      if (Array.isArray(parsed)) {
        parsed.forEach((detail: any) => {
          const field = detail.loc?.[detail.loc.length - 1];
          if (field) {
            errors[field] = detail.msg;
          }
        });
      } else if (parsed && typeof parsed === "object") {
        Object.entries(parsed).forEach(([field, msg]) => {
          errors[field] = String(msg);
        });
      }
    } catch {
      const errMsg = err.message || "";
      if (errMsg.includes(" | ") || errMsg.includes(": ")) {
        const parts = errMsg.split(" | ");
        parts.forEach((part: string) => {
          const colonIdx = part.indexOf(":");
          if (colonIdx > -1) {
            const field = part.substring(0, colonIdx).trim();
            const msg = part.substring(colonIdx + 1).trim();
            errors[field] = msg;
          }
        });
      }
    }
    setFieldErrors(errors);
    return errors;
  };

  const runStepGuards = useCallback(
    (targetStep: number): boolean => {
      if (targetStep < activeStep) return true;

      if (targetStep >= 2 && activeStep < 2) {
        if (!metadata.title) {
          toast.error("Display Title is required");
          return false;
        }
        if (!metadata.mode) {
          toast.error("Assessment Protocol is required");
          return false;
        }
        if (!metadata.teaching_workspace_id && !metadata.course_id) {
          toast.error(
            "A valid Teaching Workspace and Course are required for assessment creation.",
          );
          return false;
        }
        if (!metadata.date) {
          toast.error("Scheduled Date is required");
          return false;
        }
        const isStrict = metadata.mode === "CAT" || metadata.mode === "Summative" || metadata.mode === "Groupwork";
        if (isStrict) {
          if (!metadata.startTime) {
            toast.error("Access Start is required");
            return false;
          }
          if (!metadata.endTime) {
            toast.error("Access End is required");
            return false;
          }
        }

        if (
          !metadata.durationMinutes ||
          parseInt(metadata.durationMinutes as any) <= 0
        ) {
          toast.error("Valid duration is required");
          return false;
        }

        if (metadata.startTime && metadata.endTime) {
          if (parseInt(metadata.durationMinutes as any) > windowDuration) {
            toast.error(
              `Duration (${metadata.durationMinutes}m) cannot exceed the time window (${windowDuration}m) between start and end time.`,
            );
            return false;
          }
        }
      }

      if (targetStep >= 4 && activeStep < 4) {
        if (
          metadata.audience_type === "selected" &&
          (!metadata.target_student_ids ||
            metadata.target_student_ids.length === 0)
        ) {
          toast.error(
            "At least one student must be selected for targeted audience",
          );
          return false;
        }
      }

      if (targetStep >= 5 && activeStep < 5) {
        if (blueprint.length === 0) {
          toast.error(
            "Cannot advance to questions without completing blueprint (must have at least 1 section)",
          );
          return false;
        }
        if (metadata.mode !== "Groupwork") {
          for (const b of blueprint) {
            if (!b.section) {
              toast.error("All sections must have a title");
              return false;
            }
            if (!b.marks || parseInt(b.marks as any) <= 0) {
              toast.error("All sections must have allocated marks");
              return false;
            }
            if (!b.questions || parseInt(b.questions as any) <= 0) {
              toast.error("All sections must have target question count");
              return false;
            }
            if (b.difficultyDistribution) {
              const sum =
                b.difficultyDistribution.easy +
                b.difficultyDistribution.medium +
                b.difficultyDistribution.hard;
              if (sum !== 100) {
                toast.error(
                  `Difficulty distribution for ${b.section} must sum to 100%`,
                );
                return false;
              }
            }
          }
        }
      }

      if (targetStep >= 6 && activeStep < 6) {
        const targetTotal = parseInt(metadata.total_marks as any) || 0;
        if (currentMarks !== targetTotal) {
          toast.error(
            `Cannot advance to step 6: The sum of questions' marks (${currentMarks}) must match the assessment's total marks (${targetTotal}).`,
          );
          return false;
        }
        // Empty text and Fill-in-the-blank placeholder validation
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if (!q.text || q.text.trim().length === 0) {
            toast.error(
              `Question #${i + 1} has empty text. All questions must have content.`,
            );
            return false;
          }
          if (q.type === "fillblank") {
            const content = q.text || "";
            if (!content.includes("[blank]")) {
              toast.error(
                `Fill-in-the-blank question #${i + 1} is missing the '[blank]' placeholder in its text.`,
              );
              return false;
            }
          }
        }
      }

      return true;
    },
    [activeStep, blueprint, currentMarks, metadata, windowDuration, questions],
  );

  const syncDraftResponse = useCallback((res: any) => {
    if (!res) return;
    if (res.sections?.length > 0) {
      const sortedSections = [...res.sections].sort(
        (a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)
      );
      setBlueprint(
        sortedSections.map((s: any) => ({
          id: s.id,
          section: s.title,
          topics: s.description || "",
          marks: s.allocated_marks || 0,
          questions: s.question_count_target || 0,
          difficulty: (() => {
            const diff = s.allowed_question_types?.difficulty || s.difficulty || "Medium";
            return diff.charAt(0).toUpperCase() + diff.slice(1).toLowerCase();
          })(),
          allowedTypes: (s.allowed_question_types?.types || ["mcq"]).map((t: string) =>
            t.toLowerCase().replaceAll("_", "")
          ),
          aiPromptHint: s.ai_generation_prompt_hint || "",
          difficultyDistribution: s.difficulty_distribution || undefined,
          bloomLevel:
            s.allowed_question_types?.bloom_level ||
            s.allowed_question_types?.bloomLevel ||
            s.bloom_level ||
            s.bloomLevel ||
            "understand",
        }))
      );
    }

    if (res.assessment_questions?.length > 0) {
      const sortedQuestions = [...res.assessment_questions].sort(
        (a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)
      );
      setQuestions(
        sortedQuestions.map((aq: any) => {
          const type = aq.question.question_type.toLowerCase().replaceAll("_", "") as QuestionType;
          const optionsRaw = aq.question.options || [];
          const unpacked = parseOpenEndedExplanation(
            type,
            optionsRaw[0]?.option_text || optionsRaw[0]?.content || aq.question.explanation || ""
          );
          return {
            id: aq.question.id,
            sectionId: aq.assessment_section_id,
            groupId: aq.group_id,
            text: aq.question.content,
            imageUrl: aq.question.image_url,
            type: type,
            marks: aq.marks_override || aq.question.marks,
            options: ["essay", "shortanswer", "computational"].includes(type)
              ? [{
                  id: optionsRaw[0]?.id,
                  option_text: unpacked.modelAnswer || aq.question.explanation || "",
                  option_text_right: "",
                  is_correct: true,
                  order_index: 0,
                }]
              : optionsRaw.map((o: any, idx: number) => ({
                  id: o.id,
                  option_text: o.option_text || o.content || "",
                  option_text_right: o.option_text_right || o.match_value || "",
                  is_correct: o.is_correct,
                  order_index: o.order_index,
                  match_key: o.match_key,
                })),
            rubric: unpacked.rubric,
            wordLimit: unpacked.wordLimit,
            solutionSteps: unpacked.solutionSteps,
            tolerance: unpacked.tolerance,
            computationalType: aq.question.computational_type,
            caseStudyContext: aq.question.case_study_context,
            aiGenerated: aq.added_via === "ai_generated" || aq.question.ai_generated,
            is_required: aq.is_required ?? true,
          };
        })
      );
    }

    const initialTotal = res.total_marks || 0;
    const initialPassing = res.passing_marks || 70;
    const initialPct = initialTotal > 0 ? Math.round((initialPassing * 100) / initialTotal) : 70;
    setPassingMarksPercent(initialPct);
  }, []);

  const debouncedAutosaveRef = useRef<NodeJS.Timeout | null>(null);

  const runAutosave = useCallback(
    (
      step: number,
      metadataOverride?: Partial<typeof metadata>,
      rulesOverride?: Partial<typeof rules>,
      questionsOverride?: Question[],
    ) => {
      if (isReviewApplyingRef.current) return Promise.resolve();
      const executeAutosave = async () => {
        // Use the ref so we always get the latest draftId even before React re-renders
        const currentId = draftIdRef.current;
        const activeMetadata = metadataOverride
          ? { ...metadataRef.current, ...metadataOverride }
          : metadataRef.current;

        if (!currentId && !activeMetadata.teaching_workspace_id) {
          return;
        }

        setAutosaveStatus("saving");
        try {
          const payload = preparePayload(
            metadataOverride,
            rulesOverride,
            step,
            questionsOverride,
          );
          const res = (await apiClient(
            currentId ? `/assessments/draft/${currentId}` : "/assessments/draft",
            {
              method: currentId ? "PUT" : "POST",
              body: JSON.stringify(payload),
            }
          )) as any;
          setAutosaveStatus("saved");
          syncDraftResponse(res);
          const returnedId = res.id || res.assessment_id;
          if (returnedId && returnedId !== currentId) {
            // Update ref immediately so subsequent autosaves update this draft
            draftIdRef.current = returnedId;
            loadedDraftIdRef.current = returnedId;
            router.replace(`/lecturer/assessments/new?draft=${returnedId}`);
          }
        } catch (err: any) {
          setAutosaveStatus("error");
          console.error("Autosave failed:", err);
        }
      };

      activeAutosavePromiseRef.current = activeAutosavePromiseRef.current
        .then(executeAutosave)
        .catch((err) => {
          console.error("Autosave queue error:", err);
        });
      return activeAutosavePromiseRef.current;
    },
    [router, preparePayload, syncDraftResponse],
  );

  const handleNextStep = useCallback(
    async (targetStep: number) => {
      if (targetStep === activeStep) return;

      if (targetStep < activeStep) {
        toast.warning(
          `Navigating backward to step ${targetStep}. Your draft is autosaved.`,
        );
        // Fire autosave but don't block navigation on it — always navigate backward
        try {
          await runAutosave(targetStep);
        } catch {
          // Autosave failure should not block backward navigation
        }
        setActiveStep(targetStep);
        return;
      }

      if (!runStepGuards(targetStep)) {
        return;
      }

      await runAutosave(targetStep);

      if (targetStep === 6) {
        triggerStep6Load();
      }
      setActiveStep(targetStep);
    },
    [activeStep, runAutosave, runStepGuards, triggerStep6Load],
  );

  const runAutosaveRef = useRef(runAutosave);
  useEffect(() => {
    runAutosaveRef.current = runAutosave;
  }, [runAutosave]);

  const triggerDebouncedAutosave = useCallback(
    (
      step: number,
      metadataOverride?: Partial<typeof metadata>,
      rulesOverride?: Partial<typeof rules>,
      questionsOverride?: Question[],
    ) => {
      if (debouncedAutosaveRef.current) {
        clearTimeout(debouncedAutosaveRef.current);
      }
      debouncedAutosaveRef.current = setTimeout(() => {
        runAutosaveRef.current(step, metadataOverride, rulesOverride, questionsOverride);
      }, 2000);
    },
    [],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          if (activeStep > 1) {
            handleNextStep(activeStep - 1);
          }
        } else {
          const totalSteps = STEPS_DATA.length;
          if (activeStep < totalSteps) {
            handleNextStep(activeStep + 1);
          }
        }
      }
      if (e.key === "Escape") {
        setEditingCandidateId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeStep, editingCandidateId, handleNextStep]);

  const handleSaveDraft = async (): Promise<any | null> => {
    setIsSavingDraft(true);
    setFieldErrors({});
    try {
      if (!metadata.teaching_workspace_id) {
        toast.error("Please select a teaching workspace before saving the draft.");
        return null;
      }
      const currentId = draftIdRef.current;
      const res = (await apiClient(
        currentId ? `/assessments/draft/${currentId}` : "/assessments/draft",
        {
          method: currentId ? "PUT" : "POST",
          body: JSON.stringify(preparePayload(undefined, undefined, activeStep)),
        }
      )) as any;
      toast.success("Draft saved successfully.");
      syncDraftResponse(res);
      const returnedId = res.id || res.assessment_id;
      if (returnedId) {
        draftIdRef.current = returnedId;
        loadedDraftIdRef.current = returnedId;
        router.replace(`/lecturer/assessments/new?draft=${returnedId}`);
      }
      return res;
    } catch (err: any) {
      mapApiErrors(err);
      return null;
    } finally {
      setIsSavingDraft(false);
    }
  };

  const ensureDraftId = async (): Promise<{ id: string; sections?: any[] } | null> => {
    const hasTempIds = blueprint.some((s) => s.id.startsWith("sec-"));

    // Fast path: draft exists and all sections already have real UUIDs
    if (draftIdRef.current && !hasTempIds) {
      return {
        id: draftIdRef.current,
        sections: blueprint.map((s) => ({ id: s.id })),
      };
    }

    toast.info("Saving draft first to enable AI features...");

    // Use the bulk /draft endpoint (same as runAutosave) so that sections are
    // persisted and returned with real database UUIDs. The wizard step endpoint
    // does NOT save sections, so we must NOT use handleSaveDraft() here.
    try {
      setIsSavingDraft(true);
      const payload = preparePayload(undefined, undefined, activeStep);
      const currentId = draftIdRef.current;
      const res = (await apiClient(
        currentId ? `/assessments/draft/${currentId}` : "/assessments/draft",
        {
          method: currentId ? "PUT" : "POST",
          body: JSON.stringify(payload),
        }
      )) as any;

      syncDraftResponse(res);

      const returnedId = res.id || res.assessment_id;
      if (returnedId && returnedId !== draftIdRef.current) {
        draftIdRef.current = returnedId;
        loadedDraftIdRef.current = returnedId;
        router.replace(`/lecturer/assessments/new?draft=${returnedId}`);
      }

      return {
        id: returnedId,
        sections: res.sections || [],
      };
    } catch (err: any) {
      toast.error(err.message || "Failed to save draft before AI generation.");
      return null;
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
    setIsPublishing(true);
    setFieldErrors({});
    try {
      const result = (await apiClient("/assessments/publish", {
        method: "POST",
        body: JSON.stringify(preparePayload(undefined, undefined, null)),
      })) as any;
      if (result.validation_passed) {
        toast.success("Assessment Published!");
        router.push("/lecturer/assessments");
      } else {
        toast.error(result.errors?.join(", ") || "Validation failed.");
      }
    } catch (err: any) {
      mapApiErrors(err);
    } finally {
      setIsPublishing(false);
    }
  };

  if (isLoadingDraft || isLoadingWorkspaces)
    return (
      <div className="space-y-6">
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
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton
                key={i}
                variant="title"
                className="flex-1 h-12 rounded-lg"
              />
            ))}
          </div>
          <Card className="shadow-none border p-8 space-y-8">
            <div className="grid grid-cols-2 gap-8">
              <Skeleton variant="media" className="h-12 w-full rounded-lg" />
              <Skeleton variant="media" className="h-12 w-full rounded-lg" />
            </div>
            <Skeleton variant="media" className="h-32 w-full rounded-lg" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton
                  key={i}
                  variant="media"
                  className="h-10 w-full rounded-lg"
                />
              ))}
            </div>
          </Card>
        </div>
      </div>
    );

  const renderStepContent = (stepNum: number) => {
    switch (stepNum) {
      case 1:
        return (
          <div className="space-y-6">
            <Card className="shadow-none border">
              <CardHeader className="py-5 border-b">
                <CardTitle className="text-lg">Assessment Identity</CardTitle>
                <CardDescription>
                  Define the core details and schedule for this assessment.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="title">
                      Assessment Title <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="title"
                      required
                      value={metadata.title}
                      onChange={(e) => {
                        setMetadata({ ...metadata, title: e.target.value });
                        triggerDebouncedAutosave(1);
                      }}
                      placeholder="e.g. Mid-Semester CAT – Database Systems"
                      className="h-10 font-medium"
                      aria-invalid={!!fieldErrors.title}
                      aria-describedby={
                        fieldErrors.title ? "title-error" : undefined
                      }
                    />
                    {fieldErrors.title && (
                      <p
                        className="text-xs text-destructive mt-1 font-semibold"
                        id="title-error"
                      >
                        {fieldErrors.title}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workspace">
                      Teaching Workspace <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={metadata.teaching_workspace_id}
                      onValueChange={(v) => {
                        const updated = {
                          ...metadata,
                          teaching_workspace_id: v,
                          course_id: v,
                        };
                        setMetadata(updated);
                        loadWorkspaceDetail(v);
                        runAutosave(1, updated);
                      }}
                    >
                      <SelectTrigger
                        className="h-10"
                        id="workspace"
                        aria-invalid={!!fieldErrors.course_id}
                        aria-describedby={
                          fieldErrors.course_id ? "workspace-error" : undefined
                        }
                      >
                        <SelectValue placeholder="Select Teaching Workspace" />
                      </SelectTrigger>
                      <SelectContent>
                        {workspaces.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.title} → {w.class_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrors.course_id && (
                      <p
                        className="text-xs text-destructive mt-1 font-semibold"
                        id="workspace-error"
                      >
                        {fieldErrors.course_id}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={metadata.description}
                    onChange={(e) => {
                      setMetadata({ ...metadata, description: e.target.value });
                      triggerDebouncedAutosave(1);
                    }}
                    placeholder="Brief overview of the assessment coverage..."
                    className="min-h-25 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-dashed">
                  <div className="space-y-2">
                    <Label htmlFor="mode">
                      Mode <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={metadata.mode}
                      onValueChange={(v: any) => {
                        setMetadata({ ...metadata, mode: v });
                        triggerDebouncedAutosave(1);
                      }}
                    >
                      <SelectTrigger
                        className="h-10"
                        id="mode"
                        aria-invalid={!!fieldErrors.mode}
                        aria-describedby={
                          fieldErrors.mode ? "mode-error" : undefined
                        }
                      >
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
                    {fieldErrors.mode && (
                      <p
                        className="text-xs text-destructive mt-1 font-semibold"
                        id="mode-error"
                      >
                        {fieldErrors.mode}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">
                      Scheduled Date <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <CalendarIcon className="size-4" />
                      </span>
                      <input
                        type="date"
                        id="date"
                        className={cn(
                          "h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm ring-offset-background",
                          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                          !metadata.date && "text-muted-foreground",
                          fieldErrors.date && "border-destructive",
                        )}
                        value={
                          metadata.date
                            ? format(metadata.date, "yyyy-MM-dd")
                            : ""
                        }
                        min={format(new Date(), "yyyy-MM-dd")}
                        aria-invalid={!!fieldErrors.date}
                        aria-describedby={
                          fieldErrors.date ? "date-error" : undefined
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          const d = val
                            ? new Date(val + "T00:00:00")
                            : undefined;
                          const updated = { ...metadata, date: d };
                          setMetadata(updated);
                          runAutosave(1, updated);
                        }}
                      />
                    </div>
                    {fieldErrors.date && (
                      <p
                        className="text-xs text-destructive mt-1 font-semibold"
                        id="date-error"
                      >
                        {fieldErrors.date}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startTime">
                      Start Time <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="time"
                      id="startTime"
                      required
                      value={metadata.startTime}
                      onChange={(e) => {
                        const now = new Date();
                        const selectedTime = e.target.value;
                        if (
                          metadata.date &&
                          format(metadata.date, "yyyy-MM-dd") ===
                            format(now, "yyyy-MM-dd")
                        ) {
                          const [hours, minutes] = selectedTime
                            .split(":")
                            .map(Number);
                          const selectedDateTime = new Date(metadata.date);
                          selectedDateTime.setHours(hours, minutes, 0, 0);
                          if (selectedDateTime < now) {
                            toast.error(
                              "Start time cannot be in the past for today.",
                            );
                            return;
                          }
                        }
                        setMetadata({ ...metadata, startTime: selectedTime });
                        triggerDebouncedAutosave(1);
                      }}
                      className="h-10"
                      aria-invalid={!!fieldErrors.startTime}
                      aria-describedby={
                        fieldErrors.startTime ? "startTime-error" : undefined
                      }
                    />
                    {fieldErrors.startTime && (
                      <p
                        className="text-xs text-destructive mt-1 font-semibold"
                        id="startTime-error"
                      >
                        {fieldErrors.startTime}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime">
                      End Time <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="time"
                      id="endTime"
                      required
                      value={metadata.endTime}
                      onChange={(e) => {
                        setMetadata({ ...metadata, endTime: e.target.value });
                        triggerDebouncedAutosave(1);
                      }}
                      className="h-10"
                      aria-invalid={!!fieldErrors.endTime}
                      aria-describedby={
                        fieldErrors.endTime ? "endTime-error" : undefined
                      }
                    />
                    {fieldErrors.endTime && (
                      <p
                        className="text-xs text-destructive mt-1 font-semibold"
                        id="endTime-error"
                      >
                        {fieldErrors.endTime}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-6 border-t border-dashed">
                  <div className="space-y-2">
                    <Label htmlFor="durationMinutes">
                      Duration (Min) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="number"
                      id="durationMinutes"
                      required
                      value={metadata.durationMinutes}
                      onChange={(e) => {
                        setMetadata({
                          ...metadata,
                          durationMinutes: parseInt(e.target.value) || 0,
                        });
                        triggerDebouncedAutosave(1);
                      }}
                      className="h-10"
                      aria-invalid={!!fieldErrors.duration_minutes}
                      aria-describedby={
                        fieldErrors.duration_minutes
                          ? "durationMinutes-error"
                          : undefined
                      }
                    />
                    {fieldErrors.duration_minutes && (
                      <p
                        className="text-xs text-destructive mt-1 font-semibold"
                        id="durationMinutes-error"
                      >
                        {fieldErrors.duration_minutes}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="totalMarksInput">
                      Total Marks <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="number"
                      id="totalMarksInput"
                      value={metadata.total_marks || 0}
                      disabled
                      className="h-10 bg-muted cursor-not-allowed"
                      aria-invalid={!!fieldErrors.total_marks}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Automatically calculated from Blueprint section marks
                      (configured in Step 4).
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end mt-8">
              <Button
                size="lg"
                onClick={() => handleNextStep(2)}
                className="h-11 px-8 rounded-md font-semibold"
              >
                Define Policies & Proctoring{" "}
                <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
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
                        {
                          key: "integrityMonitoring",
                          label: "Integrity Checks",
                          desc: "Flag behavior and session anomalies",
                        },
                        {
                          key: "lateSubmissionAllowed",
                          label: "Late Submission",
                          desc: "Allow work after window closes",
                        },
                      ].map((item) => (
                        <div
                          key={item.key}
                          className="flex items-start justify-between gap-4"
                        >
                          <div className="space-y-0.5">
                            <Label
                              className="text-sm cursor-pointer"
                              htmlFor={item.key}
                            >
                              {item.label}
                            </Label>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              {item.desc}
                            </p>
                          </div>
                          <Switch
                            id={item.key}
                            checked={(rules as any)[item.key]}
                            onCheckedChange={(v) => {
                              setRules({ ...rules, [item.key]: v });
                              triggerDebouncedAutosave(2);
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3 pt-5 border-t">
                      <Label htmlFor="resultRelease">Result Release Mode</Label>
                      <Select
                        value={metadata.result_release_mode}
                        onValueChange={(v: any) => {
                          setMetadata({ ...metadata, result_release_mode: v });
                          setRules({ ...rules, resultRelease: v.toLowerCase() as any });
                          triggerDebouncedAutosave(2);
                        }}
                      >
                        <SelectTrigger className="h-9" id="resultRelease">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="IMMEDIATE">
                            Immediate (Auto-grade)
                          </SelectItem>
                          <SelectItem value="MANUAL">
                            Manual Review Required
                          </SelectItem>
                          <SelectItem value="SCHEDULED">
                            Scheduled Release Time
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="pt-5 border-t">
                      <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-4">
                        Additional Configuration
                      </Label>
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5">
                            <Label
                              htmlFor="shuffleQuestions"
                              className="text-sm cursor-pointer"
                            >
                              Randomize Questions
                            </Label>
                            <p className="text-[10px] text-muted-foreground">
                              Shuffle order per student
                            </p>
                          </div>
                          <Switch
                            id="shuffleQuestions"
                            checked={rules.shuffleQuestions}
                            onCheckedChange={(v) => {
                              setRules({ ...rules, shuffleQuestions: v });
                              triggerDebouncedAutosave(2);
                            }}
                          />
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5">
                            <Label
                              htmlFor="shuffleOptions"
                              className="text-sm cursor-pointer"
                            >
                              Randomize Options
                            </Label>
                            <p className="text-[10px] text-muted-foreground">
                              Shuffle MCQ options
                            </p>
                          </div>
                          <Switch
                            id="shuffleOptions"
                            checked={rules.shuffleOptions}
                            onCheckedChange={(v) => {
                              setRules({ ...rules, shuffleOptions: v });
                              triggerDebouncedAutosave(2);
                            }}
                          />
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5">
                            <Label
                              htmlFor="passwordProtected"
                              className="text-sm cursor-pointer"
                            >
                              Password Protected
                            </Label>
                            <p className="text-[10px] text-muted-foreground">
                              Require code to start
                            </p>
                          </div>
                          <Switch
                            id="passwordProtected"
                            checked={rules.passwordProtected}
                            onCheckedChange={(v) => {
                              setRules({ ...rules, passwordProtected: v });
                              triggerDebouncedAutosave(2);
                            }}
                          />
                        </div>

                        {rules.passwordProtected && (
                          <div className="space-y-1.5">
                            <Label htmlFor="accessPassword">
                              Access Code / Password
                            </Label>
                            <Input
                              id="accessPassword"
                              placeholder="Type access code..."
                              value={rules.accessPassword}
                              onChange={(e) => {
                                setRules({
                                  ...rules,
                                  accessPassword: e.target.value,
                                });
                                triggerDebouncedAutosave(2);
                              }}
                              className="h-9 text-sm"
                            />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="attempts">Max Attempts</Label>
                            <Input
                              type="number"
                              id="attempts"
                              min={1}
                              max={10}
                              value={rules.attempts}
                              onChange={(e) => {
                                setRules({
                                  ...rules,
                                  attempts: parseInt(e.target.value) || 1,
                                });
                                triggerDebouncedAutosave(2);
                              }}
                              className="h-9 text-sm"
                            />
                          </div>
                          {metadata.mode === "Homework" && (
                            <div className="space-y-1.5">
                              <Label htmlFor="latePenaltyPercent">
                                Late Penalty %
                              </Label>
                              <Input
                                type="number"
                                id="latePenaltyPercent"
                                min={0}
                                max={100}
                                value={rules.latePenaltyPercent}
                                onChange={(e) => {
                                  setRules({
                                    ...rules,
                                    latePenaltyPercent:
                                      parseFloat(e.target.value) || 0,
                                  });
                                  triggerDebouncedAutosave(2);
                                }}
                                className="h-9 text-sm"
                              />
                            </div>
                          )}
                        </div>

                        {rules.lateSubmissionAllowed && (
                          <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                            <div className="space-y-1.5">
                              <Label htmlFor="gracePeriodMinutes">
                                Grace Period (Mins)
                              </Label>
                              <Input
                                type="number"
                                id="gracePeriodMinutes"
                                min={0}
                                value={rules.gracePeriodMinutes}
                                onChange={(e) => {
                                  setRules({
                                    ...rules,
                                    gracePeriodMinutes:
                                      parseInt(e.target.value) || 0,
                                  });
                                  triggerDebouncedAutosave(2);
                                }}
                                className="h-9 text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {metadata.mode === "Groupwork" && (
                  <GroupWorkConfigSection
                    config={metadata as any}
                    onConfigChange={(updates) => {
                      setMetadata((prev) => ({ ...prev, ...updates }));
                      triggerDebouncedAutosave(2);
                    }}
                  />
                )}
              </div>

              <div className="space-y-6">
                <Card className="shadow-none border">
                  <CardHeader className="py-4 border-b">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Instructions Policy
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="preset-instr">
                        Predefined Instructions Presets
                      </Label>
                      <div
                        className="grid grid-cols-1 gap-2 border rounded-lg p-3 bg-muted/10"
                        id="preset-instr"
                      >
                        {PREDEFINED_INSTRUCTIONS.map((instr) => (
                          <div
                            key={instr}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={`preset-${instr}`}
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
                                triggerDebouncedAutosave(2);
                              }}
                            />
                            <label
                              htmlFor={`preset-${instr}`}
                              className="text-sm cursor-pointer"
                            >
                              {instr}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="customInstructions">
                        Custom Instructions Text
                      </Label>
                      <Textarea
                        id="customInstructions"
                        placeholder="Any additional custom rules..."
                        className="min-h-30 text-sm bg-white"
                        value={metadata.customInstructions}
                        onChange={(e) => {
                          setMetadata({
                            ...metadata,
                            customInstructions: e.target.value,
                          });
                          triggerDebouncedAutosave(2);
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="flex justify-between mt-8 pt-6 border-t">
              <Button variant="ghost" onClick={() => handleNextStep(1)}>
                Back
              </Button>
              <Button
                size="lg"
                onClick={() => handleNextStep(3)}
                className="h-11 px-8 rounded-md font-semibold"
              >
                Target & Supervisors <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        );
      case 3: {
        const roster = selectedWorkspaceDetail?.roster || [];

        return (
          <div className="space-y-6">
            <Card className="shadow-none border">
              <CardHeader className="py-5 border-b">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Users className="size-5 text-primary" /> Target Audience{" "}
                      <span className="text-red-500">*</span>
                    </CardTitle>
                    <CardDescription>
                      Determine which students will take this assessment.
                    </CardDescription>
                  </div>
                  {metadata.audience_type === "selected" && (
                    <Badge
                      variant="secondary"
                      className="font-semibold text-xs h-7 px-3"
                    >
                      Selected: {metadata.target_student_ids?.length || 0} of{" "}
                      {roster.length} students
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <RadioGroup
                  value={metadata.audience_type || "all"}
                  onValueChange={(val: "all" | "selected") => {
                    const updated = {
                      ...metadata,
                      audience_type: val,
                      target_student_ids:
                        val === "all" ? [] : metadata.target_student_ids || [],
                    };
                    setMetadata(updated);
                    triggerDebouncedAutosave(3, updated);
                  }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <div>
                    <RadioGroupItem
                      value="all"
                      id="audience-all"
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor="audience-all"
                      className="flex flex-col items-start justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all h-full"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-primary opacity-0 peer-data-[state=checked]:opacity-100 [&:has([data-state=checked])]:opacity-100 transition-opacity" />
                        <span className="font-bold text-sm">
                          All Enrolled Students
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                        This assessment will automatically be assigned to all
                        students enrolled in the selected Teaching Workspace.
                      </p>
                    </Label>
                  </div>

                  <div>
                    <RadioGroupItem
                      value="selected"
                      id="audience-selected"
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor="audience-selected"
                      className="flex flex-col items-start justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all h-full"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-primary opacity-0 peer-data-[state=checked]:opacity-100 [&:has([data-state=checked])]:opacity-100 transition-opacity" />
                        <span className="font-bold text-sm">
                          Selected Students Only
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                        Restrict this assessment to specific students (e.g.
                        makeup, reassessment, special assignment).
                      </p>
                    </Label>
                  </div>
                </RadioGroup>

                {metadata.audience_type === "selected" && (
                  <div className="space-y-4 pt-4 border-t border-dashed animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="relative w-full sm:max-w-xs">
                        <Input
                          placeholder="Search student by name, email, or ID..."
                          value={studentSearch}
                          onChange={(e) => setStudentSearch(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          className="h-8 text-[11px] font-semibold"
                          onClick={() => {
                            const allIds = roster.map(
                              (s) => s.id || s.student_id,
                            );
                            const updated = {
                              ...metadata,
                              target_student_ids: allIds,
                            };
                            setMetadata(updated);
                            triggerDebouncedAutosave(3, updated);
                          }}
                        >
                          Select All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          className="h-8 text-[11px] font-semibold text-destructive hover:bg-destructive/5"
                          onClick={() => {
                            const updated = {
                              ...metadata,
                              target_student_ids: [],
                            };
                            setMetadata(updated);
                            triggerDebouncedAutosave(3, updated);
                          }}
                        >
                          Deselect All
                        </Button>
                      </div>
                    </div>

                    <div className="border rounded-lg overflow-hidden bg-background">
                      <ScrollArea className="h-72 w-full">
                        <div className="divide-y">
                          {filteredRoster.map((student) => {
                            const studentIdStr =
                              student.id || student.student_id;
                            const isChecked =
                              metadata.target_student_ids?.includes(
                                studentIdStr,
                              );
                            return (
                              <div
                                key={studentIdStr}
                                className="flex items-center justify-between p-3.5 hover:bg-muted/10 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <Checkbox
                                    id={`student-${studentIdStr}`}
                                    checked={isChecked}
                                    onCheckedChange={(checked) => {
                                      const updatedIds = checked
                                        ? [
                                            ...(metadata.target_student_ids ||
                                              []),
                                            studentIdStr,
                                          ]
                                        : (
                                            metadata.target_student_ids || []
                                          ).filter((id) => id !== studentIdStr);
                                      const updated = {
                                        ...metadata,
                                        target_student_ids: updatedIds,
                                      };
                                      setMetadata(updated);
                                      triggerDebouncedAutosave(3, updated);
                                    }}
                                  />
                                  <label
                                    htmlFor={`student-${studentIdStr}`}
                                    className="cursor-pointer space-y-0.5"
                                  >
                                    <p className="text-xs font-semibold text-foreground leading-none">
                                      {student.name}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {student.email}
                                    </p>
                                  </label>
                                </div>
                                <div className="text-right">
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] h-5 px-2 font-mono"
                                  >
                                    {student.student_id}
                                  </Badge>
                                </div>
                              </div>
                            );
                          })}
                          {filteredRoster.length === 0 && (
                            <div className="text-center py-16 text-muted-foreground text-xs italic">
                              {roster.length === 0
                                ? "No students enrolled in this workspace."
                                : "No matching students found."}
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between mt-8 pt-6 border-t">
              <Button variant="ghost" onClick={() => handleNextStep(2)}>
                Back
              </Button>
              <Button
                size="lg"
                onClick={() => handleNextStep(4)}
                className="h-11 px-8 rounded-md font-semibold"
              >
                Configure Blueprint <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        );
      }
      case 4:
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h2 className="text-lg font-semibold tracking-tight text-foreground/90">
                  Assessment Blueprint
                </h2>
                <p className="text-xs text-muted-foreground">
                  Setup target mark nodes and limits per section.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    if (aiCandidates.length > 0) {
                      toast.warning("Please review or clear your current candidate questions before generating new ones.");
                      setAiReviewDrawerOpen(true);
                      return;
                    }

                    const activeResult = await ensureDraftId();
                    if (!activeResult) return;

                    const defaults = {
                      topic: metadata.title || "",
                      question_type: "mcq",
                      difficulty: "medium",
                      bloom_level: "understand",
                      count: 5,
                      additional_context: "",
                      easyPercent: 30,
                      mediumPercent: 40,
                      hardPercent: 30,
                    };
                    setAiTargetSectionId("all");
                    setAiGenerationConfig(loadSavedAiConfig("all", defaults));
                    setAiDrawerOpen(true);
                  }}
                  variant="outline"
                  size="sm"
                  className="h-9"
                >
                  <BrainCircuit className="mr-2 size-4 text-primary" /> Generate
                  All with AI
                </Button>
                <Button
                  onClick={addSection}
                  variant="outline"
                  size="sm"
                  className="h-9"
                >
                  <Plus className="mr-2 size-4" /> Add Section
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {blueprint.map((sec, idx) => (
                <Card
                  key={sec.id}
                  className="shadow-none border hover:border-primary/10 transition-colors"
                >
                  <CardHeader className="bg-muted/10 border-b flex flex-row items-center justify-between p-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className="font-bold text-[10px] px-2 h-5 bg-background"
                      >
                        Section {idx + 1}
                      </Badge>
                      <Input
                        value={sec.section}
                        onChange={(e) => {
                          updateSection(sec.id, "section", e.target.value);
                          triggerDebouncedAutosave(4);
                        }}
                        className="font-bold text-sm p-0 h-auto bg-transparent border-none focus-visible:ring-0 w-48 uppercase shadow-none"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (aiCandidates.length > 0) {
                            toast.warning("Please review or clear your current candidate questions before generating new ones.");
                            setAiReviewDrawerOpen(true);
                            return;
                          }

                          const sectionIndex = blueprint.findIndex((s) => s.id === sec.id);
                          const activeResult = await ensureDraftId();
                          if (!activeResult) return;

                          let realSectionId = sec.id;
                          if (activeResult.sections && activeResult.sections[sectionIndex]) {
                            realSectionId = activeResult.sections[sectionIndex].id;
                          }
                           const defaults = {
                            topic: sec.topics || metadata.title || "",
                            question_type: sec.allowedTypes.length > 1 ? "mixed" : (sec.allowedTypes[0] || "mcq"),
                            difficulty: sec.difficulty.toLowerCase(),
                            count: sec.questions || 3,
                            bloom_level: sec.bloomLevel || "understand",
                            additional_context: sec.aiPromptHint || "",
                            easyPercent: 30,
                            mediumPercent: 40,
                            hardPercent: 30,
                          };
                          setAiTargetSectionId(realSectionId);
                          setAiGenerationConfig(loadSavedAiConfig(realSectionId, defaults));
                          setAiDrawerOpen(true);
                        }}
                        className="h-7 text-xs"
                      >
                        <BrainCircuit className="mr-1.5 size-3.5" /> AI Generate
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSection(sec.id)}
                        disabled={blueprint.length === 1}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-md"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor={`topics-${sec.id}`}>
                          Topic Domain Coverage
                        </Label>
                        <Input
                          id={`topics-${sec.id}`}
                          placeholder="e.g. SQL joins, transactions, query indexes"
                          value={sec.topics}
                          onChange={(e) => {
                            updateSection(sec.id, "topics", e.target.value);
                            triggerDebouncedAutosave(4);
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`marks-${sec.id}`}>
                            Allocated Marks
                          </Label>
                          <Input
                            type="number"
                            id={`marks-${sec.id}`}
                            placeholder="e.g. 20"
                            value={sec.marks === 0 ? "" : sec.marks}
                            onChange={(e) => {
                              updateSection(
                                sec.id,
                                "marks",
                                e.target.value === "" ? "" as any : parseInt(e.target.value) || 0,
                              );
                              triggerDebouncedAutosave(4);
                            }}
                            className="font-bold text-center"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`questions-${sec.id}`}>
                            Question Node Count
                          </Label>
                          <Input
                            type="number"
                            id={`questions-${sec.id}`}
                            placeholder="e.g. 5"
                            value={sec.questions === 0 ? "" : sec.questions}
                            onChange={(e) => {
                              updateSection(
                                sec.id,
                                "questions",
                                e.target.value === "" ? "" as any : parseInt(e.target.value) || 0,
                              );
                              triggerDebouncedAutosave(4);
                            }}
                            className="font-bold text-center"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Allowed Question Formats</Label>
                        <ToggleGroup
                          type="multiple"
                          value={sec.allowedTypes}
                          onValueChange={(v: any) => {
                            if (v.length > 0) {
                              updateSection(sec.id, "allowedTypes", v);
                            } else {
                              updateSection(sec.id, "allowedTypes", [...sec.allowedTypes]);
                            }
                          }}
                          className="flex flex-wrap gap-1.5 justify-start"
                        >
                          {[
                            "mcq",
                            "truefalse",
                            "shortanswer",
                            "essay",
                            "matching",
                            "fillblank",
                            "ordering",
                            "computational",
                            "casestudy",
                          ].map((type) => (
                            <ToggleGroupItem
                              key={type}
                              value={type}
                              className="h-8 px-2 text-[10px] font-bold uppercase border hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-white transition-all rounded-md"
                            >
                              {type}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-1.5">
                          <Label
                            htmlFor={`difficulty-${sec.id}`}
                            className="text-xs font-semibold"
                          >
                            Section Difficulty
                          </Label>
                          <select
                            id={`difficulty-${sec.id}`}
                            value={sec.difficulty}
                            onChange={(e) => {
                              updateSection(
                                sec.id,
                                "difficulty",
                                e.target.value as any,
                              );
                              triggerDebouncedAutosave(4);
                            }}
                            className="w-full h-9 rounded-lg border border-zinc-200 text-xs px-2.5 bg-white outline-none text-zinc-700"
                          >
                            <option value="Easy">Easy</option>
                            <option value="Medium">Medium</option>
                            <option value="Hard">Hard</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label
                            htmlFor={`bloom-${sec.id}`}
                            className="text-xs font-semibold"
                          >
                            Target Bloom&apos;s Level
                          </Label>
                          <select
                            id={`bloom-${sec.id}`}
                            value={sec.bloomLevel || "understand"}
                            onChange={(e) => {
                              updateSection(
                                sec.id,
                                "bloomLevel",
                                e.target.value as any,
                              );
                              triggerDebouncedAutosave(4);
                            }}
                            className="w-full h-9 rounded-lg border border-zinc-200 text-xs px-2.5 bg-white outline-none text-zinc-700"
                          >
                            <option value="remember">Remembering</option>
                            <option value="understand">Understanding</option>
                            <option value="apply">Applying</option>
                            <option value="analyze">Analyzing</option>
                            <option value="evaluate">Evaluating</option>
                            <option value="create">Creating</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="shadow-none border bg-muted/20">
              <CardContent className="p-4 space-y-4">
                <div className="flex flex-col md:flex-row justify-between gap-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground/80">
                  <div className="flex items-center gap-2">
                    <span>Blueprint Total:</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-sm font-bold bg-background",
                        totalMarks ===
                          parseInt((metadata.total_marks as any) || "0") &&
                          parseInt((metadata.total_marks as any) || "0") > 0
                          ? "text-emerald-600 border-emerald-400"
                          : "text-foreground",
                      )}
                    >
                      {totalMarks} /{" "}
                      {parseInt(metadata.total_marks as any) || "?"} Marks
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Total Questions:</span>
                    <Badge
                      variant="outline"
                      className="text-sm font-bold bg-background text-foreground"
                    >
                      {totalQuestions} Questions
                    </Badge>
                  </div>
                </div>
                <div className="border-t pt-4 grid grid-cols-2 gap-4 items-end">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="passingMarksPercent"
                      className="text-xs font-semibold"
                    >
                      Passing Threshold (%)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        id="passingMarksPercent"
                        min={1}
                        max={100}
                        value={passingMarksPercent}
                        onChange={(e) => {
                          setPassingMarksPercent(parseInt(e.target.value) || 0);
                          triggerDebouncedAutosave(4);
                        }}
                        className="h-9 w-24 text-center font-bold"
                      />
                      <span className="text-xs text-muted-foreground">
                        % of total marks
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                      Passing Mark
                    </p>
                    <Badge
                      variant={
                        metadata.passing_marks > 0 ? "default" : "secondary"
                      }
                      className="text-base px-4 py-1.5 font-bold"
                    >
                      {metadata.passing_marks || 0} / {totalMarks || "?"} marks
                    </Badge>
                    {totalMarks === 0 && (
                      <p className="text-[10px] text-amber-600">
                        Add section marks above to compute passing mark
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between mt-8 pt-6 border-t">
              <Button variant="ghost" onClick={() => handleNextStep(3)}>
                Back
              </Button>
              <Button
                size="lg"
                onClick={() => handleNextStep(5)}
                className="h-11 px-8 rounded-md font-semibold"
              >
                Structure & Questions <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between sticky top-14 z-30 bg-background/95 backdrop-blur-md py-3 border-b border-dashed">
              <div className="flex items-center gap-6">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">
                    Progress
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-bold text-primary">
                      {questions.length}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      / {totalQuestions} questions
                    </span>
                  </div>
                </div>
                <div className="w-px h-8 bg-muted" />
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">
                    Marks Matrix
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "text-lg font-bold",
                        currentMarks === totalMarks
                          ? "text-emerald-600"
                          : "text-destructive",
                      )}
                    >
                      {currentMarks}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      / {totalMarks} allocated
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
                    <Info className="mr-2 size-3.5" /> Grading Logic
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-125 p-0 overflow-hidden rounded-xl border shadow-xl"
                >
                  <div className="bg-muted/30 border-b p-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-foreground">
                      Grading Architecture
                    </h4>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                      Mindexa auto-grades closed questions and schedules open
                      questions for review.
                    </p>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-3">
                    <div className="p-3 rounded border bg-muted/5 space-y-1">
                      <div className="text-[8px] uppercase font-bold text-muted-foreground">
                        Closed
                      </div>
                      <div className="text-lg font-bold text-emerald-600">
                        {gradingArchitecture.closedQuestions}
                      </div>
                    </div>
                    <div className="p-3 rounded border bg-muted/5 space-y-1">
                      <div className="text-[8px] uppercase font-bold text-muted-foreground">
                        Open
                      </div>
                      <div className="text-lg font-bold text-amber-600">
                        {gradingArchitecture.openQuestions}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-8">
              {blueprint.map((sec, idx) => (
                <div key={sec.id} className="space-y-4">
                  <div className="flex items-center gap-3 bg-muted/20 p-3 rounded-lg border">
                    <Badge className="px-2.5 h-6 text-xs bg-muted text-foreground hover:bg-muted shadow-none uppercase border font-semibold">
                      Section {idx + 1}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold block truncate">
                        {sec.section} – {sec.topics || "General Topics"}
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">
                        {sec.marks} Marks Target
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold block">
                        {questions
                          .filter((q) => q.sectionId === sec.id)
                          .reduce((s, q) => s + q.marks, 0)}{" "}
                        / {sec.marks} Marks
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {questions
                      .filter((q) => q.sectionId === sec.id)
                      .map((q, qIdx) => (
                        <QuestionCard
                          key={q.id}
                          question={q}
                          index={qIdx}
                          allowedTypes={sec.allowedTypes}
                          onUpdate={(u) => {
                            updateQuestion(q.id, u);
                          }}
                          onDelete={() => {
                            removeQuestion(q.id);
                          }}
                          onSaveToBank={() => handleSaveToBank(q)}
                          onUpdateOption={(oi, u) => {
                            updateOption(q.id, oi, u);
                          }}
                          onAddOption={() => {
                            addOption(q.id);
                          }}
                          onRemoveOption={(oi) => {
                            removeOption(q.id, oi);
                          }}
                        />
                      ))}

                    <div className="flex gap-4">
                      <Button
                        variant="outline"
                        className="flex-1 h-14 border border-dashed hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col gap-0.5 justify-center"
                        onClick={() => {
                          addQuestion(sec.id);
                        }}
                      >
                        <Plus className="size-4 text-primary" />
                        <span className="font-bold uppercase text-[9px] tracking-wider text-muted-foreground">
                          Add Manually
                        </span>
                      </Button>
                      <QuestionBankSelector
                        selectedIds={questions.map((q) => q.id)}
                        onSelect={(q) => {
                          handleBankSelect(q, sec.id);
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-8 pt-6 border-t">
              <Button variant="ghost" onClick={() => handleNextStep(4)}>
                Back
              </Button>
              <Button
                size="lg"
                onClick={() => handleNextStep(6)}
                className="h-11 px-8 rounded-md font-semibold"
              >
                Review & Publish <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        );
      case 6: {
        const isControlled = [
          "CAT",
          "Summative",
          "Formative",
          "Final Exam",
        ].includes(metadata.mode);
        const isPublishButtonDisabled =
          isPublishing ||
          currentMarks !== totalMarks ||
          !metadata.teaching_workspace_id ||
          (metadata.audience_type === "selected" &&
            (!metadata.target_student_ids ||
              metadata.target_student_ids.length === 0));

        return (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight">
                {metadata.title || "Untitled Assessment"}
              </h2>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground uppercase font-bold">
                <span className="flex items-center gap-1">
                  <CalendarIcon className="size-3.5" />{" "}
                  {metadata.date ? format(metadata.date, "PPP") : "TBD"}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />{" "}
                  {formatDisplayTime(metadata.startTime)} -{" "}
                  {formatDisplayTime(metadata.endTime)} (
                  {metadata.durationMinutes}m)
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-3.5" /> {metadata.mode}
                </span>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-6">
                {/* Publishing & Monitoring Section */}
                <Card className="shadow-none border">
                  <CardHeader className="py-4 border-b">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Shield className="size-4 text-primary" /> Publishing &
                      Monitoring
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-5">
                    {isControlled ? (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Supervisor Assignment
                          </h4>
                          <p className="text-[11px] text-muted-foreground">
                            Assign staff members to invigilate and monitor this
                            controlled assessment.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-semibold">
                            Assigned Staff Members
                          </Label>
                          <div className="space-y-2 border rounded-lg p-3 bg-muted/10 divide-y divide-border/50">
                            {/* Chief Supervisor - locked to Creator */}
                            <div className="flex items-center justify-between pb-2">
                              <div>
                                <p className="text-xs font-bold text-foreground">
                                  {currentUser
                                    ? `${currentUser.profile?.first_name || currentUser.first_name || ""} ${currentUser.profile?.last_name || currentUser.last_name || ""}`
                                    : "Loading..."}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  Chief Supervisor
                                </p>
                              </div>
                              <Badge
                                variant="secondary"
                                className="text-[9px] bg-primary/10 text-primary border-none h-5 px-2"
                              >
                                Chief
                              </Badge>
                            </div>

                            {/* Assistant Supervisors & Observers */}
                            {supervisorList
                              .filter((s) => s.id !== currentUser?.id)
                              .map((sup) => (
                                <div
                                  key={sup.id}
                                  className="flex items-center justify-between py-2"
                                >
                                  <div>
                                    <p className="text-xs font-semibold text-foreground">
                                      {sup.name}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground capitalize">
                                      {sup.role === "ASSISTANT"
                                        ? "Assistant Supervisor"
                                        : "Observer"}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={sup.role}
                                      onValueChange={(val: any) => {
                                        const updatedList = supervisorList.map(
                                          (s) =>
                                            s.id === sup.id
                                              ? { ...s, role: val }
                                              : s,
                                        );
                                        setSupervisorList(updatedList);
                                        triggerDebouncedAutosave(6);
                                      }}
                                    >
                                      <SelectTrigger className="h-7 text-[10px] w-28">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="ASSISTANT">
                                          Assistant
                                        </SelectItem>
                                        <SelectItem value="OBSERVER">
                                          Observer
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setSupervisorList(
                                          supervisorList.filter(
                                            (s) => s.id !== sup.id,
                                          ),
                                        );
                                        triggerDebouncedAutosave(6);
                                      }}
                                      className="h-7 w-7 text-destructive hover:bg-destructive/5"
                                    >
                                      <X className="size-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              ))}

                            {supervisorList.filter(
                              (s) => s.id !== currentUser?.id,
                            ).length === 0 && (
                              <p className="text-[10px] text-muted-foreground italic text-center py-2">
                                No additional assistant supervisors or observers
                                assigned.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                          <div className="space-y-1">
                            <Label htmlFor="step6-add-sup" className="text-xs">
                              Add Staff Member
                            </Label>
                            <Select
                              onValueChange={(val) => {
                                const lect = availableLecturers.find(
                                  (l) => l.id === val,
                                );
                                if (
                                  lect &&
                                  !supervisorList.some((s) => s.id === val)
                                ) {
                                  const name = lect.profile
                                    ? `${lect.profile.first_name} ${lect.profile.last_name}`
                                    : `${lect.email}`;
                                  const updatedList = [
                                    ...supervisorList,
                                    {
                                      id: lect.id,
                                      name,
                                      role: pendingRole,
                                    },
                                  ];
                                  setSupervisorList(updatedList);
                                  triggerDebouncedAutosave(6);
                                }
                              }}
                            >
                              <SelectTrigger
                                id="step6-add-sup"
                                className="h-8 text-xs"
                              >
                                <SelectValue placeholder="Select staff..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableLecturers
                                  .filter(
                                    (l) =>
                                      l.id !== currentUser?.id &&
                                      !supervisorList.some(
                                        (s) => s.id === l.id,
                                      ),
                                  )
                                  .map((l) => (
                                    <SelectItem key={l.id} value={l.id}>
                                      {l.profile
                                        ? `${l.profile.first_name} ${l.profile.last_name}`
                                        : l.email}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="step6-add-role" className="text-xs">
                              Assign Role
                            </Label>
                            <Select
                              value={pendingRole}
                              onValueChange={(val: any) => setPendingRole(val)}
                            >
                              <SelectTrigger
                                id="step6-add-role"
                                className="h-8 text-xs"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ASSISTANT">
                                  Assistant Supervisor
                                </SelectItem>
                                <SelectItem value="OBSERVER">
                                  Observer
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground bg-muted/20 border p-3 rounded-lg flex items-center gap-2">
                        <Info className="size-4 text-primary" />
                        <span>
                          This is a low-risk assessment ({metadata.mode}). No
                          supervisor configuration is required.
                        </span>
                      </div>
                    )}

                    {isControlled && (
                      <div className="pt-4 border-t space-y-4">
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                            Monitoring & Integrity Policies
                          </h4>
                          <p className="text-[11px] text-muted-foreground">
                            Configure security levels and proctoring
                            constraints.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {[
                            {
                              key: "supervised",
                              label: "Proctored Exam",
                              desc: "Require supervision",
                            },
                            {
                              key: "browserRestricted",
                              label: "Safe Browser",
                              desc: "Forces fullscreen mode",
                            },
                            {
                              key: "integrityMonitoring",
                              label: "Integrity Checks",
                              desc: "Flag behavior alerts",
                            },
                          ].map((item) => (
                            <div
                              key={item.key}
                              className="flex items-center justify-between p-3 border rounded-lg bg-background"
                            >
                              <div className="space-y-0.5">
                                <Label
                                  className="text-xs font-semibold cursor-pointer"
                                  htmlFor={`s6-${item.key}`}
                                >
                                  {item.label}
                                </Label>
                                <p className="text-[9px] text-muted-foreground leading-none">
                                  {item.desc}
                                </p>
                              </div>
                              <Switch
                                id={`s6-${item.key}`}
                                size="sm"
                                checked={(rules as any)[item.key]}
                                onCheckedChange={(v) => {
                                  const updatedRules = {
                                    ...rules,
                                    [item.key]: v,
                                  };
                                  setRules(updatedRules);
                                  triggerDebouncedAutosave(6, undefined, updatedRules);
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {blueprint.map((sec) => (
                  <div key={sec.id} className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-1">
                      <h3 className="font-bold text-sm uppercase text-muted-foreground">
                        {sec.section}
                      </h3>
                      <Badge
                        variant="outline"
                        className="text-xs font-semibold"
                      >
                        {sec.marks} Marks
                      </Badge>
                    </div>
                    <div className="space-y-4">
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
                <Card className="shadow-none border md:sticky md:top-20">
                  <CardHeader className="py-4 border-b">
                    <CardTitle className="text-xs uppercase font-bold tracking-wider">
                      Checks Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">
                          Total Questions
                        </span>
                        <span
                          className={cn(
                            "font-bold",
                            questions.length !== totalQuestions
                              ? "text-amber-500"
                              : "text-emerald-600",
                          )}
                        >
                          {questions.length} / {totalQuestions}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">
                          Total Marks
                        </span>
                        <span
                          className={cn(
                            "font-bold",
                            currentMarks !== totalMarks
                              ? "text-destructive"
                              : "text-emerald-600",
                          )}
                        >
                          {currentMarks} / {totalMarks}
                        </span>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">
                        Finalization Checklist
                      </p>
                      <div className="grid gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          {blueprint.length > 0 ? (
                            <Check className="size-3.5 text-emerald-500" />
                          ) : (
                            <X className="size-3.5 text-destructive" />
                          )}
                          <span>Has blueprint sections</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {questions.length > 0 ? (
                            <Check className="size-3.5 text-emerald-500" />
                          ) : (
                            <X className="size-3.5 text-destructive" />
                          )}
                          <span>Has question nodes</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {currentMarks === totalMarks ? (
                            <Check className="size-3.5 text-emerald-500" />
                          ) : (
                            <X className="size-3.5 text-destructive" />
                          )}
                          <span>Marks sum matches total ({totalMarks})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {metadata.teaching_workspace_id ? (
                            <Check className="size-3.5 text-emerald-500" />
                          ) : (
                            <X className="size-3.5 text-destructive" />
                          )}
                          <span>Teaching Workspace selected</span>
                        </div>
                        {metadata.audience_type === "selected" && (
                          <div className="flex items-center gap-2">
                            {metadata.target_student_ids &&
                            metadata.target_student_ids.length > 0 ? (
                              <Check className="size-3.5 text-emerald-500" />
                            ) : (
                              <X className="size-3.5 text-destructive" />
                            )}
                            <span>
                              Targeted students selected (
                              {metadata.target_student_ids?.length || 0})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {metadata.result_release_mode === "SCHEDULED" && (
                      <div className="pt-3 border-t space-y-1.5">
                        <Label htmlFor="releaseAt">Release Date / Time</Label>
                        <Input
                          type="datetime-local"
                          id="releaseAt"
                          value={
                            rules.resultReleaseAt
                              ? format(
                                  new Date(rules.resultReleaseAt),
                                  "yyyy-MM-dd'T'HH:mm",
                                )
                              : ""
                          }
                          onChange={(e) => {
                            setRules({
                              ...rules,
                              resultReleaseAt: e.target.value
                                ? new Date(e.target.value)
                                : undefined,
                            });
                            triggerDebouncedAutosave(6);
                          }}
                          className="h-9 text-xs"
                        />
                      </div>
                    )}

                    <div className="pt-4 border-t space-y-3">
                      <div className="flex items-start gap-2.5">
                        <Checkbox
                          id="lecturerConfirm"
                          checked={lecturerConfirmed}
                          onCheckedChange={(checked) => {
                            setLecturerConfirmed(!!checked);
                          }}
                        />
                        <label
                          htmlFor="lecturerConfirm"
                          className="text-[10px] text-muted-foreground leading-tight cursor-pointer"
                        >
                          I have reviewed this assessment and confirm it is
                          ready for deployment.
                        </label>
                      </div>

                      <Button
                        onClick={handlePublish}
                        disabled={isPublishButtonDisabled || !lecturerConfirmed}
                        className="w-full h-10 text-xs font-semibold"
                      >
                        {isPublishing ? "Publishing..." : "Publish Assessment"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="flex justify-between mt-8 pt-6 border-t">
              <Button variant="ghost" onClick={() => handleNextStep(5)}>
                Back
              </Button>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Assessment Builder
          </h1>
          <p className="text-muted-foreground mt-1">
            Design secure academic assessments with ease
          </p>
        </div>
        <div className="flex items-center gap-3">
          {autosaveStatus === "saving" && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 animate-pulse">
              <LoaderCircleIcon className="size-3.5 animate-spin" /> Saving...
            </span>
          )}
          {autosaveStatus === "saved" && (
            <span className="text-xs text-emerald-600 flex items-center gap-1.5 font-medium">
              <Check className="size-3.5 text-emerald-600" /> Saved
            </span>
          )}
          {autosaveStatus === "error" && (
            <span className="text-xs text-destructive flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-3.5 text-destructive" /> Error
              saving
            </span>
          )}
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
            Step {activeStep} / 6
          </Badge>
        </div>
      </div>

      {selectedWorkspaceDetail && (
        <Card className="border border-border/50 bg-muted/10">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 w-full">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="bg-primary/5 text-primary border-primary/20 font-semibold text-xs"
                  >
                    {selectedWorkspaceDetail.class_name || "GLOBAL"}
                  </Badge>
                  <h3 className="text-sm font-bold text-foreground">
                    {selectedWorkspaceDetail.title} (
                    {selectedWorkspaceDetail.code})
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-y-2 gap-x-4 pt-3 text-[11px] text-muted-foreground border-t mt-3">
                  <div>
                    <span className="block font-medium text-foreground/75 uppercase tracking-wider text-[9px] mb-0.5">
                      Institution
                    </span>
                    <span className="text-foreground/90 font-medium">
                      {selectedWorkspaceDetail.institution_name}
                    </span>
                  </div>
                  <div>
                    <span className="block font-medium text-foreground/75 uppercase tracking-wider text-[9px] mb-0.5">
                      Department
                    </span>
                    <span className="text-foreground/90 font-medium">
                      {selectedWorkspaceDetail.department_name || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="block font-medium text-foreground/75 uppercase tracking-wider text-[9px] mb-0.5">
                      Program
                    </span>
                    <span className="text-foreground/90 font-medium">
                      {selectedWorkspaceDetail.option_name || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="block font-medium text-foreground/75 uppercase tracking-wider text-[9px] mb-0.5">
                      Class / Section
                    </span>
                    <span className="text-foreground/90 font-medium">
                      {selectedWorkspaceDetail.class_name || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="block font-medium text-foreground/75 uppercase tracking-wider text-[9px] mb-0.5">
                      Course / Module
                    </span>
                    <span className="text-foreground/90 font-medium">
                      {selectedWorkspaceDetail.title}
                    </span>
                  </div>
                  <div>
                    <span className="block font-medium text-foreground/75 uppercase tracking-wider text-[9px] mb-0.5">
                      Academic Year
                    </span>
                    <span className="text-foreground/90 font-medium">
                      {selectedWorkspaceDetail.academic_year.includes(
                        "Semester",
                      )
                        ? selectedWorkspaceDetail.academic_year
                            .split("Semester")[0]
                            .trim()
                        : selectedWorkspaceDetail.academic_year}
                    </span>
                  </div>
                  <div>
                    <span className="block font-medium text-foreground/75 uppercase tracking-wider text-[9px] mb-0.5">
                      Semester
                    </span>
                    <span className="text-foreground/90 font-medium">
                      {selectedWorkspaceDetail.academic_year.includes(
                        "Semester",
                      )
                        ? "Semester " +
                          selectedWorkspaceDetail.academic_year
                            .split("Semester")[1]
                            .trim()
                        : "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="block font-medium text-foreground/75 uppercase tracking-wider text-[9px] mb-0.5">
                      Total Students
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-primary">
                      <Users className="size-3" />{" "}
                      {selectedWorkspaceDetail.student_count}
                    </span>
                  </div>
                  <div>
                    <span className="block font-medium text-foreground/75 uppercase tracking-wider text-[9px] mb-0.5">
                      Status
                    </span>
                    <span
                      className={cn(
                        "text-xs font-semibold capitalize",
                        selectedWorkspaceDetail.status === "active" ||
                          selectedWorkspaceDetail.status === "ACTIVE"
                          ? "text-emerald-600"
                          : "text-amber-500",
                      )}
                    >
                      {selectedWorkspaceDetail.status || "Active"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Mobile Accordion Stepper (visible on mobile, hidden on desktop) */}
      <div className="md:hidden block space-y-4">
        {STEPS_DATA.map((s, index) => {
          const stepNum = index + 1;
          const isActive = activeStep === stepNum;
          return (
            <div
              key={index}
              className="border rounded-lg overflow-hidden bg-card shadow-sm"
            >
              <button
                type="button"
                onClick={() => handleNextStep(stepNum)}
                className="flex items-center justify-between w-full p-4 font-semibold text-sm hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "size-6 text-xs rounded-full flex items-center justify-center font-bold transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {stepNum}
                  </span>
                  <span className="font-semibold text-foreground">
                    {s.title}
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform duration-200",
                    isActive && "rotate-180",
                  )}
                />
              </button>
              {isActive && (
                <div className="p-4 border-t bg-background space-y-6">
                  {renderStepContent(stepNum)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Stepper (visible on desktop, hidden on mobile) */}
      <div className="hidden md:block">
        <Stepper
          value={activeStep}
          onValueChange={handleNextStep}
          className="space-y-6"
        >
          <StepperNav className="flex w-full gap-2 border-b">
            {STEPS_DATA.map((s, index) => {
              const stepNum = index + 1;
              return (
                <StepperItem key={index} step={stepNum} className="flex-1">
                  <StepperTrigger className="flex w-full flex-row items-center justify-center gap-2 p-3 rounded-none border-b-2 border-transparent transition-all hover:bg-muted/50 data-[state=active]:bg-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
                    <StepperIndicator className="size-5 text-[10px] rounded-full bg-muted text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      {stepNum}
                    </StepperIndicator>
                    <StepperTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground data-[state=active]:text-foreground">
                      {s.title}
                    </StepperTitle>
                  </StepperTrigger>
                </StepperItem>
              );
            })}
          </StepperNav>

          <StepperPanel>
            <StepperContent value={1}>{renderStepContent(1)}</StepperContent>
            <StepperContent value={2}>{renderStepContent(2)}</StepperContent>
            <StepperContent value={3}>{renderStepContent(3)}</StepperContent>
            <StepperContent value={4}>{renderStepContent(4)}</StepperContent>
            <StepperContent value={5}>{renderStepContent(5)}</StepperContent>
            <StepperContent value={6}>{renderStepContent(6)}</StepperContent>
          </StepperPanel>
        </Stepper>
      </div>

      {/* AI GENERATION CONFIG DIALOG */}
      <Dialog open={aiDrawerOpen} onOpenChange={setAiDrawerOpen}>
        <DialogContent className="sm:max-w-162.5 md:max-w-175 w-full p-6 flex flex-col max-h-[90vh]">
          <DialogHeader className="border-b pb-4 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <BrainCircuit className="size-5 text-primary animate-pulse" /> AI
              Question Generator Settings
            </DialogTitle>
            <DialogDescription>
              Configure generation constraints. AI will draft questions matching
              these criteria.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-4 no-scrollbar max-h-[60vh] overflow-y-auto px-4 py-2 space-y-4 flex-1">
            {aiTargetSectionId === "all" ? (
              <div className="space-y-4">
                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg space-y-2 text-xs text-zinc-600">
                  <div>
                    <strong>Course Workspace:</strong>{" "}
                    {selectedWorkspaceDetail?.title ||
                      "No course workspace selected"}
                  </div>
                  <div>
                    <strong>Assessment Title:</strong>{" "}
                    {metadata.title || "Untitled Assessment"}
                  </div>
                  <div>
                    <strong>Assessment Type:</strong> {metadata.mode || "CAT"}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-zinc-700">
                    Blueprint Distribution Summary
                  </Label>
                  <div className="space-y-2 border p-3 rounded-lg bg-zinc-50/50">
                    {blueprint.map((sec, idx) => (
                      <div
                        key={sec.id}
                        className="flex justify-between items-center text-xs pb-1.5 border-b last:border-0 last:pb-0 border-zinc-100"
                      >
                        <div>
                          <span className="font-semibold text-zinc-800">
                            Section {idx + 1}: {sec.section}
                          </span>
                          <div className="text-[10px] text-zinc-400 truncate max-w-50">
                            {sec.topics || "General topics"}
                          </div>
                        </div>
                        <div className="text-right text-[10px] font-medium text-zinc-500">
                          <div>
                            {sec.questions || 0} Questions · {sec.marks || 0}{" "}
                            Marks
                          </div>
                          <div className="uppercase text-[9px] text-zinc-400">
                            {sec.difficulty} · {sec.bloomLevel || "understand"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-[10px] text-amber-800 leading-normal">
                  <strong>Assessment balancing:</strong> The AI Question
                  Generation Agent will generate a balanced set of questions
                  mapping to each blueprint section&apos;s topics, difficulty
                  level, and Bloom&apos;s Taxonomy setting automatically.
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Subject / Topic Focus
                  </Label>
                  <Input
                    value={aiGenerationConfig.topic}
                    onChange={(e) =>
                      setAiGenerationConfig({
                        ...aiGenerationConfig,
                        topic: e.target.value,
                      })
                    }
                    placeholder="e.g. Database indexes, B-Trees, Query Optimization"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Question Type
                    </Label>
                    <Select
                      value={aiGenerationConfig.question_type}
                      onValueChange={(v: any) =>
                        setAiGenerationConfig({
                          ...aiGenerationConfig,
                          question_type: v,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const allTypes = [
                            { value: "mcq", label: "Multiple Choice (MCQ)" },
                            { value: "truefalse", label: "True / False" },
                            { value: "shortanswer", label: "Short Answer" },
                            { value: "essay", label: "Essay" },
                            { value: "matching", label: "Matching Pairs" },
                            { value: "fillblank", label: "Fill-in-the-Blank" },
                            { value: "computational", label: "Computational" },
                            { value: "ordering", label: "Ordering" },
                            { value: "casestudy", label: "Case Study" },
                          ];
                          const activeSec = blueprint.find((b) => b.id === aiTargetSectionId);
                          let visibleTypes = activeSec && activeSec.allowedTypes?.length > 0
                            ? allTypes.filter((t) => (activeSec.allowedTypes as string[]).includes(t.value))
                            : allTypes;

                          if (activeSec && activeSec.allowedTypes && activeSec.allowedTypes.length > 1) {
                            visibleTypes = [
                              { value: "mixed", label: "Mixed (All Selected Formats)" },
                              ...visibleTypes,
                            ];
                          }
                          return visibleTypes.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Target Questions Count
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={aiGenerationConfig.count}
                      onChange={(e) =>
                        setAiGenerationConfig({
                          ...aiGenerationConfig,
                          count: parseInt(e.target.value) || 3,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Difficulty Level
                    </Label>
                    <Select
                      value={aiGenerationConfig.difficulty}
                      onValueChange={(v: any) =>
                        setAiGenerationConfig({
                          ...aiGenerationConfig,
                          difficulty: v,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      {"Bloom's Taxonomy Level"}
                    </Label>
                    <Select
                      value={aiGenerationConfig.bloom_level}
                      onValueChange={(v: any) =>
                        setAiGenerationConfig({
                          ...aiGenerationConfig,
                          bloom_level: v,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="remember">Remember</SelectItem>
                        <SelectItem value="understand">Understand</SelectItem>
                        <SelectItem value="apply">Apply</SelectItem>
                        <SelectItem value="analyze">Analyze</SelectItem>
                        <SelectItem value="evaluate">Evaluate</SelectItem>
                        <SelectItem value="create">Create</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5 pt-2">
              <Label className="text-xs font-semibold">
                Additional Context / Custom Prompt
              </Label>
              <Textarea
                placeholder="Include details about what concepts to cover, expected outcomes, or specific coding/math expressions to include..."
                className="min-h-25"
                value={aiGenerationConfig.additional_context}
                onChange={(e) =>
                  setAiGenerationConfig({
                    ...aiGenerationConfig,
                    additional_context: e.target.value,
                  })
                }
              />
            </div>
          </div>
          <div className="border-t pt-4 flex justify-end gap-2 bg-background shrink-0 mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAiDrawerOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAIGenerate}
              disabled={
                aiGenerating ||
                (aiTargetSectionId !== "all" && !aiGenerationConfig.topic)
              }
              size="sm"
              className="font-semibold"
            >
              {aiGenerating ? (
                <>
                  <LoaderCircleIcon className="mr-2 h-4 w-4 animate-spin" />{" "}
                  Generating...
                </>
              ) : (
                <>
                  <BrainCircuit className="mr-2 h-4 w-4" /> Start AI Generation
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI REVIEW CANDIDATES SHEET */}
      <Sheet
        open={aiReviewDrawerOpen}
        onOpenChange={(open) => {
          setAiReviewDrawerOpen(open);
          if (!open && questionsRef.current.length > 0 && activeStep !== 6) {
            setActiveStep(5);
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-2xl md:max-w-3xl p-6 flex flex-col h-full overflow-hidden">
          <SheetHeader className="border-b pb-4 shrink-0">
            <SheetTitle className="flex items-center gap-2 text-lg font-bold">
              <CheckCircle2 className="size-5 text-emerald-500" /> Review AI
              Question Candidates
            </SheetTitle>
            <SheetDescription>
              Accept, edit, or reject the AI generated candidate questions
              below.
            </SheetDescription>
            {/* Source legend */}
            <div className="flex items-center gap-3 pt-1 flex-wrap">
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Source:</span>
              <div className="flex items-center gap-1.5">
                <Badge className="text-[10px] font-semibold gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 pointer-events-none">
                  <BookOpen className="size-2.5" /> Lecture Material
                </Badge>
                <span className="text-[10px] text-muted-foreground">grounded in your uploaded course materials</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge className="text-[10px] font-semibold gap-1 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50 pointer-events-none">
                  <BrainCircuit className="size-2.5" /> AI Knowledge
                </Badge>
                <span className="text-[10px] text-muted-foreground">no matching lecture material found — review carefully</span>
              </div>
            </div>
          </SheetHeader>

          {aiFailedSectionIds.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3 shrink-0 my-2">
              <div className="flex gap-2.5 items-start text-xs text-amber-800">
                <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <strong className="font-semibold block mb-0.5">
                    Partial Generation Failure
                  </strong>
                  Some sections failed to generate questions:{" "}
                  {blueprint
                    .filter((s) => aiFailedSectionIds.includes(s.id))
                    .map((s, idx, arr) => (
                      <span key={s.id} className="font-semibold">
                        {s.section}
                        {idx < arr.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  . You can retry generating just the failed sections.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryFailedSections}
                disabled={aiGenerating}
                className="w-full bg-white hover:bg-amber-100 border-amber-300 text-amber-900 font-semibold h-8 text-xs"
              >
                {aiGenerating ? (
                  <>
                    <LoaderCircleIcon className="mr-2 h-3.5 w-3.5 animate-spin" />{" "}
                    Retrying...
                  </>
                ) : (
                  <>
                    <BrainCircuit className="mr-2 h-3.5 w-3.5 text-primary" />{" "}
                    Retry Failed Sections
                  </>
                )}
              </Button>
            </div>
          )}

          <div className="-mx-4 no-scrollbar max-h-[60vh] overflow-y-auto px-4 py-2 space-y-6 flex-1">
            <div className="space-y-6">
              {aiCandidates.map((cand, idx) => (
                <Card
                  key={cand.id}
                  className="shadow-none border hover:border-primary/20 transition-all"
                >
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-bold uppercase"
                        >
                          {cand.question_type}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="text-[10px] uppercase"
                        >
                          {cand.difficulty}
                        </Badge>
                        {/* RAG source badge — tells the lecturer how the question was grounded */}
                        {cand.grounded_by_rag ? (
                          <Badge className="text-[10px] font-semibold gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50">
                            <BookOpen className="size-2.5" />
                            Lecture Material
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] font-semibold gap-1 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50">
                            <BrainCircuit className="size-2.5" />
                            AI Knowledge
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleAcceptCandidate(cand.id)}
                          className="h-8 w-8 text-emerald-600 hover:bg-emerald-50"
                        >
                          <Check className="size-4" />
                        </Button>
                         <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingCandidateId(cand.id);
                            setEditingText(cand.parsed_question_text || "");
                            setEditingExplanation(
                              cand.parsed_explanation || "",
                            );
                            setEditingOptions(
                              (cand.options || cand._options || []).map((o: any) => ({
                                option_text: o.text || o.option_text || "",
                                option_text_right: o.option_text_right || o.explanation || "",
                                is_correct: o.is_correct ?? false,
                                order_index: o.order_index ?? 0,
                                match_key: o.match_key,
                              }))
                            );
                          }}
                          className="h-8 w-8 text-primary hover:bg-primary/5"
                        >
                          <FileText className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRejectCandidate(cand.id)}
                          className="h-8 w-8 text-destructive hover:bg-destructive/5"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {editingCandidateId === cand.id ? (
                      <div className="space-y-3 pt-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">
                            Edit Question Content
                          </Label>
                          <Textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="min-h-20"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">
                            Edit Explanation
                          </Label>
                          <Textarea
                            value={editingExplanation}
                            onChange={(e) =>
                              setEditingExplanation(e.target.value)
                            }
                          />
                        </div>

                        {editingOptions.length > 0 && (
                          <div className="space-y-2.5 pt-2 border-t border-dashed">
                            <Label className="text-xs font-semibold">
                              Edit Options / Choices
                            </Label>
                            <div className="space-y-2">
                              {editingOptions.map((opt, oIdx) => {
                                const qType = mapBackendToFrontendType(cand.question_type);
                                return (
                                  <div key={oIdx} className="flex gap-2 items-center">
                                    {qType === "matching" ? (
                                      <>
                                        <Input
                                          value={opt.option_text || ""}
                                          onChange={(e) => {
                                            const newOpts = [...editingOptions];
                                            newOpts[oIdx] = { ...newOpts[oIdx], option_text: e.target.value };
                                            setEditingOptions(newOpts);
                                          }}
                                          placeholder="Left value..."
                                          className="h-8 text-xs flex-1"
                                        />
                                        <span className="text-xs text-muted-foreground">➔</span>
                                        <Input
                                          value={opt.option_text_right || ""}
                                          onChange={(e) => {
                                            const newOpts = [...editingOptions];
                                            newOpts[oIdx] = { ...newOpts[oIdx], option_text_right: e.target.value };
                                            setEditingOptions(newOpts);
                                          }}
                                          placeholder="Right value..."
                                          className="h-8 text-xs flex-1"
                                        />
                                      </>
                                    ) : qType === "casestudy" ? (
                                      <>
                                        <Input
                                          value={opt.option_text || ""}
                                          onChange={(e) => {
                                            const newOpts = [...editingOptions];
                                            newOpts[oIdx] = { ...newOpts[oIdx], option_text: e.target.value };
                                            setEditingOptions(newOpts);
                                          }}
                                          placeholder="Sub-question text..."
                                          className="h-8 text-xs flex-1"
                                        />
                                        <Input
                                          type="number"
                                          value={opt.match_key !== undefined && opt.match_key !== null ? opt.match_key : "5"}
                                          onChange={(e) => {
                                            const newOpts = [...editingOptions];
                                            newOpts[oIdx] = { ...newOpts[oIdx], match_key: e.target.value };
                                            setEditingOptions(newOpts);
                                          }}
                                          placeholder="Marks"
                                          className="h-8 text-xs w-16 text-center"
                                        />
                                      </>
                                    ) : (
                                      <>
                                        <Checkbox
                                          checked={opt.is_correct}
                                          onCheckedChange={(checked) => {
                                            const newOpts = [...editingOptions];
                                            if (qType === "truefalse" || qType === "mcq") {
                                              if (checked) {
                                                newOpts.forEach((o, idx) => {
                                                  o.is_correct = idx === oIdx;
                                                });
                                              } else {
                                                newOpts[oIdx].is_correct = false;
                                              }
                                            } else {
                                              newOpts[oIdx].is_correct = !!checked;
                                            }
                                            setEditingOptions(newOpts);
                                          }}
                                        />
                                        <Input
                                          value={opt.option_text || ""}
                                          onChange={(e) => {
                                            const newOpts = [...editingOptions];
                                            newOpts[oIdx] = { ...newOpts[oIdx], option_text: e.target.value };
                                            setEditingOptions(newOpts);
                                          }}
                                          placeholder="Option text..."
                                          className="h-8 text-xs flex-1"
                                        />
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingCandidateId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSaveEditedCandidate(cand.id)}
                          >
                            Save & Accept
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold">
                          {cand.parsed_question_text}
                        </p>
                        {(() => {
                          const opts = cand.options || cand._options || [];
                          return opts.length > 0 && (
                            <div className="grid grid-cols-2 gap-2 pt-2">
                              {opts.map((opt: any, oIdx: number) => (
                              <div
                                key={oIdx}
                                className={cn(
                                  "text-xs p-2 rounded border flex items-center justify-between",
                                  opt.is_correct
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                    : "bg-muted/10 border-border",
                                )}
                              >
                                <span>
                                  {(() => {
                                    const textVal = opt.text || opt.option_text || "";
                                    const rightVal = opt.explanation || opt.option_text_right || "";
                                    const marksVal = opt.match_key !== undefined && opt.match_key !== null ? opt.match_key : "5";
                                    const normType = (cand.question_type || "").toLowerCase().replaceAll("_", "");
                                    
                                    if (normType === "matching") {
                                      return `${textVal} ➔ ${rightVal}`;
                                    }
                                    if (normType === "casestudy") {
                                      const guidance = rightVal ? ` — Guidance: ${rightVal}` : "";
                                      return `${textVal} (${marksVal} Marks)${guidance}`;
                                    }
                                    return textVal;
                                  })()}
                                </span>
                                {opt.is_correct && (
                                  <Check className="size-3 text-emerald-600" />
                                )}
                              </div>
                            ))}
                          </div>
                          );
                        })()}
                        {cand.parsed_explanation && (
                          <div className="text-[11px] text-muted-foreground bg-muted/10 p-2 rounded border border-dashed mt-2">
                            <strong>Explanation:</strong>{" "}
                            {cand.parsed_explanation}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {aiCandidates.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
                  <CheckCircle2 className="size-8 text-emerald-500" />
                  <p className="text-sm font-semibold">
                    All candidates reviewed
                  </p>
                  <p className="text-xs text-muted-foreground">
                    You can close this dialog now.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t pt-4 flex justify-between items-center bg-background shrink-0 mt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                id="global-save-to-bank"
                checked={saveToBank}
                onCheckedChange={(checked) => setSaveToBank(!!checked)}
              />
              <Label
                htmlFor="global-save-to-bank"
                className="cursor-pointer font-medium text-foreground"
              >
                Also save approved questions to the Question Bank
              </Label>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAiReviewDrawerOpen(false)}
                className="text-xs h-8 text-muted-foreground"
              >
                Close
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRejectAllCandidates}
                className="text-xs h-8 text-destructive hover:bg-destructive/5"
              >
                Reject All
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleAcceptAllCandidates}
                className="text-xs h-8 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Accept All
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
