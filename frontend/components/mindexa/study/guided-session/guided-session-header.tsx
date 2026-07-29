"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, CheckCircle2, Sparkles, HelpCircle, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type GuidedStage = "intro" | "lesson" | "practice" | "knowledge_check" | "summary";

interface GuidedSessionHeaderProps {
  title: string;
  topic: string;
  stage: GuidedStage;
  currentSectionIndex: number;
  totalSections: number;
  onExit: () => void;
}

export function GuidedSessionHeader({
  title,
  topic,
  stage,
  currentSectionIndex,
  totalSections,
  onExit,
}: GuidedSessionHeaderProps) {
  // Stage step index for progress calculation
  const stageSteps: Record<GuidedStage, number> = {
    intro: 1,
    lesson: 2,
    practice: 3,
    knowledge_check: 4,
    summary: 5,
  };

  const currentStep = stageSteps[stage];
  const progressPercentage = Math.round((currentStep / 5) * 100);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur-md px-4 py-3 md:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        {/* Left: Back/Exit & Title */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onExit}
            className="size-9 rounded-full hover:bg-muted"
            title="Exit Guided Session"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[11px] font-medium">
                <Sparkles className="mr-1 size-3" /> Guided Study
              </Badge>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate max-w-[200px] md:max-w-none">
                {topic}
              </span>
            </div>
            <h1 className="text-sm md:text-base font-bold text-foreground truncate max-w-[250px] md:max-w-md">
              {title}
            </h1>
          </div>
        </div>

        {/* Center: Stage Navigation Progress */}
        <div className="hidden md:flex flex-col items-center gap-1.5 w-72">
          <div className="flex w-full justify-between text-[11px] font-medium text-muted-foreground">
            <span className={cn(stage === "intro" && "text-primary font-bold")}>Start</span>
            <span className={cn(stage === "lesson" && "text-primary font-bold")}>
              Lesson ({currentSectionIndex + 1}/{totalSections || 1})
            </span>
            <span className={cn(stage === "practice" && "text-primary font-bold")}>Practice</span>
            <span className={cn(stage === "knowledge_check" && "text-primary font-bold")}>Check</span>
            <span className={cn(stage === "summary" && "text-primary font-bold")}>Summary</span>
          </div>
          <Progress value={progressPercentage} className="h-1.5 w-full bg-muted" />
        </div>

        {/* Right: Stage Status Indicator */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 text-xs font-medium text-foreground">
            {stage === "intro" && <BookOpen className="size-3.5 text-primary" />}
            {stage === "lesson" && <BookOpen className="size-3.5 text-emerald-500" />}
            {stage === "practice" && <HelpCircle className="size-3.5 text-amber-500" />}
            {stage === "knowledge_check" && <CheckCircle2 className="size-3.5 text-indigo-500" />}
            {stage === "summary" && <Trophy className="size-3.5 text-amber-400" />}
            <span className="capitalize">{stage.replace("_", " ")}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
