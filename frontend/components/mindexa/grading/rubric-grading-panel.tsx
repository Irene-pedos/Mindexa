"use client";

import React, { useState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sliders,
} from "lucide-react";
import { renderRichMathText } from "@/components/mindexa/common/math-renderer";

interface RubricLevel {
  id: string;
  title: string;
  description: string | null;
  marks: number;
  order_index: number;
}

interface RubricCriterion {
  id: string;
  title: string;
  description: string | null;
  max_marks: number;
  order_index: number;
  levels: RubricLevel[];
}

interface Rubric {
  id: string;
  title: string;
  criteria: RubricCriterion[];
}

interface RubricGradingPanelProps {
  rubric: Rubric;
  currentScores?: any[];
  onScoresChange: (scores: any[]) => void;
  readOnly?: boolean;
  className?: string;
}

export function RubricGradingPanel({
  rubric,
  currentScores = [],
  onScoresChange,
  readOnly = false,
  className,
}: RubricGradingPanelProps) {
  const [selectedLevels, setSelectedScores] = useState<Record<string, number>>(() => {
    return currentScores.reduce((acc, curr) => {
      const id = curr?.criterion_id || curr?.criteria_id || curr?.id;
      const val = curr?.score ?? curr?.marks_awarded ?? curr?.marks;
      if (id && val !== undefined && val !== null) {
        acc[id] = Number(val);
      }
      return acc;
    }, {} as Record<string, number>);
  });

  // Track expanded state for each criterion (all open by default)
  const [collapsedCriteria, setCollapsedCriteria] = useState<Record<string, boolean>>({});

  const sortedCriteria = useMemo(() => {
    return [...(rubric?.criteria || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  }, [rubric?.criteria]);

  const toggleCriterion = (criterionId: string) => {
    setCollapsedCriteria((prev) => ({
      ...prev,
      [criterionId]: !prev[criterionId],
    }));
  };

  const toggleAll = (collapse: boolean) => {
    const next: Record<string, boolean> = {};
    for (const c of sortedCriteria) {
      next[c.id] = collapse;
    }
    setCollapsedCriteria(next);
  };

  const handleLevelSelect = (
    criterionId: string,
    criterionTitle: string,
    marks: number,
    max: number,
  ) => {
    if (readOnly) return;

    const newSelected = { ...selectedLevels, [criterionId]: marks };
    setSelectedScores(newSelected);

    const scoresArray = Object.entries(newSelected).map(([id, score]) => {
      const criterion = rubric.criteria?.find((c) => c.id === id);
      const title = criterion?.title || criterionTitle || "Criterion";
      const maxMarks = criterion?.max_marks || max || 10;
      return {
        criterion_id: id,
        criteria_id: id,
        criterion_title: title,
        criterion: title,
        score: score,
        marks_awarded: score,
        max: maxMarks,
        max_score: maxMarks,
        notes: "",
      };
    });

    onScoresChange(scoresArray);
  };

  const handleResetCriterion = (criterionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;

    const newSelected = { ...selectedLevels };
    delete newSelected[criterionId];
    setSelectedScores(newSelected);

    const scoresArray = Object.entries(newSelected).map(([id, score]) => {
      const criterion = rubric.criteria?.find((c) => c.id === id);
      const title = criterion?.title || "Criterion";
      const maxMarks = criterion?.max_marks || 10;
      return {
        criterion_id: id,
        criteria_id: id,
        criterion_title: title,
        criterion: title,
        score: score,
        marks_awarded: score,
        max: maxMarks,
        max_score: maxMarks,
        notes: "",
      };
    });

    onScoresChange(scoresArray);
  };

  const totalScore = Object.values(selectedLevels).reduce((a, b) => a + b, 0);
  const maxScore = (rubric?.criteria || []).reduce((a, b) => a + (b.max_marks || 0), 0);
  const gradedCriteriaCount = Object.keys(selectedLevels).length;
  const totalCriteriaCount = sortedCriteria.length;
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  return (
    <div className={cn("space-y-4 font-sans", className)}>
      {/* Rubric Header with live calculation & controls */}
      <div className="p-3.5 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
              <Sliders className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground truncate">
                {rubric?.title || "Evaluation Rubric"}
              </h3>
              <p className="text-[10px] text-muted-foreground">
                {gradedCriteriaCount} of {totalCriteriaCount} criteria scored
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/20 rounded-xl">
              <span className="text-[10px] font-medium text-primary uppercase">Total:</span>
              <span className="text-xs font-mono font-bold text-primary">
                {totalScore} / {maxScore} pts ({percentage}%)
              </span>
            </div>

            {/* Quick collapse/expand controls */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => toggleAll(false)}
                className="h-6 px-1.5 text-[9px] text-muted-foreground hover:text-foreground"
                title="Expand All Criteria"
              >
                Expand
              </Button>
              <span className="text-muted-foreground/40 text-[10px]">•</span>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => toggleAll(true)}
                className="h-6 px-1.5 text-[9px] text-muted-foreground hover:text-foreground"
                title="Collapse All Criteria"
              >
                Collapse
              </Button>
            </div>
          </div>
        </div>

        {/* Live score progress bar */}
        <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 rounded-full"
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>
      </div>

      {/* Criteria Breakdown List */}
      <div className="space-y-3">
        {sortedCriteria.map((criterion, cIdx) => {
          const isCollapsed = collapsedCriteria[criterion.id];
          const hasScore = selectedLevels[criterion.id] !== undefined;
          const currentCriterionScore = selectedLevels[criterion.id] ?? 0;
          const sortedLevels = [...(criterion.levels || [])].sort(
            (a, b) => (b.marks ?? 0) - (a.marks ?? 0),
          );

          return (
            <div
              key={criterion.id || cIdx}
              className={cn(
                "border rounded-2xl overflow-hidden transition-all bg-card/40 backdrop-blur-xs",
                hasScore ? "border-primary/30" : "border-border/50",
              )}
            >
              {/* Criterion Header (Collapsible toggle) */}
              <div
                onClick={() => toggleCriterion(criterion.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleCriterion(criterion.id);
                  }
                }}
                className="w-full p-3 flex items-center justify-between hover:bg-muted/20 transition-colors text-left cursor-pointer select-none gap-2"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div
                    className={cn(
                      "size-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                      hasScore
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {cIdx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Label className="text-xs font-semibold text-foreground cursor-pointer">
                        {renderRichMathText(criterion.title)}
                      </Label>
                      {hasScore && (
                        <Badge className="text-[9px] font-mono px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                          {currentCriterionScore} / {criterion.max_marks} pts
                        </Badge>
                      )}
                    </div>
                    {criterion.description && !isCollapsed && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                        {renderRichMathText(criterion.description)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {hasScore && !readOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={(e) => handleResetCriterion(criterion.id, e)}
                      className="h-6 w-6 p-0 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                      title="Clear criterion score"
                    >
                      <RotateCcw className="size-3" />
                    </Button>
                  )}
                  {isCollapsed ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronUp className="size-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Levels Grid (visible when expanded) */}
              {!isCollapsed && (
                <div className="p-3 pt-0 border-t border-border/20 space-y-2 animate-in fade-in duration-150">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2">
                    {sortedLevels.map((level) => {
                      const isSelected = selectedLevels[criterion.id] === level.marks;
                      return (
                        <button
                          key={level.id}
                          type="button"
                          onClick={() =>
                            handleLevelSelect(
                              criterion.id,
                              criterion.title,
                              level.marks,
                              criterion.max_marks,
                            )
                          }
                          disabled={readOnly}
                          className={cn(
                            "text-left p-2.5 rounded-xl border transition-all relative group flex flex-col justify-between min-h-[64px]",
                            isSelected
                              ? "bg-primary/10 border-primary shadow-xs ring-1 ring-primary/30"
                              : "bg-background hover:bg-muted/30 border-border/40 text-foreground",
                            readOnly && "cursor-default opacity-80",
                          )}
                        >
                          <div>
                            <div className="flex justify-between items-start mb-1 gap-1">
                              <span
                                className={cn(
                                  "text-[10px] font-semibold uppercase tracking-tight line-clamp-1",
                                  isSelected ? "text-primary" : "text-muted-foreground",
                                )}
                              >
                                {renderRichMathText(level.title)}
                              </span>
                              <span
                                className={cn(
                                  "text-[10px] font-mono font-bold shrink-0",
                                  isSelected ? "text-primary font-extrabold" : "text-muted-foreground",
                                )}
                              >
                                {level.marks} pts
                              </span>
                            </div>
                            {level.description && (
                              <p className="text-[10px] leading-relaxed text-muted-foreground line-clamp-3 group-hover:line-clamp-none">
                                {renderRichMathText(level.description)}
                              </p>
                            )}
                          </div>

                          {isSelected && (
                            <div className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground rounded-full p-0.5 shadow-xs">
                              <Check className="size-3" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
