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
  FileText
} from "lucide-react";
import {
  PureMultimodalInput,
  type Attachment,
} from "@/components/ui/multimodal-ai-chat-input";
import { geminiApi, ChatMessage } from "@/lib/api/gemini";
import { lecturerApi, WorkspaceListItem, WorkspaceDetail, LecturerMaterialResponse } from "@/lib/api/lecturer";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
            toast.info("Switched to Content Assistant: Lesson Notes");
          }
        },
        {
          name: "Create Study Guide",
          description: "Draft a study guide for exam preparation",
          onClick: () => {
            setActiveTab("content");
            setContentType("Study Guide");
            toast.info("Switched to Content Assistant: Study Guide");
          }
        },
        {
          name: "Create Revision Material",
          description: "Draft revision sheets and key-concept cheat sheets",
          onClick: () => {
            setActiveTab("content");
            setContentType("Revision Sheet");
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
            toast.info("Switched to Rubric Review Assistant");
          }
        },
        {
          name: "Generate Feedback",
          description: "Draft constructive performance feedback drafts",
          onClick: () => {
            setActiveTab("feedback");
            toast.info("Switched to Student Feedback Assistant");
          }
        },
        {
          name: "Analyze Class Performance",
          description: "Identify topic mastery trends and average scores",
          onClick: () => {
            setActiveTab("analytics");
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

  return (
    <div className={cn("space-y-6", isFullScreen && "fixed inset-0 z-50 bg-white p-6 overflow-y-auto flex flex-col")}>
      
      {!isFullScreen && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Lecturer AI Assistant</h1>
            <p className="text-zinc-500 mt-1 text-xs font-medium">
              Academic assistant to draft assessments, create teaching resources, analyze performance, and review student progress.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1 min-h-0">
        
        {/* Left Column: Workspace Selector & Session Memory */}
        {!isFullScreen && (
          <div className="lg:col-span-3 space-y-4">
            
            {/* Active Workspace */}
            <Card className="shadow-none border border-zinc-200 bg-white rounded-xl">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-zinc-900">
                  <Folder className="size-4 text-zinc-500" /> Active Workspace
                </CardTitle>
                <CardDescription className="text-xs text-zinc-500">Select target course context.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-2">
                  <Label htmlFor="ws-select" className="text-xs font-medium text-zinc-600">Course / Class</Label>
                  <select
                    id="ws-select"
                    value={selectedWorkspaceId}
                    onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                    className="w-full h-9 rounded-lg border border-zinc-200 text-xs px-2.5 bg-white outline-none text-zinc-700 focus:border-zinc-300"
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
                </div>

                {loadingWorkspaceDetail ? (
                  <div className="text-[11px] text-zinc-400 py-2">Loading workspace parameters...</div>
                ) : activeWorkspaceDetail ? (
                  <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200/80 text-[11px] font-medium space-y-1.5 text-zinc-600">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Institution:</span>
                      <span className="text-zinc-800 truncate max-w-[150px]">{activeWorkspaceDetail.institution_name}</span>
                    </div>
                    {activeWorkspaceDetail.department_name && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Department:</span>
                        <span className="text-zinc-800 truncate max-w-[150px]">{activeWorkspaceDetail.department_name}</span>
                      </div>
                    )}
                    {activeWorkspaceDetail.option_name && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Program:</span>
                        <span className="text-zinc-800 truncate max-w-[150px]">{activeWorkspaceDetail.option_name}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Class:</span>
                      <span className="text-zinc-800">{activeWorkspaceDetail.class_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Academic Year:</span>
                      <span className="text-zinc-800">{activeWorkspaceDetail.academic_year}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Students:</span>
                      <span className="text-zinc-800">{activeWorkspaceDetail.student_count} Enrolled</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Performance:</span>
                      <span className="text-zinc-700">{activeWorkspaceDetail.performance_avg}% Avg</span>
                    </div>
                  </div>
                ) : activeWorkspace ? (
                  <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200/80 text-[11px] font-medium space-y-1.5 text-zinc-600">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Class:</span>
                      <span className="text-zinc-800">{activeWorkspace.class_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Academic Year:</span>
                      <span className="text-zinc-800">{activeWorkspace.academic_year}</span>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* Resource Context */}
            <Card className="shadow-none border border-zinc-200 bg-white rounded-xl">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-zinc-900">
                  <BookOpen className="size-4 text-zinc-500" /> Resource Context
                </CardTitle>
                <CardDescription className="text-xs text-zinc-500">Select files or sources AI uses.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-normal text-zinc-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCourseNotes}
                      onChange={(e) => setUseCourseNotes(e.target.checked)}
                      className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 size-3.5"
                    />
                    <span>Course Notes / Syllabus</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-normal text-zinc-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useLecturerMaterials}
                      onChange={(e) => setUseLecturerMaterials(e.target.checked)}
                      className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 size-3.5"
                    />
                    <span>Lecturer Materials</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-normal text-zinc-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useAssessmentRubric}
                      onChange={(e) => setUseAssessmentRubric(e.target.checked)}
                      className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 size-3.5"
                    />
                    <span>Assessment Rubric</span>
                  </label>
                </div>

                {workspaceMaterials.length > 0 && (
                  <div className="pt-2 border-t border-zinc-100">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 mb-1.5">Workspace Files</div>
                    <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                      {workspaceMaterials.map((mat) => (
                        <label key={mat.id} className="flex items-center gap-2 text-xs font-normal text-zinc-600 cursor-pointer truncate" title={mat.display_name || mat.original_filename}>
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
              </CardContent>
            </Card>

            {/* Session Memory */}
            <Card className="shadow-none border border-zinc-200 bg-white rounded-xl">
              <CardHeader className="py-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-zinc-900">
                    <ClipboardList className="size-4 text-zinc-500" /> Recent Sessions
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-500">Reopen previous AI drafts.</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-zinc-600"
                  onClick={() => startNewSession("chat")}
                  title="New Session"
                >
                  <Plus className="size-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-1.5 pt-0 max-h-52 overflow-y-auto pr-1">
                {sessions.length === 0 ? (
                  <div className="text-xs text-zinc-400 py-3 text-center">No recent sessions.</div>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer hover:bg-zinc-50 transition-colors",
                        currentSessionId === s.id ? "border-zinc-300 bg-zinc-50/80 text-zinc-900 font-medium" : "border-zinc-100 text-zinc-600"
                      )}
                      onClick={() => loadSession(s)}
                    >
                      <div className="truncate flex-1 text-left">
                        <div className="truncate text-zinc-800">{s.title}</div>
                        <div className="text-[9px] text-zinc-400 font-normal uppercase tracking-wider">{s.module}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-zinc-400 hover:text-red-600 shrink-0"
                        onClick={(e) => deleteSession(s.id, e)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Right Column: AI Assistant Modules Dashboard */}
        <div className={cn(
          isFullScreen ? "lg:col-span-12 fixed inset-0 z-50 bg-white p-6 flex flex-col" : "lg:col-span-9 space-y-4"
        )}>
          
          <Card className="shadow-none border border-zinc-200 bg-zinc-50/20 flex flex-col min-h-[620px] rounded-xl overflow-hidden flex-1">
            
            {/* Tabs Navigation Header */}
            <div className="flex border-b border-zinc-200 bg-white shrink-0 z-20 overflow-x-auto items-center pr-3">
              <div className="flex flex-1">
                {[
                  { id: "chat", label: "Assistant Chat", icon: Brain },
                  { id: "assessment", label: "Assessment Assistant", icon: Layers },
                  { id: "content", label: "Content Assistant", icon: BookOpen },
                  { id: "review", label: "Review Assistant", icon: BookOpenCheck },
                  { id: "feedback", label: "Feedback Assistant", icon: Award },
                  { id: "analytics", label: "Analytics Assistant", icon: BarChart2 },
                  { id: "insights", label: "Teaching Insights", icon: Lightbulb },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as any);
                        setGeneratedContent("");
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-4 py-3.5 text-xs border-b-2 transition-all whitespace-nowrap font-medium",
                        activeTab === tab.id
                          ? "border-zinc-800 text-zinc-900 bg-zinc-50/50"
                          : "border-transparent text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50/30"
                      )}
                    >
                      <Icon className="size-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Fullscreen Toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-zinc-600 shrink-0 ml-2"
                onClick={() => setIsFullScreen(!isFullScreen)}
                title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
              >
                {isFullScreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </Button>
            </div>

            {/* Active Workspace Banner inside Zen Mode */}
            {isFullScreen && activeWorkspace && (
              <div className="px-6 py-2 border-b border-zinc-100 bg-zinc-50 flex items-center justify-between text-xs text-zinc-500">
                <div className="flex gap-4">
                  <span><strong>Workspace:</strong> {activeWorkspace.code} - {activeWorkspace.title}</span>
                  <span><strong>Class:</strong> {activeWorkspace.class_name}</span>
                  <span><strong>Institution:</strong> {activeWorkspace.institution_name}</span>
                </div>
                <span>Academic Year: {activeWorkspace.academic_year}</span>
              </div>
            )}

            {/* Tab Contents */}
            <div className="flex-1 p-5 md:p-6 bg-white flex flex-col min-h-0">
              
              {/* Tab 1: Chat Assistant */}
              {activeTab === "chat" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-4">
                  {/* Chat Pane Header */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-zinc-100 shrink-0">
                    <div className="flex items-center gap-2 text-xs text-zinc-600 font-medium font-normal">
                      <Brain className="size-4 text-zinc-500" />
                      <span>Academic Assistant Chat</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-xs text-zinc-500 hover:text-zinc-800 flex items-center gap-1.5 border border-zinc-200/60 rounded-lg hover:bg-zinc-50"
                      onClick={() => setIsFullScreen(!isFullScreen)}
                      title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
                    >
                      {isFullScreen ? (
                        <>
                          <Minimize2 className="size-3.5" />
                          <span>Exit Full Screen</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="size-3.5" />
                          <span>Full Screen</span>
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-[300px]">
                    
                    {history.length === 0 && !isGenerating ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 max-w-4xl mx-auto space-y-6">
                        <div className="size-12 rounded-full bg-zinc-50 border border-zinc-200 flex items-center justify-center">
                          <Brain className="size-6 text-zinc-500" />
                        </div>
                        <div className="space-y-1.5">
                          <h2 className="text-base font-semibold text-zinc-900">Academic Assistant Dashboard</h2>
                          <p className="text-xs text-zinc-500 max-w-lg mx-auto">
                            Generate rubrics, outline lessons, organize question sets, or evaluate responses. Choose a workspace or quick task to begin.
                          </p>
                        </div>

                        {/* Quick Action Dashboard Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full text-left pt-2">
                          {quickActionGroups.map((group, gIdx) => (
                            <div key={gIdx} className="border border-zinc-200 rounded-lg p-3.5 bg-zinc-50/50 space-y-2">
                              <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wide border-b border-zinc-200 pb-1.5">{group.title}</h3>
                              <div className="space-y-1.5">
                                {group.actions.map((act, aIdx) => (
                                  <button
                                    key={aIdx}
                                    onClick={act.onClick}
                                    className="w-full text-left hover:bg-zinc-100/80 p-1.5 rounded text-xs transition-colors flex flex-col"
                                  >
                                    <span className="font-medium text-zinc-800 flex items-center gap-1">
                                      <span className="size-1 rounded-full bg-zinc-400"></span>
                                      {act.name}
                                    </span>
                                    <span className="text-[10px] text-zinc-400 ml-2">{act.description}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 max-w-3xl mx-auto py-2">
                        {history.map((msg, index) => (
                          <div
                            key={index}
                            className={cn(
                              "flex flex-col max-w-[85%] space-y-1 p-3.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap font-normal",
                              msg.role === "user"
                                ? "bg-zinc-800 text-white ml-auto rounded-tr-none"
                                : "bg-zinc-50 border border-zinc-200/80 text-zinc-800 mr-auto rounded-tl-none text-left shadow-sm"
                            )}
                          >
                            <div className="font-bold text-[9px] uppercase tracking-wider opacity-60">
                              {msg.role === "user" ? "You" : "AI Assistant"}
                            </div>
                            <div>{msg.content}</div>
                          </div>
                        ))}

                        {isGenerating && (
                          <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 animate-pulse max-w-[85%] mr-auto p-3 bg-zinc-50 border border-zinc-200 rounded-xl rounded-tl-none">
                            <Sparkles className="size-4 animate-spin text-zinc-500" />
                            Formulating draft recommendation...
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>

                  {/* Input Chat Field */}
                  <div className="p-4 border border-zinc-200 bg-white rounded-xl">
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
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1 min-h-0">
                  <div className="lg:col-span-5 space-y-4 text-left">
                    <div className="space-y-1.5">
                      <Label htmlFor="asmt-topic" className="text-xs font-medium text-zinc-700">Topic / Core Theme</Label>
                      <Input
                        id="asmt-topic"
                        placeholder="e.g. Database Normalization (1NF, 2NF, 3NF)"
                        value={asmtTopic}
                        onChange={(e) => setAsmtTopic(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="asmt-style" className="text-xs font-medium text-zinc-700">Question Style</Label>
                        <select
                          id="asmt-style"
                          value={asmtType}
                          onChange={(e) => setAsmtType(e.target.value)}
                          className="w-full h-9 rounded-lg border border-zinc-200 text-xs px-2 bg-white outline-none text-zinc-700"
                        >
                          <option value="MCQ">Multiple Choice (MCQ)</option>
                          <option value="True/False">True / False</option>
                          <option value="Matching">Matching</option>
                          <option value="Short Answer">Short Answer</option>
                          <option value="Essay">Essay Question</option>
                          <option value="Case Study">Case Study Scenario</option>
                          <option value="Practical">Practical Challenge</option>
                          <option value="Complete Assessment Draft">Complete Assessment Draft</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="asmt-bloom" className="text-xs font-medium text-zinc-700">Bloom&apos;s Level</Label>
                        <select
                          id="asmt-bloom"
                          value={asmtBloomLevel}
                          onChange={(e) => setAsmtBloomLevel(e.target.value)}
                          className="w-full h-9 rounded-lg border border-zinc-200 text-xs px-2 bg-white outline-none text-zinc-700"
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

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="asmt-diff" className="text-xs font-medium text-zinc-700">Difficulty</Label>
                        <select
                          id="asmt-diff"
                          value={asmtDifficulty}
                          onChange={(e) => setAsmtDifficulty(e.target.value)}
                          className="w-full h-9 rounded-lg border border-zinc-200 text-xs px-2 bg-white outline-none text-zinc-700"
                        >
                          <option value="Easy">Easy</option>
                          <option value="Medium">Medium</option>
                          <option value="Hard">Hard</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="asmt-count" className="text-xs font-medium text-zinc-700">Question Count</Label>
                        <select
                          id="asmt-count"
                          value={asmtQuestionCount}
                          onChange={(e) => setAsmtQuestionCount(e.target.value)}
                          className="w-full h-9 rounded-lg border border-zinc-200 text-xs px-2 bg-white outline-none text-zinc-700"
                        >
                          <option value="3">3 Questions</option>
                          <option value="5">5 Questions</option>
                          <option value="10">10 Questions</option>
                          <option value="15">15 Questions</option>
                          <option value="20">20 Questions</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-4 items-center justify-between py-1 border-y border-zinc-100">
                      <div className="space-y-1.5">
                        <Label htmlFor="asmt-marks" className="text-xs font-medium text-zinc-700">Suggested Marks</Label>
                        <Input
                          id="asmt-marks"
                          type="number"
                          value={asmtMarks}
                          onChange={(e) => setAsmtMarks(e.target.value)}
                          className="h-9 w-24 text-xs"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer mt-4">
                        <input
                          type="checkbox"
                          checked={asmtIncludeRubrics}
                          onChange={(e) => setAsmtIncludeRubrics(e.target.checked)}
                          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 size-3.5"
                        />
                        <span>Include Rubric Guidelines</span>
                      </label>
                    </div>

                    <Button
                      onClick={handleGenerateAssessment}
                      disabled={isGenerating || !asmtTopic}
                      className="w-full h-9 text-xs font-medium"
                    >
                      {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
                      Generate Assessment Draft
                    </Button>
                  </div>

                  <div className="lg:col-span-7 flex flex-col h-full min-h-[350px]">
                    <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg flex items-start gap-2.5 mb-3 text-left">
                      <ShieldCheck className="size-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-amber-900 leading-normal">
                        <strong>Draft Protocol:</strong> Generated questions are drafts for review. AI cannot publish or write questions directly to official question banks.
                      </div>
                    </div>

                    {/* Sources Used Indicators */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500 mb-2 font-medium">
                      <span>Sources Used:</span>
                      {useCourseNotes && <span className="bg-zinc-100 border border-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded">✓ Course Notes</span>}
                      {useLecturerMaterials && <span className="bg-zinc-100 border border-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded">✓ Lecturer Materials</span>}
                      {useAssessmentRubric && <span className="bg-zinc-100 border border-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded">✓ Rubric Context</span>}
                      {selectedMaterials.map(id => {
                        const m = workspaceMaterials.find(x => x.id === id);
                        return m ? <span key={id} className="bg-zinc-100 border border-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded truncate max-w-[120px]">✓ {m.display_name || m.original_filename}</span> : null;
                      })}
                    </div>

                    <Label className="text-xs font-medium text-zinc-700 mb-1.5 text-left">Editable Draft output</Label>
                    <Textarea
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      placeholder="Assessment details will generate here..."
                      className="flex-1 min-h-[300px] p-4 text-xs font-medium bg-zinc-50 border rounded-lg resize-none outline-none leading-relaxed text-zinc-700"
                    />
                    {generatedContent && (
                      <div className="flex gap-2 mt-3 justify-end">
                        <Button variant="outline" size="sm" onClick={handleCopyDraft} className="text-xs font-semibold">
                          <Copy className="size-3 mr-1" /> Copy Draft
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Content Assistant */}
              {activeTab === "content" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1 min-h-0">
                  <div className="lg:col-span-5 space-y-4 text-left">
                    <div className="space-y-1.5">
                      <Label htmlFor="content-topic" className="text-xs font-medium text-zinc-700">Topic Outline</Label>
                      <Input
                        id="content-topic"
                        placeholder="e.g. Introduction to Subnetting"
                        value={contentTopic}
                        onChange={(e) => setContentTopic(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="content-type" className="text-xs font-medium text-zinc-700">Material Type</Label>
                      <select
                        id="content-type"
                        value={contentType}
                        onChange={(e) => setContentType(e.target.value)}
                        className="w-full h-9 rounded-lg border border-zinc-200 text-xs px-2 bg-white outline-none text-zinc-700"
                      >
                        <option value="Lesson Summary">Lesson Summary</option>
                        <option value="Lecture Notes">Lecture Notes</option>
                        <option value="Study Guide">Study Guide</option>
                        <option value="Revision Sheet">Revision Sheet</option>
                        <option value="Course Outline">Course Outline</option>
                        <option value="Learning Objectives">Learning Objectives</option>
                        <option value="Topic Explanation">Topic Explanation</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="content-outcomes" className="text-xs font-medium text-zinc-700">Learning Outcomes / Focus</Label>
                      <Textarea
                        id="content-outcomes"
                        placeholder="e.g. Calculating network IDs, hosts range, and applying subnet masks..."
                        value={contentOutcomes}
                        onChange={(e) => setContentOutcomes(e.target.value)}
                        className="h-24 text-xs font-normal"
                      />
                    </div>

                    <Button
                      onClick={handleGenerateContent}
                      disabled={isGenerating || !contentTopic}
                      className="w-full h-9 text-xs font-medium"
                    >
                      {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
                      Generate Material Draft
                    </Button>
                  </div>

                  <div className="lg:col-span-7 flex flex-col h-full min-h-[350px]">
                    <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg flex items-start gap-2.5 mb-3 text-left">
                      <ShieldCheck className="size-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-amber-900 leading-normal">
                        <strong>Draft Protocol:</strong> Generated learning resources must be reviewed and manually approved by the lecturer before being published to student workspaces.
                      </div>
                    </div>

                    {/* Sources Used Indicators */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500 mb-2 font-medium">
                      <span>Sources Used:</span>
                      {useCourseNotes && <span className="bg-zinc-100 border border-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded">✓ Course Notes</span>}
                      {useLecturerMaterials && <span className="bg-zinc-100 border border-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded">✓ Lecturer Materials</span>}
                      {useAssessmentRubric && <span className="bg-zinc-100 border border-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded">✓ Rubric Context</span>}
                      {selectedMaterials.map(id => {
                        const m = workspaceMaterials.find(x => x.id === id);
                        return m ? <span key={id} className="bg-zinc-100 border border-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded truncate max-w-[120px]">✓ {m.display_name || m.original_filename}</span> : null;
                      })}
                    </div>

                    <Label className="text-xs font-medium text-zinc-700 mb-1.5 text-left">Editable educational content</Label>
                    <Textarea
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      placeholder="Educational materials will generate here..."
                      className="flex-1 min-h-[300px] p-4 text-xs font-medium bg-zinc-50 border rounded-lg resize-none outline-none leading-relaxed text-zinc-700"
                    />
                    {generatedContent && (
                      <div className="flex gap-2 mt-3 justify-end">
                        <Button variant="outline" size="sm" onClick={handleCopyDraft} className="text-xs font-semibold">
                          <Copy className="size-3 mr-1" /> Copy Draft
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 4: Review Assistant */}
              {activeTab === "review" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1 min-h-0">
                  <div className="lg:col-span-5 space-y-4 text-left">
                    <div className="space-y-1.5">
                      <Label htmlFor="review-rubric" className="text-xs font-medium text-zinc-700">Grading Rubric / Model Answer</Label>
                      <Textarea
                        id="review-rubric"
                        placeholder="Paste target grading schema or reference answers..."
                        value={gradingRubric}
                        onChange={(e) => setGradingRubric(e.target.value)}
                        className="h-24 text-xs font-normal"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="review-student" className="text-xs font-medium text-zinc-700">Student Response</Label>
                      <Textarea
                        id="review-student"
                        placeholder="Paste the student's open-ended response here..."
                        value={studentResponse}
                        onChange={(e) => setStudentResponse(e.target.value)}
                        className="h-32 text-xs font-normal"
                      />
                    </div>

                    <Button
                      onClick={handleReviewSubmission}
                      disabled={isGenerating || !studentResponse}
                      className="w-full h-9 text-xs font-medium"
                    >
                      {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
                      Analyze Response
                    </Button>
                  </div>

                  <div className="lg:col-span-7 flex flex-col h-full min-h-[350px]">
                    <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg flex items-start gap-2.5 mb-3 text-left">
                      <ShieldCheck className="size-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-amber-900 leading-normal">
                        <strong>Grading Protocol:</strong> Suggested scores are advisory only. Final grading resides strictly with the lecturer. AI suggestions never update student records directly.
                      </div>
                    </div>

                    {parsedReview && parsedReview.score ? (
                      <div className="space-y-4 flex-1 flex flex-col">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 border rounded-lg bg-zinc-50 text-left">
                            <span className="text-[10px] uppercase font-bold text-zinc-400">Suggested Score</span>
                            <div className="text-xl font-bold text-zinc-800 mt-1">{parsedReview.score}</div>
                          </div>
                          <div className="p-3 border rounded-lg bg-zinc-50 text-left">
                            <span className="text-[10px] uppercase font-bold text-zinc-400">Confidence Level</span>
                            <div className="mt-1">
                              <Badge variant="outline" className={cn(
                                "h-5 text-[10px] px-2 font-semibold",
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
                          <div className="border rounded-lg p-3 bg-red-50/20 border-red-100 text-left">
                            <span className="text-[10px] uppercase font-bold text-red-500">Missing Concepts Identified</span>
                            <ul className="list-disc list-inside text-xs mt-1.5 space-y-1 text-zinc-700 font-medium">
                              {parsedReview.missingConcepts.map((item, idx) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="space-y-1 flex-1 flex flex-col">
                          <Label className="text-xs font-semibold text-zinc-700 text-left">Scoring Rationale / Rubric Alignment</Label>
                          <Textarea
                            value={generatedContent}
                            onChange={(e) => setGeneratedContent(e.target.value)}
                            className="flex-1 min-h-[150px] p-3 text-xs font-medium bg-zinc-50 border rounded-lg resize-none outline-none leading-relaxed text-zinc-700"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col">
                        <Label className="text-xs font-medium text-zinc-700 mb-1.5 text-left">Grading recommendations rationale</Label>
                        <Textarea
                          value={generatedContent}
                          onChange={(e) => setGeneratedContent(e.target.value)}
                          placeholder="Suggested metrics and feedback rationales appear here..."
                          className="flex-1 min-h-[300px] p-4 text-xs font-medium bg-zinc-50 border rounded-lg resize-none outline-none leading-relaxed text-zinc-700"
                        />
                      </div>
                    )}

                    {generatedContent && (
                      <div className="flex gap-2 mt-3 justify-end">
                        <Button variant="outline" size="sm" onClick={handleCopyDraft} className="text-xs font-semibold">
                          <Copy className="size-3 mr-1" /> Copy Rationale
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 5: Feedback Assistant */}
              {activeTab === "feedback" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1 min-h-0">
                  <div className="lg:col-span-5 space-y-4 text-left">
                    <div className="space-y-1.5">
                      <Label htmlFor="feedback-perf" className="text-xs font-medium text-zinc-700">Student Performance Summary</Label>
                      <Textarea
                        id="feedback-perf"
                        placeholder="e.g. Scored 12/20. Showed understanding of indexing rules, but struggled with join complexity and nested subqueries."
                        value={feedbackPerformance}
                        onChange={(e) => setFeedbackPerformance(e.target.value)}
                        className="h-36 text-xs font-normal"
                      />
                    </div>

                    <Button
                      onClick={handleGenerateFeedback}
                      disabled={isGenerating || !feedbackPerformance}
                      className="w-full h-9 text-xs font-medium"
                    >
                      {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
                      Draft Student Feedback
                    </Button>
                  </div>

                  <div className="lg:col-span-7 flex flex-col h-full min-h-[350px]">
                    <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg flex items-start gap-2.5 mb-3 text-left">
                      <ShieldCheck className="size-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-amber-900 leading-normal">
                        <strong>Feedback Protocol:</strong> Drafted feedback is editable. Lecturers are encouraged to adapt the tone and content before distributing feedback to students.
                      </div>
                    </div>

                    {/* Sources Used Indicators */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500 mb-2 font-medium">
                      <span>Sources Used:</span>
                      {useCourseNotes && <span className="bg-zinc-100 border border-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded">✓ Course Notes</span>}
                      {useLecturerMaterials && <span className="bg-zinc-100 border border-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded">✓ Lecturer Materials</span>}
                      {useAssessmentRubric && <span className="bg-zinc-100 border border-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded">✓ Rubric Context</span>}
                      {selectedMaterials.map(id => {
                        const m = workspaceMaterials.find(x => x.id === id);
                        return m ? <span key={id} className="bg-zinc-100 border border-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded truncate max-w-[120px]">✓ {m.display_name || m.original_filename}</span> : null;
                      })}
                    </div>

                    <Label className="text-xs font-medium text-zinc-700 mb-1.5 text-left">Editable Feedback Draft</Label>
                    <Textarea
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      placeholder="Encouraging feedback drafts outlining strengths and deficiencies will generate here..."
                      className="flex-1 min-h-[300px] p-4 text-xs font-medium bg-zinc-50 border rounded-lg resize-none outline-none leading-relaxed text-zinc-700"
                    />
                    {generatedContent && (
                      <div className="flex gap-2 mt-3 justify-end">
                        <Button variant="outline" size="sm" onClick={handleCopyDraft} className="text-xs font-semibold">
                          <Copy className="size-3 mr-1" /> Copy Feedback
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 6: Analytics Assistant */}
              {activeTab === "analytics" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1 min-h-0">
                  <div className="lg:col-span-5 space-y-4 text-left">
                    <Card className="shadow-none border border-zinc-200 rounded-lg bg-zinc-50/50">
                      <CardHeader className="py-3">
                        <CardTitle className="text-xs font-semibold text-zinc-800">Workspace Context Metrics</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0 text-xs font-medium text-zinc-600">
                        {activeWorkspace ? (
                          <>
                            <div className="flex justify-between border-b pb-1.5">
                              <span>Class Average Score:</span>
                              <span className="font-semibold text-zinc-800">{activeWorkspace.performance_avg}%</span>
                            </div>
                            <div className="space-y-1.5">
                              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Concept Mastery trends</div>
                              <div className="flex justify-between text-[11px]">
                                <span>Database Normalization</span>
                                <Badge variant="secondary" className="h-4 bg-emerald-500/10 text-emerald-700 font-normal border-emerald-500/20">Strong (82%)</Badge>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                <span>SQL Indexing</span>
                                <Badge variant="secondary" className="h-4 bg-amber-500/10 text-amber-700 font-normal border-amber-500/20">Weak (38%)</Badge>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="text-zinc-400 py-3 text-center">
                            Select a workspace to bind class parameters.
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Button
                      onClick={handleAnalyzeClassPerformance}
                      disabled={isGenerating}
                      className="w-full h-9 text-xs font-medium"
                    >
                      {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <BarChart2 className="size-3.5 mr-1.5" />}
                      Analyze Class Performance
                    </Button>
                  </div>

                  <div className="lg:col-span-7 flex flex-col h-full min-h-[350px]">
                    <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg flex items-start gap-2.5 mb-3 text-left">
                      <ShieldCheck className="size-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-amber-900 leading-normal">
                        <strong>Analytics Protocol:</strong> Analysis uses aggregated workspace metrics only. No direct student database access is permitted, respecting institutional policies.
                      </div>
                    </div>

                    <Label className="text-xs font-medium text-zinc-700 mb-1.5 text-left">Class Mastery & Difficult Topics Analysis</Label>
                    <Textarea
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      placeholder="Class mastery analysis summaries and diagnostic reports will output here..."
                      className="flex-1 min-h-[300px] p-4 text-xs font-medium bg-zinc-50 border rounded-lg resize-none outline-none leading-relaxed text-zinc-700"
                    />
                    {generatedContent && (
                      <div className="flex gap-2 mt-3 justify-end">
                        <Button variant="outline" size="sm" onClick={handleCopyDraft} className="text-xs font-semibold">
                          <Copy className="size-3 mr-1" /> Copy Suggestions
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 7: Teaching Insights */}
              {activeTab === "insights" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1 min-h-0">
                  <div className="lg:col-span-5 space-y-4 text-left">
                    <Card className="shadow-none border border-zinc-200 rounded-lg bg-zinc-50/50">
                      <CardHeader className="py-3">
                        <CardTitle className="text-xs font-semibold text-zinc-800">Pedagogical Context</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 pt-0 text-xs font-medium text-zinc-600">
                        {activeWorkspace ? (
                          <div className="space-y-1 text-zinc-500">
                            <div><strong>Course:</strong> {activeWorkspace.title}</div>
                            <div><strong>Class Group:</strong> {activeWorkspace.class_name}</div>
                            <div><strong>Average:</strong> {activeWorkspace.performance_avg}%</div>
                          </div>
                        ) : (
                          <div className="text-zinc-400 text-center py-2">Select active workspace context.</div>
                        )}
                      </CardContent>
                    </Card>

                    <Button
                      onClick={handleGenerateTeachingInsights}
                      disabled={isGenerating}
                      className="w-full h-9 text-xs font-medium"
                    >
                      {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Lightbulb className="size-3.5 mr-1.5" />}
                      Generate Teaching Insights
                    </Button>
                  </div>

                  <div className="lg:col-span-7 flex flex-col h-full min-h-[350px]">
                    <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg flex items-start gap-2.5 mb-3 text-left">
                      <ShieldCheck className="size-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-amber-900 leading-normal">
                        <strong>Insights Protocol:</strong> AI suggestions are recommendations for guidance only. Lecturers remain responsible for all pedagogical and classroom choices.
                      </div>
                    </div>

                    <Label className="text-xs font-medium text-zinc-700 mb-1.5 text-left">Actionable Teaching Improvements</Label>
                    <Textarea
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      placeholder="Suggested reinforcement topics, practical exercises, revision activities, and alternative methods..."
                      className="flex-1 min-h-[300px] p-4 text-xs font-medium bg-zinc-50 border rounded-lg resize-none outline-none leading-relaxed text-zinc-700"
                    />
                    {generatedContent && (
                      <div className="flex gap-2 mt-3 justify-end">
                        <Button variant="outline" size="sm" onClick={handleCopyDraft} className="text-xs font-semibold">
                          <Copy className="size-3 mr-1" /> Copy Suggestions
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
