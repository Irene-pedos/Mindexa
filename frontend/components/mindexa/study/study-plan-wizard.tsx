"use client";

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Calendar as CalendarIcon, Clock, BookOpen, Layers, CheckCircle2, Zap, ArrowRight, Loader2, ShieldAlert } from "lucide-react";
import { studentApi, StudentCourseListItem } from "@/lib/api/student";
import { assessmentApi } from "@/lib/api/assessment";
import { studyPlannerApi, CreateStudyPlanPayload, GeneratePlanFromAssessmentPayload } from "@/lib/api/study-planner";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

interface StudyPlanWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialAssessmentId?: string;
}

export function StudyPlanWizard({ open, onOpenChange, onSuccess, initialAssessmentId }: StudyPlanWizardProps) {
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<StudentCourseListItem[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);

  // Form states
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("");
  const [title, setTitle] = useState("Prepare for Database CAT 1");
  const [studyType, setStudyType] = useState("Assessment Preparation");
  const [courseId, setCourseId] = useState<string>("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 14), "yyyy-MM-dd"));
  const [selectedDays, setSelectedDays] = useState<string[]>(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
  const [blackoutDatesInput, setBlackoutDatesInput] = useState<string>("");
  const [timeStart, setTimeStart] = useState("19:00");
  const [timeEnd, setTimeEnd] = useState("21:00");
  const [sessionDuration, setSessionDuration] = useState<number>(60);
  const [dailyGoal, setDailyGoal] = useState("Study 1 topic per session");
  const [preferredDifficulty, setPreferredDifficulty] = useState<string>("Balanced");
  const [reminderPref, setReminderPref] = useState<number>(30);
  const [reminderChannels, setReminderChannels] = useState<string[]>(["in_app", "browser"]);
  const [priority, setPriority] = useState<string>("High");

  useEffect(() => {
    if (open) {
      async function loadData() {
        try {
          const [workspaces, assessRes] = await Promise.all([
            studentApi.getWorkspaces().catch(() => []),
            assessmentApi.getAssessments({ page: 1, page_size: 20 }).catch(() => ({ items: [] })),
          ]);
          setCourses(workspaces || []);
          setAssessments(assessRes.items || []);
          
          if (initialAssessmentId) {
            setSelectedAssessmentId(initialAssessmentId);
          } else if (assessRes.items && assessRes.items.length > 0) {
            setSelectedAssessmentId(assessRes.items[0].id);
          }
        } catch (err) {
          console.error(err);
        }
      }
      loadData();
    }
  }, [open, initialAssessmentId]);

  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const toggleChannel = (channel: string) => {
    setReminderChannels(prev =>
      prev.includes(channel) ? prev.filter(c => c !== channel) : [...prev, channel]
    );
  };

  const parseBlackoutDates = (): string[] => {
    if (!blackoutDatesInput.trim()) return [];
    return blackoutDatesInput
      .split(",")
      .map((d) => d.trim())
      .filter((d) => Boolean(d));
  };

  const handleGenerateAiPlan = async () => {
    if (!selectedAssessmentId) {
      toast.error("Please select an upcoming assessment");
      return;
    }
    setLoading(true);
    try {
      const payload: GeneratePlanFromAssessmentPayload = {
        assessment_id: selectedAssessmentId,
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
      await studyPlannerApi.generateFromAssessment(payload);
      toast.success("AI Study Plan generated and synchronized with your calendar!");
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
    setLoading(true);
    try {
      const payload: CreateStudyPlanPayload = {
        title,
        study_type: studyType,
        course_id: courseId || undefined,
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
      await studyPlannerApi.createManualPlan(payload);
      toast.success("Study plan created successfully!");
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl border border-border bg-card">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <DialogTitle className="text-lg font-bold">
              Configure AI Study Plan
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Build a personalized study schedule integrated with your courses, assessments, and notifications.
          </DialogDescription>
        </DialogHeader>

        {/* Mode Selector */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-muted/20 rounded-xl border border-border/40 my-3">
          <button
            onClick={() => setMode("ai")}
            className={`py-2 px-3 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
              mode === "ai"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="size-3.5" />
            Generate from Assessment (1-Click AI)
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`py-2 px-3 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
              mode === "manual"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="size-3.5" />
            Manual Setup Wizard
          </button>
        </div>

        {mode === "ai" ? (
          <div className="space-y-4 pt-1">
            <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-1">
              <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                <Zap className="size-3.5" /> Smart Assessment Engine
              </p>
              <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                AI will inspect remaining days until your assessment, extract course topics, check lecturer-uploaded materials, and distribute daily study, practice, and revision sessions into your academic calendar.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold">1. Select Target Assessment</Label>
              <Select value={selectedAssessmentId} onValueChange={setSelectedAssessmentId}>
                <SelectTrigger className="h-10 text-xs rounded-xl border-border/60">
                  <SelectValue placeholder="Choose an upcoming CAT or exam..." />
                </SelectTrigger>
                <SelectContent>
                  {assessments.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">
                      {a.title} ({a.course_code || "CAT"}) - Opens {a.window_start ? format(new Date(a.window_start), "MMM d") : "Soon"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold">2. Available Study Days</Label>
              <div className="flex flex-wrap gap-1.5">
                {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => {
                  const active = selectedDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        active
                          ? "border-primary bg-primary/10 text-primary font-bold"
                          : "border-border/40 text-muted-foreground hover:bg-muted/10"
                      }`}
                    >
                      {day.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">3. Preferred Study Time</Label>
                <div className="flex gap-2">
                  <Input
                    type="time"
                    value={timeStart}
                    onChange={(e) => setTimeStart(e.target.value)}
                    className="h-9 text-xs rounded-lg border-border/60"
                  />
                  <span className="text-xs self-center font-bold text-muted-foreground">to</span>
                  <Input
                    type="time"
                    value={timeEnd}
                    onChange={(e) => setTimeEnd(e.target.value)}
                    className="h-9 text-xs rounded-lg border-border/60"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">4. Study Intensity / Pace</Label>
                <Select value={preferredDifficulty} onValueChange={setPreferredDifficulty}>
                  <SelectTrigger className="h-9 text-xs rounded-lg border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Balanced">Balanced Pace</SelectItem>
                    <SelectItem value="Small daily sessions">Small Light Sessions</SelectItem>
                    <SelectItem value="Intensive revision">Intensive Bootcamp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">5. Vacation / Blackout Dates (Optional)</Label>
              <Input
                placeholder="Comma separated dates e.g. 2026-08-05, 2026-08-06"
                value={blackoutDatesInput}
                onChange={(e) => setBlackoutDatesInput(e.target.value)}
                className="h-9 text-xs rounded-lg border-border/60"
              />
              <p className="text-[10px] text-muted-foreground">AI will avoid scheduling study sessions on these dates.</p>
            </div>

            <Button
              onClick={handleGenerateAiPlan}
              disabled={loading || !selectedAssessmentId}
              className="w-full h-10 mt-4 text-xs font-bold uppercase tracking-wider rounded-xl shadow-md gap-2"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Generate AI Plan Now
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">1. Study Goal / Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Prepare for Database CAT"
                  className="h-9 text-xs rounded-lg border-border/60"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">2. Study Type</Label>
                <Select value={studyType} onValueChange={setStudyType}>
                  <SelectTrigger className="h-9 text-xs rounded-lg border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Assessment Preparation">Assessment Preparation</SelectItem>
                    <SelectItem value="Homework">Homework</SelectItem>
                    <SelectItem value="General Revision">General Revision</SelectItem>
                    <SelectItem value="Weekly Learning">Weekly Learning</SelectItem>
                    <SelectItem value="Personal Goal">Personal Learning Goal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">3. Related Course</Label>
                <Select value={courseId} onValueChange={setCourseId}>
                  <SelectTrigger className="h-9 text-xs rounded-lg border-border/60">
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

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">4. Daily Goal</Label>
                <Input
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(e.target.value)}
                  placeholder="e.g. Complete 20 practice questions"
                  className="h-9 text-xs rounded-lg border-border/60"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">5. Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9 text-xs rounded-lg border-border/60"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">6. End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9 text-xs rounded-lg border-border/60"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold">7. Available Study Days</Label>
              <div className="flex flex-wrap gap-1.5">
                {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => {
                  const active = selectedDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        active
                          ? "border-primary bg-primary/10 text-primary font-bold"
                          : "border-border/40 text-muted-foreground hover:bg-muted/10"
                      }`}
                    >
                      {day.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              onClick={handleCreateManualPlan}
              disabled={loading || !title}
              className="w-full h-10 mt-4 text-xs font-bold uppercase tracking-wider rounded-xl shadow-md gap-2"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Create Study Plan
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
