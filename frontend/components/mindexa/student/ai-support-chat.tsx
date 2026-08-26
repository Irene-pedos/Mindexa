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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sparkles,
  ShieldAlert,
  ListChecks,
  CheckCircle2,
  FileText,
  Lightbulb,
  BookOpen,
  ChevronDown,
  RefreshCw,
  Maximize2,
  Minimize2,
  Plus,
  History,
  Clock,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  AlertTriangle,
  X,
  Send,
  Download,
  CheckSquare,
  Square,
  ArrowRight,
  Layers,
  Copy,
  Check,
  Edit2,
  RotateCcw,
  Pin,
  PinOff,
  Trash2,
  Share2,
  Printer,
  ChevronRight,
  MoreVertical,
} from "lucide-react";
import {
  studentAiApi,
  type StudentConversationSummary,
  type RevisionGuideOutput,
} from "@/lib/api/student-ai";
import {
  studentApi,
  StudentResourceResponse,
  StudentCourseListItem,
} from "@/lib/api/student";
import {
  studyPlannerApi,
  type LearningUnit,
} from "@/lib/api/study-planner";
import { apiClient } from "@/lib/api/client";
import { AIChatInput, type Attachment } from "@/components/ui/ai-chat-input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";
import { useRouter, useSearchParams } from "next/navigation";

function formatHistoryDate(dateStr?: string) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch (e) {
    return "";
  }
}

function downloadTextFile(filename: string, content: string, mimeType: string = "text/markdown;charset=utf-8;") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface Message {
  id: string;
  sender: "student" | "ai";
  text: string;
  attachments?: Attachment[];
  timestamp: Date;
  citations?: Array<{
    resource_name: string;
    resource_id: string;
    page_number: number | null;
    chunk_index: number;
    excerpt: string;
  }>;
  fallback_used?: boolean;
  revision_plan?: string[];
  follow_up_questions?: string[];
  safety_notice?: string | null;
}

interface AISupportChatProps {
  initialTopicContext?: string;
  initialTab?: "support" | "revision";
  isFullPage?: boolean;
}

