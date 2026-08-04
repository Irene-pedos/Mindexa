"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Sparkles, BookOpen, ChevronRight, CheckCircle2, Trophy, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { studyPlannerApi, StudySession, KnowledgeCheckReport } from "@/lib/api/study-planner";
import { GuidedSessionHeader, GuidedStage } from "@/components/mindexa/study/guided-session/guided-session-header";
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
  const mainRef = useRef<HTMLElement>(null);

  // Reset scroll to top on every section/stage transition
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentSectionIdx, stage]);

  useEffect(() => {
    async function initSession() {
      if (!sessionId) return;
      setLoading(true);
      try {
        const data = await studyPlannerApi.startGuidedSession(sessionId);
        setSession(data);
        if (data.lesson_status === "COMPLETED") {
          setStage("summary");
        } else {
          setStage("intro");
        }
      } catch (err: any) {
        toast.error(err?.message || "Failed to initialize guided study session");
      } finally {
        setLoading(false);
      }
    }
    initSession();
  }, [sessionId]);

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

  const handleKnowledgeCheckComplete = async (kcReport: KnowledgeCheckReport) => {
    setReport(kcReport);
    try {
      const updated = await studyPlannerApi.completeGuidedSession(sessionId);
      setSession(updated);
      setStage("summary");
      toast.success("Session completed and progress saved!");
    } catch (err: any) {
      toast.error(err?.message || "Error completing guided session");
      setStage("summary");
    }
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
        <h2 className="text-xl font-bold text-destructive">Study Session Not Found</h2>
        <p className="text-xs text-muted-foreground max-w-md">
          The requested study session could not be loaded or you do not have permission to access it.
        </p>
        <Button onClick={handleExit} className="text-xs font-semibold gap-1.5">
          <ArrowLeft className="size-4" /> Return to Study Planner
        </Button>
      </div>
    );
  }

  const sections = session.lesson_sections_json || [];
  const currentSection = sections[currentSectionIdx] || {
    section_title: session.topic,
    content: "Welcome to your guided study session.",
  };

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
        <main className="w-full px-4 py-5 md:px-6 space-y-5">
          {/* STAGE 1: INTRO / OVERVIEW */}
          {stage === "intro" && (
            <Card className="border-border/60 bg-card shadow-xs rounded-xl overflow-hidden animate-in fade-in duration-300">
              <CardHeader className="border-b border-border/60 bg-card p-5 md:p-6 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs font-semibold border-primary/20 text-primary bg-primary/5 px-2.5 py-0.5">
                    Personal Learning Workspace
                  </Badge>
                  {session.lesson_plan_json?.generated_by === "fallback" ? (
                    <Badge variant="outline" className="text-[11px] font-medium border-amber-500/30 text-amber-600 bg-amber-500/5 px-2 py-0.5">
                      Standard Lesson Mode
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[11px] font-medium border-emerald-500/30 text-emerald-600 bg-emerald-500/5 px-2 py-0.5">
                      AI-Personalized
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-lg md:text-xl font-semibold text-foreground tracking-tight">
                  {session.topic}
                </CardTitle>
                <p className="text-xs text-muted-foreground font-medium">
                  {session.title} &bull; Scheduled Duration: {session.duration_minutes} minutes
                </p>
              </CardHeader>

              <CardContent className="p-5 md:p-6 space-y-5">
                {/* Bento Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  <div className="p-4 rounded-xl border border-border/60 bg-card space-y-1 shadow-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lesson Sections</span>
                    <p className="text-sm font-semibold text-foreground">{sections.length} Modules</p>
                  </div>

                  <div className="p-4 rounded-xl border border-border/60 bg-card space-y-1 shadow-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Practice Activities</span>
                    <p className="text-sm font-semibold text-foreground">Interactive Exercises</p>
                  </div>

                  <div className="p-4 rounded-xl border border-border/60 bg-card space-y-1 shadow-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Final Evaluation</span>
                    <p className="text-sm font-semibold text-foreground">Self Knowledge Check</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2.5 shadow-xs">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <BookOpen className="size-4 text-primary" /> Lesson Overview
                  </h4>
                  <div className="space-y-2">
                    {sections.map((sec, idx) => (
                      <div key={idx} className="flex items-center gap-2.5 text-xs text-foreground/90 font-medium">
                        <span className="size-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-[10px]">
                          {idx + 1}
                        </span>
                        <span>{sec.section_title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>

              <CardFooter className="p-4 border-t border-border/60 flex justify-end bg-card">
                <Button
                  onClick={handleStartLesson}
                  className="text-xs font-semibold px-4 h-8.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs gap-1.5"
                >
                  Begin Guided Lesson <ChevronRight className="size-3.5" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* STAGE 2: LESSON CONTENT */}
          {stage === "lesson" && (
            <LessonSectionRenderer
              section={currentSection}
              sectionIndex={currentSectionIdx}
              totalSections={sections.length}
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
              onProceedToKnowledgeCheck={() => setStage("knowledge_check")}
            />
          )}

          {/* STAGE 4: KNOWLEDGE CHECK */}
          {stage === "knowledge_check" && (
            <KnowledgeCheckFlow
              sessionId={sessionId}
              topic={session.topic}
              onCompleteKnowledgeCheck={handleKnowledgeCheckComplete}
            />
          )}

          {/* STAGE 5: SESSION SUMMARY */}
          {stage === "summary" && (
            <SessionSummaryReport
              session={session}
              report={report || session.knowledge_check_report}
              onReturnToPlanner={handleExit}
            />
          )}
        </main>
      </div>

      {/* Floating Contextual Ask AI Panel (Available throughout all session stages) */}
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
