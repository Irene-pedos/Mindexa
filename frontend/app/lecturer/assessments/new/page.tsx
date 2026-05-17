// app/lecturer/assessments/new/page.tsx
"use client";

import React, { useState, useMemo, useEffect } from "react";
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
  Loader2 as LoaderCircleIcon,
  Calendar as CalendarIcon,
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
  ClassGroupResponse 
} from "@/lib/api/lecturer";
import { QuestionBankSelector } from "@/components/mindexa/assessment/question-bank-selector";
import { QuestionBankItem } from "@/lib/api/question";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

type AssessmentMode = "Practice" | "Formative" | "Homework" | "CAT" | "Summative" | "Groupwork";
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

const STEPS = [
  { title: "Metadata", icon: FileText },
  { title: "Blueprint", icon: Layout },
  { title: "Questions", icon: BrainCircuit },
  { title: "Review", icon: Eye },
  { title: "Publish", icon: CheckCircle2 },
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

  // Step 1: Metadata
  const [metadata, setMetadata] = useState({
    title: "",
    description: "",
    mode: "CAT" as AssessmentMode,
    institution_id: "",
    department_ids: [] as string[],
    option_ids: [] as string[],
    class_group_ids: [] as string[],
    course_id: "",
    subject_id: "",
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
    maxGroupSize: 4,
    groupFormation: "self_enrol" as "self_enrol" | "manual",
  });

  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  // Metadata dropdown options
  const [institutions, setInstitutions] = useState<InstitutionResponse[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<DepartmentResponse[]>([]);
  const [availableOptions, setAvailableOptions] = useState<OptionResponse[]>([]);
  const [availableClasses, setAvailableClasses] = useState<ClassGroupResponse[]>([]);
  
  const [fetchingMetadata, setFetchingMetadata] = useState(true);
  const [fetchingDepts, setFetchingDepts] = useState(false);
  const [fetchingOptions, setFetchingOptions] = useState(false);
  const [fetchingClasses, setFetchingClasses] = useState(false);

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
    resultRelease: "manual" as "immediate" | "manual",
    attempts: 1,
    passwordProtected: false,
    accessPassword: "",
    latePenaltyPercent: 0,
    gracePeriodMinutes: 0,
    autosaveToken: typeof window !== 'undefined' ? crypto.randomUUID() : undefined,
  });

  // Step 3: Question Creation
  const [questions, setQuestions] = useState<Question[]>([]);

  // Update result release mode based on question types
  useEffect(() => {
    const hasOpenQuestions = questions.some(q => 
      ["essay", "shortanswer", "computational", "casestudy"].includes(q.type)
    );
    setRules(prev => ({
      ...prev,
      resultRelease: hasOpenQuestions ? "delayed" : "immediate"
    }));
  }, [questions]);

  // Set default late penalty for homework
  useEffect(() => {
    if (metadata.mode === "Homework") {
      setRules(prev => ({ ...prev, latePenaltyPercent: 20 }));
    } else {
      setRules(prev => ({ ...prev, latePenaltyPercent: 0 }));
    }
  }, [metadata.mode]);

  useEffect(() => {
    async function fetchCourses() {
      setIsLoadingCourses(true);
      try {
        const response = await lecturerApi.getCourses();
        setCourses(response.items);
      } catch (error) {
        console.error("Failed to fetch courses", error);
        toast.error("Failed to load your courses. Please try again.");
      } finally {
        setIsLoadingCourses(false);
      }
    }
    fetchCourses();
  }, []);

  useEffect(() => {
    async function loadMetadata() {
      try {
        const insts = await lecturerApi.getMyInstitutions();
        setInstitutions(insts);
        
        // Auto-select if there is exactly one institution
        if (insts.length === 1) {
          handleInstitutionChange(insts[0].id);
        }
      } catch (err: any) {
        console.error("Failed to fetch institutions", err);
        toast.error("Failed to load metadata");
      } finally {
        setFetchingMetadata(false);
      }
    }
    loadMetadata();
  }, []);

  const handleInstitutionChange = async (val: string) => {
    setMetadata(prev => ({ ...prev, institution_id: val, department_ids: [], option_ids: [], class_group_ids: [] }));
    setAvailableDepartments([]);
    setAvailableOptions([]);
    setAvailableClasses([]);
    
    setFetchingDepts(true);
    try {
      const depts = await lecturerApi.getMyDepartments(val);
      setAvailableDepartments(depts);
    } catch (err) {
      toast.error("Failed to load departments");
    } finally {
      setFetchingDepts(false);
    }
  };

  const toggleDept = async (id: string) => {
    const newSelected = metadata.department_ids.includes(id) 
      ? metadata.department_ids.filter(i => i !== id)
      : [...metadata.department_ids, id];
    
    setMetadata(p => ({ ...p, department_ids: newSelected, option_ids: [], class_group_ids: [] }));
    setAvailableOptions([]);
    setAvailableClasses([]);
    
    if (newSelected.length > 0) {
      setFetchingOptions(true);
      try {
        const allOptions = await Promise.all(
          newSelected.map(dId => lecturerApi.getMyOptions(dId))
        );
        setAvailableOptions(allOptions.flat());
      } catch (err) {
        toast.error("Failed to load options");
      } finally {
        setFetchingOptions(false);
      }
    }
  };

  const toggleOption = async (id: string) => {
    const newSelected = metadata.option_ids.includes(id)
      ? metadata.option_ids.filter(i => i !== id)
      : [...metadata.option_ids, id];
    
    setMetadata(p => ({ ...p, option_ids: newSelected, class_group_ids: [] }));
    setAvailableClasses([]);
    
    if (newSelected.length > 0) {
      setFetchingClasses(true);
      try {
        const allClasses = await Promise.all(
          newSelected.map(oId => lecturerApi.getMyClasses(oId))
        );
        setAvailableClasses(allClasses.flat());
      } catch (err) {
        toast.error("Failed to load classes");
      } finally {
        setFetchingClasses(false);
      }
    }
  };

  const toggleClass = (id: string) => {
    setMetadata(p => ({
      ...p,
      class_group_ids: p.class_group_ids.includes(id) 
        ? p.class_group_ids.filter(i => i !== id) 
        : [...p.class_group_ids, id]
    }));
  };

  useEffect(() => {
    if (draftId) {
      loadDraft(draftId);
    }
  }, [draftId]);

  const loadDraft = async (id: string) => {
    setIsLoadingDraft(true);
    try {
      const res = await assessmentApi.getAssessmentById(id) as any;
      
      // Map Metadata
      const modeMap: Record<string, AssessmentMode> = {
        "FORMATIVE": "Formative",
        "HOMEWORK": "Homework",
        "CAT": "CAT",
        "SUMMATIVE": "Summative",
        "GROUP_WORK": "Groupwork",
      };

      const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      };

      setMetadata({
        title: res.title || "",
        description: res.description || "",
        mode: modeMap[res.assessment_type] || "CAT",
        institution_id: "", 
        department_ids: [],
        option_ids: [],
        class_group_ids: [],
        course_id: res.course_id || "",
        subject_id: res.subject_id || "",
        date: res.window_start ? new Date(res.window_start) : undefined,
        startTime: res.window_start ? formatTime(res.window_start) : "09:00",
        endTime: res.window_end ? formatTime(res.window_end) : "11:00",
        durationMinutes: res.duration_minutes || 120,
        passing_marks: res.passing_marks || 50,
        selectedInstructions: [], // instructions are merged in backend, we'll put them in custom
        customInstructions: res.instructions || "",
        maxGroupSize: res.max_group_size || 4,
        groupFormation: res.group_formation_mode || "self_enrol",
      });

      // Map Blueprint
      if (res.sections && res.sections.length > 0) {
        setBlueprint(res.sections.map((s: any) => ({
          id: s.id,
          section: s.title,
          topics: s.description || "",
          marks: s.allocated_marks || 0,
          questions: s.question_count_target || 0,
          difficulty: "Medium",
          allowedTypes: s.allowed_question_types?.types || ["mcq"]
        })));
      }

      // Map Rules
      setRules({
        openBook: res.is_open_book,
        supervised: res.is_supervised,
        aiAllowed: res.ai_assistance_allowed,
        browserRestricted: res.fullscreen_required,
        shuffleQuestions: res.randomise_questions,
        shuffleOptions: res.randomise_options,
        resultRelease: res.result_release_mode === "immediate" ? "immediate" : "delayed",
        resultReleaseAt: res.result_release_at ? new Date(res.result_release_at) : undefined,
        attempts: res.max_attempts || 1,
        passwordProtected: res.is_password_protected || false,
        accessPassword: "", // Hashed in backend
        latePenaltyPercent: res.late_penalty_percent || 0,
        gracePeriodMinutes: res.grace_period_minutes || 0,
        autosaveToken: res.autosave_token || crypto.randomUUID(),
      });

      // Map Questions
      if (res.assessment_questions && res.assessment_questions.length > 0) {
        setQuestions(res.assessment_questions.map((aq: any) => ({
          id: aq.id,
          sectionId: aq.section_id,
          text: aq.question.content,
          type: aq.question.question_type.toLowerCase().replace("_", ""),
          marks: aq.marks,
          options: aq.question.options.map((opt: any) => ({
            id: opt.id,
            option_text: opt.option_text,
            option_text_right: opt.option_text_right,
            is_correct: opt.is_correct,
            order_index: opt.order_index
          })),
          aiGenerated: aq.added_via === "ai_generated"
        })));
      }

      toast.success("Draft loaded successfully");
    } catch (error: any) {
      toast.error("Failed to load draft: " + error.message);
    } finally {
      setIsLoadingDraft(false);
    }
  };

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

  const handleBankSelect = async (qBankSummary: QuestionBankItem, sectionId: string) => {
    try {
      const qBank = await questionApi.getQuestion(qBankSummary.id);
      const mappedType = qBank.question_type.toLowerCase().replace("_", "") as QuestionType;
      
      setQuestions((prev) => [
        ...prev,
        {
          id: `q-bank-${qBank.id}-${Date.now()}`,
          sectionId,
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

  const preparePayload = () => {
    const payload = { 
      id: draftId || undefined, 
      metadata: { ...metadata }, 
      blueprint, 
      questions, 
      rules 
    };

    const parseTimeString = (timeStr: string, baseDate: Date) => {
      const d = new Date(baseDate);
      let [time, modifier] = timeStr.trim().split(/\s+/);
      const [h, m] = time.split(':');
      let hours = parseInt(h);
      const minutes = parseInt(m);
      
      if (modifier) {
        modifier = modifier.toLowerCase();
        if (modifier === 'pm' && hours < 12) hours += 12;
        if (modifier === 'am' && hours === 12) hours = 0;
      } else if (timeStr.toLowerCase().includes('pm')) {
        if (hours < 12) hours += 12;
      } else if (timeStr.toLowerCase().includes('am')) {
        if (hours === 12) hours = 0;
      }
      
      d.setHours(hours, minutes, 0, 0);
      return d;
    };

    // Fix AM/PM issue by combining date and time on frontend
    if (metadata.date && metadata.startTime) {
      const start = parseTimeString(metadata.startTime, metadata.date);
      (payload.metadata as any).windowStart = start.toISOString();
    }

    if (metadata.date && metadata.endTime) {
      const end = parseTimeString(metadata.endTime, metadata.date);
      (payload.metadata as any).windowEnd = end.toISOString();
    }

    return payload;
  };

  const formatDisplayTime = (timeStr: string) => {
    if (!timeStr) return "";
    try {
      const [h, m] = timeStr.split(':');
      const d = new Date();
      d.setHours(parseInt(h), parseInt(m));
      return format(d, "h:mm a");
    } catch (e) {
      return timeStr;
    }
  };

  const handleSaveDraft = async () => {
    if (isSavingDraft || isPublishing) return;
    setIsSavingDraft(true);
    try {
      const res = await apiClient("/assessments/draft", {
        method: "POST",
        body: JSON.stringify(preparePayload()),
      }) as { assessment_id: string };
      
      toast.success("Draft saved successfully");
      
      // If this was a new assessment, update the URL to include the draft ID
      if (!draftId && res.assessment_id) {
        router.replace(`/lecturer/assessments/new?draft=${res.assessment_id}`);
      }
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
        difficulty: "MEDIUM",
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
      const payload = preparePayload();
      const result = await apiClient("/assessments/publish", {
        method: "POST",
        body: JSON.stringify(payload),
      }) as { validation_passed: boolean; errors?: string[] };
      
      if (result.validation_passed) {
        toast.success("Assessment published successfully!");
        router.push("/lecturer/assessments");
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

  if (isLoadingDraft || isLoadingCourses) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <LoaderCircleIcon className="size-12 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">
          {isLoadingDraft ? "Loading draft assessment..." : "Loading courses..."}
        </p>
      </div>
    );
  }

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
              <CardContent className="space-y-6 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
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
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Course / Module</Label>
                    <Select
                      value={metadata.course_id}
                      onValueChange={(v) => setMetadata({ ...metadata, course_id: v })}
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
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assessment Description</Label>
                  <Textarea
                    value={metadata.description}
                    onChange={(e) =>
                      setMetadata({ ...metadata, description: e.target.value })
                    }
                    placeholder="Brief overview of the assessment goals and coverage..."
                    className="min-h-[80px]"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t">
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
                        <SelectItem value="CAT">CAT</SelectItem>
                        <SelectItem value="Summative">Summative</SelectItem>
                        <SelectItem value="Homework">Homework</SelectItem>
                        <SelectItem value="Formative">Formative</SelectItem>
                        <SelectItem value="Practice">Practice</SelectItem>
                        <SelectItem value="Groupwork">Groupwork</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Date</Label>
                    <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal h-9 px-3",
                            !metadata.date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {metadata.date ? format(metadata.date, "PPP") : <span>Pick a date</span>}
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
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Start Time</Label>
                    <Input
                      type="time"
                      value={metadata.startTime}
                      onChange={(e) => setMetadata({ ...metadata, startTime: e.target.value })}
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">End Time</Label>
                    <Input
                      type="time"
                      value={metadata.endTime}
                      onChange={(e) => setMetadata({ ...metadata, endTime: e.target.value })}
                      className="h-9"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Target Academic Hierarchy</Label>
                    {fetchingMetadata || fetchingDepts || fetchingOptions || fetchingClasses ? (
                      <LoaderCircleIcon className="size-4 animate-spin text-primary" />
                    ) : null}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] text-muted-foreground">Departments</Label>
                      <ScrollArea className="h-[120px] rounded-md border p-2 bg-muted/10">
                        <div className="space-y-1">
                          {availableDepartments.map(dept => (
                            <div key={dept.id} className="flex items-center space-x-2">
                              <Checkbox 
                                id={`dept-${dept.id}`} 
                                checked={metadata.department_ids.includes(dept.id)}
                                onCheckedChange={() => toggleDept(dept.id)}
                              />
                              <label htmlFor={`dept-${dept.id}`} className="text-[11px] cursor-pointer truncate">
                                {dept.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] text-muted-foreground">Options</Label>
                      <ScrollArea className="h-[120px] rounded-md border p-2 bg-muted/10">
                        <div className="space-y-1">
                          {availableOptions.map(opt => (
                            <div key={opt.id} className="flex items-center space-x-2">
                              <Checkbox 
                                id={`opt-${opt.id}`} 
                                checked={metadata.option_ids.includes(opt.id)}
                                onCheckedChange={() => toggleOption(opt.id)}
                              />
                              <label htmlFor={`opt-${opt.id}`} className="text-[11px] cursor-pointer truncate">
                                {opt.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] text-muted-foreground">Classes</Label>
                      <ScrollArea className="h-[120px] rounded-md border p-2 bg-muted/10">
                        <div className="space-y-1">
                          {availableClasses.map(cls => (
                            <div 
                              key={cls.id} 
                              onClick={() => toggleClass(cls.id)}
                              className={cn(
                                "flex items-center justify-between p-1.5 px-2 rounded border cursor-pointer text-[11px]",
                                metadata.class_group_ids.includes(cls.id) 
                                  ? "bg-primary/10 border-primary text-primary" 
                                  : "hover:bg-muted"
                              )}
                            >
                              <span className="truncate">{cls.name}</span>
                              {metadata.class_group_ids.includes(cls.id) && <Check className="size-3" />}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assessment Instructions</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {availableInstructions.map((instr) => (
                        <div
                          key={instr}
                          className={cn(
                            "flex items-center space-x-2 border rounded-lg p-2 cursor-pointer transition-colors hover:bg-muted/30",
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
                          <Checkbox checked={metadata.selectedInstructions.includes(instr)} className="size-3" />
                          <span className="text-[10px] font-medium">{instr}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Passing Marks</Label>
                        <Input
                          type="number"
                          value={metadata.passing_marks}
                          onChange={(e) =>
                            setMetadata({
                              ...metadata,
                              passing_marks: parseInt(e.target.value) || 0,
                            })
                          }
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Duration (Min)</Label>
                        <Input
                          type="number"
                          value={metadata.durationMinutes}
                          onChange={(e) =>
                            setMetadata({
                              ...metadata,
                              durationMinutes: parseInt(e.target.value) || 0,
                            })
                          }
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Custom Instructions</Label>
                      <Textarea 
                        placeholder="Any additional rules not covered by the presets..."
                        className="min-h-[80px]"
                        value={metadata.customInstructions}
                        onChange={(e) => setMetadata({ ...metadata, customInstructions: e.target.value })}
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
                  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Shield className="size-5 text-primary" /> Environment & Policy</CardTitle></CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      {[
                        { key: "supervised", label: "Proctored", desc: "Live monitoring enabled" },
                        { key: "browserRestricted", label: "Safe Browser", desc: "Forces fullscreen" },
                      ].map((item) => (
                        <div key={item.key} className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5"><Label>{item.label}</Label><p className="text-xs text-muted-foreground">{item.desc}</p></div>
                          <Switch checked={(rules as any)[item.key]} onCheckedChange={(v) => setRules({ ...rules, [item.key]: v })} />
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3 pt-4 border-t">
                      <Label className="text-xs uppercase text-muted-foreground">Result Release Mode</Label>
                      <Select
                        value={rules.resultRelease}
                        onValueChange={(v: "immediate" | "delayed") => setRules({ ...rules, resultRelease: v })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediate">Immediate (Auto-grade)</SelectItem>
                          <SelectItem value="delayed">Manual (Upload after grading)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground italic">
                        {rules.resultRelease === "delayed" 
                          ? "Students will be notified when you finalize the grading." 
                          : "Results released as soon as student submits."}
                      </p>
                    </div>

                    <div className="pt-4 border-t">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-4">
                        Additional Configuration <ChevronDown className="size-3" />
                      </Label>
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5"><Label>AI Allowed</Label><p className="text-[10px] text-muted-foreground">Allow LLM tools during exam</p></div>
                          <Switch checked={rules.aiAllowed} onCheckedChange={(v) => setRules({ ...rules, aiAllowed: v })} />
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5"><Label>Open Book</Label><p className="text-[10px] text-muted-foreground">Reference materials allowed</p></div>
                          <Switch checked={rules.openBook} onCheckedChange={(v) => setRules({ ...rules, openBook: v })} />
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5"><Label>Randomize Questions</Label><p className="text-[10px] text-muted-foreground">Shuffle order per student</p></div>
                          <Switch checked={rules.shuffleQuestions} onCheckedChange={(v) => setRules({ ...rules, shuffleQuestions: v })} />
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5"><Label>Randomize Options</Label><p className="text-[10px] text-muted-foreground">Shuffle MCQ options</p></div>
                          <Switch checked={rules.shuffleOptions} onCheckedChange={(v) => setRules({ ...rules, shuffleOptions: v })} />
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5"><Label>Password Protected</Label><p className="text-[10px] text-muted-foreground">Require code to start</p></div>
                          <Switch checked={rules.passwordProtected} onCheckedChange={(v) => setRules({ ...rules, passwordProtected: v })} />
                        </div>
                        
                        {rules.passwordProtected && (
                          <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                            <Input 
                              type="text" 
                              placeholder="Access code..." 
                              value={rules.accessPassword}
                              onChange={(e) => setRules({ ...rules, accessPassword: e.target.value })}
                              className="h-8 text-xs"
                            />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase text-muted-foreground">Max Attempts</Label>
                            <Input 
                              type="number" 
                              min={1}
                              value={rules.attempts}
                              onChange={(e) => setRules({ ...rules, attempts: parseInt(e.target.value) || 1 })}
                              className="h-8 text-xs"
                            />
                          </div>
                          {metadata.mode === "Homework" && (
                            <div className="space-y-2">
                              <Label className="text-[10px] uppercase text-muted-foreground">Late Penalty %</Label>
                              <Input 
                                type="number" 
                                min={0}
                                max={100}
                                value={rules.latePenaltyPercent}
                                onChange={(e) => setRules({ ...rules, latePenaltyPercent: parseFloat(e.target.value) || 0 })}
                                className="h-8 text-xs"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
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
                      <Button variant="outline" className="flex-1 h-20 rounded-2xl border-2 hover:bg-muted/50 hover:border-primary/50 transition-all" onClick={() => addQuestion(sec.id)}>
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
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-3xl font-bold">{metadata.title || "Untitled Assessment"}</h2>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><CalendarIcon className="size-4" /> {metadata.date ? format(metadata.date, "PPP") : "No date set"}</span>
                      <span className="flex items-center gap-1"><Clock className="size-4" /> {formatDisplayTime(metadata.startTime)} - {formatDisplayTime(metadata.endTime)} ({metadata.durationMinutes} mins)</span>
                      <span className="flex items-center gap-1"><FileText className="size-4" /> {metadata.mode}</span>
                    </div>
                  </div>
                  
                  {/* Target Groups Summary */}
                  <div className="flex flex-wrap gap-2">
                    {metadata.class_group_ids.map(id => {
                      const cls = availableClasses.find(c => c.id === id);
                      return cls ? (
                        <Badge key={id} variant="secondary" className="bg-primary/5 text-primary border-primary/10">
                          {cls.name}
                        </Badge>
                      ) : null;
                    })}
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
                <p className="text-muted-foreground">
                  Scheduled for <strong>{metadata.date ? format(metadata.date, "PPP") : "Unscheduled"}</strong> 
                  <br />
                  From <strong>{formatDisplayTime(metadata.startTime)}</strong> to <strong>{formatDisplayTime(metadata.endTime)}</strong>.
                </p>
                {metadata.mode === "Homework" && rules.latePenaltyPercent > 0 && (
                  <p className="text-xs text-amber-600 font-medium">
                    Late submission penalty of {rules.latePenaltyPercent}% enabled.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Passing Marks: <strong>{metadata.passing_marks}</strong> • Mode: <strong>{rules.resultRelease === 'immediate' ? 'Immediate' : 'Manual'}</strong>
                </p>
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
