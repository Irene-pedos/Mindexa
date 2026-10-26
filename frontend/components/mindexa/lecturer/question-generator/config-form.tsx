"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Library,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentOption, Destination, GeneratorForm } from "@/hooks/use-question-generation";
import { cn } from "@/lib/utils";
import {
  BATCH_SIZES,
  BLOOM_LEVELS,
  DIFFICULTIES,
  MAX_BATCH_COUNT,
  QUESTION_FORMATS,
  SUGGESTED_TOPICS,
} from "./constants";

interface ConfigFormProps {
  form: GeneratorForm;
  onChange: (patch: Partial<GeneratorForm>) => void;
  destination: Destination;
  onDestinationChange: (destination: Destination) => void;
  assessments: AssessmentOption[];
  selectedAssessmentId: string;
  onAssessmentChange: (id: string) => void;
  /** Why the previous attempt failed, if it did. */
  error: string | null;
  onSubmit: () => void;
}

const tile = "space-y-2.5 rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs sm:p-4";
const choice = (selected: boolean) =>
  cn(
    "cursor-pointer rounded-lg border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
    selected
      ? "border-primary bg-primary/[0.04] font-semibold text-foreground shadow-2xs ring-1 ring-primary/20"
      : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/30"
  );

function TileHeading({ title, hint, required }: { title: string; hint: string; required?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
        <span className="size-1.5 rounded-full bg-primary" />
        <span>{title}</span>
        {required && <span className="text-destructive">*</span>}
      </span>
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </div>
  );
}

