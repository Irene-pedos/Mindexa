"use client";

import React, { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

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
}

export function RubricGradingPanel({ 
  rubric, 
  currentScores = [], 
  onScoresChange,
  readOnly = false 
}: RubricGradingPanelProps) {
  const [selectedLevels, setSelectedScores] = useState<Record<string, number>>(
    currentScores.reduce((acc, curr) => ({ ...acc, [curr.criterion_id]: curr.score }), {})
  );

  const handleLevelSelect = (criterionId: string, criterionTitle: string, marks: number, max: number) => {
    if (readOnly) return;
    
    const newSelected = { ...selectedLevels, [criterionId]: marks };
    setSelectedScores(newSelected);
    
    // Convert to the array format the API expects
    const scoresArray = Object.entries(newSelected).map(([id, score]) => {
      // Find the title for this criterion
      const criterion = rubric.criteria.find(c => c.id === id);
      return {
        criterion_id: id,
        criterion_title: criterion?.title || "Criterion",
        score: score,
        max: criterion?.max_marks || 10
      };
    });
    
    onScoresChange(scoresArray);
  };

  const totalScore = Object.values(selectedLevels).reduce((a, b) => a + b, 0);
  const maxScore = rubric.criteria.reduce((a, b) => a + b.max_marks, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/80">
          Rubric: {rubric.title}
        </h3>
        <div className="text-xs font-mono font-bold bg-primary/10 text-primary px-2 py-1 rounded">
          Total: {totalScore} / {maxScore}
        </div>
      </div>

      <div className="space-y-8">
        {rubric.criteria.sort((a, b) => a.order_index - b.order_index).map((criterion) => (
          <div key={criterion.id} className="space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <Label className="text-xs font-bold text-foreground/90">{criterion.title}</Label>
                {criterion.description && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{criterion.description}</p>
                )}
              </div>
              <Badge variant="outline" className="text-[10px] font-mono h-5">
                {selectedLevels[criterion.id] ?? 0} / {criterion.max_marks}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {criterion.levels.sort((a, b) => b.marks - a.marks).map((level) => {
                const isSelected = selectedLevels[criterion.id] === level.marks;
                return (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => handleLevelSelect(criterion.id, criterion.title, level.marks, criterion.max_marks)}
                    disabled={readOnly}
                    className={cn(
                      "text-left p-2.5 rounded-lg border transition-all relative group",
                      isSelected 
                        ? "bg-primary/5 border-primary shadow-[0_0_0_1px_inset_rgba(var(--primary),0.1)]" 
                        : "bg-background hover:bg-muted/30 border-muted"
                    )}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-tight",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )}>
                        {level.title}
                      </span>
                      <span className={cn(
                        "text-[10px] font-mono font-bold",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )}>
                        {level.marks} pts
                      </span>
                    </div>
                    {level.description && (
                      <p className="text-[10px] leading-snug text-muted-foreground line-clamp-3 group-hover:line-clamp-none">
                        {level.description}
                      </p>
                    )}
                    {isSelected && (
                      <div className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm">
                        <Check className="size-2.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
