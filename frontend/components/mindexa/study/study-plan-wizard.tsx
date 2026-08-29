"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Calendar as CalendarIcon,
  Clock,
  BookOpen,
  Layers,
  CheckCircle2,
  Zap,
  Loader2,
  Target,
  Sliders,
  CalendarDays,
  Check,
  X,
  Plus,
  Bell,
  ArrowRight,
  Info,
} from "lucide-react";
import { studentApi, StudentCourseListItem } from "@/lib/api/student";
import { assessmentApi } from "@/lib/api/assessment";
import {
  studyPlannerApi,
  CreateStudyPlanPayload,
  GeneratePlanFromAssessmentPayload,
} from "@/lib/api/study-planner";
import { toast } from "sonner";
import { format, addDays, isBefore } from "date-fns";
import { cn } from "@/lib/utils";

interface StudyPlanWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialAssessmentId?: string;
}

const WEEKDAYS = [
  { id: "Monday", label: "Mon" },
  { id: "Tuesday", label: "Tue" },
  { id: "Wednesday", label: "Wed" },
  { id: "Thursday", label: "Thu" },
  { id: "Friday", label: "Fri" },
  { id: "Saturday", label: "Sat" },
  { id: "Sunday", label: "Sun" },
];

const DURATION_OPTIONS = [
  { value: 30, label: "30m" },
  { value: 45, label: "45m" },
  { value: 60, label: "60m" },
  { value: 90, label: "90m" },
  { value: 120, label: "120m" },
];

const INTENSITY_OPTIONS = [
  {
    value: "Balanced",
    title: "Balanced",
    badge: "Recommended",
    description: "1 topic per session with steady pacing.",
  },
  {
    value: "Small daily sessions",
    title: "Micro-Daily",
    badge: "Consistent",
    description: "Short daily sessions for active recall.",
  },
  {
    value: "Intensive revision",
    title: "Intensive",
    badge: "Fast Pace",
    description: "Accelerated schedule for near-term exams.",
  },
];

