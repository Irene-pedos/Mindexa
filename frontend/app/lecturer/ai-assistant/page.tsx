// app/lecturer/ai-assistant/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Card,
  CardDescription,
  CardTitle,
  CardHeader,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles,
  CheckCircle,
  ShieldCheck,
  Brain,
  BookOpen,
  BarChart2,
  RefreshCw,
  Plus,
  Trash2,
  Folder,
  Layers,
  Award,
  BookOpenCheck,
  ClipboardList,
  Maximize2,
  Minimize2,
  Copy,
  Lightbulb,
  Check,
  AlertTriangle,
  HelpCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Settings,
  Menu,
} from "lucide-react";
import {
  PureMultimodalInput,
  type Attachment,
} from "@/components/ui/multimodal-ai-chat-input";
import { geminiApi, ChatMessage } from "@/lib/api/gemini";
import { lecturerApi, WorkspaceListItem, WorkspaceDetail, LecturerMaterialResponse } from "@/lib/api/lecturer";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip as UITooltip,
  TooltipContent as UITooltipContent,
  TooltipProvider as UITooltipProvider,
  TooltipTrigger as UITooltipTrigger,
} from "@/components/ui/tooltip";

interface AISession {
  id: string;
  title: string;
  module: "chat" | "assessment" | "content" | "review" | "feedback" | "analytics" | "insights";
  workspaceId: string | null;
  history: ChatMessage[];
  generatedContent: string;
  created_at: string;
}

interface GradingReviewOutput {
  score: string;
  confidence: string;
  missingConcepts: string[];
  explanation: string;
}

