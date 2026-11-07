"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2,
  BookOpen,
  ChevronRight,
  ArrowLeft,
  AlertTriangle,
  X,
  RefreshCw,
  Target,
  FileText,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  studyPlannerApi,
  StudySession,
  KnowledgeCheckReport,
} from "@/lib/api/study-planner";
import {
  GuidedSessionHeader,
  GuidedStage,
} from "@/components/mindexa/study/guided-session/guided-session-header";
import { LessonSectionRenderer } from "@/components/mindexa/study/guided-session/lesson-section-renderer";
import { ContextualAskAiPanel } from "@/components/mindexa/study/guided-session/contextual-ask-ai-panel";
import { InlinePracticeExercise } from "@/components/mindexa/study/guided-session/inline-practice-exercise";
import { KnowledgeCheckFlow } from "@/components/mindexa/study/guided-session/knowledge-check-flow";
import { SessionSummaryReport } from "@/components/mindexa/study/guided-session/session-summary-report";
import { SessionNotesPanel } from "@/components/mindexa/study/guided-session/session-notes-panel";

export default function GuidedStudySessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<StudySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<GuidedStage>("intro");
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [report, setReport] = useState<KnowledgeCheckReport | null>(null);
  const [showFallbackBanner, setShowFallbackBanner] = useState(true);
  const [retryingLesson, setRetryingLesson] = useState(false);
  const [completionFailed, setCompletionFailed] = useState(false);
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const mainRef = useRef<HTMLElement>(null);
  const progressSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastSavedProgressRef = useRef<{ section: number; stage: GuidedStage } | null>(null);

  // Starting a session can generate an AI lesson. React StrictMode runs effects twice in
  // development; without this guard that would generate (and bill) the lesson twice.
  const startedSessionRef = useRef<string | null>(null);

  // Reset scroll to top on every section/stage transition
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentSectionIdx, stage]);

  useEffect(() => {
    async function initSession() {
      if (!sessionId) return;
      if (startedSessionRef.current === sessionId) return;
      startedSessionRef.current = sessionId;
      setLoading(true);
      setLoadError(null);
      try {
        const data = await studyPlannerApi.startGuidedSession(sessionId);
        setSession(data);
        const restoredSection = Math.max(
          0,
          Math.min(
            data.current_section_index ?? 0,
            Math.max((data.lesson_sections_json?.length ?? 0) - 1, 0),
          ),
        );
        setCurrentSectionIdx(restoredSection);
        setReport(data.knowledge_check_report ?? null);
        const restoredStage = data.lesson_status === "COMPLETED"
          ? "summary"
          : (data.guided_stage as GuidedStage) ?? "intro";
        setStage(restoredStage);
        lastSavedProgressRef.current = { section: restoredSection, stage: restoredStage };
        setCompletionFailed(
          restoredStage === "summary" && data.lesson_status !== "COMPLETED",
        );
      } catch (err: any) {
        startedSessionRef.current = null;
        setLoadError(err?.message || "Failed to initialize guided study session");
      } finally {
        setLoading(false);
      }
    }
    initSession();
  }, [sessionId, loadAttempt]);

  // Queue writes so rapid stage/section transitions cannot persist out of order.
  useEffect(() => {
    if (!session || loading) return;

    // Skip if current values match what is already saved/restored on the server
    if (
      lastSavedProgressRef.current &&
      lastSavedProgressRef.current.section === currentSectionIdx &&
      lastSavedProgressRef.current.stage === stage
    ) {
      return;
    }

    // If session is already completed, do not overwrite stage back to prior steps
    if (session.lesson_status === "COMPLETED") return;

    lastSavedProgressRef.current = { section: currentSectionIdx, stage };

    progressSaveQueueRef.current = progressSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await studyPlannerApi.saveGuidedSessionProgress(
          sessionId,
          currentSectionIdx,
          stage,
        );
      })
      .catch((err: any) => {
        console.warn("Could not save session position:", err);
      });
  }, [currentSectionIdx, loading, session, sessionId, stage]);

  const handleExit = () => {
    router.push("/student/study");
  };

  const handleStartLesson = () => {
    setStage("lesson");
    setCurrentSectionIdx(0);
  };

  const handleNextSection = () => {
    if (!session?.lesson_sections_json) return;
    if (currentSectionIdx < session.lesson_sections_json.length - 1) {
      setCurrentSectionIdx((prev) => prev + 1);
    } else {
      setStage("practice");
    }
  };

  const handlePrevSection = () => {
    if (currentSectionIdx > 0) {
      setCurrentSectionIdx((prev) => prev - 1);
    } else {
      setStage("intro");
    }
  };

  // Replace a template lesson with a fresh AI one, in place (no page reload).
  const handleRetryLesson = async () => {
    setRetryingLesson(true);
    try {
      const data = await studyPlannerApi.startGuidedSession(sessionId, { regenerate: true });
      setSession(data);
      setCurrentSectionIdx(0);
      if (data.lesson_plan_json?.generated_by === "fallback") {
        toast.error("The AI service is still unavailable. Please try again in a few minutes.");
      } else {
        toast.success("Your lesson was rebuilt from your course materials.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not regenerate the lesson");
    } finally {
      setRetryingLesson(false);
    }
  };

  // Saving completion can fail (network, expired session). The student still sees their
  // results, but the failure stays visible with a retry, so progress is never silently lost.
  const saveCompletion = async () => {
    setSavingCompletion(true);
    try {
      const updated = await studyPlannerApi.completeGuidedSession(sessionId);
      setSession(updated);
      setCompletionFailed(false);
      toast.success("Session completed and progress saved!");
    } catch (err: any) {
      setCompletionFailed(true);
      toast.error(err?.message || "Error completing guided session");
    } finally {
      setSavingCompletion(false);
    }
  };

  const handleKnowledgeCheckComplete = async (kcReport: KnowledgeCheckReport | null) => {
    setReport(kcReport);
    setStage("summary");
    await saveCompletion();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background text-foreground space-y-4">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="text-sm font-semibold text-muted-foreground">
          Preparing Personal AI Guided Learning Workspace...
        </p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background text-foreground space-y-4 p-6 text-center">
        <h2 className="text-xl font-bold text-destructive">
          {loadError ? "Could Not Load Study Session" : "Study Session Not Found"}
        </h2>
        <p className="text-xs text-muted-foreground max-w-md">
          {loadError || "The requested study session could not be loaded or you do not have permission to access it."}
        </p>
        <div className="flex items-center gap-2">
          {loadError && (
            <Button
              variant="outline"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="text-xs font-semibold gap-1.5 cursor-pointer"
            >
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          )}
          <Button onClick={handleExit} className="text-xs font-semibold gap-1.5 cursor-pointer">
            <ArrowLeft className="size-4" /> Return to Study Planner
          </Button>
        </div>
      </div>
    );
  }

  const sections = session.lesson_sections_json || [];
  const currentSection = sections[currentSectionIdx] || {
    section_title: session.topic,
    content: "Welcome to your guided study session.",
  };

  const plannedMinutes =
    session.lesson_plan_json?.estimated_duration_minutes ?? session.duration_minutes;

  return (
    <div className="fixed inset-0 z-50 bg-background text-foreground flex flex-col overflow-hidden">
      {/* Distraction-Free Header */}
      <GuidedSessionHeader
        title={session.title}
        topic={session.topic}
        stage={stage}
        currentSectionIndex={currentSectionIdx}
        totalSections={sections.length}
        onExit={handleExit}
      />

      {/* Main Learning Workspace Outer Scroll Container */}
      <div ref={mainRef as any} className="flex-1 overflow-y-auto w-full">
        <main className="w-full px-4 py-5 md:px-6 space-y-5 pb-24 md:pb-16 max-w-5xl mx-auto">
          {/* STAGE 1: INTRO / OVERVIEW */}
          {stage === "intro" && (
            <>
              {/* Fallback Banner */}
              {session.lesson_plan_json?.generated_by === "fallback" && showFallbackBanner && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3 animate-in fade-in duration-300">
                  <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                      General Study Outline — Standard Fallback
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed max-w-2xl">
                      We couldn&apos;t generate an AI lesson grounded in your course materials this time (the AI service was temporarily unavailable). This session is showing a general study outline instead.{" "}
                      <strong>Try rebuilding this session</strong> for a lesson grounded in your lecture notes and course uploads.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] font-bold border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 gap-1 cursor-pointer"
                        onClick={handleRetryLesson}
                        disabled={retryingLesson}
                      >
                        {retryingLesson ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3" />
                        )}{" "}
                        {retryingLesson ? "Rebuilding lesson..." : "Retry AI Lesson"}
                      </Button>
                      <button
                        className="text-[11px] text-amber-600 dark:text-amber-400 underline hover:no-underline cursor-pointer"
                        onClick={() => setShowFallbackBanner(false)}
                      >
                        Continue anyway
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowFallbackBanner(false)}
                    className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 shrink-0 cursor-pointer"
                    aria-label="Dismiss banner"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )}

              <Card className="border-border/60 bg-card shadow-xs rounded-xl overflow-hidden animate-in fade-in duration-300">
                <CardHeader className="border-b border-border/60 bg-card p-5 md:p-6 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs font-semibold border-primary/20 text-primary bg-primary/5 px-2.5 py-0.5">
                      Personal Learning Workspace
                    </Badge>
                    {/* Provenance: Only label as AI-Personalized if explicitly generated by AI */}
                    {session.lesson_plan_json?.generated_by === "ai" ? (
                      <Badge variant="outline" className="text-[11px] font-medium border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 px-2 py-0.5">
                        AI-Personalized
                      </Badge>
                    ) : session.lesson_plan_json?.generated_by === "fallback" ? (
                      <Badge variant="outline" className="text-[11px] font-medium border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5 px-2 py-0.5">
                        Standard Outline Mode
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] font-medium border-border/60 text-muted-foreground bg-muted/20 px-2 py-0.5">
                        Curriculum Lesson
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg md:text-xl font-semibold text-foreground tracking-tight">
                    {session.topic}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground font-medium">
                    {session.title} &bull; Planned Duration: {plannedMinutes} minutes
                  </p>
                </CardHeader>

                <CardContent className="p-5 md:p-6 space-y-5">
                  {/* Bento Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <div className="p-4 rounded-xl border border-border/60 bg-card space-y-1 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lesson Sections</span>
                      <p className="text-sm font-semibold text-foreground">{sections.length} Modules</p>
                    </div>

                    <div className="p-4 rounded-xl border border-border/60 bg-card space-y-1 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Practice Activities</span>
                      <p className="text-sm font-semibold text-foreground">Interactive Exercises</p>
                    </div>

                    <div className="p-4 rounded-xl border border-border/60 bg-card space-y-1 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Final Evaluation</span>
                      <p className="text-sm font-semibold text-foreground">Self Knowledge Check</p>
                    </div>
                  </div>

                  {/* Lesson Objectives */}
                  {session.lesson_plan_json?.objectives && session.lesson_plan_json.objectives.length > 0 && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2.5 shadow-2xs">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
                        <Target className="size-4" /> Lesson Objectives
                      </h4>
                      <ul className="grid gap-2 text-xs text-foreground/90">
                        {session.lesson_plan_json.objectives.map((obj, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="size-3.5 text-primary shrink-0 mt-0.5" />
                            <span>{obj}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Section Outline */}
                  <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2.5 shadow-2xs">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                      <BookOpen className="size-4 text-primary" /> Lesson Outline
                    </h4>
                    <div className="space-y-1.5">
                      {sections.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No lesson sections are available for this session yet.
                        </p>
                      )}
                      {sections.map((sec, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs text-foreground/90 font-medium py-1.5 border-b border-border/20 last:border-none"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="size-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-[10px] shrink-0">
                              {idx + 1}
                            </span>
                            <span>{sec.section_title}</span>
                          </div>
                          {sec.estimated_minutes && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono shrink-0">
                              <Clock className="size-3" /> {sec.estimated_minutes}m
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Source Material & Citations (when grounded) */}
                  {(() => {
                    const citations = session.lesson_plan_json?.citations;
                    const references =
                      session.lesson_plan_json?.references ||
                      session.lesson_plan_json?.lecturer_references;
                    if (
                      (!citations || citations.length === 0) &&
                      (!references || references.length === 0)
                    ) {
                      return null;
                    }
                    return (
                      <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-2.5 shadow-2xs">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                          <FileText className="size-4 text-primary" /> Source References & Materials
                        </h4>
                        <div className="space-y-1.5 text-xs text-muted-foreground">
                          {citations && citations.length > 0 && (
                            <div className="space-y-1">
                              {citations.map((c, i) => (
                                <div key={i} className="flex items-center gap-2 text-foreground/85">
                                  <span className="size-1.5 rounded-full bg-primary shrink-0" />
                                  <span className="font-medium">{c.title || c.resource_name || c.resource_id}</span>
                                  {c.page_number && (
                                    <span className="text-muted-foreground text-[11px]">(p. {c.page_number})</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {references && references.length > 0 && (
                            <div className="space-y-1">
                              {references.map((r, i) => (
                                <div key={i} className="flex items-center gap-2 text-foreground/85">
                                  <span className="size-1.5 rounded-full bg-muted-foreground/60 shrink-0" />
                                  <span>{r}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>

                <CardFooter className="p-4 border-t border-border/60 flex justify-end bg-card">
                  <Button
                    onClick={handleStartLesson}
                    className="text-xs font-semibold px-4 h-8.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs gap-1.5 cursor-pointer"
                  >
                    Begin Guided Lesson <ChevronRight className="size-3.5" />
                  </Button>
                </CardFooter>
              </Card>
            </>
          )}

          {/* STAGE 2: LESSON CONTENT */}
          {stage === "lesson" && (
            <LessonSectionRenderer
              sessionId={sessionId}
              section={currentSection}
              sectionIndex={currentSectionIdx}
              totalSections={sections.length}
              initialReflection={
                session.section_reflections_json?.[String(currentSectionIdx)] || ""
              }
              onReflectionChange={(idx, refText) => {
                setSession((prev) => {
                  if (!prev) return prev;
                  const updatedReflections = { ...(prev.section_reflections_json || {}) };
                  if (refText.trim()) {
                    updatedReflections[String(idx)] = refText;
                  } else {
                    delete updatedReflections[String(idx)];
                  }
                  return { ...prev, section_reflections_json: updatedReflections };
                });
              }}
              onNextSection={handleNextSection}
              onPrevSection={handlePrevSection}
              onStartPractice={() => setStage("practice")}
            />
          )}

          {/* STAGE 3: INLINE PRACTICE EXERCISE */}
          {stage === "practice" && (
            <InlinePracticeExercise
              sessionId={sessionId}
              sectionIndex={currentSectionIdx}
              sectionTitle={currentSection.section_title}
              savedExercises={session.guided_practice_exercises_json || []}
              savedAttempts={session.guided_practice_attempts_json || []}
              onExerciseCreated={(newEx) => {
                setSession((prev) => {
                  if (!prev) return prev;
                  const existing = (prev.guided_practice_exercises_json || []).filter(
                    (e) => e.id !== newEx.id,
                  );
                  return {
                    ...prev,
                    guided_practice_exercises_json: [...existing, newEx],
                  };
                });
              }}
              onAttemptSubmitted={(newAttempt) => {
                setSession((prev) => {
                  if (!prev) return prev;
                  const existing = (prev.guided_practice_attempts_json || []).filter(
                    (a) => a.exercise_id !== newAttempt.exercise_id,
                  );
                  return {
                    ...prev,
                    guided_practice_attempts_json: [...existing, newAttempt],
                  };
                });
              }}
              onProceedToKnowledgeCheck={() => setStage("knowledge_check")}
            />
          )}

          {/* STAGE 4: KNOWLEDGE CHECK */}
          {stage === "knowledge_check" && (
            <KnowledgeCheckFlow
              sessionId={sessionId}
              topic={session.topic}
              initialQuestions={session.quiz_questions}
              initialDraftAnswers={session.knowledge_check_draft_answers}
              initialQuestionIndex={session.knowledge_check_current_question_index}
              initialReport={session.knowledge_check_report}
              onQuestionsChange={(qs) => {
                setSession((prev) => (prev ? { ...prev, quiz_questions: qs } : prev));
              }}
              onDraftChange={(draftAnswers, questionIdx) => {
                setSession((prev) =>
                  prev
                    ? {
                        ...prev,
                        knowledge_check_draft_answers: draftAnswers,
                        knowledge_check_current_question_index: questionIdx,
                      }
                    : prev,
                );
              }}
              onCompleteKnowledgeCheck={handleKnowledgeCheckComplete}
            />
          )}

          {/* STAGE 5: SESSION SUMMARY */}
          {stage === "summary" && (
            <>
              {completionFailed && (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex flex-wrap items-center gap-3"
                >
                  <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <p className="flex-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                    Your results are shown below, but this session&apos;s progress wasn&apos;t saved yet.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] font-bold gap-1 cursor-pointer"
                    onClick={saveCompletion}
                    disabled={savingCompletion}
                  >
                    {savingCompletion ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}{" "}
                    {savingCompletion ? "Saving..." : "Retry saving"}
                  </Button>
                </div>
              )}
              <SessionSummaryReport
                session={session}
                report={report || session.knowledge_check_report}
                onReturnToPlanner={handleExit}
              />
            </>
          )}
        </main>
      </div>

      {/* Floating Contextual Ask AI Panel */}
      <ContextualAskAiPanel
        sessionId={sessionId}
        currentSectionTitle={currentSection.section_title}
        currentSectionContent={currentSection.content}
        initialChatHistory={session.tutor_chat_history}
      />

      {/* Floating Personal Session Notes Panel */}
      <SessionNotesPanel
        sessionId={sessionId}
        initialNotes={session.student_notes}
        currentSectionTitle={currentSection.section_title}
      />
    </div>
  );
}
