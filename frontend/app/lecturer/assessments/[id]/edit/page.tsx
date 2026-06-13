// app/lecturer/assessments/[id]/edit/page.tsx
"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Trash2,
  Save,
  Clock,
  Shield,
  ChevronRight,
  ChevronLeft,
  Database,
  Loader2 as LoaderCircleIcon,
  Calendar as CalendarIcon,
  Upload,
  X,
  Check,
  AlertTriangle,
  ChevronDown,
  FileText,
  Layout,
  BrainCircuit,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";

import {
  Stepper,
  StepperContent,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperTitle,
  StepperTrigger,
} from "@/components/ui/stepper";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { ScrollArea } from "@/components/ui/scroll-area";

type AssessmentMode = "Practice" | "Formative" | "Homework" | "CAT" | "Summative" | "Groupwork";
type Difficulty = "Easy" | "Medium" | "Hard";
type QuestionType = "mcq" | "truefalse" | "shortanswer" | "essay" | "matching" | "fillblank" | "computational" | "ordering" | "casestudy";

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
  computationalType?: string;
  caseStudyContext?: string;
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

// --- COMPONENTS ---

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
    <Card className="shadow-none border hover:border-primary/20 transition-colors rounded-lg overflow-hidden">
      <CardContent className="p-4 space-y-4">
        {/* Header Row */}
        <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-3">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="size-6 flex items-center justify-center rounded text-[10px] font-bold bg-muted/5 border-muted-foreground/20">{index + 1}</Badge>
            <Select
              value={question.type}
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
                onUpdate({ type: v, options: newOptions });
              }}
            >
              <SelectTrigger className="w-[140px] h-8 rounded text-[10px] font-bold uppercase tracking-widest bg-muted/5"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded">
                {allowedTypes.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize text-[10px] font-bold tracking-tight">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Marks</Label>
              <Input
                type="number"
                className="w-14 h-8 text-center font-bold rounded text-xs bg-muted/5 focus-visible:ring-0"
                value={question.marks ?? 0}
                onChange={(e) => onUpdate({ marks: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="flex items-center gap-1 border-l pl-3 border-border/40">
              <Button variant="ghost" size="icon" onClick={onSaveToBank} className="text-primary hover:bg-primary/5 h-8 w-8 rounded" title="Save to Bank">
                <Database className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onDelete} className="text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 h-8 w-8 rounded" title="Delete Question">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Question Text & Media */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-2">
            {question.type === "casestudy" && (
                <div className="space-y-1.5 mb-3">
                    <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Case Study Context</Label>
                    <Textarea
                        placeholder="Provide the case study scenario or context here..."
                        value={question.caseStudyContext || ""}
                        onChange={(e) => onUpdate({ caseStudyContext: e.target.value })}
                        className="min-h-[80px] text-xs font-medium p-3 rounded bg-amber-50/10 border-amber-100 focus-visible:ring-primary/10"
                    />
                </div>
            )}
            <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Question Domain Content</Label>
            <Textarea
              placeholder="Write your question text here..."
              value={question.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              className="min-h-[80px] text-xs font-medium p-3 rounded bg-muted/[0.02] border-border/40 focus-visible:ring-primary/10"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Contextual Media</Label>
            {question.imageUrl ? (
              <div className="relative inline-block border rounded p-1 bg-muted/30 group overflow-hidden w-full h-[80px]">
                <img src={question.imageUrl} alt="Diagram" className="w-full h-full object-contain rounded-sm" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                  <Button variant="destructive" size="sm" onClick={() => onUpdate({ imageUrl: undefined })} className="h-6 rounded text-[9px] font-bold uppercase tracking-widest">
                    <Trash2 className="size-3 mr-1.5" /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-1.5 h-[80px] w-full rounded border border-dashed border-border/60 cursor-pointer hover:bg-muted/5 transition-all group">
                <Upload className="size-4 text-muted-foreground/40 group-hover:text-primary/60" />
                <span className="text-[9px] font-bold text-muted-foreground/60 group-hover:text-primary/70 uppercase">Upload Diagram</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            )}
          </div>
        </div>

        {/* Answer Options Editors */}
        {(question.type === "mcq" || question.type === "truefalse") && (
          <div className="space-y-3 pt-3 border-t border-border/40">
            <div className="flex items-center justify-between">
                <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Response Candidates</Label>
                {question.type === "mcq" && (
                    <Button variant="outline" size="sm" onClick={onAddOption} className="h-6 rounded text-[9px] font-bold uppercase tracking-widest border-border/60 text-muted-foreground">
                        <Plus className="size-3 mr-1" /> Add
                    </Button>
                )}
            </div>
            <RadioGroup
              value={question.options.find((o) => o.is_correct)?.order_index.toString()}
              onValueChange={(v) => {
                const idx = parseInt(v);
                onUpdate({
                  options: question.options.map((opt, i) => ({ ...opt, is_correct: i === idx })),
                });
              }}
              className="grid grid-cols-1 md:grid-cols-2 gap-2"
            >
              {question.options.map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-2 p-2 rounded border border-border/40 bg-muted/[0.02] hover:border-primary/20 transition-all focus-within:bg-background">
                  <RadioGroupItem value={oIdx.toString()} className="size-3.5 border-muted-foreground/30 text-emerald-500" />
                  <Input
                    value={opt.option_text || ""}
                    onChange={(e) => onUpdateOption(oIdx, { option_text: e.target.value })}
                    className="h-7 border-none bg-transparent shadow-none focus-visible:ring-0 font-medium text-xs px-1"
                    placeholder={`Candidate Trace ${oIdx + 1}`}
                    disabled={question.type === "truefalse"}
                  />
                  {question.type === "mcq" && question.options.length > 2 && (
                    <Button variant="ghost" size="icon" onClick={() => onRemoveOption(oIdx)} className="text-muted-foreground/30 hover:text-destructive h-6 w-6 rounded"><X className="size-3" /></Button>
                  )}
                </div>
              ))}
            </RadioGroup>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewQuestionCard({ question, index }: { question: Question; index: number }) {
  return (
    <div className="flex gap-4 p-3 border border-border/40 rounded-lg hover:bg-muted/5 transition-all bg-card/50">
      <span className="text-muted-foreground/40 font-bold text-sm tabular-nums shrink-0 mt-0.5">{(index + 1).toString().padStart(2, "0")}</span>
      <div className="space-y-2 flex-1 min-w-0">
        <p className="font-semibold text-xs leading-snug text-foreground/80 line-clamp-2">{question.text || <em className="text-muted-foreground font-normal italic opacity-40">No question context provided</em>}</p>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-4.5 text-[8px] font-bold uppercase tracking-widest px-1.5 rounded-sm bg-muted/20 border-border/60">{question.type}</Badge>
          <Badge variant="outline" className="h-4.5 text-[8px] font-bold px-1.5 rounded-sm border-border/40 text-muted-foreground/60">{question.marks} PTS</Badge>
          {question.caseStudyContext && <Badge variant="outline" className="h-4.5 text-[8px] font-bold uppercase tracking-widest px-1.5 rounded-sm border-amber-200/50 bg-amber-50 text-amber-700">Case Study</Badge>}
        </div>
      </div>
    </div>
  );
}

// --- MAIN EDIT PAGE ---

const STEPS_DATA = [
  { title: "Identity", icon: FileText },
  { title: "Blueprint", icon: Layout },
  { title: "Structure", icon: BrainCircuit },
  { title: "Final Review", icon: Eye },
  { title: "Go Live", icon: CheckCircle2 },
];

export default function EditAssessmentPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [activeStep, setActiveStep] = useState(1);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [courses, setCourses] = useState<AdminCourseListItem[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionResponse[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriodResponse[]>([]);
  const [availableLecturers, setAvailableLecturers] = useState<UserResponse[]>([]);
  
  const [availableDepartments, setAvailableDepartments] = useState<DepartmentResponse[]>([]);
  const [availableOptions, setAvailableOptions] = useState<OptionResponse[]>([]);
  const [availableClasses, setAvailableClasses] = useState<ClassGroupResponse[]>([]);

  // Core State
  const [metadata, setMetadata] = useState<any>({
    title: "",
    description: "",
    mode: "CAT",
    institution_id: "",
    course_id: "",
    teaching_workspace_id: "",
    department_ids: [],
    option_ids: [],
    class_group_ids: [],
    academic_year: "",
    academic_period_id: "",
    date: undefined,
    startTime: "09:00",
    endTime: "11:00",
    durationMinutes: 120,
    passing_marks: 70,
    selectedInstructions: [],
    customInstructions: "",
  });

  const [blueprint, setBlueprint] = useState<BlueprintSection[]>([]);
  const [rules, setRules] = useState<any>({
    openBook: false,
    supervised: true,
    aiAllowed: false,
    browserRestricted: true,
    shuffleQuestions: true,
    shuffleOptions: true,
    resultRelease: "manual",
    attempts: 1,
    latePenaltyPercent: 0,
    gracePeriodMinutes: 0,
  });
  const [questions, setQuestions] = useState<Question[]>([]);

  const totalMarks = useMemo(() => blueprint.reduce((sum, s) => sum + s.marks, 0), [blueprint]);
  const currentMarks = useMemo(() => questions.reduce((sum, q) => sum + q.marks, 0), [questions]);

  const windowDuration = useMemo(() => {
    if (!metadata.startTime || !metadata.endTime) return 0;
    try {
      const [sh, sm] = metadata.startTime.split(":").map(Number);
      const [eh, em] = metadata.endTime.split(":").map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60; // Handle over midnight
      return diff;
    } catch (e) {
      return 0;
    }
  }, [metadata.startTime, metadata.endTime]);

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

  const handleInstitutionChange = async (val: string) => {
    setMetadata((prev: any) => ({ ...prev, institution_id: val, department_ids: [], option_ids: [], class_group_ids: [] }));
    setAvailableDepartments([]);
    try {
      const depts = await lecturerApi.getMyDepartments(val);
      setAvailableDepartments(depts);
    } catch (e) {}
  };

  const toggleDept = async (deptId: string) => {
    const newDepts = metadata.department_ids.includes(deptId)
      ? metadata.department_ids.filter((i: string) => i !== deptId)
      : [...metadata.department_ids, deptId];
    setMetadata((p: any) => ({ ...p, department_ids: newDepts, option_ids: [], class_group_ids: [] }));
    if (newDepts.length > 0) {
      const all = await Promise.all(newDepts.map((dId: string) => lecturerApi.getMyOptions(dId)));
      setAvailableOptions(all.flat());
    }
  };

  const toggleOption = async (optId: string) => {
    const newOpts = metadata.option_ids.includes(optId)
      ? metadata.option_ids.filter((i: string) => i !== optId)
      : [...metadata.option_ids, optId];
    setMetadata((p: any) => ({ ...p, option_ids: newOpts, class_group_ids: [] }));
    if (newOpts.length > 0) {
      const all = await Promise.all(newOpts.map((oId: string) => lecturerApi.getMyClasses(oId)));
      setAvailableClasses(all.flat());
    }
  };

  useEffect(() => {
    async function init() {
      try {
        const [workspaceRes, instRes, periodRes, lectRes, assessmentData] = await Promise.all([
          lecturerApi.getWorkspaces(),
          lecturerApi.getMyInstitutions(),
          lecturerApi.getPeriods(),
          lecturerApi.getLecturers(),
          assessmentApi.getAssessmentById(id) as any,
        ]);
        
        setCourses(workspaceRes as any);
        setInstitutions(instRes);
        setPeriods(periodRes);
        setAvailableLecturers(lectRes);

        setMetadata({
          title: assessmentData.title || "",
          description: assessmentData.description || "",
          mode: assessmentData.assessment_type === "GROUP_WORK" ? "Groupwork" : assessmentData.assessment_type,
          institution_id: assessmentData.institution_id || "",
          course_id: assessmentData.course_id || "",
          teaching_workspace_id: assessmentData.teaching_workspace_id || "",
          department_ids: assessmentData.target_sections?.map((ts: any) => ts.department_id).filter(Boolean) || [],
          option_ids: assessmentData.target_sections?.map((ts: any) => ts.option_id).filter(Boolean) || [],
          class_group_ids: assessmentData.target_sections?.map((ts: any) => ts.class_group_id).filter(Boolean) || [],
          academic_year: assessmentData.academic_year || "",
          academic_period_id: assessmentData.academic_period_id || "",
          date: assessmentData.window_start ? new Date(assessmentData.window_start) : undefined,
          startTime: assessmentData.window_start ? format(new Date(assessmentData.window_start), "HH:mm") : "09:00",
          endTime: assessmentData.window_end ? format(new Date(assessmentData.window_end), "HH:mm") : "11:00",
          durationMinutes: assessmentData.duration_minutes || 120,
          passing_marks: assessmentData.passing_marks || 70,
          selectedInstructions: assessmentData.instructions?.split("\n").filter((i: string) => PREDEFINED_INSTRUCTIONS.includes(i)) || [],
          customInstructions: assessmentData.instructions?.split("\n").filter((i: string) => !PREDEFINED_INSTRUCTIONS.includes(i)).join("\n") || "",
        });

        if (assessmentData.sections?.length > 0) {
          setBlueprint(assessmentData.sections.map((s: any) => ({
            id: s.id,
            section: s.title,
            topics: s.description || "",
            marks: s.allocated_marks || 0,
            questions: s.question_count_target || 0,
            difficulty: "Medium",
            allowedTypes: s.allowed_question_types?.types || ["mcq"],
          })));
        }

        setRules({
          openBook: assessmentData.is_open_book || false,
          supervised: assessmentData.is_supervised || false,
          aiAllowed: assessmentData.ai_assistance_allowed || false,
          browserRestricted: assessmentData.fullscreen_required || false,
          shuffleQuestions: assessmentData.randomize_questions || false,
          shuffleOptions: assessmentData.randomize_options || false,
          resultRelease: assessmentData.result_release_mode || "manual",
          attempts: assessmentData.max_attempts || 1,
          latePenaltyPercent: assessmentData.late_penalty_percent || 0,
          gracePeriodMinutes: assessmentData.grace_period_minutes || 0,
        });

        if (assessmentData.assessment_questions?.length > 0) {
          setQuestions(assessmentData.assessment_questions.map((aq: any) => ({
            id: aq.question.id,
            sectionId: aq.assessment_section_id,
            groupId: aq.group_id,
            text: aq.question.content,
            imageUrl: aq.question.image_url,
            caseStudyContext: aq.question.case_study_context,
            type: aq.question.question_type.toLowerCase().replace("_", "") as QuestionType,
            marks: aq.marks_override || aq.question.marks,
            options: aq.question.options?.map((o: any) => ({
              id: o.id,
              option_text: o.content,
              option_text_right: o.match_value,
              is_correct: o.is_correct,
              order_index: o.order_index,
            })) || [],
            aiGenerated: aq.added_via === "ai_generated",
          })));
        }

        if (assessmentData.institution_id) {
          const depts = await lecturerApi.getMyDepartments(assessmentData.institution_id);
          setAvailableDepartments(depts);
          const deptIds = assessmentData.target_sections?.map((ts: any) => ts.department_id).filter(Boolean) || [];
          if (deptIds.length > 0) {
            const allOpts = await Promise.all(deptIds.map((dId: string) => lecturerApi.getMyOptions(dId)));
            setAvailableOptions(allOpts.flat());
            const optIds = assessmentData.target_sections?.map((ts: any) => ts.option_id).filter(Boolean) || [];
            if (optIds.length > 0) {
              const allClasses = await Promise.all(optIds.map((oId: string) => lecturerApi.getMyClasses(oId)));
              setAvailableClasses(allClasses.flat());
            }
          }
        }
      } catch (err) {
        toast.error("Failed to load assessment context");
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [id]);

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
  }, [activeStep, editingCandidateId]);

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

  const runStepGuards = (targetStep: number): boolean => {
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
        toast.error("A valid Teaching Workspace and Course are required for assessment creation.");
        return false;
      }
      if (!metadata.date) {
        toast.error("Scheduled Date is required");
        return false;
      }
      if (!metadata.startTime) {
        toast.error("Access Start is required");
        return false;
      }
      if (!metadata.endTime) {
        toast.error("Access End is required");
        return false;
      }
      if (!metadata.durationMinutes || parseInt(metadata.durationMinutes as any) <= 0) {
        toast.error("Valid duration is required");
        return false;
      }
      if (parseInt(metadata.durationMinutes as any) > windowDuration) {
        toast.error(`Duration (${metadata.durationMinutes}m) cannot exceed the time window (${windowDuration}m) between start and end time.`);
        return false;
      }
      if (!metadata.passing_marks || parseInt(metadata.passing_marks as any) <= 0) {
        toast.error("Valid passing marks is required");
        return false;
      }
    }

    if (targetStep >= 3 && activeStep < 3) {
      if (blueprint.length === 0) {
        toast.error("Cannot advance to questions without at least 1 blueprint section.");
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
        }
      }
    }

    if (targetStep >= 5 && activeStep < 5) {
      if (currentMarks !== totalMarks) {
        toast.error(`Cannot advance to publishing: Total marks assigned to questions (${currentMarks}) must match target assessment marks (${totalMarks}).`);
        return false;
      }
    }

    return true;
  };

  const preparePayload = () => {
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
    const metaWithWindow: any = {
      ...metadata,
      durationMinutes: parseInt(metadata.durationMinutes),
      passing_marks: parseInt(metadata.passing_marks),
    };

    if (metadata.date && metadata.startTime) {
      startD = parseTimeString(metadata.startTime, metadata.date);
      metaWithWindow.windowStart = startD.toISOString();
    }
    if (metadata.date && metadata.endTime) {
      endD = parseTimeString(metadata.endTime, metadata.date);
      if (startD && endD <= startD) {
        // Handle over midnight end time by adding 1 day
        endD.setDate(endD.getDate() + 1);
      }
      metaWithWindow.windowEnd = endD.toISOString();
    }

    const payload = {
      id,
      metadata: metaWithWindow,
      blueprint,
      questions: questions.map(q => ({
          ...q,
          marks: parseInt(q.marks as any),
          imageUrl: q.imageUrl,
          caseStudyContext: q.caseStudyContext,
          options: q.options.map(o => ({...o, order_index: parseInt(o.order_index as any)}))
      })),
      rules: {
          ...rules,
          attempts: parseInt(rules.attempts)
      },
    };
    return payload;
  };

  const runAutosave = useCallback(async (step: number) => {
    if (!id) return;
    setAutosaveStatus("saving");
    try {
      const updatePayload = {
        title: metadata.title || undefined,
        description: metadata.description || undefined,
        instructions: metadata.selectedInstructions.join("\n") + (metadata.customInstructions ? "\n" + metadata.customInstructions : ""),
        assessment_type: metadata.mode === "Groupwork" ? "GROUP_WORK" : metadata.mode.toUpperCase(),
        grading_mode: "AUTOMATIC",
        result_release_mode: rules.resultRelease === "manual" ? "MANUAL" : "IMMEDIATE",
        total_marks: totalMarks || undefined,
        passing_marks: metadata.passing_marks ? parseInt(metadata.passing_marks as any) : undefined,
        duration_minutes: metadata.durationMinutes ? parseInt(metadata.durationMinutes as any) : undefined,
        is_group_assessment: metadata.mode === "Groupwork",
        max_group_size: metadata.max_group_size || undefined,
        group_formation_mode: metadata.group_formation_mode || undefined,
        group_assignment_mode: metadata.group_assignment_mode || undefined,
        question_distribution_mode: metadata.question_distribution_mode || undefined,
        require_all_member_approval: metadata.require_all_member_approval,
        require_all_member_participation: metadata.require_all_member_participation,
        appeal_window_days: metadata.appeal_window_days ? parseInt(metadata.appeal_window_days as any) : undefined,
        max_attempts: rules.attempts ? parseInt(rules.attempts as any) : undefined,
        is_password_protected: rules.passwordProtected,
        fullscreen_required: rules.browserRestricted,
        is_supervised: rules.supervised,
        ai_assistance_allowed: rules.aiAllowed,
        is_open_book: rules.openBook,
        randomize_questions: rules.shuffleQuestions,
        randomize_options: rules.shuffleOptions,
        draft_step: step,
      };
      await apiClient(`/assessments/${id}/wizard/${step}`, {
        method: "POST",
        body: JSON.stringify(updatePayload),
      });
      setAutosaveStatus("saved");
    } catch (err: any) {
      setAutosaveStatus("error");
      console.error("Autosave failed:", err);
    }
  }, [id, metadata, rules, totalMarks]);

  const handleNextStep = (step: number) => {
    if (step > activeStep) {
      if (!runStepGuards(step)) return;
      runAutosave(activeStep);
    } else {
      toast.warning(`Navigating backward to step ${step}. Your draft is autosaved.`);
      runAutosave(activeStep);
    }
    setActiveStep(step);
  };

  const handleSaveDraft = async () => {
    setAutosaveStatus("saving");
    try {
      await runAutosave(activeStep);
      toast.success("Draft saved successfully");
    } catch (err) {
      toast.error("Failed to save draft");
    }
  };

  const handlePublish = async () => {
    setIsSaving(true);
    setFieldErrors({});
    try {
      const payload = preparePayload();
      const res = await apiClient("/assessments/publish", { method: "POST", body: JSON.stringify(payload) }) as any;
      if (res.validation_passed) {
        toast.success("Assessment registry synced successfully");
        router.push("/lecturer/assessments");
      } else {
        toast.error(res.errors?.join(", ") || "Sync failed validation");
      }
    } catch (err: any) {
      mapApiErrors(err);
      toast.error(err.message || "Failed to update assessment");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveToBank = async (q: Question) => {
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
            image_url: q.imageUrl,
            question_type: typeMap[q.type] || "short_answer",
            difficulty: "medium",
            suggested_marks: Math.max(1, q.marks),
            options: q.options.map((opt) => ({
                option_text: opt.option_text,
                option_text_right: opt.option_text_right,
                is_correct: opt.is_correct,
                order_index: opt.order_index,
            })),
            course_id: metadata.course_id || undefined,
        });
        toast.success("Question committed to institutional bank");
    } catch (e: any) {
        toast.error(e.message || "Failed to bank question");
    }
  };

  if (isLoading) return <div className="p-20 text-center"><LoaderCircleIcon className="animate-spin mx-auto mb-3 size-6 text-primary/40" /><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Loading Registry Matrix</p></div>;


  const renderStepContent = (stepNum: number) => {
    switch (stepNum) {
      case 1:
        return (
          <>
          <Card className="shadow-none border border-border/60 rounded-md overflow-hidden bg-card/30">
                <CardHeader className="bg-muted/5 border-b border-border/40 py-3 px-5"><CardTitle className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Assessment Identity</CardTitle></CardHeader>
                <CardContent className="p-5 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                            <Label htmlFor="title" className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Display Title</Label>
                            <Input id="title" value={metadata.title} onChange={(e) => setMetadata({...metadata, title: e.target.value})} onBlur={() => runAutosave(1)} aria-invalid={!!fieldErrors.title} aria-describedby={fieldErrors.title ? "title-error" : undefined} className="h-9 font-semibold text-sm rounded bg-white shadow-none focus-visible:ring-1" />
                        {fieldErrors.title && (
                          <p className="text-xs text-destructive mt-1 font-semibold" id="title-error">
                            {fieldErrors.title}
                          </p>
                        )}
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Assessment Protocol</Label>
                            <Select value={metadata.mode} onValueChange={(v) => {
                            setMetadata({...metadata, mode: v});
                            setTimeout(() => runAutosave(1), 0);
                          }}>
                                <SelectTrigger className="h-9 rounded font-bold text-xs bg-white shadow-none"><SelectValue /></SelectTrigger>
                                <SelectContent className="rounded">
                                    {["CAT", "Summative", "Homework", "Formative", "Practice", "Groupwork"].map(m => <SelectItem key={m} value={m} className="text-xs font-bold">{m}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Description & Context</Label>
                        <Textarea id="description" value={metadata.description} onChange={(e) => setMetadata({...metadata, description: e.target.value})} onBlur={() => runAutosave(1)} className="min-h-[80px] rounded bg-white p-3 text-xs font-medium focus-visible:ring-1" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-5 border-t border-border/40">
                        <div className="space-y-1.5">
                            <Label htmlFor="date" className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Scheduled Date</Label>
                            <Input type="date" value={metadata.date ? format(metadata.date, "yyyy-MM-dd") : ""} onChange={(e) => setMetadata({...metadata, date: new Date(e.target.value)})} className="h-9 rounded font-bold text-xs bg-white shadow-none" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="startTime" className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Access Start</Label>
                            <Input type="time" value={metadata.startTime} onChange={(e) => setMetadata({...metadata, startTime: e.target.value})} className="h-9 rounded font-bold text-xs bg-white shadow-none" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="endTime" className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Access End</Label>
                            <Input type="time" value={metadata.endTime} onChange={(e) => setMetadata({...metadata, endTime: e.target.value})} className="h-9 rounded font-bold text-xs bg-white shadow-none" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-none border border-border/60 rounded-md overflow-hidden bg-card/30">
                <CardHeader className="bg-muted/5 border-b border-border/40 py-3 px-5"><CardTitle className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Target Enrollment</CardTitle></CardHeader>
                <CardContent className="p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Departments</Label>
                            <ScrollArea className="h-32 border border-border/60 rounded p-2 bg-white">
                                {availableDepartments.map(d => (
                                    <div key={d.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => toggleDept(d.id)}>
                                        <Checkbox checked={metadata.department_ids.includes(d.id)} className="size-3.5 rounded-sm" />
                                        <span className="text-[10px] font-bold text-foreground/70 truncate">{d.name}</span>
                                    </div>
                                ))}
                            </ScrollArea>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Class Options</Label>
                            <ScrollArea className="h-32 border border-border/60 rounded p-2 bg-white">
                                {availableOptions.map(o => (
                                    <div key={o.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => toggleOption(o.id)}>
                                        <Checkbox checked={metadata.option_ids.includes(o.id)} className="size-3.5 rounded-sm" />
                                        <span className="text-[10px] font-bold text-foreground/70 truncate">{o.name}</span>
                                    </div>
                                ))}
                            </ScrollArea>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Level / Stream</Label>
                            <ScrollArea className="h-32 border border-border/60 rounded p-2 bg-white">
                                {availableClasses.map(c => (
                                    <div key={c.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => setMetadata({...metadata, class_group_ids: metadata.class_group_ids.includes(c.id) ? metadata.class_group_ids.filter((i:any)=>i!==c.id) : [...metadata.class_group_ids, c.id]})}>
                                        <Checkbox checked={metadata.class_group_ids.includes(c.id)} className="size-3.5 rounded-sm" />
                                        <span className="text-[10px] font-bold text-foreground/70 truncate">{c.name}</span>
                                    </div>
                                ))}
                            </ScrollArea>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end pt-2">
                <Button onClick={() => setActiveStep(2)} className="h-9 px-6 rounded-md font-bold uppercase tracking-widest text-[10px] shadow-none">
                  Blueprint <ChevronRight className="ml-1 size-3" />
                </Button>
            </div>
          </>
        );
      case 2:
        return (
          <>
          <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Blueprint</h2>
                <Button variant="outline" size="sm" onClick={() => setBlueprint([...blueprint, { id: `sec-${Date.now()}`, section: "New Section", topics: "", marks: 0, questions: 0, difficulty: "Medium", allowedTypes: ["mcq"] }])} className="rounded-md h-8 text-[10px] font-bold uppercase border-primary/20 text-primary px-3 hover:bg-primary/5">
                    <Plus className="size-3 mr-1.5" /> Add Section
                </Button>
            </div>
            
            <div className="space-y-3">
                {blueprint.map((sec, idx) => (
                    <Card key={sec.id} className="shadow-none border border-border/60 rounded-lg overflow-hidden group bg-card/30">
                        <CardHeader className="py-2.5 border-b border-border/40 bg-muted/5 flex flex-row items-center justify-between px-4">
                            <div className="flex items-center gap-3">
                                <Badge className="rounded size-5 flex items-center justify-center p-0 font-bold bg-primary/10 text-primary border-none shadow-none text-[10px]">{idx + 1}</Badge>
                                <Input value={sec.section} onChange={(e) => setBlueprint(blueprint.map(s => s.id === sec.id ? {...s, section: e.target.value} : s))} className="h-7 border-none bg-transparent font-bold text-xs focus-visible:ring-0 p-0 w-64 shadow-none uppercase" />
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setBlueprint(blueprint.filter(s => s.id !== sec.id))} className="text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 h-7 w-7 rounded"><Trash2 className="size-3.5" /></Button>
                        </CardHeader>
                        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Marks Allocation</Label>
                                    <Input type="number" value={sec.marks} onChange={(e) => setBlueprint(blueprint.map(s => s.id === sec.id ? {...s, marks: parseInt(e.target.value) || 0} : s))} className="h-8 rounded bg-white text-xs font-bold shadow-none focus-visible:ring-1" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Target Question Nodes</Label>
                                    <Input type="number" value={sec.questions} onChange={(e) => setBlueprint(blueprint.map(s => s.id === sec.id ? {...s, questions: parseInt(e.target.value) || 0} : s))} className="h-8 rounded bg-white text-xs font-bold shadow-none focus-visible:ring-1" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Topic Domain</Label>
                                <Textarea value={sec.topics} onChange={(e) => setBlueprint(blueprint.map(s => s.id === sec.id ? {...s, topics: e.target.value} : s))} className="min-h-[85px] rounded bg-white p-3 text-xs font-medium focus-visible:ring-1" placeholder="Topics covered..." />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="flex justify-between pt-2 border-t border-border/40 mt-4">
                <Button variant="ghost" onClick={() => setActiveStep(1)} className="h-9 px-4 rounded-md font-bold uppercase tracking-widest text-[10px] text-muted-foreground hover:bg-muted/50"><ChevronLeft className="mr-1.5 size-3" /> Identity</Button>
                <Button onClick={() => setActiveStep(3)} className="h-9 px-6 rounded-md font-bold uppercase tracking-widest text-[10px] shadow-none">Structure <ChevronRight className="ml-1.5 size-3" /></Button>
            </div>
          </>
        );
      case 3:
        return (
          <>
          <div className="flex items-center justify-between px-1">
                <div className="space-y-0.5">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Architecture</h2>
                    <p className="text-[9px] font-bold text-muted-foreground/50 uppercase">{questions.length} logical nodes</p>
                </div>
                <Button size="sm" onClick={() => setQuestions([...questions, { id: `q-${Date.now()}`, sectionId: blueprint[0]?.id || "", text: "", marks: 2, type: "mcq", options: [
                    { option_text: "Option 1", is_correct: true, order_index: 0 },
                    { option_text: "Option 2", is_correct: false, order_index: 1 },
                ], aiGenerated: false }])} className="rounded-md h-8 px-4 font-bold uppercase text-[10px] shadow-none">
                    <Plus className="size-3 mr-1.5" /> Add Node
                </Button>
            </div>

            <div className="space-y-3">
                {questions.map((q, idx) => (
                    <QuestionCard 
                        key={q.id}
                        question={q}
                        index={idx}
                        allowedTypes={["mcq", "truefalse", "shortanswer", "essay", "matching", "fillblank", "ordering", "casestudy"]}
                        onUpdate={(updates) => setQuestions(questions.map(item => item.id === q.id ? {...item, ...updates} : item))}
                        onDelete={() => setQuestions(questions.filter(item => item.id !== q.id))}
                        onSaveToBank={() => handleSaveToBank(q)}
                        onUpdateOption={(oIdx, updates) => {
                            setQuestions(questions.map(item => {
                                if (item.id !== q.id) return item;
                                const newOpts = [...item.options];
                                newOpts[oIdx] = { ...newOpts[oIdx], ...updates };
                                return { ...item, options: newOpts };
                            }));
                        }}
                        onAddOption={() => {
                            setQuestions(questions.map(item => {
                                if (item.id !== q.id) return item;
                                return { ...item, options: [...item.options, { option_text: `New Candidate`, is_correct: false, order_index: item.options.length }] };
                            }));
                        }}
                        onRemoveOption={(oIdx) => {
                            setQuestions(questions.map(item => {
                                if (item.id !== q.id) return item;
                                return { ...item, options: item.options.filter((_, i) => i !== oIdx).map((o, i) => ({...o, order_index: i})) };
                            }));
                        }}
                    />
                ))}
            </div>

            <div className="flex justify-between pt-4 border-t border-border/40 mt-4">
                <Button variant="ghost" onClick={() => setActiveStep(2)} className="h-9 px-4 rounded-md font-bold uppercase tracking-widest text-[10px] text-muted-foreground hover:bg-muted/50"><ChevronLeft className="mr-1.5 size-3" /> Blueprint</Button>
                <Button onClick={() => setActiveStep(4)} className="h-9 px-6 rounded-md font-bold uppercase tracking-widest text-[10px] shadow-none">Review <ChevronRight className="ml-1.5 size-3" /></Button>
            </div>
          </>
        );
      case 4:
        return (
          <>
          <Card className="shadow-none border border-border/60 rounded-lg overflow-hidden bg-card/30">
                <CardHeader className="bg-muted/5 border-b border-border/40 py-5 px-6 relative">
                    <div className="absolute top-4 right-6 flex gap-2">
                        <Badge variant="outline" className="h-6 px-2 rounded border-primary/20 bg-white text-primary font-bold uppercase tracking-widest text-[9px]">{metadata.mode}</Badge>
                        <Badge variant="outline" className="h-6 px-2 rounded border-primary/20 bg-white text-primary font-bold uppercase tracking-widest text-[9px]">{totalMarks} PTS</Badge>
                    </div>
                    <CardTitle className="text-lg font-bold tracking-tight text-foreground/90 uppercase pr-24">{metadata.title || "Untitled Trace"}</CardTitle>
                    <CardDescription className="text-[10px] mt-1 font-bold uppercase tracking-widest text-muted-foreground/60 leading-relaxed truncate">{metadata.description || "No pedagogical context provided."}</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                    <div className="space-y-3">
                        <h3 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            Protocol Matrix <Separator className="flex-1 border-border/40" />
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="p-3 rounded border border-border/60 bg-white space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="size-6 rounded bg-muted/10 flex items-center justify-center border border-border/40"><CalendarIcon className="size-3 text-primary/60" /></div>
                                    <div className="space-y-0">
                                        <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Date</p>
                                        <p className="text-[11px] font-bold">{metadata.date ? format(metadata.date, "MMM do, yyyy") : "Not Scheduled"}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-3 rounded border border-border/60 bg-white space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="size-6 rounded bg-muted/10 flex items-center justify-center border border-border/40"><Clock className="size-3 text-primary/60" /></div>
                                    <div className="space-y-0">
                                        <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Window</p>
                                        <p className="text-[11px] font-bold">{metadata.startTime} — {metadata.endTime} <span className="text-[9px] text-muted-foreground ml-1">({metadata.durationMinutes}m)</span></p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-3 rounded border border-border/60 bg-white space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="size-6 rounded bg-muted/10 flex items-center justify-center border border-border/40"><Shield className="size-3 text-primary/60" /></div>
                                    <div className="space-y-0">
                                        <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Integrity</p>
                                        <p className="text-[11px] font-bold">{rules.supervised ? "Proctored" : "Self-paced"} • {rules.browserRestricted ? "Lockdown" : "Open"}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            Node Hierarchy <Separator className="flex-1 border-border/40" />
                        </h3>
                        <div className="space-y-2 pr-1 max-h-[400px] overflow-y-auto">
                            {questions.map((q, idx) => (
                                <ReviewQuestionCard key={q.id} question={q} index={idx} />
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-between pt-4 border-t border-border/40 mt-4">
                <Button variant="ghost" onClick={() => handleNextStep(3)} className="h-9 px-4 rounded-md font-bold uppercase tracking-widest text-[10px] text-muted-foreground hover:bg-muted/50">Back</Button>
                <Button onClick={() => handleNextStep(5)} className="h-9 px-6 rounded-md font-bold uppercase tracking-widest text-[10px] shadow-none bg-primary hover:bg-primary/90">
                    Next: Go Live
                </Button>
            </div>
          </>
        );
      case 5:
        return (
          <>
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-8">
              <div className="max-w-md space-y-4">
                <h2 className="text-2xl font-bold tracking-tight uppercase">
                  Update Assessment?
                </h2>
                <p className="text-muted-foreground text-sm">
                  All changes will be updated in the registry.
                  Scheduled for{" "}
                  <strong>
                    {metadata.date ? format(metadata.date, "PPP") : "TBD"}
                  </strong>
                  .
                </p>
                <div className="p-4 bg-muted/50 rounded-lg text-sm space-y-1 text-left">
                  <p>
                    <strong>Window:</strong>{" "}
                    {formatDisplayTime(metadata.startTime)} -{" "}
                    {formatDisplayTime(metadata.endTime)}
                  </p>
                  <p>
                    <strong>Mode:</strong> {metadata.mode}
                  </p>
                  <p>
                    <strong>Review:</strong> {rules.resultRelease}
                  </p>
                  <p>
                    <strong>Closed / Open:</strong> {questions.filter(q => ['mcq','truefalse','matching','fillblank','ordering'].includes(q.type)).length} / {questions.filter(q => ['shortanswer','essay','computational','casestudy'].includes(q.type)).length}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <Button
                  size="lg"
                  className="h-12 text-base font-semibold"
                  onClick={handlePublish}
                  disabled={isSaving}
                >
                  {isSaving ? "Updating..." : "Update Assessment"}
                </Button>
                <Button variant="ghost" onClick={() => handleNextStep(4)}>
                  Review Again
                </Button>
              </div>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-16 p-4">
      <div className="flex items-center justify-between border-b border-border/40 pb-3 px-1">
        <div className="space-y-0.5">
          <h1 className="text-lg font-bold tracking-tight text-foreground/90 uppercase">Modify Assessment</h1>
          <p className="text-muted-foreground text-[9px] uppercase tracking-widest font-bold">Registry ID: {id.split('-')[0]} • Status: Verified</p>
        </div>
        <div className="flex items-center gap-2">
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
              <AlertTriangle className="size-3.5 text-destructive" /> Error saving
            </span>
          )}
          <Button variant="ghost" onClick={() => router.back()} className="h-8 px-4 rounded-md border border-border/60 text-[10px] font-bold uppercase tracking-widest hover:bg-muted/50">Abort</Button>
          <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving} className="h-8 px-4 rounded-md border border-border/60 text-[10px] font-bold uppercase tracking-widest hover:bg-muted/50">Save Draft</Button>
          <Badge variant="outline" className="h-8 px-3 font-semibold text-[10px] uppercase tracking-widest">
            Step {activeStep} / 5
          </Badge>
        </div>
      </div>

      {/* Mobile Accordion Stepper (visible on mobile, hidden on desktop) */}
      <div className="md:hidden block space-y-4">
        {STEPS_DATA.map((s, index) => {
          const stepNum = index + 1;
          const isActive = activeStep === stepNum;
          return (
            <div key={index} className="border rounded-lg overflow-hidden bg-card shadow-sm">
              <button
                type="button"
                onClick={() => handleNextStep(stepNum)}
                className="flex items-center justify-between w-full p-4 font-semibold text-sm hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className={cn(
                    "size-6 text-xs rounded-full flex items-center justify-center font-bold transition-colors",
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    {stepNum}
                  </span>
                  <span className="font-semibold text-foreground">{s.title}</span>
                </div>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", isActive && "rotate-180")} />
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
          indicators={{
            completed: <Check className="size-3.5" />,
            loading: <div className="size-3.5 rounded-full bg-primary/40 animate-pulse" />,
          }}
        >
          <StepperNav className="flex w-full gap-2 border-b">
            {STEPS_DATA.map((s, index) => {
              const stepNum = index + 1;
              return (
                <StepperItem
                  key={index}
                  step={stepNum}
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
              );
            })}
          </StepperNav>

          <StepperPanel>
            <StepperContent value={1}>{renderStepContent(1)}</StepperContent>
            <StepperContent value={2}>{renderStepContent(2)}</StepperContent>
            <StepperContent value={3}>{renderStepContent(3)}</StepperContent>
            <StepperContent value={4}>{renderStepContent(4)}</StepperContent>
            <StepperContent value={5}>{renderStepContent(5)}</StepperContent>
          </StepperPanel>
        </Stepper>
      </div>
    </div>
  );
}