export function StudyPlanWizard({
  open,
  onOpenChange,
  onSuccess,
  initialAssessmentId,
}: StudyPlanWizardProps) {
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [courses, setCourses] = useState<StudentCourseListItem[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);

  // Form states
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [studyType, setStudyType] = useState("Assessment Preparation");
  const [courseId, setCourseId] = useState<string>("");
  const [targetMode, setTargetMode] = useState<
    "full_assessment_coverage" | "up_to_learning_unit"
  >("full_assessment_coverage");
  const [targetLearningUnitId, setTargetLearningUnitId] = useState<string>("");
  const [learningUnits, setLearningUnits] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(
    format(addDays(new Date(), 14), "yyyy-MM-dd"),
  );
  const [selectedDays, setSelectedDays] = useState<string[]>([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ]);
  const [blackoutDates, setBlackoutDates] = useState<string[]>([]);
  const [newBlackoutDate, setNewBlackoutDate] = useState<string>("");
  const [timeStart, setTimeStart] = useState("19:00");
  const [timeEnd, setTimeEnd] = useState("21:00");
  const [sessionDuration, setSessionDuration] = useState<number>(60);
  const [dailyGoal, setDailyGoal] = useState("Study 1 topic per session");
  const [preferredDifficulty, setPreferredDifficulty] =
    useState<string>("Balanced");
  const [reminderPref, setReminderPref] = useState<number>(30);
  const [reminderChannels, setReminderChannels] = useState<string[]>([
    "in_app",
    "browser",
  ]);
  const [priority, setPriority] = useState<string>("High");
  const [aiStartDate, setAiStartDate] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [aiEndDate, setAiEndDate] = useState("");

  useEffect(() => {
    if (open) {
      async function loadData() {
        setFetching(true);
        try {
          const [workspaces, assessRes] = await Promise.all([
            studentApi.getWorkspaces().catch(() => []),
            assessmentApi
              .getAssessments({ page: 1, page_size: 50 })
              .catch(() => ({ items: [] })),
          ]);
          setCourses(workspaces || []);

          // Filter out past/ended/completed assessments — students only plan for ACTIVE or UPCOMING assessments
          const rawAssessments = assessRes.items || [];
          const now = new Date();
          const activeUpcoming = rawAssessments.filter((a: any) => {
            const status = (a.student_status || "").toUpperCase();
            const assessStatus = (a.status || "").toUpperCase();
            // Exclude already completed/graded/submitted/terminated
            if (
              [
                "SUBMITTED",
                "COMPLETED",
                "GRADED",
                "TERMINATED",
                "AUTO_SUBMITTED",
              ].includes(status)
            ) {
              return false;
            }
            if (assessStatus === "DRAFT" || assessStatus === "ARCHIVED") {
              return false;
            }
            // Exclude assessments whose submission window has already passed
            if (a.window_end && isBefore(new Date(a.window_end), now)) {
              return false;
            }
            return true;
          });

          // Sort ascending by window start / end date
          activeUpcoming.sort((a: any, b: any) => {
            const dateA = a.window_start || a.window_end || "9999-12-31";
            const dateB = b.window_start || b.window_end || "9999-12-31";
            return new Date(dateA).getTime() - new Date(dateB).getTime();
          });

          setAssessments(activeUpcoming);

          if (
            initialAssessmentId &&
            activeUpcoming.some((a: any) => a.id === initialAssessmentId)
          ) {
            setSelectedAssessmentId(initialAssessmentId);
          } else if (activeUpcoming.length > 0) {
            setSelectedAssessmentId(activeUpcoming[0].id);
          } else {
            setSelectedAssessmentId("");
          }

          if (workspaces && workspaces.length > 0) {
            const wsId = workspaces[0].id;
            studyPlannerApi
              .getLearningUnits(wsId)
              .then(setLearningUnits)
              .catch(() => {});
          }
        } catch (err) {
          console.error("Failed to load data for study plan wizard", err);
        } finally {
          setFetching(false);
        }
      }
      loadData();
    }
  }, [open, initialAssessmentId]);

  // When selected assessment or manual course changes, fetch associated workspace's learning units
  useEffect(() => {
    const selected = assessments.find((a) => a.id === selectedAssessmentId);
    const wsId =
      selected?.teaching_workspace_id ||
      selected?.workspace_id ||
      selected?.course_id ||
      courseId ||
      courses[0]?.id;

    if (wsId) {
      studyPlannerApi
        .getLearningUnits(wsId)
        .then((units) => {
          const list = Array.isArray(units) ? units : [];
          setLearningUnits(list);
          if (list.length > 0) {
            setTargetLearningUnitId(list[list.length - 1].id);
          } else {
            setTargetLearningUnitId("");
          }
        })
        .catch((err) => {
          console.warn("Failed to load learning units for workspace", wsId, err);
          setLearningUnits([]);
        });
    }
  }, [selectedAssessmentId, assessments, courseId, courses]);

  const selectedAssessment = useMemo(() => {
    return assessments.find((a) => a.id === selectedAssessmentId);
  }, [assessments, selectedAssessmentId]);

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const setDayPreset = (preset: "all" | "weekdays" | "weekends") => {
    if (preset === "all") {
      setSelectedDays(WEEKDAYS.map((d) => d.id));
    } else if (preset === "weekdays") {
      setSelectedDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    } else if (preset === "weekends") {
      setSelectedDays(["Saturday", "Sunday"]);
    }
  };

  const toggleChannel = (channel: string) => {
    setReminderChannels((prev) =>
      prev.includes(channel)
        ? prev.filter((c) => c !== channel)
        : [...prev, channel],
    );
  };

  const handleAddBlackoutDate = () => {
    if (!newBlackoutDate) return;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newBlackoutDate)) {
      toast.error("Please enter a valid date in YYYY-MM-DD format");
      return;
    }
    if (!blackoutDates.includes(newBlackoutDate)) {
      setBlackoutDates((prev) => [...prev, newBlackoutDate].sort());
      setNewBlackoutDate("");
    } else {
      toast.info("Date already in blackout list");
    }
  };

  const handleRemoveBlackoutDate = (dateToRemove: string) => {
    setBlackoutDates((prev) => prev.filter((d) => d !== dateToRemove));
  };

  const handleGenerateAiPlan = async () => {
    if (!selectedAssessmentId) {
      toast.error("Please select an upcoming assessment");
      return;
    }
    if (aiEndDate && new Date(aiEndDate) <= new Date(aiStartDate)) {
      toast.error("Plan end date must be strictly after the start date.");
      return;
    }
    setLoading(true);
    try {
      const payload: GeneratePlanFromAssessmentPayload = {
        assessment_id: selectedAssessmentId,
        start_date: aiStartDate
          ? new Date(aiStartDate).toISOString()
          : undefined,
        end_date: aiEndDate ? new Date(aiEndDate).toISOString() : undefined,
        target_mode: targetMode,
        target_learning_unit_id:
          targetMode === "up_to_learning_unit" && targetLearningUnitId
            ? targetLearningUnitId
            : undefined,
        available_days: selectedDays,
        blackout_dates: blackoutDates,
        preferred_time_start: timeStart,
        preferred_time_end: timeEnd,
        session_duration_minutes: sessionDuration,
        daily_goal: dailyGoal,
        preferred_difficulty: preferredDifficulty,
        reminder_preference_minutes: reminderPref,
        reminder_channels: reminderChannels,
        priority: priority,
      };
      const res = await studyPlannerApi.generateFromAssessment(payload);
      if (res.creation_warnings && res.creation_warnings.length > 0) {
        toast.warning(
          `Study plan created with ${res.creation_warnings.length} schedule warnings. Check your dashboard.`,
        );
      } else {
        toast.success("AI Study Plan generated & synced with your syllabus!");
      }
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate AI study plan");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateManualPlan = async () => {
    if (!title.trim()) {
      toast.error("Please provide a study plan title");
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      toast.error("Plan end date must be strictly after the start date.");
      return;
    }
    setLoading(true);
    try {
      const payload: CreateStudyPlanPayload = {
        title: title.trim(),
        study_type: studyType,
        course_id: courseId || undefined,
        target_mode: targetMode,
        target_learning_unit_id:
          targetMode === "up_to_learning_unit" && targetLearningUnitId
            ? targetLearningUnitId
            : undefined,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        available_days: selectedDays,
        blackout_dates: blackoutDates,
        preferred_time_start: timeStart,
        preferred_time_end: timeEnd,
        session_duration_minutes: sessionDuration,
        daily_goal: dailyGoal,
        preferred_difficulty: preferredDifficulty,
        reminder_preference_minutes: reminderPref,
        reminder_channels: reminderChannels,
        priority: priority,
        auto_generate_sessions: true,
      };
      const res = await studyPlannerApi.createManualPlan(payload);
      if (res.creation_warnings && res.creation_warnings.length > 0) {
        toast.warning(
          `Study plan created with ${res.creation_warnings.length} schedule warnings.`,
        );
      } else {
        toast.success("Study plan created successfully!");
      }
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to create study plan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl lg:max-w-3xl max-h-[88vh] flex flex-col p-0 rounded-2xl border border-border/70 bg-card shadow-xl overflow-hidden focus:outline-hidden">
        {/* Sleek Compact Header */}
        <DialogHeader className="px-4 sm:px-5 py-3 shrink-0 bg-background/95 border-b border-border/60">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="size-7 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                {mode === "ai" ? (
                  <Sparkles className="size-3.5" />
                ) : (
                  <Sliders className="size-3.5" />
                )}
              </div>
              <div className="space-y-0.2 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <DialogTitle className="text-sm sm:text-base font-bold text-foreground tracking-tight">
                    Configure Study Plan
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className="text-[9px] font-semibold bg-primary/5 text-primary border-primary/20 px-1.5 py-0"
                  >
                    {mode === "ai" ? "Automated Sync" : "Manual"}
                  </Badge>
                </div>
                <DialogDescription className="text-[11px] text-muted-foreground line-clamp-1">
                  Schedule active study sessions aligned with your course
                  milestones and deadlines.
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="mt-2 grid grid-cols-2 gap-1 p-0.5 bg-muted/50 rounded-lg border border-border/60">
            <button
              type="button"
              onClick={() => setMode("ai")}
              className={cn(
                "py-1.5 px-2 text-[11px] font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                mode === "ai"
                  ? "bg-background text-foreground shadow-2xs font-bold ring-1 ring-border/70"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
              )}
            >
              <Sparkles className="size-3 text-primary" />
              <span>Assessment-Driven (Recommended)</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={cn(
                "py-1.5 px-2 text-[11px] font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                mode === "manual"
                  ? "bg-background text-foreground shadow-2xs font-bold ring-1 ring-border/70"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
              )}
            >
              <Sliders className="size-3" />
              <span>Custom Setup</span>
            </button>
          </div>
        </DialogHeader>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3.5 space-y-3.5">
          {fetching ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" />
              <p className="text-[11px] font-medium">
                Loading active assessments...
              </p>
            </div>
          ) : mode === "ai" ? (
            <div className="space-y-3 animate-in fade-in duration-150">
              {/* Step 1: Active Assessment Selection */}
              <div className="p-3 sm:p-3.5 rounded-xl border border-border/50 bg-card/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Target className="size-3 text-primary" /> 1. Upcoming Target
                    Assessment
                  </span>
                  {assessments.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="text-[9px] font-medium px-1.5 py-0"
                    >
                      {assessments.length} Active
                    </Badge>
                  )}
                </div>

                {assessments.length === 0 ? (
                  <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs space-y-2">
                    <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300 font-medium text-[11px]">
                      <Info className="size-3.5 shrink-0 mt-0.5" />
                      <span>
                        No upcoming assessments found on your schedule. You can
                        switch to <strong>Custom Setup</strong> to build a
                        self-paced plan for any course.
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMode("manual")}
                      className="h-7 text-xs px-2.5 border-amber-500/40 text-amber-800 dark:text-amber-200 cursor-pointer"
                    >
                      Switch to Custom Setup <ArrowRight className="size-3 ml-1" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Select
                      value={selectedAssessmentId}
                      onValueChange={setSelectedAssessmentId}
                    >
                      <SelectTrigger className="h-8.5 text-xs rounded-lg border-border/70 bg-background">
                        <SelectValue placeholder="Choose an active or upcoming assessment..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {assessments.map((a) => (
                          <SelectItem
                            key={a.id}
                            value={a.id}
                            className="text-xs py-1.5"
                          >
                            <div className="flex items-center justify-between gap-2 w-full">
                              <span className="font-medium truncate">
                                {a.title}
                              </span>
                              <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                                {a.course_code || "CAT"} ·{" "}
                                {a.window_start
                                  ? format(new Date(a.window_start), "MMM d")
                                  : "Open"}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Coverage Mode Selection */}
                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <div
                        onClick={() => setTargetMode("full_assessment_coverage")}
                        className={cn(
                          "p-2.5 rounded-lg border text-xs transition-all cursor-pointer flex items-center justify-between gap-1.5",
                          targetMode === "full_assessment_coverage"
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30 text-primary font-bold"
                            : "border-border/60 bg-background text-muted-foreground hover:bg-muted/20",
                        )}
                      >
                        <div className="space-y-0.2 min-w-0">
                          <p className="text-[11px] font-bold text-foreground">
                            Full Syllabus
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            All units for this assessment
                          </p>
                        </div>
                        {targetMode === "full_assessment_coverage" && (
                          <Check className="size-3 text-primary shrink-0" />
                        )}
                      </div>

                      <div
                        onClick={() => setTargetMode("up_to_learning_unit")}
                        className={cn(
                          "p-2.5 rounded-lg border text-xs transition-all cursor-pointer flex items-center justify-between gap-1.5",
                          targetMode === "up_to_learning_unit"
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30 text-primary font-bold"
                            : "border-border/60 bg-background text-muted-foreground hover:bg-muted/20",
                        )}
                      >
                        <div className="space-y-0.2 min-w-0">
                          <p className="text-[11px] font-bold text-foreground">
                            Milestone Target
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            Pace up to a specific unit
                          </p>
                        </div>
                        {targetMode === "up_to_learning_unit" && (
                          <Check className="size-3 text-primary shrink-0" />
                        )}
                      </div>
                    </div>

                    {targetMode === "up_to_learning_unit" && (
                      <div className="pt-1 space-y-1.5 animate-in fade-in duration-150">
                        <Select
                          value={targetLearningUnitId}
                          onValueChange={setTargetLearningUnitId}
                        >
                          <SelectTrigger className="h-8 text-xs rounded-lg border-border/70 bg-background">
                            <SelectValue placeholder={learningUnits.length > 0 ? "Select target milestone unit..." : "No units found"} />
                          </SelectTrigger>
                          <SelectContent className="max-h-48">
                            {learningUnits.map((lu) => (
                              <SelectItem key={lu.id} value={lu.id} className="text-xs">
                                Unit {lu.order_index}: {lu.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: Cadence & Session Duration */}
              <div className="p-3 sm:p-3.5 rounded-xl border border-border/50 bg-card/60 space-y-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sliders className="size-3 text-primary" /> 2. Pace & Session
                  Length
                </span>

                {/* Intensity 3-column selector */}
                <div className="grid grid-cols-3 gap-2">
                  {INTENSITY_OPTIONS.map((opt) => {
                    const active = preferredDifficulty === opt.value;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => setPreferredDifficulty(opt.value)}
                        className={cn(
                          "p-2 rounded-lg border text-left transition-all cursor-pointer space-y-0.5",
                          active
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30 font-bold"
                            : "border-border/60 bg-background text-muted-foreground hover:bg-muted/20",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-foreground">
                            {opt.title}
                          </span>
                          {active && (
                            <Check className="size-2.5 text-primary" />
                          )}
                        </div>
                        <p className="text-[9px] text-muted-foreground leading-tight line-clamp-2">
                          {opt.description}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Duration Chips */}
                <div className="space-y-1 pt-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Session Duration</span>
                    <span className="font-semibold text-primary font-mono">
                      {sessionDuration}m per session
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {DURATION_OPTIONS.map((opt) => {
                      const active = sessionDuration === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSessionDuration(opt.value)}
                          className={cn(
                            "py-1 px-1 rounded-lg text-xs font-semibold border transition-all text-center cursor-pointer",
                            active
                              ? "border-primary bg-primary text-primary-foreground font-bold shadow-2xs"
                              : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Step 3: Dates, Active Days & Time Window */}
              <div className="p-3 sm:p-3.5 rounded-xl border border-border/50 bg-card/60 space-y-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays className="size-3 text-primary" /> 3. Schedule &
                  Days
                </span>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Start Date
                    </Label>
                    <Input
                      type="date"
                      value={aiStartDate}
                      onChange={(e) => setAiStartDate(e.target.value)}
                      className="h-8 text-xs rounded-lg border-border/70 bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Target End Date{" "}
                      <span className="text-[9px] opacity-70">(Optional)</span>
                    </Label>
                    <Input
                      type="date"
                      value={aiEndDate}
                      onChange={(e) => setAiEndDate(e.target.value)}
                      min={aiStartDate}
                      className="h-8 text-xs rounded-lg border-border/70 bg-background"
                    />
                  </div>
                </div>

                {/* Days of Week */}
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">
                      Active Days ({selectedDays.length}/7)
                    </span>
                    <div className="flex items-center gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setDayPreset("weekdays")}
                        className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        Weekdays
                      </button>
                      <button
                        type="button"
                        onClick={() => setDayPreset("all")}
                        className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        All
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((day) => {
                      const active = selectedDays.includes(day.id);
                      return (
                        <button
                          key={day.id}
                          type="button"
                          onClick={() => toggleDay(day.id)}
                          className={cn(
                            "py-1 rounded-md text-[11px] font-bold border transition-all text-center cursor-pointer",
                            active
                              ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/30"
                              : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time Window */}
                <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Session Start Time
                    </Label>
                    <Input
                      type="time"
                      value={timeStart}
                      onChange={(e) => setTimeStart(e.target.value)}
                      className="h-8 text-xs rounded-lg border-border/70 bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Session End Time
                    </Label>
                    <Input
                      type="time"
                      value={timeEnd}
                      onChange={(e) => setTimeEnd(e.target.value)}
                      className="h-8 text-xs rounded-lg border-border/70 bg-background"
                    />
                  </div>
                </div>
              </div>

              {/* Step 4: Blackout Dates & Preferences */}
              <div className="p-3 sm:p-3.5 rounded-xl border border-border/50 bg-card/60 space-y-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Bell className="size-3 text-primary" /> 4. Blackouts & Priority
                </span>

                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>Vacation / Blackout Dates</span>
                    <span className="text-[10px] font-mono">
                      {blackoutDates.length} Blocked
                    </span>
                  </Label>
                  <div className="flex gap-1.5">
                    <Input
                      type="date"
                      value={newBlackoutDate}
                      onChange={(e) => setNewBlackoutDate(e.target.value)}
                      className="h-8 text-xs rounded-lg border-border/70 bg-background"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddBlackoutDate}
                      disabled={!newBlackoutDate}
                      className="h-8 px-2.5 text-xs rounded-lg shrink-0 cursor-pointer"
                    >
                      <Plus className="size-3 mr-1" /> Add
                    </Button>
                  </div>

                  {blackoutDates.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {blackoutDates.map((date) => (
                        <Badge
                          key={date}
                          variant="secondary"
                          className="text-[10px] py-0.5 px-2 rounded-md border border-border/60 bg-background gap-1 font-mono"
                        >
                          <span>{date}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveBlackoutDate(date)}
                            className="hover:text-destructive cursor-pointer"
                          >
                            <X className="size-2.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Reminder
                    </Label>
                    <Select
                      value={String(reminderPref)}
                      onValueChange={(val) => setReminderPref(Number(val))}
                    >
                      <SelectTrigger className="h-8 text-xs rounded-lg border-border/70 bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15" className="text-xs">15 mins before</SelectItem>
                        <SelectItem value="30" className="text-xs">30 mins before</SelectItem>
                        <SelectItem value="60" className="text-xs">1 hour before</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Priority
                    </Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger className="h-8 text-xs rounded-lg border-border/70 bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="High" className="text-xs">High Focus</SelectItem>
                        <SelectItem value="Medium" className="text-xs">Medium</SelectItem>
                        <SelectItem value="Low" className="text-xs">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 animate-in fade-in duration-150">
              {/* Manual Mode Form */}
              <div className="p-3 sm:p-3.5 rounded-xl border border-border/50 bg-card/60 space-y-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <BookOpen className="size-3 text-primary" /> 1. Plan Title & Course
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Plan Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Database Systems Exam Prep"
                      className="h-8 text-xs rounded-lg border-border/70 bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Associated Course
                    </Label>
                    <Select value={courseId} onValueChange={setCourseId}>
                      <SelectTrigger className="h-8 text-xs rounded-lg border-border/70 bg-background">
                        <SelectValue placeholder="Select course workspace..." />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            {c.code} - {c.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Study Type
                    </Label>
                    <Select value={studyType} onValueChange={setStudyType}>
                      <SelectTrigger className="h-8 text-xs rounded-lg border-border/70 bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Assessment Preparation" className="text-xs">
                          Assessment Prep
                        </SelectItem>
                        <SelectItem value="Homework" className="text-xs">Homework</SelectItem>
                        <SelectItem value="General Revision" className="text-xs">
                          General Revision
                        </SelectItem>
                        <SelectItem value="Weekly Learning" className="text-xs">
                          Weekly Learning
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Daily Target Goal
                    </Label>
                    <Input
                      value={dailyGoal}
                      onChange={(e) => setDailyGoal(e.target.value)}
                      placeholder="e.g. Master 1 module per session"
                      className="h-8 text-xs rounded-lg border-border/70 bg-background"
                    />
                  </div>
                </div>
              </div>

              {/* Manual Dates & Schedule */}
              <div className="p-3 sm:p-3.5 rounded-xl border border-border/50 bg-card/60 space-y-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays className="size-3 text-primary" /> 2. Dates & Schedule
                </span>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Start Date</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="h-8 text-xs rounded-lg border-border/70 bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">End Date</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate}
                      className="h-8 text-xs rounded-lg border-border/70 bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 pt-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Available Days</span>
                    <button
                      type="button"
                      onClick={() => setDayPreset("weekdays")}
                      className="text-[10px] text-primary hover:underline cursor-pointer"
                    >
                      Set Weekdays
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((day) => {
                      const active = selectedDays.includes(day.id);
                      return (
                        <button
                          key={day.id}
                          type="button"
                          onClick={() => toggleDay(day.id)}
                          className={cn(
                            "py-1 rounded-md text-[11px] font-bold border transition-all text-center cursor-pointer",
                            active
                              ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/30"
                              : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Time Window</Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="time"
                        value={timeStart}
                        onChange={(e) => setTimeStart(e.target.value)}
                        className="h-8 text-xs rounded-lg border-border/70 bg-background"
                      />
                      <span className="text-[10px] text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={timeEnd}
                        onChange={(e) => setTimeEnd(e.target.value)}
                        className="h-8 text-xs rounded-lg border-border/70 bg-background"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Duration</Label>
                    <div className="grid grid-cols-5 gap-1">
                      {DURATION_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSessionDuration(opt.value)}
                          className={cn(
                            "py-1 rounded-md text-[11px] font-bold border transition-all text-center cursor-pointer",
                            sessionDuration === opt.value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Compact Sticky Footer */}
        <div className="px-4 sm:px-5 py-2.5 bg-background/95 border-t border-border/60 shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground min-w-0">
            <span className="font-semibold text-foreground shrink-0">
              {sessionDuration}m · {selectedDays.length}d/wk
            </span>
            {mode === "ai" && selectedAssessment && (
              <>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline truncate max-w-[200px] text-muted-foreground">
                  {selectedAssessment.course_code || selectedAssessment.title}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="h-7.5 px-3 text-xs rounded-lg border-border/70 cursor-pointer"
            >
              Cancel
            </Button>
            {mode === "ai" ? (
              <Button
                size="sm"
                onClick={handleGenerateAiPlan}
                disabled={loading || !selectedAssessmentId}
                className="h-7.5 px-3.5 text-xs font-bold rounded-lg shadow-2xs gap-1.5 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3" />
                )}
                <span>Generate Plan</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleCreateManualPlan}
                disabled={loading || !title.trim()}
                className="h-7.5 px-3.5 text-xs font-bold rounded-lg shadow-2xs gap-1.5 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3" />
                )}
                <span>Create Plan</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
