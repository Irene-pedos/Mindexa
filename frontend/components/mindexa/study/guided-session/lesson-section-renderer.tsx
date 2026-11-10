"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  Clock,
  Code2,
  Table as TableIcon,
  HelpCircle,
  FileText,
  Loader2,
  AlertCircle,
  Eye,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CodeBlock,
  RichMessageRenderer,
} from "@/components/mindexa/common/rich-message-renderer";
import { LessonSection, studyPlannerApi } from "@/lib/api/study-planner";
import { guessCodeLanguage, hasCodeFence } from "@/lib/study-code-language";

interface LessonSectionRendererProps {
  sessionId: string;
  section: LessonSection;
  sectionIndex: number;
  totalSections: number;
  initialReflection?: string;
  onReflectionChange?: (sectionIndex: number, reflection: string) => void;
  onNextSection: () => void;
  onPrevSection: () => void;
  onStartPractice: () => void;
}

export function LessonSectionRenderer({
  sessionId,
  section,
  sectionIndex,
  totalSections,
  initialReflection = "",
  onReflectionChange,
  onNextSection,
  onPrevSection,
  onStartPractice,
}: LessonSectionRendererProps) {
  const isLastSection = sectionIndex >= totalSections - 1;
  // Faded-example attempts survive moving between sections while this lesson is open.
  const [fadedAnswers, setFadedAnswers] = useState<Record<number, FadedExampleState>>({});

  return (
    <Card className="border-border/70 bg-card shadow-md rounded-2xl overflow-hidden">
      {/* 1. Header with Badge & Timing */}
      <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px] font-semibold text-primary border-primary/30">
                Section {sectionIndex + 1} of {totalSections}
              </Badge>
              {section.estimated_minutes && (
                <Badge variant="secondary" className="text-[11px] font-medium gap-1 text-muted-foreground">
                  <Clock className="size-3" /> {section.estimated_minutes} mins
                </Badge>
              )}
            </div>
            <CardTitle className="text-xl font-bold text-foreground">
              {section.section_title}
            </CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 md:p-8 space-y-8">
        {/* 2. Main Markdown Content */}
        <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed">
          <RichMessageRenderer content={section.content} />
        </div>

        {/* 3. Code Examples & Walkthroughs Block */}
        {section.examples && section.examples.length > 0 && (
          <div className="space-y-4">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <Code2 className="size-4" /> Worked Code Examples & Walkthroughs
            </h4>
            <div className="grid gap-4">
              {section.examples.map((rawEx, idx) => {
                const ex = typeof rawEx === "string" ? { code: rawEx, title: "Example" } : rawEx;
                const exampleCode = (ex?.code ?? "").trim();
                return (
                  <div key={idx} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 md:p-5 space-y-3">
                    {ex?.title && (
                      <div className="text-xs font-bold text-foreground flex items-center gap-2">
                        <span className="size-2 rounded-full bg-emerald-500" />
                        {ex.title}
                      </div>
                    )}
                    {exampleCode &&
                      (hasCodeFence(exampleCode) ? (
                        // The model already fenced it (and named the language): render as markdown.
                        <div className="text-xs overflow-x-auto">
                          <RichMessageRenderer content={exampleCode} />
                        </div>
                      ) : (
                        // Unfenced: label it by what it looks like instead of always "javascript".
                        <CodeBlock language={guessCodeLanguage(exampleCode)} code={exampleCode} />
                      ))}
                    {ex?.explanation && (
                      <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                        <strong className="text-foreground">Walkthrough:</strong> {ex.explanation}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3b. Faded Example / Progressive Fading Block */}
        {section.faded_example?.problem && section.faded_example.completion_prompt && (
          <FadedExampleCard
            key={sectionIndex}
            example={section.faded_example}
            initial={fadedAnswers[sectionIndex]}
            onChange={(state) =>
              setFadedAnswers((prev) => ({ ...prev, [sectionIndex]: state }))
            }
          />
        )}

        {/* 4. Structured Tables Block */}
        {section.tables && section.tables.length > 0 && (
          <div className="space-y-4">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              <TableIcon className="size-4" /> Comparative Reference Tables
            </h4>
            <div className="grid gap-4">
              {section.tables.map((tbl, idx) => (
                <div key={idx} className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 md:p-5 space-y-3 overflow-hidden">
                  {tbl.title && (
                    <div className="text-xs font-bold text-foreground">{tbl.title}</div>
                  )}
                  <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
                    <table className="w-full text-left text-xs">
                      {tbl.headers && tbl.headers.length > 0 && (
                        <thead className="bg-muted/30 border-b border-border/50 text-muted-foreground font-bold">
                          <tr>
                            {tbl.headers.map((h, i) => (
                              <th key={i} className="p-3 font-semibold">{h}</th>
                            ))}
                          </tr>
                        </thead>
                      )}
                      <tbody>
                        {(tbl.rows || []).map((row, rIdx) => (
                          <tr key={rIdx} className="border-b border-border/30 last:border-0 hover:bg-muted/10">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="p-3 text-foreground/90">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. Visual Concept & Process Flow (Mermaid Diagram) */}
        {(() => {
          const promptStr = (section.diagram_prompt || "").trim();
          const isMermaid =
            promptStr.includes("graph ") ||
            promptStr.includes("flowchart ") ||
            promptStr.includes("sequenceDiagram") ||
            promptStr.includes("classDiagram") ||
            promptStr.includes("stateDiagram") ||
            promptStr.includes("erDiagram");

          if (!isMermaid) return null;

          const contentToRender = promptStr.startsWith("```")
            ? promptStr
            : `\`\`\`mermaid\n${promptStr}\n\`\`\``;

          return (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5 space-y-3">
              <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                <GitBranch className="size-4" /> Visual Concept & Process Diagram
              </h4>
              <div className="bg-background/80 rounded-lg p-4 border border-indigo-500/10 text-xs overflow-x-auto text-foreground/90 leading-relaxed">
                <RichMessageRenderer content={contentToRender} />
              </div>
            </div>
          );
        })()}

        {/* 5b. Micro Check (Embedded Retrieval Practice) */}
        {section.micro_check && (
          <MicroCheckCard microCheck={section.micro_check} />
        )}

        {/* 5c. Feynman Self-Explanation Prompt */}
        {section.self_explanation_prompt && (
          <SectionReflectionEditor
            key={sectionIndex}
            sessionId={sessionId}
            sectionIndex={sectionIndex}
            initialReflection={initialReflection}
            prompt={section.self_explanation_prompt}
            onSave={onReflectionChange}
          />
        )}

        {/* 5d. Video Search Link */}
        {section.suggested_video_search && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <span className="text-xs font-bold text-rose-700 dark:text-rose-300 block">
                Recommended Video Research
              </span>
              <p className="text-[11px] text-muted-foreground truncate">
                Search YouTube for: &quot;{section.suggested_video_search}&quot;
              </p>
            </div>
            <a
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(section.suggested_video_search)}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 transition-colors"
            >
              🔎 Search YouTube
            </a>
          </div>
        )}

        {/* 6. Key Concept Takeaways */}
        {section.key_points && section.key_points.length > 0 && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
              <Sparkles className="size-4" /> Key Concept Takeaways
            </h4>
            <div className="grid gap-2.5">
              {section.key_points.map((point, idx) => {
                const parts = point.split(":");
                const hasTitle = parts.length > 1 && parts[0].length < 50;

                return (
                  <div key={idx} className="flex items-start gap-2.5 text-xs text-foreground/90 font-medium leading-relaxed">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>
                      {hasTitle ? (
                        <>
                          <strong className="font-bold text-foreground">{parts[0].trim()}:</strong>{" "}
                          {parts.slice(1).join(":").trim()}
                        </>
                      ) : (
                        point
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 7. Quick Recall & Interactive Activities */}
        {section.activities && section.activities.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <HelpCircle className="size-4" /> Quick Recall & Active Reflection
            </h4>
            <div className="grid gap-2">
              {section.activities.map((act, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-foreground/90 font-medium">
                  <span className="size-4 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{act}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation Bar */}
        <div className="pt-6 border-t border-border/50 flex items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={onPrevSection}
            className="text-xs font-semibold"
          >
            {/* On the first section "previous" means the overview (objectives, key terms, sources). */}
            {sectionIndex === 0 ? "Back to Overview" : "Previous Section"}
          </Button>

          <div className="flex items-center gap-3">
            {!isLastSection ? (
              <Button onClick={onNextSection} className="text-xs font-semibold gap-1.5">
                Next Section <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button
                onClick={onStartPractice}
                className="text-xs font-bold gap-1.5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-600/90 text-primary-foreground shadow-md"
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

interface FadedExampleState {
  text: string;
  revealed: boolean;
}

function FadedExampleCard({
  example,
  initial,
  onChange,
}: {
  example: NonNullable<LessonSection["faded_example"]>;
  initial?: FadedExampleState;
  onChange: (state: FadedExampleState) => void;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [revealed, setRevealed] = useState(initial?.revealed ?? false);
  const [showHint, setShowHint] = useState(false);
  const hasAnswer = Boolean(example.answer && example.answer.trim());
  const steps = example.solution_steps ?? [];

  const update = (next: FadedExampleState) => {
    setText(next.text);
    setRevealed(next.revealed);
    onChange(next);
  };

  return (
    <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-5 space-y-3">
      <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
        <Sparkles className="size-4" /> Your Turn — Finish the Solution
      </h4>
      <p className="text-xs text-foreground font-semibold">{example.problem}</p>

      {steps.length > 0 && (
        <div className="space-y-1.5 pl-2 border-l-2 border-violet-500/30">
          {steps.map((step, sIdx) => (
            <p key={sIdx} className="text-xs text-muted-foreground font-medium">
              {step}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <label
          htmlFor="faded-example-answer"
          className="text-xs font-semibold text-foreground block"
        >
          {example.completion_prompt}
        </label>
        <textarea
          id="faded-example-answer"
          value={text}
          onChange={(e) => update({ text: e.target.value, revealed })}
          maxLength={1000}
          placeholder="Type the missing step here before checking..."
          className="w-full min-h-[70px] p-3 text-xs rounded-lg border border-violet-500/30 bg-background text-foreground focus:outline-hidden focus:ring-1 focus:ring-violet-500 resize-y leading-relaxed font-mono"
        />
      </div>

      {example.hint && (
        <div>
          <button
            type="button"
            onClick={() => setShowHint((shown) => !shown)}
            className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 underline hover:no-underline cursor-pointer"
          >
            {showHint ? "Hide hint" : "Need a hint?"}
          </button>
          {showHint && (
            <p className="mt-1 pl-2 border-l-2 border-violet-500/30 text-xs italic text-muted-foreground">
              {example.hint}
            </p>
          )}
        </div>
      )}

      {hasAnswer &&
        (revealed ? (
          <div className="space-y-1 animate-in fade-in duration-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">
              Compare with the worked answer
            </span>
            <p className="text-xs font-medium text-foreground bg-background/80 p-3 rounded-lg border border-emerald-500/20 whitespace-pre-wrap">
              {example.answer}
            </p>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={!text.trim()}
            onClick={() => update({ text, revealed: true })}
            title={text.trim() ? undefined : "Write your attempt first"}
            className="text-xs font-semibold gap-1.5 border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10 cursor-pointer"
          >
            <Eye className="size-3.5" /> Check my answer
          </Button>
        ))}
    </div>
  );
}

function MicroCheckCard({
  microCheck,
}: {
  microCheck: { question: string; answer: string; hint?: string };
}) {
  const [showAnswer, setShowAnswer] = React.useState(false);
  const [showHint, setShowHint] = React.useState(false);

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
          <HelpCircle className="size-4" /> Quick Micro-Check (Embedded Retrieval)
        </h4>
        <Badge variant="outline" className="text-[10px] font-semibold text-amber-600 border-amber-500/30">
          Section Check
        </Badge>
      </div>

      <p className="text-xs text-foreground font-semibold">
        {microCheck.question}
      </p>

      {microCheck.hint && (
        <div>
          <button
            type="button"
            onClick={() => setShowHint(!showHint)}
            className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 underline hover:text-amber-700"
          >
            {showHint ? "Hide hint" : "💡 Need a hint?"}
          </button>
          {showHint && (
            <p className="text-xs text-muted-foreground italic mt-1 pl-2 border-l-2 border-amber-500/30">
              {microCheck.hint}
            </p>
          )}
        </div>
      )}

      <div className="pt-2 flex items-center justify-between gap-3">
        {!showAnswer ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAnswer(true)}
            className="text-xs font-semibold border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
          >
            Check Answer →
          </Button>
        ) : (
          <div className="space-y-1 w-full animate-in fade-in duration-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">
              ✓ Model Answer:
            </span>
            <p className="text-xs font-medium text-foreground bg-background/80 p-3 rounded-lg border border-emerald-500/20">
              {microCheck.answer}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionReflectionEditor({
  sessionId,
  sectionIndex,
  initialReflection,
  prompt,
  onSave,
}: {
  sessionId: string;
  sectionIndex: number;
  initialReflection: string;
  prompt: string;
  onSave?: (sectionIndex: number, text: string) => void;
}) {
  const [reflection, setReflection] = useState(initialReflection);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSaved, setLastSaved] = useState(initialReflection);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const currentTextRef = useRef(reflection);
  const lastSavedRef = useRef(lastSaved);

  useEffect(() => {
    currentTextRef.current = reflection;
  }, [reflection]);

  useEffect(() => {
    lastSavedRef.current = lastSaved;
  }, [lastSaved]);

  const saveText = useCallback(
    async (textToSave: string) => {
      if (textToSave === lastSavedRef.current) return;
      setSaveStatus("saving");
      try {
        await studyPlannerApi.saveGuidedSectionReflection(
          sessionId,
          sectionIndex,
          textToSave
        );
        setLastSaved(textToSave);
        lastSavedRef.current = textToSave;
        setSaveStatus("saved");
        onSave?.(sectionIndex, textToSave);
      } catch {
        setSaveStatus("error");
      }
    },
    [sessionId, sectionIndex, onSave]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setReflection(val);
    if (val === lastSaved) {
      setSaveStatus("idle");
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    setSaveStatus("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveText(val);
    }, 1000);
  };

  const handleBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (reflection !== lastSaved) {
      void saveText(reflection);
    }
  };

  // Flush on unmount if dirty
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (currentTextRef.current !== lastSavedRef.current) {
        studyPlannerApi
          .saveGuidedSectionReflection(
            sessionId,
            sectionIndex,
            currentTextRef.current
          )
          .catch(() => {});
      }
    };
  }, [sessionId, sectionIndex]);

  return (
    <div className="rounded-xl border border-teal-500/25 bg-teal-500/5 p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
          <FileText className="size-4" /> Feynman Self-Explanation Nudge
        </h4>
        <div className="flex items-center gap-2 text-[11px]" aria-live="polite">
          {saveStatus === "saving" && (
            <span className="text-muted-foreground flex items-center gap-1 font-medium">
              <Loader2 className="size-3 animate-spin text-teal-600" /> Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-teal-700 dark:text-teal-300 flex items-center gap-1 font-semibold">
              <CheckCircle2 className="size-3" /> Saved
            </span>
          )}
          {saveStatus === "error" && (
            <div className="flex items-center gap-1.5 text-destructive font-semibold">
              <AlertCircle className="size-3" /> Save failed
              <button
                type="button"
                onClick={() => saveText(reflection)}
                className="underline hover:no-underline text-[10px] ml-1 font-bold cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-foreground font-medium">{prompt}</p>
      <textarea
        value={reflection}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="Explain in your own words before continuing (e.g. key principles, how it works, common pitfalls)..."
        aria-label={`Feynman explanation for ${prompt}`}
        className="w-full min-h-[85px] p-3 text-xs rounded-lg border border-teal-500/30 bg-background text-foreground focus:outline-hidden focus:ring-1 focus:ring-teal-500 resize-y leading-relaxed"
      />
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Cleared automatically if left empty.</span>
        {reflection.trim().length > 0 && (
          <span>{reflection.trim().split(/\s+/).length} words</span>
        )}
      </div>
    </div>
  );
}
