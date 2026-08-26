// frontend/components/mindexa/common/help-popover.tsx
"use client";

import React, { useState } from "react";
import {
  HelpCircle,
  Info,
  ShieldCheck,
  Send,
  Sparkles,
  Clock,
  AlertTriangle,
  Users,
  CheckCircle2,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type HelpTopic =
  | "fullscreen"
  | "submit"
  | "ai-study"
  | "start-assessment"
  | "results-held"
  | "accommodations"
  | "group-leadership"
  | "grading-release";

interface HelpTopicDefinition {
  title: string;
  text: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}

const TOPIC_REGISTRY: Record<HelpTopic, HelpTopicDefinition> = {
  fullscreen: {
    title: "Fullscreen & Focus",
    text: "This keeps the test focused. Leaving fullscreen may be recorded by your lecturer.",
    icon: ShieldCheck,
    colorClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  submit: {
    title: "Final Submission",
    text: "Submit only when finished. You cannot change answers after this.",
    icon: Send,
    colorClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  "ai-study": {
    title: "AI Study Support",
    text: "Ask for study help. It will not write your test answers.",
    icon: Sparkles,
    colorClass: "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20",
  },
  "start-assessment": {
    title: "Timed Assessment",
    text: "The timer runs continuously once started. Ensure you are ready before beginning.",
    icon: Clock,
    colorClass: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  "results-held": {
    title: "Integrity Review",
    text: "This attempt is undergoing standard review. Marks will be visible once cleared.",
    icon: AlertTriangle,
    colorClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  accommodations: {
    title: "Disability & Time Accommodations",
    text: "Approved extra time and screen-reader settings are applied automatically.",
    icon: CheckCircle2,
    colorClass: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  },
  "group-leadership": {
    title: "Group Work",
    text: "All group members share this workspace. The team leader finalizes the final submission.",
    icon: Users,
    colorClass: "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20",
  },
  "grading-release": {
    title: "Publishing Grades",
    text: "Grades and AI feedback remain hidden from students until released.",
    icon: ShieldCheck,
    colorClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
};

export interface HelpPopoverProps {
  topic?: HelpTopic;
  title?: string;
  content?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  variant?: "icon" | "badge" | "button" | "custom";
  label?: string;
  className?: string;
  children?: React.ReactNode;
}

export function HelpPopover({
  topic,
  title: customTitle,
  content: customContent,
  side = "top",
  align = "center",
  variant = "icon",
  label,
  className,
  children,
}: HelpPopoverProps) {
  const [open, setOpen] = useState(false);

  const topicData = topic ? TOPIC_REGISTRY[topic] : null;
  const displayTitle = customTitle || topicData?.title || "Quick Help";
  const displayText = customContent || topicData?.text || "";
  const IconComponent = topicData?.icon || HelpCircle;
  const colorClass = topicData?.colorClass || "text-primary bg-primary/10 border-primary/20";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ? (
          children
        ) : variant === "badge" ? (
          <button
            type="button"
            data-help-trigger
            aria-label={`Help: ${displayTitle}`}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border border-border/80 bg-muted/40 text-foreground/80 hover:bg-muted transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary",
              className
            )}
          >
            <HelpCircle className="size-3 text-muted-foreground" />
            <span>{label || "What is this?"}</span>
          </button>
        ) : variant === "button" ? (
          <button
            type="button"
            data-help-trigger
            aria-label={`Help: ${displayTitle}`}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer shadow-2xs",
              className
            )}
          >
            <IconComponent className="size-3.5 text-primary" />
            <span>{label || displayTitle}</span>
          </button>
        ) : (
          <button
            type="button"
            data-help-trigger
            aria-label={`Help: ${displayTitle}`}
            className={cn(
              "inline-flex items-center justify-center size-5 rounded-full text-muted-foreground/80 hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary",
              className
            )}
          >
            <HelpCircle className="size-3.5" />
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        side={side}
        align={align}
        sideOffset={6}
        className="w-72 p-3.5 rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-lg animate-in fade-in-50 zoom-in-95 duration-150"
      >
        <div className="flex items-start gap-2.5">
          <div
            className={cn(
              "size-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5",
              colorClass
            )}
          >
            <IconComponent className="size-3.5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-foreground leading-tight">
              {displayTitle}
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {displayText}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Compact Tooltip-based help trigger for dense UI spaces.
 */
export function HelpTooltip({
  topic,
  content,
  children,
}: {
  topic?: HelpTopic;
  content?: string;
  children?: React.ReactNode;
}) {
  const topicData = topic ? TOPIC_REGISTRY[topic] : null;
  const displayText = content || topicData?.text || "";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          {children || (
            <button
              type="button"
              data-help-trigger
              aria-label="More information"
              className="inline-flex items-center justify-center size-4 rounded-full text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
            >
              <Info className="size-3" />
            </button>
          )}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs p-2 rounded-lg">
          {displayText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
