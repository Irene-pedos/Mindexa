"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ContextualExplainer } from "@/components/mindexa/common/contextual-explainer"
import type { StudentAssessment } from "@/lib/api/assessment"
import { START_COPY, sessionKind, startRules, type StartRule } from "@/lib/student-assessments"
import { cn } from "@/lib/utils"

interface AssessmentStartDialogProps {
  assessment: StudentAssessment | null
  /** True when the student already has an attempt running and is coming back to it. */
  resuming: boolean
  onClose: () => void
  onStart: (assessment: StudentAssessment) => void
}

const TONE: Record<StartRule["tone"], { box: string; icon: typeof Info; iconClass: string }> = {
  neutral: { box: "border-border/50 bg-muted/20", icon: Info, iconClass: "text-muted-foreground" },
  important: { box: "border-amber-500/30 bg-amber-500/5", icon: AlertTriangle, iconClass: "text-amber-600" },
  positive: { box: "border-emerald-500/25 bg-emerald-500/5", icon: CheckCircle2, iconClass: "text-emerald-600" },
}

/** The dialog shell. The checklist inside mounts fresh each time, so the agreement always starts unchecked. */
export function AssessmentStartDialog(props: AssessmentStartDialogProps) {
  return (
    <Dialog open={props.assessment !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        {props.assessment && <Checklist {...props} assessment={props.assessment} />}
      </DialogContent>
    </Dialog>
  )
}

function Checklist({
  assessment,
  resuming,
  onClose,
  onStart,
}: AssessmentStartDialogProps & { assessment: StudentAssessment }) {
  const [agreed, setAgreed] = useState(false)
  const kind = sessionKind(assessment)
  const copy = START_COPY[kind]
  const rules = startRules(assessment)

  return (
    <>
      <DialogHeader className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <DialogTitle className="text-base font-semibold leading-snug">
            {resuming ? "Continue where you left off" : copy.title}
          </DialogTitle>
          <ContextualExplainer topic="start-assessment" variant="pill" label="What to expect?" />
        </div>
        <DialogDescription className="text-xs">
          <span className="font-medium text-foreground">{assessment.title}</span>
          {assessment.course_code ? ` · ${assessment.course_code}` : ""}
          {" · "}
          {resuming ? "Your answers so far are saved." : copy.description}
        </DialogDescription>
      </DialogHeader>

      <ul className="space-y-2">
        {rules.map((rule, index) => {
          const tone = TONE[rule.tone]
          const Icon = tone.icon
          return (
            <li
              key={rule.id}
              style={{ animationDelay: `${index * 35}ms` }}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:fill-mode-backwards",
                tone.box,
              )}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", tone.iconClass)} aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">{rule.title}</p>
                <p className="mt-0.5 text-[11px] font-medium leading-normal text-muted-foreground">{rule.text}</p>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex items-start gap-2.5 pt-1">
        <Checkbox
          id="start-agree"
          checked={agreed}
          onCheckedChange={(checked) => setAgreed(checked === true)}
          className="mt-0.5"
        />
        <Label htmlFor="start-agree" className="cursor-pointer text-xs font-medium leading-normal text-muted-foreground">
          I have read the rules above and I am ready to {resuming ? "continue" : "begin"}.
        </Label>
      </div>

      <DialogFooter className="gap-2 border-t pt-3 sm:justify-end">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={!agreed} onClick={() => onStart(assessment)}>
          {resuming ? "Resume" : copy.cta}
        </Button>
      </DialogFooter>
    </>
  )
}
