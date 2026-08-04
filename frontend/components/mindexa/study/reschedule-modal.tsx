"use client";

import React, { useState, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Loader2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { studyPlannerApi, StudySession } from "@/lib/api/study-planner";
import { toast } from "sonner";

interface RescheduleModalProps {
  session: StudySession | null;
  isOpen: boolean;
  onClose: () => void;
  onSessionUpdated: (updatedSession: StudySession) => void;
}

export function RescheduleModal({
  session,
  isOpen,
  onClose,
  onSessionUpdated,
}: RescheduleModalProps) {
  const currentStart = session?.scheduled_start
    ? new Date(session.scheduled_start)
    : new Date();

  const initialDateStr = currentStart.toISOString().split("T")[0];
  const initialTimeStr = currentStart.toTimeString().slice(0, 5);

  const [dateStr, setDateStr] = useState(initialDateStr);
  const [timeStr, setTimeStr] = useState(initialTimeStr);
  const [durationMinutes, setDurationMinutes] = useState(
    session?.duration_minutes || 60,
  );
  const [submitting, setSubmitting] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);

  useEffect(() => {
    if (!session) return;
    const start = session.scheduled_start
      ? new Date(session.scheduled_start)
      : new Date();

    setDateStr(start.toISOString().split("T")[0]);
    setTimeStr(start.toTimeString().slice(0, 5));
    setDurationMinutes(session.duration_minutes || 60);
    setHasConflict(false);
  }, [session?.scheduled_start, session?.duration_minutes, session, isOpen]);

  if (!session) return null;

  // Compute proposed start/end dates
  const proposedStart = new Date(`${dateStr}T${timeStr}:00`);
  const proposedEnd = new Date(
    proposedStart.getTime() + durationMinutes * 60 * 1000,
  );

  // Suggested alternative time slots
  const alternativeSlots = [
    {
      label: "2 Hours Later",
      date: new Date(proposedStart.getTime() + 2 * 60 * 60 * 1000),
    },
    {
      label: "Tomorrow Same Time",
      date: new Date(proposedStart.getTime() + 24 * 60 * 60 * 1000),
    },
    {
      label: "2 Days Later",
      date: new Date(proposedStart.getTime() + 48 * 60 * 60 * 1000),
    },
  ];

  const handleApplyAlternative = (altDate: Date) => {
    setDateStr(altDate.toISOString().split("T")[0]);
    setTimeStr(altDate.toTimeString().slice(0, 5));
    setHasConflict(false);
  };

  const handleReschedule = async (forceOverride = false) => {
    setSubmitting(true);
    try {
      const startIso = proposedStart.toISOString();
      const updated = await studyPlannerApi.rescheduleSession(
        session.study_plan_id,
        session.id,
        startIso,
        durationMinutes,
        forceOverride,
      );
      toast.success("Study session rescheduled successfully!");
      onSessionUpdated(updated);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to reschedule study session");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border-border/80 bg-card p-6 shadow-2xl">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <CalendarIcon className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Reschedule Study Session
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Topic: {session.topic}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-3">
          {/* Current Schedule Banner */}
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border/50 text-xs space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Currently Scheduled
            </span>
            <div className="font-semibold text-foreground flex items-center gap-2">
              <Clock className="size-3.5 text-primary" />
              {currentStart.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}{" "}
              at{" "}
              {currentStart.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              ({session.duration_minutes} mins)
            </div>
          </div>

          {/* New Date & Time Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                New Date
              </Label>
              <Input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="text-xs h-10 rounded-xl border-border/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                New Start Time
              </Label>
              <Input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="text-xs h-10 rounded-xl border-border/60"
              />
            </div>
          </div>

          {/* Duration Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground">
              Session Duration
            </Label>
            <div className="flex flex-wrap gap-2">
              {[30, 45, 60, 90, 120].map((dur) => (
                <button
                  key={dur}
                  type="button"
                  onClick={() => setDurationMinutes(dur)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    durationMinutes === dur
                      ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                      : "border-border/60 text-muted-foreground hover:border-primary/40 hover:bg-muted/30"
                  }`}
                >
                  {dur} mins
                </button>
              ))}
            </div>
          </div>

          {/* Alternative Recommendations */}
          <div className="space-y-2 pt-1">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="size-3 text-primary" /> Suggested
              Alternatives
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {alternativeSlots.map((slot, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleApplyAlternative(slot.date)}
                  className="p-2 rounded-xl border border-border/60 hover:border-primary/50 bg-muted/10 text-left transition-all hover:bg-primary/5 space-y-0.5"
                >
                  <div className="text-[10px] font-bold text-primary">
                    {slot.label}
                  </div>
                  <div className="text-[11px] font-medium text-foreground">
                    {slot.date.toLocaleDateString(undefined, {
                      weekday: "short",
                      day: "numeric",
                    })}{" "}
                    {slot.date.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-3 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleReschedule(false)}
            disabled={submitting}
            className="text-xs font-bold px-5 gap-2 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 text-primary-foreground shadow-md"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Confirm Reschedule"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
