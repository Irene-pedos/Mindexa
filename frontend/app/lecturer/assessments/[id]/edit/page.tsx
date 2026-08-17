// app/lecturer/assessments/[id]/edit/page.tsx
"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useParams, useRouter } from "next/navigation";
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
  Sparkles,
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
  Sigma,
  Table as TableIcon,
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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiClient } from "@/lib/api/client";
import { questionApi } from "@/lib/api/question";
import { assessmentApi } from "@/lib/api/assessment";
import { groupWorkApi } from "@/lib/api/group-work";
import { authApi } from "@/lib/api/auth";
import { academicApi } from "@/lib/api/academic";
import { aiGenerationApi } from "@/lib/api/ai-generation";
import {
  lecturerApi,
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
import { MathEditorDialog } from "@/components/mindexa/common/math-editor-dialog";
import { TableEditor } from "@/components/mindexa/assessment/table-editor";
import { TableContextViewer } from "@/components/mindexa/common/table-context-viewer";
import { renderRichMathText } from "@/components/mindexa/common/math-renderer";

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
  | "Groupwork"
  | "Reassessment";

type GroupFormationMode = "SELF_ENROL" | "LECTURER_ASSIGNED" | "AUTO_BALANCED";
type QuestionDistributionMode = "SHARED" | "PER_GROUP";
type GroupSubmissionMode = "SINGLE_LEADER" | "ALL_MEMBERS" | "MAJORITY_VOTE";

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

interface GroupMember {
  id: string; // unique ID for React keys and DnD component tracking
  student_id?: string; // explicit student system ID
  member_record_id?: string; // backend group member record ID
  name: string;
  email: string;
  is_leader?: boolean;
}

interface Group {
  id: string;
  name: string;
  members: GroupMember[];
}

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
  per_group?: boolean;
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
  question_table_context?: any;
  questionTableContext?: any;
  requires_table_answer?: boolean;
  requiresTableAnswer?: boolean;
  answer_table_template?: any;
  answerTableTemplate?: any;
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
  disabled = false,
}: {
  id: string;
  index: number;
  option: any;
  onUpdateText: (val: string) => void;
  onRemove: () => void;
  disabled?: boolean;
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
      {!disabled && (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="size-4" />
        </div>
      )}
      <Badge variant="outline">{index + 1}</Badge>
      <Input
        value={option.option_text || option.text || ""}
        onChange={(e) => onUpdateText(e.target.value)}
        className="flex-1 h-9"
        placeholder={`Step ${index + 1}`}
        disabled={disabled}
      />
      {!disabled && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="text-destructive h-8 w-8"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

function LecturerOrderingList({
  options,
  onUpdateOptions,
  onAddOption,
  onUpdateOptionText,
  onRemoveOption,
  disabled = false,
}: {
  options: any[];
  onUpdateOptions: (newOptions: any[]) => void;
  onAddOption: () => void;
  onUpdateOptionText: (index: number, val: string) => void;
  onRemoveOption: (index: number) => void;
  disabled?: boolean;
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
    if (disabled) return;
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
                disabled={disabled}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {!disabled && (
        <Button variant="outline" size="sm" onClick={onAddOption}>
          <Plus className="size-3 mr-2" /> Add Item
        </Button>
      )}
    </div>
  );
}

function SortableMatchingPairItem({
  id,
  option,
  onUpdateLeft,
  onUpdateRight,
  onRemove,
  disabled = false,
}: {
  id: string;
  option: any;
  onUpdateLeft: (val: string) => void;
  onUpdateRight: (val: string) => void;
  onRemove: () => void;
  disabled?: boolean;
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
      {!disabled && (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="size-4" />
        </div>
      )}
      <Input
        value={option.option_text || ""}
        onChange={(e) => onUpdateLeft(e.target.value)}
        className="flex-1 h-9"
        placeholder="Premise (Left)"
        disabled={disabled}
      />
      <ChevronRight className="size-4 text-muted-foreground opacity-30" />
      <Input
        value={option.option_text_right || ""}
        onChange={(e) => onUpdateRight(e.target.value)}
        className="flex-1 h-9"
        placeholder="Response (Right)"
        disabled={disabled}
      />
      {!disabled && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="text-destructive h-8 w-8"
        >
          <X className="size-4" />
        </Button>
      )}
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
  disabled = false,
}: {
  options: any[];
  onUpdateOptions: (newOptions: any[]) => void;
  onAddOption: () => void;
  onUpdateOptionLeft: (index: number, val: string) => void;
  onUpdateOptionRight: (index: number, val: string) => void;
  onRemoveOption: (index: number) => void;
  disabled?: boolean;
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
    if (disabled) return;
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
                disabled={disabled}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {!disabled && (
        <Button variant="outline" size="sm" onClick={onAddOption}>
          <Plus className="size-3 mr-2" /> Add Pair
        </Button>
      )}
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
  disabled = false,
  workspaceId,
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
  disabled?: boolean;
  workspaceId?: string;
}) {
  const [showMediaUpload, setShowMediaUpload] = useState(!!question.imageUrl);
  const [showTableStemEditor, setShowTableStemEditor] = useState(
    !!(question.question_table_context || question.questionTableContext)
  );
  const [showTableAnswerEditor, setShowTableAnswerEditor] = useState(
    !!(question.requires_table_answer || question.requiresTableAnswer)
  );
  const [mathDialogOpen, setMathDialogOpen] = useState(false);
  const [mathTargetField, setMathTargetField] = useState<{
    field: "text" | "solutionSteps" | "caseStudyContext" | "option";
    optionIndex?: number;
  } | null>(null);

  const openMathEditor = (
    field: "text" | "solutionSteps" | "caseStudyContext" | "option",
    optionIndex?: number
  ) => {
    setMathTargetField({ field, optionIndex });
    setMathDialogOpen(true);
  };

  const handleInsertMath = (mathString: string) => {
    if (!mathTargetField) return;
    if (mathTargetField.field === "text") {
      onUpdate({
        text: question.text ? `${question.text} ${mathString}` : mathString,
      });
    } else if (mathTargetField.field === "solutionSteps") {
      onUpdate({
        solutionSteps: question.solutionSteps
          ? `${question.solutionSteps} ${mathString}`
          : mathString,
      });
    } else if (mathTargetField.field === "caseStudyContext") {
      onUpdate({
        caseStudyContext: question.caseStudyContext
          ? `${question.caseStudyContext} ${mathString}`
          : mathString,
      });
    } else if (
      mathTargetField.field === "option" &&
      mathTargetField.optionIndex !== undefined
    ) {
      const idx = mathTargetField.optionIndex;
      const currentOpt = question.options[idx];
      if (currentOpt) {
        onUpdateOption(idx, {
          option_text: currentOpt.option_text
            ? `${currentOpt.option_text} ${mathString}`
            : mathString,
        });
      }
    }
    setMathDialogOpen(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image too large. Max 5MB.");
        return;
      }

      if (workspaceId) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("teaching_workspace_id", workspaceId);
        formData.append("is_student_visible", "true");
        formData.append("material_category", "GENERAL");
        formData.append("display_name", file.name);

        toast.promise(
          lecturerApi.uploadMaterial(formData).then((res) => {
            const downloadUrl = `/api/v1/resources/download/${res.id}`;
            onUpdate({ imageUrl: downloadUrl });
          }),
          {
            loading: "Uploading image...",
            success: "Image uploaded and linked successfully.",
            error: () => {
              // fallback
              const reader = new FileReader();
              reader.onloadend = () => {
                onUpdate({ imageUrl: reader.result as string });
              };
              reader.readAsDataURL(file);
              return "Server upload failed. Falling back to local data URL.";
            },
          },
        );
      } else {
        const reader = new FileReader();
        reader.onloadend = () => {
          onUpdate({ imageUrl: reader.result as string });
        };
        reader.readAsDataURL(file);
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
              disabled={disabled}
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
                disabled={disabled}
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
                onClick={() => setShowMediaUpload(!showMediaUpload)}
                className={cn(
                  "h-8 w-8",
                  showMediaUpload
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground",
                )}
                title="Add Media / Diagram"
              >
                <ImageIcon className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onSaveToBank}
                className="text-primary hover:bg-primary/5 h-8 w-8"
                title="Save to Bank"
              >
                <Database className="size-4" />
              </Button>
              {!disabled && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDelete}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/5 h-8 w-8"
                  title="Delete Question"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Question Text & Media */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Question Content</Label>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openMathEditor("text")}
                  className="h-7 px-2 text-xs text-primary hover:bg-primary/10 gap-1 font-semibold"
                >
                  <Sigma className="size-3.5" /> Insert Math / Formula
                </Button>
              )}
            </div>
            <Textarea
              placeholder="Write your question text here... (Supports LaTeX: $formula$ or $$block$$)"
              value={question.text}
              disabled={disabled}
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

          {/* Structured Table Section */}
          <div className="space-y-3 p-4 border rounded-xl bg-zinc-50/50 dark:bg-muted/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TableIcon className="size-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Structured Tables & Datasets
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={showTableStemEditor ? "default" : "outline"}
                  size="sm"
                  disabled={disabled}
                  onClick={() => {
                    const nextShow = !showTableStemEditor;
                    setShowTableStemEditor(nextShow);
                    if (
                      nextShow &&
                      !(
                        question.question_table_context ||
                        question.questionTableContext
                      )
                    ) {
                      const initialTable = {
                        title: "",
                        headers: [
                          "Item / Description",
                          "Debit ($)",
                          "Credit ($)",
                        ],
                        rows: [
                          ["Initial Balance", "5,000", ""],
                          ["Service Revenue", "", "2,500"],
                        ],
                      };
                      onUpdate({
                        question_table_context: initialTable,
                        questionTableContext: initialTable,
                      });
                    }
                  }}
                  className="h-7 px-2.5 text-[11px]"
                >
                  {question.question_table_context || question.questionTableContext
                    ? "Edit Reference Table"
                    : "+ Add Reference Table"}
                </Button>
                {(question.type === "shortanswer" ||
                  question.type === "essay" ||
                  question.type === "computational" ||
                  question.type === "casestudy") && (
                  <Button
                    type="button"
                    variant={showTableAnswerEditor ? "default" : "outline"}
                    size="sm"
                    disabled={disabled}
                    onClick={() => {
                      const nextVal = !(
                        question.requires_table_answer ||
                        question.requiresTableAnswer
                      );
                      const updates: any = {
                        requires_table_answer: nextVal,
                        requiresTableAnswer: nextVal,
                      };
                      if (
                        nextVal &&
                        !(
                          question.answer_table_template ||
                          question.answerTableTemplate
                        )
                      ) {
                        const defaultAnswerTable = {
                          title: "Student Response Table",
                          headers: ["Column 1", "Column 2", "Column 3"],
                          rows: [["", "", ""]],
                        };
                        updates.answer_table_template = defaultAnswerTable;
                        updates.answerTableTemplate = defaultAnswerTable;
                      }
                      onUpdate(updates);
                      setShowTableAnswerEditor(nextVal);
                    }}
                    className="h-7 px-2.5 text-[11px]"
                  >
                    {question.requires_table_answer || question.requiresTableAnswer
                      ? "✓ Requires Table Answer"
                      : "Require Table Answer"}
                  </Button>
                )}
              </div>
            </div>

            {showTableStemEditor && (
              <div className="mt-3 p-3 bg-background border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Question Stem Reference Table</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => {
                      onUpdate({ question_table_context: undefined, questionTableContext: undefined });
                      setShowTableStemEditor(false);
                    }}
                    className="h-6 text-[10px] text-destructive hover:bg-destructive/10"
                  >
                    Remove Table
                  </Button>
                </div>
                <TableEditor
                  initialData={question.question_table_context || question.questionTableContext}
                  onChange={(data) => onUpdate({ question_table_context: data, questionTableContext: data })}
                />
              </div>
            )}

            {showTableAnswerEditor && (question.requires_table_answer || question.requiresTableAnswer) && (
              <div className="mt-3 p-3 bg-background border rounded-lg space-y-2">
                <span className="text-xs font-semibold text-muted-foreground">Student Answer Table Template Grid</span>
                <TableEditor
                  initialData={question.answer_table_template || question.answerTableTemplate}
                  onChange={(data) => onUpdate({ answer_table_template: data, answerTableTemplate: data })}
                />
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
                    src={question.imageUrl}
                    alt="Diagram"
                    width={800}
                    height={600}
                    unoptimized
                    className="max-h-60 rounded-md object-contain w-auto h-auto"
                  />
                  {!disabled && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onUpdate({ imageUrl: undefined })}
                      >
                        <Trash2 className="size-4 mr-2" /> Remove Image
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                !disabled && (
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
                )
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
                  disabled={disabled}
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
                  disabled={disabled}
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
            </div>            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase text-primary">
                    Solution Steps / Grading Guidance
                  </Label>
                  {!disabled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openMathEditor("solutionSteps")}
                      className="h-6 px-2 text-[10px] text-primary hover:bg-primary/10 gap-1 font-semibold"
                    >
                      <Sigma className="size-3" /> Math
                    </Button>
                  )}
                </div>
                <Textarea
                  placeholder="Describe the mathematical proof or step-by-step solution steps..."
                  className="min-h-[80px] bg-background text-sm"
                  disabled={disabled}
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
                  disabled={disabled}
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
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase text-amber-700">
                  Case Scenario / Background
                </Label>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openMathEditor("caseStudyContext")}
                    className="h-6 px-2 text-[10px] text-amber-800 hover:bg-amber-100 gap-1 font-semibold"
                  >
                    <Sigma className="size-3" /> Math
                  </Button>
                )}
              </div>
              <Textarea
                placeholder="Paste the scenario, story, or data context here..."
                className="min-h-[120px] bg-background text-sm leading-relaxed"
                disabled={disabled}
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
                      {!disabled && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRemoveOption(oIdx)}
                          className="text-destructive h-8 w-8"
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Input
                        value={opt.option_text || ""}
                        disabled={disabled}
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
                            disabled={disabled}
                            value={
                              opt.match_key !== undefined &&
                              opt.match_key !== null
                                ? opt.match_key
                                : String(opt.order_index || 0)
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              const nextOptions = question.options.map(
                                (o, idx) =>
                                  idx === oIdx ? { ...o, match_key: val } : o,
                              );
                              const nextMarks = nextOptions.reduce(
                                (sum, o) =>
                                  sum +
                                  (parseInt(
                                    o.match_key !== undefined
                                      ? o.match_key
                                      : String(o.order_index || 0),
                                  ) || 0),
                                0,
                              );
                              onUpdate({
                                options: nextOptions,
                                marks: nextMarks,
                              });
                            }}
                            placeholder="Marks"
                            className="h-8 text-xs text-center"
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            value={opt.option_text_right || ""}
                            disabled={disabled}
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
                {!disabled && (
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
                      const nextMarks = nextOptions.reduce(
                        (sum, o) =>
                          sum +
                          (parseInt(
                            o.match_key !== undefined
                              ? o.match_key
                              : String(o.order_index || 0),
                          ) || 0),
                        0,
                      );
                      onUpdate({ options: nextOptions, marks: nextMarks });
                    }}
                    className="h-8 text-[11px] border-amber-300 text-amber-900 hover:bg-amber-50"
                  >
                    <Plus className="size-3 mr-2" /> Add Sub-Question
                  </Button>
                )}
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
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      onUpdateOption(oIdx, { is_correct: !!checked })
                    }
                  />
                  <Input
                    value={opt.option_text || ""}
                    disabled={disabled}
                    onChange={(e) =>
                      onUpdateOption(oIdx, { option_text: e.target.value })
                    }
                    className="h-9 flex-1"
                    placeholder={`Option ${oIdx + 1}`}
                  />
                  {!disabled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => openMathEditor("option", oIdx)}
                      className="h-9 w-9 text-primary hover:bg-primary/10 shrink-0"
                      title="Insert Math into Option"
                    >
                      <Sigma className="size-3.5" />
                    </Button>
                  )}
                  {!disabled && question.options.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveOption(oIdx)}
                      className="text-destructive h-9 w-9 shrink-0"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {!disabled && question.options.length < 8 && (
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
              disabled={disabled}
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
                    disabled={disabled}
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
            disabled={disabled}
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
                {question.options
                  .filter((o) => o.is_correct)
                  .map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className="size-8 flex items-center justify-center rounded font-mono shrink-0"
                      >
                        #{oIdx + 1}
                      </Badge>
                      <Input
                        value={opt.option_text || ""}
                        disabled={disabled}
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
                        placeholder={`Correct answer for [blank] #${oIdx + 1}`}
                      />
                      {!disabled && question.options.filter((o) => o.is_correct).length > 1 && (
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
                      )}
                    </div>
                  ))}
                {!disabled && (
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
                )}
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
                        disabled={disabled}
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
                      {!disabled && (
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
                      )}
                    </div>
                  ))}
                {!disabled && (
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
                )}
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
            disabled={disabled}
          />
        )}

        {question.type === "shortanswer" && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-xs text-primary font-semibold flex items-center gap-2 mb-1">
                <Sparkles className="size-4" /> Short Answer Evaluation
              </p>
              <p className="text-xs text-muted-foreground">
                Students will be provided with a text input. AI will use the
                model answer below for grading guidance.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  Model Answer / Explanation
                </Label>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openMathEditor("option", 0)}
                    className="h-7 px-2 text-xs text-primary hover:bg-primary/10 gap-1 font-semibold"
                  >
                    <Sigma className="size-3.5" /> Insert Math
                  </Button>
                )}
              </div>
              <Textarea
                placeholder="Define the model answer for grading guidance..."
                className="min-h-[100px] text-sm"
                disabled={disabled}
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
                disabled={disabled}
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
                <Sparkles className="size-4" /> Essay Evaluation
              </p>
              <p className="text-xs text-muted-foreground">
                Students will write an essay response. A grading rubric is
                required.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  Grading Guidance / Model Answer
                </Label>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openMathEditor("option", 0)}
                    className="h-7 px-2 text-xs text-amber-800 hover:bg-amber-100 gap-1 font-semibold"
                  >
                    <Sigma className="size-3.5" /> Insert Math
                  </Button>
                )}
              </div>
              <Textarea
                placeholder="Provide grading guidance or key points to look for in the essay..."
                className="min-h-[100px] text-sm"
                disabled={disabled}
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
                  disabled={disabled}
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
                  disabled={disabled}
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

      <MathEditorDialog
        open={mathDialogOpen}
        onOpenChange={setMathDialogOpen}
        onInsert={handleInsertMath}
      />
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
            <div className="font-semibold text-lg leading-tight">
              {question.text ? (
                renderRichMathText(question.text)
              ) : (
                <em className="text-muted-foreground font-normal italic">
                  No question text provided
                </em>
              )}
            </div>
            {(question.question_table_context || question.questionTableContext) && (
              <div className="mt-3 p-3 bg-background border rounded-xl space-y-1.5">
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <TableIcon className="size-3.5 text-primary" /> Question Stem Reference Table
                </div>
                <TableContextViewer
                  data={question.question_table_context || question.questionTableContext}
                />
              </div>
            )}
            {(question.requires_table_answer || question.requiresTableAnswer) &&
              (question.answer_table_template || question.answerTableTemplate) && (
                <div className="mt-3 p-3 bg-muted/20 border border-dashed rounded-xl space-y-1.5">
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <TableIcon className="size-3.5 text-primary" /> Expected Student Answer Table Template Grid
                  </div>
                  <TableContextViewer
                    data={question.answer_table_template || question.answerTableTemplate}
                  />
                </div>
              )}
            {question.imageUrl && (
              <div className="mt-3 inline-block p-1 border rounded-lg overflow-hidden">
                <Image
                  src={question.imageUrl}
                  alt="Diagram"
                  width={800}
                  height={600}
                  unoptimized
                  className="max-h-52 rounded-md object-contain w-auto h-auto"
                />
              </div>
            )}
            {question.caseStudyContext && (
              <div className="mt-3 p-4 bg-muted/20 border border-dashed rounded-lg text-sm text-foreground/80 leading-relaxed">
                <span className="font-bold block mb-1 text-[10px] text-primary uppercase tracking-wider">
                  Case Scenario
                </span>
                {renderRichMathText(question.caseStudyContext)}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="h-5 text-[10px] uppercase font-bold"
            >
              {question.type}
            </Badge>
            <Badge variant="outline" className="h-5 text-[10px] font-medium">
              {question.marks} Marks
            </Badge>
            {(question.requires_table_answer || question.requiresTableAnswer) && (
              <Badge
                variant="outline"
                className="h-5 text-[10px] bg-primary/5 text-primary border-primary/20 gap-1 font-semibold"
              >
                <TableIcon className="size-3" /> Requires Table Answer
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
                    <div>{renderRichMathText(opt.option_text)}</div>
                    {opt.is_correct && (
                      <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 ml-2" />
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
                    <div className="font-medium flex-1">{renderRichMathText(opt.option_text)}</div>
                    <ChevronRight className="size-3 text-primary shrink-0" />
                    <div className="font-bold text-primary flex-1">
                      {renderRichMathText(opt.option_text_right || "")}
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
                    #{i + 1}: {renderRichMathText(opt.option_text)}
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
                    {renderRichMathText(opt.option_text)}
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
                {question.options[0]?.option_text ? (
                  renderRichMathText(question.options[0].option_text)
                ) : (
                  "No grading rubric provided."
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const mapBackendToFrontendType = (type: string): QuestionType => {
  const mapping: Record<string, QuestionType> = {
    mcq: "mcq",
    true_false: "truefalse",
    short_answer: "shortanswer",
    essay: "essay",
    matching: "matching",
    fill_blank: "fillblank",
    computational: "computational",
    ordering: "ordering",
    case_study: "casestudy",
  };
  return mapping[type] || (type as QuestionType);
};

const unpackOpenEndedFields = (q: any, rawOptions: any[]) => {
  const qType = mapBackendToFrontendType(q.question_type);
  const unpacked: any = {
    rubric: "",
    wordLimit: undefined,
    solutionSteps: "",
    tolerance: undefined,
    modelAnswer: "",
  };

  const firstOptText = rawOptions[0]?.content || q.explanation || "";

  if (qType === "essay") {
    const modelAnsPrefix = "Model Answer: ";
    const rubricPrefix = "\n\nRubric: ";
    const limitPrefix = "\n\nWord Limit: ";

    let modelAnswer = "";
    let rubric = "";
    let wordLimit = 0;

    const rubricIndex = firstOptText.indexOf(rubricPrefix);
    const limitIndex = firstOptText.indexOf(limitPrefix);

    if (rubricIndex > -1 && limitIndex > -1) {
      modelAnswer = firstOptText.substring(modelAnsPrefix.length, rubricIndex);
      rubric = firstOptText.substring(
        rubricIndex + rubricPrefix.length,
        limitIndex,
      );
      const limitStr = firstOptText.substring(limitIndex + limitPrefix.length);
      wordLimit = parseInt(limitStr.replace(" words", "")) || 0;
    } else if (rubricIndex > -1) {
      modelAnswer = firstOptText.substring(modelAnsPrefix.length, rubricIndex);
      rubric = firstOptText.substring(rubricIndex + rubricPrefix.length);
    } else {
      modelAnswer = firstOptText.startsWith(modelAnsPrefix)
        ? firstOptText.substring(modelAnsPrefix.length)
        : firstOptText;
    }

    unpacked.rubric = rubric;
    unpacked.wordLimit = wordLimit || undefined;
    unpacked.modelAnswer = modelAnswer;
  } else if (qType === "shortanswer") {
    const modelAnsPrefix = "Model Answer: ";
    const rubricPrefix = "\n\nRubric: ";

    let modelAnswer = "";
    let rubric = "";

    const rubricIndex = firstOptText.indexOf(rubricPrefix);

    if (rubricIndex > -1) {
      modelAnswer = firstOptText.substring(modelAnsPrefix.length, rubricIndex);
      rubric = firstOptText.substring(rubricIndex + rubricPrefix.length);
    } else {
      modelAnswer = firstOptText.startsWith(modelAnsPrefix)
        ? firstOptText.substring(modelAnsPrefix.length)
        : firstOptText;
    }

    unpacked.rubric = rubric;
    unpacked.modelAnswer = modelAnswer;
  } else if (qType === "computational") {
    const stepsPrefix = "Solution Steps: ";
    const ansPrefix = "\n\nNumerical Answer: ";
    const tolerancePrefix = "\n\nTolerance: ";

    let solutionSteps = "";
    let numericalAnswer = "";
    let tolerance = 0;

    const ansIndex = firstOptText.indexOf(ansPrefix);
    const tolIndex = firstOptText.indexOf(tolerancePrefix);

    if (ansIndex > -1 && tolIndex > -1) {
      solutionSteps = firstOptText.substring(stepsPrefix.length, ansIndex);
      numericalAnswer = firstOptText.substring(
        ansIndex + ansPrefix.length,
        tolIndex,
      );
      tolerance =
        parseFloat(firstOptText.substring(tolIndex + tolerancePrefix.length)) ||
        0;
    } else if (ansIndex > -1) {
      solutionSteps = firstOptText.substring(stepsPrefix.length, ansIndex);
      numericalAnswer = firstOptText.substring(ansIndex + ansPrefix.length);
    } else {
      numericalAnswer = firstOptText.startsWith(stepsPrefix)
        ? firstOptText.substring(stepsPrefix.length)
        : firstOptText;
    }

    unpacked.solutionSteps = solutionSteps;
    unpacked.tolerance = tolerance || undefined;
    unpacked.modelAnswer = numericalAnswer;
  }

  return unpacked;
};

const mapCandidateToQuestion = (
  candidate: any,
  targetSecId: string,
  marksPerQuestion: number,
  explanationOverride?: string,
  questionTextOverride?: string,
  optionsOverride?: any[],
): Question => {
  const qType = mapBackendToFrontendType(candidate.question_type);
  const text =
    questionTextOverride !== undefined
      ? questionTextOverride
      : candidate.parsed_question_text || "";
  const explanation =
    explanationOverride !== undefined
      ? explanationOverride
      : candidate.parsed_explanation || candidate.explanation || "";

  let rubric = "";
  let wordLimit: number | undefined;
  let solutionSteps = "";
  let tolerance: number | undefined;
  let caseStudyContext = "";
  let mappedOptions =
    optionsOverride !== undefined
      ? optionsOverride.map((o: any, idx: number) => ({
          option_text: o.text || o.option_text || "",
          option_text_right: o.option_text_right || o.explanation || "",
          is_correct: o.is_correct,
          order_index:
            qType === "casestudy"
              ? idx
              : o.order_index !== undefined
                ? o.order_index
                : idx,
          match_key:
            qType === "casestudy"
              ? String(
                  o.match_key !== undefined ? o.match_key : o.order_index || 5,
                )
              : o.match_key,
        }))
      : (candidate.options || candidate._options || []).map(
          (o: any, idx: number) => ({
            option_text: o.text || o.option_text || "",
            option_text_right: o.option_text_right || o.explanation || "",
            is_correct: o.is_correct,
            order_index:
              qType === "casestudy"
                ? idx
                : o.order_index !== undefined
                  ? o.order_index
                  : idx,
            match_key:
              qType === "casestudy"
                ? String(
                    o.match_key !== undefined
                      ? o.match_key
                      : o.order_index || 5,
                  )
                : o.match_key,
          }),
        );

  if (
    ["essay", "shortanswer", "computational"].includes(qType) &&
    explanation
  ) {
    const fakeQuestion = {
      question_type: candidate.question_type,
      options: [{ content: explanation }],
    };
    const unpacked = unpackOpenEndedFields(fakeQuestion, fakeQuestion.options);

    const rubricValue = unpacked.rubric.toLowerCase();
    let selectedRubric = "general_essay";
    if (qType === "shortanswer") {
      selectedRubric = "general_short";
      if (
        rubricValue.includes("technical") ||
        rubricValue.includes("definition")
      ) {
        selectedRubric = "technical_definition";
      }
    } else if (qType === "essay") {
      if (
        rubricValue.includes("critical") ||
        rubricValue.includes("analysis")
      ) {
        selectedRubric = "critical_thinking";
      } else if (
        rubricValue.includes("scientific") ||
        rubricValue.includes("research") ||
        rubricValue.includes("paper") ||
        rubricValue.includes("writing")
      ) {
        selectedRubric = "scientific_writing";
      } else if (
        rubricValue.includes("technical") ||
        rubricValue.includes("definition")
      ) {
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
        order_index: 0,
      },
    ];
  } else if (qType === "casestudy") {
    caseStudyContext =
      candidate.case_study_context ||
      candidate.caseStudyContext ||
      text;
    const shortText =
      "Analyze the following case scenario and answer the sub-questions below.";
    const computedMarks = mappedOptions.reduce(
      (sum: number, o: QuestionOption) =>
        sum + (parseInt(o.match_key || "5") || 0),
      0,
    );
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

// --- MAIN BUILDER ---

const STEPS_DATA = [
  { title: "Identity", icon: FileText },
  { title: "Proctoring & Rules", icon: Shield },
  { title: "Target Audience", icon: Users },
  { title: "Blueprint", icon: Layout },
  { title: "Questions & Bank", icon: Sparkles },
  { title: "Review & Save", icon: CheckCircle2 },
];

export default function EditAssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const activeAutosavePromiseRef = useRef<Promise<any>>(Promise.resolve());
  const hasInitializedRef = useRef(false);

  const [activeStep, setActiveStep] = useState(1);
  const [saveToBank, setSaveToBank] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [autosaveStatus, setAutosaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [assessmentStatus, setAssessmentStatus] = useState<string>("DRAFT");

  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [selectedWorkspaceDetail, setSelectedWorkspaceDetail] =
    useState<WorkspaceDetail | null>(null);
  const [periods, setPeriods] = useState<AcademicPeriodResponse[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [availableLecturers, setAvailableLecturers] = useState<UserResponse[]>(
    [],
  );
  const [supervisorList, setSupervisorList] = useState<
    { id: string; name: string; role: "PRIMARY" | "ASSISTANT" | "OBSERVER" }[]
  >([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<Record<string, string>>({});
  const [step5ViewMode, setStep5ViewMode] = useState<"standard" | "per_group">("standard");
  const [groups, setGroups] = useState<Group[]>([]);
  const [isGeneratingAutoGroups, setIsGeneratingAutoGroups] = useState(false);
  const [autoGroupsPreview, setAutoGroupsPreview] = useState<Group[] | null>(null);

  const questionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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
  const [editingOptions, setEditingOptions] = useState<
    {
      text: string;
      is_correct: boolean;
      explanation?: string;
      order_index?: number;
    }[]
  >([]);
  const [editingText, setEditingText] = useState("");
  const [editingExplanation, setEditingExplanation] = useState("");
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(
    null,
  );

  const calculateSectionMarksPerQuestion = (
    sectionId: string,
    currentBlueprint: typeof blueprint,
    currentQuestions: typeof questions,
  ): number => {
    const sectionObj = currentBlueprint.find((s) => s.id === sectionId);
    if (!sectionObj) return 2;
    const sectionQuestions = currentQuestions.filter(
      (q) => q.sectionId === sectionId,
    );
    const allocatedMarks = sectionQuestions.reduce(
      (sum, q) => sum + (q.marks || 0),
      0,
    );
    const totalSectionMarks = parseInt(sectionObj.marks as any) || 0;
    const targetQuestionCount = parseInt(sectionObj.questions as any) || 1;
    const remainingSectionMarks = Math.max(
      0,
      totalSectionMarks - allocatedMarks,
    );
    const remainingQuestionSlots = Math.max(
      1,
      targetQuestionCount - sectionQuestions.length,
    );
    return Math.max(
      1,
      Math.round(remainingSectionMarks / remainingQuestionSlots),
    );
  };

  const findMatchingSectionForType = (qType: string): string => {
    const frontType = mapBackendToFrontendType(qType);
    const match = blueprint.find((s) => s.allowedTypes.includes(frontType));
    return match ? match.id : blueprint[0]?.id || "";
  };

  // Step 6 validation & distribution report
  const [validationResult, setValidationResult] = useState<any>(null);
  const [distributionData, setDistributionData] = useState<any>(null);
  const [lecturerConfirmed, setLecturerConfirmed] = useState(false);

  // Core State
  const [metadata, setMetadata] = useState({
    title: "",
    description: "",
    instructions: "",
    grading_mode: "AUTO" as "AUTO" | "MANUAL" | "AI_ASSISTED" | "HYBRID",
    result_release_mode: "MANUAL" as "IMMEDIATE" | "MANUAL" | "SCHEDULED",
    total_marks: "" as any,
    is_group_assessment: false,
    mode: "CAT" as AssessmentMode,
    institution_id: "",
    course_id: "",
    subject_id: "",
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
    selectedInstructions: [] as string[],
    customInstructions: "",
    max_group_size: 4,
    group_formation_mode: "self_enrol",
    group_assignment_mode: "MANUAL" as "AUTOMATIC" | "MANUAL",
    question_distribution_mode: "SHARED" as "SHARED" | "PER_GROUP",
    require_all_member_approval: true,
    require_all_member_participation: true,
    submission_mode: "SINGLE_LEADER" as "SINGLE_LEADER" | "ALL_MEMBERS" | "MAJORITY_VOTE",
    peer_evaluation_enabled: false,
    peer_evaluation_deadline: "" as any,
    peer_evaluation_weight_percent: "" as any,
    individual_weighting_enabled: false,
    appeal_window_days: 7,
    audience_type: "all" as "all" | "selected",
    target_student_ids: [] as string[],
  });

  const [blueprint, setBlueprint] = useState<BlueprintSection[]>([]);
  const [rules, setRules] = useState({
    openBook: false,
    supervised: true,
    aiAllowed: false,
    browserRestricted: true,
    integrityMonitoring: true,
    lateSubmissionAllowed: false,
    shuffleQuestions: true,
    shuffleOptions: true,
    resultRelease: "manual" as "immediate" | "manual",
    resultReleaseAt: undefined as Date | undefined,
    attempts: 1,
    passwordProtected: false,
    accessPassword: "",
    latePenaltyPercent: 0,
    gracePeriodMinutes: 0,
    autosaveToken: undefined as string | undefined,
    supervisor_ids: [] as string[],
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isReviewApplying, setIsReviewApplying] = useState(false);
  const [passingMarksPercent, setPassingMarksPercent] = useState(70);

  // Smart defaults for Group Work mode
  useEffect(() => {
    setRules((prev) => {
      const isGroupWork = metadata.mode === "Groupwork";
      if (isGroupWork) {
        return {
          ...prev,
          aiAllowed: prev.supervised ? false : prev.aiAllowed,
          browserRestricted: prev.supervised ? prev.browserRestricted : false,
          integrityMonitoring: prev.supervised ? prev.integrityMonitoring : false,
          shuffleQuestions: false,
          shuffleOptions: false,
          attempts: 1,
        };
      }
      return prev;
    });
  }, [rules.supervised, metadata.mode]);

  const metadataRef = useRef(metadata);
  const rulesRef = useRef(rules);
  const blueprintRef = useRef(blueprint);
  const questionsRef = useRef(questions);
  const activeStepRef = useRef(activeStep);
  const supervisorListRef = useRef(supervisorList);
  const isReviewApplyingRef = useRef(isReviewApplying);

  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);
  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);
  useEffect(() => {
    blueprintRef.current = blueprint;
  }, [blueprint]);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);
  useEffect(() => {
    activeStepRef.current = activeStep;
  }, [activeStep]);
  useEffect(() => {
    supervisorListRef.current = supervisorList;
  }, [supervisorList]);
  useEffect(() => {
    isReviewApplyingRef.current = isReviewApplying;
  }, [isReviewApplying]);

  const isFieldDisabled = (field: string) => {
    if (assessmentStatus === "DRAFT") return false;
    // Critical structural changes disabled for published/active assessments
    const criticalFields = [
      "mode",
      "teaching_workspace_id",
      "is_group_assessment",
      "audience_type",
      "total_marks",
    ];
    if (criticalFields.includes(field)) return true;

    if (assessmentStatus === "ACTIVE" || assessmentStatus === "CLOSED") {
      return true; // Disable almost everything for live assessments
    }
    return false;
  };

  const loadWorkspaceDetail = useCallback(async (workspaceId: string) => {
    if (!workspaceId) {
      setSelectedWorkspaceDetail(null);
      return;
    }
    try {
      const detail = await lecturerApi.getWorkspaceDetail(workspaceId);
      setSelectedWorkspaceDetail(detail);

      setWorkspaces((prev) => {
        if (!prev.some((w) => w.id === workspaceId)) {
          return [
            ...prev,
            {
              id: detail.id,
              title: detail.title,
              class_name: detail.class_name || "Workspace",
              status: detail.status || "ACTIVE",
            } as any,
          ];
        }
        return prev;
      });
    } catch (err) {
      console.error("Failed to load workspace detail:", err);
    }
  }, []);

  // Fetch Assessment Data
  useEffect(() => {
    if (!id || hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    async function init() {
      setIsLoading(true);
      try {
        const [workspaceRes, periodRes, lectRes, userRes, data] =
          await Promise.all([
            lecturerApi.getWorkspaces(),
            lecturerApi.getPeriods(),
            lecturerApi.getLecturers(),
            authApi.getCurrentUser(),
            assessmentApi.getAssessmentById(id as string),
          ]);

        setWorkspaces(workspaceRes);
        setPeriods(periodRes);
        setAvailableLecturers(lectRes);
        setCurrentUser(userRes);
        setAssessmentStatus(data.status);

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
              "Reassessment",
            ];
            return (
              validModes.includes(normalized) ? normalized : type
            ) as AssessmentMode;
          })(),
          instructions: data.instructions || "",
          grading_mode: (data.grading_mode || "AUTO") as any,
          result_release_mode: (data.result_release_mode || "MANUAL") as any,
          total_marks: data.total_marks || "",
          is_group_assessment:
            data.is_group_assessment ||
            data.assessment_type === "GROUP_WORK" ||
            false,
          institution_id: data.institution_id || "",
          course_id: data.course_id || "",
          subject_id: data.subject_id || "",
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
          submission_mode: data.submission_mode || "SINGLE_LEADER",
          peer_evaluation_enabled: data.peer_evaluation_enabled || false,
          peer_evaluation_deadline: data.peer_evaluation_deadline || "",
          peer_evaluation_weight_percent: data.peer_evaluation_weight_percent || "",
          individual_weighting_enabled: data.individual_weighting_enabled || false,
          appeal_window_days: data.appeal_window_days || 7,
          audience_type: data.audience_type || "all",
          target_student_ids: data.target_student_ids || [],
        });

        if (data.teaching_workspace_id) {
          loadWorkspaceDetail(data.teaching_workspace_id);
        }

        // Populate blueprint
        if (data.sections?.length > 0) {
          setBlueprint(
            data.sections.map((s: any) => ({
              id: s.id,
              section: s.title,
              topics: s.description || "",
              marks: s.allocated_marks || 0,
              questions: s.question_count_target || 0,
              difficulty: (() => {
                const diff =
                  s.allowed_question_types?.difficulty ||
                  s.difficulty ||
                  "Medium";
                return (
                  diff.charAt(0).toUpperCase() + diff.slice(1).toLowerCase()
                );
              })(),
              allowedTypes: (s.allowed_question_types?.types || ["mcq"]).map(
                (t: string) => t.toLowerCase().replaceAll("_", ""),
              ),
              aiPromptHint: s.ai_generation_prompt_hint || "",
              difficultyDistribution: s.difficulty_distribution || undefined,
              bloomLevel:
                s.allowed_question_types?.bloom_level ||
                s.bloom_level ||
                "understand",
              per_group: s.allowed_question_types?.per_group || false,
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
          resultRelease: data.result_release_mode?.toLowerCase() || "manual",
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

        // Map supervisor list
        if (data.supervisors && data.supervisors.length > 0) {
          const sups = data.supervisors.map((s: any) => {
            const lect = lectRes.find((l: any) => l.id === s.supervisor_id);
            return {
              id: s.supervisor_id,
              name: lect
                ? `${lect.profile?.first_name || ""} ${lect.profile?.last_name || ""}`
                : `Lecturer ${s.supervisor_id.substring(0, 5)}`,
              role: (s.supervisor_role || "ASSISTANT") as any,
            };
          });
          setSupervisorList(sups);
        }

        // Populate questions
        if (data.assessment_questions?.length > 0) {
          setQuestions(
            data.assessment_questions.map((aq: any) => {
              const type = aq.question.question_type
                .toLowerCase()
                .replaceAll("_", "") as QuestionType;
              const optionsRaw = aq.question.options || [];
              const unpacked = unpackOpenEndedFields(aq.question, optionsRaw);

              return {
                id: aq.question.id,
                sectionId: aq.assessment_section_id,
                groupId: aq.group_id,
                text: aq.question.content,
                imageUrl: aq.question.image_url,
                type: type,
                marks: aq.marks_override || aq.question.marks,
                options: ["essay", "shortanswer", "computational"].includes(
                  type,
                )
                  ? [
                      {
                        id: optionsRaw[0]?.id,
                        option_text:
                          unpacked.modelAnswer || aq.question.explanation || "",
                        option_text_right: "",
                        is_correct: true,
                        order_index: 0,
                      },
                    ]
                  : optionsRaw.map((o: any, idx: number) => ({
                      id: o.id,
                      option_text: o.option_text || o.content || "",
                      option_text_right:
                        o.option_text_right || o.match_value || "",
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
                aiGenerated:
                  aq.added_via === "ai_generated" || aq.question.ai_generated,
                is_required: aq.is_required ?? true,
                question_table_context:
                  aq.question.question_table_context ||
                  aq.question.questionTableContext,
                questionTableContext:
                  aq.question.question_table_context ||
                  aq.question.questionTableContext,
                requires_table_answer: !!(
                  aq.question.requires_table_answer ||
                  aq.question.requiresTableAnswer
                ),
                requiresTableAnswer: !!(
                  aq.question.requires_table_answer ||
                  aq.question.requiresTableAnswer
                ),
                answer_table_template:
                  aq.question.answer_table_template ||
                  aq.question.answerTableTemplate,
                answerTableTemplate:
                  aq.question.answer_table_template ||
                  aq.question.answerTableTemplate,
              };
            }),
          );
        }

        if (data.draft_step) setActiveStep(data.draft_step);
      } catch (err) {
        toast.error("Failed to load assessment for editing.");
        router.push("/lecturer/assessments");
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [id, router, loadWorkspaceDetail]);

  // Derived Values
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
      if (diff < 0) diff += 24 * 60;
      return diff;
    } catch (e) {
      return 0;
    }
  }, [metadata.startTime, metadata.endTime]);

  const totalQuestions = useMemo(
    () =>
      blueprint.reduce(
        (sum, s) => sum + (parseInt(s.questions as any) || 0),
        0,
      ),
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

  // Sync total marks to metadata
  useEffect(() => {
    setMetadata((prev) => {
      const newTotal = totalMarks;
      const newPassing = Math.floor((totalMarks * passingMarksPercent) / 100);
      if (prev.total_marks !== newTotal || prev.passing_marks !== newPassing) {
        return { ...prev, total_marks: newTotal, passing_marks: newPassing };
      }
      return prev;
    });
  }, [totalMarks, passingMarksPercent]);

  const syncDraftResponse = useCallback((res: any) => {
    if (!res) return;
    if (res.sections?.length > 0) {
      setBlueprint(
        res.sections.map((s: any) => ({
          id: s.id,
          section: s.title,
          topics: s.description || "",
          marks: s.allocated_marks || 0,
          questions: s.question_count_target || 0,
          difficulty: (() => {
            const diff =
              s.allowed_question_types?.difficulty || s.difficulty || "Medium";
            return diff.charAt(0).toUpperCase() + diff.slice(1).toLowerCase();
          })(),
          allowedTypes: (s.allowed_question_types?.types || ["mcq"]).map(
            (t: string) => t.toLowerCase().replaceAll("_", ""),
          ),
          aiPromptHint: s.ai_generation_prompt_hint || "",
          difficultyDistribution: s.difficulty_distribution || undefined,
          bloomLevel:
            s.allowed_question_types?.bloom_level ||
            s.bloom_level ||
            "understand",
        })),
      );
    }

    if (res.assessment_questions?.length > 0) {
      setQuestions(
        res.assessment_questions.map((aq: any) => {
          const type = mapBackendToFrontendType(aq.question.question_type);
          const optionsRaw = aq.question.options || [];
          const unpacked = unpackOpenEndedFields(aq.question, optionsRaw);
          return {
            id: aq.question.id,
            sectionId: aq.assessment_section_id,
            groupId: aq.group_id,
            text: aq.question.content,
            imageUrl: aq.question.image_url,
            type: type,
            marks: aq.marks_override || aq.question.marks,
            options: ["essay", "shortanswer", "computational"].includes(type)
              ? [
                  {
                    id: optionsRaw[0]?.id,
                    option_text:
                      unpacked.modelAnswer || aq.question.explanation || "",
                    option_text_right: "",
                    is_correct: true,
                    order_index: 0,
                  },
                ]
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
            aiGenerated:
              aq.added_via === "ai_generated" || aq.question.ai_generated,
            is_required: aq.is_required ?? true,
            question_table_context:
              aq.question.question_table_context ||
              aq.question.questionTableContext,
            questionTableContext:
              aq.question.question_table_context ||
              aq.question.questionTableContext,
            requires_table_answer: !!(
              aq.question.requires_table_answer ||
              aq.question.requiresTableAnswer
            ),
            requiresTableAnswer: !!(
              aq.question.requires_table_answer ||
              aq.question.requiresTableAnswer
            ),
            answer_table_template:
              aq.question.answer_table_template ||
              aq.question.answerTableTemplate,
            answerTableTemplate:
              aq.question.answer_table_template ||
              aq.question.answerTableTemplate,
          };
        }),
      );
    }
  }, []);

  // Autosave Logic
  const runAutosave = useCallback(
    (
      step: number,
      metadataOverride?: Partial<typeof metadata>,
      rulesOverride?: Partial<typeof rules>,
      questionsOverride?: Question[],
    ) => {
      if (assessmentStatus !== "DRAFT") return Promise.resolve(); // No autosave for non-drafts
      if (isReviewApplyingRef.current) return Promise.resolve(); // Ignore standard autosave during review
      if ((window as any)._autosaveTimer) {
        clearTimeout((window as any)._autosaveTimer);
      }
      const executeAutosave = async () => {
        setAutosaveStatus("saving");
        try {
          const payload: any = {
            ...preparePayload(questionsOverride),
            draft_step: step,
          };
          if (metadataOverride) {
            payload.metadata = { ...payload.metadata, ...metadataOverride };
          }
          if (rulesOverride) {
            payload.rules = { ...payload.rules, ...rulesOverride };
          }
          const res = await apiClient("/assessments/draft", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          setAutosaveStatus("saved");
          syncDraftResponse(res);
          setRules((prev) => ({ ...prev, accessPassword: "" }));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, assessmentStatus],
  );

  const triggerDebouncedAutosave = (
    step: number,
    metadataOverride?: Partial<typeof metadata>,
    rulesOverride?: Partial<typeof rules>,
    questionsOverride?: Question[],
  ) => {
    if (assessmentStatus !== "DRAFT") return;
    const execute = () =>
      runAutosave(step, metadataOverride, rulesOverride, questionsOverride);
    // Standard debounce logic
    if ((window as any)._autosaveTimer)
      clearTimeout((window as any)._autosaveTimer);
    (window as any)._autosaveTimer = setTimeout(execute, 2000);
  };

  const prepareWizardPayload = (
    step: number,
    metadataOverride?: any,
    rulesOverride?: any,
  ) => {
    const m = metadataOverride
      ? { ...metadataRef.current, ...metadataOverride }
      : metadataRef.current;
    const r = rulesOverride
      ? { ...rulesRef.current, ...rulesOverride }
      : rulesRef.current;
    const payload: any = {
      title: m.title,
      description: m.description,
      instructions:
        m.selectedInstructions.join("\n") +
        (m.customInstructions ? "\n" + m.customInstructions : ""),
      assessment_type:
        m.mode === "Groupwork" ? "GROUP_WORK" : m.mode.toUpperCase(),
      grading_mode: m.grading_mode,
      result_release_mode: m.result_release_mode,
      total_marks: parseInt(m.total_marks as any),
      passing_marks: parseInt(m.passing_marks as any),
      duration_minutes: parseInt(m.durationMinutes as any),
      is_group_assessment: m.is_group_assessment,
      max_group_size: m.max_group_size,
      group_formation_mode: m.group_formation_mode,
      group_assignment_mode: m.group_assignment_mode,
      question_distribution_mode: m.question_distribution_mode,
      require_all_member_approval: m.require_all_member_approval,
      require_all_member_participation: m.require_all_member_participation,
      appeal_window_days: parseInt(m.appeal_window_days as any),
      max_attempts: parseInt(r.attempts as any),
      is_password_protected: r.passwordProtected,
      access_password: r.accessPassword || undefined,
      fullscreen_required: r.browserRestricted,
      is_supervised: r.supervised,
      ai_assistance_allowed: r.aiAllowed,
      is_open_book: r.openBook,
      randomize_questions: r.shuffleQuestions,
      randomize_options: r.shuffleOptions,
      late_submission_allowed: r.lateSubmissionAllowed,
      late_penalty_percent:
        r.latePenaltyPercent !== undefined
          ? parseFloat(r.latePenaltyPercent as any)
          : undefined,
      grace_period_minutes:
        r.gracePeriodMinutes !== undefined
          ? parseInt(r.gracePeriodMinutes as any)
          : undefined,
      integrity_monitoring_enabled: r.integrityMonitoring,
      draft_step: step,
      class_group_ids: m.class_group_ids,
      supervisor_ids: supervisorListRef.current.map((s) => s.id),
      audience_type: m.audience_type,
      target_student_ids: m.target_student_ids,
    };

    // Compute window_start / window_end from date + time parts
    if (m.date && m.startTime) {
      const [h, min] = m.startTime.split(":").map(Number);
      const d = new Date(m.date);
      d.setHours(h, min, 0, 0);
      payload.window_start = d.toISOString();
    }
    if (m.date && m.endTime) {
      const [h, min] = m.endTime.split(":").map(Number);
      const d = new Date(m.date);
      d.setHours(h, min, 0, 0);
      if (m.startTime && m.endTime < m.startTime) d.setDate(d.getDate() + 1);
      payload.window_end = d.toISOString();
    }

    return payload;
  };

  const getGroupSubmissionDeadline = (m: any): Date | null => {
    if (!m.date || !m.endTime) return null;
    try {
      const [h, min] = m.endTime.split(":").map(Number);
      const d = new Date(m.date);
      d.setHours(h, min, 0, 0);
      if (m.startTime && m.endTime < m.startTime) d.setDate(d.getDate() + 1);
      return d;
    } catch {
      return null;
    }
  };

  const preparePayload = (questionsOverride?: Question[]) => {
    const m = metadataRef.current;
    const r = rulesRef.current;
    const activeQuestions =
      questionsOverride !== undefined
        ? questionsOverride
        : questionsRef.current;

    const payload = {
      id: id as string,
      groups: m.mode === "Groupwork"
        ? groups.map((g) => ({
            name: g.name,
            members: g.members.map((mem) => ({
              student_id: mem.student_id || mem.id,
              is_leader: !!mem.is_leader
            }))
          }))
        : undefined,
      metadata: {
        title: m.title || "Untitled Assessment",
        description: m.description || "",
        mode: m.mode || "CAT",
        assessment_type:
          m.mode === "Groupwork" ? "GROUP_WORK" : m.mode.toUpperCase(),
        institution_id: m.institution_id || undefined,
        course_id: m.course_id || undefined,
        department_ids: m.department_ids || [],
        option_ids: m.option_ids || [],
        class_group_ids: m.class_group_ids || [],
        teaching_workspace_id: m.teaching_workspace_id || undefined,
        subject_id: m.subject_id || undefined,
        audience_type: m.audience_type || "all",
        target_student_ids: m.target_student_ids || [],
        date: m.date || undefined,
        startTime: m.startTime || undefined,
        endTime: m.endTime || undefined,
        durationMinutes: m.durationMinutes ? parseInt(m.durationMinutes as any) : 120,
        passing_marks: m.passing_marks ? parseInt(m.passing_marks as any) : 70,
        selectedInstructions: m.selectedInstructions || [],
        customInstructions: m.customInstructions || "",
        maxGroupSize: m.max_group_size || undefined,
        groupFormation: (() => {
          const fm = m.group_formation_mode;
          if (fm === "self_enrol") return "SELF_ENROL";
          if (fm === "random" || fm === "similar_performance" || fm === "diverse_performance") return "AUTO_BALANCED";
          return "LECTURER_ASSIGNED";
        })(),
        groupAssignmentMode: m.group_assignment_mode || undefined,
        questionDistributionMode: m.question_distribution_mode || undefined,
        appealWindowDays: m.appeal_window_days ? parseInt(m.appeal_window_days as any) : 0,
        submissionMode: m.submission_mode || "SINGLE_LEADER",
        peerEvaluationEnabled: m.peer_evaluation_enabled || false,
        peerEvaluationDeadline: (m.peer_evaluation_enabled && m.peer_evaluation_deadline)
          ? new Date(m.peer_evaluation_deadline).toISOString()
          : null,
        peerEvaluationWeightPercent: (m.peer_evaluation_enabled && m.peer_evaluation_weight_percent)
          ? parseInt(m.peer_evaluation_weight_percent as any)
          : null,
        individualWeightingEnabled: m.individual_weighting_enabled || false,
        academic_year: m.academic_year || undefined,
      },
      blueprint: blueprintRef.current.map((b) => ({
        id: b.id,
        section: b.section,
        topics: b.topics,
        marks: b.marks,
        questions: b.questions,
        difficulty: b.difficulty,
        allowedTypes: b.allowedTypes.map((t) => mapFrontendToBackendType(t)),
        bloomLevel: b.bloomLevel,
        per_group: b.per_group || false,
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
              option_text_right: undefined,
              is_correct: true,
              order_index: 0,
            },
          ];
        }

        return {
          id: q.id,
          sectionId: q.sectionId,
          groupId: q.groupId,
          text: q.text,
          type: mapFrontendToBackendType(q.type),
          marks: q.marks,
          options: finalOptions,
          imageUrl: q.imageUrl,
          computationalType: q.computationalType,
          caseStudyContext: q.caseStudyContext,
          is_required: q.is_required,
          question_table_context: q.question_table_context || q.questionTableContext,
          requires_table_answer: !!(q.requires_table_answer || q.requiresTableAnswer),
          answer_table_template: q.answer_table_template || q.answerTableTemplate,
        };
      }),
      rules: {
        ...r,
        requireAllMemberApproval: m.require_all_member_approval,
        requireAllMemberParticipation: m.require_all_member_participation,
        supervisor_ids: supervisorListRef.current.map((s) => s.id),
      },
    };

    if (payload.rules && !payload.rules.accessPassword) {
      delete (payload.rules as any).accessPassword;
    }

    if (m.date && m.startTime) {
      const [h, min] = m.startTime.split(":").map(Number);
      const d = new Date(m.date);
      d.setHours(h, min, 0, 0);
      (payload.metadata as any).windowStart = d.toISOString();
    }
    if (m.date && m.endTime) {
      const [h, min] = m.endTime.split(":").map(Number);
      const d = new Date(m.date);
      d.setHours(h, min, 0, 0);
      if (m.startTime && m.endTime < m.startTime) d.setDate(d.getDate() + 1);
      (payload.metadata as any).windowEnd = d.toISOString();
    }

    return payload;
  };

  const mapFrontendToBackendType = (type: string): string => {
    if (type === "truefalse") return "true_false";
    if (type === "shortanswer") return "short_answer";
    if (type === "fillblank") return "fill_blank";
    if (type === "casestudy") return "case_study";
    return type;
  };

  const handleUpdate = async () => {
    if (metadata.peer_evaluation_enabled && metadata.peer_evaluation_deadline) {
      const deadline = new Date(metadata.peer_evaluation_deadline);
      const submissionDeadline = getGroupSubmissionDeadline(metadata);
      if (submissionDeadline && deadline <= submissionDeadline) {
        toast.error("Peer evaluation deadline must be after the group submission deadline.");
        return;
      }
    }
    setIsUpdating(true);
    setFieldErrors({});
    try {
      if (assessmentStatus === "DRAFT") {
        await apiClient("/assessments/draft", {
          method: "POST",
          body: JSON.stringify(preparePayload()),
        });
      } else {
        // For PUBLISHED/SCHEDULED assessments use the flat AssessmentGeneralUpdate
        // schema expected by PUT /assessments/{id}, NOT the nested bulk payload.
        await apiClient(`/assessments/${id}`, {
          method: "PUT",
          body: JSON.stringify(prepareWizardPayload(1)),
        });
      }
      setRules((prev) => ({ ...prev, accessPassword: "" }));
      toast.success("Assessment updated successfully.");
      router.push(`/lecturer/assessments/${id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update assessment.");
    } finally {
      setIsUpdating(false);
    }
  };

  const triggerStep6Load = async () => {
    try {
      const [valRes, distRes] = await Promise.all([
        apiClient(`/blueprint/${id}/validate`),
        apiClient(`/blueprint/${id}/distribution`),
      ]);
      setValidationResult(valRes);
      setDistributionData(distRes);
    } catch (e) {
      console.error("Failed to load step 6 reports:", e);
    }
  };

  const handleNextStep = async (targetStep: number) => {
    if (targetStep === activeStep) return;

    if (targetStep < activeStep) {
      await runAutosave(targetStep);
      setActiveStep(targetStep);
      return;
    }
    // Simple guards for editing
    if (activeStep === 1 && metadata.peer_evaluation_enabled && metadata.peer_evaluation_deadline) {
      const deadline = new Date(metadata.peer_evaluation_deadline);
      const submissionDeadline = getGroupSubmissionDeadline(metadata);
      if (submissionDeadline && deadline <= submissionDeadline) {
        toast.error("Peer evaluation deadline must be after the group submission deadline.");
        return;
      }
    }
    if (targetStep >= 2 && activeStep < 2 && !metadata.title) {
      toast.error("Title is required");
      return;
    }
    await runAutosave(targetStep);
    if (targetStep === 6) {
      // Fill-in-the-blank placeholder validation
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (q.type === "fillblank") {
          const content = q.text || "";
          if (!content.includes("[blank]")) {
            toast.error(
              `Fill-in-the-blank question #${i + 1} is missing the '[blank]' placeholder in its text.`,
            );
            return;
          }
        }
      }
      await triggerStep6Load();
    }
    setActiveStep(targetStep);
  };

  const buildBlueprintConstraints = (
    blueprintList: BlueprintSection[],
    questionsList: Question[],
  ) => {
    return blueprintList
      .map((s, idx) => {
        const existingCount = questionsList.filter(
          (q) => q.sectionId === s.id,
        ).length;
        const allowedTypesStr = (s.allowedTypes || []).join(", ");
        return `Section ${idx + 1} (${s.section || `Section ${String.fromCharCode(65 + idx)}`}):
- Topic: ${s.topics || "General"}
- Target Questions Count: ${s.questions || 0}
- Target Total Marks: ${s.marks || 0}
- Difficulty: ${s.difficulty || "Medium"}
- Bloom Level: ${s.bloomLevel || "understand"}
- Allowed Types: [${allowedTypesStr}]
- Existing accepted question count: ${existingCount}`;
      })
      .join("\n\n");
  };

  const pollBatchStatus = useCallback(
    (batchId: string, currentTick = 0, targetSectionId: string) => {
      const maxTicks = 60; // 120 seconds max
      if (currentTick >= maxTicks) {
        setAiGenerating(false);
        toast.error("AI question generation timed out.");
        return;
      }

      setTimeout(async () => {
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

            if (status === "partial_failure") {
              const totalReq = batch.total_requested || 0;
              const totalGen = batch.total_generated || 0;
              const totalFail = batch.total_failed || 0;
              toast.warning(
                `AI question generation partially succeeded: ${totalGen} generated, ${totalFail} failed out of ${totalReq} requested. You can review the successfully generated candidates and retry the remaining ones.`,
                { duration: 8000 },
              );
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
            setActiveStep(5);
            if (status !== "partial_failure") {
              toast.success(
                `AI generated ${validCandidatesList.length} valid questions!`,
              );
            }
          } else if (status === "failed") {
            setAiGenerating(false);
            toast.error(batch.error_message || "AI generation failed.");
          } else {
            pollBatchStatus(batchId, currentTick + 1, targetSectionId);
          }
        } catch (err) {
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
        const sectionsPayload = blueprint.map((sec) => ({
          section_id: sec.id,
          topic: sec.topics || "General Topic",
          question_type: mapFrontendToBackendType(
            sec.allowedTypes[0] || "mcq",
          ) as any,
          difficulty: sec.difficulty.toLowerCase() as any,
          count: sec.questions || 3,
          bloom_level: (sec.bloomLevel || "understand") as any,
        }));

        const res = await aiGenerationApi.generateQuestions({
          subject: metadata.title || "Subject",
          topic: "Multiple Topics (Blueprint-aligned)",
          question_type: "mcq",
          difficulty: "medium",
          count: 5,
          additional_context: aiGenerationConfig.additional_context,
          target_assessment_id: id as string,
          workspace_id: metadata.teaching_workspace_id || undefined,
          sections: sectionsPayload,
          blueprint_constraints: buildBlueprintConstraints(
            blueprint,
            questions,
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

        const targetSection = blueprint.find((s) => s.id === aiTargetSectionId);
        const secTopic =
          aiGenerationConfig.topic || targetSection?.topics || "";
        const res = await aiGenerationApi.generateQuestions({
          subject: metadata.title || "Subject",
          topic: secTopic,
          question_type: mapFrontendToBackendType(
            aiGenerationConfig.question_type,
          ) as any,
          difficulty: aiGenerationConfig.difficulty as any,
          count: aiGenerationConfig.count,
          bloom_level: aiGenerationConfig.bloom_level as any,
          additional_context: aiGenerationConfig.additional_context,
          target_assessment_id: id as string,
          target_section_id: aiTargetSectionId,
          workspace_id: metadata.teaching_workspace_id || undefined,
          blueprint_constraints: buildBlueprintConstraints(
            blueprint,
            questions,
          ),
        });

        setAiBatchId(res.id);
        pollBatchStatus(res.id, 0, aiTargetSectionId);
      }
    } catch (err: any) {
      toast.error(err.message || "AI Generation failed.");
      setAiGenerating(false);
    }
  };

  const handleRetryFailedSections = async () => {
    setAiGenerating(true);
    try {
      toast.info("Saving draft before retrying question generation...");
      await runAutosave(5);

      const refreshed = await assessmentApi.getAssessmentById(id as string);
      const latestBlueprint = (
        refreshed.blueprint_sections ||
        refreshed.sections ||
        []
      ).map((s: any) => ({
        id: s.id,
        section: s.section || s.title,
        topics: s.topics || s.description || "",
        marks: s.marks || s.allocated_marks || 0,
        questions: s.questions || s.question_count_target || 0,
        difficulty:
          s.allowed_question_types?.difficulty || s.difficulty || "Medium",
        allowedTypes: s.allowed_question_types?.types?.map((t: string) =>
          mapBackendToFrontendType(t),
        ) ||
          s.allowed_question_types?.types || ["mcq"],
        bloomLevel:
          s.allowed_question_types?.bloom_level ||
          s.bloom_level ||
          "understand",
      }));
      const refreshedQuestions = (refreshed.assessment_questions || []).map(
        (aq: any) => {
          const type = mapBackendToFrontendType(aq.question.question_type);
          const optionsRaw = aq.question.options || [];
          const unpacked = unpackOpenEndedFields(aq.question, optionsRaw);
          return {
            id: aq.question.id,
            sectionId: aq.section_id,
            text: aq.question.text,
            type,
            marks: aq.question.marks,
            options:
              type === "essay" ||
              type === "shortanswer" ||
              type === "computational"
                ? [
                    {
                      option_text:
                        unpacked.modelAnswer || aq.question.explanation || "",
                      is_correct: true,
                      order_index: 0,
                    },
                  ]
                : optionsRaw.map((o: any, idx: number) => ({
                    option_text: o.option_text,
                    is_correct: o.is_correct,
                    order_index: idx,
                  })),
            aiGenerated: aq.question.ai_generated,
            is_required: aq.question.is_required,
            rubric: unpacked.rubric,
            wordLimit: unpacked.wordLimit,
            solutionSteps: unpacked.solutionSteps,
            tolerance: unpacked.tolerance,
            question_table_context:
              aq.question.question_table_context ||
              aq.question.questionTableContext,
            questionTableContext:
              aq.question.question_table_context ||
              aq.question.questionTableContext,
            requires_table_answer: !!(
              aq.question.requires_table_answer ||
              aq.question.requiresTableAnswer
            ),
            requiresTableAnswer: !!(
              aq.question.requires_table_answer ||
              aq.question.requiresTableAnswer
            ),
            answer_table_template:
              aq.question.answer_table_template ||
              aq.question.answerTableTemplate,
            answerTableTemplate:
              aq.question.answer_table_template ||
              aq.question.answerTableTemplate,
          };
        },
      );

      const failedSections = latestBlueprint.filter((sec: any) =>
        aiFailedSectionIds.includes(sec.id),
      );
      const sectionsPayload = failedSections.map((sec: any) => {
        const qType = sec.allowedTypes[0] || "mcq";
        const marksVal = calculateSectionMarksPerQuestion(
          sec.id,
          latestBlueprint,
          refreshedQuestions,
        );
        return {
          section_id: sec.id,
          topic: sec.topics || "General Topic",
          question_type: mapFrontendToBackendType(qType) as any,
          difficulty: sec.difficulty.toLowerCase() as any,
          count: sec.questions || 3,
          bloom_level: (sec.bloomLevel || "understand") as any,
          marks_per_question: marksVal,
        };
      });

      const firstSec = failedSections[0] || latestBlueprint[0];
      const topType = firstSec ? firstSec.allowedTypes[0] || "mcq" : "mcq";
      const topDiff = firstSec ? firstSec.difficulty || "medium" : "medium";
      const topBloom = firstSec
        ? firstSec.bloomLevel || "understand"
        : "understand";

      toast.info(
        `Retrying question generation for ${failedSections.length} sections...`,
      );
      const res = await aiGenerationApi.generateQuestions({
        subject: metadata.title || "Subject",
        topic: "Multiple Topics (Blueprint-aligned)",
        question_type: mapFrontendToBackendType(topType) as any,
        difficulty: topDiff.toLowerCase() as any,
        bloom_level: topBloom as any,
        count:
          failedSections.reduce(
            (sum: number, s: any) => sum + (s.questions || 0),
            0,
          ) || 5,
        additional_context: aiGenerationConfig.additional_context,
        target_assessment_id: id as string,
        sections: sectionsPayload,
        workspace_id: metadata.teaching_workspace_id || undefined,
        blueprint_constraints: buildBlueprintConstraints(
          latestBlueprint,
          refreshedQuestions,
        ),
        learning_outcomes: selectedWorkspaceDetail?.description || undefined,
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

    const action = async () => {
      setIsReviewApplying(true);
      isReviewApplyingRef.current = true;
      try {
        const targetSecId =
          (candidate as any)._sectionId ||
          (aiTargetSectionId === "all"
            ? findMatchingSectionForType(candidate.question_type)
            : aiTargetSectionId);

        const marksPerQuestion = calculateSectionMarksPerQuestion(
          targetSecId,
          blueprint,
          questionsRef.current,
        );

        const res = await aiGenerationApi.reviewQuestion(candidateId, {
          decision: "approved",
          add_to_assessment_id: id as string,
          add_to_section_id: targetSecId,
          marks_if_added: marksPerQuestion,
          save_to_bank: saveToBank,
        });

        const newQ = mapCandidateToQuestion(
          candidate,
          targetSecId,
          marksPerQuestion,
        );
        newQ.id =
          res?.assessment_question?.id ||
          res?.promoted_question?.id ||
          candidate.id;

        const nextQuestions = [...questionsRef.current, newQ];
        setQuestions(nextQuestions);
        setAiCandidates((prev) => prev.filter((c) => c.id !== candidateId));
        toast.success("Question accepted and added!");

        isReviewApplyingRef.current = false;
        setIsReviewApplying(false);
        await runAutosave(5, undefined, undefined, nextQuestions);
      } catch (err) {
        isReviewApplyingRef.current = false;
        setIsReviewApplying(false);
        toast.error("Failed to accept AI question.");
        throw err;
      }
    };

    activeAutosavePromiseRef.current = activeAutosavePromiseRef.current
      .then(action)
      .catch((err) => {
        console.error("Error in accept candidate queue execution:", err);
      });

    await activeAutosavePromiseRef.current;
  };

  const handleRejectCandidate = async (candidateId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to reject this candidate question?",
      )
    ) {
      return;
    }
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

    const action = async () => {
      setIsReviewApplying(true);
      isReviewApplyingRef.current = true;
      try {
        const targetSecId =
          (candidate as any)._sectionId ||
          (aiTargetSectionId === "all"
            ? findMatchingSectionForType(candidate.question_type)
            : aiTargetSectionId);

        const marksPerQuestion = calculateSectionMarksPerQuestion(
          targetSecId,
          blueprint,
          questionsRef.current,
        );

        const payload: any = {
          decision: "edited",
          modified_question_text: editingText,
          modified_explanation: editingExplanation,
          add_to_assessment_id: id as string,
          add_to_section_id: targetSecId,
          marks_if_added: marksPerQuestion,
          save_to_bank: saveToBank,
        };

        const candOpts = candidate.options || candidate._options || [];
        if (candOpts.length > 0) {
          payload.modified_options_json = JSON.stringify(editingOptions);
        }

        const res = await aiGenerationApi.reviewQuestion(candidateId, payload);

        const newQ = mapCandidateToQuestion(
          candidate,
          targetSecId,
          marksPerQuestion,
          editingExplanation,
          editingText,
          candOpts.length > 0
            ? editingOptions.map((o) => ({
                text: o.text,
                option_text: o.text,
                option_text_right: o.explanation || "",
                is_correct: o.is_correct,
                explanation: o.explanation || "",
                order_index: o.order_index,
              }))
            : undefined,
        );
        newQ.id =
          res?.assessment_question?.id ||
          res?.promoted_question?.id ||
          candidate.id;

        const nextQuestions = [...questionsRef.current, newQ];
        setQuestions(nextQuestions);
        setAiCandidates((prev) => prev.filter((c) => c.id !== candidateId));
        setEditingCandidateId(null);
        toast.success("Edited question accepted!");

        isReviewApplyingRef.current = false;
        setIsReviewApplying(false);
        await runAutosave(5, undefined, undefined, nextQuestions);
      } catch (err) {
        isReviewApplyingRef.current = false;
        setIsReviewApplying(false);
        toast.error("Failed to save edited question.");
        throw err;
      }
    };

    activeAutosavePromiseRef.current = activeAutosavePromiseRef.current
      .then(action)
      .catch((err) => {
        console.error("Error in save edited candidate queue execution:", err);
      });

    await activeAutosavePromiseRef.current;
  };

  const handleAcceptAllCandidates = async () => {
    const action = async () => {
      setIsReviewApplying(true);
      isReviewApplyingRef.current = true;
      try {
        const results = await Promise.all(
          aiCandidates.map((c) => {
            const targetSecId =
              (c as any)._sectionId ||
              (aiTargetSectionId === "all"
                ? findMatchingSectionForType(c.question_type)
                : aiTargetSectionId);
            const marksPerQuestion = calculateSectionMarksPerQuestion(
              targetSecId,
              blueprint,
              questionsRef.current,
            );
            return aiGenerationApi.reviewQuestion(c.id, {
              decision: "approved",
              add_to_assessment_id: id as string,
              add_to_section_id: targetSecId,
              marks_if_added: marksPerQuestion,
              save_to_bank: saveToBank,
            });
          }),
        );

        const simulatedQuestions = [...questionsRef.current];
        const newQs = aiCandidates.map((c, index) => {
          const res = results[index];
          const realId =
            res?.assessment_question?.id || res?.promoted_question?.id || c.id;
          const targetSecId =
            (c as any)._sectionId ||
            (aiTargetSectionId === "all"
              ? findMatchingSectionForType(c.question_type)
              : aiTargetSectionId);

          const marksPerQuestion = calculateSectionMarksPerQuestion(
            targetSecId,
            blueprint,
            simulatedQuestions,
          );
          const newQ = mapCandidateToQuestion(c, targetSecId, marksPerQuestion);
          newQ.id = realId;
          simulatedQuestions.push(newQ);
          return newQ;
        });
        setQuestions(simulatedQuestions);
        setAiCandidates([]);
        setAiReviewDrawerOpen(false);
        toast.success("All candidate questions accepted!");

        isReviewApplyingRef.current = false;
        setIsReviewApplying(false);
        await runAutosave(5, undefined, undefined, simulatedQuestions);
      } catch (err) {
        isReviewApplyingRef.current = false;
        setIsReviewApplying(false);
        toast.error("Failed to accept all questions.");
        throw err;
      }
    };

    activeAutosavePromiseRef.current = activeAutosavePromiseRef.current
      .then(action)
      .catch((err) => {
        console.error("Error in accept all candidates queue execution:", err);
      });

    await activeAutosavePromiseRef.current;
  };

  const handleRejectAllCandidates = async () => {
    if (
      !window.confirm(
        "Are you sure you want to reject all candidate questions?",
      )
    ) {
      return;
    }
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
  const addSection = () => {
    const nextLetter = String.fromCharCode(65 + blueprint.length);
    const newSec: BlueprintSection = {
      id: `sec-${Date.now()}`,
      section: `Section ${nextLetter}`,
      topics: "",
      marks: 0,
      questions: 0,
      difficulty: "Medium",
      allowedTypes: ["mcq"],
      bloomLevel: "understand",
    };
    setBlueprint([...blueprint, newSec]);
  };

  const updateSection = (id: string, updates: Partial<BlueprintSection>) => {
    setBlueprint(
      blueprint.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    );
  };

  const removeSection = (id: string) => {
    if (blueprint.length === 1) return;
    setBlueprint(blueprint.filter((s) => s.id !== id));
    setQuestions(questions.filter((q) => q.sectionId !== id));
  };

  const updateQuestionsAndAutosave = (nextQuestions: Question[]) => {
    setQuestions(nextQuestions);
    triggerDebouncedAutosave(5, undefined, undefined, nextQuestions);
  };

  const addQuestion = (sectionId: string, groupId?: string) => {
    const sec = blueprint.find((s) => s.id === sectionId);
    if (!sec) return;
    const type = sec.allowedTypes[0] || "mcq";

    const sMarks = Number(sec.marks) || 0;
    const sQuestions = Number(sec.questions) || 0;
    const calculatedMarks =
      sQuestions > 0 ? Math.floor(sMarks / sQuestions) : 2;
    const defaultMarks = calculatedMarks > 0 ? calculatedMarks : 2;

    const newQ: Question = {
      id: `q-${Date.now()}`,
      sectionId,
      groupId,
      text: "",
      type: type as any,
      marks: defaultMarks,
      options:
        type === "mcq"
          ? [
              { option_text: "Option 1", is_correct: true, order_index: 0 },
              { option_text: "Option 2", is_correct: false, order_index: 1 },
            ]
          : [],
      aiGenerated: false,
      is_required: true,
    };
    const nextQuestions = [...questions, newQ];
    updateQuestionsAndAutosave(nextQuestions);
  };

  const updateQuestion = (qId: string, updates: Partial<Question>) => {
    const nextQuestions = questions.map((q) =>
      q.id === qId ? { ...q, ...updates } : q,
    );
    updateQuestionsAndAutosave(nextQuestions);
  };

  const removeQuestion = (qId: string) => {
    const nextQuestions = questions.filter((q) => q.id !== qId);
    updateQuestionsAndAutosave(nextQuestions);
  };

  // Question Options Management
  const updateOption = (
    qId: string,
    idx: number,
    updates: Partial<QuestionOption>,
  ) => {
    const nextQuestions = questions.map((q) => {
      if (q.id !== qId) return q;
      const opts = [...q.options];
      opts[idx] = { ...opts[idx], ...updates };
      let nextMarks = q.marks;
      if (q.type === "casestudy") {
        nextMarks = opts.reduce(
          (sum, o) =>
            sum +
            (parseInt(
              o.match_key !== undefined
                ? o.match_key
                : String(o.order_index || 0),
            ) || 0),
          0,
        );
      }
      return { ...q, options: opts, marks: nextMarks };
    });
    updateQuestionsAndAutosave(nextQuestions);
  };

  const addOption = (qId: string) => {
    const nextQuestions = questions.map((q) => {
      if (q.id !== qId) return q;
      const newOptions = [
        ...q.options,
        {
          option_text: "New Option",
          is_correct: q.type === "casestudy" ? true : false,
          order_index: q.options.length,
          match_key: q.type === "casestudy" ? "5" : undefined,
        },
      ];
      let nextMarks = q.marks;
      if (q.type === "casestudy") {
        nextMarks = newOptions.reduce(
          (sum, o) =>
            sum +
            (parseInt(
              o.match_key !== undefined
                ? o.match_key
                : String(o.order_index || 0),
            ) || 0),
          0,
        );
      }
      return { ...q, options: newOptions, marks: nextMarks };
    });
    updateQuestionsAndAutosave(nextQuestions);
  };

  const removeOption = (qId: string, idx: number) => {
    const nextQuestions = questions.map((q) => {
      if (q.id !== qId) return q;
      const newOptions = q.options
        .filter((_, i) => i !== idx)
        .map((o, i) => ({ ...o, order_index: i }));
      let nextMarks = q.marks;
      if (q.type === "casestudy") {
        nextMarks = newOptions.reduce(
          (sum, o) =>
            sum +
            (parseInt(
              o.match_key !== undefined
                ? o.match_key
                : String(o.order_index || 0),
            ) || 0),
          0,
        );
      }
      return { ...q, options: newOptions, marks: nextMarks };
    });
    updateQuestionsAndAutosave(nextQuestions);
  };

  const handleBankSelect = async (
    bankItem: QuestionBankItem,
    sectionId: string,
    groupId?: string,
  ) => {
    try {
      const q = await questionApi.getQuestion(bankItem.id);
      const mappedType = q.question_type
        .toLowerCase()
        .replaceAll("_", "") as QuestionType;
      const optionsRaw = q.options || [];
      const unpacked = unpackOpenEndedFields(q, optionsRaw);

      const nextQuestions = [
        ...questionsRef.current,
        {
          id: `q-bank-${q.id}-${Date.now()}`,
          sectionId,
          groupId,
          text: q.content,
          imageUrl: q.image_url,
          type: mappedType,
          marks: q.marks,
          options: ["essay", "shortanswer", "computational"].includes(
            mappedType,
          )
            ? [
                {
                  id: optionsRaw[0]?.id,
                  option_text: unpacked.modelAnswer || q.explanation || "",
                  option_text_right: "",
                  is_correct: true,
                  order_index: 0,
                },
              ]
            : optionsRaw.map((o: any, idx: number) => ({
                id: o.id,
                option_text: o.option_text || o.content,
                option_text_right: o.option_text_right || o.match_value,
                is_correct: o.is_correct,
                order_index: o.order_index !== undefined ? o.order_index : idx,
              })),
          caseStudyContext:
            (q as any).case_study_context || (q as any).caseStudyContext,
          computationalType:
            (q as any).computational_type || (q as any).computationalType,
          rubric: unpacked.rubric,
          wordLimit: unpacked.wordLimit,
          solutionSteps: unpacked.solutionSteps,
          tolerance: unpacked.tolerance,
          aiGenerated: false,
          is_required: true,
        },
      ];
      updateQuestionsAndAutosave(nextQuestions);
      toast.success("Added from question bank.");
    } catch (err) {
      toast.error("Failed to fetch bank question.");
    }
  };

  const handleQuestionDragEnd = (event: any, sectionId: string) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const sectionQuestions = questions.filter(
        (q) => q.sectionId === sectionId,
      );
      const oldIdx = sectionQuestions.findIndex((q) => q.id === active.id);
      const newIdx = sectionQuestions.findIndex((q) => q.id === over.id);

      const reorderedSection = arrayMove(sectionQuestions, oldIdx, newIdx);

      const otherSectionQuestions = questions.filter(
        (q) => q.sectionId !== sectionId,
      );
      const merged = [...otherSectionQuestions, ...reorderedSection];
      updateQuestionsAndAutosave(merged);
    }
  };

  const handleSaveToBank = async (q: Question) => {
    try {
      await questionApi.createQuestion({
        content: q.text,
        image_url: q.imageUrl,
        question_type: mapFrontendToBackendType(q.type) as any,
        difficulty: "medium",
        suggested_marks: q.marks,
        options: q.options.map((o) => ({
          option_text: o.option_text,
          option_text_right: o.option_text_right,
          is_correct: o.is_correct,
          order_index: o.order_index,
        })),
        topic: blueprint.find((s) => s.id === q.sectionId)?.topics || "",
      });
      toast.success("Saved to question bank.");
    } catch (err) {
      toast.error("Failed to save to bank.");
    }
  };

  const formatDisplayTime = (timeStr: string) => {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":");
    const d = new Date();
    d.setHours(parseInt(h), parseInt(m));
    return format(d, "h:mm a");
  };

  useEffect(() => {
    async function fetchGroups() {
      if (!id || !selectedWorkspaceDetail || !metadata.is_group_assessment) return;
      try {
        const roster = selectedWorkspaceDetail.roster || [];
        const fetched = await groupWorkApi.getGroups(id as string);
        const mappedGroups = fetched.map((sg: any) => ({
          id: sg.id,
          name: sg.name,
          members: (sg.members || []).map((m: any) => {
            const memberStudentId = m.id || m.student_id;
            const studentInfo = roster.find((r: any) => (r.id || r.student_id) === memberStudentId);
            return {
              id: memberStudentId,
              name: m.name || studentInfo?.name || "Student",
              email: studentInfo?.email || "",
              is_leader: !!m.is_leader
            };
          })
        }));
        setGroups(mappedGroups);
      } catch (err: any) {
        if (err.message?.includes("is not configured as group work")) {
          console.log("Assessment draft not yet configured as group work on the backend.");
        } else {
          console.warn("Failed to load existing groups:", err);
        }
      }
    }
    fetchGroups();
  }, [id, selectedWorkspaceDetail, metadata.is_group_assessment]);

  const handleTriggerAutoGrouping = async () => {
    if (!id) {
      toast.error("Assessment ID not found.");
      return;
    }
    setIsGeneratingAutoGroups(true);
    try {
      const res = await groupWorkApi.autoGenerateGroups(id as string, {
        max_group_size: metadata.max_group_size || 4,
        allow_smaller_final_group: true,
        naming_pattern: "Group {index}"
      });
      const roster = selectedWorkspaceDetail?.roster || [];
      const mappedGroups: Group[] = res.map((sg: any) => ({
        id: sg.id,
        name: sg.name,
        members: (sg.members || []).map((m: any) => {
          const memberStudentId = m.id || m.student_id;
          const studentInfo = roster.find(r => (r.id || r.student_id) === memberStudentId);
          return {
            id: memberStudentId,
            name: m.name || studentInfo?.name || "Student",
            email: studentInfo?.email || "",
            is_leader: !!m.is_leader
          };
        })
      }));
      setAutoGroupsPreview(mappedGroups);
      toast.success("Groups auto-generated successfully! Check preview below.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to auto-generate groups.");
    } finally {
      setIsGeneratingAutoGroups(false);
    }
  };

  const handleConfirmAutoGrouping = () => {
    if (autoGroupsPreview) {
      setGroups(autoGroupsPreview);
      setAutoGroupsPreview(null);
      toast.success("Auto-grouping layout confirmed and applied!");
    }
  };

  const renderStepContent = (stepNum: number) => {
    switch (stepNum) {
      case 1:
        return (
          <div className="space-y-6">
            <Card className="shadow-none border">
              <CardHeader className="py-5 border-b">
                <CardTitle className="text-lg">Assessment Identity</CardTitle>
                <CardDescription>
                  Update the core details and schedule for this assessment.
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
                      value={metadata.title}
                      onChange={(e) => {
                        setMetadata({ ...metadata, title: e.target.value });
                        triggerDebouncedAutosave(1);
                      }}
                      placeholder="e.g. Mid-Semester CAT"
                      className="h-10 font-medium"
                      disabled={isFieldDisabled("title")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workspace">
                      Teaching Workspace <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={metadata.teaching_workspace_id}
                      disabled={isFieldDisabled("teaching_workspace_id")}
                      onValueChange={(v) => {
                        setMetadata({
                          ...metadata,
                          teaching_workspace_id: v,
                          course_id: v,
                        });
                        loadWorkspaceDetail(v);
                        runAutosave(1, {
                          teaching_workspace_id: v,
                          course_id: v,
                        });
                      }}
                    >
                      <SelectTrigger className="h-10" id="workspace">
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
                    placeholder="Brief overview..."
                    className="min-h-[100px] text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-dashed">
                  <div className="space-y-2">
                    <Label htmlFor="mode">
                      Mode <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={metadata.mode}
                      disabled={isFieldDisabled("mode")}
                      onValueChange={(v: any) => {
                        const isGroup = v === "Groupwork";
                        const updated = {
                          ...metadata,
                          mode: v,
                          is_group_assessment: isGroup
                        };
                        setMetadata(updated);
                        runAutosave(1, updated);
                      }}
                    >
                      <SelectTrigger className="h-10" id="mode">
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
                            {m === "Groupwork" ? "Group Work" : m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">
                      Scheduled Date <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="date"
                      id="date"
                      value={
                        metadata.date ? format(metadata.date, "yyyy-MM-dd") : ""
                      }
                      onChange={(e) => {
                        const d = e.target.value
                          ? new Date(e.target.value)
                          : undefined;
                        setMetadata({ ...metadata, date: d });
                        runAutosave(1, { date: d });
                      }}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startTime">
                      Start Time <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="time"
                      id="startTime"
                      value={metadata.startTime}
                      onChange={(e) => {
                        setMetadata({ ...metadata, startTime: e.target.value });
                        triggerDebouncedAutosave(1);
                      }}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime">
                      {metadata.mode === "Groupwork" ? "Group Submission Deadline" : "End Time"} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="time"
                      id="endTime"
                      value={metadata.endTime}
                      onChange={(e) => {
                        setMetadata({ ...metadata, endTime: e.target.value });
                        triggerDebouncedAutosave(1);
                      }}
                      className="h-10"
                    />
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
                      value={metadata.durationMinutes}
                      onChange={(e) => {
                        setMetadata({
                          ...metadata,
                          durationMinutes: parseInt(e.target.value) || 0,
                        });
                        triggerDebouncedAutosave(1);
                      }}
                      className="h-10"
                    />
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
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {metadata.mode === "Groupwork" && (
              <Card className="shadow-none border mt-6 animate-in fade-in slide-in-from-top-2 duration-200">
                <CardHeader className="py-4 border-b">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Users className="size-4 text-primary" /> Compact Group Work Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="max-group-size-st1">Max Group Size</Label>
                      <Input
                        id="max-group-size-st1"
                        type="number"
                        min={2}
                        max={10}
                        value={metadata.max_group_size || 4}
                        onChange={(e) => {
                          const updated = {
                            ...metadata,
                            max_group_size: parseInt(e.target.value) || 4,
                          };
                          setMetadata(updated);
                          runAutosave(1, updated);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="formation-mode-st1">Formation Mode</Label>
                      <Select
                        value={metadata.group_formation_mode || "random"}
                        onValueChange={(val) => {
                          const updated = {
                            ...metadata,
                            group_formation_mode: val,
                            group_assignment_mode: val === "self_enrol" ? ("MANUAL" as const) : ("AUTOMATIC" as const)
                          };
                          setMetadata(updated);
                          runAutosave(1, updated);
                        }}
                      >
                        <SelectTrigger id="formation-mode-st1">
                          <SelectValue placeholder="Select formation mode..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="random">Random Split</SelectItem>
                          <SelectItem value="similar_performance">Similar Academic Performance</SelectItem>
                          <SelectItem value="diverse_performance">Diverse Academic Performance</SelectItem>
                          <SelectItem value="self_enrol">Self Enrollment</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="assignment-mode-st1">Assignment Mode</Label>
                      <Select
                        value={metadata.group_assignment_mode || "AUTOMATIC"}
                        onValueChange={(val) => {
                          const updated = {
                            ...metadata,
                            group_assignment_mode: val as any,
                          };
                          setMetadata(updated);
                          runAutosave(1, updated);
                        }}
                      >
                        <SelectTrigger id="assignment-mode-st1">
                          <SelectValue placeholder="Select assignment mode..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AUTOMATIC">Automatic</SelectItem>
                          <SelectItem value="MANUAL">Manual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-dashed">
                    <div className="space-y-2">
                      <Label htmlFor="submission-mode-st1">Submission Mode</Label>
                      <Select
                        value={metadata.submission_mode || "SINGLE_LEADER"}
                        onValueChange={(val) => {
                          const updated = {
                            ...metadata,
                            submission_mode: val as any,
                          };
                          setMetadata(updated);
                          runAutosave(1, updated);
                        }}
                      >
                        <SelectTrigger id="submission-mode-st1">
                          <SelectValue placeholder="Select submission mode..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SINGLE_LEADER">Single Leader Submits on Behalf of Group</SelectItem>
                          <SelectItem value="ALL_MEMBERS">All Members Submit Individually (Aggregated)</SelectItem>
                          <SelectItem value="MAJORITY_VOTE">Majority Vote (Multiple submissions, consensus needed)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">
                        Defines which team member can trigger the group submission workflow.
                      </p>
                    </div>

                    <div className="flex flex-col justify-center space-y-4">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="indiv-weighting-st1"
                          checked={metadata.individual_weighting_enabled || false}
                          onCheckedChange={(checked) => {
                            const updated = {
                              ...metadata,
                              individual_weighting_enabled: checked,
                            };
                            setMetadata(updated);
                            runAutosave(1, updated);
                          }}
                        />
                        <div className="space-y-0.5">
                          <Label htmlFor="indiv-weighting-st1" className="cursor-pointer">Enable Individual Contribution Weighting</Label>
                          <p className="text-[10px] text-muted-foreground">
                            Adjust final student marks by an individual contribution factor.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          id="peer-eval-st1"
                          checked={metadata.peer_evaluation_enabled || false}
                          onCheckedChange={(checked) => {
                            const updated = {
                              ...metadata,
                              peer_evaluation_enabled: checked,
                            };
                            setMetadata(updated);
                            runAutosave(1, updated);
                          }}
                        />
                        <div className="space-y-0.5">
                          <Label htmlFor="peer-eval-st1" className="cursor-pointer">Enable Intra-Group Peer Evaluation</Label>
                          <p className="text-[10px] text-muted-foreground">
                            Allow group members to grade each other&apos;s performance.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {metadata.peer_evaluation_enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-dashed animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="space-y-2">
                        <Label htmlFor="peer-eval-weight-st1">Peer Score Weight (%)</Label>
                        <Input
                          id="peer-eval-weight-st1"
                          type="number"
                          min={1}
                          max={100}
                          placeholder="e.g. 20"
                          value={metadata.peer_evaluation_weight_percent || ""}
                          onChange={(e) => {
                            const val = e.target.value === "" ? "" : parseInt(e.target.value) || 0;
                            const updated = {
                              ...metadata,
                              peer_evaluation_weight_percent: val as any,
                            };
                            setMetadata(updated);
                            runAutosave(1, updated);
                          }}
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Percentage of final mark determined by the average peer rating.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="peer-eval-deadline-st1">Peer Evaluation Deadline</Label>
                        <Input
                          id="peer-eval-deadline-st1"
                          type="datetime-local"
                          value={metadata.peer_evaluation_deadline || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) {
                              const deadline = new Date(val);
                              const submissionDeadline = getGroupSubmissionDeadline(metadata);
                              if (submissionDeadline && deadline <= submissionDeadline) {
                                toast.error("Peer evaluation deadline must be after the group submission deadline.");
                                return;
                              }
                            }
                            const updated = {
                              ...metadata,
                              peer_evaluation_deadline: e.target.value,
                            };
                            setMetadata(updated);
                            runAutosave(1, updated);
                          }}
                        />
                        <p className="text-[10px] text-muted-foreground text-destructive font-medium">
                          Note: The peer review deadline is separate and must occur AFTER the general group submission deadline.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

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
                    {metadata.mode === "Groupwork" && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3.5 flex items-start gap-3">
                        <Info className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Group Work Assessment — Security rules relaxed by default</p>
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                            Safe Browser, Integrity Monitoring, and question shuffling have been disabled as group work is typically a take-home deliverable.
                            Review and adjust these settings if your delivery context requires stricter controls (e.g. an in-class group presentation).
                          </p>
                        </div>
                      </div>
                    )}
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
                          desc: "Allow LLM tools",
                        },
                        {
                          key: "openBook",
                          label: "Open Book",
                          desc: "Reference materials allowed",
                        },
                        {
                          key: "integrityMonitoring",
                          label: "Integrity Checks",
                          desc: "Flag behavior anomalies",
                        },
                        {
                          key: "lateSubmissionAllowed",
                          label: "Late Submission",
                          desc: "Allow work after deadline",
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
                            disabled={isFieldDisabled(item.key)}
                            onCheckedChange={(v) => {
                              setRules({ ...rules, [item.key]: v });
                              runAutosave(2, undefined, { [item.key]: v });
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3 pt-5 border-t">
                      <Label htmlFor="resultRelease">Result Release Mode</Label>
                      <Select
                        value={
                          rules.resultRelease
                            ? rules.resultRelease.toUpperCase()
                            : "MANUAL"
                        }
                        onValueChange={(v: any) => {
                          const updatedMeta = {
                            ...metadata,
                            result_release_mode: v,
                          };
                          const updatedRules = {
                            ...rules,
                            resultRelease: v.toLowerCase() as any,
                          };
                          setMetadata(updatedMeta);
                          setRules(updatedRules);
                          runAutosave(
                            2,
                            { result_release_mode: v },
                            { resultRelease: v.toLowerCase() as any },
                          );
                        }}
                      >
                        <SelectTrigger className="h-9" id="resultRelease">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="IMMEDIATE">Immediate</SelectItem>
                          <SelectItem value="MANUAL">Manual</SelectItem>
                          <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="pt-5 border-t">
                      <div className="space-y-4">
                        {metadata.mode !== "Groupwork" && (
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5">
                            <Label
                              htmlFor="shuffleQuestions"
                              className="text-sm"
                            >
                              Randomize Questions
                            </Label>
                          </div>
                          <Switch
                            id="shuffleQuestions"
                            checked={rules.shuffleQuestions}
                            onCheckedChange={(v) => {
                              setRules({ ...rules, shuffleQuestions: v });
                              runAutosave(2, undefined, {
                                shuffleQuestions: v,
                              });
                            }}
                          />
                        </div>
                        )}
                        {metadata.mode !== "Groupwork" && (
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5">
                            <Label htmlFor="shuffleOptions" className="text-sm">
                              Randomize Options
                            </Label>
                          </div>
                          <Switch
                            id="shuffleOptions"
                            checked={rules.shuffleOptions}
                            onCheckedChange={(v) => {
                              setRules({ ...rules, shuffleOptions: v });
                              runAutosave(2, undefined, { shuffleOptions: v });
                            }}
                          />
                        </div>
                        )}

                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5">
                            <Label
                              htmlFor="passwordProtected"
                              className="text-sm cursor-pointer"
                            >
                              Password Protected
                            </Label>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              Require code to start
                            </p>
                          </div>
                          <Switch
                            id="passwordProtected"
                            checked={rules.passwordProtected}
                            onCheckedChange={(v) => {
                              setRules({ ...rules, passwordProtected: v });
                              runAutosave(2, undefined, {
                                passwordProtected: v,
                              });
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
                              placeholder={
                                rules.passwordProtected
                                  ? "•••••••• (Saved)"
                                  : "Type access code..."
                              }
                              value={rules.accessPassword}
                              onChange={(e) => {
                                setRules({
                                  ...rules,
                                  accessPassword: e.target.value,
                                });
                                triggerDebouncedAutosave(2, undefined, {
                                  accessPassword: e.target.value,
                                });
                              }}
                              className="h-9 text-sm bg-white"
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
                                triggerDebouncedAutosave(2, undefined, {
                                  attempts: parseInt(e.target.value) || 1,
                                });
                              }}
                              className="h-9 text-sm bg-white"
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
                                  triggerDebouncedAutosave(2, undefined, {
                                    latePenaltyPercent:
                                      parseFloat(e.target.value) || 0,
                                  });
                                }}
                                className="h-9 text-sm bg-white"
                              />
                            </div>
                          )}
                        </div>

                        {rules.lateSubmissionAllowed &&
                          metadata.mode === "Homework" && (
                            <div className="space-y-1.5">
                              <Label htmlFor="gracePeriodMinutes">
                                Grace Period (minutes)
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
                                  triggerDebouncedAutosave(2, undefined, {
                                    gracePeriodMinutes:
                                      parseInt(e.target.value) || 0,
                                  });
                                }}
                                className="h-9 text-sm bg-white"
                              />
                            </div>
                          )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="shadow-none border">
                  <CardHeader className="py-4 border-b">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Instructions Text
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5">
                    <Textarea
                      placeholder="Define student-facing rules..."
                      className="min-h-[250px] text-sm bg-white"
                      value={metadata.instructions}
                      onChange={(e) => {
                        setMetadata({
                          ...metadata,
                          instructions: e.target.value,
                        });
                        triggerDebouncedAutosave(2);
                      }}
                    />
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
                Target & Audience <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        );
      case 3: {
        const roster = selectedWorkspaceDetail?.roster || [];
        const filteredRoster = roster.filter((s) => {
          if (!studentSearch) return true;
          const sl = studentSearch.toLowerCase();
          return (
            s.name?.toLowerCase().includes(sl) ||
            s.email?.toLowerCase().includes(sl) ||
            s.student_id?.toLowerCase().includes(sl)
          );
        });
        const isGroupMode = metadata.mode === "Groupwork";

        return (
          <div className="space-y-6">
            {isGroupMode ? (
              <Card className="shadow-none border">
                <CardHeader className="py-5 border-b">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Users className="size-5 text-primary" /> Group Formation Panel
                  </CardTitle>
                  <CardDescription>
                    Organize students into groups for this group work assessment.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <Tabs defaultValue="auto" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="auto">Auto-Formation</TabsTrigger>
                      <TabsTrigger value="manual">Manual Builder</TabsTrigger>
                      <TabsTrigger value="csv">CSV Import</TabsTrigger>
                    </TabsList>

                    <TabsContent value="auto" className="space-y-6 pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="max-group-size">Max Group Size</Label>
                          <Input
                            id="max-group-size"
                            type="number"
                            min={2}
                            max={10}
                            value={metadata.max_group_size || 4}
                            onChange={(e) => {
                              const updated = {
                                ...metadata,
                                max_group_size: parseInt(e.target.value) || 4,
                              };
                              setMetadata(updated);
                              runAutosave(3, updated);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="formation-mode">Formation Mode</Label>
                          <Select
                            value={metadata.group_formation_mode || "random"}
                            onValueChange={(val) => {
                              const updated = {
                                ...metadata,
                                group_formation_mode: val,
                                group_assignment_mode: val === "self_enrol" ? ("MANUAL" as const) : ("AUTOMATIC" as const)
                              };
                              setMetadata(updated);
                              runAutosave(3, updated);
                            }}
                          >
                            <SelectTrigger id="formation-mode">
                              <SelectValue placeholder="Select formation mode..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="random">Random Split</SelectItem>
                              <SelectItem value="similar_performance">Similar Academic Performance</SelectItem>
                              <SelectItem value="diverse_performance">Diverse Academic Performance</SelectItem>
                              <SelectItem value="self_enrol">Self Enrollment</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleTriggerAutoGrouping}
                          disabled={isGeneratingAutoGroups}
                          className="h-10 px-6"
                        >
                          {isGeneratingAutoGroups ? "Generating..." : "Generate & Preview Groups"}
                        </Button>
                      </div>

                      {autoGroupsPreview && (
                        <div className="space-y-4 pt-6 border-t border-dashed animate-in fade-in slide-in-from-top-2 duration-200">
                          <h4 className="text-sm font-bold text-foreground">Generated Groups Preview</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {autoGroupsPreview.map((g) => (
                              <Card key={g.id} className="border bg-background/50 shadow-none">
                                <CardHeader className="p-3 border-b bg-muted/20 flex flex-row items-center justify-between">
                                  <span className="text-xs font-bold text-foreground">{g.name}</span>
                                  <Badge variant="outline" className="text-[10px] px-1.5 h-4.5">
                                    {g.members.length} members
                                  </Badge>
                                </CardHeader>
                                <CardContent className="p-3 space-y-1 text-xs">
                                  {g.members.map((m) => (
                                    <div key={m.id} className="flex justify-between items-center py-1">
                                      <span className="font-medium">{m.name}</span>
                                      {m.is_leader && (
                                        <Badge variant="outline" className="text-[9px] bg-primary/5 text-primary border-primary/20">
                                          Leader
                                        </Badge>
                                      )}
                                    </div>
                                  ))}
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                          <div className="flex justify-end gap-3 pt-4">
                            <Button
                              type="button"
                              onClick={handleConfirmAutoGrouping}
                              className="h-10 px-6 font-semibold"
                            >
                              Confirm & Apply Grouping
                            </Button>
                          </div>
                        </div>
                      )}

                      {!autoGroupsPreview && groups.length > 0 && (
                        <div className="space-y-4 pt-6 border-t border-dashed">
                          <h4 className="text-sm font-bold text-foreground">Active Groups ({groups.length})</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {groups.map((g) => (
                              <Card key={g.id} className="border bg-background/50 shadow-none">
                                <CardHeader className="p-3 border-b bg-muted/20 flex flex-row items-center justify-between">
                                  <span className="text-xs font-bold text-foreground">{g.name}</span>
                                  <Badge variant="outline" className="text-[10px] px-1.5 h-4.5">
                                    {g.members.length} members
                                  </Badge>
                                </CardHeader>
                                <CardContent className="p-3 space-y-1 text-xs">
                                  {g.members.map((m) => (
                                    <div key={m.id} className="flex justify-between items-center py-1">
                                      <span className="font-medium">{m.name}</span>
                                      {m.is_leader && (
                                        <Badge variant="outline" className="text-[9px] bg-primary/5 text-primary border-primary/20">
                                          Leader
                                        </Badge>
                                      )}
                                    </div>
                                  ))}
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="manual" className="pt-6">
                      <GroupBuilderDnd
                        courseId={metadata.teaching_workspace_id || metadata.course_id}
                        initialGroups={groups}
                        maxGroupSize={metadata.max_group_size || 4}
                        onSave={async (newGroups) => {
                          if (!id) return;
                          const manualInputs = newGroups.map(g => ({
                            name: g.name,
                            members: g.members.map(m => ({
                              student_id: m.id,
                              is_leader: !!m.is_leader,
                            })),
                          }));
                          try {
                            await groupWorkApi.saveManualGroups(id as string, manualInputs);
                            setGroups(newGroups);
                            toast.success("Manual groups saved successfully!");
                          } catch (err: any) {
                            toast.error("Failed to save manual groups.");
                          }
                        }}
                      />
                    </TabsContent>

                    <TabsContent value="csv" className="pt-6">
                      <GroupCsvImport
                        assessmentId={id as string}
                        onImport={async (importedGroups) => {
                          const roster = selectedWorkspaceDetail?.roster || [];
                          const mappedGroups: Group[] = importedGroups.map((ig: any, index: number) => ({
                            id: `group-csv-${index}-${Date.now()}`,
                            name: ig.name,
                            members: (ig.members || []).map((m: any) => {
                              const memberStudentId = m.id || m.student_id;
                              const studentInfo = roster.find(r => (r.id || r.student_id) === memberStudentId);
                              return {
                                id: memberStudentId,
                                name: studentInfo?.name || "Student",
                                email: studentInfo?.email || "",
                                is_leader: !!m.is_leader
                              };
                            })
                          }));
                          setGroups(mappedGroups);
                          toast.success("Groups successfully applied from CSV!");
                        }}
                      />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-none border">
                <CardHeader className="py-5 border-b">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <Users className="size-5 text-primary" /> Target Audience
                      </CardTitle>
                      <CardDescription>
                        Determine who takes this assessment.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <RadioGroup
                    value={metadata.audience_type || "all"}
                    disabled={isFieldDisabled("audience_type")}
                    onValueChange={(val: any) => {
                      setMetadata({ ...metadata, audience_type: val });
                      runAutosave(3, { audience_type: val });
                    }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                  >
                    <div className="flex items-start space-x-2 border p-4 rounded-xl">
                      <RadioGroupItem value="all" id="aud-all" />
                      <Label htmlFor="aud-all" className="cursor-pointer">
                        <span className="font-bold block">
                          All enrolled Students
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Assigned to everyone in workspace.
                        </span>
                      </Label>
                    </div>
                    <div className="flex items-start space-x-2 border p-4 rounded-xl">
                      <RadioGroupItem value="selected" id="aud-sel" />
                      <Label htmlFor="aud-sel" className="cursor-pointer">
                        <span className="font-bold block">
                          Selected Students Only
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Restricted to specific individuals.
                        </span>
                      </Label>
                    </div>
                  </RadioGroup>

                  {metadata.audience_type === "selected" && (
                    <div className="space-y-4 pt-4 border-t border-dashed">
                      <Input
                        placeholder="Search student..."
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        className="h-9 text-xs max-w-xs"
                      />
                      <div className="border rounded-lg overflow-hidden bg-background">
                        <ScrollArea className="h-72 w-full">
                          <div className="divide-y">
                            {filteredRoster.map((s) => {
                              const sid = s.id || s.student_id;
                              const checked =
                                metadata.target_student_ids?.includes(sid);
                              return (
                                <div
                                  key={sid}
                                  className="flex items-center justify-between p-3 hover:bg-muted/10"
                                >
                                  <div className="flex items-center gap-3">
                                    <Checkbox
                                      checked={checked}
                                      disabled={isFieldDisabled("audience_type")}
                                      onCheckedChange={(c) => {
                                        const ids = c
                                          ? [
                                              ...(metadata.target_student_ids ||
                                                []),
                                              sid,
                                            ]
                                          : (
                                              metadata.target_student_ids || []
                                            ).filter((i) => i !== sid);
                                        setMetadata({
                                          ...metadata,
                                          target_student_ids: ids,
                                        });
                                        runAutosave(3, {
                                          target_student_ids: ids,
                                        });
                                      }}
                                    />
                                    <div>
                                      <p className="text-xs font-semibold">
                                        {s.name}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground">
                                        {s.email}
                                      </p>
                                    </div>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    {s.student_id}
                                  </Badge>
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            <div className="flex justify-between mt-8">
              <Button variant="ghost" onClick={() => handleNextStep(2)}>
                Back
              </Button>
              <Button size="lg" onClick={() => handleNextStep(4)}>
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
              <h2 className="text-lg font-semibold tracking-tight">
                Assessment Blueprint
              </h2>
              <div className="flex gap-2">
                <Button
                  onClick={addSection}
                  disabled={isFieldDisabled("blueprint")}
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
                <Card key={sec.id} className="shadow-none border">
                  <CardHeader className="bg-muted/10 border-b flex flex-row items-center justify-between p-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className="font-bold text-[10px] bg-background"
                      >
                        Section {idx + 1}
                      </Badge>
                      <Input
                        value={sec.section}
                        disabled={isFieldDisabled("blueprint")}
                        onChange={(e) => {
                          updateSection(sec.id, { section: e.target.value });
                          triggerDebouncedAutosave(4);
                        }}
                        className="font-bold text-sm p-0 h-auto bg-transparent border-none focus-visible:ring-0 w-48 shadow-none"
                      />
                    </div>
                    {!isFieldDisabled("blueprint") && blueprint.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSection(sec.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Topic Focus</Label>
                        <Input
                          placeholder="SQL joins, transactions..."
                          value={sec.topics}
                          disabled={isFieldDisabled("blueprint")}
                          onChange={(e) => {
                            updateSection(sec.id, { topics: e.target.value });
                            triggerDebouncedAutosave(4);
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Allocated Marks</Label>
                          <Input
                            type="number"
                            value={sec.marks}
                            disabled={isFieldDisabled("blueprint")}
                            onChange={(e) => {
                              updateSection(sec.id, {
                                marks: parseInt(e.target.value) || 0,
                              });
                              triggerDebouncedAutosave(4);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Question Count</Label>
                          <Input
                            type="number"
                            value={sec.questions}
                            disabled={isFieldDisabled("blueprint")}
                            onChange={(e) => {
                              updateSection(sec.id, {
                                questions: parseInt(e.target.value) || 0,
                              });
                              triggerDebouncedAutosave(4);
                            }}
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
                          disabled={isFieldDisabled("blueprint")}
                          onValueChange={(v: any) => {
                            if (v.length > 0) {
                              updateSection(sec.id, { allowedTypes: v });
                              runAutosave(4);
                            } else {
                              updateSection(sec.id, {
                                allowedTypes: [...sec.allowedTypes],
                              });
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
                          ].map((t) => (
                            <ToggleGroupItem
                              key={t}
                              value={t}
                              className="h-8 px-2 text-[10px] font-bold uppercase border rounded-md"
                            >
                              {t}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                      </div>

                      {metadata.question_distribution_mode === "PER_GROUP" && (
                        <div className="flex items-center space-x-2 pt-2 pb-2 animate-in fade-in duration-200">
                          <Checkbox
                            id={`per-group-${sec.id}`}
                            checked={sec.per_group || false}
                            onCheckedChange={(checked) => {
                              updateSection(sec.id, { per_group: !!checked });
                              runAutosave(4);
                            }}
                          />
                          <Label
                            htmlFor={`per-group-${sec.id}`}
                            className="cursor-pointer font-bold text-xs flex items-center gap-1.5"
                          >
                            <Users className="size-3.5 text-primary" /> Per-Group Question Set (different questions per group)
                          </Label>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">
                            Section Difficulty
                          </Label>
                          <select
                            value={sec.difficulty}
                            disabled={isFieldDisabled("blueprint")}
                            onChange={(e) => {
                              updateSection(sec.id, {
                                difficulty: e.target.value as any,
                              });
                              runAutosave(4);
                            }}
                            className="w-full h-9 rounded-lg border text-xs px-2.5 bg-white outline-none"
                          >
                            <option value="Easy">Easy</option>
                            <option value="Medium">Medium</option>
                            <option value="Hard">Hard</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">
                            Bloom&apos;s Level
                          </Label>
                          <select
                            value={sec.bloomLevel || "understand"}
                            disabled={isFieldDisabled("blueprint")}
                            onChange={(e) => {
                              updateSection(sec.id, {
                                bloomLevel: e.target.value as any,
                              });
                              runAutosave(4);
                            }}
                            className="w-full h-9 rounded-lg border text-xs px-2.5 bg-white outline-none"
                          >
                            <option value="remember">Remember</option>
                            <option value="understand">Understand</option>
                            <option value="apply">Apply</option>
                            <option value="analyze">Analyze</option>
                            <option value="evaluate">Evaluate</option>
                            <option value="create">Create</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex justify-between mt-8">
              <Button variant="ghost" onClick={() => handleNextStep(3)}>
                Back
              </Button>
              <Button size="lg" onClick={() => handleNextStep(5)}>
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
                      {currentMarks} / {totalMarks}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {metadata.question_distribution_mode === "PER_GROUP" && (
              <div className="flex justify-center border-b pb-4">
                <Tabs value={step5ViewMode} onValueChange={(val: any) => setStep5ViewMode(val)} className="w-full max-w-md">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="standard" className="text-xs font-semibold">Standard Section View</TabsTrigger>
                    <TabsTrigger value="per_group" className="text-xs font-semibold">Per-Group Assignment Board</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}

            {metadata.question_distribution_mode === "PER_GROUP" && step5ViewMode === "per_group" ? (
              <GroupQuestionEditor
                groups={groups.map((g) => ({
                  id: g.id,
                  name: g.name,
                  memberCount: g.members.length,
                }))}
                totalMarks={totalMarks}
                getGroupMarks={(groupId) => {
                  return questions
                    .filter((q) => {
                      const sec = blueprint.find((s) => s.id === q.sectionId);
                      if (!sec) return false;
                      if (sec.per_group === false) return true;
                      return q.groupId === groupId;
                    })
                    .reduce((s, q) => s + q.marks, 0);
                }}
                renderQuestionEditor={(groupId) => (
                  <div className="space-y-8 mt-4">
                    {blueprint.map((sec, idx) => {
                      const isPerGroupSection = sec.per_group !== false;
                      const groupQuestions = questions.filter(
                        (q) => q.sectionId === sec.id && (!isPerGroupSection || q.groupId === groupId)
                      );

                      return (
                        <div key={sec.id} className="space-y-4 border p-4 rounded-xl bg-muted/5">
                          <div className="flex justify-between items-center bg-muted/10 p-3 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <Badge className="bg-muted text-foreground uppercase border font-semibold">
                                Section {idx + 1}
                              </Badge>
                              <div className="min-w-0">
                                <span className="text-sm font-semibold block truncate">
                                  {sec.section}
                                </span>
                                <span className="text-[10px] text-muted-foreground uppercase font-bold">
                                  {sec.marks} Marks Target
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-bold block">
                                {groupQuestions.reduce((s, q) => s + q.marks, 0)} / {sec.marks} Marks
                              </span>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {groupQuestions.map((q, qIdx) => (
                              <QuestionCard
                                key={q.id}
                                question={q}
                                index={qIdx}
                                allowedTypes={sec.allowedTypes}
                                disabled={isFieldDisabled("questions")}
                                workspaceId={metadata.teaching_workspace_id}
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

                            {!isFieldDisabled("questions") && (
                              <div className="flex gap-4">
                                <Button
                                  variant="outline"
                                  className="flex-1 h-14 border border-dashed flex flex-col gap-0.5 justify-center"
                                  onClick={() => {
                                    addQuestion(sec.id, isPerGroupSection ? groupId : undefined);
                                  }}
                                >
                                  <Plus className="size-4 text-primary" />
                                  <span className="font-bold uppercase text-[9px] tracking-wider text-muted-foreground">
                                    Add Manually
                                  </span>
                                </Button>
                                <QuestionBankSelector
                                  selectedIds={questions.map((q) => q.id)}
                                  courseId={metadata.course_id}
                                  onSelect={(q) => {
                                    handleBankSelect(q, sec.id, isPerGroupSection ? groupId : undefined);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              />
            ) : (
              <div className="space-y-8">
              {blueprint.map((sec, idx) => {
                const isPerGroupSection = metadata.question_distribution_mode === "PER_GROUP" && sec.per_group !== false;
                const currentGroupId = selectedGroupFilter[sec.id] || (groups[0]?.id || "");
                const sectionQuestions = questions.filter(
                  (q) => q.sectionId === sec.id && (!isPerGroupSection || q.groupId === currentGroupId)
                );

                return (
                  <div key={sec.id} className="space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-muted/20 p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Badge className="bg-muted text-foreground uppercase border font-semibold">
                          Section {idx + 1}
                        </Badge>
                        <div className="min-w-0">
                          <span className="text-sm font-semibold block truncate">
                            {sec.section}
                          </span>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold">
                            {sec.marks} Marks Target
                          </span>
                        </div>
                      </div>

                      {isPerGroupSection && groups.length > 0 && (
                        <div className="flex items-center gap-2 bg-background p-1.5 px-3 rounded-md border shadow-sm">
                          <Label htmlFor={`group-select-${sec.id}`} className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                            Target Group:
                          </Label>
                          <Select
                            value={currentGroupId}
                            onValueChange={(val) => {
                              setSelectedGroupFilter((prev) => ({ ...prev, [sec.id]: val }));
                            }}
                          >
                            <SelectTrigger id={`group-select-${sec.id}`} className="h-8 text-xs font-bold w-40">
                              <SelectValue placeholder="Select group..." />
                            </SelectTrigger>
                            <SelectContent>
                              {groups.map((g) => (
                                <SelectItem key={g.id} value={g.id}>
                                  {g.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {isPerGroupSection && groups.length === 0 ? (
                      <div className="p-8 border border-dashed rounded-lg text-center text-xs text-muted-foreground">
                        No groups found. Please form groups in Step 3 first to manage questions for this section.
                      </div>
                    ) : (
                      <>
                        <DndContext
                          sensors={questionSensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(event) => handleQuestionDragEnd(event, sec.id)}
                          modifiers={[restrictToVerticalAxis]}
                        >
                          <SortableContext
                            items={sectionQuestions.map((q) => q.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-4">
                              {sectionQuestions.map((q, qIdx) => (
                                <SortableQuestionItem key={q.id} id={q.id}>
                                  <QuestionCard
                                    question={q}
                                    index={qIdx}
                                    allowedTypes={sec.allowedTypes}
                                    disabled={isFieldDisabled("questions")}
                                    workspaceId={metadata.teaching_workspace_id}
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
                                </SortableQuestionItem>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>

                        {!isFieldDisabled("questions") && (
                          <div className="flex gap-4">
                            <Button
                              variant="outline"
                              className="flex-1 h-14 border border-dashed flex flex-col gap-0.5 justify-center"
                              onClick={() => {
                                addQuestion(sec.id, isPerGroupSection ? currentGroupId : undefined);
                              }}
                            >
                              <Plus className="size-4 text-primary" />
                              <span className="font-bold uppercase text-[9px] tracking-wider text-muted-foreground">
                                Add Manually
                              </span>
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1 h-14 border border-dashed flex flex-col gap-0.5 justify-center"
                              onClick={() => {
                                setAiGenerationConfig({
                                  ...aiGenerationConfig,
                                  topic: sec.topics || "",
                                  difficulty:
                                    sec.difficulty?.toLowerCase() || "medium",
                                  bloom_level: sec.bloomLevel || "understand",
                                });
                                setAiTargetSectionId(sec.id);
                                setAiDrawerOpen(true);
                              }}
                            >
                              <Sparkles className="size-4 text-primary animate-pulse" />
                              <span className="font-bold uppercase text-[9px] tracking-wider text-muted-foreground">
                                Generate with AI
                              </span>
                            </Button>
                            <QuestionBankSelector
                              selectedIds={questions.map((q) => q.id)}
                              courseId={metadata.course_id}
                              onSelect={(q) => {
                                handleBankSelect(q, sec.id, isPerGroupSection ? currentGroupId : undefined);
                              }}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            )}

            <div className="flex justify-between mt-8 pt-6 border-t">
              <Button variant="ghost" onClick={() => handleNextStep(4)}>
                Back
              </Button>
              <Button size="lg" onClick={() => handleNextStep(6)}>
                Review & Finalize <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        );
      case 6: {
        const isGroupMode = metadata.mode === "Groupwork";
        const assignedStudentIds = new Set(
          groups.flatMap((g) => g.members?.map((m: any) => m.id || m.student_id) ?? [])
        );
        const totalRoster = selectedWorkspaceDetail?.roster?.length ?? 0;
        const assignedCount = assignedStudentIds.size;
        const unassignedCount = Math.max(0, totalRoster - assignedCount);

        const isUpdateDisabled =
          isUpdating ||
          currentMarks !== totalMarks ||
          blueprint.length === 0 ||
          questions.length === 0 ||
          (isGroupMode && groups.length === 0) ||
          (isGroupMode && unassignedCount > 0);

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
                  <Clock className="size-3.5" /> {metadata.startTime} -{" "}
                  {metadata.endTime}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-3.5" /> {metadata.mode}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-6">
                {/* Group Configuration Summary — shown only for Group Work */}
                {isGroupMode && (
                  <Card className="shadow-none border">
                    <CardHeader className="py-4 border-b">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Users className="size-4 text-primary" /> Group Configuration Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 space-y-4">
                      {unassignedCount > 0 && (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2.5">
                          <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
                          <p className="text-xs text-destructive font-semibold">
                            {unassignedCount} student{unassignedCount !== 1 ? "s are" : " is"} not assigned to any group.
                            All students must be assigned before saving.
                          </p>
                        </div>
                      )}
                      {groups.length === 0 && (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2.5">
                          <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
                          <p className="text-xs text-destructive font-semibold">
                            No groups have been formed. Please complete Step 3 (Group Formation) before saving.
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                        <div className="space-y-1 border rounded-lg p-3 bg-muted/10">
                          <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Groups Formed</p>
                          <p className={`text-xl font-bold ${groups.length > 0 ? "text-emerald-600" : "text-destructive"}`}>
                            {groups.length}
                          </p>
                        </div>
                        <div className="space-y-1 border rounded-lg p-3 bg-muted/10">
                          <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Students Assigned</p>
                          <p className={`text-xl font-bold ${unassignedCount === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                            {assignedCount} <span className="text-sm text-muted-foreground font-normal">/ {totalRoster}</span>
                          </p>
                        </div>
                        <div className="space-y-1 border rounded-lg p-3 bg-muted/10">
                          <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Formation Mode</p>
                          <p className="text-sm font-semibold capitalize">
                            {metadata.group_formation_mode?.replace(/_/g, " ") || "Not set"}
                          </p>
                        </div>
                        <div className="space-y-1 border rounded-lg p-3 bg-muted/10">
                          <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Submission Mode</p>
                          <p className="text-sm font-semibold">
                            {metadata.submission_mode === "SINGLE_LEADER" ? "Single Leader" :
                              metadata.submission_mode === "ALL_MEMBERS" ? "All Members" :
                              metadata.submission_mode === "MAJORITY_VOTE" ? "Majority Vote" : "Single Leader"}
                          </p>
                        </div>
                        <div className="space-y-1 border rounded-lg p-3 bg-muted/10">
                          <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Peer Evaluation</p>
                          <p className={`text-sm font-semibold ${metadata.peer_evaluation_enabled ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {metadata.peer_evaluation_enabled ? "Enabled" : "Disabled"}
                          </p>
                          {metadata.peer_evaluation_enabled && metadata.peer_evaluation_deadline && (
                            <p className="text-[10px] text-muted-foreground">
                              Deadline: {format(new Date(metadata.peer_evaluation_deadline), "PPP")}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1 border rounded-lg p-3 bg-muted/10">
                          <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Indiv. Weighting</p>
                          <p className={`text-sm font-semibold ${metadata.individual_weighting_enabled ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {metadata.individual_weighting_enabled ? "Enabled" : "Disabled"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Validation and Distribution Report Card */}
                {(validationResult || distributionData) && (
                  <Card className="shadow-none border border-zinc-200">
                    <CardHeader className="py-4 border-b bg-zinc-50/50">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-primary" />{" "}
                        Blueprint Validation Report
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 space-y-5">
                      {validationResult && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              className={cn(
                                "font-semibold text-xs",
                                validationResult.is_valid
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-destructive/10 text-destructive border-destructive/20",
                              )}
                              variant="outline"
                            >
                              {validationResult.is_valid
                                ? "Validated Compliant"
                                : "Violations Detected"}
                            </Badge>
                            {!validationResult.can_finalize && (
                              <Badge
                                className="bg-amber-50 text-amber-700 border-amber-200 text-xs font-semibold"
                                variant="outline"
                              >
                                Finalization Blocked
                              </Badge>
                            )}
                          </div>

                          {/* Blocking Violations */}
                          {validationResult.violations &&
                            validationResult.violations.length > 0 && (
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-bold text-destructive uppercase tracking-wider block">
                                  Blocking Errors
                                </span>
                                <div className="space-y-1 border border-destructive/20 p-3 rounded-lg bg-destructive/5 text-xs text-destructive">
                                  {validationResult.violations.map(
                                    (violation: any, idx: number) => (
                                      <div
                                        key={idx}
                                        className="flex items-start gap-1.5 leading-normal"
                                      >
                                        <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                                        <span>{violation.message}</span>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            )}

                          {/* Non-blocking warnings */}
                          {validationResult.warnings &&
                            validationResult.warnings.length > 0 && (
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block font-semibold">
                                  Non-Blocking Warnings
                                </span>
                                <div className="space-y-1 border border-amber-200 p-3 rounded-lg bg-amber-50/50 text-xs text-amber-800">
                                  {validationResult.warnings.map(
                                    (warning: any, idx: number) => (
                                      <div
                                        key={idx}
                                        className="flex items-start gap-1.5 leading-normal"
                                      >
                                        <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                                        <span>{warning.message}</span>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            )}
                        </div>
                      )}

                      {/* Distribution Summary */}
                      {distributionData && (
                        <div className="pt-4 border-t space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                                Composition by Difficulty
                              </span>
                              <div className="space-y-1 text-xs">
                                {Object.entries(
                                  distributionData.difficulty_distribution ||
                                    {},
                                ).map(([diff, count]) => (
                                  <div
                                    key={diff}
                                    className="flex justify-between items-center py-0.5 border-b last:border-0 border-zinc-100"
                                  >
                                    <span className="capitalize text-zinc-600">
                                      {diff}
                                    </span>
                                    <span className="font-semibold text-zinc-800">
                                      {count as number}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                                Composition by Question Type
                              </span>
                              <div className="space-y-1 text-xs">
                                {Object.entries(
                                  distributionData.type_distribution || {},
                                ).map(([qType, count]) => (
                                  <div
                                    key={qType}
                                    className="flex justify-between items-center py-0.5 border-b last:border-0 border-zinc-100"
                                  >
                                    <span className="capitalize text-zinc-600">
                                      {qType}
                                    </span>
                                    <span className="font-semibold text-zinc-800">
                                      {count as number}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Supervisor section simplified from new/page.tsx */}
                <Card className="shadow-none border">
                  <CardHeader className="py-4 border-b">
                    <CardTitle className="text-sm font-semibold">
                      Publishing & Monitoring
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">
                        Assigned Supervisors
                      </Label>
                      <div className="space-y-2 border rounded-lg p-3 bg-muted/10">
                        <div className="flex items-center justify-between pb-2 border-b border-border/40">
                          <div>
                            <p className="text-xs font-bold">
                              {currentUser?.profile?.first_name}{" "}
                              {currentUser?.profile?.last_name}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Chief Supervisor (Owner)
                            </p>
                          </div>
                          <Badge variant="secondary" className="h-5 text-[9px]">
                            CHIEF
                          </Badge>
                        </div>
                        {supervisorList
                          .filter((s) => s.id !== currentUser?.id)
                          .map((sup) => (
                            <div
                              key={sup.id}
                              className="flex items-center justify-between py-2"
                            >
                              <div className="text-xs font-semibold">
                                {sup.name}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setSupervisorList(
                                    supervisorList.filter(
                                      (s) => s.id !== sup.id,
                                    ),
                                  )
                                }
                                className="h-6 w-6 text-destructive"
                              >
                                <X className="size-3.5" />
                              </Button>
                            </div>
                          ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {blueprint.map((sec) => (
                  <div key={sec.id} className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-1">
                      <h3 className="font-bold text-sm uppercase text-muted-foreground">
                        {sec.section}
                      </h3>
                      <Badge variant="outline">{sec.marks} Marks</Badge>
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
                <Card className="shadow-none border sticky top-20">
                  <CardHeader className="py-4 border-b">
                    <CardTitle className="text-xs uppercase font-bold tracking-wider">
                      Checks Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-6">
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <Badge className="font-bold">{assessmentStatus}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Questions</span>
                        <span
                          className={cn(
                            "font-bold",
                            questions.length === totalQuestions
                              ? "text-emerald-600"
                              : "text-destructive",
                          )}
                        >
                          {questions.length} / {totalQuestions}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Marks</span>
                        <span
                          className={cn(
                            "font-bold",
                            currentMarks === totalMarks
                              ? "text-emerald-600"
                              : "text-destructive",
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
                        {isGroupMode && (
                          <>
                            <div className="flex items-center gap-2">
                              {groups.length > 0 ? (
                                <Check className="size-3.5 text-emerald-500" />
                              ) : (
                                <X className="size-3.5 text-destructive" />
                              )}
                              <span>Groups formed ({groups.length})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {unassignedCount === 0 ? (
                                <Check className="size-3.5 text-emerald-500" />
                              ) : (
                                <X className="size-3.5 text-destructive" />
                              )}
                              <span>
                                All students assigned ({assignedCount}/{totalRoster})
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="flex items-start gap-2.5">
                        <Checkbox
                          id="lecturerConfirm"
                          checked={lecturerConfirmed}
                          onCheckedChange={(c) => setLecturerConfirmed(!!c)}
                        />
                        <label
                          htmlFor="lecturerConfirm"
                          className="text-[10px] text-muted-foreground leading-tight cursor-pointer"
                        >
                          I confirm that all changes are accurate and ready for
                          deployment.
                        </label>
                      </div>
                      <Button
                        onClick={handleUpdate}
                        disabled={isUpdateDisabled || !lecturerConfirmed}
                        className="w-full h-10 font-semibold"
                      >
                        {isUpdating ? "Updating..." : "Update Assessment"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  if (isLoading)
    return (
      <div className="w-full space-y-4 p-2 md:p-4 animate-pulse">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="space-y-1">
            <Skeleton variant="title" className="h-6 w-32" />
            <Skeleton variant="title" className="h-4 w-64" />
          </div>
        </div>
        <div className="flex items-center justify-center h-[300px]">
          <LoaderCircleIcon className="size-6 animate-spin text-primary" />
        </div>
      </div>
    );

  return (
    <div className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-200">
      <div className="flex items-center justify-between border-b pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Edit Assessment
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
            Refine and update your assessment configuration.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {autosaveStatus === "saving" && (
            <span className="text-[10px] text-muted-foreground animate-pulse flex items-center gap-1.5 font-bold uppercase tracking-wider">
              <LoaderCircleIcon className="size-3 animate-spin" /> Saving...
            </span>
          )}
          {autosaveStatus === "saved" && (
            <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Check className="size-3" /> Saved
            </span>
          )}
          <Badge variant="outline" className="h-8 px-2.5 font-bold text-[10px] uppercase rounded-lg bg-zinc-100 border text-zinc-500">
            Step {activeStep} / 6
          </Badge>
        </div>
      </div>

      <Stepper
        value={activeStep}
        onValueChange={handleNextStep}
        className="space-y-6"
      >
        <StepperNav className="flex w-full gap-2 border-b">
          {STEPS_DATA.map((s, idx) => (
            <StepperItem key={idx} step={idx + 1} className="flex-1">
              <StepperTrigger className="flex w-full flex-row items-center justify-center gap-2 p-3 rounded-none border-b-2 border-transparent transition-all data-[state=active]:border-primary">
                <StepperIndicator className="size-5 text-[10px] rounded-full bg-muted data-[state=active]:bg-primary data-[state=active]:text-white">
                  {idx + 1}
                </StepperIndicator>
                <StepperTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground data-[state=active]:text-foreground">
                  {idx + 1 === 3 && metadata.mode === "Groupwork" ? "Group Formation" : s.title}
                </StepperTitle>
              </StepperTrigger>
            </StepperItem>
          ))}
        </StepperNav>

        <StepperPanel>
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <StepperContent key={s} value={s}>
              {renderStepContent(s)}
            </StepperContent>
          ))}
        </StepperPanel>
      </Stepper>

      {/* AI GENERATION CONFIG DIALOG */}
      <Dialog open={aiDrawerOpen} onOpenChange={setAiDrawerOpen}>
        <DialogContent className="sm:max-w-[650px] md:max-w-[700px] w-full p-6 flex flex-col max-h-[90vh]">
          <DialogHeader className="border-b pb-4 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Sparkles className="size-5 text-primary animate-pulse" /> AI
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
                          <div className="text-[10px] text-zinc-400 truncate max-w-[200px]">
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

                <div className="space-y-1.5 pt-2">
                  <Label className="text-xs font-semibold">
                    Additional Context / Custom Prompt
                  </Label>
                  <Textarea
                    placeholder="Include details about what concepts to cover, expected outcomes, or specific coding/math expressions to include..."
                    className="min-h-[100px]"
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
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg space-y-2 text-xs text-zinc-600">
                  <div>
                    <strong>Course Workspace:</strong>{" "}
                    {selectedWorkspaceDetail?.title ||
                      "No course workspace selected"}
                  </div>
                  <div>
                    <strong>Target Section:</strong>{" "}
                    {(() => {
                      const idx = blueprint.findIndex(
                        (s) => s.id === aiTargetSectionId,
                      );
                      const sec = blueprint[idx];
                      return sec
                        ? `Section ${idx + 1}: ${sec.section}`
                        : "Unknown Section";
                    })()}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-zinc-700">
                    Topic / Focus Area{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="e.g., Database Normalization, Ethics in AI"
                    value={aiGenerationConfig.topic}
                    onChange={(e) =>
                      setAiGenerationConfig({
                        ...aiGenerationConfig,
                        topic: e.target.value,
                      })
                    }
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Be specific — the AI uses this to retrieve relevant context.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-zinc-700">
                      Question Format
                    </Label>
                    <Select
                      value={aiGenerationConfig.question_type}
                      onValueChange={(v) =>
                        setAiGenerationConfig({
                          ...aiGenerationConfig,
                          question_type: v,
                        })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const allTypes = [
                            { value: "mcq", label: "Multiple Choice (MCQ)" },
                            { value: "truefalse", label: "True / False" },
                            { value: "shortanswer", label: "Short Answer" },
                            { value: "essay", label: "Essay" },
                            { value: "fillblank", label: "Fill in the Blanks" },
                            { value: "matching", label: "Matching" },
                            { value: "casestudy", label: "Case Study" },
                            {
                              value: "computational",
                              label: "Computational / Problem",
                            },
                            {
                              value: "ordering",
                              label: "Ordering / Sequencing",
                            },
                          ];
                          const activeSec = blueprint.find(
                            (b) => b.id === aiTargetSectionId,
                          );
                          const visibleTypes =
                            activeSec && activeSec.allowedTypes?.length > 0
                              ? allTypes.filter((t) =>
                                  (activeSec.allowedTypes as string[]).includes(
                                    t.value,
                                  ),
                                )
                              : allTypes;
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
                    <Label className="text-xs font-semibold text-zinc-700">
                      Bloom&apos;s Level
                    </Label>
                    <Select
                      value={aiGenerationConfig.bloom_level}
                      onValueChange={(v) =>
                        setAiGenerationConfig({
                          ...aiGenerationConfig,
                          bloom_level: v,
                        })
                      }
                    >
                      <SelectTrigger className="h-9">
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-zinc-700">
                      Difficulty
                    </Label>
                    <Select
                      value={aiGenerationConfig.difficulty}
                      onValueChange={(v) =>
                        setAiGenerationConfig({
                          ...aiGenerationConfig,
                          difficulty: v,
                        })
                      }
                    >
                      <SelectTrigger className="h-9">
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
                    <Label className="text-xs font-semibold text-zinc-700">
                      Number of Questions (1–15)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={15}
                      value={aiGenerationConfig.count}
                      onChange={(e) =>
                        setAiGenerationConfig({
                          ...aiGenerationConfig,
                          count: Math.max(
                            1,
                            Math.min(15, parseInt(e.target.value) || 1),
                          ),
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5 pt-2">
                  <Label className="text-xs font-semibold">
                    Additional Context / Custom Prompt
                  </Label>
                  <Textarea
                    placeholder="Include details about what concepts to cover, expected outcomes, or specific coding/math expressions to include..."
                    className="min-h-[100px]"
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
            )}
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
                  <Sparkles className="mr-2 h-4 w-4" /> Start AI Generation
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI REVIEW CANDIDATES DIALOG */}
      <Dialog open={aiReviewDrawerOpen} onOpenChange={setAiReviewDrawerOpen}>
        <DialogContent className="sm:max-w-[850px] md:max-w-[900px] w-full p-3 flex flex-col max-h-[90vh]">
          <DialogHeader className="border-b pb-4 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <CheckCircle2 className="size-5 text-emerald-500" /> Review AI
              Question Candidates
            </DialogTitle>
            <DialogDescription>
              Accept, edit, or reject the AI generated candidate questions
              below.
            </DialogDescription>
          </DialogHeader>

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
                    <Sparkles className="mr-2 h-3.5 w-3.5 text-primary" />{" "}
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
                      <div className="flex items-center gap-2">
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
                              (cand.options || cand._options || []).map(
                                (o: any) => ({
                                  text: o.text,
                                  is_correct: o.is_correct,
                                  explanation:
                                    o.explanation || o.option_text_right || "",
                                  order_index: o.order_index,
                                }),
                              ),
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
                            className="min-h-[80px]"
                          />
                        </div>

                        {editingOptions.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold text-zinc-700">
                              Options
                            </Label>
                            <div className="space-y-2">
                              {editingOptions.map((opt, oIdx) => (
                                <div
                                  key={oIdx}
                                  className="flex items-center gap-2"
                                >
                                  <Checkbox
                                    checked={opt.is_correct}
                                    onCheckedChange={(checked) => {
                                      setEditingOptions((prev) =>
                                        prev.map((o, idx) =>
                                          idx === oIdx
                                            ? { ...o, is_correct: !!checked }
                                            : o,
                                        ),
                                      );
                                    }}
                                  />
                                  {mapBackendToFrontendType(
                                    cand.question_type,
                                  ) === "matching" ? (
                                    <div className="flex-1 flex gap-2">
                                      <Input
                                        value={opt.text}
                                        onChange={(e) => {
                                          setEditingOptions((prev) =>
                                            prev.map((o, idx) =>
                                              idx === oIdx
                                                ? { ...o, text: e.target.value }
                                                : o,
                                            ),
                                          );
                                        }}
                                        placeholder="Premise (Left)"
                                        className="h-8 text-xs flex-1"
                                      />
                                      <Input
                                        value={opt.explanation || ""}
                                        onChange={(e) => {
                                          setEditingOptions((prev) =>
                                            prev.map((o, idx) =>
                                              idx === oIdx
                                                ? {
                                                    ...o,
                                                    explanation: e.target.value,
                                                  }
                                                : o,
                                            ),
                                          );
                                        }}
                                        placeholder="Response (Right)"
                                        className="h-8 text-xs flex-1"
                                      />
                                    </div>
                                  ) : mapBackendToFrontendType(
                                      cand.question_type,
                                    ) === "casestudy" ? (
                                    <div className="flex-1 flex gap-2">
                                      <Input
                                        value={opt.text}
                                        onChange={(e) => {
                                          setEditingOptions((prev) =>
                                            prev.map((o, idx) =>
                                              idx === oIdx
                                                ? { ...o, text: e.target.value }
                                                : o,
                                            ),
                                          );
                                        }}
                                        placeholder="Sub-question text..."
                                        className="h-8 text-xs flex-1"
                                      />
                                      <Input
                                        type="number"
                                        value={opt.order_index || 5}
                                        onChange={(e) => {
                                          setEditingOptions((prev) =>
                                            prev.map((o, idx) =>
                                              idx === oIdx
                                                ? {
                                                    ...o,
                                                    order_index:
                                                      parseInt(
                                                        e.target.value,
                                                      ) || 0,
                                                  }
                                                : o,
                                            ),
                                          );
                                        }}
                                        placeholder="Marks"
                                        className="h-8 text-xs w-16 text-center"
                                      />
                                      <Input
                                        value={opt.explanation || ""}
                                        onChange={(e) => {
                                          setEditingOptions((prev) =>
                                            prev.map((o, idx) =>
                                              idx === oIdx
                                                ? {
                                                    ...o,
                                                    explanation: e.target.value,
                                                  }
                                                : o,
                                            ),
                                          );
                                        }}
                                        placeholder="Answer Guidance..."
                                        className="h-8 text-xs flex-1"
                                      />
                                    </div>
                                  ) : (
                                    <Input
                                      value={opt.text}
                                      onChange={(e) => {
                                        setEditingOptions((prev) =>
                                          prev.map((o, idx) =>
                                            idx === oIdx
                                              ? { ...o, text: e.target.value }
                                              : o,
                                          ),
                                        );
                                      }}
                                      placeholder={`Option ${oIdx + 1}`}
                                      className="h-8 text-xs flex-1"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {aiTargetSectionId === "all" && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-zinc-700">
                              Target Section Override
                            </Label>
                            <Select
                              value={
                                (cand as any)._sectionId ||
                                findMatchingSectionForType(cand.question_type)
                              }
                              onValueChange={(secId) => {
                                setAiCandidates((prev) =>
                                  prev.map((c) =>
                                    c.id === cand.id
                                      ? { ...c, _sectionId: secId }
                                      : c,
                                  ),
                                );
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select target section" />
                              </SelectTrigger>
                              <SelectContent>
                                {blueprint.map((sec) => (
                                  <SelectItem key={sec.id} value={sec.id}>
                                    {sec.section} (
                                    {sec.allowedTypes?.join(", ")})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

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
                          return (
                            opts.length > 0 && (
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
                                        const textVal =
                                          opt.text || opt.option_text || "";
                                        const rightVal =
                                          opt.explanation ||
                                          opt.option_text_right ||
                                          "";
                                        const marksVal =
                                          opt.match_key !== undefined &&
                                          opt.match_key !== null
                                            ? opt.match_key
                                            : String(opt.order_index || 5);
                                        const normType = (
                                          cand.question_type || ""
                                        )
                                          .toLowerCase()
                                          .replaceAll("_", "");

                                        if (normType === "matching") {
                                          return `${textVal} ➔ ${rightVal}`;
                                        }
                                        if (normType === "casestudy") {
                                          const guidance = rightVal
                                            ? ` — Guidance: ${rightVal}`
                                            : "";
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
                            )
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
