"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckSquare,
  Download,
  FileText,
  Layers,
  ListChecks,
  RefreshCw,
  Sparkles,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";
import { downloadTextFile } from "@/lib/download-text-file";
import { studentAiApi, type RevisionGuideOutput } from "@/lib/api/student-ai";
import type { StudentCourseListItem } from "@/lib/api/student";
import { studyPlannerApi, type LearningUnit } from "@/lib/api/study-planner";
import { cn } from "@/lib/utils";

interface RevisionCenterProps {
  workspaces: StudentCourseListItem[];
  workspaceId: string | null;
  onWorkspaceChange: (id: string) => void;
  /** Topic to pre-fill (when the student arrives from a study session). */
  initialTopic?: string;
  /** Start a Socratic review of this topic in the chat tab. */
  onStartSocraticReview: (topic: string) => void;
  onError: (error: unknown, fallbackMessage: string) => void;
}

/** Generated titles may already read "Unit N: ..."; only prefix the number when they don't. */
const hasUnitPrefix = (title: string) => /^unit\s*\d+\s*[:.-]/i.test(title);

/**
 * Curriculum revision: pick an official learning unit of a course for a Socratic chat or an
 * offline revision sheet (summary, recall checklist, readings), or enter any topic.
 */
export function RevisionCenter({
  workspaces,
  workspaceId,
  onWorkspaceChange,
  initialTopic,
  onStartSocraticReview,
  onError,
}: RevisionCenterProps) {
  const [units, setUnits] = useState<LearningUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<LearningUnit | null>(null);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [customTopic, setCustomTopic] = useState(initialTopic?.trim() ?? "");
  const [guide, setGuide] = useState<RevisionGuideOutput | null>(null);
  const [generating, setGenerating] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    if (initialTopic?.trim()) setCustomTopic(initialTopic.trim());
  }, [initialTopic]);

  // Load the course's learning units; ignore a response that arrives after the course changed.
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setLoadingUnits(true);
    studyPlannerApi
      .getLearningUnits(workspaceId)
      .then((result) => {
        if (cancelled) return;
        setUnits(result);
        setSelectedUnit(result[0] ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setUnits([]);
        setSelectedUnit(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingUnits(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const generateSheet = async (unit: LearningUnit | null) => {
    const topic = unit ? unit.title : customTopic.trim();
    if (!topic) {
      toast.error("Please select a learning unit or enter a topic name.");
      return;
    }
    setGenerating(true);
    setGuide(null);
    setChecked(new Set());
    try {
      const result = await studentAiApi.getRevisionGuide({
        topic,
        learningUnitId: unit?.id || undefined,
        teachingWorkspaceId: workspaceId || undefined,
      });
      setGuide(result);
      toast.success("Structured revision guide generated!");
    } catch (err) {
      onError(err, "Failed to generate revision guide.");
    } finally {
      setGenerating(false);
    }
  };

  const toggleChecked = (index: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const downloadGuide = () => {
    if (!guide?.markdown) return;
    const safeName = (guide.title || "Revision_Guide").replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadTextFile(`${safeName}_Revision_Sheet.md`, guide.markdown);
    toast.success("Revision sheet downloaded as markdown file!");
  };

  return (
    <div className="narrow-scrollbar-dark mx-auto w-full max-w-4xl flex-1 space-y-6 overflow-y-auto p-4 md:p-6 lg:max-w-5xl 2xl:max-w-6xl">
      <div className="flex flex-col justify-between gap-3 border-b border-border/40 pb-2 sm:flex-row sm:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-foreground">
            <BookOpen className="size-4 text-primary" />
            Curriculum Revision Center
          </h2>
          <p className="text-xs text-muted-foreground">
            Select an official course Learning Unit to start an interactive Socratic review or generate an offline
            revision guide.
          </p>
        </div>

        {workspaces.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <label htmlFor="revision-course" className="text-xs font-semibold text-muted-foreground">
              Course:
            </label>
            <select
              id="revision-course"
              value={workspaceId || ""}
              onChange={(e) => {
                onWorkspaceChange(e.target.value);
                setGuide(null);
              }}
              className="h-8 rounded-lg border border-border/70 bg-muted/40 px-2.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.code}: {ws.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Layers className="size-3.5 text-primary" />
            Course Learning Units
          </div>
          {units.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {units.length} Units Available
            </Badge>
          )}
        </div>

        {loadingUnits ? (
          <div className="rounded-xl border border-border/40 bg-muted/20 p-8 text-center">
            <Spinner className="mx-auto mb-2 size-6 text-primary" />
            <p className="text-xs font-medium text-muted-foreground">Loading curriculum learning units...</p>
          </div>
        ) : units.length === 0 ? (
          <Card className="rounded-xl border border-dashed border-border/60 bg-card p-4 shadow-none">
            <CardHeader className="p-0 pb-3">
              <CardTitle className="text-xs font-semibold text-foreground">Custom Revision Topic</CardTitle>
              <CardDescription className="text-xs">
                No auto-extracted units found for this course. Enter any topic or concept name to revise.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-0">
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Relational Calculus & Query Optimization"
                  aria-label="Revision topic"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  className="h-9 flex-1 text-xs"
                />
                <Button
                  onClick={() => generateSheet(null)}
                  disabled={generating || !customTopic.trim()}
                  className="h-9 px-4 text-xs font-semibold"
                >
                  {generating && <RefreshCw className="mr-1.5 size-3.5 animate-spin" />}
                  Generate Sheet
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {units.map((unit) => {
              const isSelected = selectedUnit?.id === unit.id;
              return (
                <div
                  key={unit.id}
                  className={cn(
                    "space-y-2 rounded-xl border bg-card p-3.5 text-left text-xs transition-all",
                    isSelected ? "border-primary bg-primary/5 shadow-2xs" : "border-border/60 hover:border-border hover:bg-muted/20"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedUnit(unit)}
                    aria-pressed={isSelected}
                    className="block w-full space-y-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="line-clamp-1 text-xs font-semibold leading-snug text-foreground">
                        {!hasUnitPrefix(unit.title) && (
                          <span className="mr-1.5 font-mono text-primary">Unit {unit.order_index}:</span>
                        )}
                        {unit.title}
                      </span>
                      {unit.estimated_study_minutes && (
                        <Badge variant="outline" className="shrink-0 px-1.5 py-0 font-mono text-[10px]">
                          {unit.estimated_study_minutes}m
                        </Badge>
                      )}
                    </span>
                    {unit.summary && (
                      <span className="line-clamp-2 block text-[11px] leading-relaxed text-muted-foreground">
                        {unit.summary}
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-2 border-t border-border/40 pt-1">
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 flex-1 gap-1 text-[11px] font-semibold"
                      onClick={() => onStartSocraticReview(unit.title)}
                    >
                      <Sparkles className="size-3" />
                      <span>Socratic Chat</span>
                      <ArrowRight className="ml-0.5 size-2.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-[11px] font-semibold"
                      onClick={() => {
                        setSelectedUnit(unit);
                        generateSheet(unit);
                      }}
                      disabled={generating}
                      title="Generate offline revision guide (.md)"
                    >
                      <Download className="size-3" />
                      <span>Sheet</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {generating && (
        <div className="py-2">
          <Marker role="status" className="rounded-xl border border-border bg-card p-4">
            <MarkerIcon>
              <Spinner />
            </MarkerIcon>
            <MarkerContent className="shimmer text-xs">
              Compiling structured offline revision sheet and learning checklist...
            </MarkerContent>
          </Marker>
        </div>
      )}

      {guide && (
        <div className="animate-in fade-in space-y-4 duration-300">
          <Card className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-none">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 bg-muted/20 px-4 py-3">
              <div>
                <CardTitle className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                  <ListChecks className="size-4" />
                  <span>{guide.title || "Revision Guide"}</span>
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Summary, interactive recall checklist, and readings drawn from your course materials.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-background text-xs font-semibold" onClick={downloadGuide}>
                  <Download className="size-3.5 text-primary" />
                  <span>Download .md</span>
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-semibold"
                  onClick={() => onStartSocraticReview(guide.title || "Revision Topic")}
                >
                  <Sparkles className="size-3.5" />
                  <span>Practice in Chat</span>
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 p-4">
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Core Concept Summary</h4>
                <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
                  <RichMessageRenderer content={guide.summary} />
                </div>
              </div>

              {guide.checklist && guide.checklist.length > 0 && (
                <div className="space-y-2 border-t border-border/40 pt-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Actionable Learning Checklist
                    </h4>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {checked.size}/{guide.checklist.length} Mastered
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 pl-1 text-xs font-medium sm:grid-cols-2">
                    {guide.checklist.map((item, index) => {
                      const isChecked = checked.has(index);
                      return (
                        <button
                          key={index}
                          type="button"
                          role="checkbox"
                          aria-checked={isChecked}
                          onClick={() => toggleChecked(index)}
                          className={cn(
                            "flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                            isChecked
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 line-through opacity-80 dark:text-emerald-200"
                              : "border-border/60 bg-muted/20 text-foreground hover:bg-muted/40"
                          )}
                        >
                          {isChecked ? (
                            <CheckSquare className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                          ) : (
                            <Square className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="leading-snug">{item}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {guide.readings && guide.readings.length > 0 && (
                <div className="space-y-2 border-t border-border/40 pt-2">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <BookOpen className="size-3.5 text-primary" />
                    Recommended Readings &amp; References
                  </h4>
                  <div className="grid grid-cols-1 gap-2 pl-1">
                    {guide.readings.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 text-left text-xs"
                      >
                        <FileText className="size-4 shrink-0 text-primary" />
                        <span className="font-medium text-foreground">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