export function AISupportChat({
  initialTopicContext,
  initialTab,
  isFullPage = false,
}: AISupportChatProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab State with LocalStorage and URL synchronization
  const [activeTab, setActiveTab] = useState<"support" | "revision">(() => {
    if (initialTab) return initialTab;
    if (typeof window !== "undefined") {
      const urlTab = searchParams.get("tab");
      if (urlTab === "revision" || urlTab === "support") return urlTab;
      const saved = localStorage.getItem("mindexa_ai_tutor_tab");
      if (saved === "revision" || saved === "support") return saved;
    }
    return "support";
  });

  const handleTabChange = (tab: "support" | "revision") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      localStorage.setItem("mindexa_ai_tutor_tab", tab);
      const params = new URLSearchParams(window.location.search);
      params.set("tab", tab);
      router.replace(`?${params.toString()}`);
    }
  };

  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Left sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Chat Conversation State
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<StudentConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);

  // Pinned Conversations State (persisted to localStorage)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mindexa_pinned_conversations");
        return saved ? new Set(JSON.parse(saved)) : new Set();
      } catch (e) {
        return new Set();
      }
    }
    return new Set();
  });

  const togglePinConversation = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(convId)) {
        next.delete(convId);
        toast.info("Conversation unpinned.");
      } else {
        next.add(convId);
        toast.success("Conversation pinned to top.");
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("mindexa_pinned_conversations", JSON.stringify(Array.from(next)));
      }
      return next;
    });
  };

  // Modals State: Delete, Share, Export
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [copiedActionId, setCopiedActionId] = useState<string | null>(null);
  const [expandedCitationMessageIds, setExpandedCitationMessageIds] = useState<Set<string>>(new Set());

  // Context & Resources State with LocalStorage and URL persistence
  const [resources, setResources] = useState<StudentResourceResponse[]>([]);
  const [workspaces, setWorkspaces] = useState<StudentCourseListItem[]>([]);
  const [lecturerMaterials, setLecturerMaterials] = useState<any[]>([]);
  const [selectedResource, setSelectedResourceState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const urlScope = searchParams.get("scope");
      if (urlScope) return urlScope;
      const savedScope = localStorage.getItem("mindexa_ai_tutor_scope");
      if (savedScope) return savedScope;
    }
    return null;
  });

  const setSelectedResource = (id: string | null) => {
    setSelectedResourceState(id);
    if (typeof window !== "undefined") {
      if (id) {
        localStorage.setItem("mindexa_ai_tutor_scope", id);
      } else {
        localStorage.removeItem("mindexa_ai_tutor_scope");
      }
      const params = new URLSearchParams(window.location.search);
      if (id) {
        params.set("scope", id);
      } else {
        params.delete("scope");
      }
      router.replace(`?${params.toString()}`);
    }
  };

  const [loadingResources, setLoadingResources] = useState(true);

  // Blocker States
  const [isBlockedByLanguagePolicy, setIsBlockedByLanguagePolicy] = useState(false);
  const [isBlockedByActiveExam, setIsBlockedByActiveExam] = useState(false);
  const [blockingExamTitle, setBlockingExamTitle] = useState("");

  // Dropdowns & Popovers
  const [resourcesDropdownOpen, setResourcesDropdownOpen] = useState(false);
  const [tipsPopoverOpen, setTipsPopoverOpen] = useState(false);
  const [integrityPopoverOpen, setIntegrityPopoverOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Revision Center State with Persistence
  const [selectedRevisionWorkspace, setSelectedRevisionWorkspaceState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const urlWs = searchParams.get("course");
      if (urlWs) return urlWs;
      const saved = localStorage.getItem("mindexa_ai_tutor_course");
      if (saved) return saved;
    }
    return null;
  });

  const setSelectedRevisionWorkspace = (id: string | null) => {
    setSelectedRevisionWorkspaceState(id);
    if (typeof window !== "undefined") {
      if (id) {
        localStorage.setItem("mindexa_ai_tutor_course", id);
      } else {
        localStorage.removeItem("mindexa_ai_tutor_course");
      }
    }
  };

  const [learningUnits, setLearningUnits] = useState<LearningUnit[]>([]);
  const [selectedLearningUnit, setSelectedLearningUnit] = useState<LearningUnit | null>(null);
  const [isLoadingLearningUnits, setIsLoadingLearningUnits] = useState(false);
  const [customRevisionTopic, setCustomRevisionTopic] = useState("");
  const [revisionResult, setRevisionResult] = useState<RevisionGuideOutput | null>(null);
  const [isGeneratingRevision, setIsGeneratingRevision] = useState(false);
  const [checkedChecklistItems, setCheckedChecklistItems] = useState<Set<number>>(new Set());

  const latestAiMessageRef = useRef<HTMLDivElement>(null);
  const resourcesRef = useRef<HTMLDivElement>(null);
  const tipsRef = useRef<HTMLDivElement>(null);
  const integrityRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (initialTopicContext && initialTopicContext.trim()) {
      setPrompt(
        `I am reviewing "${initialTopicContext}". Can you explain the core concepts and test my understanding?`
      );
      if (activeTab === "revision") {
        setCustomRevisionTopic(initialTopicContext);
      }
    }
  }, [initialTopicContext, activeTab]);

  const isSelectedRwanda = useMemo(() => {
    if (!selectedResource) return false;
    const directWs = workspaces.find((w) => w.id === selectedResource);
    if (directWs) return directWs.language === "RW";

    const lecturerMat = lecturerMaterials.find((m) => m.id === selectedResource);
    if (lecturerMat) {
      const targetWsId = lecturerMat.workspace_id || lecturerMat.teaching_workspace_id;
      const ws = workspaces.find((w) => w.id === targetWsId);
      return ws?.language === "RW";
    }

    return false;
  }, [workspaces, lecturerMaterials, selectedResource]);

  const selectedResourceName = useMemo(() => {
    if (!selectedResource) return null;
    const directWs = workspaces.find((w) => w.id === selectedResource);
    if (directWs) return `${directWs.code || directWs.title} (Course)`;

    const personal = resources.find((r) => r.id === selectedResource);
    if (personal) return personal.display_name || personal.original_filename;

    const lecturerMat = lecturerMaterials.find((m) => m.id === selectedResource);
    if (lecturerMat)
      return `${lecturerMat.display_name || lecturerMat.original_filename} (${lecturerMat.course_code || "Material"})`;

    return "Context Selected";
  }, [selectedResource, workspaces, resources, lecturerMaterials]);

  const handleApiError = (err: any, fallbackMessage: string) => {
    const rawMessage = err?.message || "";
    const errorCode = err?.code || "";

    const isRwandaIssue =
      errorCode === "AI_BLOCKED_LANGUAGE_POLICY" ||
      errorCode === "AI_LANGUAGE_POLICY_RESTRICTED" ||
      rawMessage.toLowerCase().includes("kinyarwanda") ||
      rawMessage.toLowerCase().includes("language policy");

    if (isRwandaIssue) {
      setIsBlockedByLanguagePolicy(true);
      const userFriendlyMessage =
        "AI Study Tutor is disabled for Kinyarwanda courses according to institutional academic policy.";
      setError(userFriendlyMessage);
      toast.error(userFriendlyMessage);
      return;
    }

    const isInternetIssue =
      rawMessage.toLowerCase().includes("internet issue") ||
      rawMessage.toLowerCase().includes("timeout") ||
      rawMessage.toLowerCase().includes("could not reach the api") ||
      rawMessage.toLowerCase().includes("failed to fetch") ||
      rawMessage.toLowerCase().includes("networkerror");

    const userFriendlyMessage = isInternetIssue
      ? "Internet issue: Connection to external service failed. Please check your network connection."
      : rawMessage || fallbackMessage;

    setError(userFriendlyMessage);

    if (isInternetIssue) {
      toast.error("Internet issue");
    } else {
      toast.error(userFriendlyMessage);
    }
  };

  // Load initial resources, active exam blockers, and conversation history
  useEffect(() => {
    async function loadData() {
      try {
        setLoadingResources(true);
        const [personalResData, attemptsData, workspacesData, convData] =
          await Promise.all([
            studentApi.getPersonalResources().catch(() => []),
            apiClient("/attempts/me").catch(() => ({ items: [] })),
            studentApi.getWorkspaces().catch(() => []),
            studentAiApi.getConversations().catch(() => []),
          ]);

        setResources(personalResData);
        setWorkspaces(workspacesData);
        setSelectedRevisionWorkspaceState((prev) => {
          const defaultWs = prev || (workspacesData.length > 0 ? workspacesData[0].id : null);
          if (defaultWs && typeof window !== "undefined") {
            localStorage.setItem("mindexa_ai_tutor_course", defaultWs);
          }
          return defaultWs;
        });

        // Load materials for all workspaces
        const workspaceMaterialsPromises = workspacesData.map(async (ws) => {
          try {
            const mats = await studentApi.getWorkspaceMaterials(ws.id);
            return mats.map((m) => ({
              ...m,
              workspace_id: ws.id,
              teaching_workspace_id: ws.id,
              course_code: ws.code,
              course_name: ws.title,
            }));
          } catch (e) {
            return [];
          }
        });
        const allWorkspaceMaterials = (
          await Promise.all(workspaceMaterialsPromises)
        ).flat();
        setLecturerMaterials(allWorkspaceMaterials);

        // Restore chat conversation history from server
        if (convData && convData.length > 0) {
          setConversations(convData);
          const latestConvId = convData[0].conversation_id;
          setCurrentConversationId(latestConvId);
          try {
            const turns = await studentAiApi.getConversation(latestConvId);
            const loadedMessages: Message[] = turns.flatMap((item) => [
              {
                id: item.id + "-q",
                sender: "student",
                text: item.question,
                timestamp: new Date(item.created_at),
              },
              {
                id: item.id + "-a",
                sender: "ai",
                text: item.answer,
                citations: item.citations,
                timestamp: new Date(item.created_at),
              },
            ]);
            setMessages(loadedMessages);
          } catch (e) {
            console.warn("Failed to load initial conversation turns:", e);
          }
        }

        // Active assessment blocking check
        const activeAttempts = (attemptsData.items || []).filter(
          (a: any) => a.status === "IN_PROGRESS" || a.status === "PAUSED"
        );
        if (activeAttempts.length > 0) {
          const blocking =
            activeAttempts.find(
              (a: any) =>
                a.assessment_type === "CAT" ||
                a.assessment_type === "SUMMATIVE" ||
                a.is_supervised ||
                a.ai_assistance_allowed === false
            ) || activeAttempts[0];

          setIsBlockedByActiveExam(true);
          setBlockingExamTitle(
            blocking.title || blocking.assessment_title || "Active Assessment"
          );
        }
      } catch (err) {
        console.error("Failed to load study tutor data", err);
      } finally {
        setLoadingResources(false);
      }
    }
    loadData();
  }, []);

  // Load Learning Units when selectedRevisionWorkspace changes
  useEffect(() => {
    if (!selectedRevisionWorkspace) return;
    async function loadUnits() {
      setIsLoadingLearningUnits(true);
      try {
        const units = await studyPlannerApi.getLearningUnits(selectedRevisionWorkspace!);
        setLearningUnits(units);
        if (units.length > 0) {
          setSelectedLearningUnit(units[0]);
        } else {
          setSelectedLearningUnit(null);
        }
      } catch (e) {
        setLearningUnits([]);
        setSelectedLearningUnit(null);
      } finally {
        setIsLoadingLearningUnits(false);
      }
    }
    loadUnits();
  }, [selectedRevisionWorkspace]);

  // Click outside listener for dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        resourcesRef.current &&
        !resourcesRef.current.contains(event.target as Node)
      ) {
        setResourcesDropdownOpen(false);
      }
      if (tipsRef.current && !tipsRef.current.contains(event.target as Node)) {
        setTipsPopoverOpen(false);
      }
      if (
        integrityRef.current &&
        !integrityRef.current.contains(event.target as Node)
      ) {
        setIntegrityPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sorted conversations: pinned first, then by last activity
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const aPinned = pinnedIds.has(a.conversation_id);
      const bPinned = pinnedIds.has(b.conversation_id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      const aDate = new Date(a.last_activity_at || a.created_at).getTime();
      const bDate = new Date(b.last_activity_at || b.created_at).getTime();
      return bDate - aDate;
    });
  }, [conversations, pinnedIds]);

  // Start a new chat thread
  const handleStartNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setError(null);
    setPrompt("");
    handleTabChange("support");
  };

  // Switch to a previous conversation
  const handleSelectConversation = async (conversationId: string) => {
    if (conversationId === currentConversationId) return;
    setIsLoadingConversation(true);
    setError(null);
    try {
      const turns = await studentAiApi.getConversation(conversationId);
      const loadedMessages: Message[] = turns.flatMap((item) => [
        {
          id: item.id + "-q",
          sender: "student",
          text: item.question,
          timestamp: new Date(item.created_at),
        },
        {
          id: item.id + "-a",
          sender: "ai",
          text: item.answer,
          citations: item.citations,
          timestamp: new Date(item.created_at),
        },
      ]);
      setCurrentConversationId(conversationId);
      setMessages(loadedMessages);
      handleTabChange("support");
    } catch (err) {
      toast.error("Failed to load conversation history.");
    } finally {
      setIsLoadingConversation(false);
    }
  };

  // Delete Conversation confirmation
  const handleConfirmDeleteConversation = async () => {
    if (!conversationToDelete) return;
    setIsDeletingConversation(true);
    try {
      await studentAiApi.deleteConversation(conversationToDelete);
      setConversations((prev) => prev.filter((c) => c.conversation_id !== conversationToDelete));
      setPinnedIds((prev) => {
        const next = new Set(prev);
        next.delete(conversationToDelete);
        if (typeof window !== "undefined") {
          localStorage.setItem("mindexa_pinned_conversations", JSON.stringify(Array.from(next)));
        }
        return next;
      });
      if (currentConversationId === conversationToDelete) {
        handleStartNewChat();
      }
      toast.success("Conversation deleted.");
    } catch (err) {
      toast.error("Failed to delete conversation.");
    } finally {
      setIsDeletingConversation(false);
      setConversationToDelete(null);
    }
  };

  // Upload personal resource
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const newRes = await studentApi.uploadPersonalResource(formData);
      setResources((prev) => [newRes, ...prev]);
      setSelectedResource(newRes.id);
      toast.success(
        `Uploaded "${file.name}". Background processing initiated for AI context grounding.`
      );
    } catch (err: any) {
      handleApiError(err, "Failed to upload study resource.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Delete personal resource
  const handleDeleteResource = async (id: string) => {
    try {
      await studentApi.deletePersonalResource(id);
      setResources((prev) => prev.filter((r) => r.id !== id));
      if (selectedResource === id) setSelectedResource(null);
      toast.success("Resource deleted successfully.");
    } catch (err) {
      toast.error("Failed to delete resource.");
    }
  };

  // Copy helper
  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedActionId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedActionId(null), 2000);
  };

  // Edit user message (places it back into composer)
  const handleEditUserMessage = (text: string) => {
    setPrompt(text);
    toast.info("Message placed in composer for editing.");
  };

  // Regenerate / Retry last prompt
  const handleRegenerateLastMessage = () => {
    const lastStudentMsg = [...messages].reverse().find((m) => m.sender === "student");
    if (lastStudentMsg) {
      handleSendMessage({ input: lastStudentMsg.text, attachments: lastStudentMsg.attachments });
    }
  };

  // Suggested prompts
  const studySuggestedActions = [
    {
      title: "Explain Concept",
      label: "Database Normalization in simple terms",
      action: "Explain Database Normalization with step-by-step examples",
    },
    {
      title: "Active Recall",
      label: "SQL Joins practice scenarios",
      action:
        "Provide scenarios to test my understanding of SQL Outer and Inner Joins",
    },
    {
      title: "Academic Material Study",
      label: "Summarize selected context",
      action:
        "Summarize the key takeaways and learning outcomes from the selected resource",
    },
    {
      title: "Exam Preparation",
      label: "Common pitfalls and exam tips",
      action:
        "What are the most common exam mistakes and pitfalls for this topic?",
    },
  ];

  // Send Message Handler
  const handleSendMessage = async (
    params:
      | string
      | {
          input: string;
          attachments?: Attachment[];
          isThinking?: boolean;
          isDeepSearch?: boolean;
        }
  ) => {
    const rawInput = typeof params === "string" ? params : params?.input || "";
    const attachmentList =
      typeof params === "string" ? [] : params?.attachments || [];
    const isThinkingMode =
      typeof params === "object" ? params?.isThinking : false;
    const isDeepSearchMode =
      typeof params === "object" ? params?.isDeepSearch : false;

    if (isSelectedRwanda || isBlockedByLanguagePolicy) {
      toast.error(
        "AI Study Tutor is disabled for Kinyarwanda courses according to institutional academic policy."
      );
      return;
    }

    const userQuery = rawInput.trim();
    let promptWithContext = userQuery;

    if (isThinkingMode) {
      toast.info("Deep Reasoning mode active");
    }
    if (isDeepSearchMode) {
      toast.info("Deep Document RAG Search active");
    }

    if (attachmentList.length > 0) {
      const fileDetails = attachmentList
        .map((a) => {
          if (a.extractedText) {
            return `\n--- ATTACHED STUDY FILE: ${a.name} ---\n${a.extractedText.slice(
              0,
              15000
            )}\n--- END FILE ---`;
          }
          return `\n[Attached Study File: ${a.name}]`;
        })
        .join("\n");

      promptWithContext = userQuery
        ? `${promptWithContext}\n${fileDetails}`
        : fileDetails;

      for (const att of attachmentList) {
        if ((att as any).file) {
          try {
            const formData = new FormData();
            formData.append("file", (att as any).file);
            await studentApi.uploadPersonalResource(formData);
            toast.success(
              `Uploaded ${att.name} to personal study resources.`
            );
          } catch (uploadErr) {
            console.warn("Auto-upload error:", uploadErr);
          }
        }
      }
    }

    if (!userQuery && attachmentList.length === 0) return;

    const newStudentMessage: Message = {
      id: Date.now().toString(),
      sender: "student",
      text: userQuery,
      attachments: attachmentList,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newStudentMessage]);
    setIsThinking(true);
    setError(null);
    setPrompt("");

    try {
      const history = messages.map((m) => ({
        role: m.sender === "student" ? "user" : "assistant",
        content: m.text,
      }));

      let selectedResourceId: string | undefined = undefined;
      let teachingWorkspaceId: string | undefined = undefined;

      if (selectedResource) {
        const directWs = workspaces.find((w) => w.id === selectedResource);
        if (directWs) {
          teachingWorkspaceId = directWs.id;
        } else {
          selectedResourceId = selectedResource;
          const lecturerMat = lecturerMaterials.find(
            (m) => m.id === selectedResource
          );
          if (lecturerMat) {
            teachingWorkspaceId =
              lecturerMat.workspace_id || lecturerMat.teaching_workspace_id;
          }
        }
      }

      const res = await studentAiApi.getSupport({
        question: promptWithContext,
        source_surface: "study_tutor",
        conversation_id: currentConversationId || undefined,
        conversation_history: history,
        selected_resource_id: selectedResourceId,
        teaching_workspace_id: teachingWorkspaceId,
        thinking_mode: isThinkingMode,
        deep_search_mode: isDeepSearchMode,
      });

      const newAiMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: res.explanation,
        timestamp: new Date(),
        citations: res.citations,
        fallback_used: res.fallback_used,
      };

      setMessages((prev) => [...prev, newAiMessage]);

      // Anchor scroll to the start of the AI message turn
      setTimeout(() => {
        latestAiMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);

      const activeConvId = res.conversation_id || currentConversationId;
      if (activeConvId) {
        setCurrentConversationId(activeConvId);
        setConversations((prev) => {
          const existingIdx = prev.findIndex(
            (c) => c.conversation_id === activeConvId
          );
          const nowIso = new Date().toISOString();
          if (existingIdx >= 0) {
            const existing = prev[existingIdx];
            const updated: StudentConversationSummary = {
              ...existing,
              last_activity_at: nowIso,
              turn_count: existing.turn_count + 1,
            };
            return [updated, ...prev.filter((_, idx) => idx !== existingIdx)];
          } else {
            const newConv: StudentConversationSummary = {
              conversation_id: activeConvId,
              preview:
                userQuery.length > 80
                  ? userQuery.slice(0, 77) + "..."
                  : userQuery || "New Conversation",
              created_at: nowIso,
              last_activity_at: nowIso,
              turn_count: 1,
            };
            return [newConv, ...prev];
          }
        });
      }
    } catch (err: any) {
      if (
        err?.status === 403 ||
        err?.code === "AI_BLOCKED_DURING_ACTIVE_ASSESSMENT" ||
        String(err?.message || "").includes("during an active")
      ) {
        setIsBlockedByActiveExam(true);
      }
      if (
        err?.code === "AI_BLOCKED_LANGUAGE_POLICY" ||
        err?.code === "AI_LANGUAGE_POLICY_RESTRICTED" ||
        String(err?.message || "").toLowerCase().includes("kinyarwanda")
      ) {
        setIsBlockedByLanguagePolicy(true);
      }
      handleApiError(err, "Failed to retrieve AI explanation.");
    } finally {
      setIsThinking(false);
    }
  };

  // Launch interactive Socratic review turn in chat
  const handleStartSocraticReview = (unitTitle: string) => {
    handleTabChange("support");
    const socraticPrompt = `Let's review the curriculum learning unit: "${unitTitle}". Please give me a concise breakdown of the core concept followed by one comprehension-check question to test my understanding.`;
    handleSendMessage(socraticPrompt);
  };

  // Generate downloadable markdown revision sheet
  const handleGenerateDownloadableRevisionSheet = async (unit?: LearningUnit | null) => {
    const topicToUse = unit ? unit.title : customRevisionTopic.trim();
    if (!topicToUse) {
      toast.error("Please select a learning unit or enter a topic name.");
      return;
    }

    setIsGeneratingRevision(true);
    setRevisionResult(null);
    setCheckedChecklistItems(new Set());
    setError(null);

    try {
      const guide = await studentAiApi.getRevisionGuide({
        topic: topicToUse,
        learningUnitId: unit?.id || undefined,
        teachingWorkspaceId: selectedRevisionWorkspace || undefined,
      });
      setRevisionResult(guide);
      toast.success("Structured revision guide generated!");
    } catch (err: any) {
      handleApiError(err, "Failed to generate revision guide.");
    } finally {
      setIsGeneratingRevision(false);
    }
  };

  // Toggle checklist item completion
  const toggleChecklistItem = (idx: number) => {
    setCheckedChecklistItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Toggle citation expand for message
  const toggleCitationExpand = (msgId: string) => {
    setExpandedCitationMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  // Build markdown transcript for export / share
  const buildConversationMarkdown = () => {
    const lines = [
      "# Mindexa AI Study Tutor - Conversation Transcript",
      `*Exported on ${new Date().toLocaleString()}*`,
      "",
      "---",
      "",
    ];

    messages.forEach((msg) => {
      if (msg.sender === "student") {
        lines.push(`### 🧑 Student (${msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`);
        lines.push(msg.text);
        if (msg.attachments && msg.attachments.length > 0) {
          lines.push(`*Attached: ${msg.attachments.map((a) => a.name).join(", ")}*`);
        }
        lines.push("");
      } else {
        lines.push(`### ✨ AI Study Tutor (${msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`);
        lines.push(msg.text);
        if (msg.citations && msg.citations.length > 0) {
          lines.push("\n**References:**");
          msg.citations.forEach((c) => {
            lines.push(`- ${c.resource_name}${c.page_number ? ` (p. ${c.page_number})` : ""}`);
          });
        }
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    });

    return lines.join("\n");
  };

  // Build plain text transcript
  const buildConversationPlainText = () => {
    const lines = [
      "MINDEXA AI STUDY TUTOR - CONVERSATION TRANSCRIPT",
      `Exported: ${new Date().toLocaleString()}`,
      "==================================================",
      "",
    ];

    messages.forEach((msg) => {
      const sender = msg.sender === "student" ? "STUDENT" : "AI TUTOR";
      lines.push(`[${msg.timestamp.toLocaleTimeString()}] ${sender}:`);
      lines.push(msg.text);
      lines.push("");
    });

    return lines.join("\n");
  };

  // Active Assessment Blocker Card
  if (isBlockedByActiveExam) {
    return (
      <Card className="shadow-none border w-full flex flex-col h-full justify-center items-center bg-zinc-50/20 p-8 min-h-[400px]">
        <div className="flex flex-col items-center text-center max-w-md space-y-4">
          <div className="size-12 rounded-full bg-red-100 flex items-center justify-center">
            <ShieldAlert className="size-6 text-red-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-medium text-red-600">
              AI Support Unavailable
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
              AI assistance is disabled for this assessment to maintain academic
              integrity.
            </p>
            {blockingExamTitle && (
              <p className="text-xs font-medium text-foreground bg-zinc-100 py-1.5 px-3 rounded-lg border border-zinc-200">
                Active Assessment: {blockingExamTitle}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground font-medium">
              Please finalize your attempt and submit your assessment to restore
              access.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <MessageScrollerProvider scrollPreviousItemPeek={64} scrollMargin={24}>
      <div
        className={cn(
          "w-full flex flex-row relative overflow-hidden bg-background",
          isFullScreen
            ? "fixed inset-0 z-50 h-screen w-screen p-0 bg-background"
            : "h-full min-h-0"
        )}
      >
        {/* ── Left Collapsible Rail (ChatGPT/Claude Style) ── */}
        <aside
          className={cn(
            "flex flex-col border-r border-border/40 bg-muted/15 transition-all duration-300 shrink-0 z-20 overflow-hidden",
            isSidebarOpen ? "w-[280px]" : "w-0 border-r-0"
          )}
        >
          {isSidebarOpen && (
            <div className="flex flex-col h-full w-[280px]">
              {/* Left Rail Header */}
              <div className="p-3 border-b border-border/40 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Sparkles className="size-4" />
                  </div>
                  <span className="text-xs font-bold tracking-tight text-foreground">
                    AI Study Tutor
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSidebarOpen(false)}
                  className="size-7 text-muted-foreground hover:text-foreground"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="size-4" />
                </Button>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="p-2 border-b border-border/30 shrink-0">
                <div className="grid grid-cols-2 gap-1 p-1 bg-muted/50 rounded-lg">
                  <button
                    type="button"
                    onClick={() => handleTabChange("support")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-1 px-2 text-[11px] font-semibold rounded-md transition-all",
                      activeTab === "support"
                        ? "bg-background text-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Sparkles className="size-3" />
                    Study Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange("revision")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-1 px-2 text-[11px] font-semibold rounded-md transition-all",
                      activeTab === "revision"
                        ? "bg-background text-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <BookOpen className="size-3" />
                    Revision
                  </button>
                </div>
              </div>

              {/* New Chat Button */}
              <div className="p-2 border-b border-border/30 shrink-0">
                <Button
                  onClick={handleStartNewChat}
                  className="w-full h-8 gap-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
                  type="button"
                >
                  <Plus className="size-3.5" />
                  <span>New Chat</span>
                </Button>
              </div>

              {/* Resource & Context Scoping Picker */}
              <div className="p-2 border-b border-border/30 shrink-0 relative" ref={resourcesRef}>
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 pb-1">
                  Active Knowledge Scope
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "w-full h-8 gap-1.5 rounded-lg border-zinc-200 text-xs font-semibold bg-background justify-between px-2.5",
                    selectedResource && "border-primary text-primary bg-primary/5"
                  )}
                  onClick={() => setResourcesDropdownOpen(!resourcesDropdownOpen)}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <FileText className="size-3.5 shrink-0 text-primary" />
                    <span className="truncate max-w-[190px] text-left">
                      {selectedResourceName || "General Knowledge"}
                    </span>
                  </div>
                  <ChevronDown className="size-3 shrink-0 opacity-60 ml-1" />
                </Button>

                {resourcesDropdownOpen && (
                  <div className="absolute left-2 right-2 top-full mt-1 bg-popover text-popover-foreground border rounded-xl shadow-xl p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1 text-left">
                      {/* General Knowledge option */}
                      <div>
                        <div
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer hover:bg-muted/50 transition-colors",
                            !selectedResource &&
                              "border-primary bg-primary/10 text-primary font-semibold"
                          )}
                          onClick={() => {
                            setSelectedResource(null);
                            setResourcesDropdownOpen(false);
                          }}
                        >
                          <Sparkles className="size-3.5 shrink-0 text-amber-500" />
                          <div className="truncate flex-1 font-medium text-left">
                            <div>General Knowledge</div>
                            <div className="text-[10px] text-muted-foreground">
                              No course context
                            </div>
                          </div>
                          {!selectedResource && (
                            <CheckCircle2 className="size-3.5 text-primary shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* Enrolled Courses section */}
                      {workspaces.length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 px-1">
                            Enrolled Courses
                          </div>
                          <div className="space-y-1">
                            {workspaces.map((ws) => (
                              <div
                                key={ws.id}
                                className={cn(
                                  "flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer hover:bg-muted/50 transition-colors",
                                  selectedResource === ws.id &&
                                    "border-primary bg-primary/10 text-primary font-semibold"
                                )}
                                onClick={() => {
                                  setSelectedResource(
                                    selectedResource === ws.id ? null : ws.id
                                  );
                                  setSelectedRevisionWorkspace(ws.id);
                                  setResourcesDropdownOpen(false);
                                }}
                              >
                                <BookOpen className="size-3.5 shrink-0 text-indigo-500" />
                                <div className="truncate flex-1 font-medium text-left">
                                  <div className="truncate">
                                    {ws.code}: {ws.title}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {ws.language === "RW"
                                      ? "Kinyarwanda (Disabled)"
                                      : "All course materials"}
                                  </div>
                                </div>
                                {selectedResource === ws.id && (
                                  <CheckCircle2 className="size-3.5 text-primary shrink-0" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Lecturer Materials section */}
                      <div>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 px-1">
                          Lecturer Materials
                        </div>
                        {loadingResources ? (
                          <div className="text-xs text-muted-foreground py-1 pl-2">
                            Loading materials...
                          </div>
                        ) : lecturerMaterials.length === 0 ? (
                          <div className="text-xs text-muted-foreground py-1 pl-2">
                            No materials uploaded.
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {lecturerMaterials.map((file) => (
                              <div
                                key={file.id}
                                className={cn(
                                  "flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer hover:bg-muted/50 transition-colors",
                                  selectedResource === file.id &&
                                    "border-primary bg-primary/10 text-primary font-semibold"
                                )}
                                onClick={() => {
                                  setSelectedResource(
                                    selectedResource === file.id ? null : file.id
                                  );
                                  setResourcesDropdownOpen(false);
                                }}
                              >
                                <FileText className="size-3.5 shrink-0 text-blue-500" />
                                <div className="truncate flex-1 font-medium text-left">
                                  <div className="truncate">
                                    {file.display_name || file.original_filename}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {file.course_code}
                                  </div>
                                </div>
                                {selectedResource === file.id && (
                                  <CheckCircle2 className="size-3.5 text-primary shrink-0" />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Personal Resources section */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5 px-1">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            Personal Files
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[10px] text-primary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                          >
                            {isUploading ? (
                              <RefreshCw className="size-2.5 animate-spin mr-1" />
                            ) : (
                              <Plus className="size-2.5 mr-1" />
                            )}
                            Upload
                          </Button>
                          <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept=".pdf,.docx,.txt"
                            onChange={handleFileUpload}
                          />
                        </div>
                        {resources.length === 0 ? (
                          <div className="text-xs text-muted-foreground py-1 pl-2">
                            No personal files.
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {resources.map((file) => (
                              <div
                                key={file.id}
                                className={cn(
                                  "group flex items-center gap-2 p-2 rounded-lg border text-xs hover:bg-muted/50 transition-colors",
                                  selectedResource === file.id &&
                                    "border-primary bg-primary/10 text-primary font-semibold"
                                )}
                              >
                                <div
                                  className="flex-1 flex items-center gap-2 cursor-pointer"
                                  onClick={() => {
                                    setSelectedResource(
                                      selectedResource === file.id ? null : file.id
                                    );
                                    setResourcesDropdownOpen(false);
                                  }}
                                >
                                  <FileText className="size-3.5 shrink-0 text-emerald-500" />
                                  <div className="truncate flex-1 font-medium text-left">
                                    <div className="truncate">
                                      {file.display_name || file.original_filename}
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteResource(file.id);
                                  }}
                                >
                                  <X className="size-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Previous Chats History List (with Pin & Delete) */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1 flex items-center justify-between">
                  <span>Recent Conversations</span>
                  <History className="size-3" />
                </div>

                {sortedConversations.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground font-medium bg-muted/30 rounded-lg border border-dashed border-border/40 my-2">
                    No chat history yet.
                  </div>
                ) : (
                  sortedConversations.map((item) => {
                    const isActive = currentConversationId === item.conversation_id;
                    const isPinned = pinnedIds.has(item.conversation_id);
                    return (
                      <div
                        key={item.conversation_id}
                        onClick={() => handleSelectConversation(item.conversation_id)}
                        className={cn(
                          "group relative p-2 rounded-lg border text-xs cursor-pointer transition-all space-y-0.5 text-left",
                          isActive
                            ? "border-primary/50 bg-primary/10 text-primary font-semibold"
                            : "border-transparent hover:bg-muted/50 text-foreground/80 hover:text-foreground",
                          isLoadingConversation && "pointer-events-none opacity-70"
                        )}
                      >
                        <div className="flex items-center gap-1.5 pr-12">
                          {isPinned ? (
                            <Pin className="size-3 shrink-0 text-amber-500 fill-amber-500" />
                          ) : (
                            <MessageSquare className="size-3 shrink-0 text-primary" />
                          )}
                          <span className="truncate font-medium flex-1 text-[11px]">
                            {item.preview || "Untitled Chat"}
                          </span>
                        </div>
                        <div className="text-[9px] text-muted-foreground flex items-center justify-between pl-4">
                          <span>
                            {formatHistoryDate(item.last_activity_at || item.created_at)}
                          </span>
                          {item.turn_count > 0 && (
                            <span className="font-mono">
                              {item.turn_count} msg{item.turn_count > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>

                        {/* Hover Action Buttons (Pin & Delete) */}
                        <div className="absolute right-1 top-1.5 hidden group-hover:flex items-center gap-0.5 bg-background/90 backdrop-blur-xs rounded-md px-1 shadow-xs border border-border/50">
                          <button
                            type="button"
                            onClick={(e) => togglePinConversation(item.conversation_id, e)}
                            className="p-1 hover:text-amber-500 text-muted-foreground transition-colors"
                            title={isPinned ? "Unpin chat" : "Pin chat to top"}
                          >
                            {isPinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConversationToDelete(item.conversation_id);
                            }}
                            className="p-1 hover:text-destructive text-muted-foreground transition-colors"
                            title="Delete conversation"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </aside>

        {/* ── Main Content Area ── */}
        <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-background">
          {/* Top Navbar */}
          <div className="h-12 border-b border-border/40 px-4 flex items-center justify-between shrink-0 z-10 bg-background/80 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              {!isSidebarOpen && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSidebarOpen(true)}
                  className="size-8 text-muted-foreground hover:text-foreground mr-1"
                  title="Open sidebar"
                >
                  <PanelLeftOpen className="size-4" />
                </Button>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  {activeTab === "support"
                    ? "Study Support Chat"
                    : "Revision Center"}
                </span>
                {selectedResourceName ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-medium border-primary/30 bg-primary/5 text-primary"
                  >
                    Context: {selectedResourceName}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-normal text-muted-foreground"
                  >
                    General Knowledge
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {messages.length > 0 && activeTab === "support" && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                    onClick={() => setShareModalOpen(true)}
                    title="Share conversation"
                  >
                    <Share2 className="size-3.5 text-primary" />
                    <span className="hidden sm:inline">Share</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                    onClick={() => setExportModalOpen(true)}
                    title="Export conversation"
                  >
                    <Download className="size-3.5" />
                    <span className="hidden sm:inline">Export</span>
                  </Button>
                </>
              )}

              <Button
                variant={isFullScreen ? "default" : "ghost"}
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground ml-1"
                onClick={() => setIsFullScreen(!isFullScreen)}
                title={isFullScreen ? "Exit Fullscreen" : "Fullscreen"}
              >
                {isFullScreen ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Error Banner if any */}
          {error && (
            <Alert variant="destructive" className="m-4 mb-0 rounded-xl">
              <ShieldAlert className="size-4" />
              <AlertTitle className="text-xs font-semibold">
                Study Tutor Notice
              </AlertTitle>
              <AlertDescription className="text-xs mt-0.5">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Tab 1: STUDY SUPPORT CHAT */}
          {activeTab === "support" && (
            <div className="flex-1 flex flex-col min-h-0 relative">
              {/* Centered Chat Message Stream */}
              <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
                {messages.length === 0 && !isThinking ? (
                  <div className="flex-1 overflow-y-auto">
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-xl mx-auto space-y-6">
                      <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Sparkles className="size-7 text-primary" />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-base font-semibold tracking-tight text-foreground">
                          What would you like to study today?
                        </h2>
                        <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
                          Ask questions, break down complex topics, or practice
                          active recall with grounded course materials.
                        </p>
                      </div>

                      {/* Suggested Start Buttons */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-2">
                        {studySuggestedActions.map((act, idx) => (
                          <button
                            key={idx}
                            onClick={() => setPrompt(act.action)}
                            className="p-3 text-left border rounded-xl text-xs hover:bg-muted/40 transition-colors font-medium space-y-1 bg-card shadow-2xs border-border/60"
                          >
                            <div className="text-primary font-bold text-[10px] uppercase tracking-wide">
                              {act.title}
                            </div>
                            <div className="text-muted-foreground text-[11px] truncate">
                              {act.label}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <MessageScroller className="h-full">
                    <MessageScrollerViewport className="scroll-fade">
                      <MessageScrollerContent
                        aria-busy={isThinking}
                        className="max-w-3xl mx-auto py-4 px-4 space-y-4"
                      >
                        {messages.map((msg, index) => {
                          const isLatestUserTurn =
                            msg.sender === "student" &&
                            (index === messages.length - 1 ||
                              index === messages.length - 2);
                          const isExpandedCitations = expandedCitationMessageIds.has(msg.id);
                          const visibleCitations = isExpandedCitations
                            ? msg.citations
                            : (msg.citations || []).slice(0, 2);
                          const remainingCitationsCount =
                            (msg.citations?.length || 0) - 2;

                          return (
                            <MessageScrollerItem
                              key={msg.id}
                              scrollAnchor={isLatestUserTurn}
                              className="w-full"
                            >
                              {/* Student Message Turn */}
                              {msg.sender === "student" ? (
                                <div className="flex flex-col items-end max-w-[85%] ml-auto group space-y-1">
                                  <div className="bg-primary text-primary-foreground px-3.5 py-2 rounded-2xl rounded-tr-xs shadow-2xs text-xs font-medium leading-relaxed">
                                    {msg.attachments &&
                                      msg.attachments.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 pb-1">
                                          {msg.attachments.map(
                                            (att: any, aIdx: number) => (
                                              <div
                                                key={aIdx}
                                                className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground text-[11px] font-medium"
                                              >
                                                <FileText className="size-3 shrink-0" />
                                                <span className="truncate max-w-[160px]">
                                                  {att.name}
                                                </span>
                                              </div>
                                            )
                                          )}
                                        </div>
                                      )}
                                    {msg.text && (
                                      <div className="whitespace-pre-wrap">
                                        {msg.text}
                                      </div>
                                    )}
                                  </div>

                                  {/* Student Quick Actions (Outside message bubble) */}
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground pr-1">
                                    <button
                                      type="button"
                                      onClick={() => handleCopyText(msg.text, `copy-${msg.id}`)}
                                      className="p-1 hover:text-foreground text-muted-foreground/80 hover:bg-muted/50 rounded transition-colors"
                                      title="Copy prompt"
                                    >
                                      {copiedActionId === `copy-${msg.id}` ? (
                                        <Check className="size-3 text-emerald-500" />
                                      ) : (
                                        <Copy className="size-3" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleEditUserMessage(msg.text)}
                                      className="p-1 hover:text-foreground text-muted-foreground/80 hover:bg-muted/50 rounded transition-colors"
                                      title="Edit prompt in composer"
                                    >
                                      <Edit2 className="size-3" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                /* AI Message Turn */
                                <div className="group relative flex flex-col max-w-[88%] space-y-2 p-3.5 rounded-2xl bg-card border border-border text-foreground mr-auto rounded-tl-xs text-left shadow-2xs leading-relaxed whitespace-pre-wrap animate-in fade-in slide-in-from-bottom-2 duration-300">
                                  <RichMessageRenderer content={msg.text} />

                                  {/* Optimized Compact Citations Accordion */}
                                  {msg.citations && msg.citations.length > 0 && (
                                    <div className="pt-2 border-t border-border/40 space-y-1.5">
                                      <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        <span className="flex items-center gap-1">
                                          <FileText className="size-3 text-primary" />
                                          References ({msg.citations.length})
                                        </span>
                                        {remainingCitationsCount > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => toggleCitationExpand(msg.id)}
                                            className="text-[10px] text-primary hover:underline font-semibold flex items-center gap-0.5 normal-case"
                                          >
                                            {isExpandedCitations ? (
                                              "Show less"
                                            ) : (
                                              <>
                                                <span>+{remainingCitationsCount} more</span>
                                                <ChevronRight className="size-3 rotate-90" />
                                              </>
                                            )}
                                          </button>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                        {visibleCitations?.map((c, cIdx) => (
                                          <div
                                            key={cIdx}
                                            className="p-2 rounded-lg border border-border/60 bg-muted/20 text-[10px] space-y-1"
                                          >
                                            <div className="font-semibold text-foreground truncate">
                                              {c.resource_name}
                                              {c.page_number
                                                ? ` (p. ${c.page_number})`
                                                : ""}
                                            </div>
                                            {c.excerpt && (
                                              <div className="text-muted-foreground italic line-clamp-2">
                                                &ldquo;{c.excerpt}&rdquo;
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* AI Message Action Bar (Copy & Try Again) */}
                                  <div className="pt-1.5 border-t border-border/30 flex items-center justify-between text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleCopyText(msg.text, `ai-copy-${msg.id}`)}
                                        className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                                      >
                                        {copiedActionId === `ai-copy-${msg.id}` ? (
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
                                      {index === messages.length - 1 && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={handleRegenerateLastMessage}
                                          className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                                          title="Regenerate this explanation"
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

                        {isThinking && (
                          <div className="py-2 mr-auto max-w-[88%]">
                            <Marker
                              role="status"
                              className="bg-card border border-border rounded-2xl p-3 shadow-2xs"
                            >
                              <MarkerIcon>
                                <Spinner />
                              </MarkerIcon>
                              <MarkerContent className="shimmer text-xs font-medium">
                                Study AI is formulating a tailored academic explanation...
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

              {/* ── Pinned Bottom Composer with Collapsible Helper Chips ── */}
              <div className="shrink-0 border-t border-border/40 bg-background/95 backdrop-blur-sm p-3 md:p-4">
                <div className="max-w-3xl mx-auto w-full space-y-2">
                  {/* Rwanda Course Warning */}
                  {(isSelectedRwanda || isBlockedByLanguagePolicy) && (
                    <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
                      <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block font-semibold">
                          AI Study Tutor Disabled for Course
                        </strong>
                        <span className="opacity-90">
                          The selected course has Kinyarwanda set as its instruction language. AI assistance is deactivated for Kinyarwanda modules according to institutional academic policy.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Helper Chips Row: Scope, Tips, Integrity */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                    {/* Active Scope Chip */}
                    {selectedResourceName &&
                      !isSelectedRwanda &&
                      !isBlockedByLanguagePolicy && (
                        <span className="text-[11px] font-medium text-primary flex items-center gap-1.5 bg-primary/5 border border-primary/20 px-2.5 py-0.5 rounded-lg">
                          <FileText className="size-3" />
                          Searching:{" "}
                          <strong className="font-semibold">
                            {selectedResourceName}
                          </strong>
                          <button
                            type="button"
                            onClick={() => setSelectedResource(null)}
                            className="ml-1 hover:text-red-500 text-muted-foreground transition-colors"
                            title="Clear scope and search general knowledge"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      )}

                    {/* Collapsible Chips for Tips & Integrity (Near Composer) */}
                    <div className="flex items-center gap-2 ml-auto">
                      {/* Tips Popover Chip */}
                      <div className="relative" ref={tipsRef}>
                        <button
                          type="button"
                          onClick={() => {
                            setTipsPopoverOpen(!tipsPopoverOpen);
                            setIntegrityPopoverOpen(false);
                          }}
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Lightbulb className="size-3 text-amber-500" />
                          <span>Study Tips</span>
                        </button>
                        {tipsPopoverOpen && (
                          <div className="absolute right-0 bottom-full mb-2 w-72 bg-popover text-popover-foreground border rounded-xl shadow-xl p-3 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 flex items-center gap-1">
                              <Lightbulb className="size-3.5 text-amber-500" />
                              Active Recall Tips
                            </div>
                            <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                              <p>
                                • Try explaining the concept in your own words
                                first.
                              </p>
                              <p>
                                • Ask for practice questions and scenarios to test
                                retention.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Integrity Popover Chip */}
                      <div className="relative" ref={integrityRef}>
                        <button
                          type="button"
                          onClick={() => {
                            setIntegrityPopoverOpen(!integrityPopoverOpen);
                            setTipsPopoverOpen(false);
                          }}
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ShieldAlert className="size-3 text-red-500" />
                          <span>Academic Integrity</span>
                        </button>
                        {integrityPopoverOpen && (
                          <div className="absolute right-0 bottom-full mb-2 w-72 bg-popover text-popover-foreground border rounded-xl shadow-xl p-3 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                            <div className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                              <ShieldAlert className="size-3.5" />
                              Honor Code Policy
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Student AI provides concept explanations and
                              study support. Generating cheat sheets or attempting
                              to bypass assessment integrity checks is prohibited.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Input Box */}
                  <AIChatInput
                    value={prompt}
                    onChange={setPrompt}
                    onSend={handleSendMessage}
                    isGenerating={isThinking}
                    onStop={() => setIsThinking(false)}
                    attachments={attachments}
                    setAttachments={setAttachments}
                    disabled={isSelectedRwanda || isBlockedByLanguagePolicy}
                    placeholder={
                      isSelectedRwanda || isBlockedByLanguagePolicy
                        ? "AI Study Tutor is disabled for Kinyarwanda courses"
                        : "Ask your AI tutor anything..."
                    }
                    onUploadFile={async (file: File) => {
                      const formData = new FormData();
                      formData.append("file", file);
                      const res = await studentApi.uploadPersonalResource(
                        formData
                      );
                      return { id: res.id };
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: REVISION CENTER (Curriculum-aware Learning Units & Socratic Loop) */}
          {activeTab === "revision" && (
            <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-4xl w-full mx-auto space-y-6">
              {/* Header & Course Selection */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/40">
                <div>
                  <h2 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
                    <BookOpen className="size-4 text-primary" />
                    Curriculum Revision Center
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Select an official course Learning Unit to start an interactive Socratic review or generate an offline revision guide.
                  </p>
                </div>

                {/* Course Switcher */}
                {workspaces.length > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-semibold text-muted-foreground">Course:</span>
                    <select
                      value={selectedRevisionWorkspace || ""}
                      onChange={(e) => {
                        setSelectedRevisionWorkspace(e.target.value);
                        setRevisionResult(null);
                      }}
                      className="h-8 px-2.5 text-xs font-semibold bg-muted/40 border border-border/70 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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

              {/* Learning Units Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers className="size-3.5 text-primary" />
                    Course Learning Units
                  </div>
                  {learningUnits.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {learningUnits.length} Units Available
                    </Badge>
                  )}
                </div>

                {isLoadingLearningUnits ? (
                  <div className="p-8 text-center bg-muted/20 rounded-xl border border-border/40">
                    <Spinner className="size-6 text-primary mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground font-medium">
                      Loading curriculum learning units...
                    </p>
                  </div>
                ) : learningUnits.length === 0 ? (
                  /* Fallback Custom Topic Card */
                  <Card className="shadow-none border border-dashed border-border/60 bg-card rounded-xl p-4">
                    <CardHeader className="p-0 pb-3">
                      <CardTitle className="text-xs font-semibold text-foreground">
                        Custom Revision Topic
                      </CardTitle>
                      <CardDescription className="text-xs">
                        No auto-extracted units found for this course. Enter any topic or concept name to revise.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 space-y-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder="e.g. Relational Calculus & Query Optimization"
                          value={customRevisionTopic}
                          onChange={(e) => setCustomRevisionTopic(e.target.value)}
                          className="h-9 text-xs flex-1"
                        />
                        <Button
                          onClick={() => handleGenerateDownloadableRevisionSheet(null)}
                          disabled={isGeneratingRevision || !customRevisionTopic.trim()}
                          className="h-9 px-4 text-xs font-semibold"
                        >
                          {isGeneratingRevision && (
                            <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                          )}
                          Generate Sheet
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  /* Learning Units Grid */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {learningUnits.map((unit) => {
                      const isSelected = selectedLearningUnit?.id === unit.id;
                      return (
                        <div
                          key={unit.id}
                          onClick={() => setSelectedLearningUnit(unit)}
                          className={cn(
                            "p-3.5 rounded-xl border text-xs transition-all space-y-2 cursor-pointer text-left bg-card",
                            isSelected
                              ? "border-primary bg-primary/5 shadow-2xs"
                              : "border-border/60 hover:border-border hover:bg-muted/20"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold text-foreground text-xs leading-snug line-clamp-1">
                              <span className="text-primary font-mono mr-1.5">
                                Unit {unit.order_index + 1}:
                              </span>
                              {unit.title}
                            </div>
                            {unit.estimated_study_minutes && (
                              <Badge
                                variant="outline"
                                className="text-[9px] font-mono shrink-0 px-1.5 py-0"
                              >
                                {unit.estimated_study_minutes}m
                              </Badge>
                            )}
                          </div>

                          {unit.summary && (
                            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                              {unit.summary}
                            </p>
                          )}

                          <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                            {/* Primary Action: Socratic Review Turn in Chat */}
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 text-[11px] font-semibold flex-1 gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartSocraticReview(unit.title);
                              }}
                            >
                              <Sparkles className="size-3" />
                              <span>Socratic Chat</span>
                              <ArrowRight className="size-2.5 ml-0.5" />
                            </Button>

                            {/* Secondary Action: Offline Downloadable Sheet */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] font-semibold gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLearningUnit(unit);
                                handleGenerateDownloadableRevisionSheet(unit);
                              }}
                              disabled={isGeneratingRevision}
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

              {/* Generating Status Marker */}
              {isGeneratingRevision && (
                <div className="py-2">
                  <Marker
                    role="status"
                    className="bg-card border border-border rounded-xl p-4"
                  >
                    <MarkerIcon>
                      <Spinner />
                    </MarkerIcon>
                    <MarkerContent className="shimmer text-xs">
                      Compiling structured offline revision sheet and learning checklist...
                    </MarkerContent>
                  </Marker>
                </div>
              )}

              {/* Revision Guide Sheet Results Card */}
              {revisionResult && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <Card className="shadow-none border border-border/60 bg-card rounded-xl overflow-hidden">
                    <CardHeader className="py-3 px-4 border-b border-border/40 bg-muted/20 flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                          <ListChecks className="size-4" />
                          <span>{revisionResult.title || "Revision Guide"}</span>
                        </CardTitle>
                        <CardDescription className="text-[11px]">
                          Curriculum-grounded summary, interactive recall checklist, and readings.
                        </CardDescription>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Download Markdown Action */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs font-semibold bg-background"
                          onClick={() => {
                            if (revisionResult.markdown) {
                              const safeName = (revisionResult.title || "Revision_Guide")
                                .replace(/[^a-zA-Z0-9_-]/g, "_");
                              downloadTextFile(`${safeName}_Revision_Sheet.md`, revisionResult.markdown);
                              toast.success("Revision sheet downloaded as markdown file!");
                            }
                          }}
                        >
                          <Download className="size-3.5 text-primary" />
                          <span>Download .md</span>
                        </Button>

                        {/* Jump to Socratic Chat with this topic */}
                        <Button
                          variant="default"
                          size="sm"
                          className="h-8 gap-1.5 text-xs font-semibold"
                          onClick={() =>
                            handleStartSocraticReview(revisionResult.title || "Revision Topic")
                          }
                        >
                          <Sparkles className="size-3.5" />
                          <span>Practice in Chat</span>
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 space-y-4">
                      {/* Executive Summary */}
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Core Concept Summary
                        </h4>
                        <div className="p-3 bg-muted/20 rounded-xl border border-border/40">
                          <RichMessageRenderer content={revisionResult.summary} />
                        </div>
                      </div>

                      {/* Interactive Learning Outcomes Checklist */}
                      {revisionResult.checklist &&
                        revisionResult.checklist.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-border/40">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Actionable Learning Checklist
                              </h4>
                              <span className="text-[11px] font-mono text-muted-foreground">
                                {checkedChecklistItems.size}/{revisionResult.checklist.length} Mastered
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-medium pl-1">
                              {revisionResult.checklist.map((item, idx) => {
                                const isChecked = checkedChecklistItems.has(idx);
                                return (
                                  <div
                                    key={idx}
                                    onClick={() => toggleChecklistItem(idx)}
                                    className={cn(
                                      "flex items-start gap-2.5 p-2.5 border rounded-xl cursor-pointer transition-all text-left",
                                      isChecked
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200 line-through opacity-80"
                                        : "bg-muted/20 border-border/60 hover:bg-muted/40 text-foreground"
                                    )}
                                  >
                                    {isChecked ? (
                                      <CheckSquare className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                                    ) : (
                                      <Square className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                                    )}
                                    <span className="leading-snug">{item}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                      {/* Recommended Readings & References */}
                      {revisionResult.readings &&
                        revisionResult.readings.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-border/40">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              <BookOpen className="size-3.5 text-primary" />
                              Recommended Readings & References
                            </h4>
                            <div className="grid grid-cols-1 gap-2 pl-1">
                              {revisionResult.readings.map((item, idx) => (
                                <div
                                  key={idx}
                                  className="p-2.5 rounded-lg border border-border/60 bg-muted/20 text-xs flex items-center gap-2 text-left"
                                >
                                  <FileText className="size-4 text-primary shrink-0" />
                                  <span className="font-medium text-foreground">
                                    {item}
                                  </span>
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
          )}
        </main>
      </div>

      {/* ── Delete Conversation Confirmation Modal ── */}
      <Dialog
        open={!!conversationToDelete}
        onOpenChange={(open) => {
          if (!open) setConversationToDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <Trash2 className="size-4" />
              Delete Conversation
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to delete this conversation? This will permanently remove the chat thread from your history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConversationToDelete(null)}
              disabled={isDeletingConversation}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDeleteConversation}
              disabled={isDeletingConversation}
              className="text-xs gap-1.5"
            >
              {isDeletingConversation && <RefreshCw className="size-3 animate-spin" />}
              Delete Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Share Conversation Modal ── */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Share2 className="size-4 text-primary" />
              Share Conversation
            </DialogTitle>
            <DialogDescription className="text-xs">
              Share your academic tutor study dialogue and grounded explanations with peers or study groups.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3 bg-muted/30 rounded-xl border border-border/50 max-h-48 overflow-y-auto font-mono text-[11px] text-muted-foreground whitespace-pre-wrap">
              {buildConversationMarkdown()}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                handleCopyText(window.location.href, "share-link");
                toast.success("Page link copied to clipboard!");
              }}
              className="text-xs gap-1.5"
            >
              <Copy className="size-3.5" />
              Copy URL
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                handleCopyText(buildConversationMarkdown(), "share-transcript");
                toast.success("Full formatted transcript copied to clipboard!");
              }}
              className="text-xs gap-1.5"
            >
              <Copy className="size-3.5" />
              Copy Markdown
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Export Conversation Modal ── */}
      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Download className="size-4 text-primary" />
              Export Conversation
            </DialogTitle>
            <DialogDescription className="text-xs">
              Download your study dialogue for offline revision or printing.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-2.5 py-2">
            {/* Markdown */}
            <button
              type="button"
              onClick={() => {
                downloadTextFile("AI_Tutor_Study_Chat.md", buildConversationMarkdown());
                toast.success("Downloaded conversation as Markdown (.md)");
                setExportModalOpen(false);
              }}
              className="p-3 border rounded-xl flex items-center justify-between text-left hover:bg-muted/40 transition-colors bg-card"
            >
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                  MD
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground">Markdown Document</div>
                  <div className="text-[10px] text-muted-foreground">Formatted with headings, checklists & citations</div>
                </div>
              </div>
              <Download className="size-4 text-muted-foreground" />
            </button>

            {/* Plain Text */}
            <button
              type="button"
              onClick={() => {
                downloadTextFile("AI_Tutor_Study_Chat.txt", buildConversationPlainText(), "text/plain;charset=utf-8;");
                toast.success("Downloaded conversation as Plain Text (.txt)");
                setExportModalOpen(false);
              }}
              className="p-3 border rounded-xl flex items-center justify-between text-left hover:bg-muted/40 transition-colors bg-card"
            >
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center font-bold text-xs">
                  TXT
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground">Plain Text (.txt)</div>
                  <div className="text-[10px] text-muted-foreground">Simple raw transcript for any device</div>
                </div>
              </div>
              <Download className="size-4 text-muted-foreground" />
            </button>

            {/* Print / PDF */}
            <button
              type="button"
              onClick={() => {
                window.print();
                setExportModalOpen(false);
              }}
              className="p-3 border rounded-xl flex items-center justify-between text-left hover:bg-muted/40 transition-colors bg-card"
            >
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <Printer className="size-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground">Print to PDF</div>
                  <div className="text-[10px] text-muted-foreground">Print view or save as PDF via browser</div>
                </div>
              </div>
              <Printer className="size-4 text-muted-foreground" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </MessageScrollerProvider>
  );
}
