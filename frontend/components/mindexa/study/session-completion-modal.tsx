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
    if (session && session.checklist_items) {
      setChecklist(session.checklist_items);
    }
  }, [session]);

  if (!session) return null;

  const toggleCheckitem = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const updated = await studyPlannerApi.completeSession(
        session.study_plan_id,
        session.id,
        understanding,
        difficulty,
        confidence,
        notes,
        checklist
      );
      toast.success("Study session completed & reflections saved!");
      setCompletedResult(updated);
      onCompleted();
      if (understanding === "YES") {
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to complete session");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setCompletedResult(null); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-6 rounded-2xl border border-border bg-card">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-500" />
            Complete Session & AI Reflection
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {session.title} • Topic: <span className="font-semibold text-foreground">{session.topic}</span>
          </DialogDescription>
        </DialogHeader>

        {!completedResult || understanding === "YES" ? (
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
                placeholder="Write down key takeaways or concepts to clarify with your AI Tutor..."
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
        ) : (
          /* AI Targeted Resource & Quiz Recommendations Dialog */
          <div className="space-y-4 my-2 animate-in fade-in duration-300">
            <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-1">
              <p className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
                <Sparkles className="size-4" /> AI Tutor Guidance Queued
              </p>
              <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                Since you felt &quot;{understanding === "PARTIAL" ? "Partially Clear" : "Needs Review"}&quot;, AI has queued topic practice materials and interactive explanations.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-foreground">Recommended Next Steps:</div>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    if (onOpenAiTutorWithTopic) onOpenAiTutorWithTopic(session.topic);
                  }}
                  className="w-full h-9 text-xs font-bold rounded-xl justify-between border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-white"
                >
                  <span className="flex items-center gap-2"><Sparkles className="size-3.5" /> Ask AI Tutor to Explain {session.topic}</span>
                  <ArrowRight className="size-3.5" />
                </Button>

                <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-muted/5 text-xs font-medium">
                  <span className="flex items-center gap-2"><BookOpen className="size-3.5 text-primary" /> {session.topic} Core Lecture Slides</span>
                  <Badge variant="outline" className="text-[9px]">Resource</Badge>
                </div>
              </div>
            </div>

            <Button
              onClick={() => onOpenChange(false)}
              className="w-full h-9 text-xs font-bold uppercase tracking-wider rounded-xl gap-2"
            >
              Done <ArrowRight className="size-3.5" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
