"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Frown, Meh, Smile, Sparkles, BookOpen, ArrowRight, Loader2, Star, HelpCircle } from "lucide-react";
import { studyPlannerApi, StudySession, ChecklistItem } from "@/lib/api/study-planner";
import { toast } from "sonner";

interface SessionCompletionModalProps {
  session: StudySession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
  onOpenAiTutorWithTopic?: (topic: string) => void;
}

export function SessionCompletionModal({
  session,
  open,
  onOpenChange,
  onCompleted,
  onOpenAiTutorWithTopic,
}: SessionCompletionModalProps) {
  const [understanding, setUnderstanding] = useState<"YES" | "PARTIAL" | "NO">("YES");
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [confidence, setConfidence] = useState<number>(4);
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [completedResult, setCompletedResult] = useState<StudySession | null>(null);

  React.useEffect(() => {
    if (open && session) {
      setUnderstanding("YES");
      setDifficulty("Medium");
      setConfidence(4);
      setNotes("");
      setChecklist(session.checklist_items || []);
      setCompletedResult(null);
    }
  }, [session, open]);

  if (!session) return null;

  const toggleCheckitem = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await studyPlannerApi.completeSession(
        session.study_plan_id,
        session.id,
        understanding,
        difficulty,
        confidence,
        notes,
        checklist
      );
      toast.success("Study session completed & reflections saved!");
      onCompleted();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to complete session");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto p-6 rounded-2xl border border-border bg-card">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-500" />
            Complete Session & Reflection
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {session.title} • Topic: <span className="font-semibold text-foreground">{session.topic}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {/* Session Checklist Sub-tasks */}
          {checklist.length > 0 && (
            <div className="space-y-2 p-3 rounded-xl border border-border/40 bg-muted/10">
              <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-primary" /> Session Sub-task Checklist
              </div>
              <div className="space-y-1.5 pt-1">
                {checklist.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 text-xs font-medium text-foreground/90 cursor-pointer"
                  >
                    <Checkbox
                      checked={item.completed}
                      onCheckedChange={() => toggleCheckitem(item.id)}
                    />
                    <span className={item.completed ? "line-through opacity-60" : ""}>{item.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Understanding Check */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground">
              1. Did you understand today&apos;s topic?
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setUnderstanding("YES")}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  understanding === "YES"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 font-bold shadow-sm"
                    : "border-border/40 hover:bg-muted/10 text-muted-foreground"
                }`}
              >
                <Smile className="size-5" />
                <span className="text-xs">Yes, Understood</span>
              </button>

              <button
                type="button"
                onClick={() => setUnderstanding("PARTIAL")}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  understanding === "PARTIAL"
                    ? "border-amber-500 bg-amber-500/10 text-amber-600 font-bold shadow-sm"
                    : "border-border/40 hover:bg-muted/10 text-muted-foreground"
                }`}
              >
                <Meh className="size-5" />
                <span className="text-xs">Partially</span>
              </button>

              <button
                type="button"
                onClick={() => setUnderstanding("NO")}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  understanding === "NO"
                    ? "border-red-500 bg-red-500/10 text-red-600 font-bold shadow-sm"
                    : "border-border/40 hover:bg-muted/10 text-muted-foreground"
                }`}
              >
                <Frown className="size-5" />
                <span className="text-xs">Needs Review</span>
              </button>
            </div>
          </div>

          {/* Difficulty Rating */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">2. Topic Difficulty</label>
              <div className="flex gap-1">
                {(["Easy", "Medium", "Hard"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                      difficulty === d
                        ? "border-primary bg-primary/10 text-primary font-bold"
                        : "border-border/40 text-muted-foreground"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Confidence Rating (Stars) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">3. Confidence Rating</label>
              <div className="flex items-center gap-1 py-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setConfidence(star)}
                    className="p-0.5 focus:outline-none"
                  >
                    <Star
                      className={`size-5 ${
                        star <= confidence
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/30"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">
              Feedback & Reflection Notes (Optional)
            </label>
            <Textarea
              placeholder="Write down key takeaways or concepts to clarify..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-16 text-xs rounded-xl border-border/60"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full h-10 text-xs font-bold uppercase tracking-wider rounded-xl gap-2 shadow-sm"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Save Session Reflection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
