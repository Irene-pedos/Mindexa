"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  ArrowRight,
  ShieldAlert,
  ListChecks,
  CheckCircle2,
  FileText,
  Lightbulb,
  Brain,
  BookOpen,
  Target,
  ChevronDown,
  Calendar,
  BarChart2,
  RefreshCw,
  Send,
  Wifi,
  Bookmark,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { studentAiApi, StudentSupportResponse } from "@/lib/api/student-ai";
import { studentApi, StudentResourceResponse, StudentRecentResult, StudentCourseListItem } from "@/lib/api/student";
import { assessmentApi } from "@/lib/api/assessment";
import { apiClient } from "@/lib/api/client";
import {
  PureMultimodalInput,
  type Attachment,
} from "@/components/ui/multimodal-ai-chat-input";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Message {
  id: string;
  sender: "student" | "ai";
  text: string;
  timestamp: Date;
  revision_plan?: string[];
  follow_up_questions?: string[];
  safety_notice?: string | null;
}

export function AISupportChat() {
  const [activeTab, setActiveTab] = useState<"support" | "revision" | "practice" | "planner" | "insights">("support");
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chat Conversation
  const [messages, setMessages] = useState<Message[]>([]);

  // Approved Resources
  const [resources, setResources] = useState<StudentResourceResponse[]>([]);
  const [workspaces, setWorkspaces] = useState<StudentCourseListItem[]>([]);
  const [lecturerMaterials, setLecturerMaterials] = useState<any[]>([]);
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [loadingResources, setLoadingResources] = useState(true);

  // Dropdowns
  const [resourcesDropdownOpen, setResourcesDropdownOpen] = useState(false);
  const [tipsDropdownOpen, setTipsDropdownOpen] = useState(false);
  const [integrityDropdownOpen, setIntegrityDropdownOpen] = useState(false);

  // Blocker State
  const [isBlockedByActiveExam, setIsBlockedByActiveExam] = useState(false);
  const [blockingExamTitle, setBlockingExamTitle] = useState("");

  // Fullscreen State
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Completed Results & Insights
  const [results, setResults] = useState<StudentRecentResult[]>([]);
  const [insightsResult, setInsightsResult] = useState<string | null>(null);
  const [isAnalyzingInsights, setIsAnalyzingInsights] = useState(false);

  // Feedback Explainer State
  const [selectedResultForFeedback, setSelectedResultForFeedback] = useState<string | null>(null);
  const [isExplainingFeedback, setIsExplainingFeedback] = useState(false);
  const [feedbackExplanation, setFeedbackExplanation] = useState<string | null>(null);

  // Revision State
  const [revisionTopic, setRevisionTopic] = useState("");
  const [revisionResult, setRevisionResult] = useState<{
    summary: string;
    checklist: string[];
    readings: string[];
  } | null>(null);
  const [isGeneratingRevision, setIsGeneratingRevision] = useState(false);

  // Practice Quiz State
  const [practiceTopic, setPracticeTopic] = useState("");
  const [practiceCount, setPracticeCount] = useState("5");
  const [practiceStyle, setPracticeStyle] = useState("MCQ");
  const [practiceQuestions, setPracticeQuestions] = useState<any[]>([]);
  const [isGeneratingPractice, setIsGeneratingPractice] = useState(false);
  const [studentAnswers, setStudentAnswers] = useState<Record<number, string>>({});
  const [revealFeedback, setRevealFeedback] = useState(false);

  // Study Planner State
  const [plannerExam, setPlannerExam] = useState("");
  const [plannerDate, setPlannerDate] = useState("");
  const [plannerTopics, setPlannerTopics] = useState("");
  const [plannerHours, setPlannerHours] = useState("2");
  const [plannerResult, setPlannerResult] = useState<string | null>(null);
  const [isGeneratingPlanner, setIsGeneratingPlanner] = useState(false);

  const resourcesRef = useRef<HTMLDivElement>(null);
  const tipsRef = useRef<HTMLDivElement>(null);
  const integrityRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll chat messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoadingResources(true);
        const [resData, attemptsData, resultsItems, workspacesData] = await Promise.all([
          studentApi.getPersonalResources(),
          apiClient("/attempts/me"),
          studentApi.getResults().catch(() => []),
          studentApi.getWorkspaces().catch(() => [])
        ]);

        setResources(resData);
        setResults(resultsItems || []);
        setWorkspaces(workspacesData);

        // Load materials for all workspaces
        const workspaceMaterialsPromises = workspacesData.map(async (ws) => {
          try {
            const mats = await studentApi.getWorkspaceMaterials(ws.id);
            return mats.map((m) => ({
              ...m,
              course_code: ws.code,
              course_name: ws.title,
            }));
          } catch (e) {
            return [];
          }
        });
        const allWorkspaceMaterials = (await Promise.all(workspaceMaterialsPromises)).flat();
        setLecturerMaterials(allWorkspaceMaterials);

        // Active assessment blocking check
        const activeAttempts = (attemptsData.items || []).filter(
          (a: any) => a.status === "IN_PROGRESS" || a.status === "PAUSED"
        );
        if (activeAttempts.length > 0) {
          for (const attempt of activeAttempts) {
            const assessment = await assessmentApi.getAssessmentById(attempt.assessment_id);
            const isExamStyle =
              assessment.assessment_type === "CAT" ||
              assessment.assessment_type === "SUMMATIVE" ||
              assessment.is_supervised === true;
            const isAiDisallowed = !assessment.ai_assistance_allowed;

            if (isExamStyle || isAiDisallowed) {
              setIsBlockedByActiveExam(true);
              setBlockingExamTitle(assessment.title);
              break;
            }
          }
        }
      } catch (err) {
        console.error("Failed to load study data or check active attempts", err);
      } finally {
        setLoadingResources(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (resourcesRef.current && !resourcesRef.current.contains(event.target as Node)) {
        setResourcesDropdownOpen(false);
      }
      if (tipsRef.current && !tipsRef.current.contains(event.target as Node)) {
        setTipsDropdownOpen(false);
      }
      if (integrityRef.current && !integrityRef.current.contains(event.target as Node)) {
        setIntegrityDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedResourceName = useMemo(() => {
    if (!selectedResource) return null;
    const personal = resources.find((r) => r.id === selectedResource);
    if (personal) return personal.display_name || personal.original_filename;
    
    const lecturerMat = lecturerMaterials.find((m) => m.id === selectedResource);
    if (lecturerMat) return lecturerMat.display_name || lecturerMat.original_filename;
    
    return "Context Selected";
  }, [selectedResource, resources, lecturerMaterials]);

  const selectedContexts = useMemo(() => {
    if (!selectedResource) return [];
    
    const personal = resources.find((r) => r.id === selectedResource);
    if (personal) {
      return [
        {
          title: personal.display_name || personal.original_filename,
          content: `Content from personal study resource: ${personal.display_name || personal.original_filename}`,
        },
      ];
    }

    const lecturerMat = lecturerMaterials.find((m) => m.id === selectedResource);
    if (lecturerMat) {
      return [
        {
          title: lecturerMat.display_name || lecturerMat.original_filename,
          content: `Content from lecturer course material: ${lecturerMat.display_name || lecturerMat.original_filename}`,
        },
      ];
    }

    return [];
  }, [selectedResource, resources, lecturerMaterials]);

  const studySuggestedActions = [
    {
      title: "Explain Concept",
      label: "Database Normalization in simple terms",
      action: "Explain Database Normalization with step-by-step examples",
    },
    {
      title: "Active Recall",
      label: "SQL Joins practice scenario",
      action: "Provide scenarios to test my understanding of SQL Outer and Inner Joins",
    },
    {
      title: "Academic Material Study",
      label: "Summarize selected context",
      action: "Summarize the key takeaways and learning outcomes from the selected resource",
    },
    {
      title: "Lecturer Feedback",
      label: "Explain my grade on assessments",
      action: "Explain standard database assessment rubrics and how to improve design marks",
    },
  ];

  // 1. Core Chat Support Handlers
  const handleSendMessage = async (params: { input: string; attachments: Attachment[] }) => {
    const query = params.input.trim();
    if (!query) return;

    let userQuestion = query;
    if (params.attachments.length > 0) {
      const fileNames = params.attachments.map((a) => a.name).join(", ");
      userQuestion = `${userQuestion}\n\n[Reference File: ${fileNames}]`;
    }

    const newStudentMessage: Message = {
      id: Date.now().toString(),
      sender: "student",
      text: userQuestion,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, newStudentMessage]);
    setIsThinking(true);
    setError(null);
    setPrompt("");

    try {
      const res = await studentAiApi.getSupport({
        question: userQuestion,
        contexts: selectedContexts,
      });

      const newAiMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: res.explanation,
        timestamp: new Date(),
        revision_plan: res.revision_plan,
        follow_up_questions: res.follow_up_questions,
        safety_notice: res.safety_notice,
      };

      setMessages((prev) => [...prev, newAiMessage]);
    } catch (err: any) {
      setError(err.message || "Failed to retrieve AI explanation.");
      toast.error("AI support request failed.");
    } finally {
      setIsThinking(false);
    }
  };

  // 2. Revision Center Handler
  const handleGenerateRevision = async () => {
    if (!revisionTopic.trim()) {
      toast.error("Please enter a topic or concept name.");
      return;
    }
    setIsGeneratingRevision(true);
    setRevisionResult(null);
    setError(null);

    const questionText = `Generate a structured, comprehensive revision note for the topic: "${revisionTopic}".
Provide your output in the required JSON format:
- In the "explanation" key, write the Topic Summary (detailed concepts, rules, formulas, examples in clear educational language).
- In the "revision_plan" key, write the Revision Checklist as an array of strings (important points to master).
- In the "follow_up_questions" key, write the Recommended Readings as an array of strings (references or additional concepts to review).
Ensure all text values are properly JSON-escaped, especially double quotes (which must be escaped as \\").`;

    try {
      const res = await studentAiApi.getSupport({
        question: questionText,
        contexts: selectedContexts,
      });

      setRevisionResult({
        summary: res.explanation,
        checklist: res.revision_plan || [],
        readings: res.follow_up_questions || []
      });
      toast.success("Revision guide generated!");
    } catch (err: any) {
      setError(err.message || "Failed to generate revision guide.");
    } finally {
      setIsGeneratingRevision(false);
    }
  };

  // 3. Practice Center Handler
  const handleGeneratePractice = async () => {
    if (!practiceTopic.trim()) {
      toast.error("Please enter a practice topic.");
      return;
    }
    setIsGeneratingPractice(true);
    setPracticeQuestions([]);
    setStudentAnswers({});
    setRevealFeedback(false);
    setError(null);

    const questionText = `Generate a practice quiz with exactly ${practiceCount} questions of style "${practiceStyle}" for the topic: "${practiceTopic}".
Provide the questions in the "explanation" key. For multiple-choice questions, include options A, B, C, and D.
After each question, write the answer key and explanation inside double brackets like this: [[ANSWER: <answer> | EXPLANATION: <explanation>]].
Keep it strictly educational for practice and self-assessment only.
Ensure the JSON output is valid and escape all double quotes inside the text as \\".`;

    try {
      const res = await studentAiApi.getSupport({
        question: questionText,
        contexts: selectedContexts,
      });

      const rawText = res.explanation;
      const parts = rawText.split(/(?=\d+\.\s+)/);
      const parsedQuestions: any[] = [];

      parts.forEach((part) => {
        if (!part.trim()) return;
        const match = part.match(/\[\[ANSWER:\s*([\s\S]*?)\s*\|\s*EXPLANATION:\s*([\s\S]*?)\s*\]\]/);
        if (match) {
          const qText = part.replace(/\[\[ANSWER:[\s\S]*?\]\]/, "").trim();
          parsedQuestions.push({
            question: qText,
            answer: match[1],
            explanation: match[2]
          });
        } else {
          parsedQuestions.push({
            question: part.trim(),
            answer: "Review explanation",
            explanation: "Evaluate your response using standard study materials."
          });
        }
      });

      if (parsedQuestions.length === 0) {
        parsedQuestions.push({
          question: res.explanation,
          answer: "Refer to prompt response",
          explanation: "Self-evaluate using the generated text."
        });
      }

      setPracticeQuestions(parsedQuestions);
      toast.success("Practice quiz generated!");
    } catch (err: any) {
      setError(err.message || "Failed to generate practice quiz.");
    } finally {
      setIsGeneratingPractice(false);
    }
  };

  // 4. Study Planner Handler
  const handleGeneratePlanner = async () => {
    if (!plannerExam.trim()) {
      toast.error("Please enter the assessment name.");
      return;
    }
    setIsGeneratingPlanner(true);
    setPlannerResult(null);
    setError(null);

    const questionText = `Generate a detailed week-by-week and day-by-day revision study plan for the upcoming assessment: "${plannerExam}" scheduled on ${plannerDate || "next week"}.
The plan must cover these topics: "${plannerTopics || "general course outline"}" with a target of ${plannerHours} hours of revision per day.
Provide the full schedule in the "explanation" key with daily goals, revision tasks, and active recall suggestions.
Ensure the JSON output is valid and escape all double quotes inside the text as \\".`;

    try {
      const res = await studentAiApi.getSupport({
        question: questionText,
        contexts: selectedContexts,
      });

      setPlannerResult(res.explanation);
      toast.success("Study plan generated!");
    } catch (err: any) {
      setError(err.message || "Failed to generate study plan.");
    } finally {
      setIsGeneratingPlanner(false);
    }
  };

  // 5. Learning Insights Handler
  const handleAnalyzeInsights = async () => {
    if (results.length === 0) {
      toast.error("No completed assessment results found to analyze.");
      return;
    }
    setIsAnalyzingInsights(true);
    setInsightsResult(null);
    setError(null);

    const resultsSummary = results.map(r => ({
      title: r.assessment_title,
      percentage: r.percentage,
      grade: r.letter_grade,
      passed: r.percentage >= 40
    }));

    const questionText = `Analyze my completed assessment results: ${JSON.stringify(resultsSummary)}.
Identify my strong areas, weak areas, and recommended topics for revision.
Provide this analysis in the "explanation" key. Focus strictly on released assessment summaries, never expose hidden answers or administration metrics.
Ensure the JSON output is valid and escape all double quotes inside the text as \\".`;

    try {
      const res = await studentAiApi.getSupport({
        question: questionText,
        contexts: selectedContexts,
      });

      setInsightsResult(res.explanation);
      toast.success("Insights analyzed!");
    } catch (err: any) {
      setError(err.message || "Failed to analyze learning insights.");
    } finally {
      setIsAnalyzingInsights(false);
    }
  };

  // 6. Feedback Explanation Handler
  const handleExplainFeedback = async () => {
    if (!selectedResultForFeedback) {
      toast.error("Please select an assessment to explain.");
      return;
    }
    setIsExplainingFeedback(true);
    setFeedbackExplanation(null);
    setError(null);

    try {
      const resultDetail = await apiClient(`/results/attempt/${selectedResultForFeedback}`);
      
      const scoreText = `${resultDetail.total_score} / ${resultDetail.max_score} (${resultDetail.percentage}%)`;
      const gradeText = resultDetail.letter_grade || "N/A";
      
      const feedbacks = (resultDetail.breakdowns || [])
        .filter((b: any) => b.feedback && b.feedback.trim())
        .map((b: any, idx: number) => `Question ${idx + 1} ("${b.question_text || ""}"): Score ${b.score}/${b.max_score}. Feedback: ${b.feedback}`)
        .join("\n\n");

      const promptText = `Explain the lecturer's feedback for my assessment "${resultDetail.assessment_title}".
My overall score is ${scoreText} and letter grade is "${gradeText}".
Here is the question-by-question feedback and score breakdown:
${feedbacks || "No detailed question-level feedback comments were left, but the overall score is " + scoreText}

Please provide a constructive educational explanation of this feedback in the "explanation" key.
Explain the concepts referenced in the comments, point out areas for improvement, and suggest general revision directions.
Do NOT challenge the grading decision or try to override/change the grade. Focus strictly on explaining the comments.
Ensure the JSON output is valid and escape all double quotes inside the text as \\".`;

      const res = await studentAiApi.getSupport({
        question: promptText,
        contexts: selectedContexts,
      });

      setFeedbackExplanation(res.explanation);
      toast.success("Feedback explanation generated!");
    } catch (err: any) {
      setError(err.message || "Failed to explain lecturer feedback.");
    } finally {
      setIsExplainingFeedback(false);
    }
  };

  // Calculate results statistics
  const resultsStats = useMemo(() => {
    if (results.length === 0) return null;
    const total = results.length;
    const totalPercentage = results.reduce((acc, r) => acc + r.percentage, 0);
    const passedCount = results.filter(r => r.percentage >= 40).length;

    return {
      total,
      average: Math.round(totalPercentage / total),
      passRate: Math.round((passedCount / total) * 100)
    };
  }, [results]);

  if (isBlockedByActiveExam) {
    return (
      <Card className="shadow-none border w-full flex flex-col h-full justify-center items-center bg-zinc-50/20 p-8 min-h-[400px]">
        <div className="flex flex-col items-center text-center max-w-md space-y-4">
          <div className="size-12 rounded-full bg-red-100 flex items-center justify-center">
            <ShieldAlert className="size-6 text-red-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-medium text-red-600">AI Support Unavailable</h3>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
              AI assistance is disabled for this assessment to maintain academic integrity.
            </p>
            {blockingExamTitle && (
              <p className="text-xs font-medium text-foreground bg-zinc-100 py-1.5 px-3 rounded-lg border border-zinc-200">
                Active Assessment: {blockingExamTitle}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground font-medium">
              Please finalize your attempt and submit your assessment to restore access.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "shadow-none border w-full flex flex-col relative overflow-hidden bg-zinc-50/20",
      isFullScreen 
        ? "fixed inset-0 z-50 h-screen w-screen rounded-none border-none p-4 md:p-6 bg-white" 
        : "h-full"
    )}>
      
      {/* Top Navigation Bar */}
      <div className="border-b bg-muted/5 px-4 py-3 flex flex-wrap gap-3 items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          {/* Approved Resource Selectors */}
          <div className="relative" ref={resourcesRef}>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-1.5 rounded-lg border-zinc-200 text-xs font-semibold bg-white",
                selectedResource && "border-primary text-primary bg-primary/5"
              )}
              onClick={() => {
                setResourcesDropdownOpen(!resourcesDropdownOpen);
                setTipsDropdownOpen(false);
                setIntegrityDropdownOpen(false);
              }}
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="max-w-[200px] truncate">
                {selectedResourceName || "Select Learning Material (RAG)"}
              </span>
              <ChevronDown className="size-3 ml-0.5 opacity-60" />
            </Button>
            {resourcesDropdownOpen && (
              <div className="absolute left-0 mt-2 w-80 bg-white text-zinc-950 border rounded-xl shadow-lg p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="space-y-4 max-h-80 overflow-y-auto pr-1 text-left">
                  
                  {/* Lecturer Materials section */}
                  <div>
                    <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
                      Lecturer Course Materials
                    </div>
                    {loadingResources ? (
                      <div className="text-xs text-muted-foreground py-1 pl-2">Loading materials...</div>
                    ) : lecturerMaterials.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-1 pl-2">No course materials available.</div>
                    ) : (
                      <div className="space-y-1">
                        {lecturerMaterials.map((file) => (
                          <div
                            key={file.id}
                            className={cn(
                              "flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer hover:bg-zinc-50 transition-colors",
                              selectedResource === file.id && "border-primary bg-primary/5 text-primary"
                            )}
                            onClick={() => {
                              setSelectedResource(selectedResource === file.id ? null : file.id);
                              setResourcesDropdownOpen(false);
                            }}
                          >
                            <FileText className="size-3.5 shrink-0 text-blue-500" />
                            <div className="truncate flex-1 font-medium text-left">
                              <div className="truncate">{file.display_name || file.original_filename}</div>
                              <div className="text-[10px] text-muted-foreground">{file.course_code} • Lecturer Material</div>
                            </div>
                            {selectedResource === file.id && <CheckCircle2 className="size-3.5 text-primary shrink-0" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Personal Resources section */}
                  <div>
                    <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
                      Personal Study Files
                    </div>
                    {loadingResources ? (
                      <div className="text-xs text-muted-foreground py-1 pl-2">Loading files...</div>
                    ) : resources.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-1 pl-2">No personal files uploaded.</div>
                    ) : (
                      <div className="space-y-1">
                        {resources.map((file) => (
                          <div
                            key={file.id}
                            className={cn(
                              "flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer hover:bg-zinc-50 transition-colors",
                              selectedResource === file.id && "border-primary bg-primary/5 text-primary"
                            )}
                            onClick={() => {
                              setSelectedResource(selectedResource === file.id ? null : file.id);
                              setResourcesDropdownOpen(false);
                            }}
                          >
                            <FileText className="size-3.5 shrink-0 text-emerald-500" />
                            <div className="truncate flex-1 font-medium text-left">
                              <div className="truncate">{file.display_name || file.original_filename}</div>
                              <div className="text-[10px] text-muted-foreground">Personal Study File</div>
                            </div>
                            {selectedResource === file.id && <CheckCircle2 className="size-3.5 text-primary shrink-0" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}
          </div>

          {/* Tips Dropdown */}
          <div className="relative" ref={tipsRef}>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-lg border-zinc-200 text-xs font-semibold bg-white"
              onClick={() => {
                setTipsDropdownOpen(!tipsDropdownOpen);
                setResourcesDropdownOpen(false);
                setIntegrityDropdownOpen(false);
              }}
            >
              <Lightbulb className="size-3.5 text-amber-500 shrink-0" />
              <span>Study Tips</span>
              <ChevronDown className="size-3 ml-0.5 opacity-60" />
            </Button>
            {tipsDropdownOpen && (
              <div className="absolute left-0 mt-2 w-80 bg-white text-zinc-950 border rounded-xl shadow-lg p-5 z-45 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Lightbulb className="size-4 text-amber-500" /> Active Recall Tips
                </div>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="size-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                      <Target className="size-3.5 text-emerald-700" />
                    </div>
                    <div className="text-xs font-medium text-zinc-600 leading-relaxed">
                      Always try to formulate explanations in your own words before consulting solutions.
                    </div>
                  </div>
                  <div className="border-t my-2" />
                  <div className="flex gap-3">
                    <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <BookOpen className="size-3.5 text-primary" />
                    </div>
                    <div className="text-xs font-medium text-zinc-600 leading-relaxed">
                      Use the Practice Center to generate self-assessment quizzes regularly to test topic mastery.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Policies & Fullscreen */}
        <div className="flex items-center gap-2">
          <div className="relative" ref={integrityRef}>
            <Badge
              variant="outline"
              className="cursor-pointer border-red-600/20 bg-red-50 text-red-700 hover:bg-red-100/50 py-1 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
              onClick={() => {
                setIntegrityDropdownOpen(!integrityDropdownOpen);
                setResourcesDropdownOpen(false);
                setTipsDropdownOpen(false);
              }}
            >
              <ShieldAlert className="size-3" />
              Integrity Rules
            </Badge>
            {integrityDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white text-zinc-950 border border-red-100 rounded-xl shadow-lg p-4 z-45 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="text-xs font-bold text-red-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="size-4" /> Academic Policy
                </div>
                <p className="text-[11px] text-zinc-600 leading-relaxed font-medium">
                  Student AI only supports study and learning. Generating cheat notes, accessing hidden assessments, or bypassing integrity checks is strictly prohibited.
                </p>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 hover:bg-zinc-100 border-zinc-200"
            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isFullScreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullScreen ? <Minimize2 className="size-4 text-zinc-600" /> : <Maximize2 className="size-4 text-zinc-600" />}
          </Button>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b bg-muted/10 shrink-0 z-20 overflow-x-auto">
        {[
          { id: "support", label: "Study Support", icon: Brain },
          { id: "revision", label: "Revision Center", icon: BookOpen },
          { id: "practice", label: "Practice Center", icon: ListChecks },
          { id: "planner", label: "Study Planner", icon: Target },
          { id: "insights", label: "Learning Insights", icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setError(null);
              }}
              className={cn(
                "flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap",
                activeTab === tab.id
                  ? "border-primary text-primary bg-primary/[0.02]"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Container Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-white/50 flex flex-col min-h-0">
        
        {error && (
          <Alert variant="destructive" className="mb-4 rounded-xl">
            <ShieldAlert className="size-4" />
            <AlertTitle className="text-sm font-semibold">Study Assistant Error</AlertTitle>
            <AlertDescription className="text-xs mt-1 font-medium">{error}</AlertDescription>
          </Alert>
        )}

        {/* Tab 1: STUDY SUPPORT CHAT */}
        {activeTab === "support" && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-[300px]">
              {messages.length === 0 && !isThinking ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-xl mx-auto space-y-6">
                  <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                    <Brain className="size-8 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold tracking-tight">Revision & Study Support AI</h2>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-md font-medium">
                      Ask questions to clarify academic concepts, get revision advice, and prepare for exams. Select a study record above to add specific context.
                    </p>
                  </div>
                  
                  {/* Suggested Start Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-4">
                    {studySuggestedActions.map((act, idx) => (
                      <button
                        key={idx}
                        onClick={() => setPrompt(act.action)}
                        className="p-3 text-left border rounded-xl text-xs hover:bg-zinc-50 transition-colors font-medium space-y-1 bg-white shadow-sm border-zinc-200/60"
                      >
                        <div className="text-primary font-bold text-[10px] uppercase tracking-wide">{act.title}</div>
                        <div className="text-muted-foreground truncate">{act.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-w-3xl mx-auto py-2">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex flex-col max-w-[85%] space-y-1.5 p-4 rounded-2xl text-xs font-medium shadow-sm leading-relaxed whitespace-pre-wrap",
                        msg.sender === "student"
                          ? "bg-primary text-primary-foreground ml-auto rounded-tr-none"
                          : "bg-white border text-foreground mr-auto rounded-tl-none border-zinc-200/60"
                      )}
                    >
                      <div className="font-bold text-[9px] uppercase tracking-wider opacity-60">
                        {msg.sender === "student" ? "You" : "Study AI"}
                      </div>
                      <div>{msg.text}</div>
                      
                      {msg.revision_plan && msg.revision_plan.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-dashed border-zinc-200/60">
                          <div className="font-bold text-[9px] uppercase tracking-wider text-primary mb-1">
                            Revision Checklist:
                          </div>
                          <ul className="list-disc pl-4 space-y-1">
                            {msg.revision_plan.map((step, idx) => (
                              <li key={idx}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {msg.follow_up_questions && msg.follow_up_questions.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-dashed border-zinc-200/60">
                          <div className="font-bold text-[9px] uppercase tracking-wider text-primary mb-1">
                            Suggested Follow-ups:
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {msg.follow_up_questions.map((q, idx) => (
                              <Badge
                                key={idx}
                                variant="outline"
                                className="cursor-pointer hover:bg-zinc-100 text-[10px] py-0.5 px-2 bg-zinc-50 border-zinc-200"
                                onClick={() => setPrompt(q)}
                              >
                                {q}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {msg.safety_notice && (
                        <div className="mt-2.5 text-[10px] text-destructive bg-destructive/5 p-2 rounded-lg border border-destructive/10">
                          ⚠️ {msg.safety_notice}
                        </div>
                      )}
                    </div>
                  ))}

                  {isThinking && (
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse max-w-[85%] mr-auto p-4 bg-white border border-zinc-200/60 rounded-2xl rounded-tl-none">
                      <Sparkles className="size-4 animate-spin text-primary" />
                      Analyzing learning materials & notes...
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="p-4 border-t bg-white rounded-xl shadow-sm border-zinc-200/60">
              <PureMultimodalInput
                chatId="student-study-ai"
                messages={messages.map(m => ({ id: m.id, role: m.sender === "student" ? "user" : "model", content: m.text }))}
                attachments={attachments}
                setAttachments={setAttachments}
                onSendMessage={handleSendMessage}
                onStopGenerating={() => setIsThinking(false)}
                isGenerating={isThinking}
                canSend={!isThinking}
                selectedVisibilityType="private"
                suggestedActions={null}
                placeholder="Ask revision or support questions..."
                value={prompt}
                onChange={setPrompt}
              />
            </div>
          </div>
        )}

        {/* Tab 2: REVISION CENTER */}
        {activeTab === "revision" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <Card className="shadow-none border border-zinc-200/60 lg:col-span-4 bg-white rounded-xl">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-semibold">Generate Revision Guide</CardTitle>
                <CardDescription className="text-xs">Summarize materials and create checklists.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rev-topic" className="text-xs font-semibold text-zinc-700">Topic or Concept Name</Label>
                  <Input
                    id="rev-topic"
                    placeholder="e.g. Database Normalization"
                    value={revisionTopic}
                    onChange={(e) => setRevisionTopic(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <Button
                  onClick={handleGenerateRevision}
                  disabled={isGeneratingRevision || !revisionTopic}
                  className="w-full h-9 text-xs font-semibold"
                >
                  {isGeneratingRevision && <RefreshCw className="size-3.5 animate-spin mr-1.5" />}
                  Generate Study Note
                </Button>
              </CardContent>
            </Card>

            <div className="lg:col-span-8 space-y-4">
              {isGeneratingRevision && (
                <div className="space-y-3 p-6 border border-zinc-200/60 rounded-xl bg-white animate-pulse">
                  <div className="h-4 bg-zinc-200 rounded w-1/3" />
                  <div className="h-3 bg-zinc-100 rounded w-full" />
                  <div className="h-3 bg-zinc-100 rounded w-5/6" />
                </div>
              )}

              {revisionResult && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <Card className="shadow-none border border-zinc-200/60 bg-white rounded-xl">
                    <CardHeader className="py-4 border-b bg-zinc-50/50">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-sm font-semibold text-primary">{revisionTopic}</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] font-bold uppercase tracking-wider"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `${revisionTopic} Revision Summary\n\n${revisionResult.summary}`
                            );
                            toast.success("Revision summary copied!");
                          }}
                        >
                          Copy Guide
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <BookOpen className="size-3.5 text-primary" /> Concept Summary
                        </h4>
                        <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap p-4 bg-zinc-50 rounded-xl border border-zinc-200/40">
                          {revisionResult.summary}
                        </p>
                      </div>

                      {revisionResult.checklist && revisionResult.checklist.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <ListChecks className="size-3.5 text-primary" /> Key Learning Checklist
                          </h4>
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-medium text-foreground/75 pl-1">
                            {revisionResult.checklist.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-2 bg-emerald-50/20 p-2.5 border border-emerald-500/10 rounded-lg">
                                <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {!revisionResult && !isGeneratingRevision && (
                <div className="border border-dashed border-zinc-200 rounded-xl p-12 text-center text-xs text-muted-foreground bg-white/40">
                  <BookOpen className="size-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
                  Your generated revision guide and checklists will appear here.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: PRACTICE CENTER */}
        {activeTab === "practice" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1 min-h-0">
            <Card className="shadow-none border border-zinc-200/60 lg:col-span-4 bg-white rounded-xl">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-semibold">Generate Practice Quiz</CardTitle>
                <CardDescription className="text-xs">Self-assessment quizzes for active retrieval.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prac-topic" className="text-xs font-semibold text-zinc-700">Practice Topic</Label>
                  <Input
                    id="prac-topic"
                    placeholder="e.g. SQL Joins"
                    value={practiceTopic}
                    onChange={(e) => setPracticeTopic(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="prac-count" className="text-xs font-semibold text-zinc-700">Questions</Label>
                    <select
                      id="prac-count"
                      value={practiceCount}
                      onChange={(e) => setPracticeCount(e.target.value)}
                      className="w-full h-9 rounded-lg border text-xs px-2 bg-white outline-none"
                    >
                      <option value="3">3 Questions</option>
                      <option value="5">5 Questions</option>
                      <option value="10">10 Questions</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prac-style" className="text-xs font-semibold text-zinc-700">Style</Label>
                    <select
                      id="prac-style"
                      value={practiceStyle}
                      onChange={(e) => setPracticeStyle(e.target.value)}
                      className="w-full h-9 rounded-lg border text-xs px-2 bg-white outline-none"
                    >
                      <option value="MCQ">Multiple Choice</option>
                      <option value="Short Answer">Short Answer</option>
                      <option value="Scenario">Scenario Case</option>
                    </select>
                  </div>
                </div>
                <Button
                  onClick={handleGeneratePractice}
                  disabled={isGeneratingPractice || !practiceTopic}
                  className="w-full h-9 text-xs font-semibold mt-2"
                >
                  {isGeneratingPractice && <RefreshCw className="size-3.5 animate-spin mr-1.5" />}
                  Generate Practice Quiz
                </Button>
              </CardContent>
            </Card>

            <div className="lg:col-span-8 space-y-4">
              {isGeneratingPractice && (
                <div className="space-y-3 p-6 border border-zinc-200/60 rounded-xl bg-white animate-pulse">
                  <div className="h-4 bg-zinc-200 rounded w-1/4" />
                  <div className="h-12 bg-zinc-100 rounded w-full" />
                  <div className="h-12 bg-zinc-100 rounded w-full" />
                </div>
              )}

              {practiceQuestions.length > 0 && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <Card className="shadow-none border border-zinc-200/60 bg-white rounded-xl">
                    <CardHeader className="py-4 border-b bg-zinc-50/50">
                      <CardTitle className="text-sm font-semibold text-primary">Practice Self-Quiz: {practiceTopic}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                      {practiceQuestions.map((q, idx) => (
                        <div key={idx} className="space-y-3 pb-6 border-b border-dashed last:border-b-0 last:pb-0">
                          <div className="flex gap-2.5 items-start">
                            <span className="size-6 bg-zinc-100 text-zinc-600 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
                              {idx + 1}
                            </span>
                            <div className="text-xs font-semibold text-foreground/80 whitespace-pre-wrap pt-0.5">
                              {q.question}
                            </div>
                          </div>

                          {/* Student Input / Option Selection */}
                          {!revealFeedback ? (
                            <div className="pl-8 pt-1">
                              {practiceStyle === "MCQ" ? (
                                <div className="grid grid-cols-2 gap-2 max-w-md">
                                  {["A", "B", "C", "D"].map((opt) => (
                                    <button
                                      key={opt}
                                      onClick={() => setStudentAnswers(prev => ({ ...prev, [idx]: opt }))}
                                      className={cn(
                                        "h-8 rounded-lg border text-xs font-semibold transition-colors flex items-center px-3 gap-2 bg-white",
                                        studentAnswers[idx] === opt
                                          ? "border-primary text-primary bg-primary/5"
                                          : "hover:bg-zinc-50 border-zinc-200/70"
                                      )}
                                    >
                                      <span className="size-4 rounded-full border flex items-center justify-center text-[10px] font-bold bg-muted/20">
                                        {opt}
                                      </span>
                                      Select {opt}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <textarea
                                  placeholder="Type your practice response here..."
                                  value={studentAnswers[idx] || ""}
                                  onChange={(e) => setStudentAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
                                  className="w-full min-h-[60px] p-3 rounded-lg border text-xs bg-white focus:border-zinc-400 outline-none"
                                />
                              )}
                            </div>
                          ) : (
                            <div className="pl-8 space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="h-5 px-2 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[9px] font-bold">
                                  Correct Answer: {q.answer}
                                </Badge>
                                {studentAnswers[idx] && (
                                  <Badge variant="outline" className="h-5 px-2 bg-primary/10 text-primary border-primary/20 text-[9px] font-bold">
                                    Your Answer: {studentAnswers[idx]}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed italic bg-zinc-50 p-3 rounded-lg border border-zinc-200/30">
                                {q.explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}

                      {!revealFeedback && (
                        <Button
                          onClick={() => setRevealFeedback(true)}
                          className="w-full h-10 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white mt-2"
                        >
                          Check Answers & Explanations
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {practiceQuestions.length === 0 && !isGeneratingPractice && (
                <div className="border border-dashed border-zinc-200 rounded-xl p-12 text-center text-xs text-muted-foreground bg-white/40">
                  <ListChecks className="size-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
                  Your practice questions will appear here. No grading is recorded.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: STUDY PLANNER */}
        {activeTab === "planner" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <Card className="shadow-none border border-zinc-200/60 lg:col-span-4 bg-white rounded-xl">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-semibold">Generate Study Plan</CardTitle>
                <CardDescription className="text-xs">Schedule your weekly revision target.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="plan-exam" className="text-xs font-semibold text-zinc-700">Assessment Name</Label>
                  <Input
                    id="plan-exam"
                    placeholder="e.g. Database systems CAT"
                    value={plannerExam}
                    onChange={(e) => setPlannerExam(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="plan-date" className="text-xs font-semibold text-zinc-700">Target Date</Label>
                    <Input
                      id="plan-date"
                      type="date"
                      value={plannerDate}
                      onChange={(e) => setPlannerDate(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plan-hours" className="text-xs font-semibold text-zinc-700">Hours/Day</Label>
                    <select
                      id="plan-hours"
                      value={plannerHours}
                      onChange={(e) => setPlannerHours(e.target.value)}
                      className="w-full h-9 rounded-lg border text-xs px-2 bg-white outline-none"
                    >
                      <option value="1">1 Hour</option>
                      <option value="2">2 Hours</option>
                      <option value="3">3 Hours</option>
                      <option value="4">4+ Hours</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-topics" className="text-xs font-semibold text-zinc-700">Topics to Cover</Label>
                  <Input
                    id="plan-topics"
                    placeholder="e.g. SQL Joins, Normal Forms"
                    value={plannerTopics}
                    onChange={(e) => setPlannerTopics(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <Button
                  onClick={handleGeneratePlanner}
                  disabled={isGeneratingPlanner || !plannerExam}
                  className="w-full h-9 text-xs font-semibold mt-2"
                >
                  {isGeneratingPlanner && <RefreshCw className="size-3.5 animate-spin mr-1.5" />}
                  Generate Study Plan
                </Button>
              </CardContent>
            </Card>

            <div className="lg:col-span-8 space-y-4">
              {isGeneratingPlanner && (
                <div className="space-y-3 p-6 border border-zinc-200/60 rounded-xl bg-white animate-pulse">
                  <div className="h-4 bg-zinc-200 rounded w-1/3" />
                  <div className="h-30 bg-zinc-100 rounded w-full" />
                </div>
              )}

              {plannerResult && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <Card className="shadow-none border border-zinc-200/60 bg-white rounded-xl">
                    <CardHeader className="py-4 border-b bg-zinc-50/50">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-sm font-semibold text-primary">Revision Plan: {plannerExam}</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] font-bold uppercase tracking-wider"
                          onClick={() => {
                            navigator.clipboard.writeText(plannerResult);
                            toast.success("Study plan copied!");
                          }}
                        >
                          Copy Schedule
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-2">
                      <p className="text-xs text-foreground/85 leading-relaxed whitespace-pre-wrap p-4 bg-zinc-50 rounded-xl border border-zinc-200/40">
                        {plannerResult}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {!plannerResult && !isGeneratingPlanner && (
                <div className="border border-dashed border-zinc-200 rounded-xl p-12 text-center text-xs text-muted-foreground bg-white/40">
                  <Calendar className="size-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
                  Your weekly revision calendar and daily schedule will appear here.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 5: LEARNING INSIGHTS */}
        {activeTab === "insights" && (
          <div className="space-y-6">
            {resultsStats ? (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                <div className="md:col-span-4 space-y-4">
                  {/* Results Statistics Card */}
                  <Card className="shadow-none border border-zinc-200/60 bg-white rounded-xl">
                    <CardHeader className="py-4">
                      <CardTitle className="text-sm font-semibold">Academic Profile Summary</CardTitle>
                      <CardDescription className="text-xs">Based on completed released grades.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-3 bg-zinc-50 rounded-lg border">
                          <div className="text-lg font-bold text-zinc-900">{resultsStats.total}</div>
                          <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Exams</div>
                        </div>
                        <div className="p-3 bg-emerald-50/20 rounded-lg border border-emerald-500/10">
                          <div className="text-lg font-bold text-emerald-600">{resultsStats.average}%</div>
                          <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-wide">Avg Score</div>
                        </div>
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                          <div className="text-lg font-bold text-primary">{resultsStats.passRate}%</div>
                          <div className="text-[9px] font-bold text-primary/75 uppercase tracking-wide">Pass Rate</div>
                        </div>
                      </div>

                      <Button
                        onClick={handleAnalyzeInsights}
                        disabled={isAnalyzingInsights}
                        className="w-full h-9 text-xs font-semibold mt-2"
                      >
                        {isAnalyzingInsights && <RefreshCw className="size-3.5 animate-spin mr-1.5" />}
                        Analyze Topic Mastery
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Feedback Explainer Card */}
                  <Card className="shadow-none border border-zinc-200/60 bg-white rounded-xl">
                    <CardHeader className="py-4">
                      <CardTitle className="text-sm font-semibold">Feedback Explainer</CardTitle>
                      <CardDescription className="text-xs">Understand lecturer feedback and comments.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-left">
                      <div className="space-y-2">
                        <Label htmlFor="feedback-select" className="text-xs font-semibold text-zinc-700">Select Assessment</Label>
                        <select
                          id="feedback-select"
                          value={selectedResultForFeedback || ""}
                          onChange={(e) => setSelectedResultForFeedback(e.target.value)}
                          className="w-full h-9 rounded-lg border text-xs px-2 bg-white outline-none"
                        >
                          <option value="">-- Choose an Assessment --</option>
                          {results.map((res) => (
                            <option key={res.id} value={res.id}>
                              {res.assessment_title} ({res.percentage}%)
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button
                        onClick={handleExplainFeedback}
                        disabled={isExplainingFeedback || !selectedResultForFeedback}
                        className="w-full h-9 text-xs font-semibold"
                      >
                        {isExplainingFeedback && <RefreshCw className="size-3.5 animate-spin mr-1.5" />}
                        Explain Feedback
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                <div className="md:col-span-8 space-y-4">
                  {isAnalyzingInsights && (
                    <div className="space-y-3 p-6 border border-zinc-200/60 rounded-xl bg-white animate-pulse">
                      <div className="h-4 bg-zinc-200 rounded w-1/3" />
                      <div className="h-24 bg-zinc-100 rounded w-full" />
                    </div>
                  )}

                  {isExplainingFeedback && (
                    <div className="space-y-3 p-6 border border-zinc-200/60 rounded-xl bg-white animate-pulse">
                      <div className="h-4 bg-zinc-200 rounded w-1/3" />
                      <div className="h-24 bg-zinc-100 rounded w-full" />
                    </div>
                  )}

                  {insightsResult && !isAnalyzingInsights && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                      <Card className="shadow-none border border-zinc-200/60 bg-white rounded-xl">
                        <CardHeader className="py-4 border-b bg-zinc-50/50">
                          <CardTitle className="text-sm font-semibold text-primary">Strengths & Weaknesses Analysis</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 text-left">
                          <div className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap p-4 bg-zinc-50 rounded-xl border border-zinc-200/40">
                            {insightsResult}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-4 italic">
                            * Note: Insights are generated purely from completed historical data and contain no predictive grades.
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {feedbackExplanation && !isExplainingFeedback && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                      <Card className="shadow-none border border-zinc-200/60 bg-white rounded-xl">
                        <CardHeader className="py-4 border-b bg-zinc-50/50">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-sm font-semibold text-primary">Lecturer Feedback Explanation</CardTitle>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px] font-bold uppercase tracking-wider"
                              onClick={() => {
                                if (feedbackExplanation) {
                                  navigator.clipboard.writeText(feedbackExplanation);
                                  toast.success("Feedback explanation copied!");
                                }
                              }}
                            >
                              Copy Explanation
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="p-6 text-left">
                          <div className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap p-4 bg-zinc-50 rounded-xl border border-zinc-200/40">
                            {feedbackExplanation}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-4 italic">
                            * Note: This assistant only explains comments and grading metrics from the lecturer. It cannot change grades or override lecturer decisions.
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {!insightsResult && !feedbackExplanation && !isAnalyzingInsights && !isExplainingFeedback && (
                    <div className="border border-dashed border-zinc-200 rounded-xl p-12 text-center text-xs text-muted-foreground bg-white/40">
                      <BarChart2 className="size-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
                      {'Click "Analyze Topic Mastery" or select an assessment to explain lecturer feedback.'}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-zinc-200 rounded-xl p-12 text-center text-xs text-muted-foreground bg-white/40">
                <BarChart2 className="size-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
                No completed assessment results found to compile insights. Results will appear once lecturer reviews and releases them.
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
