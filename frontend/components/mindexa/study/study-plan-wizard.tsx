"use client";

import React, { useEffect, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  Calendar as CalendarIcon,
  Clock,
  BookOpen,
  Layers,
  CheckCircle2,
  Zap,
  ArrowRight,
  Loader2,
  ShieldAlert,
  Target,
  Sliders,
  CalendarDays,
  Check,
} from "lucide-react";
import { studentApi, StudentCourseListItem } from "@/lib/api/student";
import { assessmentApi } from "@/lib/api/assessment";
import {
  studyPlannerApi,
  CreateStudyPlanPayload,
  GeneratePlanFromAssessmentPayload,
} from "@/lib/api/study-planner";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

interface StudyPlanWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialAssessmentId?: string;
}

export function StudyPlanWizard({
  open,
  onOpenChange,
  onSuccess,
  initialAssessmentId,
}: StudyPlanWizardProps) {
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<StudentCourseListItem[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);

  // Form states
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [studyType, setStudyType] = useState("Assessment Preparation");
  const [courseId, setCourseId] = useState<string>("");
  const [targetMode, setTargetMode] = useState<"full_assessment_coverage" | "up_to_learning_unit">("full_assessment_coverage");
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
  const [blackoutDatesInput, setBlackoutDatesInput] = useState<string>("");
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
  // AI-mode-specific date overrides (empty end date = use assessment window)
  const [aiStartDate, setAiStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [aiEndDate, setAiEndDate] = useState("");

  useEffect(() => {
    if (open) {
      async function loadData() {
        try {
          const [workspaces, assessRes] = await Promise.all([
            studentApi.getWorkspaces().catch(() => []),
            assessmentApi
              .getAssessments({ page: 1, page_size: 20 })
              .catch(() => ({ items: [] })),
          ]);
          setCourses(workspaces || []);
          setAssessments(assessRes.items || []);

          if (initialAssessmentId) {
            setSelectedAssessmentId(initialAssessmentId);
          } else if (assessRes.items && assessRes.items.length > 0) {
            setSelectedAssessmentId(assessRes.items[0].id);
          }
          if (workspaces && workspaces.length > 0) {
            const wsId = workspaces[0].id;
            studyPlannerApi.getLearningUnits(wsId).then(setLearningUnits).catch(() => {});
          }
        } catch (err) {
          console.error(err);
        }
      }
      loadData();
    }
  }, [open, initialAssessmentId]);

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const toggleChannel = (channel: string) => {
    setReminderChannels((prev) =>
      prev.includes(channel)
        ? prev.filter((c) => c !== channel)
        : [...prev, channel],
    );
  };

  const parseBlackoutDates = (): string[] => {
    if (!blackoutDatesInput.trim()) return [];
    const raw = blackoutDatesInput
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    const valid: string[] = [];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    for (const d of raw) {
      if (!dateRegex.test(d)) {
        throw new Error(`Invalid blackout date format: ${d}`);
      }
      valid.push(d);
    }
    return valid;
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
        start_date: aiStartDate ? new Date(aiStartDate).toISOString() : undefined,
        end_date: aiEndDate ? new Date(aiEndDate).toISOString() : undefined,
        target_mode: targetMode,
        target_learning_unit_id: targetMode === "up_to_learning_unit" && targetLearningUnitId ? targetLearningUnitId : undefined,
        available_days: selectedDays,
        blackout_dates: parseBlackoutDates(),
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
          `Study plan created with ${res.creation_warnings.length} schedule conflict warnings. Review schedule conflicts on your dashboard.`
        );
      } else {
        toast.success(
          "AI Study Plan generated and synchronized with your calendar!"
        );
      }
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate AI plan");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateManualPlan = async () => {
    if (!title) {
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
        title,
        study_type: studyType,
        course_id: courseId || undefined,
        target_mode: targetMode,
        target_learning_unit_id: targetMode === "up_to_learning_unit" && targetLearningUnitId ? targetLearningUnitId : undefined,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        available_days: selectedDays,
        blackout_dates: parseBlackoutDates(),
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
          `Study plan created with ${res.creation_warnings.length} schedule conflict warnings. Review schedule conflicts on your dashboard.`
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
      <DialogContent className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl w-full max-h-[92vh] flex flex-col p-0 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Dialog Header */}
        <DialogHeader className="px-6 py-3.5 shrink-0 bg-background">
          <div className="space-y-0.5 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                Configure AI Study Plan
              </DialogTitle>
              <Badge variant="secondary" className="text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 py-0.5 px-2">
                Smart Planner
              </Badge>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Build a personalized study schedule integrated with your courses, assessments, and notifications.
            </DialogDescription>
          </div>
        </DialogHeader>
        <Separator />

        {/* Scrollable Container Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-muted/40 rounded-xl border border-border/60">
            <button
              type="button"
              onClick={() => setMode("ai")}
              className={`py-3 px-4 text-xs font-bold rounded-lg flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                mode === "ai"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Sparkles className="size-4" />
              <span>Generate from Assessment (1-Click AI)</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`py-3 px-4 text-xs font-bold rounded-lg flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                mode === "manual"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Layers className="size-4" />
              <span>Manual Setup Wizard</span>
            </button>
          </div>

          {mode === "ai" ? (
            <div className="space-y-6 pt-2">
              {/* Hero Banner */}
              <div className="p-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-primary">
                  <Zap className="size-4 animate-pulse" /> Smart Assessment Engine
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  AI will analyze your upcoming assessment schedule, extract course topics & materials, and build an optimized daily study plan automatically calibrated to your target goals.
                </p>
              </div>

              {/* Grid Section 1: Assessment & Curriculum Goal */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Target Assessment */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <Target className="size-3.5 text-primary" /> 1. Target Assessment <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={selectedAssessmentId}
                    onValueChange={setSelectedAssessmentId}
                  >
                    <SelectTrigger className="h-10 text-xs rounded-xl border-border/60 bg-background">
                      <SelectValue placeholder="Choose an upcoming CAT or exam..." />
                    </SelectTrigger>
                    <SelectContent>
                      {assessments.map((a) => (
                        <SelectItem key={a.id} value={a.id} className="text-xs">
                          {a.title} ({a.course_code || "CAT"}) - Opens{" "}
                          {a.window_start
                            ? format(new Date(a.window_start), "MMM d")
                            : "Soon"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Select the assessment you are preparing for.
                  </p>
                </div>

                {/* Study Pace / Intensity */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <Sliders className="size-3.5 text-primary" /> 2. Study Intensity & Pace
                  </Label>
                  <Select
                    value={preferredDifficulty}
                    onValueChange={setPreferredDifficulty}
                  >
                    <SelectTrigger className="h-10 text-xs rounded-xl border-border/60 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Balanced" className="text-xs">Balanced Pace (Standard)</SelectItem>
                      <SelectItem value="Small daily sessions" className="text-xs">
                        Small Light Sessions (Consistent)
                      </SelectItem>
                      <SelectItem value="Intensive revision" className="text-xs">
                        Intensive Bootcamp (Fast)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Choose how aggressively to space your study sessions.
                  </p>
                </div>
              </div>

              {/* Target Curriculum Goal */}
              <div className="space-y-3 p-4 rounded-xl border border-primary/15 bg-primary/5">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <BookOpen className="size-3.5 text-primary" /> Target Curriculum Coverage Goal
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTargetMode("full_assessment_coverage")}
                    className={`p-3 rounded-xl text-xs text-left font-semibold border transition-all cursor-pointer ${
                      targetMode === "full_assessment_coverage"
                        ? "border-primary bg-primary/15 text-primary font-bold shadow-xs ring-1 ring-primary/30"
                        : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>Full Assessment Coverage</span>
                      {targetMode === "full_assessment_coverage" && <Check className="size-3.5 text-primary" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">Prepare for all materials included in this assessment</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetMode("up_to_learning_unit")}
                    className={`p-3 rounded-xl text-xs text-left font-semibold border transition-all cursor-pointer ${
                      targetMode === "up_to_learning_unit"
                        ? "border-primary bg-primary/15 text-primary font-bold shadow-xs ring-1 ring-primary/30"
                        : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>Up to Specific Unit</span>
                      {targetMode === "up_to_learning_unit" && <Check className="size-3.5 text-primary" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">Cover topics from Unit 1 up to a selected target unit</div>
                  </button>
                </div>

                {targetMode === "up_to_learning_unit" && (
                  <div className="pt-2 space-y-1.5 animate-in fade-in duration-200">
                    <Label className="text-[11px] font-bold text-foreground">Select Target Learning Unit</Label>
                    <Select value={targetLearningUnitId} onValueChange={setTargetLearningUnitId}>
                      <SelectTrigger className="h-10 text-xs rounded-xl border-border/60 bg-background">
                        <SelectValue placeholder={learningUnits.length > 0 ? "Select target unit..." : "No units found (covers all)"} />
                      </SelectTrigger>
                      <SelectContent>
                        {learningUnits.map((lu) => (
                          <SelectItem key={lu.id} value={lu.id} className="text-xs">
                            {lu.order_index}. {lu.title} ({lu.estimated_study_minutes} mins)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Grid Section 2: Study Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <CalendarIcon className="size-3.5 text-primary" /> 3. Study Start Date
                  </Label>
                  <Input
                    type="date"
                    value={aiStartDate}
                    onChange={(e) => setAiStartDate(e.target.value)}
                    className="h-10 text-xs rounded-xl border-border/60 bg-background"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    When you want to start studying.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <CalendarIcon className="size-3.5 text-primary" /> 4. Study End Date
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    type="date"
                    value={aiEndDate}
                    onChange={(e) => setAiEndDate(e.target.value)}
                    min={aiStartDate}
                    className="h-10 text-xs rounded-xl border-border/60 bg-background"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Leave blank to use the assessment&apos;s deadline automatically.
                  </p>
                </div>
              </div>

              {/* Grid Section 3: Available Days & Time Slot */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Available Study Days */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <CalendarDays className="size-3.5 text-primary" /> Available Study Days
                  </Label>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ].map((day) => {
                      const active = selectedDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            active
                              ? "border-primary bg-primary/10 text-primary font-bold shadow-2xs"
                              : "border-border/50 text-muted-foreground hover:bg-muted/10 hover:text-foreground"
                          }`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Preferred Study Time Window */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <Clock className="size-3.5 text-primary" /> Preferred Time Window
                  </Label>
                  <div className="flex gap-2 items-center pt-1">
                    <Input
                      type="time"
                      value={timeStart}
                      onChange={(e) => setTimeStart(e.target.value)}
                      className="h-10 text-xs rounded-xl border-border/60 bg-background"
                    />
                    <span className="text-xs font-bold text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={timeEnd}
                      onChange={(e) => setTimeEnd(e.target.value)}
                      className="h-10 text-xs rounded-xl border-border/60 bg-background"
                    />
                  </div>
                </div>
              </div>

              {/* Vacation / Blackout Dates */}
              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-1.5">
                  <CalendarIcon className="size-3.5 text-primary" /> Vacation / Blackout Dates (Optional)
                </Label>
                <Input
                  placeholder="Comma separated dates e.g. 2026-08-05, 2026-08-06"
                  value={blackoutDatesInput}
                  onChange={(e) => setBlackoutDatesInput(e.target.value)}
                  className="h-10 text-xs rounded-xl border-border/60 bg-background"
                />
                <p className="text-[10px] text-muted-foreground">
                  AI will avoid scheduling study sessions on these blackout dates.
                </p>
              </div>

              {/* Action Button */}
              <Button
                onClick={handleGenerateAiPlan}
                disabled={loading || !selectedAssessmentId}
                className="w-full h-11 text-xs font-bold uppercase tracking-wider rounded-xl shadow-md gap-2 cursor-pointer mt-2"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Generate AI Study Plan Now
              </Button>
            </div>
          ) : (
            <div className="space-y-6 pt-2">
              {/* Manual Form Grid 1: Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold">1. Study Goal / Title <span className="text-destructive">*</span></Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Prepare for Database CAT 1"
                    className="h-10 text-xs rounded-xl border-border/60 bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold">2. Study Type</Label>
                  <Select value={studyType} onValueChange={setStudyType}>
                    <SelectTrigger className="h-10 text-xs rounded-xl border-border/60 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Assessment Preparation" className="text-xs">
                        Assessment Preparation
                      </SelectItem>
                      <SelectItem value="Homework" className="text-xs">Homework</SelectItem>
                      <SelectItem value="General Revision" className="text-xs">
                        General Revision
                      </SelectItem>
                      <SelectItem value="Weekly Learning" className="text-xs">
                        Weekly Learning
                      </SelectItem>
                      <SelectItem value="Personal Goal" className="text-xs">
                        Personal Learning Goal
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Manual Form Grid 2: Course & Daily Goal */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold">3. Related Course</Label>
                  <Select value={courseId} onValueChange={setCourseId}>
                    <SelectTrigger className="h-10 text-xs rounded-xl border-border/60 bg-background">
                      <SelectValue placeholder="Select course..." />
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

                <div className="space-y-2">
                  <Label className="text-xs font-bold">4. Daily Goal</Label>
                  <Input
                    value={dailyGoal}
                    onChange={(e) => setDailyGoal(e.target.value)}
                    placeholder="e.g. Complete 20 practice questions"
                    className="h-10 text-xs rounded-xl border-border/60 bg-background"
                  />
                </div>
              </div>

              {/* Manual Form Grid 3: Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold">5. Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-10 text-xs rounded-xl border-border/60 bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold">6. End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-10 text-xs rounded-xl border-border/60 bg-background"
                  />
                </div>
              </div>

              {/* Manual Form Section: Available Days */}
              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 text-primary" /> 7. Available Study Days
                </Label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                  ].map((day) => {
                    const active = selectedDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          active
                            ? "border-primary bg-primary/10 text-primary font-bold shadow-2xs"
                            : "border-border/50 text-muted-foreground hover:bg-muted/10 hover:text-foreground"
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Manual Form Grid 4: Time & Duration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <Clock className="size-3.5 text-primary" /> 8. Preferred Study Time
                  </Label>
                  <div className="flex gap-2 items-center pt-1">
                    <Input
                      type="time"
                      value={timeStart}
                      onChange={(e) => setTimeStart(e.target.value)}
                      className="h-10 text-xs rounded-xl border-border/60 bg-background"
                    />
                    <span className="text-xs font-bold text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={timeEnd}
                      onChange={(e) => setTimeEnd(e.target.value)}
                      className="h-10 text-xs rounded-xl border-border/60 bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <Sliders className="size-3.5 text-primary" /> 9. Session Duration
                  </Label>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[30, 45, 60, 90, 120].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setSessionDuration(mins)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          sessionDuration === mins
                            ? "border-primary bg-primary/10 text-primary font-bold shadow-2xs"
                            : "border-border/50 text-muted-foreground hover:bg-muted/10 hover:text-foreground"
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <Button
                onClick={handleCreateManualPlan}
                disabled={loading || !title}
                className="w-full h-11 text-xs font-bold uppercase tracking-wider rounded-xl shadow-md gap-2 cursor-pointer mt-2"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Create Manual Study Plan
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
