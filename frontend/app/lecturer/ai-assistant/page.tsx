// app/lecturer/ai-assistant/page.tsx
"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sparkles,
  ShieldCheck,
  BookOpen,
  BarChart2,
  RefreshCw,
  Plus,
  Trash2,
  Folder,
  Layers,
  Award,
  BookOpenCheck,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Edit2,
  RotateCcw,
  Lightbulb,
  AlertTriangle,
  FileText,
  ChevronDown,
  ChevronUp,
  Pin,
  Share2,
  Download,
  Printer,
  FileCode,
  Menu,
} from "lucide-react";
import { AIChatInput, type Attachment } from "@/components/ui/ai-chat-input";
import { ChatMessage } from "@/lib/api/gemini";
import {
  lecturerApi,
  WorkspaceListItem,
  WorkspaceDetail,
  LecturerMaterialResponse,
} from "@/lib/api/lecturer";
import { Loader2 } from "lucide-react";
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

// UI Chat Primitives & Rich Components
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";
import { Marker, MarkerIcon, MarkerContent } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";

interface AISession {
  id: string;
  title: string;
  module: "chat" | "assessment" | "content" | "review" | "feedback" | "analytics" | "insights";
  workspaceId: string | null;
  history: ChatMessage[];
  generatedContent: string;
  created_at: string;
}

function LecturerAIAssistantContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);

  // Tab State with LocalStorage and URL synchronization
  const [activeTab, setActiveTabState] = useState<"chat" | "assessment" | "content" | "review" | "feedback" | "analytics" | "insights">(() => {
    if (typeof window !== "undefined") {
      const urlModule = searchParams.get("module");
      if (urlModule && ["chat", "assessment", "content", "review", "feedback", "analytics", "insights"].includes(urlModule)) {
        return urlModule as any;
      }
      const saved = localStorage.getItem("mindexa_lecturer_ai_module");
      if (saved && ["chat", "assessment", "content", "review", "feedback", "analytics", "insights"].includes(saved)) {
        return saved as any;
      }
    }
    return "chat";
  });

  const setActiveTab = (tab: "chat" | "assessment" | "content" | "review" | "feedback" | "analytics" | "insights") => {
    setActiveTabState(tab);
    if (typeof window !== "undefined") {
      localStorage.setItem("mindexa_lecturer_ai_module", tab);
      const params = new URLSearchParams(window.location.search);
      params.set("module", tab);
      router.replace(`?${params.toString()}`);
    }
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isContextSheetOpen, setIsContextSheetOpen] = useState(false);
  const [isConfigExpanded, setIsConfigExpanded] = useState(true);

  // Native Fullscreen Sync
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {
          setIsFullScreen((prev) => !prev);
        });
      } else {
        setIsFullScreen((prev) => !prev);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {
          setIsFullScreen(false);
        });
      } else {
        setIsFullScreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Workspaces list & active selection with persistence
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceIdState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const urlWs = searchParams.get("workspace");
      if (urlWs) return urlWs;
      const saved = localStorage.getItem("mindexa_lecturer_ai_workspace");
      if (saved) return saved;
    }
    return "";
  });

  const setSelectedWorkspaceId = (id: string) => {
    setSelectedWorkspaceIdState(id);
    if (typeof window !== "undefined") {
      if (id) {
        localStorage.setItem("mindexa_lecturer_ai_workspace", id);
      } else {
        localStorage.removeItem("mindexa_lecturer_ai_workspace");
      }
      const params = new URLSearchParams(window.location.search);
      if (id) {
        params.set("workspace", id);
      } else {
        params.delete("workspace");
      }
      router.replace(`?${params.toString()}`);
    }
  };

  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [activeWorkspaceDetail, setActiveWorkspaceDetail] = useState<WorkspaceDetail | null>(null);
  const [loadingWorkspaceDetail, setLoadingWorkspaceDetail] = useState(false);

  // Resource / Materials Context Settings with persistence
  const [useCourseNotes, setUseCourseNotes] = useState(true);
  const [useLecturerMaterials, setUseLecturerMaterials] = useState(true);
  const [useAssessmentRubric, setUseAssessmentRubric] = useState(false);
  const [workspaceMaterials, setWorkspaceMaterials] = useState<LecturerMaterialResponse[]>([]);
  const [selectedMaterials, setSelectedMaterialsState] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mindexa_lecturer_ai_materials");
        return saved ? JSON.parse(saved) : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const setSelectedMaterials = (materials: string[]) => {
    setSelectedMaterialsState(materials);
    if (typeof window !== "undefined") {
      localStorage.setItem("mindexa_lecturer_ai_materials", JSON.stringify(materials));
    }
  };

  // Saved Sessions Memory & Pinning
  const [sessions, setSessions] = useState<AISession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [pinnedSessionIds, setPinnedSessionIds] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mindexa_lecturer_pinned_sessions");
        return saved ? new Set(JSON.parse(saved)) : new Set();
      } catch (e) {
        return new Set();
      }
    }
    return new Set();
  });

  const togglePinSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
        toast.info("Session unpinned.");
      } else {
        next.add(sessionId);
        toast.success("Session pinned to top.");
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("mindexa_lecturer_pinned_sessions", JSON.stringify(Array.from(next)));
      }
      return next;
    });
  };

  // Action states
  const [copiedActionId, setCopiedActionId] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Module Forms Inputs
  const [asmtTopic, setAsmtTopic] = useState("");
  const [asmtType, setAsmtType] = useState("MCQ");
  const [asmtDifficulty, setAsmtDifficulty] = useState("Medium");
  const [asmtBloomLevel, setAsmtBloomLevel] = useState("Apply");
  const [asmtQuestionCount, setAsmtQuestionCount] = useState("5");
  const [asmtMarks, setAsmtMarks] = useState("10");
  const [asmtIncludeRubrics, setAsmtIncludeRubrics] = useState(true);

  const [contentTopic, setContentTopic] = useState("");
  const [contentType, setContentType] = useState("Summarize selected material");
  const [contentOutcomes, setContentOutcomes] = useState("");

  const [studentResponse, setStudentResponse] = useState("");
  const [gradingRubric, setGradingRubric] = useState("");

  const [feedbackPerformance, setFeedbackPerformance] = useState("");

  // Load Workspaces & Saved Sessions on Mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoadingWorkspaces(true);
        const wsData = await lecturerApi.getWorkspaces();
        setWorkspaces(wsData || []);
        if (wsData && wsData.length > 0) {
          setSelectedWorkspaceIdState((prev) => {
            const finalId = prev || wsData[0].id;
            if (typeof window !== "undefined") {
              localStorage.setItem("mindexa_lecturer_ai_workspace", finalId);
            }
            return finalId;
          });
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
  }, [workspaces, selectedWorkspaceId]);

  const isRwandaBlocked = useMemo(() => {
    return activeWorkspace?.language === "RW" || activeWorkspaceDetail?.language === "RW";
  }, [activeWorkspace, activeWorkspaceDetail]);

  const activeWorkspaceName = useMemo(() => {
    return activeWorkspaceDetail?.title || activeWorkspace?.title || "No Workspace Selected";
  }, [activeWorkspaceDetail, activeWorkspace]);

  const selectedProcessedMaterials = useMemo(() => {
    return workspaceMaterials.filter((m) => selectedMaterials.includes(m.id));
  }, [workspaceMaterials, selectedMaterials]);

  // Session Management
  const saveCurrentSession = useCallback(
    (newHistory: ChatMessage[], newGeneratedContent: string, customTitle?: string) => {
      if (newHistory.length === 0 && !newGeneratedContent) return;

      const firstUserMsg = newHistory.find((m) => m.role === "user");
      const title =
        customTitle ||
        firstUserMsg?.content.slice(0, 36) ||
        `${activeTab.toUpperCase()} Session (${new Date().toLocaleDateString()})`;

      const sessionObj: AISession = {
        id: currentSessionId || crypto.randomUUID(),
        title,
        module: activeTab,
        workspaceId: selectedWorkspaceId,
        history: newHistory,
        generatedContent: newGeneratedContent,
        created_at: new Date().toISOString(),
      };

      setSessions((prev) => {
        const existingIdx = prev.findIndex((s) => s.id === sessionObj.id);
        let updated: AISession[];
        if (existingIdx >= 0) {
          updated = [...prev];
          updated[existingIdx] = sessionObj;
        } else {
          updated = [sessionObj, ...prev];
        }
        if (typeof window !== "undefined") {
          localStorage.setItem("mindexa_lecturer_ai_sessions", JSON.stringify(updated));
        }
        return updated;
      });

      if (!currentSessionId) {
        setCurrentSessionId(sessionObj.id);
      }
    },
    [activeTab, currentSessionId, selectedWorkspaceId]
  );

  const startNewSession = (tab?: "chat" | "assessment" | "content" | "review" | "feedback" | "analytics" | "insights") => {
    setCurrentSessionId(null);
    setHistory([]);
    setGeneratedContent("");
    if (tab) {
      setActiveTab(tab);
    }
    toast.success("Started a new session.");
  };

  const loadSession = (s: AISession) => {
    setCurrentSessionId(s.id);
    setActiveTab(s.module);
    if (s.workspaceId) setSelectedWorkspaceId(s.workspaceId);
    setHistory(s.history || []);
    setGeneratedContent(s.generatedContent || "");
    toast.info(`Loaded session: ${s.title}`);
  };

  const confirmDeleteSession = () => {
    if (!sessionToDelete) return;
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== sessionToDelete);
      if (typeof window !== "undefined") {
        localStorage.setItem("mindexa_lecturer_ai_sessions", JSON.stringify(updated));
      }
      return updated;
    });
    if (currentSessionId === sessionToDelete) {
      startNewSession();
    }
    setSessionToDelete(null);
    toast.success("Session deleted successfully.");
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedActionId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedActionId(null), 2000);
  };

  const handleEditUserMessage = (text: string) => {
    setPrompt(text);
    toast.info("Prompt loaded into composer.");
  };

  // Full-featured Export Handlers (PDF, Markdown, Plain Text)
  const handleExportMarkdown = () => {
    const title = `lecturer-ai-${activeTab}-${new Date().toISOString().slice(0, 10)}.md`;
    let content = `# Lecturer Academic AI — ${activeTab.toUpperCase()}\n\n`;
    content += `- **Workspace**: ${activeWorkspaceName}\n`;
    content += `- **Date**: ${new Date().toLocaleString()}\n\n`;
    content += `---\n\n`;

    if (activeTab === "chat") {
      if (history.length === 0) {
        content += `*No conversation history in this session.*\n`;
      } else {
        history.forEach((m) => {
          content += `### ${m.role === "user" ? "Lecturer Prompt" : "AI Academic Copilot"}\n\n${m.content}\n\n`;
        });
      }
    } else {
      content += generatedContent || "*No content generated yet.*";
    }

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = title;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Markdown file downloaded.");
  };

  const handleExportPlainText = () => {
    const title = `lecturer-ai-${activeTab}-${new Date().toISOString().slice(0, 10)}.txt`;
    let content = `LECTURER ACADEMIC AI — ${activeTab.toUpperCase()}\n`;
    content += `Workspace: ${activeWorkspaceName}\n`;
    content += `Date: ${new Date().toLocaleString()}\n\n========================================\n\n`;

    if (activeTab === "chat") {
      if (history.length === 0) {
        content += `No conversation history in this session.\n`;
      } else {
        history.forEach((m) => {
          content += `[${m.role === "user" ? "LECTURER PROMPT" : "AI ACADEMIC COPILOT"}]:\n${m.content}\n\n----------------------------------------\n\n`;
        });
      }
    } else {
      content += generatedContent || "No content generated yet.";
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = title;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Plain text file downloaded.");
  };

  const handleExportPDF = () => {
    const title = `Lecturer Academic AI — ${activeTab.toUpperCase()}`;
    let bodyHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #0f172a; line-height: 1.6;">
        <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px;">
          <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 6px 0; color: #0f172a;">${title}</h1>
          <p style="font-size: 12px; color: #64748b; margin: 0;">
            <strong>Course Workspace:</strong> ${activeWorkspaceName} &bull; <strong>Generated:</strong> ${new Date().toLocaleString()}
          </p>
        </div>
    `;

    if (activeTab === "chat") {
      if (history.length === 0) {
        bodyHtml += `<p style="font-size: 13px; color: #94a3b8; font-style: italic;">No conversation messages in this session.</p>`;
      } else {
        history.forEach((m) => {
          const isUser = m.role === "user";
          bodyHtml += `
            <div style="margin-bottom: 18px; padding: 14px 18px; border-radius: 10px; background-color: ${isUser ? "#f8fafc" : "#ffffff"}; border: 1px solid #e2e8f0;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; color: ${isUser ? "#475569" : "#2563eb"};">
                ${isUser ? "Lecturer Prompt" : "AI Academic Copilot"}
              </div>
              <div style="font-size: 13px; white-space: pre-wrap; word-break: break-word;">${m.content}</div>
            </div>
          `;
        });
      }
    } else {
      const content = generatedContent || "No generated content available.";
      bodyHtml += `
        <div style="font-size: 13px; white-space: pre-wrap; word-break: break-word; background: #ffffff; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
          ${content}
        </div>
      `;
    }

    bodyHtml += `
        <div style="margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #94a3b8; text-align: center;">
          Mindexa Academic Assessment Operating System &bull; Confidential Faculty Record
        </div>
      </div>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${title} - ${new Date().toISOString().slice(0, 10)}</title>
            <meta charset="utf-8" />
            <style>
              @media print {
                body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                @page { margin: 1.5cm; }
              }
            </style>
          </head>
          <body>
            ${bodyHtml}
            <script>
              window.onload = function() {
                window.focus();
                window.print();
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
      toast.success("Print & PDF export ready.");
    } else {
      window.print();
    }
  };

  // AI execution engine
  const executeAIRequest = async (
    userPrompt: string,
    systemInstruction: string,
    chatUserDisplay?: string,
    chatAttachments?: Attachment[]
  ) => {
    if (!selectedWorkspaceId) {
      toast.error("Please select a Course Workspace from the Context panel.");
      setIsContextSheetOpen(true);
      return;
    }

    if (isRwandaBlocked) {
      toast.error("AI support is disabled for Kinyarwanda language workspaces.");
      return;
    }

    setIsGenerating(true);

    const userMessage: ChatMessage = {
      role: "user",
      content: chatUserDisplay || userPrompt,
      attachments: chatAttachments,
    };

    const newHistory = [...history, userMessage];
    if (activeTab === "chat") {
      setHistory(newHistory);
    }

    try {
      const response = await lecturerApi.getAISupport({
        workspace_id: selectedWorkspaceId,
        question: userPrompt,
        mode: activeTab,
        selected_material_ids: selectedMaterials.length > 0 ? selectedMaterials : undefined,
        conversation_history: history.map((h) => ({
          role: h.role,
          content: h.content,
        })),
        feature_payload: {
          systemInstruction,
          topic: asmtTopic || contentTopic,
          itemType: asmtType,
          difficulty: asmtDifficulty,
          bloomLevel: asmtBloomLevel,
          count: asmtQuestionCount,
          marks: asmtMarks,
        },
      });

      const aiText = response.answer || "No response received.";
      const aiMessage: ChatMessage = {
        role: "model",
        content: aiText,
      };

      const finalHistory = [...newHistory, aiMessage];
      setHistory(finalHistory);
      setGeneratedContent(aiText);

      saveCurrentSession(finalHistory, aiText);
      toast.success("Response generated.");
    } catch (err: any) {
      console.error("AI Error:", err);
      toast.error(err.message || "Failed to generate AI response. Please check your connection.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleChatSendMessage = async (
    params: string | { input: string; attachments?: Attachment[]; isThinking?: boolean; isDeepSearch?: boolean }
  ) => {
    const rawInput = typeof params === "string" ? params : params?.input || "";
    const attachmentList = typeof params === "string" ? [] : params?.attachments || [];
    const isThinkingMode = typeof params === "object" ? params?.isThinking : false;
    const isDeepSearchMode = typeof params === "object" ? params?.isDeepSearch : false;

    const userQuery = rawInput.trim();
    let promptWithContext = userQuery;

    if (attachmentList.length > 0) {
      const fileDetails = attachmentList
        .map((a) => {
          if (a.extractedText) {
            return `\n--- ATTACHED FILE: ${a.name} ---\n${a.extractedText.slice(0, 15000)}\n--- END FILE ---`;
          }
          return `\n[Attached File: ${a.name}]`;
        })
        .join("\n");

      promptWithContext = userQuery ? `${userQuery}\n${fileDetails}` : fileDetails;
    }

    if (!userQuery && attachmentList.length === 0) return;

    setPrompt("");

    let systemContext =
      "You are an expert Mindexa Lecturer AI Assistant. Read all attached file contents carefully and help the lecturer by answering questions directly, explaining concepts, or helping them draft course materials. If the lecturer asks a direct question or asks about attached files, answer directly and accurately. All recommendations are suggestions for the lecturer's review.";

    if (isThinkingMode) {
      systemContext = `[THINKING & DEEP REASONING MODE ACTIVE]\nPerform step-by-step deep reasoning and detailed academic analysis before providing your final answer.\n${systemContext}`;
      toast.info("Deep Reasoning mode active");
    }

    if (isDeepSearchMode) {
      systemContext = `[DEEP RAG SEARCH ACTIVE]\nSearch all course documents, handouts, and lecture resources comprehensively.\n${systemContext}`;
      toast.info("Deep Document RAG Search active");
    }

    executeAIRequest(promptWithContext, systemContext, userQuery, attachmentList);
  };

  const handleGenerateAssessment = async () => {
    if (!asmtTopic) {
      toast.error("Please enter an assessment topic outline.");
      return;
    }
    const sys = `Draft a comprehensive academic assessment on '${asmtTopic}'. Type: ${asmtType}, Difficulty: ${asmtDifficulty}, Bloom: ${asmtBloomLevel}, Questions: ${asmtQuestionCount}, Suggested Marks: ${asmtMarks}. ${asmtIncludeRubrics ? "Include a rubric grading schema." : ""}`;
    executeAIRequest(sys, "Generate structured assessment draft questions.", asmtTopic);
  };

  const handleGenerateContent = async () => {
    if (!contentTopic) {
      toast.error("Please enter a topic outline.");
      return;
    }
    const sys = `Create academic learning materials for '${contentTopic}'. Material Type: ${contentType}. Outcomes/Focus: ${contentOutcomes || "Comprehensive mastery"}.`;
    executeAIRequest(sys, "Generate structured course materials.", contentTopic);
  };

  const handleReviewSubmission = async () => {
    if (!studentResponse) {
      toast.error("Please enter a student response.");
      return;
    }
    const sys = `Review and grade the following student response against the rubric: [RUBRIC]: ${gradingRubric || "Standard accuracy"}\n[RESPONSE]: ${studentResponse}`;
    executeAIRequest(sys, "Evaluate student response and explain scoring rationale.", "Review student response");
  };

  const handleGenerateFeedback = async () => {
    if (!feedbackPerformance) {
      toast.error("Please enter student performance metrics.");
      return;
    }
    const sys = `Draft constructive, personalized student feedback for the following performance summary: ${feedbackPerformance}`;
    executeAIRequest(sys, "Draft student feedback.", "Draft feedback");
  };

  const essentialQuickActions = [
    {
      title: "Draft MCQ Quiz",
      description: "Generate 5 multiple-choice questions with answer rationales.",
      icon: Layers,
      onClick: () => {
        setActiveTab("assessment");
        setAsmtType("MCQ");
        setAsmtQuestionCount("5");
      },
    },
    {
      title: "Summarize Handout",
      description: "Extract core concepts, key formulas, and discussion prompts.",
      icon: BookOpen,
      onClick: () => {
        setActiveTab("content");
        setContentType("Summarize selected material");
      },
    },
    {
      title: "Review Essay Response",
      description: "Analyze open-ended student submissions against your rubric.",
      icon: BookOpenCheck,
      onClick: () => {
        setActiveTab("review");
      },
    },
    {
      title: "Formulate Feedback",
      description: "Create encouraging, actionable feedback based on scores.",
      icon: Award,
      onClick: () => {
        setActiveTab("feedback");
      },
    },
  ];

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const aPinned = pinnedSessionIds.has(a.id);
      const bPinned = pinnedSessionIds.has(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [sessions, pinnedSessionIds]);

  const moduleTabs = [
    { id: "chat", label: "Assistant Chat", icon: Sparkles },
    { id: "assessment", label: "Assessment Draft", icon: Layers },
    { id: "content", label: "Learning Materials", icon: BookOpen },
    { id: "review", label: "Response Review", icon: BookOpenCheck },
    { id: "feedback", label: "Student Feedback", icon: Award },
    { id: "analytics", label: "Class Analytics", icon: BarChart2 },
    { id: "insights", label: "Reinforcement", icon: Lightbulb },
  ];

  const renderContextPanel = () => {
    return (
      <div className="space-y-4 p-4 text-left font-sans">
        {/* Active Workspace */}
        <div className="space-y-1.5">
          <Label htmlFor="ws-select" className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
            Course Workspace
          </Label>
          <select
            id="ws-select"
            value={selectedWorkspaceId}
            onChange={(e) => setSelectedWorkspaceId(e.target.value)}
            className="w-full h-9 rounded-lg border border-border text-xs px-2.5 bg-background text-foreground outline-none font-medium"
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
            <div className="text-[10px] text-muted-foreground py-1.5 animate-pulse font-medium">Syncing course details...</div>
          ) : activeWorkspaceDetail ? (
            <div className="p-3 bg-muted/30 border border-border/60 rounded-xl text-[10px] font-medium space-y-1.5 text-muted-foreground">
              <div className="flex justify-between">
                <span>Institution:</span>
                <span className="text-foreground font-semibold truncate max-w-[160px]">
                  {activeWorkspaceDetail.institution_name}
                </span>
              </div>
              {activeWorkspaceDetail.department_name && (
                <div className="flex justify-between">
                  <span>Department:</span>
                  <span className="text-foreground font-semibold truncate max-w-[160px]">
                    {activeWorkspaceDetail.department_name}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Class Group:</span>
                <span className="text-foreground font-semibold">{activeWorkspaceDetail.class_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Enrolled Students:</span>
                <span className="text-foreground font-semibold">{activeWorkspaceDetail.student_count}</span>
              </div>
              <div className="flex justify-between">
                <span>Performance Avg:</span>
                <span className="text-primary font-bold">{activeWorkspaceDetail.performance_avg}%</span>
              </div>
            </div>
          ) : null}
        </div>

        <Separator className="bg-border/50" />

        {/* Resource Context */}
        <div className="space-y-2">
          <Label className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Reference Sources</Label>
          <div className="space-y-1.5 p-3 rounded-xl border border-border/60 bg-muted/20">
            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={useCourseNotes}
                onChange={(e) => setUseCourseNotes(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary size-3.5"
              />
              <span>Syllabus / Course Notes</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={useLecturerMaterials}
                onChange={(e) => setUseLecturerMaterials(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary size-3.5"
              />
              <span>Lecturer Handouts</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={useAssessmentRubric}
                onChange={(e) => setUseAssessmentRubric(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary size-3.5"
              />
              <span>Assessment Rubric Schema</span>
            </label>
          </div>

          {workspaceMaterials.length > 0 && (
            <div className="pt-1.5">
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                Uploaded Handouts ({workspaceMaterials.length})
              </span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 border border-border/60 rounded-xl p-2.5 bg-background">
                {workspaceMaterials.map((mat) => (
                  <label
                    key={mat.id}
                    className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer truncate"
                    title={mat.display_name || mat.original_filename}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMaterials.includes(mat.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedMaterials([...selectedMaterials, mat.id]);
                        } else {
                          setSelectedMaterials(selectedMaterials.filter((id) => id !== mat.id));
                        }
                      }}
                      className="rounded border-border text-primary focus:ring-primary size-3.5"
                    />
                    <span className="truncate">{mat.display_name || mat.original_filename}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <Separator className="bg-border/50" />

        {/* Session History */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Recent Sessions</Label>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
              onClick={() => startNewSession("chat")}
              title="New Session"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {sortedSessions.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center italic">No saved sessions.</div>
            ) : (
              sortedSessions.map((s) => {
                const isPinned = pinnedSessionIds.has(s.id);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer hover:bg-muted/50 transition-all group",
                      currentSessionId === s.id
                        ? "border-primary bg-primary/5 text-foreground font-semibold"
                        : "border-border/60 text-muted-foreground bg-card"
                    )}
                    onClick={() => loadSession(s)}
                  >
                    <div className="truncate flex-1 text-left min-w-0 pr-2">
                      <div className="truncate text-foreground text-[11px] font-medium flex items-center gap-1">
                        {isPinned && <Pin className="size-2.5 text-primary fill-primary shrink-0" />}
                        <span className="truncate">{s.title}</span>
                      </div>
                      <div className="text-[8px] text-muted-foreground uppercase font-semibold tracking-wider">{s.module}</div>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-md"
                        onClick={(e) => togglePinSession(s.id, e)}
                        title={isPinned ? "Unpin session" : "Pin session"}
                      >
                        <Pin className={cn("size-3", isPinned && "text-primary fill-primary")} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive rounded-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSessionToDelete(s.id);
                        }}
                        title="Delete session"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "h-[calc(100vh-4rem)] flex flex-col -m-4 md:-m-6 overflow-hidden bg-background",
        isFullScreen && "fixed inset-0 z-[9999] h-screen w-screen p-0 m-0 bg-background"
      )}
    >
      {/* Sleek, Modern Top Header Bar (No breadcrumb, responsive layout) */}
      <header className="h-12 px-3 sm:px-4 border-b border-border/40 bg-background flex items-center justify-between shrink-0 z-20">
        {/* Left Side: Mobile Menu Trigger + Brand Title + Workspace Pill */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
            title="Open navigation modules"
          >
            <Menu className="size-4" />
          </Button>

          <div className="flex items-center gap-2 shrink-0">
            <div className="size-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Sparkles className="size-3.5 text-primary" />
            </div>
            <span className="text-xs sm:text-sm font-semibold tracking-tight text-foreground truncate">
              Academic AI Copilot
            </span>
          </div>

          <Separator orientation="vertical" className="hidden sm:block h-4 bg-border/50" />

          {/* Active Workspace Pill */}
          <button
            type="button"
            onClick={() => setIsContextSheetOpen(true)}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 text-xs font-medium text-foreground transition-colors max-w-[220px]"
            title="Click to view or switch workspace"
          >
            <Folder className="size-3 text-primary shrink-0" />
            <span className="truncate">{activeWorkspaceName}</span>
          </button>
        </div>

        {/* Right Side: Quick Actions & Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShareModalOpen(true)}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
            title="Share session"
          >
            <Share2 className="size-3.5" />
            <span className="hidden sm:inline">Share</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExportModalOpen(true)}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
            title="Export session"
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsContextSheetOpen(true)}
            className="h-8 px-2.5 text-xs font-medium rounded-lg border-border/70 gap-1"
          >
            <Folder className="size-3.5 text-primary" />
            <span className="hidden xs:inline">Context</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
            onClick={toggleFullScreen}
            title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
          >
            {isFullScreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
        </div>
      </header>

      {/* Main Workspace Viewport */}
      <div className="flex-1 flex flex-row overflow-hidden min-h-0">
        {/* Desktop Collapsible Module Sidebar */}
        <aside
          className={cn(
            "hidden md:flex flex-col border-r border-border/40 bg-muted/10 transition-all duration-300 shrink-0 z-20 overflow-hidden",
            isSidebarCollapsed ? "w-[56px]" : "w-[200px]"
          )}
        >
          <div className="p-2 border-b border-border/40 flex items-center justify-between">
            {!isSidebarCollapsed && (
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pl-1.5">
                Modules
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-md ml-auto"
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform duration-300",
                  isSidebarCollapsed ? "-rotate-90" : "rotate-90"
                )}
              />
            </Button>
          </div>

          <div className="flex-1 p-1.5 space-y-0.5 overflow-y-auto">
            {moduleTabs.map((tab) => {
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
                          "w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-lg transition-all text-left",
                          isTabActive
                            ? "bg-primary/10 text-primary font-semibold border border-primary/20"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                          isSidebarCollapsed && "justify-center px-0 gap-0"
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        {!isSidebarCollapsed && <span className="truncate">{tab.label}</span>}
                      </button>
                    </UITooltipTrigger>
                    {isSidebarCollapsed && (
                      <UITooltipContent side="right" className="px-2 py-1 text-xs font-semibold">
                        {tab.label}
                      </UITooltipContent>
                    )}
                  </UITooltip>
                </UITooltipProvider>
              );
            })}
          </div>
        </aside>

        {/* Mobile Module Navigation Drawer Sheet */}
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetContent side="left" className="w-[260px] p-0 flex flex-col">
            <SheetHeader className="p-4 border-b border-border/40 text-left">
              <SheetTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> Assistant Modules
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                Select your academic workflow module.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 p-2 space-y-1 overflow-y-auto">
              {moduleTabs.map((tab) => {
                const Icon = tab.icon;
                const isTabActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as any);
                      setGeneratedContent("");
                      setIsConfigExpanded(true);
                      setIsMobileMenuOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-all text-left",
                      isTabActive
                        ? "bg-primary/10 text-primary font-semibold border border-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>

        {/* Right Main Module Workspace */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
          {/* TAB 1: Chat Assistant */}
          {activeTab === "chat" && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <MessageScrollerProvider scrollPreviousItemPeek={64} scrollMargin={24}>
                <div className="flex-1 relative min-h-0 overflow-hidden">
                  {history.length === 0 && !isGenerating ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 sm:p-6 max-w-xl mx-auto space-y-4">
                      <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-2xs">
                        <Sparkles className="size-5 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-sm sm:text-base font-semibold text-foreground">
                          Lecturer Academic Copilot
                        </h2>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                          Co-create assessment items, evaluate open-ended submissions, synthesize handouts, or draft rubrics.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left pt-1">
                        {essentialQuickActions.map((act, idx) => {
                          const Icon = act.icon;
                          return (
                            <button
                              key={idx}
                              onClick={act.onClick}
                              className="p-3 border border-border/50 rounded-xl bg-card hover:bg-muted/30 hover:border-primary/30 text-left transition-all space-y-1 group cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5 font-medium text-xs text-foreground group-hover:text-primary transition-colors">
                                <Icon className="size-3.5 text-primary shrink-0" />
                                <span>{act.title}</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-snug">
                                {act.description}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <MessageScroller className="h-full">
                      <MessageScrollerViewport className="scroll-fade">
                        <MessageScrollerContent
                          aria-busy={isGenerating}
                          className="max-w-3xl mx-auto py-3 sm:py-4 px-3 sm:px-4 space-y-3 sm:space-y-4"
                        >
                          {history.map((msg, index) => {
                            const isLatestUserTurn =
                              msg.role === "user" &&
                              (index === history.length - 1 || index === history.length - 2);

                            return (
                              <MessageScrollerItem
                                key={index}
                                scrollAnchor={isLatestUserTurn}
                                className="w-full"
                              >
                                {msg.role === "user" ? (
                                  /* User Turn */
                                  <div className="flex flex-col items-end max-w-[88%] sm:max-w-[85%] ml-auto group space-y-1">
                                    <div className="bg-primary text-primary-foreground px-3.5 py-2 rounded-2xl rounded-tr-xs shadow-2xs text-xs font-medium leading-relaxed">
                                      {msg.attachments && msg.attachments.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 pb-1">
                                          {msg.attachments.map((att: any, aIdx: number) => (
                                            <div
                                              key={aIdx}
                                              className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground text-[11px] font-medium"
                                            >
                                              <FileText className="size-3 shrink-0" />
                                              <span className="truncate max-w-[140px]">{att.name}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {msg.content && <div className="whitespace-pre-wrap">{msg.content}</div>}
                                    </div>

                                    {/* User message quick actions outside bubble */}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground pr-1">
                                      <button
                                        type="button"
                                        onClick={() => handleCopyText(msg.content, `user-copy-${index}`)}
                                        className="p-1 hover:text-foreground text-muted-foreground/80 hover:bg-muted/50 rounded transition-colors"
                                        title="Copy prompt"
                                      >
                                        {copiedActionId === `user-copy-${index}` ? (
                                          <Check className="size-3 text-emerald-500" />
                                        ) : (
                                          <Copy className="size-3" />
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleEditUserMessage(msg.content)}
                                        className="p-1 hover:text-foreground text-muted-foreground/80 hover:bg-muted/50 rounded transition-colors"
                                        title="Edit prompt in composer"
                                      >
                                        <Edit2 className="size-3" />
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  /* AI Response Turn */
                                  <div className="group relative flex flex-col max-w-[92%] sm:max-w-[88%] space-y-2 p-3 sm:p-3.5 rounded-2xl bg-card border border-border/70 text-foreground mr-auto rounded-tl-xs text-left shadow-2xs leading-relaxed whitespace-pre-wrap animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <RichMessageRenderer content={msg.content} />

                                    {/* Action Bar */}
                                    <div className="pt-1.5 border-t border-border/30 flex items-center justify-between text-muted-foreground">
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleCopyText(msg.content, `ai-copy-${index}`)}
                                          className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                                        >
                                          {copiedActionId === `ai-copy-${index}` ? (
                                            <>
                                              <Check className="size-3 text-emerald-500" />
                                              <span>Copied</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="size-3" />
                                              <span>Copy</span>
                                            </>
                                          )}
                                        </Button>
                                        {index === history.length - 1 && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleChatSendMessage(history[index - 1]?.content || "")}
                                            className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                                            title="Regenerate explanation"
                                          >
                                            <RotateCcw className="size-3" />
                                            <span>Try Again</span>
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </MessageScrollerItem>
                            );
                          })}

                          {isGenerating && (
                            <div className="max-w-[92%] sm:max-w-[88%] mr-auto py-1">
                              <Marker role="status" className="bg-card border border-border/70 rounded-2xl p-3 shadow-2xs">
                                <MarkerIcon>
                                  <Spinner />
                                </MarkerIcon>
                                <MarkerContent className="shimmer text-xs font-medium">
                                  AI Copilot is formulating curriculum explanation...
                                </MarkerContent>
                              </Marker>
                            </div>
                          )}
                        </MessageScrollerContent>
                      </MessageScrollerViewport>
                      <MessageScrollerButton />
                    </MessageScroller>
                  )}
                </div>
              </MessageScrollerProvider>

              {/* Composer */}
              <div className="p-2 sm:p-3 border-t border-border/40 bg-background shrink-0 max-w-3xl mx-auto w-full">
                {isRwandaBlocked && (
                  <div className="p-2.5 mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
                    <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-semibold">AI Assistant Disabled for Kinyarwanda</strong>
                      <span className="opacity-90">
                        Per institutional policies, automated AI support is disabled for Kinyarwanda workspaces.
                      </span>
                    </div>
                  </div>
                )}
                <AIChatInput
                  value={prompt}
                  onChange={setPrompt}
                  onSend={handleChatSendMessage}
                  isGenerating={isGenerating}
                  onStop={() => setIsGenerating(false)}
                  attachments={attachments}
                  setAttachments={setAttachments}
                  disabled={isRwandaBlocked}
                  placeholder={
                    isRwandaBlocked
                      ? "AI Assistant disabled for Kinyarwanda workspaces"
                      : "Ask about curriculum design, exam questions, grading rubrics..."
                  }
                />
              </div>
            </div>
          )}

          {/* TAB 2: Assessment Generator */}
          {activeTab === "assessment" && (
            <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-4 max-w-5xl mx-auto w-full">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <h3 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Layers className="size-4 text-primary" /> Assessment Draft Generator
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                  className="h-7 text-xs"
                >
                  {isConfigExpanded ? <ChevronUp className="size-3.5 mr-1" /> : <ChevronDown className="size-3.5 mr-1" />}
                  {isConfigExpanded ? "Hide Settings" : "Configure Parameters"}
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {isConfigExpanded && (
                  <Card className="lg:col-span-4 p-3.5 space-y-3 bg-muted/20 border-border/60">
                    <div className="space-y-1.5">
                      <Label htmlFor="asmt-topic" className="text-xs font-semibold">Topic Outline</Label>
                      <Input
                        id="asmt-topic"
                        placeholder="e.g. Relational Normalization (1NF, 2NF, 3NF)"
                        value={asmtTopic}
                        onChange={(e) => setAsmtTopic(e.target.value)}
                        className="h-8.5 text-xs bg-background"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="asmt-style" className="text-xs font-semibold">Style</Label>
                        <select
                          id="asmt-style"
                          value={asmtType}
                          onChange={(e) => setAsmtType(e.target.value)}
                          className="w-full h-8.5 rounded-lg border border-border text-xs px-2 bg-background text-foreground outline-none font-medium"
                        >
                          <option value="MCQ">Multiple Choice</option>
                          <option value="True/False">True / False</option>
                          <option value="Matching">Matching</option>
                          <option value="Short Answer">Short Answer</option>
                          <option value="Essay">Essay Question</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="asmt-bloom" className="text-xs font-semibold">Bloom&apos;s Level</Label>
                        <select
                          id="asmt-bloom"
                          value={asmtBloomLevel}
                          onChange={(e) => setAsmtBloomLevel(e.target.value)}
                          className="w-full h-8.5 rounded-lg border border-border text-xs px-2 bg-background text-foreground outline-none font-medium"
                        >
                          <option value="Remembering">Remembering</option>
                          <option value="Understanding">Understanding</option>
                          <option value="Applying">Applying</option>
                          <option value="Analyzing">Analyzing</option>
                          <option value="Evaluating">Evaluating</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="asmt-diff" className="text-xs font-semibold">Difficulty</Label>
                        <select
                          id="asmt-diff"
                          value={asmtDifficulty}
                          onChange={(e) => setAsmtDifficulty(e.target.value)}
                          className="w-full h-8.5 rounded-lg border border-border text-xs px-2 bg-background text-foreground outline-none font-medium"
                        >
                          <option value="Easy">Easy</option>
                          <option value="Medium">Medium</option>
                          <option value="Hard">Hard</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="asmt-count" className="text-xs font-semibold">Items Count</Label>
                        <select
                          id="asmt-count"
                          value={asmtQuestionCount}
                          onChange={(e) => setAsmtQuestionCount(e.target.value)}
                          className="w-full h-8.5 rounded-lg border border-border text-xs px-2 bg-background text-foreground outline-none font-medium"
                        >
                          <option value="3">3 Items</option>
                          <option value="5">5 Items</option>
                          <option value="10">10 Items</option>
                        </select>
                      </div>
                    </div>

                    <Button
                      onClick={handleGenerateAssessment}
                      disabled={isGenerating || !asmtTopic}
                      className="w-full h-8.5 text-xs font-semibold text-primary-foreground bg-primary"
                    >
                      {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
                      Generate Draft
                    </Button>
                  </Card>
                )}

                <div className={cn("flex flex-col space-y-3", isConfigExpanded ? "lg:col-span-8" : "lg:col-span-12")}>
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2 text-left">
                    <ShieldCheck className="size-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-900 dark:text-amber-200 font-medium leading-relaxed">
                      AI draft items are advisory. Lecturers must review and validate questions before deploying them to question banks.
                    </div>
                  </div>

                  <Card className="p-4 flex-1 min-h-[350px] border-border/60">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs font-semibold">Generated Assessment Draft</Label>
                      {generatedContent && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyText(generatedContent, "copy-asmt-draft")}
                            className="h-6 px-2 text-[10px] gap-1"
                          >
                            {copiedActionId === "copy-asmt-draft" ? (
                              <Check className="size-3 text-emerald-500" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                            <span>Copy</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExportModalOpen(true)}
                            className="h-6 px-2 text-[10px] gap-1"
                          >
                            <Download className="size-3" />
                            <span>Export</span>
                          </Button>
                        </div>
                      )}
                    </div>
                    {isGenerating ? (
                      <div className="py-12 flex flex-col items-center justify-center space-y-2">
                        <Loader2 className="size-6 text-primary animate-spin" />
                        <span className="text-xs text-muted-foreground font-medium">Drafting assessment items...</span>
                      </div>
                    ) : generatedContent ? (
                      <RichMessageRenderer content={generatedContent} />
                    ) : (
                      <div className="text-xs text-muted-foreground py-12 text-center font-medium">
                        Configure parameters on the left and click &ldquo;Generate Draft&rdquo;.
                      </div>
                    )}
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Learning Materials */}
          {activeTab === "content" && (
            <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-4 max-w-5xl mx-auto w-full">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <h3 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <BookOpen className="size-4 text-primary" /> Learning Material Assistant
                </h3>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                <Card className="lg:col-span-4 p-3.5 space-y-3 bg-muted/20 border-border/60">
                  <div className="space-y-1.5">
                    <Label htmlFor="content-topic" className="text-xs font-semibold">Topic Outline</Label>
                    <Input
                      id="content-topic"
                      placeholder="e.g. Subnetting & CIDR Notation"
                      value={contentTopic}
                      onChange={(e) => setContentTopic(e.target.value)}
                      className="h-8.5 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="content-type" className="text-xs font-semibold">Material Type</Label>
                    <select
                      id="content-type"
                      value={contentType}
                      onChange={(e) => setContentType(e.target.value)}
                      className="w-full h-8.5 rounded-lg border border-border text-xs px-2 bg-background text-foreground outline-none font-medium"
                    >
                      <option value="Summarize selected material">Summarize Selected Material</option>
                      <option value="Create study guide">Create Study Guide</option>
                      <option value="Create revision sheet">Create Revision Sheet</option>
                      <option value="Extract learning outcomes">Extract Learning Outcomes</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="content-outcomes" className="text-xs font-semibold">Outcomes / Target Focus</Label>
                    <Textarea
                      id="content-outcomes"
                      placeholder="e.g. Understand prefix lengths, broadcast addresses..."
                      value={contentOutcomes}
                      onChange={(e) => setContentOutcomes(e.target.value)}
                      className="h-20 text-xs bg-background"
                    />
                  </div>

                  <Button
                    onClick={handleGenerateContent}
                    disabled={isGenerating || !contentTopic}
                    className="w-full h-8.5 text-xs font-semibold text-primary-foreground bg-primary"
                  >
                    {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
                    Generate Learning Material
                  </Button>
                </Card>

                <Card className="lg:col-span-8 p-4 flex flex-col min-h-[350px] border-border/60">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-semibold">Generated Material Content</Label>
                    {generatedContent && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyText(generatedContent, "copy-mat-draft")}
                          className="h-6 px-2 text-[10px] gap-1"
                        >
                          {copiedActionId === "copy-mat-draft" ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                          <span>Copy</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExportModalOpen(true)}
                          className="h-6 px-2 text-[10px] gap-1"
                        >
                          <Download className="size-3" />
                          <span>Export</span>
                        </Button>
                      </div>
                    )}
                  </div>
                  {isGenerating ? (
                    <div className="py-12 flex flex-col items-center justify-center space-y-2">
                      <Loader2 className="size-6 text-primary animate-spin" />
                      <span className="text-xs text-muted-foreground font-medium">Drafting material...</span>
                    </div>
                  ) : generatedContent ? (
                    <RichMessageRenderer content={generatedContent} />
                  ) : (
                    <div className="text-xs text-muted-foreground py-12 text-center font-medium">
                      Fill out topic specifications and click &ldquo;Generate Learning Material&rdquo;.
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* TAB 4: Response Review */}
          {activeTab === "review" && (
            <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-4 max-w-5xl mx-auto w-full">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <h3 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <BookOpenCheck className="size-4 text-primary" /> Response Rubric Review
                </h3>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                <Card className="lg:col-span-4 p-3.5 space-y-3 bg-muted/20 border-border/60">
                  <div className="space-y-1.5">
                    <Label htmlFor="review-rubric" className="text-xs font-semibold">Grading Rubric / Criteria</Label>
                    <Textarea
                      id="review-rubric"
                      placeholder="Paste target rubric criteria or reference solution..."
                      value={gradingRubric}
                      onChange={(e) => setGradingRubric(e.target.value)}
                      className="h-20 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="review-student" className="text-xs font-semibold">Student Open-Ended Response</Label>
                    <Textarea
                      id="review-student"
                      placeholder="Paste the student's submission text here..."
                      value={studentResponse}
                      onChange={(e) => setStudentResponse(e.target.value)}
                      className="h-28 text-xs bg-background"
                    />
                  </div>

                  <Button
                    onClick={handleReviewSubmission}
                    disabled={isGenerating || !studentResponse}
                    className="w-full h-8.5 text-xs font-semibold text-primary-foreground bg-primary"
                  >
                    {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
                    Analyze & Review Response
                  </Button>
                </Card>

                <Card className="lg:col-span-8 p-4 flex flex-col min-h-[350px] border-border/60">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-semibold">Scoring Recommendation & Rubric Analysis</Label>
                    {generatedContent && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyText(generatedContent, "copy-review-draft")}
                          className="h-6 px-2 text-[10px] gap-1"
                        >
                          {copiedActionId === "copy-review-draft" ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                          <span>Copy</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExportModalOpen(true)}
                          className="h-6 px-2 text-[10px] gap-1"
                        >
                          <Download className="size-3" />
                          <span>Export</span>
                        </Button>
                      </div>
                    )}
                  </div>
                  {isGenerating ? (
                    <div className="py-12 flex flex-col items-center justify-center space-y-2">
                      <Loader2 className="size-6 text-primary animate-spin" />
                      <span className="text-xs text-muted-foreground font-medium">Evaluating student response...</span>
                    </div>
                  ) : generatedContent ? (
                    <RichMessageRenderer content={generatedContent} />
                  ) : (
                    <div className="text-xs text-muted-foreground py-12 text-center font-medium">
                      Paste a student submission and click &ldquo;Analyze & Review Response&rdquo;.
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* TAB 5: Feedback Assistant */}
          {activeTab === "feedback" && (
            <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-4 max-w-5xl mx-auto w-full">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <h3 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Award className="size-4 text-primary" /> Student Feedback Assistant
                </h3>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                <Card className="lg:col-span-4 p-3.5 space-y-3 bg-muted/20 border-border/60">
                  <div className="space-y-1.5">
                    <Label htmlFor="feedback-perf" className="text-xs font-semibold">Student Performance Summary</Label>
                    <Textarea
                      id="feedback-perf"
                      placeholder="e.g. Scored 14/20. Strong on database queries, needs improvement on normalization."
                      value={feedbackPerformance}
                      onChange={(e) => setFeedbackPerformance(e.target.value)}
                      className="h-32 text-xs bg-background"
                    />
                  </div>

                  <Button
                    onClick={handleGenerateFeedback}
                    disabled={isGenerating || !feedbackPerformance}
                    className="w-full h-8.5 text-xs font-semibold text-primary-foreground bg-primary"
                  >
                    {isGenerating ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
                    Draft Student Feedback
                  </Button>
                </Card>

                <Card className="lg:col-span-8 p-4 flex flex-col min-h-[350px] border-border/60">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-semibold">Drafted Student Feedback</Label>
                    {generatedContent && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyText(generatedContent, "copy-feedback-draft")}
                          className="h-6 px-2 text-[10px] gap-1"
                        >
                          {copiedActionId === "copy-feedback-draft" ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                          <span>Copy</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExportModalOpen(true)}
                          className="h-6 px-2 text-[10px] gap-1"
                        >
                          <Download className="size-3" />
                          <span>Export</span>
                        </Button>
                      </div>
                    )}
                  </div>
                  {isGenerating ? (
                    <div className="py-12 flex flex-col items-center justify-center space-y-2">
                      <Loader2 className="size-6 text-primary animate-spin" />
                      <span className="text-xs text-muted-foreground font-medium">Drafting personalized feedback...</span>
                    </div>
                  ) : generatedContent ? (
                    <RichMessageRenderer content={generatedContent} />
                  ) : (
                    <div className="text-xs text-muted-foreground py-12 text-center font-medium">
                      Enter student performance summary and click &ldquo;Draft Student Feedback&rdquo;.
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* TAB 6: Analytics & Insights */}
          {(activeTab === "analytics" || activeTab === "insights") && (
            <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-4 max-w-5xl mx-auto w-full">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <h3 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <BarChart2 className="size-4 text-primary" /> Class Analytics & Insights
                </h3>
              </div>

              <Card className="p-4 flex flex-col min-h-[350px] border-border/60">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-semibold">Class Performance Narrative</Label>
                  {generatedContent && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyText(generatedContent, "copy-analytics-draft")}
                        className="h-6 px-2 text-[10px] gap-1"
                      >
                        {copiedActionId === "copy-analytics-draft" ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        <span>Copy</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExportModalOpen(true)}
                        className="h-6 px-2 text-[10px] gap-1"
                      >
                        <Download className="size-3" />
                        <span>Export</span>
                      </Button>
                    </div>
                  )}
                </div>
                {isGenerating ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-2">
                    <Loader2 className="size-6 text-primary animate-spin" />
                    <span className="text-xs text-muted-foreground font-medium">Synthesizing analytics insights...</span>
                  </div>
                ) : generatedContent ? (
                  <RichMessageRenderer content={generatedContent} />
                ) : (
                  <div className="text-xs text-muted-foreground py-12 text-center font-medium">
                    Select a workspace and use the Assistant Chat to query class cohort metrics and distributions.
                  </div>
                )}
              </Card>
            </div>
          )}
        </main>
      </div>

      {/* Context Panel Drawer Sheet */}
      <Sheet open={isContextSheetOpen} onOpenChange={setIsContextSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-y-auto">
          <SheetHeader className="p-4 border-b border-border/40 text-left">
            <SheetTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Folder className="size-4 text-primary" /> Course Context & Sources
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Select the active teaching workspace and choose reference handouts for RAG grounding.
            </SheetDescription>
          </SheetHeader>
          {renderContextPanel()}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!sessionToDelete} onOpenChange={(open) => !open && setSessionToDelete(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Delete AI Session</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete this session? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setSessionToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDeleteSession}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Modal */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Share2 className="size-4 text-primary" /> Share AI Session
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Copy a markdown transcript or shareable link to collaborate with faculty colleagues.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Session Link</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={typeof window !== "undefined" ? window.location.href : ""}
                  className="h-8.5 text-xs bg-muted/30 select-all"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      navigator.clipboard.writeText(window.location.href);
                      toast.success("Link copied to clipboard!");
                    }
                  }}
                  className="h-8.5 px-3 text-xs"
                >
                  <Copy className="size-3.5 mr-1" /> Copy
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShareModalOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Modal with Complete PDF, Markdown, and TXT options */}
      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Download className="size-4 text-primary" /> Export AI Output
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Save your generated assessment items, rubrics, or chat history in your preferred format.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2.5 py-2">
            <Button
              variant="outline"
              className="justify-start h-12 px-3 gap-3 border-border/70 hover:bg-muted/50"
              onClick={handleExportMarkdown}
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <FileCode className="size-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold">Markdown Document (.md)</div>
                <div className="text-[11px] text-muted-foreground">Formatted with markdown headings and code blocks</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="justify-start h-12 px-3 gap-3 border-border/70 hover:bg-muted/50"
              onClick={handleExportPlainText}
            >
              <div className="p-2 rounded-lg bg-muted text-foreground">
                <FileText className="size-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold">Plain Text File (.txt)</div>
                <div className="text-[11px] text-muted-foreground">Clean, unformatted text for general notes</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="justify-start h-12 px-3 gap-3 border-border/70 hover:bg-muted/50"
              onClick={handleExportPDF}
            >
              <div className="p-2 rounded-lg bg-muted text-foreground">
                <Printer className="size-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold">Print / Save as PDF (.pdf)</div>
                <div className="text-[11px] text-muted-foreground">Formatted document ready for print or saving as PDF</div>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setExportModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function LecturerAIAssistant() {
  return (
    <Suspense
      fallback={
        <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto">
          <div className="h-8 w-48 bg-muted rounded-lg animate-pulse" />
          <div className="h-[500px] w-full bg-muted/30 rounded-2xl animate-pulse" />
        </div>
      }
    >
      <LecturerAIAssistantContent />
    </Suspense>
  );
}
