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
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { summarizeQuestionMix } from "@/lib/grading-architecture";

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
    <Card className="shadow-none border hover:border-primary/20 transition-colors rounded-2xl overflow-hidden">
      <CardContent className="p-8 space-y-8">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="size-10 flex items-center justify-center rounded-xl font-black text-sm bg-muted/5 border-muted-foreground/10">{index + 1}</Badge>
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
              <SelectTrigger className="w-[180px] h-10 rounded-xl font-bold text-xs uppercase tracking-widest"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-xl">
                {allowedTypes.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize text-xs font-bold tracking-tight">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Marks</Label>
              <Input
                type="number"
                className="w-20 h-10 text-center font-bold rounded-xl bg-muted/5"
                value={question.marks ?? 0}
                onChange={(e) => onUpdate({ marks: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="flex items-center gap-2 border-l pl-6 border-muted-foreground/10">
              <Button
                variant="ghost"
                size="icon"
                onClick={onSaveToBank}
                className="text-primary hover:bg-primary/5 h-10 w-10 rounded-xl"
                title="Save to Bank"
              >
                <Database className="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 h-10 w-10 rounded-xl"
                title="Delete Question"
              >
                <Trash2 className="size-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Question Text & Media */}
        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 ml-1">Question Domain Content</Label>
            <Textarea
              placeholder="Write your question text here..."
              value={question.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              className="min-h-[120px] text-base font-semibold p-6 rounded-2xl bg-muted/[0.02] border-muted-foreground/10 focus-visible:ring-primary/10"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 ml-1">Contextual Media Integration</Label>
            {question.imageUrl ? (
              <div className="relative inline-block border rounded-2xl p-2 bg-muted/30 group overflow-hidden shadow-sm">
                <img src={question.imageUrl} alt="Diagram" className="max-h-72 rounded-xl object-contain" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center rounded-xl">
                  <Button variant="destructive" size="sm" onClick={() => onUpdate({ imageUrl: undefined })} className="rounded-xl font-bold uppercase tracking-widest text-[10px]">
                    <Trash2 className="size-4 mr-2" /> Remove Image Trace
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <label className="flex flex-col items-center justify-center gap-2 size-32 rounded-2xl border-2 border-dashed border-muted-foreground/20 cursor-pointer hover:bg-muted/5 hover:border-primary/30 transition-all group">
                  <Upload className="size-6 text-muted-foreground/40 group-hover:text-primary/60" />
                  <span className="text-[9px] font-bold text-muted-foreground/60 group-hover:text-primary/70 uppercase tracking-tighter">Upload Diagram</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
                <div className="space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Guideline Sync</p>
                    <p className="text-[10px] text-muted-foreground/50 leading-relaxed font-medium">Standard JPG, PNG, SVG supported.<br/>Maximum allocation 5MB per trace.<br/>Visual context increases pedagogical accuracy.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <Separator className="bg-border/50" />

        {/* Answer Options Editors */}
        {(question.type === "mcq" || question.type === "truefalse") && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 ml-1">Response Candidates</Label>
                {question.type === "mcq" && (
                    <Button variant="outline" size="sm" onClick={onAddOption} className="h-8 rounded-lg text-[10px] font-bold uppercase tracking-widest border-primary/20 text-primary">
                        <Plus className="size-3.5 mr-2" /> Add Candidate
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
              className="space-y-3"
            >
              {question.options.map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-4 p-4 rounded-xl border bg-muted/[0.02] hover:border-muted-foreground/20 transition-all focus-within:bg-background">
                  <RadioGroupItem value={oIdx.toString()} className="size-5 border-muted-foreground/30 text-emerald-500" />
                  <Input
                    value={opt.option_text || ""}
                    onChange={(e) => onUpdateOption(oIdx, { option_text: e.target.value })}
                    className="h-10 border-none bg-transparent shadow-none focus-visible:ring-0 font-bold text-sm"
                    placeholder={`Candidate Trace ${oIdx + 1}`}
                    disabled={question.type === "truefalse"}
                  />
                  {question.type === "mcq" && question.options.length > 2 && (
                    <Button variant="ghost" size="icon" onClick={() => onRemoveOption(oIdx)} className="text-muted-foreground/20 hover:text-destructive h-9 w-9 rounded-xl"><X className="size-4" /></Button>
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
    <div className="space-y-4 group p-6 border rounded-2xl hover:bg-muted/5 transition-all">
      <div className="flex gap-6">
        <span className="text-muted-foreground/30 font-black text-3xl tabular-nums shrink-0 leading-none">{(index + 1).toString().padStart(2, "0")}</span>
        <div className="space-y-4 flex-1">
          <div>
            <p className="font-bold text-lg leading-snug text-foreground/90">{question.text || <em className="text-muted-foreground font-normal italic opacity-40">No question context provided</em>}</p>
            {question.imageUrl && (
              <div className="mt-4 inline-block p-1 border rounded-2xl overflow-hidden bg-white shadow-sm">
                <img src={question.imageUrl} alt="Diagram" className="max-h-60 rounded-xl object-contain" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="h-6 text-[10px] font-black uppercase tracking-widest px-3 rounded-lg">{question.type}</Badge>
            <Badge variant="outline" className="h-6 text-[10px] font-bold px-3 rounded-lg border-muted-foreground/10">{question.marks} Marks</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- MAIN EDIT PAGE ---

export default function EditAssessmentPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [activeStep, setActiveStep] = useState(1);
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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        id,
        metadata: {
            ...metadata,
            durationMinutes: parseInt(metadata.durationMinutes),
            passing_marks: parseInt(metadata.passing_marks),
        },
        blueprint,
        questions: questions.map(q => ({
            ...q,
            marks: parseInt(q.marks as any),
            imageUrl: q.imageUrl,
            options: q.options.map(o => ({...o, order_index: parseInt(o.order_index as any)}))
        })),
        rules: {
            ...rules,
            attempts: parseInt(rules.attempts)
        },
      };
      const res = await apiClient("/assessments/publish", { method: "POST", body: JSON.stringify(payload) }) as any;
      if (res.validation_passed) {
        toast.success("Assessment registry synced successfully");
        router.push("/lecturer/assessments");
      } else {
        toast.error(res.errors?.join(", ") || "Sync failed validation");
      }
    } catch (err: any) {
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

  if (isLoading) return <div className="p-24 text-center"><LoaderCircleIcon className="animate-spin mx-auto mb-4 size-8 text-primary/40" /><p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60">Loading Registry Matrix</p></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24 px-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground/90">Modify Assessment</h1>
          <p className="text-muted-foreground text-xs uppercase tracking-[0.2em] font-medium">Registry ID: {id.split('-')[0]} • Status: Verified</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="h-10 px-6 rounded-xl border text-xs font-bold uppercase tracking-widest">Abort</Button>
          <Button onClick={handleSave} disabled={isSaving} className="h-10 px-8 rounded-xl font-bold uppercase tracking-widest text-[11px] shadow-lg shadow-primary/10">
            {isSaving ? <LoaderCircleIcon className="animate-spin mr-2 size-4" /> : <Save className="mr-2 size-4" />}
            Finalize Changes
          </Button>
        </div>
      </div>

      <Stepper value={activeStep} onValueChange={setActiveStep} className="space-y-8">
        <StepperNav className="flex w-full gap-2 border-b bg-muted/5 rounded-t-2xl p-1">
          {["Identity", "Blueprint", "Structure", "Review"].map((title, idx) => (
            <StepperItem key={idx} step={idx + 1} className="flex-1">
              <StepperTrigger className="flex w-full items-center justify-center gap-3 p-4 rounded-xl border-b-2 border-transparent data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border-primary transition-all">
                <StepperIndicator className="size-6 text-[10px] font-bold">{idx + 1}</StepperIndicator>
                <StepperTitle className="text-[10px] font-black uppercase tracking-[0.15em]">{title}</StepperTitle>
              </StepperTrigger>
            </StepperItem>
          ))}
        </StepperNav>

        <StepperPanel>
          <StepperContent value={1} className="space-y-6 focus-visible:outline-none">
            <Card className="shadow-none border rounded-2xl overflow-hidden">
                <CardHeader className="bg-muted/5 border-b py-6 px-10"><CardTitle className="text-lg font-bold">Assessment Identity</CardTitle></CardHeader>
                <CardContent className="p-10 space-y-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Display Title</Label>
                            <Input value={metadata.title} onChange={(e) => setMetadata({...metadata, title: e.target.value})} className="h-12 font-semibold rounded-xl text-base shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]" />
                        </div>
                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Assessment Protocol</Label>
                            <Select value={metadata.mode} onValueChange={(v) => setMetadata({...metadata, mode: v})}>
                                <SelectTrigger className="h-12 rounded-xl font-bold text-sm bg-muted/5"><SelectValue /></SelectTrigger>
                                <SelectContent className="rounded-xl">
                                    {["CAT", "Summative", "Homework", "Formative", "Practice", "Groupwork"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Description & Context</Label>
                        <Textarea value={metadata.description} onChange={(e) => setMetadata({...metadata, description: e.target.value})} className="min-h-[140px] rounded-2xl bg-muted/[0.02] p-6 text-sm font-medium leading-relaxed" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10 pt-10 border-t border-dashed">
                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Scheduled Date</Label>
                            <Input type="date" value={metadata.date ? format(metadata.date, "yyyy-MM-dd") : ""} onChange={(e) => setMetadata({...metadata, date: new Date(e.target.value)})} className="h-12 rounded-xl font-bold" />
                        </div>
                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Access Start</Label>
                            <Input type="time" value={metadata.startTime} onChange={(e) => setMetadata({...metadata, startTime: e.target.value})} className="h-12 rounded-xl font-bold" />
                        </div>
                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Access End</Label>
                            <Input type="time" value={metadata.endTime} onChange={(e) => setMetadata({...metadata, endTime: e.target.value})} className="h-12 rounded-xl font-bold" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-none border rounded-2xl overflow-hidden">
                <CardHeader className="bg-muted/5 border-b py-6 px-10"><CardTitle className="text-lg font-bold">Target Enrollment</CardTitle></CardHeader>
                <CardContent className="p-10 space-y-10">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Departments</Label>
                            <ScrollArea className="h-48 border rounded-xl p-4 bg-muted/[0.02]">
                                {availableDepartments.map(d => (
                                    <div key={d.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer" onClick={() => toggleDept(d.id)}>
                                        <Checkbox checked={metadata.department_ids.includes(d.id)} />
                                        <span className="text-xs font-bold text-foreground/70 truncate">{d.name}</span>
                                    </div>
                                ))}
                            </ScrollArea>
                        </div>
                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Class Options</Label>
                            <ScrollArea className="h-48 border rounded-xl p-4 bg-muted/[0.02]">
                                {availableOptions.map(o => (
                                    <div key={o.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer" onClick={() => toggleOption(o.id)}>
                                        <Checkbox checked={metadata.option_ids.includes(o.id)} />
                                        <span className="text-xs font-bold text-foreground/70 truncate">{o.name}</span>
                                    </div>
                                ))}
                            </ScrollArea>
                        </div>
                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Level / Stream</Label>
                            <ScrollArea className="h-48 border rounded-xl p-4 bg-muted/[0.02]">
                                {availableClasses.map(c => (
                                    <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer" onClick={() => setMetadata({...metadata, class_group_ids: metadata.class_group_ids.includes(c.id) ? metadata.class_group_ids.filter((i:any)=>i!==c.id) : [...metadata.class_group_ids, c.id]})}>
                                        <Checkbox checked={metadata.class_group_ids.includes(c.id)} />
                                        <span className="text-xs font-bold text-foreground/70 truncate">{c.name}</span>
                                    </div>
                                ))}
                            </ScrollArea>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end pt-6">
                <Button onClick={() => setActiveStep(2)} className="h-12 px-10 rounded-xl font-bold uppercase tracking-widest text-[11px] shadow-sm">
                  Next Step: Blueprint <ChevronRight className="ml-2 size-4" />
                </Button>
            </div>
          </StepperContent>

          <StepperContent value={2} className="space-y-6 focus-visible:outline-none">
            <div className="flex items-center justify-between px-1">
                <h2 className="text-2xl font-bold tracking-tight">Assessment Blueprint</h2>
                <Button variant="outline" size="sm" onClick={() => setBlueprint([...blueprint, { id: `sec-${Date.now()}`, section: "New Section", topics: "", marks: 0, questions: 0, difficulty: "Medium", allowedTypes: ["mcq"] }])} className="rounded-xl h-10 border-primary/20 text-primary px-5 hover:bg-primary/5">
                    <Plus className="size-4 mr-2" /> Add Section Node
                </Button>
            </div>
            
            <div className="space-y-4">
                {blueprint.map((sec, idx) => (
                    <Card key={sec.id} className="shadow-none border rounded-2xl overflow-hidden group">
                        <CardHeader className="py-5 border-b bg-muted/[0.02] flex flex-row items-center justify-between px-8">
                            <div className="flex items-center gap-4">
                                <Badge className="rounded-lg size-7 flex items-center justify-center p-0 font-black bg-primary/10 text-primary border-none shadow-none">{idx + 1}</Badge>
                                <Input value={sec.section} onChange={(e) => setBlueprint(blueprint.map(s => s.id === sec.id ? {...s, section: e.target.value} : s))} className="h-9 border-none bg-transparent font-bold text-lg focus-visible:ring-0 p-0 w-80 shadow-none" />
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setBlueprint(blueprint.filter(s => s.id !== sec.id))} className="text-muted-foreground/30 hover:text-destructive hover:bg-destructive/5 h-9 w-9 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="size-4" /></Button>
                        </CardHeader>
                        <CardContent className="p-8 grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Marks Allocation</Label>
                                    <Input type="number" value={sec.marks} onChange={(e) => setBlueprint(blueprint.map(s => s.id === sec.id ? {...s, marks: parseInt(e.target.value) || 0} : s))} className="h-11 rounded-xl font-bold bg-muted/5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.01)]" />
                                </div>
                                <div className="space-y-3">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Target Question Nodes</Label>
                                    <Input type="number" value={sec.questions} onChange={(e) => setBlueprint(blueprint.map(s => s.id === sec.id ? {...s, questions: parseInt(e.target.value) || 0} : s))} className="h-11 rounded-xl font-bold bg-muted/5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.01)]" />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Topic Coverage Domain</Label>
                                <Textarea value={sec.topics} onChange={(e) => setBlueprint(blueprint.map(s => s.id === sec.id ? {...s, topics: e.target.value} : s))} className="min-h-[128px] rounded-2xl bg-muted/[0.01] p-5 text-sm font-medium leading-relaxed" placeholder="Describe topics covered in this section..." />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="flex justify-between pt-10 border-t border-dashed">
                <Button variant="ghost" onClick={() => setActiveStep(1)} className="h-12 px-8 rounded-xl font-bold uppercase tracking-widest text-[10px] text-muted-foreground/60"><ChevronLeft className="mr-2 size-4" /> Identity Registry</Button>
                <Button onClick={() => setActiveStep(3)} className="h-12 px-10 rounded-xl font-bold uppercase tracking-widest text-[11px] shadow-sm">Next: Structure Domain <ChevronRight className="ml-2 size-4" /></Button>
            </div>
          </StepperContent>

          <StepperContent value={3} className="space-y-8 focus-visible:outline-none">
            <div className="flex items-center justify-between px-1">
                <div className="space-y-1">
                    <h2 className="text-2xl font-bold tracking-tight">Question Architecture</h2>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Constructing {questions.length} logical nodes</p>
                </div>
                <Button size="sm" onClick={() => setQuestions([...questions, { id: `q-${Date.now()}`, sectionId: blueprint[0]?.id || "", text: "", marks: 2, type: "mcq", options: [
                    { option_text: "Option 1", is_correct: true, order_index: 0 },
                    { option_text: "Option 2", is_correct: false, order_index: 1 },
                ], aiGenerated: false }])} className="rounded-xl h-11 px-8 font-bold uppercase tracking-widest text-[10px]">
                    <Plus className="size-4 mr-2" /> Add Question Node
                </Button>
            </div>

            <div className="space-y-5">
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

            <div className="flex justify-between pt-10 border-t border-dashed">
                <Button variant="ghost" onClick={() => setActiveStep(2)} className="h-12 px-8 rounded-xl font-bold uppercase tracking-widest text-[10px] text-muted-foreground/60"><ChevronLeft className="mr-2 size-4" /> Blueprint Mapping</Button>
                <Button onClick={() => setActiveStep(4)} className="h-12 px-10 rounded-xl font-bold uppercase tracking-widest text-[11px] shadow-sm">Final Sync Review <ChevronRight className="ml-2 size-4" /></Button>
            </div>
          </StepperContent>

          <StepperContent value={4} className="space-y-10 focus-visible:outline-none">
            <Card className="shadow-none border rounded-[2rem] overflow-hidden">
                <CardHeader className="bg-primary/5 border-b py-10 px-12 relative">
                    <div className="absolute top-8 right-12 flex gap-4">
                        <Badge variant="outline" className="h-8 px-4 rounded-xl border-primary/20 bg-background text-primary font-black uppercase tracking-widest text-[10px]">{metadata.mode}</Badge>
                        <Badge variant="outline" className="h-8 px-4 rounded-xl border-primary/20 bg-background text-primary font-black uppercase tracking-widest text-[10px]">{totalMarks} PTS</Badge>
                    </div>
                    <CardTitle className="text-4xl font-black tracking-tighter text-foreground/90 uppercase pr-40">{metadata.title || "Untitled Registry Trace"}</CardTitle>
                    <CardDescription className="text-xs mt-3 font-bold uppercase tracking-[0.3em] text-primary/40 leading-relaxed max-w-2xl">{metadata.description || "No pedagogical context provided."}</CardDescription>
                </CardHeader>
                <CardContent className="p-12 space-y-16">
                    <div className="space-y-8">
                        <h3 className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground/40 flex items-center gap-4">
                            <Separator className="flex-1" /> Protocol Matrix <Separator className="flex-1" />
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="p-6 rounded-[1.5rem] border bg-muted/5 space-y-4 hover:border-primary/20 transition-all">
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-2xl bg-white shadow-sm flex items-center justify-center border border-muted-foreground/10"><CalendarIcon className="size-5 text-primary/60" /></div>
                                    <div className="space-y-0.5">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Execution Date</p>
                                        <p className="text-sm font-bold tracking-tight">{metadata.date ? format(metadata.date, "EEEE, MMMM do") : "Not Scheduled"}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 rounded-[1.5rem] border bg-muted/5 space-y-4 hover:border-primary/20 transition-all">
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-2xl bg-white shadow-sm flex items-center justify-center border border-muted-foreground/10"><Clock className="size-5 text-primary/60" /></div>
                                    <div className="space-y-0.5">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Temporal Window</p>
                                        <p className="text-sm font-bold tracking-tight">{metadata.startTime} — {metadata.endTime} <span className="text-[10px] text-muted-foreground/40 ml-2">({metadata.durationMinutes}m)</span></p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 rounded-[1.5rem] border bg-muted/5 space-y-4 hover:border-primary/20 transition-all">
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-2xl bg-white shadow-sm flex items-center justify-center border border-muted-foreground/10"><Shield className="size-5 text-primary/60" /></div>
                                    <div className="space-y-0.5">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Integrity Vector</p>
                                        <p className="text-sm font-bold tracking-tight">{rules.supervised ? "Proctored" : "Self-paced"} • {rules.browserRestricted ? "Lockdown" : "Open"}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-8">
                        <h3 className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground/40 flex items-center gap-4">
                            <Separator className="flex-1" /> Node Hierarchy <Separator className="flex-1" />
                        </h3>
                        <div className="space-y-4 pr-2 max-h-[600px] overflow-y-auto custom-scrollbar">
                            {questions.map((q, idx) => (
                                <ReviewQuestionCard key={q.id} question={q} index={idx} />
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={() => setActiveStep(3)} className="h-14 px-8 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] text-muted-foreground/40 hover:text-foreground transition-all">Back to Architecture</Button>
                <Button onClick={handleSave} disabled={isSaving} className="h-14 px-12 rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] shadow-xl shadow-primary/20 bg-primary hover:scale-[1.02] active:scale-[0.98] transition-all">
                    {isSaving ? <LoaderCircleIcon className="animate-spin mr-3 size-5" /> : <Save className="mr-3 size-5" />}
                    Sync Registry State
                </Button>
            </div>
          </StepperContent>
        </StepperPanel>
      </Stepper>
    </div>
  );
}
