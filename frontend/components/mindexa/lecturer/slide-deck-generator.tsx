"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles,
  Download,
  BookOpen,
  Layers,
  Clock,
  Check,
  Copy,
  FileCode,
  Loader2,
  AlertTriangle,
  Lightbulb,
  Mic,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { toast } from "sonner";
import {
  lecturerAiApi,
  LearningUnitItem,
  SlideDeckOutput,
  SlideItem,
} from "@/lib/api/lecturer-ai";
import { cn } from "@/lib/utils";

interface SlideDeckGeneratorProps {
  workspaceId: string;
  workspaceName?: string;
  isRwandaBlocked?: boolean;
}

export function SlideDeckGenerator({
  workspaceId,
  workspaceName,
  isRwandaBlocked = false,
}: SlideDeckGeneratorProps) {
  const [learningUnits, setLearningUnits] = useState<LearningUnitItem[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [selectedLuId, setSelectedLuId] = useState<string>("");
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);

  const [estimatedDuration, setEstimatedDuration] = useState<number>(45);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [generatedDeck, setGeneratedDeck] = useState<SlideDeckOutput | null>(null);

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  // Fetch learning units when workspace changes
  useEffect(() => {
    if (!workspaceId) {
      setLearningUnits([]);
      setSelectedLuId("");
      return;
    }

    async function loadLUs() {
      try {
        setLoadingUnits(true);
        const units = await lecturerAiApi.getWorkspaceLearningUnits(workspaceId);
        setLearningUnits(units || []);
        if (units && units.length > 0) {
          setSelectedLuId(units[0].id);
        } else {
          setSelectedLuId("");
        }
      } catch (err: any) {
        console.error("Failed to load learning units", err);
        toast.error("Could not fetch learning units for this workspace.");
      } finally {
        setLoadingUnits(false);
      }
    }
    loadLUs();
  }, [workspaceId]);

  const [selectedOutcomes, setSelectedOutcomes] = useState<string[]>([]);

  // Update selected outcomes when selected LU changes
  useEffect(() => {
    const lu = learningUnits.find((u) => u.id === selectedLuId);
    if (lu && lu.learning_outcomes && lu.learning_outcomes.length > 0) {
      setSelectedOutcomes(lu.learning_outcomes);
    } else {
      setSelectedOutcomes([]);
    }
  }, [selectedLuId, learningUnits]);

  const toggleOutcome = (outcome: string) => {
    setSelectedOutcomes((prev) =>
      prev.includes(outcome) ? prev.filter((o) => o !== outcome) : [...prev, outcome]
    );
  };

  const handleGenerate = async () => {
    if (!selectedLuId) {
      toast.error("Please select a Learning Unit first.");
      return;
    }
    if (isRwandaBlocked) {
      toast.error("AI operations are restricted for Kinyarwanda language workspaces.");
      return;
    }

    try {
      setIsGenerating(true);
      const res = await lecturerAiApi.generateSlideDeck(
        selectedLuId,
        estimatedDuration,
        selectedOutcomes.length > 0 ? selectedOutcomes : undefined
      );
      setGeneratedDeck(res.deck);
      setActiveSlideIndex(0);
      toast.success(`Generated ${res.deck.slides.length} lecture slides!`);
    } catch (err: any) {
      console.error("Failed to generate slide deck", err);
      toast.error(err.message || "Failed to generate slide deck.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPptx = async () => {
    if (!generatedDeck) return;
    try {
      setIsExporting(true);
      const blob = await lecturerAiApi.exportSlideDeckPptx(generatedDeck);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cleanTitle = generatedDeck.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
      a.download = `${cleanTitle || "lecture-slides"}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PowerPoint (.pptx) downloaded successfully!");
    } catch (err: any) {
      console.error("Failed to export pptx", err);
      toast.error(err.message || "Failed to export PowerPoint file.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyOutline = () => {
    if (!generatedDeck) return;
    let text = `# ${generatedDeck.title}\n\n`;
    text += `**Audience:** ${generatedDeck.target_audience} | **Duration:** ~${generatedDeck.estimated_minutes} mins\n\n`;
    generatedDeck.slides.forEach((s, idx) => {
      text += `## Slide ${idx + 1}: ${s.title}\n`;
      s.bullet_points.forEach((b) => {
        text += `- ${b}\n`;
      });
      if (s.visual_idea) {
        text += `> Visual: ${s.visual_idea}\n`;
      }
      if (s.speaker_notes) {
        text += `\n*Speaker Notes:* ${s.speaker_notes}\n`;
      }
      text += `\n---\n\n`;
    });

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Slide deck outline copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  // Editable Slide handlers
  const updateSlideField = (index: number, field: keyof SlideItem, value: any) => {
    if (!generatedDeck) return;
    const nextSlides = [...generatedDeck.slides];
    nextSlides[index] = { ...nextSlides[index], [field]: value };
    setGeneratedDeck({ ...generatedDeck, slides: nextSlides });
  };

  const updateSlideBullet = (slideIdx: number, bulletIdx: number, value: string) => {
    if (!generatedDeck) return;
    const nextSlides = [...generatedDeck.slides];
    const nextBullets = [...nextSlides[slideIdx].bullet_points];
    nextBullets[bulletIdx] = value;
    nextSlides[slideIdx] = { ...nextSlides[slideIdx], bullet_points: nextBullets };
    setGeneratedDeck({ ...generatedDeck, slides: nextSlides });
  };

  const selectedLu = learningUnits.find((u) => u.id === selectedLuId);

  return (
    <div className="flex-1 p-3 sm:p-5 lg:p-6 overflow-y-auto space-y-4 w-full max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-border/40 pb-3 gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="size-4 text-primary" /> Slide Deck from Learning Unit
          </h3>
          <p className="text-xs text-muted-foreground">
            Generate pedagogical 8–15 slide presentations grounded directly in a bounded 30–60 minute Learning Unit.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsControlsCollapsed(!isControlsCollapsed)}
            className="h-8 text-xs gap-1.5 border-border/60 hover:bg-muted/50"
            title={isControlsCollapsed ? "Expand target unit controls" : "Collapse panel to focus on slide deck"}
          >
            {isControlsCollapsed ? (
              <>
                <PanelLeftOpen className="size-3.5 text-primary" />
                <span className="hidden sm:inline">Show Controls</span>
              </>
            ) : (
              <>
                <PanelLeftClose className="size-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Focus Editor</span>
              </>
            )}
          </Button>

          {generatedDeck && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyOutline}
                className="h-8 text-xs gap-1.5"
              >
                {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                <span>{copied ? "Copied" : "Copy Outline"}</span>
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleDownloadPptx}
                disabled={isExporting}
                className="h-8 text-xs gap-1.5 font-semibold bg-primary text-primary-foreground shadow-xs"
              >
                {isExporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                <span>Download .PPTX</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {isRwandaBlocked && (
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
          <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-semibold">AI Slide Generation Restricted</strong>
            <span>
              Per institutional policies, AI generation is disabled for Kinyarwanda language courses.
            </span>
          </div>
        </div>
      )}

      {/* Main Grid: Collapsible Controls, Expandable Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Learning Unit Selection & Parameters */}
        {!isControlsCollapsed && (
          <Card className="lg:col-span-4 p-4 space-y-4 bg-muted/20 border-border/60 rounded-2xl shadow-xs transition-all">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">Target Learning Unit</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsControlsCollapsed(true)}
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hidden lg:flex"
                title="Collapse controls"
              >
                <PanelLeftClose className="size-3.5" />
              </Button>
            </div>

            <div className="space-y-1.5">
              {loadingUnits ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 animate-pulse">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>Segmenting & loading units...</span>
                </div>
              ) : learningUnits.length === 0 ? (
                <div className="p-3 rounded-xl border border-border/70 bg-card text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">No Learning Units Found</p>
                  <p className="text-[11px]">
                    Upload course notes or handouts in this workspace to automatically segment curriculum units.
                  </p>
                </div>
              ) : (
                <select
                  value={selectedLuId}
                  onChange={(e) => setSelectedLuId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-border text-xs px-2.5 bg-background text-foreground outline-none font-medium transition-colors focus:ring-1 focus:ring-primary"
                >
                  {learningUnits.map((lu) => (
                    <option key={lu.id} value={lu.id}>
                      Unit {lu.order_index}: {lu.title} (~{lu.estimated_study_minutes}m)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedLu && (
              <div className="p-3.5 bg-card border border-border/60 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center text-muted-foreground text-[11px]">
                  <span className="font-medium text-foreground/80">Curriculum Source:</span>
                  <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-mono font-semibold">
                    Unit {selectedLu.order_index}
                  </Badge>
                </div>
                <p className="font-semibold text-foreground text-xs leading-snug">{selectedLu.title}</p>
                {selectedLu.summary && (
                  <p className="text-[11px] text-muted-foreground line-clamp-3 leading-relaxed">
                    {selectedLu.summary}
                  </p>
                )}
                <div className="flex items-center gap-2.5 pt-1 text-[11px] text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3 text-primary" /> ~{selectedLu.estimated_study_minutes}m
                  </span>
                  {selectedLu.start_page && (
                    <span className="flex items-center gap-1 font-mono text-[10px] bg-muted/60 px-1.5 py-0.5 rounded">
                      <BookOpen className="size-3 text-primary" /> p. {selectedLu.start_page}{selectedLu.end_page && selectedLu.end_page !== selectedLu.start_page ? `–${selectedLu.end_page}` : ""}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Layers className="size-3 text-primary" /> {selectedLu.chunk_count} chunks
                  </span>
                </div>

                {selectedLu.learning_outcomes && selectedLu.learning_outcomes.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-border/40">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/90">Learning Outcomes ({selectedLu.learning_outcomes.length}):</span>
                      <span className="text-[10px] text-muted-foreground/70">Click to filter</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {selectedLu.learning_outcomes.map((outcome, idx) => {
                        const isSelected = selectedOutcomes.includes(outcome);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleOutcome(outcome)}
                            className={cn(
                              "text-[10px] px-2 py-1 rounded-lg border text-left transition-all",
                              isSelected
                                ? "bg-primary/15 text-primary border-primary/40 font-medium"
                                : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted"
                            )}
                          >
                            {isSelected ? "✓ " : ""}{outcome}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="deck-duration" className="text-xs font-semibold">
                Estimated Lecture Duration (minutes)
              </Label>
              <Input
                id="deck-duration"
                type="number"
                min={10}
                max={180}
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(parseInt(e.target.value) || 45)}
                className="h-9 text-xs bg-background rounded-xl"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !selectedLuId || isRwandaBlocked}
              className="w-full h-9.5 text-xs font-semibold text-primary-foreground bg-primary rounded-xl shadow-xs"
            >
              {isGenerating ? (
                <RefreshCw className="size-3.5 animate-spin mr-1.5" />
              ) : (
                <Sparkles className="size-3.5 mr-1.5" />
              )}
              Generate Slide Deck
            </Button>
          </Card>
        )}

        {/* Right Column: Slide Outline & Deck Viewer (Expands to full col-span-12 when controls collapsed) */}
        <div className={cn(
          "flex flex-col space-y-3 transition-all duration-200",
          isControlsCollapsed ? "lg:col-span-12" : "lg:col-span-8"
        )}>
          {/* Collapsed Bar Helper */}
          {isControlsCollapsed && selectedLu && (
            <div className="p-2.5 bg-muted/30 border border-border/60 rounded-xl flex items-center justify-between text-xs gap-3">
              <div className="flex items-center gap-2 truncate">
                <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                  Unit {selectedLu.order_index}
                </Badge>
                <span className="font-semibold text-foreground truncate">{selectedLu.title}</span>
                {selectedLu.start_page && (
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">
                    (p. {selectedLu.start_page}{selectedLu.end_page && selectedLu.end_page !== selectedLu.start_page ? `–${selectedLu.end_page}` : ""})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsControlsCollapsed(false)}
                  className="h-7 text-[11px] px-2.5 gap-1"
                >
                  <PanelLeftOpen className="size-3 text-primary" />
                  <span>Edit Source Unit</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleGenerate}
                  disabled={isGenerating || isRwandaBlocked}
                  className="h-7 text-[11px] px-2.5 gap-1 font-semibold"
                >
                  <RefreshCw className={cn("size-3", isGenerating && "animate-spin")} />
                  <span>Regenerate</span>
                </Button>
              </div>
            </div>
          )}

          {isGenerating ? (
            <Card className="p-12 flex flex-col items-center justify-center space-y-3 border-border/60 rounded-2xl min-h-[420px]">
              <Loader2 className="size-8 text-primary animate-spin" />
              <div className="text-center space-y-1">
                <p className="text-xs font-semibold text-foreground">
                  Synthesizing Bounded Learning Unit into Slide Deck...
                </p>
                <p className="text-[11px] text-muted-foreground max-w-sm">
                  Formatting pedagogical hierarchy, bullet points, visual cues, and speaker notes.
                </p>
              </div>
            </Card>
          ) : !generatedDeck ? (
            <Card className="p-12 flex flex-col items-center justify-center space-y-3 border-border/60 rounded-2xl min-h-[420px] text-center">
              <div className="size-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-xs">
                <BookOpen className="size-5 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">No Slide Deck Generated Yet</h4>
                <p className="text-xs text-muted-foreground max-w-md">
                  Select a curriculum Learning Unit from the controls panel and click &ldquo;Generate Slide Deck&rdquo; to build an editable, exportable presentation.
                </p>
              </div>
              {isControlsCollapsed && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsControlsCollapsed(false)}
                  className="text-xs gap-1.5 mt-2"
                >
                  <PanelLeftOpen className="size-3.5 text-primary" />
                  <span>Open Target Unit Controls</span>
                </Button>
              )}
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Deck Info Bar */}
              <div className="p-3 bg-card border border-border/60 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-xs">
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs sm:text-sm font-semibold text-foreground truncate">
                    {generatedDeck.title}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    {generatedDeck.slides.length} slides &bull; {generatedDeck.target_audience} &bull; ~{generatedDeck.estimated_minutes} min lecture
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7.5 w-7.5 rounded-lg"
                    disabled={activeSlideIndex === 0}
                    onClick={() => setActiveSlideIndex((prev) => Math.max(0, prev - 1))}
                    title="Previous slide"
                  >
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  <span className="text-xs font-semibold px-1.5 text-muted-foreground font-mono">
                    {activeSlideIndex + 1} / {generatedDeck.slides.length}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7.5 w-7.5 rounded-lg"
                    disabled={activeSlideIndex === generatedDeck.slides.length - 1}
                    onClick={() => setActiveSlideIndex((prev) => Math.min(generatedDeck.slides.length - 1, prev + 1))}
                    title="Next slide"
                  >
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </div>

              {/* Active Slide Card */}
              {generatedDeck.slides[activeSlideIndex] && (
                <Card className="p-5 border-border/70 bg-card space-y-4 shadow-sm min-h-[360px]">
                  <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                    <Badge variant="outline" className="text-xs font-semibold">
                      Slide {activeSlideIndex + 1}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Editable Content
                    </span>
                  </div>

                  {/* Title */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Slide Title</Label>
                    <Input
                      value={generatedDeck.slides[activeSlideIndex].title}
                      onChange={(e) => updateSlideField(activeSlideIndex, "title", e.target.value)}
                      className="text-sm font-bold h-9 bg-background"
                    />
                  </div>

                  {/* Bullet Points */}
                  <div className="space-y-2">
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Key Bullet Points</Label>
                    <div className="space-y-1.5">
                      {generatedDeck.slides[activeSlideIndex].bullet_points.map((bullet, bIdx) => (
                        <div key={bIdx} className="flex items-center gap-2">
                          <div className="size-1.5 rounded-full bg-primary shrink-0" />
                          <Input
                            value={bullet}
                            onChange={(e) => updateSlideBullet(activeSlideIndex, bIdx, e.target.value)}
                            className="text-xs h-8 bg-background flex-1"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Visual Idea */}
                  {generatedDeck.slides[activeSlideIndex].visual_idea !== undefined && (
                    <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                        <Lightbulb className="size-3.5" /> Visual Presentation Cue
                      </div>
                      <Input
                        value={generatedDeck.slides[activeSlideIndex].visual_idea || ""}
                        onChange={(e) => updateSlideField(activeSlideIndex, "visual_idea", e.target.value)}
                        placeholder="e.g. Diagram showing 1NF to 2NF decomposition..."
                        className="text-xs h-7.5 bg-background"
                      />
                    </div>
                  )}

                  {/* Speaker Notes */}
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase">
                      <Mic className="size-3" /> Speaker Notes (Exported to PPTX)
                    </div>
                    <Textarea
                      value={generatedDeck.slides[activeSlideIndex].speaker_notes || ""}
                      onChange={(e) => updateSlideField(activeSlideIndex, "speaker_notes", e.target.value)}
                      placeholder="Talking points for this slide..."
                      className="text-xs h-18 bg-background leading-relaxed"
                    />
                  </div>
                </Card>
              )}

              {/* Slide Thumbnail Strip */}
              <div className="flex gap-2 overflow-x-auto pb-1 pt-1 scroll-fade">
                {generatedDeck.slides.map((slide, sIdx) => (
                  <button
                    key={sIdx}
                    onClick={() => setActiveSlideIndex(sIdx)}
                    className={cn(
                      "shrink-0 w-36 h-20 p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer",
                      activeSlideIndex === sIdx
                        ? "border-primary bg-primary/10 shadow-xs"
                        : "border-border/60 bg-muted/20 hover:bg-muted/40 text-muted-foreground"
                    )}
                  >
                    <span className="text-[10px] font-bold text-foreground truncate block">
                      {sIdx + 1}. {slide.title}
                    </span>
                    <span className="text-[9px] text-muted-foreground line-clamp-2 leading-tight">
                      {slide.bullet_points[0] || ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