/** Stage 1: describe what to generate and where the approved questions should go. */
export function ConfigForm({
  form,
  onChange,
  destination,
  onDestinationChange,
  assessments,
  selectedAssessmentId,
  onAssessmentChange,
  error,
  onSubmit,
}: ConfigFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="space-y-3.5"
    >
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive shadow-2xs"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-0.5">
            <span className="block font-semibold">Generation Note</span>
            <p className="opacity-90">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12">
        <div className="space-y-3.5 lg:col-span-7">
          <Card className={tile}>
            <div className="flex items-center justify-between">
              <Label htmlFor="generator-topic" className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <span className="size-1.5 rounded-full bg-primary" />
                <span>Curriculum Topic / Concept</span>
                <span className="text-destructive">*</span>
              </Label>
              <span className="text-[10px] text-muted-foreground">Syllabus-aligned</span>
            </div>
            <Input
              id="generator-topic"
              value={form.topic}
              onChange={(e) => onChange({ topic: e.target.value })}
              placeholder="e.g. Database Normalization (1NF, 2NF, BCNF) & Dependencies"
              className="h-9 rounded-lg border-border/70 bg-background px-3 text-xs"
              required
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground">Presets:</span>
              {SUGGESTED_TOPICS.map((topic) => (
                <button
                  type="button"
                  key={topic}
                  onClick={() => onChange({ topic })}
                  title={topic}
                  className="cursor-pointer rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {topic.split(" ")[0]}
                </button>
              ))}
            </div>
          </Card>

          <Card className={tile}>
            <TileHeading title="Question Format" hint="Select structure" required />
            <div role="radiogroup" aria-label="Question format" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QUESTION_FORMATS.map((format) => {
                const Icon = format.icon;
                const selected = form.question_type === format.id;
                return (
                  <button
                    key={format.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onChange({ question_type: format.id })}
                    title={format.description}
                    className={cn(choice(selected), "relative flex flex-col justify-between gap-1")}
                  >
                    <span className="flex items-center justify-between">
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-md",
                          selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      {selected && <span className="size-1.5 rounded-full bg-primary" />}
                    </span>
                    <span>
                      <span className="block text-xs font-bold leading-tight text-foreground">{format.title}</span>
                      <span className="mt-0.5 line-clamp-1 block text-[10px] leading-tight text-muted-foreground">
                        {format.shortLabel}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="px-1">
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <SlidersHorizontal className="size-3" />
                  <span>{showAdvanced ? "Hide" : "Add"} Pedagogical Instructions &amp; Focus (Optional)</span>
                  {showAdvanced ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/25 p-3">
                  <Label htmlFor="generator-context" className="text-[11px] font-semibold text-foreground">
                    Custom Constraints &amp; Rubric Focus
                  </Label>
                  <Textarea
                    id="generator-context"
                    value={form.additional_context}
                    onChange={(e) => onChange({ additional_context: e.target.value })}
                    placeholder="e.g. Focus on edge cases. Ensure distractors address common student misconceptions."
                    className="min-h-[64px] resize-none rounded-lg bg-background p-2.5 text-xs"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        <div className="space-y-3.5 lg:col-span-5">
          <Card className={tile}>
            <TileHeading title="Destination" hint="Storage target" />
            <div role="radiogroup" aria-label="Destination" className="grid grid-cols-2 gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={destination === "bank"}
                onClick={() => onDestinationChange("bank")}
                className={cn(choice(destination === "bank"), "flex items-center gap-2")}
              >
                <Library className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-foreground">Question Bank</span>
                  <span className="block truncate text-[10px] text-muted-foreground">Subject bank</span>
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={destination === "assessment"}
                onClick={() => onDestinationChange("assessment")}
                className={cn(choice(destination === "assessment"), "flex items-center gap-2")}
              >
                <FileText className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-foreground">Exam Draft</span>
                  <span className="block truncate text-[10px] text-muted-foreground">Attach to paper</span>
                </span>
              </button>
            </div>

            {destination === "assessment" && (
              <div className="pt-1">
                <select
                  aria-label="Draft assessment"
                  value={selectedAssessmentId}
                  onChange={(e) => onAssessmentChange(e.target.value)}
                  className="h-8.5 w-full cursor-pointer rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground outline-none"
                >
                  {assessments.length === 0 && <option value="">No draft assessments</option>}
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} ({a.assessment_type})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Card>

          <Card className={cn(tile, "space-y-3")}>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-bold text-foreground">Difficulty Level</Label>
                <span className="text-[10px] capitalize text-muted-foreground">{form.difficulty}</span>
              </div>
              <div role="radiogroup" aria-label="Difficulty level" className="grid grid-cols-3 gap-1.5">
                {DIFFICULTIES.map((difficulty) => {
                  const selected = form.difficulty === difficulty.value;
                  return (
                    <button
                      type="button"
                      key={difficulty.value}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onChange({ difficulty: difficulty.value })}
                      className={cn(
                        "flex h-8 cursor-pointer items-center justify-center rounded-lg border text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        selected
                          ? `${difficulty.color} font-bold shadow-2xs ring-1 ring-primary/20`
                          : "border-border/60 text-muted-foreground hover:bg-muted/30"
                      )}
                    >
                      {difficulty.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-foreground">Bloom&apos;s Taxonomy Level</Label>
              <Select value={form.bloom_level} onValueChange={(value) => onChange({ bloom_level: value })}>
                <SelectTrigger aria-label="Bloom's taxonomy level" className="h-8.5 rounded-lg bg-background text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOOM_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      <span className="text-xs font-semibold">{level.label}</span>
                      <span className="ml-1.5 text-[10px] text-muted-foreground">({level.desc})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="generator-count" className="text-[11px] font-bold text-foreground">
                Batch Count
              </Label>
              <div className="flex items-center gap-1.5">
                {BATCH_SIZES.map((size) => (
                  <button
                    type="button"
                    key={size}
                    onClick={() => onChange({ count: size })}
                    aria-pressed={form.count === size}
                    className={cn(
                      "h-8 flex-1 cursor-pointer rounded-lg border px-2.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      form.count === size
                        ? "border-primary bg-primary font-bold text-primary-foreground shadow-2xs"
                        : "border-border/60 text-muted-foreground hover:bg-muted/30"
                    )}
                  >
                    {size}
                  </button>
                ))}
                <Input
                  id="generator-count"
                  type="number"
                  min={1}
                  max={MAX_BATCH_COUNT}
                  value={form.count}
                  onChange={(e) =>
                    onChange({ count: Math.max(1, Math.min(MAX_BATCH_COUNT, parseInt(e.target.value, 10) || 1)) })
                  }
                  className="h-8 w-14 rounded-lg bg-background px-1 text-center text-xs font-bold"
                />
              </div>
            </div>
          </Card>

          <div className="space-y-2 pt-0.5">
            <Button
              type="submit"
              className="h-10 w-full cursor-pointer gap-2 rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90"
            >
              <Sparkles className="size-3.5" />
              <span>Synthesize Candidate Questions</span>
              <ArrowRight className="size-3.5" />
            </Button>
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Mandatory audit: Staged for explicit sign-off</span>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
