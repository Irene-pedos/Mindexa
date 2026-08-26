// frontend/components/mindexa/common/contextual-explainer.tsx
"use client";

import React, { useState } from "react";
import {
  HelpCircle,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertTriangle,
  Users,
  Send,
  Accessibility,
  X,
  Info,
  ExternalLink,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ExplainerTopic =
  | "start-assessment"
  | "fullscreen-integrity"
  | "submit-assessment"
  | "ai-study-support"
  | "held-for-review"
  | "group-leadership"
  | "grading-release"
  | "accommodations";

interface TopicData {
  title: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  summary: string;
  details: string;
  whyItMatters: string;
  tip?: string;
}

const EXPLAINER_TOPICS: Record<ExplainerTopic, TopicData> = {
  "start-assessment": {
    title: "Starting an Assessment",
    category: "High-Stakes Action",
    icon: Clock,
    colorClass: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
    summary: "Initiates your timed assessment attempt in a secure workspace.",
    details:
      "Once you click Start, the countdown timer begins on the server and runs continuously even if you close the window. Ensure a stable internet connection before beginning.",
    whyItMatters:
      "Timed attempts cannot be paused. Extended time accommodations are already calculated into your timer if approved.",
    tip: "Review the question count and allowed attempts before clicking start.",
  },
  "fullscreen-integrity": {
    title: "Fullscreen & Integrity Rules",
    category: "Exam Security",
    icon: ShieldCheck,
    colorClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    summary: "Enforces a distraction-free, fair testing environment for all students.",
    details:
      "The system monitors window focus, fullscreen state, and tab switches. Navigating away or opening other applications is logged with precise timestamps.",
    whyItMatters:
      "Multiple focus violations may result in an automatic exam submission or hold your grade for departmental review.",
    tip: "Turn off browser notifications and close messaging apps before starting.",
  },
  "submit-assessment": {
    title: "Submitting Your Assessment",
    category: "Finalization",
    icon: Send,
    colorClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    summary: "Locks and timestamps your final answers for grading.",
    details:
      "Submitting packages your recorded answers, generates an immutable audit receipt, and sends your attempt to the grading queue.",
    whyItMatters:
      "This action is permanent and irreversible. You will not be able to edit answers after submitting.",
    tip: "Use the question review grid to verify all questions are answered first.",
  },
  "ai-study-support": {
    title: "AI Study Support & Tutoring",
    category: "Learning Tool",
    icon: Sparkles,
    colorClass: "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20",
    summary: "Personalized revision assistant grounded strictly in your syllabus.",
    details:
      "AI Study Support generates lesson outlines, topic flashcards, and practice knowledge checks directly from your uploaded course materials.",
    whyItMatters:
      "It is designed to build understanding and identify knowledge gaps, never to answer live assessment questions.",
    tip: "Ask the AI tutor to explain tricky formulas or break down reading assignments.",
  },
  "held-for-review": {
    title: "Held for Review Status",
    category: "Integrity & Audit",
    icon: AlertTriangle,
    colorClass: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
    summary: "Your submission is undergoing routine human or integrity verification.",
    details:
      "When anomaly indicators, connection drops, or integrity flags occur during a test, the grade is held until your lecturer reviews the session audit log.",
    whyItMatters:
      "This protects students against false flags by requiring manual instructor approval before final marks are recorded.",
    tip: "Held status is usually resolved within 2-3 business days after assessment closure.",
  },
  "group-leadership": {
    title: "Group Submission Leadership",
    category: "Collaboration",
    icon: Users,
    colorClass: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    summary: "Coordinates team answers and manages final submission turn-in.",
    details:
      "The designated group leader submits the consolidated work on behalf of the entire group. Individual member participation is tracked in the workspace.",
    whyItMatters:
      "Depending on lecturer configuration, all members may need to approve the draft before final submission is accepted.",
    tip: "Ensure all team members review the answers tab before finalizing submission.",
  },
  "grading-release": {
    title: "Publishing Grades to Students",
    category: "Lecturer Action",
    icon: CheckCircle2,
    colorClass: "text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/20",
    summary: "Releases verified scores, model answers, and rubric feedback.",
    details:
      "Releasing grades makes marks visible to enrolled students and delivers notification alerts with question breakdown summaries.",
    whyItMatters:
      "Once released, grades enter the student's official academic record. Ensure AI-suggested marks are audited before releasing.",
    tip: "You can release grades individually or in bulk for the entire class section.",
  },
  "accommodations": {
    title: "Accessibility Accommodations",
    category: "Disability & Inclusion",
    icon: Accessibility,
    colorClass: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    summary: "Institutional adjustments for students with specific learning needs.",
    details:
      "Accommodations include server-enforced extra time multipliers (e.g. +25%, +50%), screen-reader compatible list modes, and high-clarity typography.",
    whyItMatters:
      "Extra time is applied automatically by the assessment backend, ensuring equitable conditions without manual lecturer overrides.",
    tip: "Accommodations are approved through the institutional disability office with full audit logging.",
  },
};

interface ContextualExplainerProps {
  topic: ExplainerTopic;
  variant?: "icon" | "pill" | "badge" | "inline";
  label?: string;
  className?: string;
  customTitle?: string;
  customSummary?: string;
}

export function ContextualExplainer({
  topic,
  variant = "icon",
  label,
  className,
  customTitle,
  customSummary,
}: ContextualExplainerProps) {
  const [open, setOpen] = useState(false);
  const data = EXPLAINER_TOPICS[topic] || EXPLAINER_TOPICS["start-assessment"];
  const TopicIcon = data.icon;

  const title = customTitle || data.title;
  const summary = customSummary || data.summary;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "pill" ? (
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full",
              "border border-border/80 bg-background/80 hover:bg-muted/70 text-foreground/80 hover:text-foreground",
              "transition-all duration-150 shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/20",
              className
            )}
            aria-label={`Learn about ${title}`}
          >
            <HelpCircle className="size-3 text-primary shrink-0" />
            <span>{label || "What is this?"}</span>
          </button>
        ) : variant === "badge" ? (
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md",
              data.colorClass,
              "hover:opacity-90 transition-opacity focus:outline-none",
              className
            )}
            aria-label={`Learn about ${title}`}
          >
            <TopicIcon className="size-3 shrink-0" />
            <span>{label || data.category}</span>
          </button>
        ) : variant === "inline" ? (
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 text-xs text-primary/80 hover:text-primary underline underline-offset-2",
              "focus:outline-none",
              className
            )}
            aria-label={`Learn about ${title}`}
          >
            <Info className="size-3.5 shrink-0" />
            <span>{label || "Explain this rule"}</span>
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center size-6 rounded-full",
              "text-muted-foreground hover:text-primary hover:bg-primary/10",
              "transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20",
              className
            )}
            title={`What is this: ${title}`}
            aria-label={`What is this: ${title}`}
          >
            <HelpCircle className="size-3.5" />
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="center"
        sideOffset={6}
        className="w-80 sm:w-96 p-0 shadow-xl rounded-xl border border-border bg-card text-card-foreground overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150 z-50"
      >
        {/* Header with theme pill */}
        <div className="bg-muted/40 p-4 border-b border-border/60">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className={cn("p-1.5 rounded-lg border", data.colorClass)}>
                <TopicIcon className="size-4" />
              </div>
              <div>
                <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider h-4.5 px-1.5">
                  {data.category}
                </Badge>
                <h4 className="text-sm font-bold text-foreground mt-1">
                  {title}
                </h4>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted"
              aria-label="Close explainer"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            {summary}
          </p>
        </div>

        {/* Details & Why it matters */}
        <div className="p-4 space-y-3 text-xs leading-relaxed">
          <div className="space-y-1">
            <span className="font-semibold text-foreground">How it works:</span>
            <p className="text-muted-foreground">{data.details}</p>
          </div>

          <div className="rounded-lg bg-primary/5 border border-primary/15 p-2.5 text-foreground/90">
            <span className="font-semibold text-primary block mb-0.5">Why this matters:</span>
            <span className="text-[11px] text-muted-foreground">{data.whyItMatters}</span>
          </div>

          {data.tip && (
            <div className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 p-2 rounded-md">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>{data.tip}</span>
            </div>
          )}
        </div>

        {/* Footer Got It button */}
        <div className="flex items-center justify-between bg-muted/20 px-4 py-2.5 border-t border-border/60">
          <span className="text-[10px] text-muted-foreground font-medium">
            Digital Literacy Affordance
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
            className="h-7 text-xs font-semibold text-primary hover:text-primary hover:bg-primary/10 px-3"
          >
            Got it
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
