"use client";

import React from "react";
import { Sparkles, CheckCircle2, ChevronRight, BookOpen } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";
import { LessonSection } from "@/lib/api/study-planner";

interface LessonSectionRendererProps {
  section: LessonSection;
  sectionIndex: number;
  totalSections: number;
  onNextSection: () => void;
  onPrevSection: () => void;
  onStartPractice: () => void;
}

export function LessonSectionRenderer({
  section,
  sectionIndex,
  totalSections,
  onNextSection,
  onPrevSection,
  onStartPractice,
}: LessonSectionRendererProps) {
  const isLastSection = sectionIndex >= totalSections - 1;

  return (
    <Card className="border-border/70 bg-card shadow-md rounded-2xl overflow-hidden">
      <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px] font-semibold text-primary border-primary/30">
                Section {sectionIndex + 1} of {totalSections}
              </Badge>
            </div>
            <CardTitle className="text-xl font-bold text-foreground">
              {section.section_title}
            </CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 md:p-8 space-y-6">
        {/* Main Section Content formatted via RichMessageRenderer */}
        <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed">
          <RichMessageRenderer content={section.content} />
        </div>

        {/* Key Takeaways / Points */}
        {section.key_points && section.key_points.length > 0 && (
          <div className="mt-8 rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
              <Sparkles className="size-4" /> Key Concept Takeaways
            </h4>
            <div className="grid gap-2.5">
              {section.key_points.map((point, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-foreground/90 font-medium">
                  <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section Action Navigation */}
        <div className="pt-6 border-t border-border/50 flex items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={onPrevSection}
            disabled={sectionIndex === 0}
            className="text-xs"
          >
            Previous Section
          </Button>

          <div className="flex items-center gap-3">
            {!isLastSection ? (
              <Button onClick={onNextSection} className="text-xs font-semibold gap-1.5">
                Next Section <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button
                onClick={onStartPractice}
                className="text-xs font-semibold gap-1.5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-600/90 text-primary-foreground shadow-md"
              >
                Continue to Practice <ChevronRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