const parseGradingReview = (text: string): GradingReviewOutput => {
  const result: GradingReviewOutput = {
    score: "",
    confidence: "",
    missingConcepts: [],
    explanation: ""
  };

  if (!text) return result;

  const scoreMatch = text.match(/(?:Suggested Score|Score|\[SCORE\])[:\s]*([0-9]+(?:\s*\/\s*[0-9]+)?)/i);
  if (scoreMatch) {
    result.score = scoreMatch[1].trim();
  }

  const confidenceMatch = text.match(/(?:Confidence Level|Confidence|\[CONFIDENCE\])[:\s]*(High|Medium|Low)/i);
  if (confidenceMatch) {
    result.confidence = confidenceMatch[1].trim();
  }

  const conceptsMatch = text.match(/(?:Missing Concepts|\[MISSING_CONCEPTS\])[:\s]*([\s\S]*?)(?:\n\n|\n\[|\*\*|$)/i);
  if (conceptsMatch) {
    const listLines = conceptsMatch[1].trim().split("\n");
    result.missingConcepts = listLines
      .map(line => line.replace(/^[-*•]\s*/, "").trim())
      .filter(line => line.length > 0 && !line.toLowerCase().includes("rubric") && !line.toLowerCase().includes("suggested"));
  }

  result.explanation = text
    .replace(/\[SCORE\]\s*.*(\n|$)/i, "")
    .replace(/\[CONFIDENCE\]\s*.*(\n|$)/i, "")
    .replace(/\[MISSING_CONCEPTS\]\s*([\s\S]*?)(?=\[ALIGNMENT_EXPLANATION\]|\[RATIONALE\]|Score|Confidence|$)/i, "")
    .replace(/\[ALIGNMENT_EXPLANATION\]\s*/i, "")
    .trim();

  return result;
};

export default function LecturerAIAssistant() {
  const [activeTab, setActiveTab] = useState<"chat" | "assessment" | "content" | "review" | "feedback" | "analytics" | "insights">("chat");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isContextSheetOpen, setIsContextSheetOpen] = useState(false);
  const [isConfigExpanded, setIsConfigExpanded] = useState(true);

  // Workspaces list & active selection
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [activeWorkspaceDetail, setActiveWorkspaceDetail] = useState<WorkspaceDetail | null>(null);
  const [loadingWorkspaceDetail, setLoadingWorkspaceDetail] = useState(false);

  // Resource / Materials Context Settings
  const [useCourseNotes, setUseCourseNotes] = useState(true);
  const [useLecturerMaterials, setUseLecturerMaterials] = useState(true);
  const [useAssessmentRubric, setUseAssessmentRubric] = useState(false);
  const [workspaceMaterials, setWorkspaceMaterials] = useState<LecturerMaterialResponse[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);

  // Saved Session Memory
  const [sessions, setSessions] = useState<AISession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Inputs for Module Forms
  // 1. Assessment Assistant Form
  const [asmtTopic, setAsmtTopic] = useState("");
  const [asmtType, setAsmtType] = useState("MCQ");
  const [asmtDifficulty, setAsmtDifficulty] = useState("Medium");
  const [asmtBloomLevel, setAsmtBloomLevel] = useState("Apply");
  const [asmtQuestionCount, setAsmtQuestionCount] = useState("5");
  const [asmtMarks, setAsmtMarks] = useState("10");
  const [asmtIncludeRubrics, setAsmtIncludeRubrics] = useState(true);

  // 2. Learning Material Assistant Form
  const [contentTopic, setContentTopic] = useState("");
  const [contentType, setContentType] = useState("Lesson Notes");
  const [contentOutcomes, setContentOutcomes] = useState("");

  // 3. Assessment Review Form
  const [studentResponse, setStudentResponse] = useState("");
  const [gradingRubric, setGradingRubric] = useState("");

  // 4. Feedback Generator Form
  const [feedbackPerformance, setFeedbackPerformance] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll chat messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, isGenerating]);

  // Load Workspaces & Saved Sessions on Mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoadingWorkspaces(true);
        const wsData = await lecturerApi.getWorkspaces();
        setWorkspaces(wsData || []);
        if (wsData && wsData.length > 0) {
          setSelectedWorkspaceId(wsData[0].id);
        }
      } catch (err) {
        console.error("Failed to load lecturer workspaces", err);
      } finally {
        setLoadingWorkspaces(false);
      }

      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("mindexa_lecturer_ai_sessions");
        if (stored) {
          try {
            setSessions(JSON.parse(stored));
          } catch (e) {
            console.error("Failed to parse saved AI sessions", e);
          }
        }
      }
    }
    loadData();
  }, []);

  // Fetch detailed Workspace data and materials when selection changes
  useEffect(() => {
    if (!selectedWorkspaceId) {
      setActiveWorkspaceDetail(null);
      setWorkspaceMaterials([]);
      return;
    }

    async function loadWorkspaceDetail() {
      try {
        setLoadingWorkspaceDetail(true);
        const detail = await lecturerApi.getWorkspaceDetail(selectedWorkspaceId);
        setActiveWorkspaceDetail(detail);

        const materials = await lecturerApi.getWorkspaceMaterials(selectedWorkspaceId);
        setWorkspaceMaterials(materials || []);
      } catch (err) {
        console.error("Failed to load workspace details/materials", err);
      } finally {
        setLoadingWorkspaceDetail(false);
      }
    }

    loadWorkspaceDetail();
  }, [selectedWorkspaceId]);

  const activeWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === selectedWorkspaceId) || null;
  }, [selectedWorkspaceId, workspaces]);

  const getWorkspaceContextPrompt = () => {
    const ws = activeWorkspaceDetail || activeWorkspace;
    if (!ws) return "";
    return `[Context: You are helping the lecturer in the workspace "${ws.title}" (${ws.code}), Class: ${ws.class_name}, Institution: ${ws.institution_name}, Academic Year: ${ws.academic_year}${activeWorkspaceDetail?.department_name ? `, Department: ${activeWorkspaceDetail.department_name}` : ""}${activeWorkspaceDetail?.option_name ? `, Program: ${activeWorkspaceDetail.option_name}` : ""}]. `;
  };

  const getSelectedResourcesPrompt = () => {
    const list: string[] = [];
    if (useCourseNotes) list.push("Official Course Notes / Syllabus");
    if (useLecturerMaterials) list.push("Lecturer-provided study materials");
    if (useAssessmentRubric) list.push("Target Assessment Rubric criteria");

    selectedMaterials.forEach((matId) => {
      const mat = workspaceMaterials.find((m) => m.id === matId);
      if (mat) {
        list.push(`Workspace File Context: ${mat.display_name || mat.original_filename} (Category: ${mat.material_category})`);
      }
    });

    if (list.length === 0) return "";
    return `[Resource Context: You must prioritize and align your response with the following resources: ${list.join(", ")}]. `;
  };

  // Session Management helpers
  const startNewSession = (moduleType: typeof activeTab, customTitle?: string) => {
    const newId = Date.now().toString();
    const title = customTitle || `${moduleType.charAt(0).toUpperCase() + moduleType.slice(1)} Session`;
    const newSession: AISession = {
      id: newId,
      title,
      module: moduleType,
      workspaceId: selectedWorkspaceId || null,
      history: [],
      generatedContent: "",
      created_at: new Date().toISOString()
    };

    const updated = [newSession, ...sessions];
    setSessions(updated);
    setCurrentSessionId(newId);
    setHistory([]);
    setGeneratedContent("");
    if (typeof window !== "undefined") {
      localStorage.setItem("mindexa_lecturer_ai_sessions", JSON.stringify(updated));
    }
    toast.success(`Started new ${moduleType} session`);
  };

  const loadSession = (session: AISession) => {
    setCurrentSessionId(session.id);
    setActiveTab(session.module);
    setHistory(session.history);
    setGeneratedContent(session.generatedContent);
    if (session.workspaceId) {
      setSelectedWorkspaceId(session.workspaceId);
    }
    setIsContextSheetOpen(false);
    toast.info(`Loaded session: ${session.title}`);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== id);
    setSessions(updated);
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      setHistory([]);
      setGeneratedContent("");
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("mindexa_lecturer_ai_sessions", JSON.stringify(updated));
    }
    toast.info("Session history deleted");
  };

  const updateCurrentSession = (updatedHistory: ChatMessage[], updatedContent: string) => {
    let sessionId = currentSessionId;
    let updatedSessions = [...sessions];

    if (!sessionId) {
      sessionId = Date.now().toString();
      const newSession: AISession = {
        id: sessionId,
        title: `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Session`,
        module: activeTab,
        workspaceId: selectedWorkspaceId || null,
        history: updatedHistory,
        generatedContent: updatedContent,
        created_at: new Date().toISOString()
      };
      updatedSessions.unshift(newSession);
      setCurrentSessionId(sessionId);
    } else {
      updatedSessions = updatedSessions.map((s) => {
        if (s.id === sessionId) {
          return {
            ...s,
            history: updatedHistory,
            generatedContent: updatedContent,
          };
        }
        return s;
      });
    }

    setSessions(updatedSessions);
    if (typeof window !== "undefined") {
      localStorage.setItem("mindexa_lecturer_ai_sessions", JSON.stringify(updatedSessions));
    }
  };

  // Quick Actions Config (Categorized)
  const quickActionGroups = [
    {
      title: "Assessment Tasks",
      actions: [
        {
          name: "Generate Assessment",
          description: "Draft quiz, essay, or case study drafts for review",
          onClick: () => {
            setActiveTab("assessment");
            setIsConfigExpanded(true);
            toast.info("Switched to Assessment Generator");
          }
        },
        {
          name: "Generate Question Bank",
          description: "Create a pool of draft questions on a specific topic",
          onClick: () => {
            setActiveTab("chat");
            startNewSession("chat", "Question Bank Creation");
            setPrompt("Help me draft a comprehensive Question Bank of 15 questions for my course covering normalization and SQL optimization.");
          }
        },
        {
          name: "Create Rubric",
          description: "Draft scoring criteria and rubrics for open-ended tasks",
          onClick: () => {
            setActiveTab("chat");
            startNewSession("chat", "Rubric Draft");
            setPrompt("Draft a 5-point grading rubric for a practical database design assignment. Include criteria for Schema correctness, Normalization, and Key constraints.");
          }
        },
        {
          name: "Improve Existing Questions",
          description: "Refine question grammar, distractors, or difficulty",
          onClick: () => {
            setActiveTab("chat");
            startNewSession("chat", "Question Refinement");
            setPrompt("Review and improve this multiple-choice question: 'What is 3NF?' Make the distractors more challenging and align it to Bloom's Apply level.");
          }
        }
      ]
    },
    {
      title: "Teaching Tasks",
      actions: [
        {
          name: "Create Lesson Notes",
          description: "Draft structured lesson notes for lecture preparation",
          onClick: () => {
            setActiveTab("content");
            setContentType("Lesson Notes");
            setIsConfigExpanded(true);
            toast.info("Switched to Content Assistant: Lesson Notes");
          }
        },
        {
          name: "Create Study Guide",
          description: "Draft a study guide for exam preparation",
          onClick: () => {
            setActiveTab("content");
            setContentType("Study Guide");
            setIsConfigExpanded(true);
            toast.info("Switched to Content Assistant: Study Guide");
          }
        },
        {
          name: "Create Revision Material",
          description: "Draft revision sheets and key-concept cheat sheets",
          onClick: () => {
            setActiveTab("content");
            setContentType("Revision Sheet");
            setIsConfigExpanded(true);
            toast.info("Switched to Content Assistant: Revision Sheet");
          }
        }
      ]
    },
    {
      title: "Review Tasks",
      actions: [
        {
          name: "Review Student Answers",
          description: "Analyze essay responses against grading criteria",
          onClick: () => {
            setActiveTab("review");
            setIsConfigExpanded(true);
            toast.info("Switched to Rubric Review Assistant");
          }
        },
        {
          name: "Generate Feedback",
          description: "Draft constructive performance feedback drafts",
          onClick: () => {
            setActiveTab("feedback");
            setIsConfigExpanded(true);
            toast.info("Switched to Student Feedback Assistant");
          }
        },
        {
          name: "Analyze Class Performance",
          description: "Identify topic mastery trends and average scores",
          onClick: () => {
            setActiveTab("analytics");
            setIsConfigExpanded(true);
            toast.info("Switched to Analytics Assistant");
          }
        }
      ]
    },
    {
      title: "Insights",
      actions: [
        {
          name: "Weak Topics Analysis",
          description: "Identify concept gaps across assessment results",
          onClick: () => {
            setActiveTab("insights");
            setIsConfigExpanded(true);
            toast.info("Switched to Teaching Insights");
          }
        },
        {
          name: "Student Progress Summary",
          description: "Summarize performance trends for low-scoring groups",
          onClick: () => {
            setActiveTab("chat");
            startNewSession("chat", "Progress Summary");
            setPrompt("Draft a student progress summary template analyzing performance changes between mid-term and quiz scores.");
          }
        },
        {
          name: "Assessment Difficulty Analysis",
          description: "Determine discrimination index for recent quizzes",
          onClick: () => {
            setActiveTab("chat");
            startNewSession("chat", "Difficulty Analysis");
            setPrompt("Draft a guide on how to calculate assessment difficulty and discrimination index for multiple-choice questions.");
          }
        }
      ]
    }
  ];

  // AI execution caller
  const executeAIRequest = async (userPrompt: string, systemContext: string) => {
    setIsGenerating(true);
    setIsConfigExpanded(false); // Automatically collapse settings when generating
    try {
      const workspacePrefix = getWorkspaceContextPrompt();
      const resourcesPrefix = getSelectedResourcesPrompt();
      const fullMessage = `${workspacePrefix}${resourcesPrefix}${userPrompt}`;

      const response = await geminiApi.chat({
        message: fullMessage,
        system_prompt: systemContext,
        history: history.slice(-10),
      });

      const nextHistory: ChatMessage[] = [
        ...history,
        { role: "user", content: userPrompt },
        { role: "model", content: response.reply }
      ];

      setHistory(nextHistory);
      setGeneratedContent(response.reply);
      updateCurrentSession(nextHistory, response.reply);
      toast.success("AI suggestion drafted successfully");
    } catch (e: any) {
      toast.error(e.message || "AI assistant failed to respond. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // 1. Generate Assessment Draft
  const handleGenerateAssessment = () => {
    if (!asmtTopic.trim()) {
      toast.error("Please enter an assessment topic.");
      return;
    }
    const userPrompt = `Generate a draft assessment on topic "${asmtTopic}".
Details:
- Question Type: ${asmtType}
- Bloom's Taxonomy Level: ${asmtBloomLevel}
- Difficulty Level: ${asmtDifficulty}
- Question Count: ${asmtQuestionCount}
- Suggested Marks: ${asmtMarks}
- Include Rubric: ${asmtIncludeRubrics ? "Yes" : "No"}

Please provide draft questions, suggested answers, distractors for MCQs, suggested marks, and rubrics where applicable. Keep the content marked clearly as DRAFT.`;
    const systemContext = "You are an academic assessment generator. Help the lecturer draft questions. Do not make final publishing decisions. Emphasize that all content remains a draft for lecturer review.";

    if (!currentSessionId) {
      startNewSession("assessment", `Assessment: ${asmtTopic}`);
    }
    executeAIRequest(userPrompt, systemContext);
  };

  // 2. Generate Learning Material
  const handleGenerateContent = () => {
    if (!contentTopic.trim()) {
      toast.error("Please enter a content topic.");
      return;
    }
    const userPrompt = `Generate structured learning materials.
Topic: "${contentTopic}"
Material Type: ${contentType}
Target Outcomes / Focus: ${contentOutcomes || "General comprehension"}

Please provide lesson notes, revision guides, summaries, or outline objectives in a clear instructional layout. Make all content easily editable.`;
    const systemContext = "You are an academic materials content writer. Generate editable lesson summaries, study guides, outlines, and lecture resources for ICT or target courses.";

    if (!currentSessionId) {
      startNewSession("content", `Content: ${contentTopic}`);
    }
    executeAIRequest(userPrompt, systemContext);
  };

  // 3. Review Student Answer against Rubric
  const handleReviewSubmission = () => {
    if (!studentResponse.trim()) {
      toast.error("Please paste the student response.");
      return;
    }
    const userPrompt = `Analyze the following student essay response.
Student Response:
"${studentResponse}"

Grading Criteria / Rubric:
"${gradingRubric || "General academic correctness"}"

Analyze the response, identify missing concepts, suggest a score out of the maximum marks, and estimate your confidence level (Low, Medium, or High).
Format your response structured with markers so the user can parse it:
[SCORE] Suggested score (e.g. 15/20)
[CONFIDENCE] Confidence level (Low/Medium/High)
[MISSING_CONCEPTS]
- Concept 1
- Concept 2
[ALIGNMENT_EXPLANATION]
State the detailed scoring rationale.`;
    const systemContext = `You are an AI assessment review assistant. Recommend suggested scores, confidence metrics, and alignment rationales. Emphasize that the final score is strictly a lecturer decision and does not update grades directly.`;

    if (!currentSessionId) {
      startNewSession("review", "Rubric Answer Review");
    }
    executeAIRequest(userPrompt, systemContext);
  };

  // 4. Generate Student Feedback
  const handleGenerateFeedback = () => {
    if (!feedbackPerformance.trim()) {
      toast.error("Please enter performance summary details.");
      return;
    }
    const userPrompt = `Draft feedback based on this performance summary:
"${feedbackPerformance}"

Generate editable feedback containing strengths, weaknesses, areas for improvement, and recommendations.`;
    const systemContext = "You are a supportive academic mentor. Draft editable student feedback summaries focused on strengths, deficiencies, and practical improvement suggestions.";

    if (!currentSessionId) {
      startNewSession("feedback", "Personalized Feedback");
    }
    executeAIRequest(userPrompt, systemContext);
  };

  // 5. Analyze Class performance
  const handleAnalyzeClassPerformance = () => {
    const ws = activeWorkspaceDetail || activeWorkspace;
    const stats = ws
      ? `Course: ${ws.title} (${ws.code})
- Student count: ${ws.student_count}
- Class performance average: ${ws.performance_avg}%
- Institution: ${ws.institution_name}
- Class: ${ws.class_name}`
      : `Class average: 65%
- Normalized database questions: 80% success
- Indexing: 40% success
- Query optimization: 35% success`;

    const userPrompt = `Analyze class performance trends based on these statistics:
${stats}

Analyze assessment averages, masteries, difficult areas, and performance trends. Recommend topics requiring adjustment. Use aggregated data only.`;
    const systemContext = "You are a class performance analytics assistant. Analyze aggregated performance metrics, identifying difficult questions or topic mastery trends. No direct DB writing.";

    if (!currentSessionId) {
      startNewSession("analytics", "Class Performance Analysis");
    }
    executeAIRequest(userPrompt, systemContext);
  };

  // 6. Teaching Insights
  const handleGenerateTeachingInsights = () => {
    const ws = activeWorkspaceDetail || activeWorkspace;
    const stats = ws
      ? `Course: ${ws.title} (${ws.code})
- Performance Avg: ${ws.performance_avg}%
- Class: ${ws.class_name}`
      : "Generic course.";

    const userPrompt = `Generate teaching improvements and recommendations for the course:
${stats}

Identify topics requiring reinforcement, suggest practical practice activities, revision sessions, alternate teaching approaches, and supplementary resources.`;
    const systemContext = "You are a pedagogical advisor. Suggest teaching adjustments, practical exercises, and revision strategies to improve lecture efficacy.";

    if (!currentSessionId) {
      startNewSession("insights", "Teaching Insights");
    }
    executeAIRequest(userPrompt, systemContext);
  };

  // Chat message send handler
  const handleChatSendMessage = async (params: { input: string; attachments: Attachment[] }) => {
    let userMessage = params.input.trim();
    if (!userMessage) return;

    if (params.attachments.length > 0) {
      const fileNames = params.attachments.map((a) => a.name).join(", ");
      userMessage = `${userMessage}\n\n[Attached Files: ${fileNames}]`;
    }

    setPrompt("");
    const systemContext = "You are an expert Mindexa Lecturer AI Assistant. Help the lecturer by answering questions directly, explaining concepts, or helping them draft course materials. If the lecturer asks a direct question, answer it directly, clearly and comprehensively in a conversational tone without wrapping it in a lesson outline or draft syllabus template. If they request a draft structure (e.g. lesson notes, syllabus, questions, or rubrics), then generate the requested draft. All recommendations are suggestions for the lecturer's review.";
    executeAIRequest(userMessage, systemContext);
  };

  const handleCopyDraft = () => {
    if (!generatedContent) return;
    navigator.clipboard.writeText(generatedContent);
    toast.success("Draft content copied to clipboard!");
  };

  const parsedReview = useMemo(() => {
    if (activeTab !== "review") return null;
    return parseGradingReview(generatedContent);
  }, [generatedContent, activeTab]);

  const activeWorkspaceName = useMemo(() => {
    return activeWorkspaceDetail?.title || activeWorkspace?.title || "No Workspace Connected";
  }, [activeWorkspaceDetail, activeWorkspace]);

  return (
    <div className={cn("w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-200", isFullScreen && "fixed inset-0 z-50 bg-white p-4 overflow-y-auto flex flex-col")}>

      {/* Header Container */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Lecturer AI Assistant</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium truncate">
            Active: <span className="text-primary">{activeWorkspaceName}</span> · Draft pedagogical materials, assessments, and feedback.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsContextSheetOpen(true)}
            className="h-8.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border-zinc-200 bg-white"
          >
            <Folder className="size-3.5 mr-1.5 text-zinc-500" /> Context Context
          </Button>

          {/* Fullscreen Trigger */}
          <Button
            variant="outline"
            size="icon"
            className="h-8.5 w-8.5 text-zinc-400 hover:text-zinc-600 rounded-lg border-zinc-200 bg-white"
            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
          >
            {isFullScreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start min-h-[600px] w-full">

        {/* Horizontal Navigation List on Mobile Screens */}
        <div className="md:hidden w-full overflow-x-auto flex border-b border-zinc-150 pb-1 gap-1">
          {[
            { id: "chat", label: "Chat", icon: Brain },
            { id: "assessment", label: "Assessment", icon: Layers },
            { id: "content", label: "Content", icon: BookOpen },
            { id: "review", label: "Rubric Review", icon: BookOpenCheck },
            { id: "feedback", label: "Feedback", icon: Award },
            { id: "analytics", label: "Analytics", icon: BarChart2 },
            { id: "insights", label: "Insights", icon: Lightbulb },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setGeneratedContent("");
                  setIsConfigExpanded(true);
                }}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border",
                  activeTab === tab.id
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-zinc-600 border-zinc-250 hover:bg-zinc-50"
                )}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Collapsible Left Navigation Sidebar on Desktop */}
        <div className={cn(
          "hidden md:flex flex-col bg-zinc-50/50 p-1.5 rounded-xl border border-zinc-200 gap-1.5 h-fit shrink-0 text-start transition-all duration-300 relative",
          isSidebarCollapsed ? "w-[54px]" : "w-[180px]"
        )}>
          {[
            { id: "chat", label: "Assistant Chat", icon: Brain },
            { id: "assessment", label: "Assessment Draft", icon: Layers },
            { id: "content", label: "Learning Materials", icon: BookOpen },
            { id: "review", label: "Response Review", icon: BookOpenCheck },
            { id: "feedback", label: "Student Feedback", icon: Award },
            { id: "analytics", label: "Class Analytics", icon: BarChart2 },
            { id: "insights", label: "Reinforcement", icon: Lightbulb },
          ].map((tab) => {
            const Icon = tab.icon;
            const isTabActive = activeTab === tab.id;
            return (
              <UITooltipProvider key={tab.id} delayDuration={0}>
                <UITooltip>
                  <UITooltipTrigger asChild>
                    <button
                      onClick={() => {
                        setActiveTab(tab.id as any);
                        setGeneratedContent("");
                        setIsConfigExpanded(true);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold uppercase tracking-wide rounded-lg transition-all",
                        isTabActive
                          ? "bg-white border text-primary shadow-sm"
                          : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/70",
                        isSidebarCollapsed && "justify-center px-0 gap-0"
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!isSidebarCollapsed && <span className="truncate">{tab.label}</span>}
                    </button>
                  </UITooltipTrigger>
                  <UITooltipContent side="right" className="px-2 py-1 text-xs font-semibold bg-zinc-900 text-white rounded shadow-md border-none">
                    {tab.label}
                  </UITooltipContent>
                </UITooltip>
              </UITooltipProvider>
            );
          })}

          <Separator className="my-1 bg-zinc-200" />

          {/* Toggle Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="w-full h-8 text-xs font-semibold rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100/50 flex items-center justify-center p-0"
            title={isSidebarCollapsed ? "Expand Navigation" : "Collapse Navigation"}
            type="button"
          >
            <ChevronDown className={cn(
              "size-4 transition-transform duration-300",
              isSidebarCollapsed ? "-rotate-90" : "rotate-90"
            )} />
          </Button>
        </div>

        {/* Right Main Panel Dashboard */}
        <div className="flex-1 w-full bg-white border border-zinc-200 rounded-xl p-3 md:p-4 flex flex-col min-h-[560px]">

          {/* Tab Content 1: Chat Assistant */}
          {activeTab === "chat" && (
            <div className="flex-1 flex flex-col min-h-0 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100 shrink-0">
                <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Brain className="size-4 text-primary shrink-0" /> Academic Assistant Chat
                </h3>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-[300px]">
                {history.length === 0 && !isGenerating ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4 max-w-2xl mx-auto space-y-5">
                    <div className="size-10 rounded-full bg-zinc-50 border flex items-center justify-center">
                      <Brain className="size-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-sm font-bold text-zinc-800">Academic Assistant Dashboard</h2>
                      <p className="text-xs text-zinc-500 font-medium">
                        Generate scoring rubrics, outlines, lesson reinforcements, or evaluate exam essays. Select a workspace or trigger a quick template workflow.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left pt-2">
                      {quickActionGroups.map((group, gIdx) => (
                        <div key={gIdx} className="border border-zinc-150 rounded-xl p-3 bg-zinc-50/50 space-y-2">
                          <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-200/50 pb-1">{group.title}</h4>
                          <div className="space-y-1">
                            {group.actions.map((act, aIdx) => (
                              <button
                                key={aIdx}
                                onClick={act.onClick}
                                className="w-full text-left hover:bg-white hover:border border-transparent p-1 px-1.5 rounded-lg text-xs transition-all flex flex-col"
                              >
                                <span className="font-semibold text-zinc-700 flex items-center gap-1 text-[11px]">
                                  {act.name}
                                </span>
                                <span className="text-[9px] text-zinc-400">{act.description}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 max-w-3xl mx-auto py-1">
                    {history.map((msg, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex flex-col max-w-[85%] space-y-0.5 p-3 rounded-xl text-sm leading-normal whitespace-pre-wrap font-medium shadow-sm",
                          msg.role === "user"
                            ? "bg-zinc-800 text-white ml-auto rounded-tr-none"
                            : "bg-zinc-50 border border-zinc-150 text-zinc-800 mr-auto rounded-tl-none text-left"
                        )}
                      >
                        <div className="font-bold text-[8px] uppercase tracking-wider opacity-60">
                          {msg.role === "user" ? "You" : "AI Assistant"}
                        </div>
                        <div>{msg.content}</div>
                      </div>
                    ))}

                    {isGenerating && (
                      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 animate-pulse max-w-[85%] mr-auto p-3 bg-zinc-50 border border-zinc-150 rounded-xl rounded-tl-none">
                        <Sparkles className="size-4 animate-spin text-primary" />
                        Formulating draft recommendation...
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="p-3 border border-zinc-150 bg-white rounded-xl shadow-inner">
                <PureMultimodalInput
                  chatId="lecturer-chat-ai"
                  messages={history.map((msg, idx) => ({
                    id: `msg-${idx}-${msg.role}`,
                    content: msg.content,
                    role: msg.role,
                  }))}
                  attachments={attachments}
                  setAttachments={setAttachments}
                  onSendMessage={handleChatSendMessage}
                  onStopGenerating={() => setIsGenerating(false)}
                  isGenerating={isGenerating}
                  canSend={!isGenerating}
                  selectedVisibilityType="private"
                  suggestedActions={null}
                  placeholder="Ask the assistant anything..."
                  value={prompt}
                  onChange={setPrompt}
                />
              </div>
            </div>
          )}

          {/* Tab 2: Assessment Generator */}
          {activeTab === "assessment" && (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b pb-2.5">
                <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wide flex items-center gap-1">
                  <Layers className="size-4 text-primary shrink-0" /> Assessment Generator
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                  className="h-7 text-xs text-primary hover:bg-primary/5 flex items-center gap-1 border border-primary/20 rounded-lg"
                >
                  {isConfigExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  {isConfigExpanded ? "Hide Settings" : "Configure Parameters"}
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
                {isConfigExpanded && (
                  <div className="lg:col-span-4 space-y-4 text-left border border-zinc-150 p-4 rounded-xl bg-zinc-50/50 animate-in slide-in-from-left duration-200">
                    <div className="space-y-1.5">
                      <Label htmlFor="asmt-topic" className="text-xs font-bold text-zinc-700">Topic / Core Theme</Label>
                      <Input
                        id="asmt-topic"
                        placeholder="e.g. Normalization (1NF, 2NF, 3NF)"
                        value={asmtTopic}
                        onChange={(e) => setAsmtTopic(e.target.value)}
                        className="h-8.5 text-xs bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="asmt-style" className="text-xs font-bold text-zinc-700">Style</Label>
                        <select
                          id="asmt-style"
                          value={asmtType}
                          onChange={(e) => setAsmtType(e.target.value)}
                          className="w-full h-8.5 rounded-lg border border-zinc-200 text-xs px-2 bg-white text-zinc-700 outline-none"
                        >
                          <option value="MCQ">Multiple Choice</option>
                          <option value="True/False">True / False</option>
                          <option value="Matching">Matching</option>
                          <option value="Short Answer">Short Answer</option>
                          <option value="Essay">Essay Question</option>
                          <option value="Case Study">Case Study</option>
                          <option value="Practical">Practical Challenge</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="asmt-bloom" className="text-xs font-bold text-zinc-700">Bloom&apos;s Level</Label>
                        <select
                          id="asmt-bloom"
                          value={asmtBloomLevel}
                          onChange={(e) => setAsmtBloomLevel(e.target.value)}
                          className="w-full h-8.5 rounded-lg border border-zinc-200 text-xs px-2 bg-white text-zinc-700 outline-none"
                        >
                          <option value="Remembering">Remembering</option>
                          <option value="Understanding">Understanding</option>
                          <option value="Applying">Applying</option>
                          <option value="Analyzing">Analyzing</option>
                          <option value="Evaluating">Evaluating</option>
                          <option value="Creating">Creating</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="asmt-diff" className="text-xs font-bold text-zinc-700">Difficulty</Label>
                        <select
                          id="asmt-diff"
                          value={asmtDifficulty}
                          onChange={(e) => setAsmtDifficulty(e.target.value)}
                          className="w-full h-8.5 rounded-lg border border-zinc-200 text-xs px-2 bg-white text-zinc-700 outline-none"
                        >
                          <option value="Easy">Easy</option>
                          <option value="Medium">Medium</option>
                          <option value="Hard">Hard</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="asmt-count" className="text-xs font-bold text-zinc-700">Question Count</Label>
                        <select
                          id="asmt-count"
                          value={asmtQuestionCount}
                          onChange={(e) => setAsmtQuestionCount(e.target.value)}
                          className="w-full h-8.5 rounded-lg border border-zinc-200 text-xs px-2 bg-white text-zinc-700 outline-none"
                        >
                          <option value="3">3 Items</option>
                          <option value="5">5 Items</option>
                          <option value="10">10 Items</option>
                          <option value="15">15 Items</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-4 items-center justify-between border-y py-2.5 my-1.5 border-zinc-200">
                      <div className="space-y-1">
                        <Label htmlFor="asmt-marks" className="text-xs font-bold text-zinc-700">Suggested Marks</Label>
                        <Input
                          id="asmt-marks"
                          type="number"
                          value={asmtMarks}
                          onChange={(e) => setAsmtMarks(e.target.value)}
                          className="h-8 w-20 text-xs bg-white text-center font-bold"
                        />
                      </div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-zinc-600 cursor-pointer mt-4.5">
                        <input
                          type="checkbox"
                          checked={asmtIncludeRubrics}
                          onChange={(e) => setAsmtIncludeRubrics(e.target.checked)}
                          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 size-3.5"
                        />
                        <span>Include Rubrics</span>
                      </label>
                    </div>

                    <Button
                      onClick={handleGenerateAssessment}
                      disabled={isGenerating || !asmtTopic}
                      className="w-full h-8.5 text-xs font-bold uppercase tracking-wider text-white bg-primary hover:bg-primary/95"
                    >
                      {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
                      Generate Draft
                    </Button>
                  </div>
                )}

                <div className={cn(
                  "flex flex-col h-full min-h-[350px] space-y-3",
                  isConfigExpanded ? "lg:col-span-8" : "lg:col-span-12"
                )}>
                  <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-left">
                    <ShieldCheck className="size-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[10px] text-amber-900 leading-normal font-semibold">
                      Draft Protocol: Generated questions are drafts for review. AI cannot write questions directly to official question banks without lecturer approval.
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col min-h-0">
                    <Label className="text-xs font-bold text-zinc-700 mb-1 ml-0.5 text-left">Generated draft output</Label>
                    <Textarea
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      placeholder="Assessment details will generate here..."
                      className="flex-1 min-h-[300px] p-4 text-sm font-semibold bg-zinc-50 border rounded-xl resize-none outline-none leading-relaxed text-zinc-700"
                    />
                  </div>

                  {generatedContent && (
                    <div className="flex gap-2 justify-end shrink-0">
                      <Button variant="outline" size="sm" onClick={handleCopyDraft} className="h-8 text-[10px] font-bold uppercase border-zinc-200 bg-white">
                        <Copy className="size-3 mr-1" /> Copy Draft
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Content Assistant */}
          {activeTab === "content" && (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b pb-2.5">
                <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wide flex items-center gap-1">
                  <BookOpen className="size-4 text-primary shrink-0" /> Learning Material Assistant
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                  className="h-7 text-xs text-primary hover:bg-primary/5 flex items-center gap-1 border border-primary/20 rounded-lg"
                >
                  {isConfigExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  {isConfigExpanded ? "Hide Settings" : "Configure Parameters"}
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
                {isConfigExpanded && (
                  <div className="lg:col-span-4 space-y-4 text-left border border-zinc-150 p-4 rounded-xl bg-zinc-50/50 animate-in slide-in-from-left duration-200">
                    <div className="space-y-1.5">
                      <Label htmlFor="content-topic" className="text-xs font-bold text-zinc-700">Topic Outline</Label>
                      <Input
                        id="content-topic"
                        placeholder="e.g. Introduction to Subnetting"
                        value={contentTopic}
                        onChange={(e) => setContentTopic(e.target.value)}
                        className="h-8.5 text-xs bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="content-type" className="text-xs font-bold text-zinc-700">Material Type</Label>
                      <select
                        id="content-type"
                        value={contentType}
                        onChange={(e) => setContentType(e.target.value)}
                        className="w-full h-8.5 rounded-lg border border-zinc-200 text-xs px-2 bg-white text-zinc-700 outline-none"
                      >
                        <option value="Lesson Summary">Lesson Summary</option>
                        <option value="Lecture Notes">Lecture Notes</option>
                        <option value="Study Guide">Study Guide</option>
                        <option value="Revision Sheet">Revision Sheet</option>
                        <option value="Course Outline">Course Outline</option>
                        <option value="Learning Objectives">Learning Objectives</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="content-outcomes" className="text-xs font-bold text-zinc-700">Learning Outcomes / Focus</Label>
                      <Textarea
                        id="content-outcomes"
                        placeholder="e.g. Calculating network IDs, hosts range..."
                        value={contentOutcomes}
                        onChange={(e) => setContentOutcomes(e.target.value)}
                        className="h-24 text-xs font-normal bg-white"
                      />
                    </div>

                    <Button
                      onClick={handleGenerateContent}
                      disabled={isGenerating || !contentTopic}
                      className="w-full h-8.5 text-xs font-bold uppercase tracking-wider text-white bg-primary hover:bg-primary/95"
                    >
                      {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
                      Generate Material
                    </Button>
                  </div>
                )}

                <div className={cn(
                  "flex flex-col h-full min-h-[350px] space-y-3",
                  isConfigExpanded ? "lg:col-span-8" : "lg:col-span-12"
                )}>
                  <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-left">
                    <ShieldCheck className="size-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[10px] text-amber-900 leading-normal font-semibold">
                      Draft Protocol: Generated learning resources must be reviewed and manually approved by the lecturer before being published to student workspaces.
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col min-h-0">
                    <Label className="text-xs font-bold text-zinc-700 mb-1 ml-0.5 text-left">Generated educational content</Label>
                    <Textarea
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      placeholder="Educational materials will generate here..."
                      className="flex-1 min-h-[300px] p-4 text-sm font-semibold bg-zinc-50 border rounded-xl resize-none outline-none leading-relaxed text-zinc-700"
                    />
                  </div>

                  {generatedContent && (
                    <div className="flex gap-2 justify-end shrink-0">
                      <Button variant="outline" size="sm" onClick={handleCopyDraft} className="h-8 text-[10px] font-bold uppercase border-zinc-200 bg-white">
                        <Copy className="size-3 mr-1" /> Copy Draft
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Review Assistant */}
          {activeTab === "review" && (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b pb-2.5">
                <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wide flex items-center gap-1">
                  <BookOpenCheck className="size-4 text-primary shrink-0" /> Response Audit Assistant
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                  className="h-7 text-xs text-primary hover:bg-primary/5 flex items-center gap-1 border border-primary/20 rounded-lg"
                >
                  {isConfigExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  {isConfigExpanded ? "Hide Settings" : "Configure Parameters"}
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
                {isConfigExpanded && (
                  <div className="lg:col-span-4 space-y-4 text-left border border-zinc-150 p-4 rounded-xl bg-zinc-50/50 animate-in slide-in-from-left duration-200">
                    <div className="space-y-1.5">
                      <Label htmlFor="review-rubric" className="text-xs font-bold text-zinc-700">Rubric / Model Answer</Label>
                      <Textarea
                        id="review-rubric"
                        placeholder="Paste target grading schema or reference answers..."
                        value={gradingRubric}
                        onChange={(e) => setGradingRubric(e.target.value)}
                        className="h-20 text-xs font-normal bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="review-student" className="text-xs font-bold text-zinc-700">Student Response</Label>
                      <Textarea
                        id="review-student"
                        placeholder="Paste the student's open-ended response here..."
                        value={studentResponse}
                        onChange={(e) => setStudentResponse(e.target.value)}
                        className="h-28 text-xs font-normal bg-white"
                      />
                    </div>

                    <Button
                      onClick={handleReviewSubmission}
                      disabled={isGenerating || !studentResponse}
                      className="w-full h-8.5 text-xs font-bold uppercase tracking-wider text-white bg-primary hover:bg-primary/95"
                    >
                      {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
                      Analyze Response
                    </Button>
                  </div>
                )}

                <div className={cn(
                  "flex flex-col h-full min-h-[350px] space-y-3",
                  isConfigExpanded ? "lg:col-span-8" : "lg:col-span-12"
                )}>
                  <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-left">
                    <ShieldCheck className="size-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[10px] text-amber-900 leading-normal font-semibold">
                      Grading Protocol: Suggested scores are advisory only. Final grading resides strictly with the lecturer. AI suggestions never update student records directly.
                    </div>
                  </div>

                  {parsedReview && parsedReview.score ? (
                    <div className="space-y-4 flex-1 flex flex-col">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 border border-zinc-150 rounded-xl bg-zinc-50 text-left">
                          <span className="text-[9px] uppercase font-bold text-zinc-400">Suggested Score</span>
                          <div className="text-lg font-bold text-zinc-800 mt-0.5">{parsedReview.score}</div>
                        </div>
                        <div className="p-3 border border-zinc-150 rounded-xl bg-zinc-50 text-left">
                          <span className="text-[9px] uppercase font-bold text-zinc-400">Confidence Level</span>
                          <div className="mt-0.5">
                            <Badge variant="outline" className={cn(
                              "h-5 text-[9px] px-2 font-bold uppercase",
                              parsedReview.confidence === "High" && "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
                              parsedReview.confidence === "Medium" && "bg-amber-500/10 text-amber-700 border-amber-500/20",
                              parsedReview.confidence === "Low" && "bg-red-500/10 text-red-700 border-red-500/20"
                            )}>
                              {parsedReview.confidence || "Unknown"}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {parsedReview.missingConcepts.length > 0 && (
                        <div className="border border-red-100 rounded-xl p-3 bg-red-50/20 text-left">
                          <span className="text-[9px] uppercase font-bold text-red-500">Missing Concepts Identified</span>
                          <ul className="list-disc list-inside text-xs mt-1 space-y-0.5 text-zinc-700 font-semibold">
                            {parsedReview.missingConcepts.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="space-y-1 flex-1 flex flex-col">
                        <Label className="text-xs font-bold text-zinc-700 text-left ml-0.5">Scoring Rationale / Rubric Alignment</Label>
                        <Textarea
                          value={generatedContent}
                          onChange={(e) => setGeneratedContent(e.target.value)}
                          className="flex-1 min-h-[150px] p-3 text-sm font-semibold bg-zinc-50 border rounded-xl resize-none outline-none leading-relaxed text-zinc-700"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col">
                      <Label className="text-xs font-bold text-zinc-700 mb-1 ml-0.5 text-left">Grading recommendation details</Label>
                      <Textarea
                        value={generatedContent}
                        onChange={(e) => setGeneratedContent(e.target.value)}
                        placeholder="Suggested metrics and feedback rationales appear here..."
                        className="flex-1 min-h-[300px] p-4 text-sm font-semibold bg-zinc-50 border rounded-xl resize-none outline-none leading-relaxed text-zinc-700"
                      />
                    </div>
                  )}

                  {generatedContent && (
                    <div className="flex gap-2 justify-end shrink-0">
                      <Button variant="outline" size="sm" onClick={handleCopyDraft} className="h-8 text-[10px] font-bold uppercase border-zinc-200 bg-white">
                        <Copy className="size-3 mr-1" /> Copy Rationale
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: Feedback Assistant */}
          {activeTab === "feedback" && (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b pb-2.5">
                <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wide flex items-center gap-1">
                  <Award className="size-4 text-primary shrink-0" /> Feedback Assistant
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                  className="h-7 text-xs text-primary hover:bg-primary/5 flex items-center gap-1 border border-primary/20 rounded-lg"
                >
                  {isConfigExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  {isConfigExpanded ? "Hide Settings" : "Configure Parameters"}
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
                {isConfigExpanded && (
                  <div className="lg:col-span-4 space-y-4 text-left border border-zinc-150 p-4 rounded-xl bg-zinc-50/50 animate-in slide-in-from-left duration-200">
                    <div className="space-y-1.5">
                      <Label htmlFor="feedback-perf" className="text-xs font-bold text-zinc-700">Student Performance Summary</Label>
                      <Textarea
                        id="feedback-perf"
                        placeholder="e.g. Scored 12/20. Staggered join complexity but understands keys."
                        value={feedbackPerformance}
                        onChange={(e) => setFeedbackPerformance(e.target.value)}
                        className="h-32 text-xs font-normal bg-white"
                      />
                    </div>

                    <Button
                      onClick={handleGenerateFeedback}
                      disabled={isGenerating || !feedbackPerformance}
                      className="w-full h-8.5 text-xs font-bold uppercase tracking-wider text-white bg-primary hover:bg-primary/95"
                    >
                      {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
                      Draft Student Feedback
                    </Button>
                  </div>
                )}

                <div className={cn(
                  "flex flex-col h-full min-h-[350px] space-y-3",
                  isConfigExpanded ? "lg:col-span-8" : "lg:col-span-12"
                )}>
                  <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-left">
                    <ShieldCheck className="size-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[10px] text-amber-900 leading-normal font-semibold">
                      Feedback Protocol: Drafted feedback is editable. Lecturers are encouraged to adapt the tone and content before distributing feedback to students.
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col min-h-0">
                    <Label className="text-xs font-bold text-zinc-700 mb-1 ml-0.5 text-left">Generated Student Feedback</Label>
                    <Textarea
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      placeholder="Encouraging feedback drafts outlining strengths and deficiencies will generate here..."
                      className="flex-1 min-h-[300px] p-4 text-sm font-semibold bg-zinc-50 border rounded-xl resize-none outline-none leading-relaxed text-zinc-700"
                    />
                  </div>

                  {generatedContent && (
                    <div className="flex gap-2 justify-end shrink-0">
                      <Button variant="outline" size="sm" onClick={handleCopyDraft} className="h-8 text-[10px] font-bold uppercase border-zinc-200 bg-white">
                        <Copy className="size-3 mr-1" /> Copy Feedback
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 6: Analytics Assistant */}
          {activeTab === "analytics" && (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b pb-2.5">
                <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wide flex items-center gap-1">
                  <BarChart2 className="size-4 text-primary shrink-0" /> Analytics Summary Assistant
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                  className="h-7 text-xs text-primary hover:bg-primary/5 flex items-center gap-1 border border-primary/20 rounded-lg"
                >
                  {isConfigExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  {isConfigExpanded ? "Hide Settings" : "Configure Parameters"}
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
                {isConfigExpanded && (
                  <div className="lg:col-span-4 space-y-4 text-left border border-zinc-150 p-4 rounded-xl bg-zinc-50/50 animate-in slide-in-from-left duration-200">
                    <Card className="shadow-none border border-zinc-200 rounded-lg bg-white">
                      <CardHeader className="py-2.5 border-b">
                        <CardTitle className="text-xs font-bold text-zinc-700 uppercase">Workspace metrics</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2.5 pt-3 text-xs font-semibold text-zinc-600">
                        {activeWorkspace ? (
                          <>
                            <div className="flex justify-between border-b pb-1">
                              <span>Class Average:</span>
                              <span className="font-bold text-zinc-800">{activeWorkspace.performance_avg}%</span>
                            </div>
                            <div className="space-y-1">
                              <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Concept mastery</div>
                              <div className="flex justify-between text-[11px]">
                                <span>Normalization</span>
                                <Badge variant="secondary" className="h-4 bg-emerald-500/10 text-emerald-700 font-bold border-emerald-500/20 text-[9px]">Strong (82%)</Badge>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                <span>SQL Indexing</span>
                                <Badge variant="secondary" className="h-4 bg-amber-500/10 text-amber-700 font-bold border-amber-500/20 text-[9px]">Weak (38%)</Badge>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="text-zinc-400 py-2 text-center italic text-[11px]">
                            Select active workspace context.
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Button
                      onClick={handleAnalyzeClassPerformance}
                      disabled={isGenerating}
                      className="w-full h-8.5 text-xs font-bold uppercase tracking-wider text-white bg-primary hover:bg-primary/95"
                    >
                      {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <BarChart2 className="size-3.5 mr-1.5" />}
                      Analyze Class
                    </Button>
                  </div>
                )}

                <div className={cn(
                  "flex flex-col h-full min-h-[350px] space-y-3",
                  isConfigExpanded ? "lg:col-span-8" : "lg:col-span-12"
                )}>
                  <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-left">
                    <ShieldCheck className="size-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[10px] text-amber-900 leading-normal font-semibold">
                      Analytics Protocol: Analysis uses aggregated workspace metrics only. No direct student database access is permitted, respecting institutional policies.
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col min-h-0">
                    <Label className="text-xs font-bold text-zinc-700 mb-1 ml-0.5 text-left">Diagnostic Reports Output</Label>
                    <Textarea
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      placeholder="Class mastery analysis summaries and diagnostic reports will output here..."
                      className="flex-1 min-h-[300px] p-4 text-sm font-semibold bg-zinc-50 border rounded-xl resize-none outline-none leading-relaxed text-zinc-700"
                    />
                  </div>

                  {generatedContent && (
                    <div className="flex gap-2 justify-end shrink-0">
                      <Button variant="outline" size="sm" onClick={handleCopyDraft} className="h-8 text-[10px] font-bold uppercase border-zinc-200 bg-white">
                        <Copy className="size-3 mr-1" /> Copy Suggestions
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 7: Teaching Insights */}
          {activeTab === "insights" && (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b pb-2.5">
                <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wide flex items-center gap-1">
                  <Lightbulb className="size-4 text-primary shrink-0" /> Reinforcement Insights
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                  className="h-7 text-xs text-primary hover:bg-primary/5 flex items-center gap-1 border border-primary/20 rounded-lg"
                >
                  {isConfigExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  {isConfigExpanded ? "Hide Settings" : "Configure Parameters"}
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
                {isConfigExpanded && (
                  <div className="lg:col-span-4 space-y-4 text-left border border-zinc-150 p-4 rounded-xl bg-zinc-50/50 animate-in slide-in-from-left duration-200">
                    <Card className="shadow-none border border-zinc-200 rounded-lg bg-white">
                      <CardHeader className="py-2.5 border-b">
                        <CardTitle className="text-xs font-bold text-zinc-700 uppercase">Workspace Parameters</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1 pt-3 text-xs font-semibold text-zinc-500">
                        {activeWorkspace ? (
                          <>
                            <div>Course: {activeWorkspace.title}</div>
                            <div>Class Group: {activeWorkspace.class_name}</div>
                            <div>Average: {activeWorkspace.performance_avg}%</div>
                          </>
                        ) : (
                          <div className="text-zinc-400 text-center py-2 italic text-[11px]">Select active workspace context.</div>
                        )}
                      </CardContent>
                    </Card>

                    <Button
                      onClick={handleGenerateTeachingInsights}
                      disabled={isGenerating}
                      className="w-full h-8.5 text-xs font-bold uppercase tracking-wider text-white bg-primary hover:bg-primary/95"
                    >
                      {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Lightbulb className="size-3.5 mr-1.5" />}
                      Generate Insights
                    </Button>
                  </div>
                )}

                <div className={cn(
                  "flex flex-col h-full min-h-[350px] space-y-3",
                  isConfigExpanded ? "lg:col-span-8" : "lg:col-span-12"
                )}>
                  <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-left">
                    <ShieldCheck className="size-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[10px] text-amber-900 leading-normal font-semibold">
                      Insights Protocol: AI suggestions are recommendations for guidance only. Lecturers remain responsible for all pedagogical choices.
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col min-h-0">
                    <Label className="text-xs font-bold text-zinc-700 mb-1 ml-0.5 text-left">Actionable Teaching Improvements</Label>
                    <Textarea
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      placeholder="Suggested reinforcement topics, practical exercises, revision activities..."
                      className="flex-1 min-h-[300px] p-4 text-sm font-semibold bg-zinc-50 border rounded-xl resize-none outline-none leading-relaxed text-zinc-700"
                    />
                  </div>

                  {generatedContent && (
                    <div className="flex gap-2 justify-end shrink-0">
                      <Button variant="outline" size="sm" onClick={handleCopyDraft} className="h-8 text-[10px] font-bold uppercase border-zinc-200 bg-white">
                        <Copy className="size-3 mr-1" /> Copy Suggestions
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Slide-over Context Settings Sheet */}
      <Sheet open={isContextSheetOpen} onOpenChange={setIsContextSheetOpen}>
        <SheetContent className="w-full sm:max-w-md p-0 overflow-hidden rounded-l-xl bg-white border-l shadow-2xl flex flex-col">
          <SheetHeader className="p-4 border-b bg-zinc-50/50">
            <SheetTitle className="text-sm font-bold text-zinc-800">
              Workspace Context Settings
            </SheetTitle>
            <SheetDescription className="text-[10px] text-zinc-400 font-medium">
              Configure active workspaces, syllabus materials, and recent sessions.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Active Workspace */}
            <div className="space-y-1.5">
              <Label htmlFor="ws-select" className="text-xs font-bold text-zinc-700">Course Workspace</Label>
              <select
                id="ws-select"
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                className="w-full h-8.5 rounded-lg border border-zinc-200 text-xs px-2.5 bg-white text-zinc-700 outline-none"
              >
                {loadingWorkspaces ? (
                  <option>Loading workspaces...</option>
                ) : workspaces.length === 0 ? (
                  <option>No workspaces found</option>
                ) : (
                  workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.code} - {ws.title}
                    </option>
                  ))
                )}
              </select>

              {loadingWorkspaceDetail ? (
                <div className="text-[10px] text-zinc-400 py-2 animate-pulse">Syncing parameters...</div>
              ) : activeWorkspaceDetail ? (
                <div className="p-3 bg-zinc-50 border border-zinc-150 rounded-xl text-[10px] font-semibold space-y-1.5 text-zinc-500">
                  <div className="flex justify-between">
                    <span>Institution:</span>
                    <span className="text-zinc-800 font-bold truncate max-w-[160px]">{activeWorkspaceDetail.institution_name}</span>
                  </div>
                  {activeWorkspaceDetail.department_name && (
                    <div className="flex justify-between">
                      <span>Department:</span>
                      <span className="text-zinc-800 font-bold truncate max-w-[160px]">{activeWorkspaceDetail.department_name}</span>
                    </div>
                  )}
                  {activeWorkspaceDetail.option_name && (
                    <div className="flex justify-between">
                      <span>Program:</span>
                      <span className="text-zinc-800 font-bold truncate max-w-[160px]">{activeWorkspaceDetail.option_name}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Class Group:</span>
                    <span className="text-zinc-800 font-bold">{activeWorkspaceDetail.class_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Academic Year:</span>
                    <span className="text-zinc-800 font-bold">{activeWorkspaceDetail.academic_year}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Students:</span>
                    <span className="text-zinc-800 font-bold">{activeWorkspaceDetail.student_count} Enrolled</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Class Average:</span>
                    <span className="text-primary font-bold">{activeWorkspaceDetail.performance_avg}% Avg</span>
                  </div>
                </div>
              ) : null}
            </div>

            <Separator className="bg-zinc-100" />

            {/* Resource Context */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-zinc-700">Reference Sources</Label>
              <div className="space-y-1.5 p-3 rounded-xl border border-zinc-150 bg-zinc-50/50">
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCourseNotes}
                    onChange={(e) => setUseCourseNotes(e.target.checked)}
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 size-3.5"
                  />
                  <span>Syllabus / Course Notes</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useLecturerMaterials}
                    onChange={(e) => setUseLecturerMaterials(e.target.checked)}
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 size-3.5"
                  />
                  <span>Lecturer Handouts</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useAssessmentRubric}
                    onChange={(e) => setUseAssessmentRubric(e.target.checked)}
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 size-3.5"
                  />
                  <span>Assessment Rubric schema</span>
                </label>
              </div>

              {workspaceMaterials.length > 0 && (
                <div className="pt-1.5">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Uploaded Handouts</span>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 border border-zinc-150 rounded-xl p-2.5 bg-white">
                    {workspaceMaterials.map((mat) => (
                      <label key={mat.id} className="flex items-center gap-2 text-xs font-semibold text-zinc-600 cursor-pointer truncate" title={mat.display_name || mat.original_filename}>
                        <input
                          type="checkbox"
                          checked={selectedMaterials.includes(mat.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMaterials([...selectedMaterials, mat.id]);
                            } else {
                              setSelectedMaterials(selectedMaterials.filter(id => id !== mat.id));
                            }
                          }}
                          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 size-3.5"
                        />
                        <span className="truncate">{mat.display_name || mat.original_filename}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Separator className="bg-zinc-100" />

            {/* Session History */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-zinc-700">Recent Sessions</Label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg"
                  onClick={() => startNewSession("chat")}
                  title="New Session"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {sessions.length === 0 ? (
                  <div className="text-xs text-zinc-400 py-4 text-center italic font-medium">No saved sessions.</div>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer hover:bg-zinc-50 transition-all",
                        currentSessionId === s.id
                          ? "border-primary bg-primary/[0.01] text-zinc-800 font-bold"
                          : "border-zinc-150 text-zinc-600 bg-white"
                      )}
                      onClick={() => loadSession(s)}
                    >
                      <div className="truncate flex-1 text-left min-w-0 pr-2">
                        <div className="truncate text-zinc-800 text-[11px]">{s.title}</div>
                        <div className="text-[8px] text-zinc-400 uppercase font-black tracking-wider">{s.module}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-zinc-400 hover:text-red-500 rounded-md hover:bg-red-50/50 shrink-0"
                        onClick={(e) => deleteSession(s.id, e)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="p-4 border-t bg-zinc-50/50 flex justify-end">
            <Button
              size="sm"
              className="h-8 px-4 font-bold text-[10px] uppercase rounded-lg text-white bg-primary hover:bg-primary/95"
              onClick={() => setIsContextSheetOpen(false)}
            >
              Done
            </Button>
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}
